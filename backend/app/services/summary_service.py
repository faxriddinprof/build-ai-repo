import json
import re
from typing import Optional

import structlog

from app.config import settings
from app.prompts.summary_uz import SUMMARY_PROMPT

log = structlog.get_logger()

_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```")


def _strip_code_fence(raw: str) -> str:
    m = _CODE_FENCE_RE.search(raw)
    return m.group(1) if m else raw.strip()


async def summarize(
    call_id: str,
    transcript: list[dict],
    compliance_status: dict,
    sentiment_journey: Optional[list] = None,
    top_objection: Optional[str] = None,
) -> dict:
    from app.services.llm_service import chat

    transcript_text = "\n".join(
        f"[{e.get('speaker', 'unknown')}]: {e.get('text', '')}"
        for e in transcript
    )
    total_compliance = max(len(compliance_status), 1) if compliance_status else 9
    compliance_summary = "; ".join(
        f"{k}: {v}" for k, v in compliance_status.items()
    ) if compliance_status else "Mavjud emas"
    passed = sum(1 for v in compliance_status.values() if v == "ok") if compliance_status else 0

    try:
        raw = await chat(
            messages=[{
                "role": "user",
                "content": SUMMARY_PROMPT.format(
                    transcript=transcript_text,
                    compliance_summary=compliance_summary,
                    total_compliance=total_compliance,
                ),
            }],
            max_tokens=settings.LLM_MAX_TOKENS_SUMMARY,
            temperature=0.2,
        )
        result = json.loads(_strip_code_fence(raw))
    except Exception as e:
        log.error("summary.failed", call_id=call_id, error=str(e))
        result = {
            "natija": "Qo'lda ko'rib chiqish talab qilinadi.",
            "etirozlar": [],
            "etirozlarBartaraf": "E'tirozlar bartaraf etilmadi.",
            "keyingiQadam": "Qo'lda ko'rib chiqing.",
            "outcome": "callback",
            "complianceHolati": {"passed": passed, "total": total_compliance},
        }

    # Ensure complianceHolati is present regardless of LLM output
    if "complianceHolati" not in result:
        result["complianceHolati"] = {"passed": passed, "total": total_compliance}

    # Merge in pipeline-computed fields
    result["sentimentJourney"] = sentiment_journey or []
    if top_objection and "topObjection" not in result:
        result["topObjection"] = top_objection

    log.info("summary.done", call_id=call_id)
    return result
