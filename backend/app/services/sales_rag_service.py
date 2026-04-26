"""
Dual-RAG context builder for the sales pipeline.

Merges client profile facts (≤300 tokens) with product/policy KB chunks
from the hybrid RAG store. Provides context for both:
  - LLM #1: SALES_RECOMMENDATION_PROMPT (debounced 30 s)
  - LLM #2: LIVE_SCRIPT_PROMPT (per-objection or per-3-turns)
"""
from typing import Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.client import ClientProfile

log = structlog.get_logger()


async def build_context(
    query: str,
    client_profile: Optional[ClientProfile] = None,
    db: Optional[AsyncSession] = None,
    top_k: int = 5,
) -> dict:
    """
    Returns:
        {
            "client_facts": str,    # empty if no profile
            "doc_context": str,     # product/policy KB chunks
            "pitches": list[dict],  # from recommendations()
        }
    """
    from app.services.rag_service import build_context as _rag_build_context
    from app.services.client_profile_service import format_for_llm, recommendations

    # Client facts (PII-safe)
    client_facts = ""
    pitches: list[dict] = []
    if client_profile is not None:
        client_facts = format_for_llm(client_profile)
        pitches = [p.model_dump() for p in recommendations(client_profile)]

    # Product/policy KB chunks
    try:
        doc_context = await _rag_build_context(query, client_profile=client_profile, top_k=top_k, db=db)
    except Exception as e:
        log.warning("sales_rag.doc_context_failed", error=str(e))
        doc_context = "Mavjud emas."

    return {
        "client_facts": client_facts,
        "doc_context": doc_context,
        "pitches": pitches,
    }
