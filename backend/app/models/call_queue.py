from datetime import datetime
from typing import Optional
from uuid import uuid4

from app.models.base import Base
from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class CallQueueEntry(Base):
    __tablename__ = "call_queue"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid4())
    )
    masked_phone: Mapped[str] = mapped_column(String, nullable=False)
    region: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    topic: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    priority: Mapped[str] = mapped_column(String, nullable=False, default="normal")
    queued_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_contact_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    customer_token_jti: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    accepted_by: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("users.id"), nullable=True
    )
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    client_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("clients.client_id"), nullable=True
    )


class SkipLog(Base):
    __tablename__ = "skip_log"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid4())
    )
    queue_id: Mapped[str] = mapped_column(
        String, ForeignKey("call_queue.id"), nullable=False
    )
    agent_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
