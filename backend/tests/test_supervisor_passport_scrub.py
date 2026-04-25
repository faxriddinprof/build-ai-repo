import json
import pytest
from app.routers.supervisor_ws import _scrub


def test_scrub_removes_customer_passport():
    event = {
        "type": "intake_proposal",
        "call_id": "abc",
        "customer_passport": "AA1234567",
        "customer_name": "Ali",
    }
    scrubbed = _scrub(event)
    assert "customer_passport" not in scrubbed
    assert scrubbed["customer_name"] == "Ali"
    assert scrubbed["call_id"] == "abc"


def test_scrub_passthrough_no_passport():
    event = {"type": "transcript_chunk", "call_id": "x", "text": "salom"}
    scrubbed = _scrub(event)
    assert scrubbed == event


def test_scrub_nested_passport_not_checked():
    # Server-side scrub only strips top-level keys
    event = {
        "type": "intake_proposal",
        "data": {"customer_passport": "AA1234567", "customer_name": "Ali"},
    }
    scrubbed = _scrub(event)
    # data is preserved (nested scrubbing is not in scope for MVP)
    assert "data" in scrubbed
    assert "customer_passport" not in scrubbed


def test_supervisor_payload_json_never_contains_passport():
    event = {
        "type": "call_started",
        "call_id": "xyz",
        "customer_passport": "BB9999999",
        "agent_id": "agent-1",
    }
    scrubbed = _scrub(event)
    payload = json.dumps(scrubbed)
    assert "BB9999999" not in payload
    assert "customer_passport" not in payload
