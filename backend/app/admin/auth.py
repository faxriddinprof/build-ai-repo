from fastapi import Depends, HTTPException
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.models.user import User
from app.services.auth_service import verify_password

security = HTTPBasic(realm="Bank Admin Panel")

_UNAUTH = HTTPException(
    status_code=401,
    detail="Invalid credentials",
    headers={"WWW-Authenticate": 'Basic realm="Bank Admin Panel"'},
)


async def get_admin_basic(
    creds: HTTPBasicCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(select(User).where(User.email == creds.username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(creds.password, user.password_hash):
        raise _UNAUTH
    if user.role != "admin" or not user.is_active:
        raise _UNAUTH
    return user
