"""Expire stale pending queue entries and close ghost active calls. Idempotent."""
import asyncio
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import update
from app.database import AsyncSessionLocal
from app.models.call_queue import CallQueueEntry
from app.models.call import Call


async def clean():
    async with AsyncSessionLocal() as db:
        r1 = await db.execute(
            update(CallQueueEntry)
            .where(CallQueueEntry.status == "pending")
            .values(status="expired")
        )
        r2 = await db.execute(
            update(Call)
            .where(Call.ended_at.is_(None))
            .values(ended_at=datetime.utcnow(), outcome="failed")
        )
        await db.commit()
        print(f"Expired  {r1.rowcount} stale pending queue entries")
        print(f"Closed   {r2.rowcount} ghost active calls")


if __name__ == "__main__":
    asyncio.run(clean())
