from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db, require_role
from app.models.call import Call
from app.models.user import User
from app.schemas.call import CallCreate, CallEndResponse, CallHistoryItem, CallResponse, IntakeUpdate
from app.utils.text import format_uz_relative_datetime

router = APIRouter()
log = structlog.get_logger()


@router.post("", response_model=CallResponse, status_code=201)
async def create_call(
    body: CallCreate = None,
    db: AsyncSession = Depends(get_db),
    agent: User = Depends(require_role("agent", "admin")),
):
    call = Call(
        agent_id=agent.id,
        started_at=datetime.utcnow(),
        customer_name=body.customer_name if body else None,
        customer_phone=body.customer_phone if body else None,
    )
    db.add(call)
    await db.commit()
    await db.refresh(call)
    log.info("call.created", call_id=call.id, agent_id=agent.id)
    return call


@router.get("", response_model=list[CallResponse])
async def list_calls(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Call).order_by(Call.started_at.desc()).limit(limit)
    if user.role == "agent":
        stmt = stmt.where(Call.agent_id == user.id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/history", response_model=list[CallHistoryItem])
async def get_call_history(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    agent: User = Depends(require_role("agent", "admin")),
):
    """Agent's own post-call history (same shape as supervisor history)."""
    stmt = (
        select(Call)
        .where(Call.agent_id == agent.id)
        .where(Call.ended_at.isnot(None))
        .order_by(Call.ended_at.desc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    calls = res.scalars().all()
    items = []
    for call in calls:
        duration = 0
        if call.ended_at and call.started_at:
            duration = int((call.ended_at - call.started_at).total_seconds())
        last_sentiment = call.sentiment_journey[-1] if call.sentiment_journey else None
        ended_at_str = format_uz_relative_datetime(call.ended_at) if call.ended_at else None
        items.append(CallHistoryItem(
            id=call.id,
            name=agent.email.split("@")[0],
            agentId=call.agent_id,
            duration=duration,
            sentiment=last_sentiment,
            topObjection=call.top_objection,
            endedAt=ended_at_str,
            outcome=call.outcome,
            complianceScore=call.compliance_score,
        ))
    return items


@router.get("/{call_id}", response_model=CallResponse)
async def get_call(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Call).where(Call.id == call_id))
    call = result.scalar_one_or_none()
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    if user.role == "agent" and call.agent_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return call


@router.patch("/{call_id}/intake", response_model=CallResponse)
async def confirm_intake(
    call_id: str,
    body: IntakeUpdate,
    db: AsyncSession = Depends(get_db),
    agent: User = Depends(require_role("agent", "admin")),
):
    result = await db.execute(select(Call).where(Call.id == call_id))
    call = result.scalar_one_or_none()
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.agent_id != agent.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if body.customer_name is not None:
        call.customer_name = body.customer_name
    if body.customer_passport is not None:
        call.customer_passport = body.customer_passport
    if body.customer_region is not None:
        call.customer_region = body.customer_region
    call.intake_confirmed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(call)
    return call


@router.post("/{call_id}/end", response_model=CallEndResponse)
async def end_call(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    agent: User = Depends(require_role("agent", "admin")),
):
    result = await db.execute(select(Call).where(Call.id == call_id))
    call = result.scalar_one_or_none()
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.agent_id != agent.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    from app.services import call_pipeline
    summary_event = await call_pipeline.finalize_call(call_id)
    log.info("call.ended", call_id=call_id)
    result2 = await db.execute(select(Call).where(Call.id == call_id))
    call = result2.scalar_one_or_none()
    return CallEndResponse(call_id=call_id, summary=call.summary if call else {})
