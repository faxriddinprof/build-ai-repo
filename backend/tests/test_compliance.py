import pytest
from unittest.mock import patch


_PHRASES = [
    {"id": "interest_rate_disclosure", "patterns": ["foiz stavka", "yillik foiz"]},
    {"id": "data_consent", "patterns": ["shaxsiy ma'lumot", "rozilik"]},
    {"id": "loan_term_disclosure", "patterns": ["kredit muddati", "necha oy"]},
]


@pytest.fixture(autouse=True)
def reset_compliance_state():
    from app.services import compliance_service
    compliance_service._phrases = _PHRASES
    compliance_service._call_state.clear()
    yield
    compliance_service._call_state.clear()


@pytest.mark.asyncio
async def test_exact_phrase_ticked():
    from app.services.compliance_service import check_chunk
    result = await check_chunk("c1", "Kredit foiz stavkasi haqida gapiramiz")
    assert "interest_rate_disclosure" in result


@pytest.mark.asyncio
async def test_no_double_tick():
    from app.services.compliance_service import check_chunk
    r1 = await check_chunk("c2", "foiz stavka haqida")
    r2 = await check_chunk("c2", "foiz stavka yana")
    assert "interest_rate_disclosure" in r1
    assert "interest_rate_disclosure" not in r2


@pytest.mark.asyncio
async def test_fuzzy_match():
    from app.services.compliance_service import check_chunk
    result = await check_chunk("c3", "kredit mudati bu yerda")
    assert "loan_term_disclosure" in result


@pytest.mark.asyncio
async def test_non_matching_text():
    from app.services.compliance_service import check_chunk
    result = await check_chunk("c4", "ob-havo bugun yaxshi")
    assert result == []


@pytest.mark.asyncio
async def test_multiple_phrases_same_chunk():
    from app.services.compliance_service import check_chunk
    result = await check_chunk("c5", "foiz stavka va necha oy to'lash kerak shaxsiy ma'lumot")
    assert "interest_rate_disclosure" in result
    assert "data_consent" in result
    assert "loan_term_disclosure" in result


@pytest.mark.asyncio
async def test_get_status_shows_missed():
    from app.services.compliance_service import check_chunk, get_status
    await check_chunk("c6", "foiz stavka")
    status = get_status("c6")
    assert status["interest_rate_disclosure"] == "ok"
    assert status["data_consent"] == "missed"
    assert status["loan_term_disclosure"] == "missed"
