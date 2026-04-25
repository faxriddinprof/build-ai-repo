import pytest
from unittest.mock import AsyncMock, patch


def _mock_chat(response: str):
    return patch("app.services.llm_service.chat", new=AsyncMock(return_value=response))


@pytest.mark.asyncio
async def test_extract_high_confidence():
    resp = '{"customer_name": "Ali Valiyev", "customer_passport": "AA1234567", "customer_region": "Toshkent", "confidence": 0.95}'
    with _mock_chat(resp):
        from app.services.extraction_service import extract
        result = await extract("call-1", "Mening ismim Ali Valiyev, pasportim AA1234567")
    assert result["customer_name"] == "Ali Valiyev"
    assert result["customer_passport"] == "AA1234567"
    assert result["customer_region"] == "Toshkent"
    assert result["confidence"] == 0.95


@pytest.mark.asyncio
async def test_extract_low_confidence_blanks_all():
    resp = '{"customer_name": "Noma\'lum", "customer_passport": "AA1234567", "customer_region": "Toshkent", "confidence": 0.3}'
    with _mock_chat(resp):
        from app.services.extraction_service import extract
        result = await extract("call-2", "...")
    assert result["customer_name"] is None
    assert result["customer_passport"] is None
    assert result["customer_region"] is None


@pytest.mark.asyncio
async def test_extract_medium_confidence_keeps_name_only():
    resp = '{"customer_name": "Jamshid", "customer_passport": "AA1234567", "customer_region": "Samarqand", "confidence": 0.65}'
    with _mock_chat(resp):
        from app.services.extraction_service import extract
        result = await extract("call-3", "Ismim Jamshid")
    assert result["customer_name"] == "Jamshid"
    assert result["customer_passport"] is None
    assert result["customer_region"] is None


@pytest.mark.asyncio
async def test_extract_invalid_passport_nulled():
    resp = '{"customer_name": "Vali", "customer_passport": "INVALID123", "customer_region": null, "confidence": 0.9}'
    with _mock_chat(resp):
        from app.services.extraction_service import extract
        result = await extract("call-4", "Pasport raqamim INVALID123")
    assert result["customer_passport"] is None


@pytest.mark.asyncio
async def test_extract_code_fence_stripped():
    resp = '```json\n{"customer_name": "Aziz", "customer_passport": null, "customer_region": null, "confidence": 0.88}\n```'
    with _mock_chat(resp):
        from app.services.extraction_service import extract
        result = await extract("call-5", "...")
    assert result["customer_name"] == "Aziz"


@pytest.mark.asyncio
async def test_extract_llm_failure_returns_empty():
    with patch("app.services.llm_service.chat", side_effect=Exception("timeout")):
        from app.services.extraction_service import extract
        result = await extract("call-6", "...")
    assert result["customer_name"] is None
    assert result["confidence"] == 0.0
