# Manual Test Flow

End-to-end backend verification before frontend work. Run in order.

## Prerequisites

- Docker running
- `backend/.env` exists (copied from `.env.example`, `JWT_SECRET` set)
- Ollama models pulled inside the `ollama` container:
  ```bash
  docker compose exec ollama ollama pull qwen3:8b-q4_K_M
  docker compose exec ollama ollama pull bge-m3
  ```
- (Optional but recommended) Uzbek STT model converted:
  ```bash
  docker compose exec api python scripts/convert_stt_model.py
  # then in backend/.env: WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
  ```

---

## 1. Start the stack

```bash
docker compose up -d --build
```

For GPU mode:
```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Watch logs in a second terminal:
```bash
docker compose logs -f api
```

Wait for `startup.done` in the logs before continuing.

---

## 2. Health check

```bash
curl http://localhost:8000/healthz
```

Expected:
```json
{ "status": "ok", "db_ok": true, "ollama_ok": true, "models_loaded": true }
```

If `ollama_ok: false` → check `docker compose exec ollama ollama list` and pull missing models.

---

## 3. Auth

**Login and save token:**
```bash
make login   # prints full JSON

TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bank.uz","password":"changeme"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

**Wrong password → 401:**
```bash
curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bank.uz","password":"wrong"}' | python -m json.tool
```

**GET /me:**
```bash
curl -s http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

**Rate limit — 6th login attempt must return 429:**
```bash
for i in $(seq 1 7); do
  curl -sw "attempt $i: %{http_code}\n" -o /dev/null \
    -X POST http://localhost:8000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@bank.uz","password":"wrong"}'
done
# expect: 401 401 401 401 401 429 429
```

---

## 4. Admin panel (browser)

Open `http://localhost:8000/admin`.

Browser shows a native Basic Auth prompt:
- Username: `admin@bank.uz`
- Password: `changeme`

Create a test TXT file if you don't have one:
```bash
echo "Fixed deposit product. Annual rate 12%. Minimum term 3 months." \
  > /tmp/test_product.txt
```

1. Upload `test_product.txt` with tag `product` via the form.
2. Row appears with `status=indexing` (yellow).
3. Page auto-refreshes after 4 s → `status=ready` (green) with chunk count.
4. Upload a PDF if available — check `page_count` and `chunk_count` appear.

**Wrong credentials → 401 with `WWW-Authenticate` header:**
```bash
curl -u wrong:wrong http://localhost:8000/admin -i | head -3
# HTTP/1.1 401
# WWW-Authenticate: Basic realm="Bank Admin Panel"
```

---

## 5. Document API (JSON)

```bash
# List all documents
curl -s http://localhost:8000/api/admin/documents \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

# Save first doc ID
DOC_ID=$(curl -s http://localhost:8000/api/admin/documents \
  -H "Authorization: Bearer $TOKEN" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else 'none')")
echo $DOC_ID

# Get single document
curl -s http://localhost:8000/api/admin/documents/$DOC_ID \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

# Upload TXT via API
curl -s -X POST http://localhost:8000/api/admin/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@/tmp/test_product.txt -F tag=product | python -m json.tool
# expect: status=202, body has id + status="indexing"

# Reject unsupported extension → 400
echo "test" > /tmp/test.exe
curl -s -X POST http://localhost:8000/api/admin/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@/tmp/test.exe | python -m json.tool
# expect: 400, detail contains "Only PDF or TXT"
```

---

## 6. Calls CRUD

```bash
# Create a call
CALL_ID=$(curl -s -X POST http://localhost:8000/api/calls \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customer_name":"Alisher Umarov"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo $CALL_ID

# List calls
curl -s http://localhost:8000/api/calls \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

# Get single call
curl -s http://localhost:8000/api/calls/$CALL_ID \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

---

## 7. REST transcribe pipeline (no WebRTC needed)

This tests the full AI pipeline: STT → guardrail → RAG → LLM → events.

```bash
# Send a WAV chunk (replace path with any short WAV file)
curl -s -X POST http://localhost:8000/api/transcribe-chunk \
  -H "Authorization: Bearer $TOKEN" \
  -F "call_id=$CALL_ID" \
  -F "audio=@/tmp/sample.wav" \
  -F "lang_hint=uz" | python -m json.tool
```

Expected response shape:
```json
{
  "call_id": "...",
  "events": [
    {"type": "transcript", "text": "...", "speaker": "agent"},
    {"type": "suggestion", "text": "..."},
    {"type": "sentiment", "label": "neutral", "score": 0}
  ]
}
```

**End the call (triggers summary):**
```bash
curl -s -X POST http://localhost:8000/api/calls/$CALL_ID/end \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
# expect: summary_text field populated
```

---

## 8. Demo scenarios (no WAV file needed)

```bash
# List scenarios
curl -s http://localhost:8000/api/demo/scenarios \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

# Play scenario 1 — streams NDJSON events
curl -s http://localhost:8000/api/demo/play/1 \
  -H "Authorization: Bearer $TOKEN"
```

This exercises the complete pipeline (STT → guardrail → RAG → LLM) using pre-recorded audio, without needing a browser or WebRTC.

---

## 9. Reindex and delete

```bash
# Reindex — re-embeds the file, rebuilds BM25 + pgvector
curl -s -X POST http://localhost:8000/api/admin/documents/$DOC_ID/reindex \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
# expect: status switches back to "indexing" then "ready"

# Delete — removes file, chunks (pgvector cascade), rebuilds BM25
curl -s -X DELETE http://localhost:8000/api/admin/documents/$DOC_ID \
  -H "Authorization: Bearer $TOKEN" -w "%{http_code}\n"
# expect: 204

# Confirm gone
curl -s http://localhost:8000/api/admin/documents/$DOC_ID \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
# expect: 404
```

---

## 10. Automated test suite

```bash
make test
# expect: 68+ passed, 0 failed
```

Run a single file:
```bash
make test-file F=tests/test_rate_limit.py
make test-file F=tests/test_auth.py
```

---

## Checklist

| # | Check | Pass |
|---|-------|------|
| 2 | `/healthz` → `db_ok: true, models_loaded: true` | ☐ |
| 3 | Login returns `access_token` | ☐ |
| 3 | 6th login attempt → 429 | ☐ |
| 4 | Admin panel loads at `/admin` with Basic Auth | ☐ |
| 4 | TXT upload → status goes `indexing → ready` | ☐ |
| 5 | `.exe` upload rejected with 400 | ☐ |
| 6 | Call created, listed, fetched | ☐ |
| 7 | `transcribe-chunk` returns `transcript` + `suggestion` events | ☐ |
| 8 | Demo scenario streams events without error | ☐ |
| 9 | Delete → 204, then GET → 404 | ☐ |
| 10 | `make test` → 0 failures | ☐ |

All boxes checked → backend is ready for frontend work.
