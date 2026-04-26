from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CallCreate(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    client_id: Optional[str] = None


class CallResponse(BaseModel):
    id: str
    agent_id: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_region: Optional[str] = None
    intake_confirmed_at: Optional[datetime] = None
    transcript: Optional[list] = None
    summary: Optional[dict] = None
    compliance_status: Optional[dict] = None
    outcome: Optional[str] = None
    compliance_score: Optional[int] = None
    top_objection: Optional[str] = None
    sentiment_journey: Optional[list] = None

    class Config:
        from_attributes = True


class IntakeUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_passport: Optional[str] = None
    customer_region: Optional[str] = None


class CallEndResponse(BaseModel):
    call_id: str
    summary: Optional[dict] = None


class CallHistoryItem(BaseModel):
    id: str
    name: str
    agent_id: str
    duration: int
    sentiment: Optional[str] = None
    top_objection: Optional[str] = None
    ended_at: Optional[str] = None
    outcome: Optional[str] = None
    compliance_score: Optional[int] = None
