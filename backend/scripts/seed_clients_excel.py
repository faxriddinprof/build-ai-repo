"""
Seed 5 client profiles read from banking_client_database.xlsx.
Idempotent — skips rows where first_name + last_name already exist.

Usage (local):
    python scripts/seed_clients_excel.py --file /path/to/banking_client_database.xlsx

Usage (Docker via Makefile):
    make seed-clients-excel   # copies file then runs this script
"""

import argparse
import asyncio
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
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

# ---------------------------------------------------------------------------
# Banking-data templates cycled across the 5 clients to add variety
# ---------------------------------------------------------------------------
_BANKING_TEMPLATES = [
    {
        "account_balance": Decimal("12_500_000.00"),
        "card_type": "UZCARD",
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
        "products_used": ["Debet karta", "Iste'mol krediti", "Muddatli depozit"],
    },
    {
        "account_balance": Decimal("3_200_000.00"),
        "card_type": "HUMO",
        "loan": None,
        "deposit": None,
        "risk": {
            "credit_score": 590,
            "credit_history_summary": "Kredit tarixi yo'q. Yangi mijoz.",
            "debt_status": "none",
            "risk_category": "medium",
        },
        "products_used": ["Debet karta"],
    },
    {
        "account_balance": Decimal("800_000.00"),
        "card_type": "VISA",
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
        "products_used": ["Debet karta", "Ipoteka krediti"],
    },
    {
        "account_balance": Decimal("7_800_000.00"),
        "card_type": "HUMO",
        "loan": {
            "loan_amount": Decimal("15_000_000.00"),
            "interest_rate": Decimal("20.00"),
            "opened_at": date(2024, 3, 1),
            "due_at": date(2027, 3, 1),
            "remaining_balance": Decimal("12_500_000.00"),
            "status": "active",
        },
        "deposit": None,
        "risk": {
            "credit_score": 655,
            "credit_history_summary": "Bir marta kechikish qayd etilgan, hozir barqaror.",
            "debt_status": "normal",
            "risk_category": "medium",
        },
        "products_used": ["Debet karta", "Iste'mol krediti"],
    },
    {
        "account_balance": Decimal("22_000_000.00"),
        "card_type": "UZCARD",
        "loan": None,
        "deposit": {
            "type": "Jamg'arma depozit",
            "amount": Decimal("10_000_000.00"),
            "interest_rate": Decimal("19.00"),
            "opened_at": date(2023, 9, 1),
            "matures_at": date(2025, 9, 1),
            "status": "active",
        },
        "risk": {
            "credit_score": 760,
            "credit_history_summary": "Kredit tarixi a'lo. Barcha majburiyatlar bajarilgan.",
            "debt_status": "none",
            "risk_category": "low",
        },
        "products_used": ["Debet karta", "Jamg'arma depozit"],
    },
]


# Derive a human-readable city/region from passport issue place
def _region_from_issue_place(place: str) -> str:
    if not place or str(place) == "nan":
        return "Toshkent"
    return str(place).replace(" IIB", "").strip()


def _parse_date(val) -> date | None:
    if val is None or str(val) == "nan":
        return None
    if isinstance(val, date):
        return val
    try:
        return pd.to_datetime(str(val)).date()
    except Exception:
        return None


def _str(val) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return None if s in ("nan", "", "None") else s


async def seed(file_path: str, limit: int = 5) -> None:
    df = pd.read_excel(file_path)
    # Row 0 = type hints, Row 1 = column descriptions → skip both
    data = df.iloc[2:].reset_index(drop=True).head(limit)

    async with AsyncSessionLocal() as db:
        for idx, row in data.iterrows():
            first_name = _str(row.get("first_name"))
            last_name = _str(row.get("last_name"))

            if not first_name or not last_name:
                print(f"Row {idx}: missing name, skipping.")
                continue

            # Idempotency check
            res = await db.execute(
                select(Client).where(
                    Client.first_name == first_name,
                    Client.last_name == last_name,
                )
            )
            if res.scalar_one_or_none():
                print(f"Skipping existing client: {first_name} {last_name}")
                continue

            tpl = _BANKING_TEMPLATES[idx % len(_BANKING_TEMPLATES)]
            client_id = str(uuid4())
            join_date = date(2018 + idx, (idx % 12) + 1, 1)
            region = _region_from_issue_place(row.get("passport_issue_place"))
            gender_raw = _str(row.get("gender")) or "M"
            gender = "male" if gender_raw.upper() == "M" else "female"

            # --- Client ---
            client = Client(
                client_id=client_id,
                first_name=first_name,
                last_name=last_name,
                middle_name=_str(row.get("middle_name")),
                birth_date=_parse_date(row.get("birth_date")),
                gender=gender,
                citizenship=_str(row.get("citizenship")) or "UZ",
                pinfl=_str(row.get("pinfl")),
                passport_number=_str(row.get("passport_number")),
                passport_issue_date=_parse_date(row.get("passport_issue_date")),
                passport_issue_place=_str(row.get("passport_issue_place")),
            )
            db.add(client)
            await db.flush()

            # --- Contact ---
            phone_suffix = f"{10001 + idx:05d}"
            db.add(
                Contact(
                    client_id=client_id,
                    phone=f"+9989{phone_suffix}",
                    email=f"{first_name.lower()}.{last_name.lower()}@example.com",
                    region=region,
                    is_primary_phone=True,
                )
            )

            # --- Account + Card ---
            account_id = str(uuid4())
            account_number = f"20208000100000{(idx + 10):03d}001"
            db.add(
                Account(
                    account_id=account_id,
                    client_id=client_id,
                    account_number=account_number,
                    currency="UZS",
                    balance=tpl["account_balance"],
                    opened_at=join_date,
                    status="active",
                )
            )
            last4 = account_number[-4:]
            db.add(
                Card(
                    account_id=account_id,
                    card_type=tpl["card_type"],
                    card_number_masked=f"**** **** **** {last4}",
                    expiry_date="12/27",
                    status="active",
                )
            )

            # --- Loan ---
            if tpl["loan"]:
                db.add(Loan(client_id=client_id, **tpl["loan"]))

            # --- Deposit ---
            if tpl["deposit"]:
                db.add(Deposit(client_id=client_id, **tpl["deposit"]))

            # --- Risk Profile ---
            db.add(
                RiskProfile(
                    client_id=client_id,
                    updated_at=datetime.utcnow(),
                    **tpl["risk"],
                )
            )

            # --- Client History ---
            db.add(
                ClientHistory(
                    client_id=client_id,
                    join_date=join_date,
                    branch_name=f"{region}, Asosiy filial",
                    products_used=tpl["products_used"],
                )
            )

            print(f"Created client: {first_name} {last_name} ({client_id})")

        await db.commit()
        print("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed clients from Excel")
    parser.add_argument(
        "--file",
        default=os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "uploads",
            "banking_client_database.xlsx",
        ),
        help="Path to banking_client_database.xlsx",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Number of rows to seed (default: 5)",
    )
    args = parser.parse_args()
    asyncio.run(seed(args.file, args.limit))
