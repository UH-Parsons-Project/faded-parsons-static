from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import TaskSet, TaskSetItem, StudentTaskSetEnrollment


async def is_task_editable(task_id: int, teacher_id: int, db: AsyncSession) -> bool:
    """Return True only if the task can be safely edited.

    A task is editable when:
    - No other teacher has added it to any of their task sets.
    - The creating teacher may have it in their own task sets, but none of those
      sets may have any enrolled students.
    """
    other_teacher_stmt = (
        select(func.count(TaskSet.id))
        .join(TaskSetItem, TaskSetItem.task_set_id == TaskSet.id)
        .where(TaskSetItem.task_id == task_id, TaskSet.teacher_id != teacher_id)
    )
    other_count = (await db.execute(other_teacher_stmt)).scalar() or 0
    if other_count > 0:
        return False

    enrolled_stmt = (
        select(func.count(StudentTaskSetEnrollment.id))
        .join(TaskSet, TaskSet.id == StudentTaskSetEnrollment.task_set_id)
        .join(TaskSetItem, TaskSetItem.task_set_id == TaskSet.id)
        .where(TaskSetItem.task_id == task_id, TaskSet.teacher_id == teacher_id)
    )
    enrolled_count = (await db.execute(enrolled_stmt)).scalar() or 0
    return enrolled_count == 0
