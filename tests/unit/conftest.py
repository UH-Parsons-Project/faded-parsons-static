"""
Pytest configuration and fixtures for unit tests.
"""

import os
import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.pool import StaticPool
from httpx import AsyncClient, ASGITransport

# Hard-pin unit tests to an isolated SQLite DB so they can never hit the
# Playwright/Postgres database, regardless of outer environment.
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["AUTO_INIT_DB"] = "false"
os.environ["TEST_MODE"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-for-unit-tests-only-never-use-in-prod"

# Handle different SQLAlchemy versions
try:
    from sqlalchemy.ext.asyncio import async_sessionmaker
except ImportError:
    from sqlalchemy.orm import sessionmaker
    async_sessionmaker = sessionmaker

from backend.database import Base, get_db
from backend.main import app
app.state.limiter.enabled = False
import secrets
from backend.models import Parsons, Student, StudentTaskSetEnrollment, TaskSet, TaskSetItem, Teacher, RegistrationToken
from backend.utils import generate_token, hash_token
import importlib
import sys

# Allow legacy `import utils` used by some tests to continue working by
# aliasing `backend.utils` as `utils` in sys.modules for the test run.
sys.modules.setdefault('utils', importlib.import_module('backend.utils'))


@pytest.fixture(scope="session", autouse=True)
def _assert_unit_tests_use_sqlite() -> None:
    """Safety check: prevent unit tests from ever using Postgres test DB."""
    from backend import database as db_module

    assert db_module.DATABASE_URL.startswith("sqlite+aiosqlite://"), (
        f"Unit tests must use SQLite, got DATABASE_URL={db_module.DATABASE_URL!r}"
    )


@pytest_asyncio.fixture
async def db_engine():
    """Create a test database engine with in-memory SQLite."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a database session for testing."""
    try:
        async_session_maker = async_sessionmaker(
            db_engine, class_=AsyncSession, expire_on_commit=False
        )
    except TypeError:
        # Fallback for older SQLAlchemy versions
        from sqlalchemy.orm import sessionmaker
        async_session_maker = sessionmaker(
            db_engine, class_=AsyncSession, expire_on_commit=False
        )

    async with async_session_maker() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session):
    """Create a test client with dependency overrides."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_teacher(db_session) -> Teacher:
    """Create a test teacher user."""
    teacher = Teacher(
        username="testteacher",
        email="test@example.com",
        is_active=True
    )
    teacher.set_password("testpassword123")

    db_session.add(teacher)
    await db_session.commit()
    await db_session.refresh(teacher)

    return teacher


@pytest_asyncio.fixture
async def inactive_teacher(db_session) -> Teacher:
    """Create an inactive test teacher user."""
    teacher = Teacher(
        username="inactiveteacher",
        email="inactive@example.com",
        is_active=False
    )
    teacher.set_password("testpassword123")

    db_session.add(teacher)
    await db_session.commit()
    await db_session.refresh(teacher)

    return teacher


@pytest.fixture
def valid_token_data() -> dict:
    """Return valid token data for testing."""
    return {"sub": "testteacher"}


@pytest_asyncio.fixture
async def registration_token(db_session, test_teacher) -> str:
    """Create a registration token in the database and return the plain token."""
    plain_token = generate_token(length=15)
    token_hash = hash_token(plain_token)
    
    reg_token = RegistrationToken(
        token_hash=token_hash,
        created_by_admin_id=test_teacher.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db_session.add(reg_token)
    await db_session.commit()
    
    return plain_token


@pytest_asyncio.fixture
async def valid_registration_payload(registration_token) -> dict:
    """Return valid registration payload with token from database."""
    return {
        "username": "newteacher",
        "password": "password123",
        "password_confirm": "password123",
        "email": "new@example.com",
        "registration_token": registration_token,
    }


# ---------------------------------------------------------------------------
# Shared domain-object fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def task(db_session, test_teacher) -> Parsons:
    """A single public Parsons task owned by test_teacher."""
    t = Parsons(
        created_by_teacher_id=test_teacher.id,
        title="Hello World",
        description='{"description": "Print hello world."}',
        task_instructions="Arrange the blocks to print 'Hello, World!'",
        task_type="python",
        code_blocks={"blocks": ["print('Hello, World!')"]},
        correct_solution={"solution": ["print('Hello, World!')"]},
        is_public=True,
    )
    db_session.add(t)
    await db_session.commit()
    await db_session.refresh(t)
    return t


@pytest_asyncio.fixture
async def private_task(db_session, test_teacher) -> Parsons:
    """A private (not public) Parsons task owned by test_teacher."""
    t = Parsons(
        created_by_teacher_id=test_teacher.id,
        title="Private Task",
        task_instructions='{"description": "Internal only."}',
        description="Arrange the blocks for an internal task.",
        task_type="python",
        code_blocks={"blocks": []},
        correct_solution={"solution": []},
        is_public=False,
    )
    db_session.add(t)
    await db_session.commit()
    await db_session.refresh(t)
    return t


@pytest_asyncio.fixture
async def task_set(db_session, test_teacher) -> TaskSet:
    """A task set (TaskSet) owned by test_teacher."""
    ps = TaskSet(
        teacher_id=test_teacher.id,
        title="Week 1 Exercises",
        unique_link_code="WEEK1",
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)
    return ps


@pytest_asyncio.fixture
async def task_set_with_task(db_session, task_set, task) -> tuple[TaskSet, Parsons]:
    """A task set that already contains *task*."""
    item = TaskSetItem(task_set_id=task_set.id, task_id=task.id)
    db_session.add(item)
    await db_session.commit()
    return task_set, task


@pytest_asyncio.fixture
async def student_session(db_session, task_set) -> Student:
    """A student account associated with *task_set*, with a valid session_token."""
    ss = Student(
        username="student1",
        email="student1@example.com",
        session_token=secrets.token_urlsafe(32),
    )
    ss.set_password("studentpass123")
    db_session.add(ss)
    await db_session.flush()
    db_session.add(StudentTaskSetEnrollment(student_id=ss.id, task_set_id=task_set.id))
    await db_session.commit()
    await db_session.refresh(ss)
    return ss