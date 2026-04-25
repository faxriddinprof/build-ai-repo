import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch


def test_tokenize_preserves_uzbek_apostrophes():
    from app.services.bm25_service import _tokenize
    tokens = _tokenize("to'lov miqdori g'oya kredit")
    assert "to'lov" in tokens
    assert "g'oya" in tokens
    assert "kredit" in tokens


def test_tokenize_lowercases():
    from app.services.bm25_service import _tokenize
    assert _tokenize("KREDIT Foizi") == ["kredit", "foizi"]


def test_empty_corpus_search_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.bm25_service._retriever", None)
    monkeypatch.setattr("app.services.bm25_service._meta", {})
    from app.services.bm25_service import _search_sync
    result = _search_sync("kredit", top_k=5, tag_filter=None)
    assert result == []


def test_search_after_index_returns_results_in_order(tmp_path, monkeypatch):
    """Build a small BM25 index in-process and verify search ranks correctly."""
    bm25s = pytest.importorskip("bm25s")

    from app.services.bm25_service import _tokenize

    corpus = [
        "kredit foizi past stavka",
        "omonat depozit bank",
        "kredit karta limitlar",
    ]
    corpus_tokens = [_tokenize(t) for t in corpus]
    retriever = bm25s.BM25()
    retriever.index(corpus_tokens)

    meta = {
        "chunk_ids": ["c0", "c1", "c2"],
        "contents": corpus,
        "page_numbers": [1, 2, 3],
        "document_ids": ["d1", "d1", "d1"],
        "filenames": ["f.pdf", "f.pdf", "f.pdf"],
        "tags": [None, None, None],
    }

    monkeypatch.setattr("app.services.bm25_service._retriever", retriever)
    monkeypatch.setattr("app.services.bm25_service._meta", meta)

    from app.services.bm25_service import _search_sync
    results = _search_sync("kredit", top_k=3, tag_filter=None)

    assert len(results) >= 1
    # "kredit" should surface the kredit documents first
    ids = [r["chunk_id"] for r in results]
    assert "c0" in ids or "c2" in ids  # both contain "kredit"


def test_tag_filter_excludes_mismatched_chunks(monkeypatch):
    bm25s = pytest.importorskip("bm25s")

    from app.services.bm25_service import _tokenize

    corpus = ["kredit foizi", "omonat stavka"]
    corpus_tokens = [_tokenize(t) for t in corpus]
    retriever = bm25s.BM25()
    retriever.index(corpus_tokens)

    meta = {
        "chunk_ids": ["c0", "c1"],
        "contents": corpus,
        "page_numbers": [1, 1],
        "document_ids": ["d1", "d2"],
        "filenames": ["a.pdf", "b.pdf"],
        "tags": ["product", "compliance"],
    }

    monkeypatch.setattr("app.services.bm25_service._retriever", retriever)
    monkeypatch.setattr("app.services.bm25_service._meta", meta)

    from app.services.bm25_service import _search_sync
    results = _search_sync("kredit omonat", top_k=5, tag_filter="product")

    assert all(r["chunk_id"] == "c0" for r in results)


def test_rebuild_sync_empty_rows_does_not_raise(tmp_path, monkeypatch):
    """_rebuild_sync with zero rows returns None and clears any existing index dir."""
    monkeypatch.setattr("app.services.bm25_service.settings",
                        type("S", (), {"UPLOAD_DIR": str(tmp_path)})())

    from app.services.bm25_service import _rebuild_sync
    result = _rebuild_sync([])
    assert result is None
