"""
REST fallback for WebRTC: POST /api/transcribe-chunk

Accepts webm/opus (or wav) from MediaRecorder, decodes via pydub,
runs the full AI pipeline, and returns events as JSON.

Stateful: caller must provide call_id. call_pipeline maintains per-call
state across requests. Send final=true on the last chunk to trigger summary.
"""
import io
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.deps import get_current_user
from app.models.call import Call
from app.models.user import User
from app.services import call_pipeline

router = APIRouter()
log = structlog.get_logger()


@router.post("/transcribe-chunk")
async def transcribe_chunk(
    audio: UploadFile = File(...),
    call_id: str = Form(...),
    lang_hint: Optional[str] = Form(None),
    final: bool = Form(False),
    user: User = Depends(get_current_user),
):
    if user.role not in ("agent", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Ensure Call row exists (idempotent — start_call skips insert if already present)
    from app.services.call_pipeline import _call_state
    if call_id not in _call_state:
        await call_pipeline.start_call(call_id, str(user.id), lang_hint=lang_hint)

    # Decode audio to 16 kHz mono int16 PCM
    audio_bytes = await audio.read()
    try:
        pcm_bytes = _decode_audio(audio_bytes)
    except Exception as e:
        log.warning("transcribe.decode_error", error=str(e), call_id=call_id)
        raise HTTPException(status_code=422, detail=f"Audio decode failed: {e}")

    events: list[dict] = []

    if pcm_bytes:
        chunk_events = await call_pipeline.process_audio_chunk(call_id, pcm_bytes, lang_hint)
        events.extend(chunk_events)

    if final:
        summary_event = await call_pipeline.finalize_call(call_id)
        events.append(summary_event)

    return {"events": events, "call_id": call_id}


def _decode_audio(audio_bytes: bytes) -> bytes:
    """Decode any audio format → 16 kHz mono int16 raw PCM bytes."""
    from pydub import AudioSegment
    seg = AudioSegment.from_file(io.BytesIO(audio_bytes))
    seg = seg.set_frame_rate(16000).set_channels(1).set_sample_width(2)
    return seg.raw_data
