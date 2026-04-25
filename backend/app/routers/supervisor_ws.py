import json

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.user import User
from app.services.auth_service import decode_token
from app.services import event_bus

router = APIRouter()
log = structlog.get_logger()

_SCRUB_KEYS = {"customer_passport"}


def _scrub(event: dict) -> dict:
    return {k: v for k, v in event.items() if k not in _SCRUB_KEYS}


async def _authenticate(token: str) -> bool:
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
    except JWTError:
        return False

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    return user is not None and user.is_active and user.role in ("supervisor", "admin")


@router.websocket("/ws/supervisor")
async def supervisor_ws(websocket: WebSocket):
    token = websocket.query_params.get("token", "")
    if not await _authenticate(token):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    log.info("ws.supervisor.connected")

    q = event_bus.subscribe("supervisor")
    try:
        while True:
            event = await q.get()
            scrubbed = _scrub(event)
            try:
                await websocket.send_text(json.dumps(scrubbed))
            except Exception:
                break
    except WebSocketDisconnect:
        log.info("ws.supervisor.disconnected")
    finally:
        event_bus.unsubscribe("supervisor", q)
