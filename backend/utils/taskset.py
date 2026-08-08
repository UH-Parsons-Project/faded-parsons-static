from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import TaskSetItem, TaskSetViewer


async def has_task_set_view_access(task_set, current_user, db: AsyncSession) -> bool:
    """Return True if current_user can view task_set.

    Kept as a small shared helper to avoid duplicated implementations across
    multiple modules.
    """
    if getattr(current_user, "is_admin_teacher", False) or task_set.teacher_id == current_user.id:
        return True

    result = await db.execute(
        select(TaskSetViewer).where(
            TaskSetViewer.task_set_id == task_set.id,
            TaskSetViewer.teacher_id == current_user.id,
        )
    )
    return result.scalar_one_or_none() is not None


async def require_task_set_view_access(task_set, current_user, db: AsyncSession) -> None:
    if not await has_task_set_view_access(task_set, current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this task set",
        )


async def can_view_task_in_task_set(task, task_set, current_user, db: AsyncSession) -> bool:
    """Return True if the user can view this task within the given task set."""
    if getattr(current_user, "is_admin_teacher", False):
        return True

    if task.is_public or task.created_by_teacher_id == current_user.id:
        return True

    task_in_set_result = await db.execute(
        select(TaskSetItem).where(
            TaskSetItem.task_set_id == task_set.id,
            TaskSetItem.task_id == task.id,
        )
    )
    if task_in_set_result.scalar_one_or_none() is None:
        return False

    return await has_task_set_view_access(task_set, current_user, db)
