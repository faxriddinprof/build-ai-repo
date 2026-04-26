import asyncio
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text
import litellm

litellm.suppress_debug_info = True

from app.config import settings
from app.database import AsyncSessionLocal
from app.logging_config import RequestIdMiddleware, setup_logging
from app.middleware.rate_limit import limiter, _rate_limit_exceeded_handler
from app.routers import auth, admin_users, calls
from app.routers.signaling_ws import router as signaling_ws_router
from app.routers.supervisor_ws import router as supervisor_ws_router
from app.routers.admin_documents import router as admin_documents_router
from app.routers.demo import router as demo_router
from app.routers.transcribe import router as transcribe_router
from app.routers.queue import router as queue_router
from app.routers.customer import router as customer_router
from app.routers.supervisor_api import router as supervisor_api_router
from app.admin.router import router as admin_panel_router

setup_logging(settings.LOG_LEVEL)
log = structlog.get_logger()

_models_loaded = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _models_loaded
    import subprocess
    log.info("startup.migrate_begin")
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        capture_output=True, text=True, cwd="/app",
    )
    if result.returncode == 0:
        log.info("startup.migrate_done", output=result.stdout.strip())
    else:
        log.error("startup.migrate_failed", stderr=result.stderr.strip())

    from app.services import stt_service, llm_service
    from app.services.compliance_service import load_phrases
    load_phrases()
    log.info("startup.begin")
    try:
        stt_service.load_model()
    except Exception as e:
        log.warning("startup.stt_load_failed", error=str(e))
    try:
        await stt_service.warmup()
    except Exception as e:
        log.warning("startup.stt_warmup_failed", error=str(e))
    try:
        await llm_service.warmup()
    except Exception as e:
        log.warning("startup.llm_warmup_failed", error=str(e))
    for attempt in range(1, 6):
        try:
            from app.services.rag_service import embed
            vec = await embed("salom")
            assert len(vec) == settings.EMBEDDING_DIM, f"embedding dim mismatch: {len(vec)}"
            log.info("startup.embed_warmup_done", dim=len(vec))
            break
        except Exception as e:
            log.warning("startup.embed_warmup_failed", attempt=attempt, error=str(e))
            if attempt < 5:
                await asyncio.sleep(5 * attempt)
    try:
        from app.services.bm25_service import load_or_init
        await load_or_init()
    except Exception as e:
        log.warning("startup.bm25_init_failed", error=str(e))
    _models_loaded = True
    log.info("startup.done")
    yield
    from app.services import webrtc_service
    await webrtc_service.close_all()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(SlowAPIMiddleware)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(admin_users.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_documents_router, prefix="/api/admin", tags=["admin"])
app.include_router(calls.router, prefix="/api/calls", tags=["calls"])
app.include_router(demo_router, prefix="/api/demo", tags=["demo"])
app.include_router(signaling_ws_router, tags=["websocket"])
app.include_router(supervisor_ws_router, tags=["websocket"])
app.include_router(transcribe_router, prefix="/api", tags=["transcribe"])
app.include_router(queue_router, tags=["queue"])
app.include_router(customer_router, tags=["customer"])
app.include_router(supervisor_api_router, tags=["supervisor"])
app.include_router(admin_panel_router, tags=["admin-panel"])

_admin_static_dir = str(__import__("pathlib").Path(__file__).parent / "admin" / "static")
app.mount("/admin/static", StaticFiles(directory=_admin_static_dir), name="admin_static")


@app.get("/healthz")
@limiter.exempt
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
            resp = await client.get(f"{settings.LITELLM_BASE_URL}/health/liveliness")
            ollama_ok = resp.status_code == 200
    except Exception:
        pass

    return {
        "status": "ok",
        "db_ok": db_ok,
        "ollama_ok": ollama_ok,
        "models_loaded": _models_loaded,
    }
