import asyncio
import base64
import json
import time
from collections import deque
from datetime import datetime
from typing import Optional
from uuid import uuid4

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.call import Call
from app.models.user import User
from app.services import guardrail_service, llm_service, stt_service, event_bus
from app.services import compliance_service, sentiment_service
from app.services.auth_service import decode_token
from app.utils.audio import ChunkBuffer, SpeakerTracker

router = APIRouter()
log = structlog.get_logger()

MAX_OUTBOUND_QUEUE = 50

# Per-call in-memory state: {call_id: [transcript entries]}
_transcripts: dict[str, list[dict]] = {}
# Per-call extraction timer: {call_id: float (started_at)}
_call_start_times: dict[str, float] = {}


async def _authenticate(token: str, db: AsyncSession) -> Optional[User]:
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
    except JWTError:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or user.role != "agent":
        return None
    return user


def _make_event(type_: str, **kwargs) -> str:
    return json.dumps({"type": type_, **kwargs})


@router.websocket("/ws/audio")
async def audio_ws(websocket: WebSocket):
    token = websocket.query_params.get("token", "")
    async with AsyncSessionLocal() as db:
        user = await _authenticate(token, db)
    if user is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    log.info("ws.audio.connected", user_id=user.id)

    call_id: Optional[str] = None
    lang_hint: Optional[str] = None
    buf = ChunkBuffer(sample_rate=16000, min_seconds=1.0)
    speaker_tracker = SpeakerTracker()
    outbound_q: deque = deque(maxlen=MAX_OUTBOUND_QUEUE)
    send_lock = asyncio.Lock()
    extraction_done = False

    async def _flush_queue():
        async with send_lock:
            while outbound_q:
                msg = outbound_q.popleft()
                try:
                    await websocket.send_text(msg)
                except Exception:
                    break

    async def _send(msg: str, priority: bool = False):
        if priority:
            try:
                await websocket.send_text(msg)
            except Exception:
                pass
        else:
            outbound_q.append(msg)
            await _flush_queue()

    async def _run_extraction(cid: str):
        nonlocal extraction_done
        if extraction_done:
            return
        extraction_done = True
        entries = _transcripts.get(cid, [])
        transcript_text = "\n".join(
            f"[{e.get('speaker')}]: {e.get('text')}" for e in entries
        )
        from app.services.extraction_service import extract
        try:
            data = await extract(cid, transcript_text)
            await _send(
                _make_event("intake_proposal", call_id=cid, data=data),
                priority=True,
            )
            # Publish to supervisor (passport scrubbed at supervisor WS layer)
            await event_bus.publish("supervisor", {
                "type": "intake_proposal", "call_id": cid, "data": data
            })
        except Exception as e:
            log.error("extraction.ws_error", call_id=cid, error=str(e))

    async def _process_audio(pcm_bytes: bytes):
        nonlocal call_id
        t_start = time.monotonic()

        from app.utils.audio import pcm_to_float32
        audio = pcm_to_float32(pcm_bytes)
        speaker = speaker_tracker.update(audio)

        try:
            result = await stt_service.transcribe_chunk(pcm_bytes, lang_hint=lang_hint)
        except Exception as e:
            log.error("stt.error", error=str(e), call_id=call_id)
            await _send(_make_event("error", call_id=call_id, code="STT_FAIL", message=str(e)), priority=True)
            return

        text = result.text.strip()
        if not text:
            return

        ts = time.time()
        entry = {"speaker": speaker, "text": text, "ts": ts}
        if call_id:
            _transcripts.setdefault(call_id, []).append(entry)

        await _send(_make_event("transcript", call_id=call_id, speaker=speaker, text=text, ts=ts))

        # Publish transcript to supervisor
        if call_id:
            await event_bus.publish("supervisor", {
                "type": "transcript_chunk", "call_id": call_id,
                "speaker": speaker, "text": text, "ts": ts,
            })

        # Compliance check
        if call_id:
            try:
                ticked = await compliance_service.check_chunk(call_id, text)
                for phrase_id in ticked:
                    await _send(
                        _make_event("compliance_tick", call_id=call_id, phrase_id=phrase_id),
                        priority=True,
                    )
                    # Persist compliance status
                    async with AsyncSessionLocal() as db:
                        result2 = await db.execute(select(Call).where(Call.id == call_id))
                        call = result2.scalar_one_or_none()
                        if call:
                            status = dict(call.compliance_status or {})
                            status[phrase_id] = "ok"
                            call.compliance_status = status
                            await db.commit()
            except Exception as e:
                log.warning("compliance.error", error=str(e))

        # Sentiment analysis
        if call_id:
            try:
                sentiment_result = await sentiment_service.analyze(call_id, text)
                if sentiment_result:
                    await _send(
                        _make_event("sentiment", call_id=call_id, **sentiment_result),
                        priority=False,
                    )
            except Exception as e:
                log.warning("sentiment.error", error=str(e))

        # Auto extraction trigger
        if call_id and not extraction_done:
            elapsed = time.monotonic() - _call_start_times.get(call_id, time.monotonic())
            if elapsed >= 60.0:
                asyncio.create_task(_run_extraction(call_id))

        # Guardrail + suggestion
        if not guardrail_service.is_bank_related(text):
            log.debug("guardrail.drop", call_id=call_id, text=text[:40])
            return

        # Build RAG context
        rag_context = ""
        try:
            from app.services.rag_service import build_context
            rag_context = await build_context(text)
        except Exception as e:
            log.warning("rag.error", error=str(e))

        # Stream suggestion tokens
        suggestion_tokens: list[str] = []
        try:
            async for token in llm_service.get_suggestion(
                customer_text=text, rag_context=rag_context
            ):
                suggestion_tokens.append(token)
        except Exception as e:
            log.error("llm.error", error=str(e), call_id=call_id)
            await _send(_make_event("error", call_id=call_id, code="LLM_TIMEOUT", message=str(e)), priority=True)
            return

        if suggestion_tokens:
            full = "".join(suggestion_tokens)
            bullets = [b.strip() for b in full.split("\n") if b.strip()][:3]
            latency_ms = int((time.monotonic() - t_start) * 1000)
            log.info("suggestion_emitted", call_id=call_id, latency_ms=latency_ms)
            await _send(
                _make_event("suggestion", call_id=call_id, text=bullets, trigger=text[:60]),
                priority=True,
            )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "start_call":
                call_id = msg.get("call_id") or str(uuid4())
                lang_hint = msg.get("language_hint")
                _transcripts[call_id] = []
                _call_start_times[call_id] = time.monotonic()
                extraction_done = False
                async with AsyncSessionLocal() as db:
                    existing = await db.execute(select(Call).where(Call.id == call_id))
                    if existing.scalar_one_or_none() is None:
                        call = Call(id=call_id, agent_id=user.id, started_at=datetime.utcnow())
                        db.add(call)
                        await db.commit()
                await event_bus.publish("supervisor", {
                    "type": "call_started", "call_id": call_id, "agent_id": user.id,
                })
                log.info("ws.call.started", call_id=call_id, user_id=user.id)

            elif msg_type == "audio_chunk":
                if call_id is None:
                    continue
                try:
                    pcm_bytes = base64.b64decode(msg["pcm_b64"])
                except Exception:
                    continue
                flushed = buf.push(pcm_bytes)
                if flushed:
                    asyncio.create_task(_process_audio(flushed))

            elif msg_type == "trigger_intake_extraction":
                if call_id:
                    asyncio.create_task(_run_extraction(call_id))

            elif msg_type == "end_call":
                if call_id is None:
                    continue
                # Flush remaining audio
                remaining = buf.flush()
                if remaining:
                    await _process_audio(remaining)

                transcript = _transcripts.pop(call_id, [])
                compliance_status = compliance_service.get_status(call_id)

                # Generate summary
                summary = {}
                try:
                    from app.services.summary_service import summarize
                    summary = await summarize(call_id, transcript, compliance_status)
                except Exception as e:
                    log.error("summary.error", call_id=call_id, error=str(e))

                # Persist to DB
                async with AsyncSessionLocal() as db:
                    result2 = await db.execute(select(Call).where(Call.id == call_id))
                    call = result2.scalar_one_or_none()
                    if call:
                        call.transcript = transcript
                        call.ended_at = datetime.utcnow()
                        call.compliance_status = compliance_status
                        call.summary = summary
                        await db.commit()

                compliance_service.clear_call(call_id)
                sentiment_service.clear_call(call_id)
                _call_start_times.pop(call_id, None)

                await event_bus.publish("supervisor", {
                    "type": "call_ended", "call_id": call_id,
                })

                await _send(
                    _make_event("summary_ready", call_id=call_id, summary=summary),
                    priority=True,
                )
                log.info("ws.call.ended", call_id=call_id)
                break

    except WebSocketDisconnect:
        log.info("ws.audio.disconnected", user_id=user.id, call_id=call_id)
    except Exception as e:
        log.error("ws.audio.error", error=str(e), user_id=user.id)
    finally:
        _transcripts.pop(call_id, None)
        _call_start_times.pop(call_id, None)
        if call_id:
            compliance_service.clear_call(call_id)
            sentiment_service.clear_call(call_id)
