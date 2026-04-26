"""
Shared audio processing pipeline.

Called by both the WebRTC handler (webrtc_service) and the REST fallback
(routers/transcribe.py). Returns lists of event dicts — transport is the
caller's responsibility.

Per-call in-memory state lives in _call_state. Keys are call_id strings.
Single-process only (uvicorn --workers 1 required).
"""

import asyncio
import time
from datetime import datetime
from typing import Optional

import structlog
from app.data.objections import match_objection
from app.database import AsyncSessionLocal
from app.models.call import Call
from app.models.suggestion import SuggestionLog
from app.services import (
    compliance_service,
    event_bus,
    llm_service,
    sentiment_service,
    stt_service,
)
from app.utils.audio import SpeakerTracker, pcm_to_float32
from sqlalchemy import select

log = structlog.get_logger()

_call_state: dict[str, dict] = {}


def _make_event(type_: str, **kwargs) -> dict:
    return {"type": type_, **kwargs}


async def start_call(
    call_id: str,
    agent_id: str,
    lang_hint: Optional[str] = None,
    client_id: Optional[str] = None,
) -> None:
    # If client_id not explicitly passed, check if an existing Call row has one
    if not client_id:
        async with AsyncSessionLocal() as _pre_db:
            _pre_res = await _pre_db.execute(select(Call).where(Call.id == call_id))
            _pre_call = _pre_res.scalar_one_or_none()
            if _pre_call and _pre_call.client_id:
                client_id = _pre_call.client_id

    # Load client profile once at call start
    client_profile = None
    if client_id:
        try:
            from app.services.client_profile_service import get_profile

            async with AsyncSessionLocal() as _db:
                client_profile = await get_profile(_db, client_id)
        except Exception as _e:
            log.warning(
                "client_profile.load_failed", client_id=client_id, error=str(_e)
            )

    _call_state[call_id] = {
        "transcripts": [],
        "start_time": time.monotonic(),
        "extraction_done": False,
        "speaker_tracker": SpeakerTracker(),
        "lang_hint": lang_hint,
        "sentiment_journey": [],
        "last_sentiment": None,
        "objection_hits": [],
        "client_id": client_id,
        "client_profile": client_profile,
        # Dual-LLM throttle state
        "last_recommendation_ts": 0.0,
        "turns_since_live_script": 0,
        "suggestion_count": 0,
    }
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(Call).where(Call.id == call_id))
        if existing.scalar_one_or_none() is None:
            call = Call(
                id=call_id,
                agent_id=agent_id,
                client_id=client_id,
                started_at=datetime.utcnow(),
                transcript=[],
            )
            db.add(call)
            await db.commit()
    await event_bus.publish(
        "supervisor",
        {
            "type": "call_started",
            "call_id": call_id,
            "agent_id": agent_id,
        },
    )
    log.info("call.started", call_id=call_id, agent_id=agent_id)


async def run_intake_extraction(call_id: str) -> Optional[dict]:
    """Run LLM intake extraction. Returns intake_proposal event dict or None."""
    state = _call_state.get(call_id)
    if state is None or state["extraction_done"]:
        return None
    state["extraction_done"] = True
    entries = state["transcripts"]
    transcript_text = "\n".join(
        f"[{e.get('speaker')}]: {e.get('text')}" for e in entries
    )
    from app.services.extraction_service import extract

    try:
        data = await extract(call_id, transcript_text)
        event = _make_event("intake_proposal", call_id=call_id, data=data)
        await event_bus.publish(
            "supervisor",
            {
                "type": "intake_proposal",
                "call_id": call_id,
                "data": data,
            },
        )
        return event
    except Exception as e:
        log.error("extraction.error", call_id=call_id, error=str(e))
        return None


async def _bg_extraction(call_id: str) -> None:
    event = await run_intake_extraction(call_id)
    if event:
        try:
            from app.services import webrtc_service

            await webrtc_service.send_to_call(call_id, event)
        except Exception:
            pass


