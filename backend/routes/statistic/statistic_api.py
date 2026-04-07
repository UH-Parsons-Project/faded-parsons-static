from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, Integer, func

from ...database import get_db
from ...models import (
    Parsons,
    Student,
    StudentTaskSetEnrollment,
    TaskAttempt,
    TaskSet,
    TaskSetItem,
    TaskStart,
    ModelAnswer,
)
from ...pydantic import (
    StudentTaskAttemptResponse,
    StudentTaskStatisticsResponse,
)
from ...auth import CurrentUser
from utils import has_user_added_own_code, _clean_mistake_code, _mistake_code_fingerprint
from datetime import datetime, timezone

router = APIRouter()


async def _get_model_answer_for_task(task: Parsons, db: AsyncSession) -> str | None:
    result = await db.execute(
        select(ModelAnswer.answer_code).where(ModelAnswer.parsons_id == task.id)
    )
    return result.scalar_one_or_none()


async def has_task_set_view_access(
    task_set: TaskSet,
    current_user: CurrentUser,
    db: AsyncSession
) -> bool:
    from ...models import TaskSetViewer

    if current_user.has_data_access or task_set.teacher_id == current_user.id:
        return True

    result = await db.execute(
        select(TaskSetViewer).where(
            TaskSetViewer.task_set_id == task_set.id,
            TaskSetViewer.teacher_id == current_user.id,
        )
    )
    return result.scalar_one_or_none() is not None


async def require_task_set_view_access(
    task_set: TaskSet,
    current_user: CurrentUser,
    db: AsyncSession
) -> None:
    if not await has_task_set_view_access(task_set, current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this task set"
        )


@router.get("/api/students/{student_username}/attempts", response_model=list[StudentTaskAttemptResponse])
async def get_student_attempts(
    student_username: str,
    set_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import func

    stmt = select(TaskSet).where(TaskSet.id == set_id)
    result = await db.execute(stmt)
    task_set = result.scalar_one_or_none()

    if not task_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task list with id {set_id} not found"
        )

    await require_task_set_view_access(task_set, current_user, db)

    task_ids_stmt = select(TaskSetItem.task_id).where(TaskSetItem.task_set_id == set_id)
    task_ids_result = await db.execute(task_ids_stmt)
    task_ids = [row[0] for row in task_ids_result.all()]

    if not task_ids:
        return []

    stmt = (
        select(
            Parsons.id,
            Parsons.title,
            Parsons.task_type,
            func.count(TaskAttempt.id).label('attempts'),
            func.sum(func.cast(TaskAttempt.success, Integer)).label('success_count'),
            func.max(TaskAttempt.completed_at).label('last_attempt_at')
        )
        .join(TaskAttempt, TaskAttempt.task_id == Parsons.id)
        .join(Student, Student.id == TaskAttempt.student_id)
        .where(Student.username == student_username)
        .where(Parsons.id.in_(task_ids))
        .group_by(Parsons.id, Parsons.title, Parsons.task_type)
        .order_by(func.max(TaskAttempt.completed_at).desc())
    )

    result = await db.execute(stmt)
    attempts = result.all()

    return [
        StudentTaskAttemptResponse(
            task_id=attempt.id,
            task_title=attempt.title,
            task_type=attempt.task_type,
            attempts=attempt.attempts,
            success_count=attempt.success_count or 0,
            last_attempt_at=attempt.last_attempt_at.isoformat() if attempt.last_attempt_at else ""
        )
        for attempt in attempts
    ]


