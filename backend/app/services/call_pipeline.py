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
from uuid import uuid4

import structlog
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.call import Call
from app.models.suggestion import SuggestionLog
from app.services import guardrail_service, llm_service, stt_service, event_bus
from app.services import compliance_service, sentiment_service
from app.utils.audio import SpeakerTracker, pcm_to_float32
from app.data.objections import match_objection

log = structlog.get_logger()

_call_state: dict[str, dict] = {}


def _make_event(type_: str, **kwargs) -> dict:
    return {"type": type_, **kwargs}


async def start_call(call_id: str, agent_id: str, lang_hint: Optional[str] = None) -> None:
    _call_state[call_id] = {
        "transcripts": [],
        "start_time": time.monotonic(),
        "extraction_done": False,
        "speaker_tracker": SpeakerTracker(),
        "lang_hint": lang_hint,
        "sentiment_journey": [],
        "last_sentiment": None,
        "objection_hits": [],
    }
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(Call).where(Call.id == call_id))
        if existing.scalar_one_or_none() is None:
            call = Call(
                id=call_id,
                agent_id=agent_id,
                started_at=datetime.utcnow(),
                transcript=[],
            )
            db.add(call)
            await db.commit()
    await event_bus.publish("supervisor", {
        "type": "call_started", "call_id": call_id, "agent_id": agent_id,
    })
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
        await event_bus.publish("supervisor", {
            "type": "intake_proposal", "call_id": call_id, "data": data,
        })
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
        result = await stt_service.transcribe_chunk(pcm_bytes, lang_hint=lang_hint)
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

    events.append(_make_event("transcript", call_id=call_id, speaker=speaker, text=text, ts=ts))

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

    await event_bus.publish("supervisor", {
        "type": "transcript_chunk", "call_id": call_id,
        "speaker": speaker, "text": text, "ts": ts,
    })

    # Compliance
    try:
        ticked = await compliance_service.check_chunk(call_id, text)
        for phrase_id in ticked:
            events.append(_make_event("compliance_tick", call_id=call_id, phrase_id=phrase_id))
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

    # Guardrail
    if not guardrail_service.is_bank_related(text):
        log.debug("guardrail.drop", call_id=call_id, text=text[:40])
        return events

    # RAG context
    rag_context = ""
    try:
        from app.services.rag_service import build_context
        rag_context = await build_context(text)
    except Exception as e:
        log.warning("rag.error", error=str(e))

    # Match objection keyword for real trigger label
    objection_match = match_objection(text)
    trigger_label = objection_match[1] if objection_match else text[:60]
    if state and objection_match:
        state["objection_hits"].append(objection_match[1])

    # LLM suggestion
    suggestion_tokens: list[str] = []
    try:
        async for token in llm_service.get_suggestion(customer_text=text, rag_context=rag_context):
            suggestion_tokens.append(token)
    except Exception as e:
        log.error("llm.error", error=str(e), call_id=call_id)
        events.append(_make_event("error", call_id=call_id, code="LLM_TIMEOUT", message=str(e)))
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

    return events


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
    top_objection: Optional[str] = None
    if objection_hits:
        from collections import Counter
        counts = Counter(objection_hits)
        top_objection = counts.most_common(1)[0][0]

    summary = {}
    try:
        from app.services.summary_service import summarize
        summary = await summarize(
            call_id, transcripts, compliance_status,
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
