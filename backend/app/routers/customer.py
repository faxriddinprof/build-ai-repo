from typing import Optional

from app.config import settings
from app.deps import get_db
from app.models.call import Call
from app.models.call_queue import CallQueueEntry
from app.models.user import User
from app.services import queue_service
from app.services.auth_service import create_customer_token, decode_token
from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/customer")


class InitiateRequest(BaseModel):
    masked_phone: str
    region: Optional[str] = None
    topic: Optional[str] = None
    priority: str = "normal"
    client_id: Optional[str] = None


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
        client_id=body.client_id,
    )
    # Issue final token with real queue_id
    token, jti = create_customer_token(entry.id)
    entry.customer_token_jti = jti
    await db.commit()

    from app.services import event_bus

    await event_bus.publish(
        "supervisor",
        {
            "type": "queue_added",
            "queue_id": entry.id,
            "masked_phone": body.masked_phone,
            "region": body.region,
            "topic": body.topic,
            "priority": body.priority,
        },
    )

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
        call_ended = False
        linked_call_id = None
        if entry.accepted_by:
            u_res = await db.execute(select(User).where(User.id == entry.accepted_by))
            u = u_res.scalar_one_or_none()
            if u:
                operator_name = u.email.split("@")[0]
            if entry.accepted_at:
                c_res = await db.execute(
                    select(Call)
                    .where(Call.agent_id == entry.accepted_by)
                    .where(Call.started_at >= entry.accepted_at)
                    .order_by(Call.started_at.asc())
                    .limit(1)
                )
                linked_call = c_res.scalar_one_or_none()
                if linked_call:
                    linked_call_id = linked_call.id
                    if linked_call.ended_at is not None:
                        call_ended = True
        return {
            "status": "accepted",
            "queue_id": queue_id,
            "operator": operator_name,
            "ice_servers": [{"urls": s} for s in settings.STUN_SERVERS],
            "call_ended": call_ended,
            "call_id": linked_call_id,
        }

    return {"status": entry.status, "queue_id": queue_id}


async def _resolve_call(db: AsyncSession, token: str) -> Optional[Call]:
    """Decode customer token and return the active call for that queue entry."""
    try:
        payload = decode_token(token)
        sub = payload.get("sub", "")
        if not sub.startswith("queue:"):
            return None
        queue_id = sub.split(":", 1)[1]
    except JWTError:
        return None
    res = await db.execute(select(CallQueueEntry).where(CallQueueEntry.id == queue_id))
    entry = res.scalar_one_or_none()
    if entry is None or entry.status != "accepted" or not entry.accepted_by or not entry.accepted_at:
        return None
    c_res = await db.execute(
        select(Call)
        .where(Call.agent_id == entry.accepted_by)
        .where(Call.started_at >= entry.accepted_at)
        .where(Call.ended_at.is_(None))
        .order_by(Call.started_at.asc())
        .limit(1)
    )
    return c_res.scalar_one_or_none()


@router.post("/call/{token}/end")
async def customer_end_call(token: str, db: AsyncSession = Depends(get_db)):
    """Called when the customer clicks end — finalizes the call on the backend."""
    call = await _resolve_call(db, token)
    if call is None:
        return {"status": "ok"}  # already ended or not found — treat as no-op
    from app.services import call_pipeline
    await call_pipeline.finalize_call(call.id)
    return {"status": "ok", "call_id": call.id}