@router.get("/api/students/{student_username}/tasks/{task_id}/statistics", response_model=StudentTaskStatisticsResponse)
async def get_student_task_statistics(
    student_username: str,
    task_id: int,
    set_id: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(TaskSet).where(TaskSet.id == set_id)
    result = await db.execute(stmt)
    task_set = result.scalar_one_or_none()

    if not task_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task list with id {set_id} not found"
        )

    await require_task_set_view_access(task_set, current_user, db)

    task_result = await db.execute(select(Parsons).where(Parsons.id == task_id))
    task = task_result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id {task_id} not found"
        )

    stmt = (
        select(TaskAttempt, TaskStart)
        .join(Student, Student.id == TaskAttempt.student_id)
        .join(TaskStart, TaskStart.id == TaskAttempt.task_start_id)
        .where(Student.username == student_username)
        .where(TaskAttempt.task_id == task_id)
        .order_by(TaskAttempt.completed_at.asc())
    )

    result = await db.execute(stmt)
    attempts_with_starts = result.all()

    attempts_data = [(attempt, task_start) for attempt, task_start in attempts_with_starts]

    empty_attempts_count = 0
    filtered_attempts_data = []
    for attempt, task_start in attempts_data:
        if not (
            attempt.submitted_inputs and isinstance(attempt.submitted_inputs, dict)
        ):
            filtered_attempts_data.append((attempt, task_start))
            continue

        code = attempt.submitted_inputs.get("code", "")
        if not code:
            filtered_attempts_data.append((attempt, task_start))
        elif has_user_added_own_code(code, task.code_blocks):
            filtered_attempts_data.append((attempt, task_start))
        else:
            empty_attempts_count += 1

    attempts_data = filtered_attempts_data

    if not attempts_data:
        return StudentTaskStatisticsResponse(
            task_name=task.title,
            task_description=task.description,
            model_answer=await _get_model_answer_for_task(task, db),
            student_username=student_username,
            total_attempts=0,
            successful_attempts=0,
            failed_attempts=0,
            empty_attempts=0,
            time_to_first_success=None,
            time_to_first_fail=None,
            attempts_detail=[]
        )

    successful_attempts = sum(1 for a, _ in attempts_data if a.success)
    failed_attempts = sum(1 for a, _ in attempts_data if not a.success)

    first_success_pair = next(((a, ts) for a, ts in attempts_data if a.success), None)
    time_to_first_success = None
    if first_success_pair:
        attempt, task_start = first_success_pair
        if task_start and task_start.started_at and attempt.completed_at:
            seconds = (attempt.completed_at - task_start.started_at).total_seconds()
            time_to_first_success = {"seconds": seconds}

    first_fail_pair = next(((a, ts) for a, ts in attempts_data if not a.success), None)
    time_to_first_fail = None
    if first_fail_pair:
        attempt, task_start = first_fail_pair
        if task_start and task_start.started_at and attempt.completed_at:
            seconds = (attempt.completed_at - task_start.started_at).total_seconds()
            time_to_first_fail = {"seconds": seconds}

    attempts_detail = []
    for i, (attempt, task_start) in enumerate(attempts_data, 1):
        time_taken = (attempt.completed_at - task_start.started_at).total_seconds() \
            if task_start and task_start.started_at and attempt.completed_at else None
        detail = {
            "attempt_number": i,
            "success": attempt.success,
            "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
            "time_taken": time_taken,
            "code": attempt.submitted_inputs.get("code") if attempt.submitted_inputs else None,
        }
        attempts_detail.append(detail)

    return StudentTaskStatisticsResponse(
        task_name=task.title,
        task_description=task.description,
        model_answer=await _get_model_answer_for_task(task, db),
        student_username=student_username,
        total_attempts=len(attempts_data),
        successful_attempts=successful_attempts,
        failed_attempts=failed_attempts,
        empty_attempts=empty_attempts_count,
        time_to_first_success=time_to_first_success,
        time_to_first_fail=time_to_first_fail,
        attempts_detail=attempts_detail
    )


