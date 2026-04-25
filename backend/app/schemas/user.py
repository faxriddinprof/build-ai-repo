from typing import Optional
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: str  # admin | supervisor | agent


class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = None


class UserListItem(BaseModel):
    id: str
    email: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True
