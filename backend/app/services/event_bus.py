import asyncio
from typing import AsyncIterator

import structlog

log = structlog.get_logger()

_subscribers: dict[str, list[asyncio.Queue]] = {}


def subscribe(topic: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.setdefault(topic, []).append(q)
    return q


def unsubscribe(topic: str, q: asyncio.Queue) -> None:
    subs = _subscribers.get(topic, [])
    try:
        subs.remove(q)
    except ValueError:
        pass


async def publish(topic: str, event: dict) -> None:
    for q in list(_subscribers.get(topic, [])):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            log.warning("event_bus.queue_full", topic=topic)
