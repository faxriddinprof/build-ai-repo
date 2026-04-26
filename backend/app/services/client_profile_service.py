"""
Client profile service.

Loads banking data for a client, formats a PII-safe summary for LLM
prompts (≤300 tokens), and derives simple product pitch candidates.
"""

from datetime import date
from typing import Optional

import structlog
from app.models.banking import (
    Account,
    ClientHistory,
    Contact,
    Deposit,
    Loan,
    RiskProfile,
)
from app.models.client import Client
from app.schemas.client import ClientProfile, ProductPitch
from app.utils.text import mask_phone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger()


async def get_profile(db: AsyncSession, client_id: str) -> Optional[ClientProfile]:
    """Load and return a PII-safe ClientProfile for the given client_id."""
    res = await db.execute(select(Client).where(Client.client_id == client_id))
    client = res.scalar_one_or_none()
    if client is None:
        return None

    # Primary contact for masked phone + region
    c_res = await db.execute(
        select(Contact)
        .where(Contact.client_id == client_id, Contact.is_primary_phone == True)
        .limit(1)
    )
    contact = c_res.scalar_one_or_none()
    if contact is None:
        c_res2 = await db.execute(
            select(Contact).where(Contact.client_id == client_id).limit(1)
        )
        contact = c_res2.scalar_one_or_none()

    # Accounts
    acc_res = await db.execute(select(Account).where(Account.client_id == client_id))
    accounts = acc_res.scalars().all()

    # Loans
    loan_res = await db.execute(select(Loan).where(Loan.client_id == client_id))
    loans = loan_res.scalars().all()

    # Deposits
    dep_res = await db.execute(select(Deposit).where(Deposit.client_id == client_id))
    deposits = dep_res.scalars().all()

    # Risk profile
    rp_res = await db.execute(
        select(RiskProfile).where(RiskProfile.client_id == client_id).limit(1)
    )
    risk = rp_res.scalar_one_or_none()

    # Client history
    ch_res = await db.execute(
        select(ClientHistory).where(ClientHistory.client_id == client_id).limit(1)
    )
    history = ch_res.scalar_one_or_none()

    # Derived fields
    last_initial = (client.last_name[0] + ".") if client.last_name else ""
    display_name = f"{client.first_name} {last_initial}".strip()

    age_bucket: Optional[str] = None
    if client.birth_date:
        today = date.today()
        age = (
            today.year
            - client.birth_date.year
            - (
                (today.month, today.day)
                < (client.birth_date.month, client.birth_date.day)
            )
        )
        lower = (age // 10) * 10
        age_bucket = f"{lower}-{lower + 10} yosh"

    has_active_loan = any(l.status == "active" for l in loans)
    loan_overdue = any(l.status == "overdue" for l in loans)
    has_deposit = len(deposits) > 0
    products_used: list[str] = list(history.products_used or []) if history else []
    join_year = history.join_date.year if (history and history.join_date) else None

    region = (contact.region if contact else None) or client.citizenship

    masked = mask_phone(contact.phone) if (contact and contact.phone) else None

    return ClientProfile(
        client_id=client_id,
        display_name=display_name,
        age_bucket=age_bucket,
        region=region,
        risk_category=risk.risk_category if risk else "medium",
        credit_score=risk.credit_score if risk else None,
        has_active_loan=has_active_loan,
        has_deposit=has_deposit,
        account_count=len(accounts),
        loan_overdue=loan_overdue,
        products_used=products_used,
        join_year=join_year,
        masked_phone=masked,
    )


def format_for_llm(profile: ClientProfile) -> str:
    """
    Convert ClientProfile → compact Uzbek text ≤300 tokens.
    No PII: no passport, no pinfl, no full phone.
    """
    lines = [f"Mijoz: {profile.display_name}"]
    if profile.age_bucket:
        lines.append(f"Yosh: {profile.age_bucket}")
    if profile.region:
        lines.append(f"Viloyat: {profile.region}")
    lines.append(f"Risk darajasi: {profile.risk_category}")
    if profile.credit_score:
        lines.append(f"Kredit reytingi: {profile.credit_score}")
    lines.append(f"Hisoblar soni: {profile.account_count}")
    if profile.has_active_loan:
        lines.append("Faol kredit: bor")
        if profile.loan_overdue:
            lines.append("Kredit holati: muddati o'tgan")
    else:
        lines.append("Faol kredit: yo'q")
    _yoq = "yo'q"
    lines.append(f"Depozit: {'bor' if profile.has_deposit else _yoq}")
    if profile.products_used:
        lines.append(f"Foydalanilgan mahsulotlar: {', '.join(profile.products_used)}")
    if profile.join_year:
        lines.append(f"Bank mijozi bo'lgan yil: {profile.join_year}")
    return "\n".join(lines)


def recommendations(profile: ClientProfile) -> list[ProductPitch]:
    """
    Rule-based product pitch candidates from client profile.
    Returns up to 2 ProductPitch objects for LLM context.
    """
    pitches: list[ProductPitch] = []

    # Overdue loan → restructuring
    if profile.loan_overdue:
        pitches.append(
            ProductPitch(
                product="Kreditni qayta tuzish",
                rationale_uz="Mijozda muddati o'tgan kredit bor — qayta tuzish taklif qilish mumkin.",
                confidence=0.85,
            )
        )

    # No loan, medium/low risk → new loan pitch
    if not profile.has_active_loan and profile.risk_category in ("low", "medium"):
        pitches.append(
            ProductPitch(
                product="Iste'mol krediti",
                rationale_uz="Mijozda faol kredit yo'q va risk darajasi maqbul — kredit taklif qilish mumkin.",
                confidence=0.75,
            )
        )

    # No deposit → deposit pitch
    if not profile.has_deposit:
        pitches.append(
            ProductPitch(
                product="Muddatli depozit",
                rationale_uz="Mijozda depozit mavjud emas — jamg'arma mahsulotini taklif qilish mumkin.",
                confidence=0.70,
            )
        )

    # High risk + active loan → insurance
    if profile.has_active_loan and profile.risk_category == "high":
        pitches.append(
            ProductPitch(
                product="Kredit sug'urtasi",
                rationale_uz="Yuqori risk darajasidagi mijozga kredit sug'urtasi taklif qilish mumkin.",
                confidence=0.65,
            )
        )

    return pitches[:2]
