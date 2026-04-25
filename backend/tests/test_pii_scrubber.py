from app.logging_config import _scrub_pii


def test_passport_scrubbed_in_log():
    event = {
        "event": "user.created",
        "customer_passport": "AA1234567",
        "customer_name": "Ali",
    }
    result = _scrub_pii(None, None, event)
    assert result["customer_passport"] == "***SCRUBBED***"
    assert result["customer_name"] == "Ali"


def test_no_passport_passthrough():
    event = {"event": "call.started", "call_id": "abc"}
    result = _scrub_pii(None, None, event)
    assert result == {"event": "call.started", "call_id": "abc"}


def test_passport_never_serialized():
    import json
    event = {"customer_passport": "BB9999999", "user": "test"}
    scrubbed = _scrub_pii(None, None, event)
    payload = json.dumps(scrubbed)
    assert "BB9999999" not in payload
