from datetime import date
from typing import Optional
from uuid import uuid4

from sqlalchemy import String, Date, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Client(Base):
    __tablename__ = "clients"

    client_id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid4())
    )
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    last_name: Mapped[str] = mapped_column(String, nullable=False)
    middle_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    citizenship: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # PII — never sent to LLM
    pinfl: Mapped[Optional[str]] = mapped_column(String(14), nullable=True)
    passport_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    passport_issue_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    passport_issue_place: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
