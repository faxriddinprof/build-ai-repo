"""Create or update admin, supervisor, and agent seed users. Idempotent."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User
from app.services.auth_service import hash_password


SEED_USERS = [
    {"email": settings.ADMIN_EMAIL,      "password": settings.ADMIN_PASSWORD,      "role": "admin"},
    {"email": settings.SUPERVISOR_EMAIL, "password": settings.SUPERVISOR_PASSWORD, "role": "supervisor"},
    {"email": settings.AGENT_EMAIL,      "password": settings.AGENT_PASSWORD,      "role": "agent"},
]


async def seed():
    async with AsyncSessionLocal() as db:
        for u in SEED_USERS:
            result = await db.execute(select(User).where(User.email == u["email"]))
            user = result.scalar_one_or_none()
            if user:
                user.password_hash = hash_password(u["password"])
                user.role = u["role"]
                user.is_active = True
                print(f"Updated : [{u['role']:10}] {u['email']}")
            else:
                db.add(User(
                    email=u["email"],
                    password_hash=hash_password(u["password"]),
                    role=u["role"],
                ))
                print(f"Created : [{u['role']:10}] {u['email']}")
        await db.commit()

    print("\nCredentials")
    print("-" * 44)
    for u in SEED_USERS:
        print(f"  {u['role']:10}  {u['email']}  /  {u['password']}")
    print()


if __name__ == "__main__":
    asyncio.run(seed())
