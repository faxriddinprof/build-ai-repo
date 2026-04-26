"""Client profile and product recommendation endpoints."""

import json
import structlog
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_role
from app.models.banking import Contact
from app.models.client import Client
from app.services import client_profile_service, llm_service
from app.services import sales_rag_service
from app.prompts.sales_uz import SALES_RECOMMENDATION_PROMPT

router = APIRouter(prefix="/api/clients", tags=["clients"])
log = structlog.get_logger()


class DemoClient(BaseModel):
    client_id: str
    display_name: str        # "{first_name} {last_name}"
    region: str              # from contact.region or "Noma'lum"
    risk_category: str       # "low" | "medium" | "high"
    has_loan: bool
    has_deposit: bool


class RecommendationCard(BaseModel):
    product: str
    rationale_uz: str
    confidence: float


class RecommendationsResponse(BaseModel):
    client_id: str
    display_name: str
    recommendations: list[RecommendationCard]


@router.get("/demo", response_model=dict)
async def get_demo_clients(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_role("agent", "admin")),
):
    """Return all clients from the DB for the frontend selector (up to 10)."""
    from app.models.banking import Deposit, Loan, RiskProfile

    res = await db.execute(
        select(Client).where(Client.is_active == True).order_by(Client.first_name).limit(10)
    )
    all_clients = res.scalars().all()

    clients_out: list[DemoClient] = []
    for client in all_clients:
        cid = client.client_id
        try:
            # Region from any contact
            c_res = await db.execute(
                select(Contact).where(Contact.client_id == cid).limit(1)
            )
            contact = c_res.scalar_one_or_none()
            region = (contact.region if contact else None) or "Noma'lum"

            # Risk category
            rp_res = await db.execute(
                select(RiskProfile).where(RiskProfile.client_id == cid).limit(1)
            )
            risk = rp_res.scalar_one_or_none()
            risk_category = (risk.risk_category if risk else None) or "medium"

            # Has active loan
            loan_res = await db.execute(
                select(Loan).where(Loan.client_id == cid, Loan.status == "active").limit(1)
            )
            has_loan = loan_res.scalar_one_or_none() is not None

            # Has deposit
            dep_res = await db.execute(
                select(Deposit).where(Deposit.client_id == cid).limit(1)
            )
            has_deposit = dep_res.scalar_one_or_none() is not None

            clients_out.append(
                DemoClient(
                    client_id=cid,
                    display_name=f"{client.first_name} {client.last_name}",
                    region=region,
                    risk_category=risk_category,
                    has_loan=has_loan,
                    has_deposit=has_deposit,
                )
            )
        except Exception as e:
            log.warning("demo_clients.skip", client_id=cid, error=str(e))

    return {"clients": [c.model_dump() for c in clients_out]}


@router.get("/{client_id}/recommendations", response_model=RecommendationsResponse)
async def get_recommendations(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_role("agent", "admin")),
):
    """Load client profile, run LLM with SALES_RECOMMENDATION_PROMPT, return recommendation cards."""
    profile = await client_profile_service.get_profile(db, client_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Client not found")

    # Load raw Client row for full display name
    res = await db.execute(select(Client).where(Client.client_id == client_id))
    client = res.scalar_one_or_none()
    display_name = (
        f"{client.first_name} {client.last_name}"
        if client
        else profile.display_name
    )

    # Get rule-based pitches
    pitches = client_profile_service.recommendations(profile)
    client_facts = client_profile_service.format_for_llm(profile)
    pitches_text = (
        "\n".join(f"- {p.product}: {p.rationale_uz}" for p in pitches)
        if pitches
        else "Mavjud emas."
    )

    # Get KB context via RAG (use client_facts as retrieval query)
    doc_context = "Mavjud emas."
    try:
        ctx = await sales_rag_service.build_context(
            query=client_facts or "kredit depozit karta",
            client_profile=profile,
            db=db,
        )
        doc_context = ctx.get("doc_context", "Mavjud emas.")
    except Exception as e:
        log.warning("recommendations.rag_error", client_id=client_id, error=str(e))

    # Build prompt and call LLM (single non-streaming call)
    prompt = SALES_RECOMMENDATION_PROMPT.format(
        client_facts=client_facts,
        pitches=pitches_text,
        doc_context=doc_context,
        recent_transcript="Qo'ng'iroq hali boshlanmagan.",
    )

    cards: list[RecommendationCard] = []
    try:
        raw = await llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=256,
            temperature=0.2,
        )
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        cards = [RecommendationCard(**data)]
    except Exception as e:
        log.error(
            "recommendations.llm_error",
            error=str(e),
            client_id=client_id,
        )
        # Fallback to rule-based pitches
        cards = [
            RecommendationCard(
                product=p.product,
                rationale_uz=p.rationale_uz,
                confidence=p.confidence,
            )
            for p in pitches[:3]
        ]

    return RecommendationsResponse(
        client_id=client_id,
        display_name=display_name,
        recommendations=cards,
    )
