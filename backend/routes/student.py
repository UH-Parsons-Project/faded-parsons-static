from pathlib import Path


from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Student, TaskList
from ..student_auth import (
    get_current_student_session_no_update,
)

BASE_DIR = Path(__file__).resolve().parent.parent.parent

router = APIRouter()


@router.get("/student_start_page", response_class=FileResponse)
async def student_start_view():
    index_path = BASE_DIR / "templates" / "student_start_page.html"
    return FileResponse(index_path)


@router.get("/set/{unique_link_code}", response_class=FileResponse)
async def problemset_page(
    unique_link_code: str,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    stmt = select(TaskList).where(TaskList.unique_link_code == unique_link_code)
    result = await db.execute(stmt)
    problemset = result.scalar_one_or_none()

    if not problemset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set with code {unique_link_code} not found",
        )

    if student_session:
        return RedirectResponse(url=f"/set/{unique_link_code}/tasks", status_code=status.HTTP_303_SEE_OTHER)

    problemset_path = BASE_DIR / "templates" / "student_index.html"
    response = FileResponse(problemset_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    return response


@router.get("/set/{unique_link_code}/tasks", response_class=FileResponse)
async def problemset_tasks_page(
    unique_link_code: str,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    stmt = select(TaskList).where(TaskList.unique_link_code == unique_link_code)
    result = await db.execute(stmt)
    problemset = result.scalar_one_or_none()

    if not problemset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set with code {unique_link_code} not found",
        )

    if not student_session:
        return RedirectResponse(url=f"/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    tasks_path = BASE_DIR / "templates" / "problemset.html"
    response = FileResponse(tasks_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    return response


@router.get("/set/{unique_link_code}/tasks/{task_id:int}", response_class=FileResponse)
async def problemset_task_page(
    unique_link_code: str,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    stmt = select(TaskList).where(TaskList.unique_link_code == unique_link_code)
    result = await db.execute(stmt)
    problemset = result.scalar_one_or_none()

    if not problemset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set with code {unique_link_code} not found",
        )

    if not student_session:
        return RedirectResponse(url=f"/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    task_path = BASE_DIR / "templates" / "student_problem.html"
    response = FileResponse(task_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    response.headers["X-Task-Id"] = str(task_id)
    return response


@router.get("/set/{unique_link_code}/tasks/{task_id:int}/start", response_class=FileResponse)
async def problemset_task_start_page(
    unique_link_code: str,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    student_session: Student | None = Depends(get_current_student_session_no_update),
):
    stmt = select(TaskList).where(TaskList.unique_link_code == unique_link_code)
    result = await db.execute(stmt)
    problemset = result.scalar_one_or_none()

    if not problemset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem set with code {unique_link_code} not found",
        )

    if not student_session:
        return RedirectResponse(url=f"/set/{unique_link_code}", status_code=status.HTTP_303_SEE_OTHER)

    start_path = BASE_DIR / "templates" / "student_start_page.html"
    response = FileResponse(start_path)
    response.headers["X-Problemset-Code"] = unique_link_code
    response.headers["X-Task-Id"] = str(task_id)
    return response


@router.get("/student_register", response_class=FileResponse)
async def student_register_page():
    register_path = BASE_DIR / "templates" / "student_register.html"
    return FileResponse(register_path)

