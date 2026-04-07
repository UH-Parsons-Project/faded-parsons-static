"""Unit tests for backend.seed module."""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import StaticPool

from backend import seed as seed_module
from backend.models import Parsons, TaskSet, TaskSetItem, Teacher


DEFAULT_SEED_USERNAME = "mattiruotsalainen"
DEFAULT_SEED_EMAIL = "matti.ruotsalainen@example.com"


@pytest_asyncio.fixture
async def seed_test_engine():
    """Create in-memory DB engine for seed tests."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(seed_module.Teacher.metadata.create_all)

    yield engine

    await engine.dispose()


@pytest_asyncio.fixture
async def seed_sessionmaker(seed_test_engine):
    """Create async sessionmaker bound to test engine."""
    try:
        from sqlalchemy.ext.asyncio import async_sessionmaker

        return async_sessionmaker(
            seed_test_engine, class_=AsyncSession, expire_on_commit=False
        )
    except ImportError:  # pragma: no cover - fallback for old SQLAlchemy
        from sqlalchemy.orm import sessionmaker

        return sessionmaker(
            seed_test_engine, class_=AsyncSession, expire_on_commit=False
        )


class TestSeedDb:
    """Tests for seed_db orchestration and idempotency."""

    @pytest.mark.asyncio
    async def test_seed_db_creates_teacher_starter_list_and_two_items(
        self, seed_sessionmaker, monkeypatch
    ):
        monkeypatch.setattr(seed_module, "async_session", seed_sessionmaker)

        async def fake_migrate_tasks():
            async with seed_sessionmaker() as session:
                teacher_result = await session.execute(
                    select(Teacher).where(Teacher.username == DEFAULT_SEED_USERNAME)
                )
                teacher = teacher_result.scalar_one_or_none()
                assert teacher is not None

                task1 = Parsons(
                    created_by_teacher_id=teacher.id,
                    title="Seed Task 1",
                    description='{"description": "one"}',
                    task_instructions='{"task_instructions": "{}"}',
                    task_type="python",
                    code_blocks={"blocks": []},
                    correct_solution={"solution": []},
                    is_public=True,
                )
                task2 = Parsons(
                    created_by_teacher_id=teacher.id,
                    title="Seed Task 2",
                    description='{"description": "two"}',
                    task_instructions='{"task_instructions": "{}"}',
                    task_type="python",
                    code_blocks={"blocks": []},
                    correct_solution={"solution": []},
                    is_public=True,
                )
                session.add(task1)
                session.add(task2)
                await session.commit()

        monkeypatch.setattr(seed_module, "migrate_tasks", fake_migrate_tasks)

        await seed_module.seed_db()

        async with seed_sessionmaker() as session:
            teacher_count = await session.scalar(
                select(func.count()).select_from(Teacher).where(Teacher.username == DEFAULT_SEED_USERNAME)
            )
            assert teacher_count == 1

            starter_list_result = await session.execute(
                select(TaskSet).where(TaskSet.unique_link_code == "starter-list")
            )
            starter_list = starter_list_result.scalar_one_or_none()
            assert starter_list is not None

            items_result = await session.execute(
                select(TaskSetItem).where(TaskSetItem.task_set_id == starter_list.id)
            )
            items = items_result.scalars().all()
            assert len(items) == 2

    @pytest.mark.asyncio
    async def test_seed_db_existing_records_adds_only_missing_starter_item(
        self, seed_sessionmaker, monkeypatch
    ):
        monkeypatch.setattr(seed_module, "async_session", seed_sessionmaker)

        async with seed_sessionmaker() as session:
            teacher = Teacher(username=DEFAULT_SEED_USERNAME, email=DEFAULT_SEED_EMAIL)
            teacher.set_password("test1234")
            session.add(teacher)
            await session.commit()
            await session.refresh(teacher)

            task1 = Parsons(
                created_by_teacher_id=teacher.id,
                title="Task One",
                description='{"description": "one"}',
                task_instructions='{"task_instructions": "{}"}',
                task_type="python",
                code_blocks={"blocks": []},
                correct_solution={"solution": []},
                is_public=True,
            )
            task2 = Parsons(
                created_by_teacher_id=teacher.id,
                title="Task Two",
                description='{"description": "two"}',
                task_instructions='{"task_instructions": "{}"}',
                task_type="python",
                code_blocks={"blocks": []},
                correct_solution={"solution": []},
                is_public=True,
            )
            session.add(task1)
            session.add(task2)
            await session.commit()
            await session.refresh(task1)
            await session.refresh(task2)

            starter_list = TaskSet(
                teacher_id=teacher.id,
                title="Starter Task Set",
                unique_link_code="starter-list",
            )
            session.add(starter_list)
            await session.commit()
            await session.refresh(starter_list)

            session.add(TaskSetItem(task_set_id=starter_list.id, task_id=task1.id))
            await session.commit()

        migrate_mock = AsyncMock()
        monkeypatch.setattr(seed_module, "migrate_tasks", migrate_mock)

        await seed_module.seed_db()

        async with seed_sessionmaker() as session:
            teacher_count = await session.scalar(
                select(func.count()).select_from(Teacher).where(Teacher.username == DEFAULT_SEED_USERNAME)
            )
            assert teacher_count == 1

            list_count = await session.scalar(
                select(func.count()).select_from(TaskSet).where(TaskSet.unique_link_code == "starter-list")
            )
            assert list_count == 1

            starter_list_result = await session.execute(
                select(TaskSet).where(TaskSet.unique_link_code == "starter-list")
            )
            starter_list = starter_list_result.scalar_one_or_none()

            item_rows = await session.execute(
                select(TaskSetItem).where(TaskSetItem.task_set_id == starter_list.id)
            )
            items = item_rows.scalars().all()
            assert len(items) == 2
            assert len({item.task_id for item in items}) == 2

        migrate_mock.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_seed_db_skips_task_set_when_teacher_missing(
        self, seed_sessionmaker, monkeypatch
    ):
        monkeypatch.setattr(seed_module, "async_session", seed_sessionmaker)

        async def fake_migrate_without_teacher():
            # Remove the default teacher between phases so second phase returns early.
            async with seed_sessionmaker() as session:
                await session.execute(
                    delete(Teacher).where(Teacher.username == DEFAULT_SEED_USERNAME)
                )
                await session.commit()

        monkeypatch.setattr(seed_module, "migrate_tasks", fake_migrate_without_teacher)

        await seed_module.seed_db()

        async with seed_sessionmaker() as session:
            list_count = await session.scalar(
                select(func.count()).select_from(TaskSet).where(TaskSet.unique_link_code == "starter-list")
            )
            assert list_count == 0

    @pytest.mark.asyncio
    async def test_seed_db_when_starter_list_exists_and_already_has_seeded_items(
        self, seed_sessionmaker, monkeypatch
    ):
        monkeypatch.setattr(seed_module, "async_session", seed_sessionmaker)

        async with seed_sessionmaker() as session:
            teacher = Teacher(username=DEFAULT_SEED_USERNAME, email=DEFAULT_SEED_EMAIL)
            teacher.set_password("test1234")
            session.add(teacher)
            await session.commit()
            await session.refresh(teacher)

            task1 = Parsons(
                created_by_teacher_id=teacher.id,
                title="Task A",
                description='{"description": "a"}',
                task_instructions='{"task_instructions": "{}"}',
                task_type="python",
                code_blocks={"blocks": []},
                correct_solution={"solution": []},
                is_public=True,
            )
            task2 = Parsons(
                created_by_teacher_id=teacher.id,
                title="Task B",
                description='{"description": "b"}',
                task_instructions='{"task_instructions": "{}"}',
                task_type="python",
                code_blocks={"blocks": []},
                correct_solution={"solution": []},
                is_public=True,
            )
            session.add_all([task1, task2])
            await session.commit()
            await session.refresh(task1)
            await session.refresh(task2)

            starter = TaskSet(
                teacher_id=teacher.id,
                title="Starter Task Set",
                unique_link_code="starter-list",
            )
            session.add(starter)
            await session.commit()
            await session.refresh(starter)

            session.add_all(
                [
                    TaskSetItem(task_set_id=starter.id, task_id=task1.id),
                    TaskSetItem(task_set_id=starter.id, task_id=task2.id),
                ]
            )
            await session.commit()

        migrate_mock = AsyncMock()
        monkeypatch.setattr(seed_module, "migrate_tasks", migrate_mock)

        await seed_module.seed_db()

        async with seed_sessionmaker() as session:
            starter_result = await session.execute(
                select(TaskSet).where(TaskSet.unique_link_code == "starter-list")
            )
            starter = starter_result.scalar_one()

            items_result = await session.execute(
                select(TaskSetItem).where(TaskSetItem.task_set_id == starter.id)
            )
            items = items_result.scalars().all()
            assert len(items) == 2

        migrate_mock.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_seed_db_returns_early_when_less_than_two_tasks_available(
        self, seed_sessionmaker, monkeypatch
    ):
        monkeypatch.setattr(seed_module, "async_session", seed_sessionmaker)

        async def fake_migrate_with_single_task():
            async with seed_sessionmaker() as session:
                result = await session.execute(
                    select(Teacher).where(Teacher.username == DEFAULT_SEED_USERNAME)
                )
                teacher = result.scalar_one_or_none()
                assert teacher is not None

                session.add(
                    Parsons(
                        created_by_teacher_id=teacher.id,
                        title="Only Task",
                        description='{"description": "single"}',
                        task_instructions='{"task_instructions": "{}"}',
                        task_type="python",
                        code_blocks={"blocks": []},
                        correct_solution={"solution": []},
                        is_public=True,
                    )
                )
                await session.commit()

        monkeypatch.setattr(seed_module, "migrate_tasks", fake_migrate_with_single_task)

        await seed_module.seed_db()

        async with seed_sessionmaker() as session:
            starter_result = await session.execute(
                select(TaskSet).where(TaskSet.unique_link_code == "starter-list")
            )
            starter = starter_result.scalar_one_or_none()
            assert starter is not None

            items_count = await session.scalar(
                select(func.count()).select_from(TaskSetItem).where(TaskSetItem.task_set_id == starter.id)
            )
            assert items_count == 0
