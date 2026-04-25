import json
import re

import structlog

from app.config import settings
from app.prompts.summary_uz import SUMMARY_PROMPT

log = structlog.get_logger()

_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```")


def _strip_code_fence(raw: str) -> str:
    m = _CODE_FENCE_RE.search(raw)
    return m.group(1) if m else raw.strip()


async def summarize(call_id: str, transcript: list[dict], compliance_status: dict) -> dict:
    from app.services.llm_service import chat

    transcript_text = "\n".join(
        f"[{e.get('speaker', 'unknown')}]: {e.get('text', '')}"
        for e in transcript
    )
    compliance_summary = "; ".join(
        f"{k}: {v}" for k, v in compliance_status.items()
    ) if compliance_status else "Mavjud emas"

    try:
        raw = await chat(
            messages=[{
                "role": "user",
                "content": SUMMARY_PROMPT.format(
                    transcript=transcript_text,
                    compliance_summary=compliance_summary,
                ),
            }],
            max_tokens=settings.LLM_MAX_TOKENS_SUMMARY,
            temperature=0.2,
        )
        result = json.loads(_strip_code_fence(raw))
    except Exception as e:
        log.error("summary.failed", call_id=call_id, error=str(e))
        result = {
            "outcome": "no_decision",
            "objections": [],
            "compliance_status": "failed",
            "next_action": "Qo'lda ko'rib chiqish talab qilinadi.",
        }

    log.info("summary.done", call_id=call_id)
    return result
