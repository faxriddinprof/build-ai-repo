# Admin Panel

Server-rendered Jinja2 UI for managing bank knowledge base documents. Mounted at `/admin`, protected by HTTP Basic Auth, supports PDF and TXT uploads.

## Access

```
URL:      http://localhost:8000/admin
Username: admin@bank.uz          (ADMIN_EMAIL in .env)
Password: changeme               (ADMIN_PASSWORD — change in production)
```

The browser shows a native login prompt. Credentials are validated against the `users` table (bcrypt hash, `role=admin`, `is_active=true`).

## Upload

Accepted formats: **PDF** and **TXT** (UTF-8).

| Field | Required | Notes |
|-------|----------|-------|
| File  | yes | `.pdf` or `.txt`, max `MAX_PDF_SIZE_MB` (default 50 MB) |
| Tag   | no  | `product` · `news` · `credit` · `script` · `compliance` · `faq` |

After upload the document row appears with `status=indexing`. The page auto-refreshes every 4 s until all indexing rows are gone.

### What happens on upload

```
file saved to uploads/{doc_id}.pdf|txt
        │
        ▼ (background task)
ingest_document(doc_id, file_path)
    ├── .pdf → PyMuPDF → pages list
    └── .txt → read_text() → single page
        │
        ▼
_persist_chunks()
    ├── _chunk_text()         (500-token chunks, 50-token overlap)
    ├── embed() × N           (BGE-M3 1024-dim via Ollama)
    ├── INSERT document_chunks (pgvector)
    ├── doc.status = "ready"
    └── rebuild_from_db()     (BM25s sparse index rebuilt)
```

Dense (pgvector) and sparse (BM25s) indexes are **always updated together** — both are required for the hybrid RAG pipeline.

## Document table columns

| Column | Meaning |
|--------|---------|
| Filename | Original upload name |
| Tag | Category label |
| Status | `indexing` (yellow) · `ready` (green) · `error` (red, hover for message) |
| Pages | Page count (PDF) or `1` (TXT) |
| Chunks | Number of embedded chunks stored |
| Uploaded | UTC timestamp |

## Actions

**Reindex** — deletes existing chunks and re-runs the full ingest pipeline from the file on disk. Use when the embedding model or chunk settings change.

**Delete** — removes the file from disk, deletes the document and all its chunks from the DB (cascades), then rebuilds the BM25 index.

## JSON API equivalent

The same operations are available via the JWT-gated REST API for programmatic use:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bank.uz","password":"changeme"}' | jq -r .access_token)

# Upload PDF
curl -X POST http://localhost:8000/api/admin/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@product_guide.pdf -F tag=product

# Upload TXT
curl -X POST http://localhost:8000/api/admin/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@news.txt -F tag=news

# List
curl http://localhost:8000/api/admin/documents \
  -H "Authorization: Bearer $TOKEN"

# Delete
curl -X DELETE http://localhost:8000/api/admin/documents/{id} \
  -H "Authorization: Bearer $TOKEN"

# Reindex
curl -X POST http://localhost:8000/api/admin/documents/{id}/reindex \
  -H "Authorization: Bearer $TOKEN"
```

## Files

```
backend/app/admin/
├── __init__.py
├── auth.py              HTTPBasic dependency (DB lookup + bcrypt verify)
├── router.py            GET /admin, POST /admin/upload, /delete, /reindex
├── templates/
│   ├── base.html        Sticky header layout
│   └── dashboard.html   Upload form + documents table
└── static/
    ├── admin.css        Styling + status badge colours
    └── admin.js         Confirm-on-delete, auto-refresh on indexing rows

backend/app/services/ingest_service.py
    ingest_document()    Dispatch by extension → shared _persist_chunks()
    ingest_pdf()         Thin alias (backward-compat)
```

## Supported document types for RAG

| Type | Bank data examples |
|------|--------------------|
| PDF  | Product brochures, credit terms, compliance manuals, scripts |
| TXT  | News bulletins, rate sheets, FAQ text exports |

OCR is **not** supported — PDFs must have extractable text (not scanned images).
