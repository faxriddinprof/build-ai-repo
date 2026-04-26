"""
Seed 3 demo client profiles for hackathon demo.
Idempotent — checks by first_name+last_name before inserting.

Clients:
  1. Jasur Toshmatov — Toshkent, low risk, active loan + deposit
  2. Nilufar Xasanova — Samarqand, medium risk, no loan, no deposit
  3. Bobur Rahimov   — Andijon, high risk, overdue loan
"""

import asyncio
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal
from app.models.banking import (
    Account,
    Card,
    ClientHistory,
    Contact,
    Deposit,
    Loan,
    RiskProfile,
)
from app.models.client import Client
from sqlalchemy import select

_CLIENTS = [
    {
        "client": {
            "first_name": "Jasur",
            "last_name": "Toshmatov",
            "middle_name": "Aliyevich",
            "birth_date": date(1988, 5, 14),
            "gender": "male",
            "citizenship": "UZ",
        },
        "contact": {
            "phone": "+998901234567",
            "email": "jasur.toshmatov@example.com",
            "region": "Toshkent",
            "is_primary_phone": True,
        },
        "account": {
            "account_number": "20208000100000001001",
            "currency": "UZS",
            "balance": Decimal("12_500_000.00"),
            "opened_at": date(2019, 3, 1),
            "status": "active",
        },
        "card": {
            "card_type": "UZCARD",
            "card_number_masked": "**** **** **** 1001",
            "expiry_date": "12/27",
            "status": "active",
        },
        "loan": {
            "loan_amount": Decimal("30_000_000.00"),
            "interest_rate": Decimal("22.00"),
            "opened_at": date(2023, 6, 1),
            "due_at": date(2026, 6, 1),
            "remaining_balance": Decimal("18_000_000.00"),
            "status": "active",
        },
        "deposit": {
            "type": "Muddatli depozit",
            "amount": Decimal("5_000_000.00"),
            "interest_rate": Decimal("18.00"),
            "opened_at": date(2024, 1, 15),
            "matures_at": date(2025, 1, 15),
            "status": "active",
        },
        "risk": {
            "credit_score": 720,
            "credit_history_summary": "Barcha to'lovlar o'z vaqtida amalga oshirilgan.",
            "debt_status": "normal",
            "risk_category": "low",
        },
        "history": {
            "join_date": date(2019, 3, 1),
            "branch_name": "Toshkent, Yunusobod filiali",
            "products_used": ["Debet karta", "Iste'mol krediti", "Muddatli depozit"],
        },
    },
    {
        "client": {
            "first_name": "Nilufar",
            "last_name": "Xasanova",
            "middle_name": "Bekmurodovna",
            "birth_date": date(1995, 11, 22),
            "gender": "female",
            "citizenship": "UZ",
        },
        "contact": {
            "phone": "+998935556677",
            "email": "nilufar.xasanova@example.com",
            "region": "Samarqand",
            "is_primary_phone": True,
        },
        "account": {
            "account_number": "20208000100000002001",
            "currency": "UZS",
            "balance": Decimal("3_200_000.00"),
            "opened_at": date(2021, 7, 10),
            "status": "active",
        },
        "card": {
            "card_type": "HUMO",
            "card_number_masked": "**** **** **** 2001",
            "expiry_date": "09/26",
            "status": "active",
        },
        "loan": None,
        "deposit": None,
        "risk": {
            "credit_score": 590,
            "credit_history_summary": "Kredit tarixi yo'q. Yangi mijoz.",
            "debt_status": "none",
            "risk_category": "medium",
        },
        "history": {
            "join_date": date(2021, 7, 10),
            "branch_name": "Samarqand, Markaz filiali",
            "products_used": ["Debet karta"],
        },
    },
    {
        "client": {
            "first_name": "Bobur",
            "last_name": "Rahimov",
            "middle_name": "Hamidovich",
            "birth_date": date(1980, 2, 8),
            "gender": "male",
            "citizenship": "UZ",
        },
        "contact": {
            "phone": "+998917778899",
            "email": "bobur.rahimov@example.com",
            "region": "Andijon",
            "is_primary_phone": True,
        },
        "account": {
            "account_number": "20208000100000003001",
            "currency": "UZS",
            "balance": Decimal("800_000.00"),
            "opened_at": date(2017, 4, 5),
            "status": "active",
        },
        "card": {
            "card_type": "VISA",
            "card_number_masked": "**** **** **** 3001",
            "expiry_date": "03/25",
            "status": "active",
        },
        "loan": {
            "loan_amount": Decimal("50_000_000.00"),
            "interest_rate": Decimal("25.00"),
            "opened_at": date(2022, 1, 15),
            "due_at": date(2025, 1, 15),
            "remaining_balance": Decimal("35_000_000.00"),
            "status": "overdue",
        },
        "deposit": None,
        "risk": {
            "credit_score": 420,
            "credit_history_summary": "Bir nechta kechiktirilgan to'lovlar qayd etilgan.",
            "debt_status": "overdue",
            "risk_category": "high",
        },
        "history": {
            "join_date": date(2017, 4, 5),
            "branch_name": "Andijon, Asosiy filial",
            "products_used": ["Debet karta", "Ipoteka krediti"],
        },
    },
]


async def seed():
    async with AsyncSessionLocal() as db:
        for spec in _CLIENTS:
            c = spec["client"]
            # Idempotent: skip if already exists
            res = await db.execute(
                select(Client).where(
                    Client.first_name == c["first_name"],
                    Client.last_name == c["last_name"],
                )
            )
            existing = res.scalar_one_or_none()
            if existing:
                print(f"Skipping existing client: {c['first_name']} {c['last_name']}")
                continue

            client_id = str(uuid4())
            client = Client(client_id=client_id, **c)
            db.add(client)
            await db.flush()

            # Contact
            db.add(Contact(client_id=client_id, **spec["contact"]))

            # Account + Card
            account_id = str(uuid4())
            db.add(
                Account(account_id=account_id, client_id=client_id, **spec["account"])
            )
            db.add(Card(account_id=account_id, **spec["card"]))

            # Loan
            if spec["loan"]:
                db.add(Loan(client_id=client_id, **spec["loan"]))

            # Deposit
            if spec["deposit"]:
                db.add(Deposit(client_id=client_id, **spec["deposit"]))

            # Risk profile
            db.add(
                RiskProfile(
                    client_id=client_id,
                    updated_at=datetime.utcnow(),
                    **spec["risk"],
                )
            )

            # Client history
            db.add(ClientHistory(client_id=client_id, **spec["history"]))

            print(f"Created client: {c['first_name']} {c['last_name']} ({client_id})")

        await db.commit()
        print("Done.")


if __name__ == "__main__":
    asyncio.run(seed())
