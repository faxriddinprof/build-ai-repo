from datetime import datetime
from typing import Optional
from uuid import uuid4
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    agent_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    customer_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    customer_passport: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    customer_region: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    intake_confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    transcript: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    summary: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    compliance_status: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
