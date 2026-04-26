from datetime import datetime
from typing import Optional
from uuid import uuid4

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call_queue import CallQueueEntry, SkipLog

log = structlog.get_logger()

_PRIORITY_ORDER = {"vip": 0, "high": 1, "normal": 2}


async def enqueue(
    db: AsyncSession,
    masked_phone: str,
    region: Optional[str] = None,
    topic: Optional[str] = None,
    priority: str = "normal",
    customer_token_jti: Optional[str] = None,
) -> CallQueueEntry:
    entry = CallQueueEntry(
        masked_phone=masked_phone,
        region=region,
        topic=topic,
        priority=priority,
        customer_token_jti=customer_token_jti,
        status="pending",
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    log.info("queue.enqueued", queue_id=entry.id, masked_phone=masked_phone, priority=priority)
    return entry


async def accept(db: AsyncSession, queue_id: str, agent_id: str) -> Optional[CallQueueEntry]:
    res = await db.execute(select(CallQueueEntry).where(CallQueueEntry.id == queue_id))
    entry = res.scalar_one_or_none()
    if entry is None or entry.status != "pending":
        return None
    entry.status = "accepted"
    entry.accepted_by = agent_id
    entry.accepted_at = datetime.utcnow()
    await db.commit()
    await db.refresh(entry)
    log.info("queue.accepted", queue_id=queue_id, agent_id=agent_id)
    return entry


async def skip(
    db: AsyncSession,
    queue_id: str,
    agent_id: str,
    reason: str,
    note: Optional[str] = None,
) -> Optional[CallQueueEntry]:
    res = await db.execute(select(CallQueueEntry).where(CallQueueEntry.id == queue_id))
    entry = res.scalar_one_or_none()
    if entry is None:
        return None
    db.add(SkipLog(queue_id=queue_id, agent_id=agent_id, reason=reason, note=note))
    await db.commit()
    # Return next pending entry
    res2 = await db.execute(
        select(CallQueueEntry)
        .where(CallQueueEntry.status == "pending")
        .order_by(CallQueueEntry.queued_at)
    )
    return res2.scalars().first()


def last_contact_for(masked_phone: str) -> dict:
    # Stub — real implementation would query a customer history table
    return {"days": None, "last_duration": None}
