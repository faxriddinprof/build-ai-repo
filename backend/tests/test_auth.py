import pytest
from jose import jwt

from app.config import settings
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_round_trip():
    plain = "mysecretpassword"
    hashed = hash_password(plain)
    assert hashed != plain
    assert verify_password(plain, hashed)
    assert not verify_password("wrong", hashed)


def test_jwt_access_token_round_trip():
    token = create_access_token("user-123", "agent")
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["role"] == "agent"
    assert payload["type"] == "access"


def test_jwt_refresh_token_round_trip():
    token = create_refresh_token("user-456")
    payload = decode_token(token)
    assert payload["sub"] == "user-456"
    assert payload["type"] == "refresh"


@pytest.mark.asyncio
async def test_login_happy_path(client, admin_user):
    resp = await client.post("/api/auth/login", json={"email": admin_user.email, "password": "adminpass"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_login_wrong_password(client, admin_user):
    resp = await client.post("/api/auth/login", json={"email": admin_user.email, "password": "wrong"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_user(client, admin_user, admin_token):
    resp = await client.get("/api/auth/me", headers={"authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == admin_user.email


@pytest.mark.asyncio
async def test_me_no_token(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_endpoint_with_agent_token_returns_403(client, agent_token):
    resp = await client.get("/api/admin/users", headers={"authorization": f"Bearer {agent_token}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_endpoint_no_token_returns_401(client):
    resp = await client.get("/api/admin/users")
    assert resp.status_code == 401
