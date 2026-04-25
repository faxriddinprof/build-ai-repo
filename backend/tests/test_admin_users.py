import pytest


@pytest.mark.asyncio
async def test_admin_can_create_user(client, admin_token):
    resp = await client.post(
        "/api/admin/users",
        json={"email": "newagent@bank.local", "password": "pass123", "role": "agent"},
        headers={"authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "newagent@bank.local"
    assert data["role"] == "agent"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_duplicate_email_returns_409(client, admin_token, admin_user):
    resp = await client.post(
        "/api/admin/users",
        json={"email": admin_user.email, "password": "x", "role": "agent"},
        headers={"authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_agent_cannot_create_user(client, agent_token):
    resp = await client.post(
        "/api/admin/users",
        json={"email": "x@bank.local", "password": "y", "role": "agent"},
        headers={"authorization": f"Bearer {agent_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_list_users(client, admin_token, admin_user):
    resp = await client.get("/api/admin/users", headers={"authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    emails = [u["email"] for u in resp.json()]
    assert admin_user.email in emails


@pytest.mark.asyncio
async def test_admin_can_deactivate_user(client, admin_token, agent_user):
    resp = await client.patch(
        f"/api/admin/users/{agent_user.id}",
        json={"is_active": False},
        headers={"authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False
