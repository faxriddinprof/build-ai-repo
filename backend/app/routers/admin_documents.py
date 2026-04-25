import os
from pathlib import Path
from typing import Optional

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_db, require_role
from app.models.document import Document, DocumentChunk
from app.models.user import User
from app.schemas.document import DocumentResponse

router = APIRouter()
log = structlog.get_logger()


@router.post("/documents", response_model=DocumentResponse, status_code=202)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    tag: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.MAX_PDF_SIZE_MB} MB limit")
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    doc = Document(
        filename=file.filename,
        tag=tag,
        status="indexing",
        uploaded_by=admin.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    file_path = upload_dir / f"{doc.id}.pdf"
    file_path.write_bytes(content)

    from app.services.ingest_service import ingest_pdf
    background_tasks.add_task(ingest_pdf, doc.id, file_path)

    log.info("admin.document.uploaded", document_id=doc.id, filename=file.filename)
    return doc


@router.get("/documents", response_model=list[DocumentResponse])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    result = await db.execute(select(Document).order_by(Document.uploaded_at.desc()))
    return result.scalars().all()


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete file from disk
    file_path = Path(settings.UPLOAD_DIR) / f"{document_id}.pdf"
    if file_path.exists():
        file_path.unlink()

    await db.delete(doc)
    await db.commit()
    log.info("admin.document.deleted", document_id=document_id)


@router.post("/documents/{document_id}/reindex", response_model=DocumentResponse)
async def reindex_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = Path(settings.UPLOAD_DIR) / f"{document_id}.pdf"
    if not file_path.exists():
        raise HTTPException(status_code=400, detail="PDF file not found on disk")

    # Delete existing chunks
    result2 = await db.execute(
        select(DocumentChunk).where(DocumentChunk.document_id == document_id)
    )
    for chunk in result2.scalars().all():
        await db.delete(chunk)

    doc.status = "indexing"
    doc.error_message = None
    await db.commit()
    await db.refresh(doc)

    from app.services.ingest_service import ingest_pdf
    background_tasks.add_task(ingest_pdf, document_id, file_path)

    log.info("admin.document.reindex", document_id=document_id)
    return doc
