"""Test fixtures.

Uses an in-memory SQLite database (aiosqlite + StaticPool) with the app's DB
session dependency overridden. Roles/permissions are seeded per test session.
"""

import os

# Must be set before any app import reads settings.
os.environ["ENV"] = "local"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-prod-0123456789abcdef"  # >= 32 bytes for HS256
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import get_db
from app.main import app
from app.models.base import Base
from app.services import rbac as rbac_service

_engine = create_async_engine(
    "sqlite+aiosqlite://",
    poolclass=StaticPool,
    connect_args={"check_same_thread": False},
)
_TestSession = async_sessionmaker(_engine, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def _db():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with _TestSession() as session:
        await rbac_service.seed_default_rbac(session)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db():
    async with _TestSession() as session:
        yield session


async def _override_get_db():
    async with _TestSession() as session:
        yield session


@pytest_asyncio.fixture
async def client():
    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

