import asyncio
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
        api_key=settings.LITELLM_API_KEY,
        timeout=float(settings.LLM_TIMEOUT_SECONDS),
    )
    return resp.data[0]["embedding"]


async def _dense_search(
    query: str,
    top_k: int,
    tag_filter: Optional[str],
    db: Optional[AsyncSession],
) -> list[dict]:
    """pgvector cosine search returning up to top_k dense hits."""
    vector = await embed(query)
    vec_str = "[" + ",".join(str(v) for v in vector) + "]"

    sql = text("""
        SELECT dc.id AS chunk_id, dc.content, dc.page_number, dc.document_id, d.filename,
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
        result = await db.execute(sql, {"vec": vec_str, "tag": tag_filter, "top_k": top_k})
        rows = result.mappings().all()
        return [dict(r) for r in rows]
    finally:
        if own_session:
            await db.close()


def _rrf(dense: list[dict], sparse: list[dict], k: int = 60) -> list[dict]:
    """Reciprocal Rank Fusion over dense and sparse hit lists. Keyed by chunk_id."""
    scores: dict[str, float] = {}
    data: dict[str, dict] = {}

    for rank, hit in enumerate(dense, start=1):
        cid = hit["chunk_id"]
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank)
        if cid not in data:
            data[cid] = hit

    for rank, hit in enumerate(sparse, start=1):
        cid = hit["chunk_id"]
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank)
        if cid not in data:
            data[cid] = {
                "chunk_id": hit["chunk_id"],
                "content": hit["content"],
                "page_number": hit["page_number"],
                "document_id": hit["document_id"],
                "filename": hit["filename"],
            }

    fused = []
    for cid in sorted(scores, key=lambda x: scores[x], reverse=True):
        entry = data[cid].copy()
        entry["similarity"] = scores[cid]
        fused.append(entry)
    return fused


async def search(
    query: str,
    top_k: int = 5,
    tag_filter: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> list[dict]:
    """Hybrid retrieval: dense (BGE-M3 + pgvector) + sparse (BM25s) → RRF → top_k."""
    from app.services import bm25_service

    dense_coro = _dense_search(query, top_k=settings.RAG_DENSE_TOP_K, tag_filter=tag_filter, db=db)
    sparse_coro = bm25_service.search(query, top_k=settings.RAG_SPARSE_TOP_K, tag_filter=tag_filter)

    results = await asyncio.gather(dense_coro, sparse_coro, return_exceptions=True)

    dense_hits: list[dict] = results[0] if not isinstance(results[0], Exception) else []
    sparse_hits: list[dict] = results[1] if not isinstance(results[1], Exception) else []

    if isinstance(results[0], Exception):
        log.warning("rag.dense_search_failed", error=str(results[0]))
    if isinstance(results[1], Exception):
        log.warning("rag.sparse_search_failed", error=str(results[1]))

    return _rrf(dense_hits, sparse_hits, k=settings.RRF_K)[:settings.RAG_FINAL_TOP_K]


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
