from datetime import datetime
from typing import Optional

from app.deps import get_db, require_role
from app.models.call import Call
from app.models.call_queue import CallQueueEntry
from app.models.user import User
from app.services import event_bus, queue_service
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/queue")

_PRIORITY_SORT = {"vip": 0, "high": 1, "normal": 2}


class SkipRequest(BaseModel):
    reason: str
    note: Optional[str] = None


@router.get("")
async def list_queue(
    db: AsyncSession = Depends(get_db),
    agent: User = Depends(require_role("agent", "supervisor", "admin")),
):
    res = await db.execute(
        select(CallQueueEntry)
        .where(CallQueueEntry.status == "pending")
        .order_by(CallQueueEntry.queued_at)
    )
    entries = res.scalars().all()
    entries_sorted = sorted(
        entries, key=lambda e: (_PRIORITY_SORT.get(e.priority, 2), e.queued_at)
    )
    now = datetime.utcnow()
    result = []
    for e in entries_sorted:
        last_contact = await queue_service.last_contact_for(
            db, e.masked_phone, getattr(e, "client_id", None)
        )
        result.append({
            "id": e.id,
            "maskedPhone": e.masked_phone,
            "region": e.region,
            "topic": e.topic,
            "priority": e.priority,
            "waitTime": int((now - e.queued_at).total_seconds()),
            "status": e.status,
            "lastContact": last_contact,
        })
    return result


@router.post("/{queue_id}/accept")
async def accept_call(
    queue_id: str,
    db: AsyncSession = Depends(get_db),
    agent: User = Depends(require_role("agent", "supervisor", "admin")),
):
    entry = await queue_service.accept(db, queue_id, agent.id)
    if entry is queue_service.BLOCKED_ACTIVE_CALL:
        # Auto-end lingering active calls, then retry accept
        import asyncio
        from app.services import call_pipeline

        active_res = await db.execute(
            select(Call).where(Call.agent_id == agent.id, Call.ended_at.is_(None))
        )
        stale_calls = active_res.scalars().all()
        for stale in stale_calls:
            stale.ended_at = datetime.utcnow()
            stale.outcome = "interrupted"
        if stale_calls:
            await db.commit()
            for stale in stale_calls:
                asyncio.create_task(call_pipeline.finalize_call(stale.id))

        entry = await queue_service.accept(db, queue_id, agent.id)

    if entry is None:
        raise HTTPException(
            status_code=404, detail="Queue entry not found or already accepted"
        )

    # Derive customer_name from client profile when available
    customer_name = None
    client_id = getattr(entry, "client_id", None)
    if client_id:
        try:
            from app.models.client import Client
            cr = await db.execute(select(Client).where(Client.client_id == client_id))
            client = cr.scalar_one_or_none()
            if client:
                customer_name = f"{client.first_name} {client.last_name}"
        except Exception:
            pass

    call = Call(
        agent_id=agent.id,
        customer_phone=entry.masked_phone,
        customer_region=entry.region,
        customer_name=customer_name,
        client_id=client_id,
    )
    db.add(call)
    await db.commit()
    await db.refresh(call)

    await event_bus.publish(
        "supervisor",
        {
            "type": "queue_accepted",
            "queueId": queue_id,
            "callId": call.id,
            "agentId": agent.id,
        },
    )

    return {
        "id": call.id,
        "queueId": queue_id,
        "maskedPhone": entry.masked_phone,
        "customerName": customer_name,
        "clientId": client_id,
    }


@router.post("/{queue_id}/skip")
async def skip_call(
    queue_id: str,
    body: SkipRequest,
    db: AsyncSession = Depends(get_db),
    agent: User = Depends(require_role("agent", "supervisor", "admin")),
):
    next_entry = await queue_service.skip(
        db, queue_id, agent.id, body.reason, body.note
    )
    await event_bus.publish(
        "supervisor",
        {
            "type": "queue_skipped",
            "queueId": queue_id,
            "agentId": agent.id,
            "reason": body.reason,
        },
    )
    if next_entry:
        return {
            "skipped": queue_id,
            "next": {
                "id": next_entry.id,
                "maskedPhone": next_entry.masked_phone,
                "region": next_entry.region,
                "topic": next_entry.topic,
                "priority": next_entry.priority,
            },
        }
    return {"skipped": queue_id, "next": None}
