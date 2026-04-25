import pytest
from unittest.mock import AsyncMock, patch, MagicMock


def _make_chunk(content: str):
    chunk = MagicMock()
    chunk.choices = [MagicMock()]
    chunk.choices[0].delta.content = content
    return chunk


async def _async_iter(items):
    for item in items:
        yield item


@pytest.mark.asyncio
async def test_get_suggestion_streams_uzbek_tokens():
    chunks = [_make_chunk(t) for t in ["Kredit", " foizi", " 22%", " yillik."]]

    with patch("app.services.llm_service.acompletion", new_callable=AsyncMock) as mock_ac:
        mock_ac.return_value = _async_iter(chunks)
        tokens = []
        from app.services.llm_service import get_suggestion
        async for tok in get_suggestion("foiz stavkangiz qimmat"):
            tokens.append(tok)

    assert "".join(tokens) == "Kredit foizi 22% yillik."


@pytest.mark.asyncio
async def test_get_suggestion_retries_on_non_uzbek():
    # First response: English (non-Uzbek). Second response: Uzbek.
    english_chunks = [_make_chunk(t) for t in ["The", " rate", " is", " 22%."]]
    uzbek_chunks = [_make_chunk(t) for t in ["Foiz", " 22%", " yillik."]]

    call_count = 0

    async def mock_acompletion(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _async_iter(english_chunks)
        return _async_iter(uzbek_chunks)

    with patch("app.services.llm_service.acompletion", side_effect=mock_acompletion):
        tokens = []
        from app.services.llm_service import get_suggestion
        async for tok in get_suggestion("qimmat"):
            tokens.append(tok)

    assert call_count == 2
    assert "Foiz" in "".join(tokens)
