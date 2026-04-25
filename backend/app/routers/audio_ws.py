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
from app.services import guardrail_service, llm_service, stt_service
from app.services.auth_service import decode_token
from app.utils.audio import ChunkBuffer, SpeakerTracker

router = APIRouter()
log = structlog.get_logger()

MAX_OUTBOUND_QUEUE = 50

# Per-call in-memory state: {call_id: [transcript entries]}
_transcripts: dict[str, list[dict]] = {}


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

    async def _flush_queue():
        async with send_lock:
            while outbound_q:
                msg = outbound_q.popleft()
                try:
                    await websocket.send_text(msg)
                except Exception:
                    break

    async def _send(msg: str, priority: bool = False):
        """Queue a message. Non-priority transcript events are dropped when queue full."""
        if priority:
            # Force send high-priority events immediately
            try:
                await websocket.send_text(msg)
            except Exception:
                pass
        else:
            outbound_q.append(msg)
            await _flush_queue()

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

        # Guardrail + suggestion
        if not guardrail_service.is_bank_related(text):
            log.debug("guardrail.drop", call_id=call_id, text=text[:40])
            return

        # Stream suggestion tokens
        suggestion_tokens: list[str] = []
        try:
            async for token in llm_service.get_suggestion(customer_text=text):
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
                # Create DB record if not provided
                async with AsyncSessionLocal() as db:
                    existing = await db.execute(select(Call).where(Call.id == call_id))
                    if existing.scalar_one_or_none() is None:
                        call = Call(id=call_id, agent_id=user.id, started_at=datetime.utcnow())
                        db.add(call)
                        await db.commit()
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
                # Stub — wired in Phase 3
                pass

            elif msg_type == "end_call":
                if call_id is None:
                    continue
                # Flush remaining audio
                remaining = buf.flush()
                if remaining:
                    await _process_audio(remaining)
                # Persist transcript to DB
                transcript = _transcripts.pop(call_id, [])
                async with AsyncSessionLocal() as db:
                    result = await db.execute(select(Call).where(Call.id == call_id))
                    call = result.scalar_one_or_none()
                    if call:
                        call.transcript = transcript
                        call.ended_at = datetime.utcnow()
                        await db.commit()
                log.info("ws.call.ended", call_id=call_id)
                await _send(_make_event("summary_ready", call_id=call_id, summary={}), priority=True)
                break

    except WebSocketDisconnect:
        log.info("ws.audio.disconnected", user_id=user.id, call_id=call_id)
    except Exception as e:
        log.error("ws.audio.error", error=str(e), user_id=user.id)
    finally:
        _transcripts.pop(call_id, None)
