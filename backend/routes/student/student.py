from pathlib import Path


from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...models import Student, StudentTaskSetEnrollment, TaskSet
from ...student_auth import (
    get_current_student_session_no_update,
)
from ..utils.commons import get_task_set_by_code_or_404, resolve_task_id_in_set_or_404

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

router = APIRouter()


@router.get("/student-start-task", response_class=FileResponse)
async def student_start_view():
    index_path = BASE_DIR / "templates" / "student_start_task.html"
    return FileResponse(index_path)


@router.get("/set/{unique_link_code}", response_class=FileResponse)
async def task_set_page(
    unique_link_code: str,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    task_set = await get_task_set_by_code_or_404(db, TaskSet, unique_link_code)

    if student_session:
        enrollment = await db.execute(
            select(StudentTaskSetEnrollment).where(
                StudentTaskSetEnrollment.student_id == student_session.id,
                StudentTaskSetEnrollment.task_set_id == task_set.id,
            )
        )
        if enrollment.scalar_one_or_none():
            return RedirectResponse(url=f"/set/{unique_link_code}/tasks", status_code=status.HTTP_303_SEE_OTHER)

    task_set_path = BASE_DIR / "templates" / "student_index.html"
    response = FileResponse(task_set_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    return response


@router.get("/set/{unique_link_code}/tasks", response_class=FileResponse)
async def task_set_tasks_page(
    unique_link_code: str,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    task_set = await get_task_set_by_code_or_404(db, TaskSet, unique_link_code)

    if not student_session:
        return RedirectResponse(url=f"/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    enrollment = await db.execute(
        select(StudentTaskSetEnrollment).where(
            StudentTaskSetEnrollment.student_id == student_session.id,
            StudentTaskSetEnrollment.task_set_id == task_set.id,
        )
    )
    if not enrollment.scalar_one_or_none():
        return RedirectResponse(url=f"/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    tasks_path = BASE_DIR / "templates" / "task_set.html"
    response = FileResponse(tasks_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    return response


@router.get("/set/{unique_link_code}/tasks/{task_id:int}", response_class=FileResponse)
async def task_set_task_page(
    unique_link_code: str,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    task_set = await get_task_set_by_code_or_404(db, TaskSet, unique_link_code)
    resolved_task_id = await resolve_task_id_in_set_or_404(db, task_set, task_id, visible_only=True)

    if not student_session:
        return RedirectResponse(url=f"/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    enrollment = await db.execute(
        select(StudentTaskSetEnrollment).where(
            StudentTaskSetEnrollment.student_id == student_session.id,
            StudentTaskSetEnrollment.task_set_id == task_set.id,
        )
    )
    if not enrollment.scalar_one_or_none():
        return RedirectResponse(url=f"/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    task_path = BASE_DIR / "templates" / "student_problem.html"
    response = FileResponse(task_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    response.headers["X-Task-Id"] = str(resolved_task_id)
    response.headers["X-Task-Number"] = str(task_id)
    return response


@router.get("/set/{unique_link_code}/tasks/{task_id:int}/start", response_class=FileResponse)
async def task_set_task_start_page(
    unique_link_code: str,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    task_set = await get_task_set_by_code_or_404(db, TaskSet, unique_link_code)
    resolved_task_id = await resolve_task_id_in_set_or_404(db, task_set, task_id, visible_only=True)

    if not student_session:
        return RedirectResponse(url=f"/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    start_path = BASE_DIR / "templates" / "student_start_task.html"
    response = FileResponse(start_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    response.headers["X-Task-Id"] = str(resolved_task_id)
    response.headers["X-Task-Number"] = str(task_id)
    return response


@router.get("/demo", response_class=FileResponse)
async def demo_task_page():
    demo_path = BASE_DIR / "templates" / "demo.html"
    return FileResponse(demo_path)


@router.get("/student-register", response_class=FileResponse)
async def student_register_page():
    student_register_path = BASE_DIR / "templates" / "student_register.html"
    return FileResponse(student_register_path)
