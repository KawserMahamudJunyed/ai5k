"""Application error types + FastAPI exception handlers.

Every non-2xx response uses the envelope from docs/api-conventions.md:

    {
      "error": {
        "code": "snake_case_machine_readable",
        "message": "human readable",
        "details": {}
      }
    }
"""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Raised by services/routes to produce a controlled error response."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


def _error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Field-level errors -> {"field": "message"} for the details bag.
        details: dict[str, Any] = {}
        for err in exc.errors():
            loc = err.get("loc", ())
            field = str(loc[-1]) if loc else "body"
            details.setdefault(field, err.get("msg", "invalid"))
        # HTTP_422_UNPROCESSABLE_CONTENT is the modern name (Starlette 0.38+).
        # `or` short-circuits so the deprecated HTTP_422_UNPROCESSABLE_ENTITY is
        # never evaluated (accessing it triggers Starlette's deprecation warning).
        status_code = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", None) or (
            status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        return JSONResponse(
            status_code=status_code,
            content=_error_body("validation_error", "Request validation failed.", details),
        )

    @app.exception_handler(Exception)
    async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        # Full traceback goes to logs via the logging middleware / uvicorn; client gets generic 500.
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_body("internal_error", "An unexpected error occurred."),
        )
