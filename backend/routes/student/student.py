from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...models import Student, StudentTaskSetEnrollment, TaskSet
from ...student_auth import get_current_student_session_no_update
from ..utils.commons import get_task_set_by_code_or_404, resolve_task_id_in_set_or_404

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

router = APIRouter()


def _closed_response() -> FileResponse:
    return FileResponse(BASE_DIR / "templates" / "task_set_closed.html")


def _render_student_page(template_name: str, unique_link_code: str | None = None, task_id: int | None = None) -> FileResponse:
    response = FileResponse(BASE_DIR / "templates" / template_name)
    if unique_link_code:
        response.headers["X-Problemset-Code"] = unique_link_code
    if task_id is not None:
        response.headers["X-Task-Id"] = str(task_id)
    return response


async def _check_enrollment(db: AsyncSession, student_session: Student | None, task_set: TaskSet) -> bool:
    if not student_session:
        return False
    enrollment = await db.execute(
        select(StudentTaskSetEnrollment).where(
            StudentTaskSetEnrollment.student_id == student_session.id,
            StudentTaskSetEnrollment.task_set_id == task_set.id,
        )
    )
    return enrollment.scalar_one_or_none() is not None


def _is_expired(task_set) -> bool:
    if not task_set.expires_at:
        return False
    expires = task_set.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > expires


@router.get("/{username}/set/{unique_link_code}", response_class=FileResponse)
async def task_set_page(
    username: str,
    unique_link_code: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    student_session: Annotated[Student | None, Depends(get_current_student_session_no_update)],
):
    task_set = await get_task_set_by_code_or_404(db, TaskSet, unique_link_code)

    if _is_expired(task_set):
        return _closed_response()

    if await _check_enrollment(db, student_session, task_set):
        return RedirectResponse(url=f"/{username}/set/{unique_link_code}/tasks", status_code=status.HTTP_303_SEE_OTHER)

    return _render_student_page("student_index.html", unique_link_code)


@router.get("/{username}/set/{unique_link_code}/tasks", response_class=FileResponse)
async def task_set_tasks_page(
    username: str,
    unique_link_code: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    student_session: Annotated[Student | None, Depends(get_current_student_session_no_update)],
):
    task_set = await get_task_set_by_code_or_404(db, TaskSet, unique_link_code)

    if _is_expired(task_set):
        return _closed_response()

    if not await _check_enrollment(db, student_session, task_set):
        return RedirectResponse(url=f"/{username}/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    return _render_student_page("task_set.html", unique_link_code)


@router.get("/{username}/set/{unique_link_code}/tasks/{task_id:int}", response_class=FileResponse)
async def task_set_task_page(
    username: str,
    unique_link_code: str,
    task_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    student_session: Annotated[Student | None, Depends(get_current_student_session_no_update)],
):
    task_set = await get_task_set_by_code_or_404(db, TaskSet, unique_link_code)

    if _is_expired(task_set):
        return _closed_response()

    await resolve_task_id_in_set_or_404(db, task_set, task_id, visible_only=True)

    if not await _check_enrollment(db, student_session, task_set):
        return RedirectResponse(url=f"/{username}/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    return _render_student_page("student_problem.html", unique_link_code, task_id)


@router.get("/{username}/set/{unique_link_code}/tasks/{task_id:int}/start", response_class=FileResponse)
async def task_set_task_start_page(
    username: str,
    unique_link_code: str,
    task_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    student_session: Annotated[Student | None, Depends(get_current_student_session_no_update)],
):
    task_set = await get_task_set_by_code_or_404(db, TaskSet, unique_link_code)

    if _is_expired(task_set):
        return _closed_response()

    await resolve_task_id_in_set_or_404(db, task_set, task_id, visible_only=True)

    if not await _check_enrollment(db, student_session, task_set):
        return RedirectResponse(url=f"/{username}/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    return _render_student_page("student_start_task.html", unique_link_code, task_id)


@router.get("/demo", response_class=FileResponse)
@router.get("/{username}/set/{unique_link_code}/tasks/demo", response_class=FileResponse)
@router.get("/{username}/set/{unique_link_code}/tasks/demo/start", response_class=FileResponse)
async def demo_task_page():
    demo_path = BASE_DIR / "templates" / "demo.html"
    return FileResponse(demo_path)


@router.get("/student-register", response_class=FileResponse)
async def student_register_page():
    student_register_path = BASE_DIR / "templates" / "student_register.html"
    return FileResponse(student_register_path)


@router.get("/student/profile", response_class=FileResponse)
async def student_profile_page():
    profile_path = BASE_DIR / "templates" / "student_profile.html"
    return FileResponse(profile_path)

