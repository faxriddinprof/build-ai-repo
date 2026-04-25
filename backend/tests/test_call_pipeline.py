"""Tests for the shared call pipeline (call_pipeline.py)."""
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models.call import Call
from app.models.suggestion import SuggestionLog
from app.services import call_pipeline
from tests.conftest import TestSessionLocal


@pytest_asyncio.fixture(autouse=True)
async def cleanup_call_state():
    call_pipeline._call_state.clear()
    yield
    call_pipeline._call_state.clear()


@pytest_asyncio.fixture
async def db_call(agent_user):
    call_id = "test-pipeline-call-001"
    async with TestSessionLocal() as db:
        call = Call(id=call_id, agent_id=agent_user.id, transcript=[])
        db.add(call)
        await db.commit()
    yield call_id
    async with TestSessionLocal() as db:
        res = await db.execute(select(Call).where(Call.id == call_id))
        c = res.scalar_one_or_none()
        if c:
            await db.delete(c)
            await db.commit()


@pytest.mark.asyncio
async def test_start_call_creates_db_row(agent_user):
    call_id = "test-start-call-001"
    await call_pipeline.start_call(call_id, str(agent_user.id))
    assert call_id in call_pipeline._call_state
    async with TestSessionLocal() as db:
        res = await db.execute(select(Call).where(Call.id == call_id))
        call = res.scalar_one_or_none()
    assert call is not None
    assert call.agent_id == str(agent_user.id)
    # cleanup
    async with TestSessionLocal() as db:
        res = await db.execute(select(Call).where(Call.id == call_id))
        c = res.scalar_one_or_none()
        if c:
            await db.delete(c)
            await db.commit()


@pytest.mark.asyncio
async def test_process_chunk_guardrail_drop(db_call, agent_user):
    """Non-bank text → no suggestion event emitted."""
    await call_pipeline.start_call(db_call, str(agent_user.id))
    silence = b"\x00\x00" * 16000  # 1 s silence, 16 kHz mono int16

    dummy_result = MagicMock()
    dummy_result.text = "Bu bank bilan bog'liq emas"

    with patch("app.services.stt_service.transcribe_chunk", new_callable=AsyncMock, return_value=dummy_result), \
         patch("app.services.guardrail_service.is_bank_related", return_value=False), \
         patch("app.services.compliance_service.check_chunk", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.sentiment_service.analyze", new_callable=AsyncMock, return_value=None):
        events = await call_pipeline.process_audio_chunk(db_call, silence)

    types = [e["type"] for e in events]
    assert "transcript" in types
    assert "suggestion" not in types


@pytest.mark.asyncio
async def test_process_chunk_persists_transcript(db_call, agent_user):
    await call_pipeline.start_call(db_call, str(agent_user.id))
    silence = b"\x00\x00" * 16000

    dummy_result = MagicMock()
    dummy_result.text = "Kredit olmoqchiman"

    with patch("app.services.stt_service.transcribe_chunk", new_callable=AsyncMock, return_value=dummy_result), \
         patch("app.services.guardrail_service.is_bank_related", return_value=False), \
         patch("app.services.compliance_service.check_chunk", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.sentiment_service.analyze", new_callable=AsyncMock, return_value=None):
        await call_pipeline.process_audio_chunk(db_call, silence)

    async with TestSessionLocal() as db:
        res = await db.execute(select(Call).where(Call.id == db_call))
        call = res.scalar_one_or_none()
    assert call is not None
    assert isinstance(call.transcript, list)
    assert len(call.transcript) >= 1
    assert call.transcript[0]["text"] == "Kredit olmoqchiman"


@pytest.mark.asyncio
async def test_process_chunk_persists_suggestion(db_call, agent_user):
    """Bank-related text → SuggestionLog row inserted."""
    await call_pipeline.start_call(db_call, str(agent_user.id))
    silence = b"\x00\x00" * 16000

    dummy_stt = MagicMock()
    dummy_stt.text = "Kredit foiz stavkasi qancha?"

    async def fake_suggestion(**kwargs):
        for token in ["• Foiz 18%\n", "• Muddati 24 oy"]:
            yield token

    with patch("app.services.stt_service.transcribe_chunk", new_callable=AsyncMock, return_value=dummy_stt), \
         patch("app.services.guardrail_service.is_bank_related", return_value=True), \
         patch("app.services.compliance_service.check_chunk", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.sentiment_service.analyze", new_callable=AsyncMock, return_value=None), \
         patch("app.services.rag_service.build_context", new_callable=AsyncMock, return_value=""), \
         patch("app.services.llm_service.get_suggestion", return_value=fake_suggestion()):
        events = await call_pipeline.process_audio_chunk(db_call, silence)

    types = [e["type"] for e in events]
    assert "suggestion" in types

    async with TestSessionLocal() as db:
        res = await db.execute(select(SuggestionLog).where(SuggestionLog.call_id == db_call))
        rows = res.scalars().all()
    assert len(rows) >= 1
    # cleanup suggestion rows
    async with TestSessionLocal() as db:
        res = await db.execute(select(SuggestionLog).where(SuggestionLog.call_id == db_call))
        for row in res.scalars().all():
            await db.delete(row)
        await db.commit()


@pytest.mark.asyncio
async def test_finalize_call_clears_state_and_persists_summary(db_call, agent_user):
    await call_pipeline.start_call(db_call, str(agent_user.id))
    assert db_call in call_pipeline._call_state

    fake_summary = {"outcome": "sold", "objections": [], "next_action": "follow_up"}
    with patch("app.services.summary_service.summarize", new_callable=AsyncMock, return_value=fake_summary), \
         patch("app.services.compliance_service.get_status", return_value={}), \
         patch("app.services.compliance_service.clear_call"), \
         patch("app.services.sentiment_service.clear_call"):
        event = await call_pipeline.finalize_call(db_call)

    assert event["type"] == "summary_ready"
    assert db_call not in call_pipeline._call_state

    async with TestSessionLocal() as db:
        res = await db.execute(select(Call).where(Call.id == db_call))
        call = res.scalar_one_or_none()
    assert call is not None
    assert call.summary == fake_summary
    assert call.ended_at is not None


@pytest.mark.asyncio
async def test_auto_extraction_fires_at_60s(db_call, agent_user):
    """auto-extraction task is scheduled after 60 s elapsed."""
    await call_pipeline.start_call(db_call, str(agent_user.id))
    # Back-date start_time by 61 s
    call_pipeline._call_state[db_call]["start_time"] = time.monotonic() - 61

    silence = b"\x00\x00" * 16000
    dummy_stt = MagicMock()
    dummy_stt.text = "test"

    tasks_created = []
    real_create_task = __import__("asyncio").create_task

    def mock_create_task(coro):
        tasks_created.append(coro.__qualname__ if hasattr(coro, "__qualname__") else str(coro))
        return real_create_task(coro)

    with patch("app.services.stt_service.transcribe_chunk", new_callable=AsyncMock, return_value=dummy_stt), \
         patch("app.services.guardrail_service.is_bank_related", return_value=False), \
         patch("app.services.compliance_service.check_chunk", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.sentiment_service.analyze", new_callable=AsyncMock, return_value=None), \
         patch("app.services.call_pipeline.asyncio.create_task", side_effect=mock_create_task):
        await call_pipeline.process_audio_chunk(db_call, silence)

    assert any("extraction" in t.lower() for t in tasks_created), \
        f"Expected extraction task, got: {tasks_created}"
