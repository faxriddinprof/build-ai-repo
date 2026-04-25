import json
import re
from typing import Optional

import structlog

from app.config import settings
from app.prompts.extraction_uz import EXTRACTION_PROMPT

log = structlog.get_logger()

_PASSPORT_RE = re.compile(r"^[A-Z]{2}\d{7}$")
_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```")


def _strip_code_fence(raw: str) -> str:
    m = _CODE_FENCE_RE.search(raw)
    return m.group(1) if m else raw.strip()


def _validate_passport(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value if _PASSPORT_RE.match(value) else None


async def extract(call_id: str, transcript: str) -> dict:
    from app.services.llm_service import chat

    messages = [
        {
            "role": "user",
            "content": EXTRACTION_PROMPT.format(transcript=transcript),
        }
    ]

    try:
        raw = await chat(
            messages=messages,
            max_tokens=settings.LLM_MAX_TOKENS_EXTRACTION,
            temperature=0.1,
        )
        data = json.loads(_strip_code_fence(raw))
    except Exception as e:
        log.error("extraction.failed", call_id=call_id, error=str(e))
        return {"customer_name": None, "customer_passport": None, "customer_region": None, "confidence": 0.0}

    confidence = float(data.get("confidence", 0.0))
    name = data.get("customer_name")
    passport = _validate_passport(data.get("customer_passport"))
    region = data.get("customer_region")

    # Low confidence: blank most fields
    if confidence < 0.5:
        name = None
        passport = None
        region = None
    elif confidence < settings.EXTRACTION_CONFIDENCE_THRESHOLD:
        passport = None
        region = None

    log.info("extraction.done", call_id=call_id, confidence=confidence)
    return {
        "customer_name": name,
        "customer_passport": passport,
        "customer_region": region,
        "confidence": confidence,
    }