async def process_audio_chunk(
    call_id: str,
    pcm_bytes: bytes,
    lang_hint: Optional[str] = None,
) -> list[dict]:
    """
    Full AI pipeline for one audio chunk (~1 s of 16 kHz mono int16 PCM).
    Persists transcript lines and suggestions incrementally.
    Returns list of event dicts for the caller to forward.
    """
    events: list[dict] = []
    t_start = time.monotonic()

    state = _call_state.get(call_id)
    speaker_tracker = state["speaker_tracker"] if state else SpeakerTracker()

    audio = pcm_to_float32(pcm_bytes)
    speaker = speaker_tracker.update(audio)

    try:
        result = await stt_service.transcribe_chunk(pcm_bytes, language_hint=lang_hint)
    except Exception as e:
        log.error("stt.error", error=str(e), call_id=call_id)
        return [_make_event("error", call_id=call_id, code="STT_FAIL", message=str(e))]

    text = result.text.strip()
    if not text:
        return events

    ts = time.time()
    entry = {"speaker": speaker, "text": text, "ts": ts}

    if state:
        state["transcripts"].append(entry)

    events.append(
        _make_event("transcript", call_id=call_id, speaker=speaker, text=text, ts=ts)
    )

    # Persist transcript line to DB incrementally
    try:
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(Call).where(Call.id == call_id))
            call = res.scalar_one_or_none()
            if call:
                existing = list(call.transcript or [])
                existing.append(entry)
                call.transcript = existing
                await db.commit()
    except Exception as e:
        log.warning("transcript.persist_error", error=str(e))

    await event_bus.publish(
        "supervisor",
        {
            "type": "transcript_chunk",
            "call_id": call_id,
            "speaker": speaker,
            "text": text,
            "ts": ts,
        },
    )

    # Compliance
    try:
        ticked = await compliance_service.check_chunk(call_id, text)
        for phrase_id in ticked:
            events.append(
                _make_event("compliance_tick", call_id=call_id, phrase_id=phrase_id)
            )
            async with AsyncSessionLocal() as db:
                res = await db.execute(select(Call).where(Call.id == call_id))
                call_obj = res.scalar_one_or_none()
                if call_obj:
                    status = dict(call_obj.compliance_status or {})
                    status[phrase_id] = "ok"
                    call_obj.compliance_status = status
                    await db.commit()
    except Exception as e:
        log.warning("compliance.error", error=str(e))

    # Sentiment
    try:
        sentiment_result = await sentiment_service.analyze(call_id, text)
        if sentiment_result:
            events.append(_make_event("sentiment", call_id=call_id, **sentiment_result))
            if state:
                label = sentiment_result.get("label")
                if label and label != state.get("last_sentiment"):
                    state["last_sentiment"] = label
                    state["sentiment_journey"].append(label)
    except Exception as e:
        log.warning("sentiment.error", error=str(e))

    # Auto extraction at INTAKE_AUTO_TRIGGER_AT_SECONDS
    if state and not state["extraction_done"]:
        from app.config import settings as _s

        elapsed = time.monotonic() - state["start_time"]
        if elapsed >= _s.INTAKE_AUTO_TRIGGER_AT_SECONDS:
            asyncio.create_task(_bg_extraction(call_id))

    # Match objection keyword for real trigger label (before RAG, no guardrail)
    objection_match = match_objection(text)
    trigger_label = objection_match[1] if objection_match else None
    if state and objection_match:
        state["objection_hits"].append(objection_match[1])

    if state:
        state["turns_since_live_script"] = state.get("turns_since_live_script", 0) + 1

    # Build dual-RAG context (client profile + KB chunks)
    client_profile = state.get("client_profile") if state else None
    sales_ctx: dict = {"client_facts": "", "doc_context": "Mavjud emas.", "pitches": []}
    try:
        from app.services.sales_rag_service import build_context as _sales_build_context

        sales_ctx = await _sales_build_context(
            query=text,
            client_profile=client_profile,
        )
    except Exception as e:
        log.warning("sales_rag.error", error=str(e))

    client_facts = sales_ctx["client_facts"]
    rag_context = sales_ctx["doc_context"]

    # ── LLM #1: Sales recommendation (debounced 30 s) ───────────────────────
    _RECOMMENDATION_DEBOUNCE_S = 30.0
    if state and client_profile is not None:
        now = time.monotonic()
        last_rec_ts = state.get("last_recommendation_ts", 0.0)
        if now - last_rec_ts >= _RECOMMENDATION_DEBOUNCE_S:
            state["last_recommendation_ts"] = now
            asyncio.create_task(
                _bg_recommendation(
                    call_id, client_facts, sales_ctx["pitches"], rag_context, text
                )
            )

    # ── LLM #2: Live script (per objection OR per 3 turns) ───────────────────
    _LIVE_SCRIPT_TURNS_INTERVAL = 3
    should_emit_live_script = objection_match is not None or (
        state and state.get("turns_since_live_script", 0) >= _LIVE_SCRIPT_TURNS_INTERVAL
    )
    if should_emit_live_script:
        if state:
            state["turns_since_live_script"] = 0
        last_3 = state["transcripts"][-3:] if state else []
        asyncio.create_task(
            _bg_live_script(
                call_id,
                client_facts,
                rag_context,
                last_3,
                trigger_label if objection_match else "",
            )
        )

    # ── Standard LLM suggestion (existing suggestion card) ──────────────────
    client_facts_header = (
        f"Mijoz ma'lumotlari:\n{client_facts}\n\n" if client_facts else ""
    )
    suggestion_tokens: list[str] = []
    try:
        async for token in llm_service.get_suggestion(
            customer_text=text,
            rag_context=rag_context,
            client_facts=client_facts_header,
        ):
            suggestion_tokens.append(token)
    except Exception as e:
        log.error("llm.error", error=str(e), call_id=call_id)
        events.append(
            _make_event("error", call_id=call_id, code="LLM_TIMEOUT", message=str(e))
        )
        return events

    if suggestion_tokens:
        full = "".join(suggestion_tokens)
        bullets = [b.strip() for b in full.split("\n") if b.strip()][:3]
        latency_ms = int((time.monotonic() - t_start) * 1000)
        log.info("suggestion_emitted", call_id=call_id, latency_ms=latency_ms)
        suggestion_event = _make_event(
            "suggestion", call_id=call_id, text=bullets, trigger=trigger_label
        )
        events.append(suggestion_event)
        if state:
            state["suggestion_count"] = state.get("suggestion_count", 0) + 1
        try:
            async with AsyncSessionLocal() as db:
                row = SuggestionLog(
                    call_id=call_id,
                    trigger=trigger_label,
                    suggestion="\n".join(bullets),
                    latency_ms=latency_ms,
                )
                db.add(row)
                await db.commit()
        except Exception as e:
            log.warning("suggestion_log.error", error=str(e))

    # ── AI agent answer ──────────────────────────────────────────────────────
    if state is not None:
        # WebRTC path: fire answer in background, tokens stream via DataChannel
        asyncio.create_task(
            _bg_ai_answer(call_id, text, client_facts_header, rag_context)
        )
    else:
        # REST fallback: collect answer synchronously and append to events
        import uuid
        import time as _time

        msg_id = uuid.uuid4().hex
        answer_tokens: list[str] = []
        try:
            async for tok in llm_service.get_agent_answer(
                customer_text=text,
                rag_context=rag_context,
                client_facts=client_facts_header,
            ):
                answer_tokens.append(tok)
        except Exception as e:
            log.error("ai_answer.rest_error", error=str(e), call_id=call_id)
        if answer_tokens:
            events.append(_make_event(
                "ai_answer",
                call_id=call_id,
                message_id=msg_id,
                text="".join(answer_tokens),
                done=True,
                ts=_time.time(),
            ))

    return events


