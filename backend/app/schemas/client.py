from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class ProductPitch(BaseModel):
    product: str
    rationale_uz: str
    confidence: float  # 0.0–1.0


class ClientProfile(BaseModel):
    client_id: str
    display_name: str  # "A. Karimov" — first name + last initial
    age_bucket: Optional[str] = None  # "30-40 yosh"
    region: Optional[str] = None
    risk_category: str = "medium"
    credit_score: Optional[int] = None
    has_active_loan: bool = False
    has_deposit: bool = False
    account_count: int = 0
    loan_overdue: bool = False
    products_used: list[str] = []
    join_year: Optional[int] = None
    # Masked phone for display
    masked_phone: Optional[str] = None


class RecommendationEvent(BaseModel):
    type: str = "recommendation"
    call_id: str
    product: str
    rationale_uz: str
    confidence: float


class LiveScriptEvent(BaseModel):
    type: str = "live_script"
    call_id: str
    next_sentence_uz: str  # empty string = no hint
    trigger: Optional[str] = None  # objection label that triggered it
