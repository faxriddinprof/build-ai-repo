import asyncio
import re
from pathlib import Path
from typing import Optional

import structlog

from app.config import settings
from app.database import AsyncSessionLocal

log = structlog.get_logger()

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_APPROX_CHARS_PER_TOKEN = 4


def _count_tokens_approx(text: str) -> int:
    return max(1, len(text) // _APPROX_CHARS_PER_TOKEN)


def _chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    sentences = _SENTENCE_SPLIT.split(text)
    chunks: list[str] = []
    current_tokens = 0
    current_parts: list[str] = []

    for sentence in sentences:
        t = _count_tokens_approx(sentence)
        if current_tokens + t > chunk_size and current_parts:
            chunks.append(" ".join(current_parts))
            # Keep overlap sentences
            overlap_tokens = 0
            overlap_parts: list[str] = []
            for s in reversed(current_parts):
                overlap_tokens += _count_tokens_approx(s)
                overlap_parts.insert(0, s)
                if overlap_tokens >= overlap:
                    break
            current_parts = overlap_parts
            current_tokens = overlap_tokens
        current_parts.append(sentence)
        current_tokens += t

    if current_parts:
        chunks.append(" ".join(current_parts))

    return [c for c in chunks if c.strip()]


async def ingest_pdf(document_id: str, file_path: Path) -> None:
    from app.services.rag_service import embed
    from app.models.document import Document, DocumentChunk
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Document).where(Document.id == document_id))
        doc = result.scalar_one_or_none()
        if doc is None:
            log.error("ingest.document_not_found", document_id=document_id)
            return
        doc.status = "indexing"
        await db.commit()

    try:
        import fitz  # PyMuPDF
        pdf = fitz.open(str(file_path))
        page_count = len(pdf)

        # Extract all text
        pages: list[tuple[int, str]] = []
        for page_num in range(page_count):
            text = pdf[page_num].get_text()
            if text.strip():
                pages.append((page_num + 1, text))

        if not pages:
            raise ValueError("no text extractable — OCR not supported in MVP")

        # Chunk all pages
        all_chunks: list[dict] = []
        for page_num, page_text in pages:
            for chunk_text in _chunk_text(
                page_text,
                settings.CHUNK_SIZE_TOKENS,
                settings.CHUNK_OVERLAP_TOKENS,
            ):
                all_chunks.append({"page": page_num, "text": chunk_text})

        # Batch embed (32 at a time)
        BATCH_SIZE = 32
        chunk_records: list[DocumentChunk] = []

        for i in range(0, len(all_chunks), BATCH_SIZE):
            batch = all_chunks[i:i + BATCH_SIZE]
            embeddings = await asyncio.gather(
                *[embed(c["text"]) for c in batch]
            )
            for j, (chunk_data, emb) in enumerate(zip(batch, embeddings)):
                chunk_records.append(DocumentChunk(
                    document_id=document_id,
                    content=chunk_data["text"],
                    embedding=emb,
                    page_number=chunk_data["page"],
                    chunk_index=i + j,
                ))

        # Persist
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Document).where(Document.id == document_id))
            doc = result.scalar_one_or_none()
            if doc is None:
                return
            db.add_all(chunk_records)
            doc.page_count = page_count
            doc.chunk_count = len(chunk_records)
            doc.status = "ready"
            await db.commit()

        log.info("ingest.done", document_id=document_id, chunks=len(chunk_records))

    except Exception as e:
        log.error("ingest.error", document_id=document_id, error=str(e))
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Document).where(Document.id == document_id))
            doc = result.scalar_one_or_none()
            if doc:
                doc.status = "error"
                doc.error_message = str(e)[:500]
                await db.commit()