async def _bg_recommendation(
    call_id: str,
    client_facts: str,
    pitches: list[dict],
    doc_context: str,
    recent_transcript: str,
) -> None:
    """Background task: run SALES_RECOMMENDATION_PROMPT and emit recommendation event."""
    import json

    from app.prompts.sales_uz import SALES_RECOMMENDATION_PROMPT

    pitches_text = (
        "\n".join(f"- {p['product']}: {p['rationale_uz']}" for p in pitches)
        if pitches
        else "Mavjud emas."
    )

    prompt = SALES_RECOMMENDATION_PROMPT.format(
        client_facts=client_facts or "Mavjud emas.",
        pitches=pitches_text,
        doc_context=doc_context,
        recent_transcript=recent_transcript,
    )
    try:
        raw = await llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=256,
            temperature=0.2,
        )
        raw = raw.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        event = _make_event(
            "recommendation",
            call_id=call_id,
            product=data.get("product", ""),
            rationale_uz=data.get("rationale_uz", ""),
            confidence=float(data.get("confidence", 0.5)),
        )
        await event_bus.publish("supervisor", {**event})
        try:
            from app.services import webrtc_service

            await webrtc_service.send_to_call(call_id, event)
        except Exception:
            pass
    except Exception as e:
        log.warning("recommendation.error", call_id=call_id, error=str(e))


