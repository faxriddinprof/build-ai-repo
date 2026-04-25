import time
from typing import Optional

import structlog

log = structlog.get_logger()

_POSITIVE = {
    "yaxshi", "ajoyib", "ha", "albatta", "rahmat", "zo'r", "maqul",
    "xursand", "qabul", "rozi", "tayyor", "bajonidil", "ok", "okay",
}
_NEGATIVE = {
    "qimmat", "yo'q", "kerak emas", "tushunmadim", "muammo", "yomon",
    "rад", "ishonmadim", "kechikish", "vaqt yo'q", "qiyin", "imkonsiz",
    "нет", "дорого", "плохо", "проблема",
}

# Per-call: {call_id: {"last_llm_call": float, "last_sentiment": str, "turns": list}}
_call_state: dict[str, dict] = {}
_LLM_COOLDOWN_SECONDS = 5.0


def _keyword_score(turns: list[str]) -> int:
    score = 0
    text = " ".join(turns).lower()
    for w in _POSITIVE:
        if w in text:
            score += 1
    for w in _NEGATIVE:
        if w in text:
            score -= 1
    return score


async def analyze(call_id: str, text: str) -> Optional[dict]:
    state = _call_state.setdefault(call_id, {
        "last_llm_call": 0.0,
        "last_sentiment": "neutral",
        "turns": [],
    })

    state["turns"].append(text)
    if len(state["turns"]) > 3:
        state["turns"] = state["turns"][-3:]

    score = _keyword_score(state["turns"])

    if score >= 2:
        sentiment = "positive"
        confidence = 0.9
    elif score <= -2:
        sentiment = "negative"
        confidence = 0.9
    else:
        # Borderline — try LLM if cooldown passed
        now = time.monotonic()
        if now - state["last_llm_call"] >= _LLM_COOLDOWN_SECONDS:
            state["last_llm_call"] = now
            sentiment, confidence = await _llm_tone(state["turns"])
        else:
            sentiment = "neutral"
            confidence = 0.5

    if sentiment == state["last_sentiment"]:
        return None  # No change, skip event

    state["last_sentiment"] = sentiment
    return {"sentiment": sentiment, "confidence": confidence}


async def _llm_tone(turns: list[str]) -> tuple:
    try:
        from app.services.llm_service import chat
        excerpt = " | ".join(turns[-3:])
        resp = await chat(
            messages=[{
                "role": "user",
                "content": (
                    f"Mijoz tonusini aniqla: positive / neutral / negative.\n"
                    f"Faqat bir so'z javob qaytar.\nMijoz: {excerpt}"
                ),
            }],
            max_tokens=5,
            temperature=0.0,
        )
        word = resp.strip().lower()
        if "positive" in word or "ijobiy" in word:
            return "positive", 0.8
        if "negative" in word or "salbiy" in word:
            return "negative", 0.8
        return "neutral", 0.7
    except Exception as e:
        log.warning("sentiment.llm_failed", error=str(e))
        return "neutral", 0.5


def clear_call(call_id: str) -> None:
    _call_state.pop(call_id, None)