@router.get("/api/tasks/{task_id}/statistics")
async def get_task_statistics(
    task_id: int,
    current_user: CurrentUser,
    task_set_code: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    task_result = await db.execute(select(Parsons).where(Parsons.id == task_id))
    task = task_result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id {task_id} not found"
        )

    attempts_query = (
        select(TaskAttempt, TaskStart)
        .join(TaskStart, TaskStart.id == TaskAttempt.task_start_id)
        .where(TaskAttempt.task_id == task_id)
    )

    if task_set_code:
        task_set_result = await db.execute(
            select(TaskSet).where(TaskSet.unique_link_code == task_set_code)
        )
        task_set = task_set_result.scalar_one_or_none()

        if not task_set:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Problem set '{task_set_code}' not found",
            )

        await require_task_set_view_access(task_set, current_user, db)

        attempts_query = (
            select(TaskAttempt, TaskStart)
            .join(TaskStart, TaskStart.id == TaskAttempt.task_start_id)
            .join(Student, TaskAttempt.student_id == Student.id)
            .join(StudentTaskSetEnrollment, StudentTaskSetEnrollment.student_id == Student.id)
            .where(
                TaskAttempt.task_id == task_id,
                StudentTaskSetEnrollment.task_set_id == task_set.id
            )
        )

    attempts_result = await db.execute(attempts_query)
    attempts_data = [(attempt, task_start) for attempt, task_start in attempts_result.all()]

    filtered_attempts_data = []
    for attempt, task_start in attempts_data:
        if not (attempt.submitted_inputs and isinstance(attempt.submitted_inputs, dict)):
            filtered_attempts_data.append((attempt, task_start))
            continue

        code = attempt.submitted_inputs.get("code", "")
        if not code:
            filtered_attempts_data.append((attempt, task_start))
        elif has_user_added_own_code(code, task.code_blocks):
            filtered_attempts_data.append((attempt, task_start))

    attempts_data = filtered_attempts_data

    if not attempts_data:
        return {
            "task_name": task.title,
            "model_answer": await _get_model_answer_for_task(task, db),
            "total_completions": 0,
            "students_attempted": 0,
            "students_completed": 0,
            "avg_tries": 0,
            "time_to_first_fail": {"avg": 0, "min": 0, "max": 0},
            "time_to_first_success": {"avg": 0, "min": 0, "max": 0},
            "thinking_time": None,
            "number_of_moves": None,
            "common_mistakes": []
        }

    successful_attempts = [(a, ts) for a, ts in attempts_data if a.success]
    failed_attempts = [(a, ts) for a, ts in attempts_data if not a.success]

    students_attempted = len(set(a.student_id for a, _ in attempts_data))
    students_completed = len(set(a.student_id for a, _ in successful_attempts))

    student_attempts: dict = {}
    for attempt, task_start in attempts_data:
        student_attempts.setdefault(attempt.student_id, []).append((attempt, task_start))

    tries_before_success = []
    for session_attempts in student_attempts.values():
        sorted_attempts = sorted(
            session_attempts,
            key=lambda pair: pair[0].completed_at or datetime.now(timezone.utc)
        )
        for idx, (attempt, _) in enumerate(sorted_attempts):
            if attempt.success:
                tries_before_success.append(idx + 1)
                break

    avg_tries = sum(tries_before_success) / len(tries_before_success) if tries_before_success else 0

    tff_values = []
    for session_attempts in student_attempts.values():
        sorted_attempts = sorted(
            session_attempts,
            key=lambda pair: pair[0].completed_at or datetime.now(timezone.utc)
        )
        for attempt, task_start in sorted_attempts:
            if not attempt.success and attempt.completed_at and task_start and task_start.started_at:
                tff_values.append((attempt.completed_at - task_start.started_at).total_seconds())
                break
    tff = {
        "avg": round(sum(tff_values) / len(tff_values), 2) if tff_values else 0,
        "min": round(min(tff_values), 2) if tff_values else 0,
        "max": round(max(tff_values), 2) if tff_values else 0,
    }

    tfs_values = []
    for session_attempts in student_attempts.values():
        sorted_attempts = sorted(
            session_attempts,
            key=lambda pair: pair[0].completed_at or datetime.now(timezone.utc)
        )
        for attempt, task_start in sorted_attempts:
            if attempt.success and attempt.completed_at and task_start and task_start.started_at:
                tfs_values.append((attempt.completed_at - task_start.started_at).total_seconds())
                break

    tfs = {
        "avg": round(sum(tfs_values) / len(tfs_values), 2) if tfs_values else 0,
        "min": round(min(tfs_values), 2) if tfs_values else 0,
        "max": round(max(tfs_values), 2) if tfs_values else 0,
    }

    mistake_counts: dict = {}
    for attempt, _ in failed_attempts:
        if attempt.submitted_inputs and isinstance(attempt.submitted_inputs, dict):
            code = attempt.submitted_inputs.get("code", "")
            if code:
                normalized_code = _clean_mistake_code(code)
                if not normalized_code:
                    continue

                fingerprint = _mistake_code_fingerprint(normalized_code)
                if fingerprint not in mistake_counts:
                    mistake_counts[fingerprint] = {"code": normalized_code, "count": 0}

                mistake_counts[fingerprint]["count"] += 1
                if len(normalized_code) < len(mistake_counts[fingerprint]["code"]):
                    mistake_counts[fingerprint]["code"] = normalized_code

    common_mistakes = [
        {"code": mistake["code"], "count": mistake["count"]}
        for mistake in sorted(mistake_counts.values(), key=lambda item: item["count"], reverse=True)[:5]
    ]

    return {
        "task_name": task.title,
        "model_answer": await _get_model_answer_for_task(task, db),
        "total_completions": len(attempts_data),
        "students_attempted": students_attempted,
        "students_completed": students_completed,
        "avg_tries": round(avg_tries, 2),
        "time_to_first_fail": tff,
        "time_to_first_success": tfs,
        "thinking_time": None,
        "number_of_moves": None,
        "common_mistakes": common_mistakes,
    }
