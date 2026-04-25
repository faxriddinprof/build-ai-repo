"""Create or update the initial admin user. Idempotent — safe to run multiple times."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.services.auth_service import hash_password


async def seed():
    email = os.environ.get("ADMIN_EMAIL", "admin@bank.local")
    password = os.environ.get("ADMIN_PASSWORD", "admin123")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.password_hash = hash_password(password)
            user.role = "admin"
            user.is_active = True
            print(f"Updated existing admin: {email}")
        else:
            user = User(email=email, password_hash=hash_password(password), role="admin")
            db.add(user)
            print(f"Created admin: {email}")
        await db.commit()
        print("Done.")


if __name__ == "__main__":
    asyncio.run(seed())
