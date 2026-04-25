import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.fixture
def mock_embed():
    vector = [0.1] * 1024
    with patch("app.services.rag_service.embed", new=AsyncMock(return_value=vector)) as m:
        yield m


@pytest.fixture
def mock_bm25_empty():
    with patch("app.services.bm25_service.search", new=AsyncMock(return_value=[])) as m:
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
        {"chunk_id": "c1", "page_number": 3, "filename": "products.pdf", "content": "Kredit foizi 22%.", "similarity": 0.9},
        {"chunk_id": "c2", "page_number": 7, "filename": "products.pdf", "content": "Muddat 12 oy.", "similarity": 0.8},
    ]
    with patch("app.services.rag_service.search", new=AsyncMock(return_value=chunks)):
        from app.services.rag_service import build_context
        ctx = await build_context("kredit")
    assert "chunk 1" in ctx
    assert "sahifa 3" in ctx
    assert "Kredit foizi" in ctx
    assert "chunk 2" in ctx


@pytest.mark.asyncio
async def test_search_applies_tag_filter(mock_embed, mock_bm25_empty):
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


@pytest.mark.asyncio
async def test_build_context_handles_search_failure(mock_embed):
    with patch("app.services.rag_service.search", side_effect=Exception("DB down")):
        from app.services.rag_service import build_context
        ctx = await build_context("kredit")
    assert ctx == "Mavjud emas."


def test_rrf_fuses_overlapping_results():
    from app.services.rag_service import _rrf

    # chunk_a appears in both lists — should outscore chunk_b (dense only, rank 1)
    dense = [
        {"chunk_id": "b", "content": "B", "page_number": 1, "document_id": "d1", "filename": "f.pdf", "similarity": 0.99},
        {"chunk_id": "a", "content": "A", "page_number": 2, "document_id": "d1", "filename": "f.pdf", "similarity": 0.80},
    ]
    sparse = [
        {"chunk_id": "a", "content": "A", "page_number": 2, "document_id": "d1", "filename": "f.pdf", "score": 10.0},
        {"chunk_id": "c", "content": "C", "page_number": 3, "document_id": "d1", "filename": "f.pdf", "score": 5.0},
    ]

    fused = _rrf(dense, sparse, k=60)
    ids = [h["chunk_id"] for h in fused]
    # chunk_a (rank 2 dense + rank 1 sparse) should beat chunk_b (rank 1 dense only)
    assert ids.index("a") < ids.index("b")


def test_rrf_dense_only_results():
    from app.services.rag_service import _rrf

    dense = [
        {"chunk_id": "x", "content": "X", "page_number": 1, "document_id": "d", "filename": "f.pdf", "similarity": 0.9},
    ]
    fused = _rrf(dense, [], k=60)
    assert len(fused) == 1
    assert fused[0]["chunk_id"] == "x"
    assert fused[0]["similarity"] == pytest.approx(1.0 / 61)


def test_rrf_sparse_only_results():
    from app.services.rag_service import _rrf

    sparse = [
        {"chunk_id": "y", "content": "Y", "page_number": 1, "document_id": "d", "filename": "f.pdf", "score": 5.0},
    ]
    fused = _rrf([], sparse, k=60)
    assert len(fused) == 1
    assert fused[0]["chunk_id"] == "y"
    assert fused[0]["similarity"] == pytest.approx(1.0 / 61)
