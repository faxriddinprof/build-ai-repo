from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_db
from app.models.call_queue import CallQueueEntry
from app.models.user import User
from app.services import queue_service
from app.services.auth_service import create_customer_token, decode_token

router = APIRouter(prefix="/api/customer")


class InitiateRequest(BaseModel):
    masked_phone: str
    region: Optional[str] = None
    topic: Optional[str] = None
    priority: str = "normal"


@router.post("/call/initiate")
async def initiate_call(body: InitiateRequest, db: AsyncSession = Depends(get_db)):
    token, jti = create_customer_token("temp")
    entry = await queue_service.enqueue(
        db,
        masked_phone=body.masked_phone,
        region=body.region,
        topic=body.topic,
        priority=body.priority,
        customer_token_jti=jti,
    )
    # Issue final token with real queue_id
    token, jti = create_customer_token(entry.id)
    entry.customer_token_jti = jti
    await db.commit()

    from app.services import event_bus
    await event_bus.publish("supervisor", {
        "type": "queue_added",
        "queue_id": entry.id,
        "masked_phone": body.masked_phone,
        "region": body.region,
        "topic": body.topic,
        "priority": body.priority,
    })

    return {
        "queue_id": entry.id,
        "customer_token": token,
        "status": "pending",
    }


@router.get("/call/{token}/status")
async def call_status(token: str, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(token)
        sub = payload.get("sub", "")
        if not sub.startswith("queue:"):
            raise HTTPException(status_code=401, detail="Invalid token")
        queue_id = sub.split(":", 1)[1]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    res = await db.execute(select(CallQueueEntry).where(CallQueueEntry.id == queue_id))
    entry = res.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    if entry.status == "accepted":
        operator_name = None
        if entry.accepted_by:
            u_res = await db.execute(select(User).where(User.id == entry.accepted_by))
            u = u_res.scalar_one_or_none()
            if u:
                operator_name = u.email.split("@")[0]
        return {
            "status": "accepted",
            "queue_id": queue_id,
            "operator": operator_name,
            "ice_servers": [{"urls": s} for s in settings.STUN_SERVERS],
        }

    return {"status": entry.status, "queue_id": queue_id}
