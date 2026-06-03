from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pathlib import Path

from ...database import get_db
from ...auth import get_current_user
from ...models import Parsons, TaskSet
from ...utils.taskset import can_view_task_in_task_set
from ..utils.commons import set_no_cache_headers, require_session_or_redirect

router = APIRouter()

# Project root (same as BASE_DIR in main.py)
BASE_DIR = Path(__file__).resolve().parents[3]

def _not_found_page() -> FileResponse:
    response = FileResponse(BASE_DIR / "templates" / "not_found.html", status_code=404)
    return set_no_cache_headers(response)


@router.get("/task-statistics", response_class=HTMLResponse)
async def task_statistics_view(request: Request, db: AsyncSession = Depends(get_db)):
    redirect = await require_session_or_redirect(get_current_user, "/", request, db)
    if redirect:
        return redirect

    task_id_raw = request.query_params.get("id")
    if task_id_raw:
        try:
            task_id = int(task_id_raw)
        except ValueError:
            return _not_found_page()

        current_user = await get_current_user(request, db)
        task_result = await db.execute(select(Parsons).where(Parsons.id == task_id))
        task = task_result.scalar_one_or_none()
        if task is None:
            return _not_found_page()

        if not task.is_public and task.created_by_teacher_id != current_user.id:
            task_set_code = request.query_params.get("task_set")
            if not task_set_code:
                return _not_found_page()

            task_set_result = await db.execute(
                select(TaskSet).where(TaskSet.unique_link_code == task_set_code)
            )
            task_set = task_set_result.scalar_one_or_none()
            if task_set is None or not await can_view_task_in_task_set(task, task_set, current_user, db):
                return _not_found_page()

    statistics_path = BASE_DIR / "templates" / "task_statistics.html"
    response = FileResponse(statistics_path)
    return set_no_cache_headers(response)


@router.get("/student-attempts", response_class=HTMLResponse)
async def student_attempts_page(request: Request, db: AsyncSession = Depends(get_db)):
    redirect = await require_session_or_redirect(get_current_user, "/", request, db)
    if redirect:
        return redirect

    attempts_path = BASE_DIR / "templates" / "student_attempts.html"
    response = FileResponse(attempts_path)
    return set_no_cache_headers(response)


@router.get("/student-task-statistics", response_class=HTMLResponse)
async def student_task_statistics_page(request: Request, db: AsyncSession = Depends(get_db)):
    redirect = await require_session_or_redirect(get_current_user, "/", request, db)
    if redirect:
        return redirect

    stats_path = BASE_DIR / "templates" / "student_task_statistics.html"
    response = FileResponse(stats_path)
    return set_no_cache_headers(response)
