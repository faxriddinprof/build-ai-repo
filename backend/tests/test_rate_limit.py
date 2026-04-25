"""Tests for rate-limiting middleware and per-endpoint limits."""
import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.middleware.rate_limit import limiter
from app.services.auth_service import create_access_token


@pytest.fixture(autouse=True)
def reset_limiter():
    limiter.reset()
    yield
    limiter.reset()


# ── Login brute-force protection ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_rate_limit_blocks_at_6th(client: AsyncClient):
    payload = {"email": "nobody@example.com", "password": "wrong"}
    statuses = []
    for _ in range(7):
        r = await client.post("/api/auth/login", json=payload)
        statuses.append(r.status_code)
    # first 5 → 401 (wrong credentials), 6th+ → 429 (rate limit)
    assert statuses[:5] == [401] * 5
    assert statuses[5] == 429
    assert statuses[6] == 429


@pytest.mark.asyncio
async def test_login_rate_limit_response_shape(client: AsyncClient):
    payload = {"email": "nobody@example.com", "password": "wrong"}
    for _ in range(5):
        await client.post("/api/auth/login", json=payload)
    r = await client.post("/api/auth/login", json=payload)
    assert r.status_code == 429
    body = r.json()
    assert "detail" in body
    assert "Retry-After" in r.headers


# ── Refresh rate-limit ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_rate_limit_blocks_at_11th(client: AsyncClient):
    payload = {"refresh_token": "invalid.token.value"}
    statuses = []
    for _ in range(12):
        r = await client.post("/api/auth/refresh", json=payload)
        statuses.append(r.status_code)
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429


# ── Healthz exemption ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_healthz_not_rate_limited(client: AsyncClient):
    """Healthz must remain reachable regardless of global rate limits."""
    statuses = [
        (await client.get("/healthz")).status_code
        for _ in range(20)
    ]
    assert all(s == 200 for s in statuses), f"Unexpected statuses: {statuses}"


# ── Authenticated user isolation ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_authenticated_users_have_separate_buckets(
    client: AsyncClient, admin_user, agent_user
):
    """User A exhausting their limit must not affect user B."""
    admin_token = create_access_token(admin_user.id, admin_user.role)
    agent_token = create_access_token(agent_user.id, agent_user.role)

    # Admin user sends burst+1 requests to a non-rate-limited path quickly
    # (bust the per-second bucket of 10)
    admin_statuses = []
    for _ in range(12):
        r = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        admin_statuses.append(r.status_code)

    # At least some of admin's requests should be rate-limited (429)
    assert 429 in admin_statuses, "Expected admin to hit rate limit but didn't"

    # Agent user (different key bucket) should still get through on first request
    r = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert r.status_code == 200, (
        f"Agent user should not be affected by admin's rate limit, got {r.status_code}"
    )
