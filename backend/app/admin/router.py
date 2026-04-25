from pathlib import Path
from typing import Optional

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.auth import get_admin_basic
from app.config import settings
from app.deps import get_db
from app.models.document import Document, DocumentChunk
from app.models.user import User

router = APIRouter(prefix="/admin")
log = structlog.get_logger()

_TEMPLATES_DIR = Path(__file__).parent / "templates"
templates = Jinja2Templates(directory=str(_TEMPLATES_DIR))

_ALLOWED_EXTENSIONS = {".pdf", ".txt"}


@router.get("", response_class=HTMLResponse)
async def dashboard(
    request: Request,
    msg: Optional[str] = None,
    err: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_basic),
):
    result = await db.execute(select(Document).order_by(Document.uploaded_at.desc()))
    documents = result.scalars().all()
    return templates.TemplateResponse(
        "dashboard.html",
        {"request": request, "admin": admin, "documents": documents, "msg": msg, "err": err},
    )


@router.post("/upload")
async def upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    tag: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_basic),
):
    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    content = await file.read()

    if len(content) > max_bytes:
        return RedirectResponse(
            f"/admin?err=File+exceeds+{settings.MAX_PDF_SIZE_MB}+MB+limit",
            status_code=303,
        )

    ext = Path(file.filename).suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        return RedirectResponse("/admin?err=Only+PDF+or+TXT+files+are+accepted", status_code=303)

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    doc = Document(
        filename=file.filename,
        tag=tag or None,
        status="indexing",
        uploaded_by=admin.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    file_path = upload_dir / f"{doc.id}{ext}"
    file_path.write_bytes(content)

    from app.services.ingest_service import ingest_document
    background_tasks.add_task(ingest_document, doc.id, file_path)

    log.info("admin.panel.upload", document_id=doc.id, filename=file.filename)
    safe_name = file.filename.replace(" ", "+")
    return RedirectResponse(f"/admin?msg=Uploaded+{safe_name}", status_code=303)


@router.post("/documents/{document_id}/delete")
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_basic),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        return RedirectResponse("/admin?err=Document+not+found", status_code=303)

    ext = Path(doc.filename).suffix.lower()
    file_path = Path(settings.UPLOAD_DIR) / f"{document_id}{ext}"
    if file_path.exists():
        file_path.unlink()

    filename = doc.filename
    await db.delete(doc)
    await db.commit()
    log.info("admin.panel.delete", document_id=document_id)

    from app.services.bm25_service import rebuild_from_db
    await rebuild_from_db()

    return RedirectResponse(f"/admin?msg=Deleted+{filename}", status_code=303)


@router.post("/documents/{document_id}/reindex")
async def reindex_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_basic),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        return RedirectResponse("/admin?err=Document+not+found", status_code=303)

    ext = Path(doc.filename).suffix.lower()
    file_path = Path(settings.UPLOAD_DIR) / f"{document_id}{ext}"
    if not file_path.exists():
        return RedirectResponse("/admin?err=File+not+found+on+disk", status_code=303)

    result2 = await db.execute(
        select(DocumentChunk).where(DocumentChunk.document_id == document_id)
    )
    for chunk in result2.scalars().all():
        await db.delete(chunk)

    doc.status = "indexing"
    doc.error_message = None
    await db.commit()

    from app.services.ingest_service import ingest_document
    background_tasks.add_task(ingest_document, document_id, file_path)

    log.info("admin.panel.reindex", document_id=document_id)
    return RedirectResponse(f"/admin?msg=Reindexing+{doc.filename}", status_code=303)
