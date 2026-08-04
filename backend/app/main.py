"""FastAPI application entry point (uvicorn app.main:app)."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import admin, audit_logs, auth, organizations, roles
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import register_middleware, setup_logging
from app.core.security import get_token_manager

setup_logging()

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm the Cognito JWKS cache so the first request doesn't pay a network round-trip.
    await get_token_manager().warmup()
    yield


app = FastAPI(
    title="AI5K Backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
register_middleware(app)

api_v1 = "/api/v1"
app.include_router(auth.router, prefix=api_v1)
app.include_router(roles.router, prefix=api_v1)
app.include_router(organizations.router, prefix=api_v1)
app.include_router(admin.router, prefix=api_v1)
app.include_router(audit_logs.router, prefix=api_v1)


@app.get("/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok"}
