import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal
from app.logging_config import RequestIdMiddleware, setup_logging
from app.routers import auth, admin_users

setup_logging(settings.LOG_LEVEL)
log = structlog.get_logger()

app = FastAPI(title=settings.APP_NAME)

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


@app.get("/healthz")
async def healthz():
    db_ok = False
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        pass
    return {"status": "ok", "db_ok": db_ok}
