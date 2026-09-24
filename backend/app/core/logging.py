"""JSON structured logging + request correlation id middleware.

Docs/TRD leave the logging library open (structlog vs stdlib); we use stdlib with a
JSON formatter so every line carries a correlation/request id (NFR 11.2).
"""

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from logging import LogRecord

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger("ai5k")


class JsonFormatter(logging.Formatter):
    def format(self, record: LogRecord) -> str:
        payload: dict = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in ("correlation_id", "user_id", "path", "method", "status", "duration_ms", "ip"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def setup_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Assigns a request id, logs each request, and echoes X-Request-ID back."""

    async def dispatch(self, request: Request, call_next) -> Response:
        correlation_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "http_request",
                extra={
                    "correlation_id": correlation_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": 500,
                    "duration_ms": round((time.perf_counter() - start) * 1000, 2),
                    "ip": request.client.host if request.client else None,
                },
            )
            raise
        response.headers["X-Request-ID"] = correlation_id
        logger.info(
            "http_request",
            extra={
                "correlation_id": correlation_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round((time.perf_counter() - start) * 1000, 2),
                "ip": request.client.host if request.client else None,
            },
        )
        return response


def register_middleware(app: FastAPI) -> None:
    app.add_middleware(RequestLoggingMiddleware)
