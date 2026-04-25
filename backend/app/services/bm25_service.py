import asyncio
import json
import re
import shutil
from pathlib import Path
from typing import Optional

import structlog

from app.config import settings

log = structlog.get_logger()

# Module-level state — initialized by load_or_init() during lifespan startup.
_lock: Optional[asyncio.Lock] = None
_retriever = None   # bm25s.BM25 instance
_meta: dict = {}    # parallel arrays keyed by corpus position

_TOKEN_RE = re.compile(r"[\w\x27ʻʼ‘’]+", re.UNICODE)


def _tokenize(text: str) -> list:
    """Tokenize preserving Uzbek apostrophes (o'lov, g'oya stay one token)."""
    return _TOKEN_RE.findall(text.lower())


def _index_dir() -> Path:
    return Path(settings.UPLOAD_DIR) / "bm25_index"


def _meta_path() -> Path:
    return _index_dir() / "chunk_meta.json"


def _rebuild_sync(rows: list) -> None:
    """CPU-bound: build BM25 index + write to disk atomically."""
    import bm25s

    if not rows:
        # Empty corpus — clear on-disk index if it exists
        if _index_dir().exists():
            shutil.rmtree(_index_dir())
        return

    chunk_ids = [r.id for r in rows]
    contents = [r.content for r in rows]
    page_numbers = [r.page_number for r in rows]
    document_ids = [r.document_id for r in rows]
    filenames = [r.filename for r in rows]
    tags = [r.tag for r in rows]

    corpus_tokens = [_tokenize(text) for text in contents]

    new_retriever = bm25s.BM25()
    new_retriever.index(corpus_tokens)

    meta = {
        "chunk_ids": chunk_ids,
        "contents": contents,
        "page_numbers": page_numbers,
        "document_ids": document_ids,
        "filenames": filenames,
        "tags": tags,
    }

    # Write to temp dir, then atomically replace
    tmp_dir = _index_dir().parent / "bm25_index.tmp"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True)

    new_retriever.save(str(tmp_dir))
    (tmp_dir / "chunk_meta.json").write_text(json.dumps(meta), encoding="utf-8")

    if _index_dir().exists():
        shutil.rmtree(_index_dir())
    shutil.move(str(tmp_dir), str(_index_dir()))

    return new_retriever, meta


def _load_sync():
    """Load index + meta from disk. Returns (retriever, meta) or (None, {})."""
    import bm25s

    if not _index_dir().exists():
        return None, {}
    try:
        retriever = bm25s.BM25.load(str(_index_dir()), load_corpus=False)
        meta = json.loads(_meta_path().read_text(encoding="utf-8"))
        return retriever, meta
    except Exception as e:
        log.warning("bm25.load_failed", error=str(e))
        return None, {}


def _search_sync(query: str, top_k: int, tag_filter: Optional[str]) -> list[dict]:
    """Synchronous BM25 search. Called via asyncio.to_thread."""
    import numpy as np

    retriever = _retriever
    meta = _meta

    if retriever is None or not meta.get("chunk_ids"):
        return []

    query_tokens = [_tokenize(query)]
    n_corpus = len(meta["chunk_ids"])

    if n_corpus == 0:
        return []

    # Fetch extra candidates to account for tag filtering
    fetch_k = min(top_k * 3 if tag_filter else top_k, n_corpus)

    try:
        results, scores = retriever.retrieve(query_tokens, k=fetch_k)
    except Exception as e:
        log.warning("bm25.retrieve_failed", error=str(e))
        return []

    indices = results[0].tolist() if hasattr(results[0], "tolist") else list(results[0])
    raw_scores = scores[0].tolist() if hasattr(scores[0], "tolist") else list(scores[0])

    hits = []
    for pos, (idx, score) in enumerate(zip(indices, raw_scores)):
        if tag_filter and meta["tags"][idx] != tag_filter:
            continue
        hits.append({
            "chunk_id": meta["chunk_ids"][idx],
            "content": meta["contents"][idx],
            "page_number": meta["page_numbers"][idx],
            "document_id": meta["document_ids"][idx],
            "filename": meta["filenames"][idx],
            "score": float(score),
        })
        if len(hits) >= top_k:
            break

    return hits


async def load_or_init() -> None:
    """Called once from main.py lifespan. Loads existing index or rebuilds from DB."""
    global _lock, _retriever, _meta  # noqa: PLW0603
    _lock = asyncio.Lock()

    retriever, meta = await asyncio.to_thread(_load_sync)
    if retriever is not None:
        async with _lock:
            _retriever = retriever
            _meta = meta
        log.info("bm25.loaded_from_disk", chunks=len(meta.get("chunk_ids", [])))
    else:
        log.info("bm25.no_index_on_disk_rebuilding")
        await rebuild_from_db()


async def rebuild_from_db() -> None:
    """Full corpus rebuild from document_chunks. Called after ingest/delete."""
    global _retriever, _meta
    from app.database import AsyncSessionLocal
    from app.models.document import DocumentChunk, Document
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(
                DocumentChunk.id,
                DocumentChunk.content,
                DocumentChunk.page_number,
                DocumentChunk.document_id,
                Document.filename,
                Document.tag,
            )
            .join(Document, DocumentChunk.document_id == Document.id)
            .order_by(DocumentChunk.id)
        )
        rows = result.all()

    log.info("bm25.rebuilding", chunks=len(rows))

    result = await asyncio.to_thread(_rebuild_sync, rows)

    # _rebuild_sync returns (retriever, meta) on success, None on empty corpus
    if result is None:
        async with _lock:
            _retriever = None
            _meta = {}
        log.info("bm25.index_cleared_empty_corpus")
        return

    new_retriever, new_meta = result
    async with _lock:
        _retriever = new_retriever
        _meta = new_meta

    log.info("bm25.rebuild_done", chunks=len(new_meta.get("chunk_ids", [])))


async def search(
    query: str,
    top_k: int = 20,
    tag_filter: Optional[str] = None,
) -> list[dict]:
    """Return top-k BM25 hits for query. Each hit has chunk_id, content, page_number, document_id, filename, score."""
    return await asyncio.to_thread(_search_sync, query, top_k, tag_filter)
