from datetime import datetime
from typing import Optional
from uuid import uuid4
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class SuggestionLog(Base):
    __tablename__ = "suggestions_log"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    call_id: Mapped[str] = mapped_column(String, ForeignKey("calls.id"), nullable=False)
    trigger: Mapped[str] = mapped_column(Text, nullable=False)
    suggestion: Mapped[str] = mapped_column(Text, nullable=False)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