async def _bg_live_script(
    call_id: str,
    client_facts: str,
    doc_context: str,
    last_3_turns: list[dict],
    objection_label: str,
) -> None:
    """Background task: run LIVE_SCRIPT_PROMPT and emit live_script event."""
    import json

    from app.prompts.sales_uz import LIVE_SCRIPT_PROMPT

    turns_text = (
        "\n".join(f"[{e.get('speaker')}]: {e.get('text')}" for e in last_3_turns)
        if last_3_turns
        else "Mavjud emas."
    )

    prompt = LIVE_SCRIPT_PROMPT.format(
        client_facts=client_facts or "Mavjud emas.",
        doc_context=doc_context,
        last_3_turns=turns_text,
        objection_label=objection_label or "yo'q",
    )
    try:
        raw = await llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=128,
            temperature=0.3,
        )
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        next_sentence = data.get("next_sentence_uz", "").strip()
        event = _make_event(
            "live_script",
            call_id=call_id,
            next_sentence_uz=next_sentence,
            trigger=objection_label or None,
        )
        await event_bus.publish("supervisor", {**event})
        try:
            from app.services import webrtc_service

            await webrtc_service.send_to_call(call_id, event)
        except Exception:
            pass
    except Exception as e:
        log.warning("live_script.error", call_id=call_id, error=str(e))


async def _bg_ai_answer(
    call_id: str,
    customer_text: str,
    client_facts: str,
    rag_context: str,
) -> None:
    """Stream AI agent answer tokens via event_bus and WebRTC DataChannel."""
    import time as _time
    import uuid

    message_id = uuid.uuid4().hex
    try:
        async for token in llm_service.get_agent_answer(
            customer_text=customer_text,
            rag_context=rag_context,
            client_facts=client_facts,
        ):
            event = _make_event(
                "ai_answer",
                call_id=call_id,
                message_id=message_id,
                text=token,
                done=False,
                ts=_time.time(),
            )
            await event_bus.publish("supervisor", {**event})
            try:
                from app.services import webrtc_service

                await webrtc_service.send_to_call(call_id, event)
            except Exception:
                pass
        # Final done signal
        done_event = _make_event(
            "ai_answer",
            call_id=call_id,
            message_id=message_id,
            text="",
            done=True,
            ts=_time.time(),
        )
        await event_bus.publish("supervisor", {**done_event})
        try:
            from app.services import webrtc_service

            await webrtc_service.send_to_call(call_id, done_event)
        except Exception:
            pass
    except Exception as e:
        log.error("ai_answer.bg_error", error=str(e), call_id=call_id)


async def finalize_call(call_id: str) -> dict:
    """
    Generate summary, persist final Call state, clear per-call memory.
    Returns summary_ready event dict.
    """
    state = _call_state.get(call_id, {})
    transcripts = state.get("transcripts", [])
    sentiment_journey = state.get("sentiment_journey", [])
    objection_hits = state.get("objection_hits", [])
    compliance_status = compliance_service.get_status(call_id)

    # Compute top_objection (most frequent hit, tie → first seen)
    from app.utils.objections import top_objection_label
    top_objection = top_objection_label(state)

    summary = {}
    try:
        from app.services.summary_service import summarize

        summary = await summarize(
            call_id,
            transcripts,
            compliance_status,
            sentiment_journey=sentiment_journey,
            top_objection=top_objection,
        )
    except Exception as e:
        log.error("summary.error", call_id=call_id, error=str(e))

    # Derive outcome + compliance_score from summary
    raw_outcome = summary.get("outcome", "callback")
    _outcome_map = {"approved": "won", "won": "won", "rejected": "lost", "lost": "lost"}
    outcome = _outcome_map.get(raw_outcome, "callback")
    compliance_holati = summary.get("complianceHolati", {})
    passed = compliance_holati.get("passed", 0)
    total = compliance_holati.get("total", 1)
    compliance_score = round(passed / max(total, 1) * 5)

    try:
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(Call).where(Call.id == call_id))
            call = res.scalar_one_or_none()
            if call:
                call.ended_at = datetime.utcnow()
                call.compliance_status = compliance_status
                call.summary = summary
                call.outcome = outcome
                call.compliance_score = compliance_score
                call.top_objection = top_objection
                call.sentiment_journey = sentiment_journey
                if transcripts:
                    call.transcript = transcripts
                await db.commit()
    except Exception as e:
        log.error("finalize.persist_error", call_id=call_id, error=str(e))

    clear_call(call_id)
    await event_bus.publish("supervisor", {"type": "call_ended", "call_id": call_id})
    log.info("call.finalized", call_id=call_id)
    return _make_event("summary_ready", call_id=call_id, summary=summary)


def clear_call(call_id: str) -> None:
    """Clean up all per-call state. Safe to call multiple times."""
    _call_state.pop(call_id, None)
    compliance_service.clear_call(call_id)
    sentiment_service.clear_call(call_id)
