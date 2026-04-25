import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal
from app.logging_config import RequestIdMiddleware, setup_logging
from app.routers import auth, admin_users, calls
from app.routers.audio_ws import router as audio_ws_router
from app.routers.supervisor_ws import router as supervisor_ws_router
from app.routers.admin_documents import router as admin_documents_router
from app.routers.demo import router as demo_router

setup_logging(settings.LOG_LEVEL)
log = structlog.get_logger()

_models_loaded = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _models_loaded
    from app.services import stt_service, llm_service
    from app.services.compliance_service import load_phrases
    load_phrases()
    log.info("startup.begin")
    stt_service.load_model()
    await stt_service.warmup()
    await llm_service.warmup()
    try:
        from app.services.rag_service import embed
        vec = await embed("salom")
        assert len(vec) == settings.EMBEDDING_DIM, f"embedding dim mismatch: {len(vec)}"
        log.info("startup.embed_warmup_done", dim=len(vec))
    except Exception as e:
        log.warning("startup.embed_warmup_failed", error=str(e))
    _models_loaded = True
    log.info("startup.done")
    yield


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIdMiddleware)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(admin_users.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_documents_router, prefix="/api/admin", tags=["admin"])
app.include_router(calls.router, prefix="/api/calls", tags=["calls"])
app.include_router(demo_router, prefix="/api/demo", tags=["demo"])
app.include_router(audio_ws_router, tags=["websocket"])
app.include_router(supervisor_ws_router, tags=["websocket"])


@app.get("/healthz")
async def healthz():
    db_ok = False
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        pass

    ollama_ok = False
    try:
        import httpx
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.LITELLM_BASE_URL}/health")
            ollama_ok = resp.status_code == 200
    except Exception:
        pass

    return {
        "status": "ok",
        "db_ok": db_ok,
        "ollama_ok": ollama_ok,
        "models_loaded": _models_loaded,
    }
