from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import uuid4

from sqlalchemy import String, Date, DateTime, Boolean, Integer, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    client_id: Mapped[str] = mapped_column(String, ForeignKey("clients.client_id"), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    registration_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actual_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_primary_phone: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Account(Base):
    __tablename__ = "accounts"

    account_id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    client_id: Mapped[str] = mapped_column(String, ForeignKey("clients.client_id"), nullable=False)
    account_number: Mapped[str] = mapped_column(String(30), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="UZS")
    balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    opened_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(String, ForeignKey("accounts.account_id"), nullable=False)
    # HUMO / UZCARD / VISA
    card_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Stored as "**** **** **** 1234" — full PAN never persisted
    card_number_masked: Mapped[str] = mapped_column(String(25), nullable=False)
    expiry_date: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(String, ForeignKey("accounts.account_id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # debit / credit
    tx_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    merchant_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class Loan(Base):
    __tablename__ = "loans"

    loan_id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    client_id: Mapped[str] = mapped_column(String, ForeignKey("clients.client_id"), nullable=False)
    loan_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    interest_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    opened_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    remaining_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")  # active/closed/overdue


class LoanPayment(Base):
    __tablename__ = "loan_payments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    loan_id: Mapped[str] = mapped_column(String, ForeignKey("loans.loan_id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_late: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Deposit(Base):
    __tablename__ = "deposits"

    deposit_id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    client_id: Mapped[str] = mapped_column(String, ForeignKey("clients.client_id"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    interest_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    opened_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    matures_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")


class RiskProfile(Base):
    __tablename__ = "risk_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    client_id: Mapped[str] = mapped_column(String, ForeignKey("clients.client_id"), nullable=False, unique=True)
    credit_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    credit_history_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    debt_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    risk_category: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")  # low/medium/high
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ClientHistory(Base):
    __tablename__ = "client_history"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    client_id: Mapped[str] = mapped_column(String, ForeignKey("clients.client_id"), nullable=False)
    join_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    branch_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    products_used: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
