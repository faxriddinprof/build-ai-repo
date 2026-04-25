import asyncio
from collections import deque
from typing import Optional
import numpy as np


class ChunkBuffer:
    """Accumulates raw PCM bytes until ≥ min_seconds of audio is available, then flushes."""

    def __init__(self, sample_rate: int = 16000, min_seconds: float = 1.0):
        self._sample_rate = sample_rate
        self._min_samples = int(sample_rate * min_seconds)
        self._buf: list[bytes] = []
        self._sample_count = 0

    def push(self, pcm_bytes: bytes) -> Optional[bytes]:
        self._buf.append(pcm_bytes)
        # 16-bit PCM → 2 bytes per sample
        self._sample_count += len(pcm_bytes) // 2
        if self._sample_count >= self._min_samples:
            combined = b"".join(self._buf)
            self._buf = []
            self._sample_count = 0
            return combined
        return None

    def flush(self) -> Optional[bytes]:
        if not self._buf:
            return None
        combined = b"".join(self._buf)
        self._buf = []
        self._sample_count = 0
        return combined


def pcm_to_float32(pcm_bytes: bytes) -> np.ndarray:
    """Convert raw 16-bit PCM bytes to float32 numpy array in [-1, 1]."""
    samples = np.frombuffer(pcm_bytes, dtype=np.int16)
    return samples.astype(np.float32) / 32768.0


class SpeakerTracker:
    """Naive energy-based speaker turn detection.

    Alternates between 'agent' and 'customer' on silence boundaries.
    Starts with 'agent' on the first non-silent chunk.
    """

    RMS_SILENCE_THRESHOLD = 0.01
    SILENCE_FRAMES_NEEDED = 8   # 8 × 100 ms = 800 ms silence → turn boundary

    def __init__(self):
        self._current_speaker = "agent"
        self._silence_frames = 0
        self._turn_changed = False

    def update(self, audio: np.ndarray) -> str:
        rms = float(np.sqrt(np.mean(audio ** 2))) if len(audio) > 0 else 0.0
        if rms < self.RMS_SILENCE_THRESHOLD:
            self._silence_frames += 1
            if self._silence_frames >= self.SILENCE_FRAMES_NEEDED:
                self._turn_changed = True
        else:
            if self._turn_changed:
                self._current_speaker = (
                    "customer" if self._current_speaker == "agent" else "agent"
                )
                self._turn_changed = False
            self._silence_frames = 0
        return self._current_speaker
