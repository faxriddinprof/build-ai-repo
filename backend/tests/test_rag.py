import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.fixture
def mock_embed():
    vector = [0.1] * 768
    with patch("app.services.rag_service.embed", new=AsyncMock(return_value=vector)) as m:
        yield m


@pytest.mark.asyncio
async def test_build_context_returns_no_context_on_empty(mock_embed):
    with patch("app.services.rag_service.search", new=AsyncMock(return_value=[])):
        from app.services.rag_service import build_context
        ctx = await build_context("foiz stavkasi")
    assert ctx == "Mavjud emas."


@pytest.mark.asyncio
async def test_build_context_formats_chunks(mock_embed):
    chunks = [
        {"page_number": 3, "filename": "products.pdf", "content": "Kredit foizi 22%."},
        {"page_number": 7, "filename": "products.pdf", "content": "Muddat 12 oy."},
    ]
    with patch("app.services.rag_service.search", new=AsyncMock(return_value=chunks)):
        from app.services.rag_service import build_context
        ctx = await build_context("kredit")
    assert "chunk 1" in ctx
    assert "sahifa 3" in ctx
    assert "Kredit foizi" in ctx
    assert "chunk 2" in ctx


@pytest.mark.asyncio
async def test_search_applies_tag_filter(mock_embed):
    with patch("app.services.rag_service.AsyncSessionLocal") as mock_session_cls:
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.mappings.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.close = AsyncMock()
        mock_session_cls.return_value = mock_db

        from app.services.rag_service import search
        result = await search("kredit", top_k=3, tag_filter="products")

    assert result == []
    call_args = mock_db.execute.call_args
    params = call_args[0][1]
    assert params["tag"] == "products"
    assert params["top_k"] == 3


@pytest.mark.asyncio
async def test_build_context_handles_search_failure(mock_embed):
    with patch("app.services.rag_service.search", side_effect=Exception("DB down")):
        from app.services.rag_service import build_context
        ctx = await build_context("kredit")
    assert ctx == "Mavjud emas."
