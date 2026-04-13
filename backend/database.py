"""
Database configuration and session management.
"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

# Connection string for PostgreSQL. Uses environment variable if set, otherwise defaults to local Docker setup.
# Format: postgresql+asyncpg://username:password@host:port/database_name
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@db:5432/faded_parsons"
)

# Engine manages the connection pool to the database.
# By default `echo` is disabled to avoid noisy SQL logs in normal runs.
# Set environment variable `SQL_ECHO=true` to enable SQL statement logging for debugging.
echo_flag = os.getenv("SQL_ECHO", "false").lower() in ("1", "true", "yes")
engine = create_async_engine(DATABASE_URL, echo=echo_flag)

# Session factory creates new database sessions. expire_on_commit=False keeps objects usable after commit.
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    """Base class for all database models. All models inherit from this to share the same metadata."""

async def get_db():
    """
    FastAPI dependency that provides a database session.
    Usage: Add 'db: AsyncSession = Depends(get_db)' to route parameters.
    The session is automatically closed when the request completes.
    """
    async with async_session() as session:
        yield session


async def init_db():
    """
    Create all database tables based on models that inherit from Base.
    Called once on application startup.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)
