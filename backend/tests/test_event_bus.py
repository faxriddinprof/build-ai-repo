import asyncio
import pytest
from app.services import event_bus


@pytest.fixture(autouse=True)
def reset_bus():
    event_bus._subscribers.clear()
    yield
    event_bus._subscribers.clear()


@pytest.mark.asyncio
async def test_subscribe_and_receive():
    q = event_bus.subscribe("test")
    await event_bus.publish("test", {"msg": "hello"})
    event = q.get_nowait()
    assert event["msg"] == "hello"


@pytest.mark.asyncio
async def test_multiple_subscribers_no_crosstalk():
    q1 = event_bus.subscribe("topic-a")
    q2 = event_bus.subscribe("topic-b")

    await event_bus.publish("topic-a", {"x": 1})
    await event_bus.publish("topic-b", {"y": 2})

    assert q1.get_nowait() == {"x": 1}
    assert q2.get_nowait() == {"y": 2}
    assert q1.empty()
    assert q2.empty()


@pytest.mark.asyncio
async def test_two_subscribers_same_topic_both_receive():
    q1 = event_bus.subscribe("shared")
    q2 = event_bus.subscribe("shared")

    await event_bus.publish("shared", {"k": "v"})

    assert q1.get_nowait() == {"k": "v"}
    assert q2.get_nowait() == {"k": "v"}


@pytest.mark.asyncio
async def test_unsubscribe_stops_delivery():
    q = event_bus.subscribe("unsub")
    event_bus.unsubscribe("unsub", q)
    await event_bus.publish("unsub", {"data": "x"})
    assert q.empty()


@pytest.mark.asyncio
async def test_no_subscribers_publish_noop():
    # Should not raise
    await event_bus.publish("empty", {"x": 1})
