import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_role
from app.models.user import User
from app.schemas.user import UserCreate, UserListItem, UserUpdate
from app.services.auth_service import hash_password

router = APIRouter()
log = structlog.get_logger()

_VALID_ROLES = {"admin", "supervisor", "agent"}


@router.post("/users", response_model=UserListItem, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    if body.role not in _VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of {_VALID_ROLES}")
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    log.info("admin.user.created", user_id=user.id, role=user.role)
    return user


@router.get("/users", response_model=list[UserListItem])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.patch("/users/{user_id}", response_model=UserListItem)
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.role is not None:
        if body.role not in _VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Invalid role")
        user.role = body.role
    await db.commit()
    await db.refresh(user)
    return user
