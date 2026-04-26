from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_role
from app.models.call import Call
from app.models.user import User
from app.services import call_pipeline
from app.schemas.call import CallHistoryItem

router = APIRouter(prefix="/api/supervisor")

_PII_FIELDS = {"customer_passport"}


def _scrub(entry: dict) -> dict:
    return {k: v for k, v in entry.items() if k not in _PII_FIELDS}


@router.get("/active")
async def active_calls(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("supervisor", "admin")),
):
    """Snapshot of in-flight calls keyed by call_id — seeds supervisor dashboard before WS catches up."""
    # In-process state from call_pipeline (same process, workers=1)
    result = []
    now = datetime.utcnow()
    res = await db.execute(
        select(Call).where(Call.ended_at.is_(None)).order_by(Call.started_at.desc())
    )
    calls = res.scalars().all()
    for call in calls:
        state = call_pipeline._call_state.get(call.id, {})
        duration = int((now - call.started_at).total_seconds())
        result.append({
            "call_id": call.id,
            "agent_id": call.agent_id,
            "customer_phone": call.customer_phone,
            "customer_region": call.customer_region,
            "duration": duration,
            "sentiment": state.get("last_sentiment"),
            "top_objection": state.get("objection_hits", [None])[-1] if state.get("objection_hits") else None,
            "started_at": call.started_at.isoformat(),
        })
    return result


@router.get("/calls/{call_id}/transcript")
async def call_transcript(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("supervisor", "admin")),
):
    """Live (scrubbed) transcript — reads in-process state for active calls, DB for ended calls."""
    state = call_pipeline._call_state.get(call_id)
    if state:
        return [_scrub(e) for e in state.get("transcripts", [])]

    res = await db.execute(select(Call).where(Call.id == call_id))
    call = res.scalar_one_or_none()
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    return [_scrub(e) for e in (call.transcript or [])]


@router.get("/history", response_model=list[CallHistoryItem])
async def call_history(
    outcome: Optional[str] = None,
    agent_id: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("supervisor", "admin")),
):
    stmt = (
        select(Call, User.email)
        .join(User, Call.agent_id == User.id)
        .where(Call.ended_at.isnot(None))
        .order_by(Call.ended_at.desc())
        .limit(limit)
    )
    if outcome:
        stmt = stmt.where(Call.outcome == outcome)
    if agent_id:
        stmt = stmt.where(Call.agent_id == agent_id)

    res = await db.execute(stmt)
    rows = res.all()

    items = []
    for call, agent_email in rows:
        duration = 0
        if call.ended_at and call.started_at:
            duration = int((call.ended_at - call.started_at).total_seconds())
        last_sentiment = None
        if call.sentiment_journey:
            last_sentiment = call.sentiment_journey[-1]
        ended_at_str = call.ended_at.strftime("Bugun · %H:%M") if call.ended_at else None
        items.append(CallHistoryItem(
            id=call.id,
            name=agent_email.split("@")[0],
            agent_id=call.agent_id,
            duration=duration,
            sentiment=last_sentiment,
            top_objection=call.top_objection,
            ended_at=ended_at_str,
            outcome=call.outcome,
            compliance_score=call.compliance_score,
        ))
    return items
