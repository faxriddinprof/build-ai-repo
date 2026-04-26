from datetime import datetime
from typing import Optional

import structlog
from app.models.call_queue import CallQueueEntry, SkipLog
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger()

_PRIORITY_ORDER = {"vip": 0, "high": 1, "normal": 2}


async def enqueue(
    db: AsyncSession,
    masked_phone: str,
    region: Optional[str] = None,
    topic: Optional[str] = None,
    priority: str = "normal",
    customer_token_jti: Optional[str] = None,
    client_id: Optional[str] = None,
) -> CallQueueEntry:
    entry = CallQueueEntry(
        masked_phone=masked_phone,
        region=region,
        topic=topic,
        priority=priority,
        customer_token_jti=customer_token_jti,
        client_id=client_id,
        status="pending",
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    log.info(
        "queue.enqueued",
        queue_id=entry.id,
        masked_phone=masked_phone,
        priority=priority,
    )
    return entry


async def accept(
    db: AsyncSession, queue_id: str, agent_id: str
) -> Optional[CallQueueEntry]:
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
    entry.status = "skipped"
    db.add(SkipLog(queue_id=queue_id, agent_id=agent_id, reason=reason, note=note))
    await db.commit()
    # Return next pending entry
    res2 = await db.execute(
        select(CallQueueEntry)
        .where(CallQueueEntry.status == "pending")
        .order_by(CallQueueEntry.queued_at)
    )
    return res2.scalars().first()


async def last_contact_for(
    db: AsyncSession,
    masked_phone: str,
    client_id: Optional[str] = None,
) -> dict:
    from app.models.call import Call

    conditions = [Call.customer_phone == masked_phone]
    if client_id:
        conditions.append(Call.client_id == client_id)

    res = await db.execute(
        select(Call)
        .where(or_(*conditions))
        .where(Call.ended_at.isnot(None))
        .order_by(Call.ended_at.desc())
        .limit(1)
    )
    call = res.scalar_one_or_none()
    if call is None:
        return {"daysAgo": None, "durationSeconds": None}

    days_ago = (datetime.utcnow() - call.ended_at).days
    duration = (
        int((call.ended_at - call.started_at).total_seconds())
        if call.started_at and call.ended_at
        else None
    )
    return {"daysAgo": days_ago, "durationSeconds": duration}
