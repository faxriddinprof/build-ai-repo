import asyncio
import json
import wave
from pathlib import Path
from typing import Callable

import structlog

log = structlog.get_logger()

_SCENARIOS_PATH = Path(__file__).parent.parent.parent / "demo" / "scenarios.json"
_AUDIO_DIR = Path(__file__).parent.parent.parent / "demo" / "audio"

_CHUNK_MS = 100  # 100 ms chunks


def load_scenarios() -> list[dict]:
    try:
        return json.loads(_SCENARIOS_PATH.read_text())
    except Exception as e:
        log.warning("demo.scenarios_load_failed", error=str(e))
        return []


def _find_scenario(scenario_id: str) -> dict:
    for s in load_scenarios():
        if s["id"] == scenario_id:
            return s
    raise ValueError(f"Unknown scenario: {scenario_id}")


async def play_scenario(call_id: str, scenario_id: str, send: Callable) -> None:
    import base64

    scenario = _find_scenario(scenario_id)
    audio_path = _AUDIO_DIR / scenario["audio"]
    if not audio_path.exists():
        raise FileNotFoundError(f"WAV file not found: {audio_path}")

    with wave.open(str(audio_path), "rb") as wf:
        sample_rate = wf.getframerate()
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        frames_per_chunk = int(sample_rate * _CHUNK_MS / 1000)
        bytes_per_chunk = frames_per_chunk * channels * sampwidth

        log.info("demo.playing", scenario=scenario_id, call_id=call_id, sample_rate=sample_rate)

        while True:
            frames = wf.readframes(frames_per_chunk)
            if not frames:
                break

            if len(frames) < bytes_per_chunk:
                # Pad last chunk with silence
                frames = frames + b"\x00" * (bytes_per_chunk - len(frames))

            pcm_b64 = base64.b64encode(frames).decode()
            envelope = json.dumps({
                "type": "audio_chunk",
                "call_id": call_id,
                "pcm_b64": pcm_b64,
                "sample_rate": sample_rate,
            })
            await send(envelope)
            await asyncio.sleep(_CHUNK_MS / 1000)

    log.info("demo.done", scenario=scenario_id, call_id=call_id)
