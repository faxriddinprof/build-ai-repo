import json
from typing import Optional

import structlog
from rapidfuzz import fuzz

from app.config import settings

log = structlog.get_logger()

_phrases: list[dict] = []
_FUZZY_THRESHOLD = 85.0

# Per-call ticked phrase IDs: {call_id: set of phrase_ids}
_call_state: dict[str, set] = {}


def load_phrases() -> None:
    global _phrases
    try:
        with open(settings.COMPLIANCE_PHRASES_PATH) as f:
            _phrases = json.load(f)
        log.info("compliance.phrases_loaded", count=len(_phrases))
    except Exception as e:
        log.warning("compliance.load_failed", error=str(e))
        _phrases = []


def _matches(text: str, pattern: str) -> bool:
    text_lower = text.lower()
    pattern_lower = pattern.lower()
    if pattern_lower in text_lower:
        return True
    # Fuzzy match over sliding windows roughly the size of the pattern
    words = text_lower.split()
    pat_words = pattern_lower.split()
    window = len(pat_words)
    if window == 0:
        return False
    for i in range(len(words) - window + 1):
        chunk = " ".join(words[i:i + window])
        if fuzz.ratio(chunk, pattern_lower) >= _FUZZY_THRESHOLD:
            return True
    return False


async def check_chunk(call_id: str, text: str) -> list[str]:
    ticked = _call_state.setdefault(call_id, set())
    newly_ticked: list[str] = []

    for phrase in _phrases:
        pid = phrase["id"]
        if pid in ticked:
            continue
        for pattern in phrase.get("patterns", []):
            if _matches(text, pattern):
                ticked.add(pid)
                newly_ticked.append(pid)
                log.info("compliance.tick", call_id=call_id, phrase_id=pid)
                break

    return newly_ticked


def get_status(call_id: str) -> dict:
    ticked = _call_state.get(call_id, set())
    return {
        p["id"]: ("ok" if p["id"] in ticked else "missed")
        for p in _phrases
    }


def clear_call(call_id: str) -> None:
    _call_state.pop(call_id, None)
