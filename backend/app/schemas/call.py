from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class CallCreate(BaseModel):
    pass


class CallResponse(BaseModel):
    id: str
    agent_id: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    customer_name: Optional[str] = None
    customer_region: Optional[str] = None
    intake_confirmed_at: Optional[datetime] = None
    transcript: Optional[list] = None
    summary: Optional[dict] = None
    compliance_status: Optional[dict] = None

    class Config:
        from_attributes = True


class IntakeUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_passport: Optional[str] = None
    customer_region: Optional[str] = None


class CallEndResponse(BaseModel):
    call_id: str
    summary: Optional[dict] = None
