import asyncio
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://sales:sales@localhost:5432/sales_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_for_testing_only")

from alembic import command
from alembic.config import Config as AlembicConfig

from app.main import app
from app.database import AsyncSessionLocal
from app.deps import get_db
from app.models.user import User
from app.services.auth_service import create_access_token, hash_password

TEST_DB_URL = os.environ["DATABASE_URL"]


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session", autouse=True)
def apply_migrations():
    """Run alembic upgrade head on the test DB once per session."""
    cfg = AlembicConfig("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", TEST_DB_URL.replace("+asyncpg", ""))
    command.upgrade(cfg, "head")
    yield
    command.downgrade(cfg, "base")


test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def admin_user():
    async with TestSessionLocal() as db:
        user = User(
            email="admin_test@example.com",
            password_hash=hash_password("adminpass"),
            role="admin",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        yield user
        await db.delete(user)
        await db.commit()


@pytest_asyncio.fixture
async def agent_user():
    async with TestSessionLocal() as db:
        user = User(
            email="agent_test@example.com",
            password_hash=hash_password("agentpass"),
            role="agent",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        yield user
        await db.delete(user)
        await db.commit()


@pytest.fixture
def admin_token(admin_user):
    return create_access_token(admin_user.id, admin_user.role)


@pytest.fixture
def agent_token(agent_user):
    return create_access_token(agent_user.id, agent_user.role)
