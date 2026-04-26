import asyncio
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import structlog

from app.config import settings
from app.utils.audio import pcm_to_float32

log = structlog.get_logger()

_model = None  # module-level singleton


@dataclass
class TranscribeResult:
    text: str
    language: str
    confidence: float
    segments: list = field(default_factory=list)


def load_model() -> None:
    """Load faster-whisper. Falls back to CPU if GPU/CUDA libs are unavailable."""
    global _model
    if _model is not None:
        return
    from faster_whisper import WhisperModel

    device = settings.WHISPER_DEVICE
    compute_type = settings.WHISPER_COMPUTE_TYPE
    log.info("stt.loading", model=settings.WHISPER_MODEL, device=device)
    try:
        _model = WhisperModel(
            settings.WHISPER_MODEL,
            device=device,
            compute_type=compute_type,
        )
    except Exception as e:
        if device != "cpu":
            log.warning("stt.cuda_unavailable_fallback_cpu", error=str(e))
            _model = WhisperModel(
                settings.WHISPER_MODEL,
                device="cpu",
                compute_type="int8",
            )
        else:
            raise
    log.info("stt.loaded", device=_model.model.device if hasattr(_model, "model") else device)


def _transcribe_sync(audio: np.ndarray, language_hint: Optional[str]) -> TranscribeResult:
    if _model is None:
        raise RuntimeError("STT model not loaded — call load_model() at startup")

    kwargs = {"beam_size": settings.WHISPER_BATCH_SIZE_REALTIME, "vad_filter": True}
    if language_hint:
        kwargs["language"] = language_hint

    segments, info = _model.transcribe(audio, **kwargs)
    seg_list = list(segments)
    text = " ".join(s.text.strip() for s in seg_list).strip()
    return TranscribeResult(
        text=text,
        language=info.language,
        confidence=info.language_probability,
        segments=[{"start": s.start, "end": s.end, "text": s.text} for s in seg_list],
    )


async def transcribe_chunk(
    pcm_bytes: bytes,
    sample_rate: int = 16000,
    language_hint: Optional[str] = None,
) -> TranscribeResult:
    """Async wrapper — runs faster-whisper in a thread pool to avoid blocking the event loop."""
    audio = pcm_to_float32(pcm_bytes)
    # faster-whisper expects 16 kHz; resample if needed (simple: assume client sends 16 kHz)
    return await asyncio.to_thread(_transcribe_sync, audio, language_hint)


async def warmup() -> None:
    """Send a silent dummy chunk to pre-load the model into memory."""
    import time

    silence = np.zeros(16000, dtype=np.float32)
    pcm = (silence * 32768).astype(np.int16).tobytes()
    t0 = time.monotonic()
    # Pass language hint to skip language detection on silent audio (avoids max() on empty seq)
    await transcribe_chunk(pcm, language_hint="uz")
    log.info("stt.warmup_done", latency_ms=int((time.monotonic() - t0) * 1000))
