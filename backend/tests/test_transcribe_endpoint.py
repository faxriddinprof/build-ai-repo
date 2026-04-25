"""Tests for POST /api/transcribe-chunk (REST fallback)."""
import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.services import call_pipeline
from tests.conftest import TestSessionLocal
from app.models.call import Call
from sqlalchemy import select


ENDPOINT = "/api/transcribe-chunk"
SILENT_WAV = (
    b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00"
    b"\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
)


@pytest.fixture(autouse=True)
def cleanup_call_state():
    call_pipeline._call_state.clear()
    yield
    call_pipeline._call_state.clear()


@pytest.mark.asyncio
async def test_no_token_returns_401(client: AsyncClient):
    resp = await client.post(ENDPOINT, data={"call_id": "x"}, files={"audio": ("a.wav", SILENT_WAV, "audio/wav")})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_wrong_role_blocked(client: AsyncClient, admin_token: str):
    # admin IS allowed (we allow both agent and admin in transcribe.py)
    # Use a supervisor user to test rejection
    from app.models.user import User
    from app.services.auth_service import hash_password, create_access_token
    async with TestSessionLocal() as db:
        sup = User(email="sup_test@example.com", password_hash=hash_password("x"), role="supervisor")
        db.add(sup)
        await db.commit()
        await db.refresh(sup)
        sup_token = create_access_token(sup.id, sup.role)
        sup_id = sup.id

    resp = await client.post(
        ENDPOINT,
        headers={"Authorization": f"Bearer {sup_token}"},
        data={"call_id": "call-supervisor"},
        files={"audio": ("a.wav", SILENT_WAV, "audio/wav")},
    )
    assert resp.status_code == 403

    async with TestSessionLocal() as db:
        res = await db.execute(select(User).where(User.id == sup_id))
        u = res.scalar_one_or_none()
        if u:
            await db.delete(u)
            await db.commit()


@pytest.mark.asyncio
async def test_happy_path_returns_events(client: AsyncClient, agent_token: str, agent_user):
    call_id = "test-transcribe-001"

    dummy_stt = MagicMock()
    dummy_stt.text = "Kredit olmoqchiman"

    with patch("app.services.stt_service.transcribe_chunk", new_callable=AsyncMock, return_value=dummy_stt), \
         patch("app.services.guardrail_service.is_bank_related", return_value=False), \
         patch("app.services.compliance_service.check_chunk", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.sentiment_service.analyze", new_callable=AsyncMock, return_value=None), \
         patch("app.services.call_pipeline._decode_audio", return_value=b"\x00\x00" * 16000) if False else \
         patch("app.routers.transcribe._decode_audio", return_value=b"\x00\x00" * 16000):
        resp = await client.post(
            ENDPOINT,
            headers={"Authorization": f"Bearer {agent_token}"},
            data={"call_id": call_id, "lang_hint": "uz"},
            files={"audio": ("chunk.webm", b"fake", "audio/webm")},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert "events" in body
    assert body["call_id"] == call_id
    types = [e["type"] for e in body["events"]]
    assert "transcript" in types

    # cleanup
    async with TestSessionLocal() as db:
        res = await db.execute(select(Call).where(Call.id == call_id))
        c = res.scalar_one_or_none()
        if c:
            await db.delete(c)
            await db.commit()


@pytest.mark.asyncio
async def test_final_true_returns_summary(client: AsyncClient, agent_token: str, agent_user):
    call_id = "test-transcribe-final-001"

    dummy_stt = MagicMock()
    dummy_stt.text = ""  # empty → no events from audio

    fake_summary = {"outcome": "no_decision", "objections": [], "next_action": "callback"}

    with patch("app.routers.transcribe._decode_audio", return_value=b"\x00\x00" * 32), \
         patch("app.services.stt_service.transcribe_chunk", new_callable=AsyncMock, return_value=dummy_stt), \
         patch("app.services.summary_service.summarize", new_callable=AsyncMock, return_value=fake_summary), \
         patch("app.services.compliance_service.get_status", return_value={}), \
         patch("app.services.compliance_service.clear_call"), \
         patch("app.services.sentiment_service.clear_call"):
        resp = await client.post(
            ENDPOINT,
            headers={"Authorization": f"Bearer {agent_token}"},
            data={"call_id": call_id, "final": "true"},
            files={"audio": ("chunk.webm", b"fake", "audio/webm")},
        )

    assert resp.status_code == 200
    body = resp.json()
    types = [e["type"] for e in body["events"]]
    assert "summary_ready" in types
    summary_event = next(e for e in body["events"] if e["type"] == "summary_ready")
    assert summary_event["summary"] == fake_summary

    # cleanup
    async with TestSessionLocal() as db:
        res = await db.execute(select(Call).where(Call.id == call_id))
        c = res.scalar_one_or_none()
        if c:
            await db.delete(c)
            await db.commit()
