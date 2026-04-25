import contextvars
import logging
import uuid
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")

_SCRUBBED = "***SCRUBBED***"
_PII_KEYS = {"customer_passport"}


def _scrub_pii(logger, method, event_dict: dict) -> dict:
    for key in _PII_KEYS:
        if key in event_dict:
            event_dict[key] = _SCRUBBED
    return event_dict


def _add_request_id(logger, method, event_dict: dict) -> dict:
    rid = request_id_var.get("")
    if rid:
        event_dict["request_id"] = rid
    return event_dict


def setup_logging(log_level: str = "INFO") -> None:
    structlog.configure(
        processors=[
            _scrub_pii,
            _add_request_id,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level.upper(), logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
            response.headers["x-request-id"] = rid
            return response
        finally:
            request_id_var.reset(token)
