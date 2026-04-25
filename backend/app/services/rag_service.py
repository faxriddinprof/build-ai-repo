import re
from typing import Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal

log = structlog.get_logger()

_MAX_CONTEXT_TOKENS = 1500
_APPROX_CHARS_PER_TOKEN = 4


async def embed(text_input: str) -> list[float]:
    from litellm import aembedding
    resp = await aembedding(
        model=settings.EMBEDDING_MODEL,
        input=[text_input],
        api_base=settings.LITELLM_BASE_URL,
        timeout=float(settings.LLM_TIMEOUT_SECONDS),
    )
    return resp.data[0]["embedding"]


async def search(
    query: str,
    top_k: int = 5,
    tag_filter: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> list[dict]:
    vector = await embed(query)
    vec_str = "[" + ",".join(str(v) for v in vector) + "]"

    sql = text("""
        SELECT dc.content, dc.page_number, dc.document_id, d.filename,
               1 - (dc.embedding <=> CAST(:vec AS vector)) AS similarity
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id
         WHERE (:tag IS NULL OR d.tag = :tag)
         ORDER BY dc.embedding <=> CAST(:vec AS vector)
         LIMIT :top_k
    """)

    own_session = db is None
    if own_session:
        db = AsyncSessionLocal()

    try:
        result = await db.execute(
            sql,
            {"vec": vec_str, "tag": tag_filter, "top_k": top_k},
        )
        rows = result.mappings().all()
        return [dict(r) for r in rows]
    finally:
        if own_session:
            await db.close()


async def build_context(transcript_tail: str, top_k: int = 5) -> str:
    try:
        chunks = await search(transcript_tail, top_k=top_k)
    except Exception as e:
        log.warning("rag.search_failed", error=str(e))
        return "Mavjud emas."

    if not chunks:
        return "Mavjud emas."

    parts: list[str] = []
    total_chars = 0
    char_budget = _MAX_CONTEXT_TOKENS * _APPROX_CHARS_PER_TOKEN

    for i, chunk in enumerate(chunks, 1):
        line = f"[chunk {i} — sahifa {chunk['page_number']}, {chunk['filename']}] {chunk['content']}"
        if total_chars + len(line) > char_budget:
            break
        parts.append(line)
        total_chars += len(line)

    return "\n".join(parts) if parts else "Mavjud emas."
