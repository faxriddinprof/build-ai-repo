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
    return [
        {
            "id": e.id,
            "masked_phone": e.masked_phone,
            "region": e.region,
            "topic": e.topic,
            "priority": e.priority,
            "wait_time": int(
                (__import__("datetime").datetime.utcnow() - e.queued_at).total_seconds()
            ),
            "status": e.status,
        }
        for e in entries_sorted
    ]


@router.post("/{queue_id}/accept")
async def accept_call(
    queue_id: str,
    db: AsyncSession = Depends(get_db),
    agent: User = Depends(require_role("agent", "supervisor", "admin")),
):
    entry = await queue_service.accept(db, queue_id, agent.id)
    if entry is None:
        raise HTTPException(
            status_code=404, detail="Queue entry not found or already accepted"
        )

    # Create the Call row, propagate client_id from queue entry
    call = Call(
        agent_id=agent.id,
        customer_phone=entry.masked_phone,
        customer_region=entry.region,
        client_id=getattr(entry, "client_id", None),
    )
    db.add(call)
    await db.commit()
    await db.refresh(call)

    await event_bus.publish(
        "supervisor",
        {
            "type": "queue_accepted",
            "queue_id": queue_id,
            "call_id": call.id,
            "agent_id": agent.id,
        },
    )

    return {
        "call_id": call.id,
        "queue_id": queue_id,
        "masked_phone": entry.masked_phone,
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
            "queue_id": queue_id,
            "agent_id": agent.id,
            "reason": body.reason,
        },
    )
    if next_entry:
        return {
            "skipped": queue_id,
            "next": {
                "id": next_entry.id,
                "masked_phone": next_entry.masked_phone,
                "region": next_entry.region,
                "topic": next_entry.topic,
                "priority": next_entry.priority,
            },
        }
    return {"skipped": queue_id, "next": None}
