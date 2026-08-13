from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...teacher_auth import get_current_user
from ...database import get_db
from ..utils.commons import require_session_or_redirect, set_no_cache_headers

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

router = APIRouter()


async def _render_teacher_page(request: Request, db: AsyncSession, template_name: str) -> FileResponse:
    redirect = await require_session_or_redirect(get_current_user, "/", request, db)
    if redirect:
        return redirect
    return set_no_cache_headers(FileResponse(BASE_DIR / "templates" / template_name))


@router.get("/global-statistics")
async def exercise_list(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
):
    return await _render_teacher_page(request, db, "global_statistics.html")



@router.get("/create-task", response_class=HTMLResponse)
@router.get("/create-task.html", response_class=HTMLResponse)
async def create_task_page(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
):
    return await _render_teacher_page(request, db, "create_task.html")


@router.get("/create-task-editor", response_class=HTMLResponse)
@router.get("/create-task-editor.html", response_class=HTMLResponse)
async def create_task_problem_page(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
):
    return await _render_teacher_page(request, db, "create_task_editor.html")


@router.get("/task-details", response_class=HTMLResponse)
async def task_details_page(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
):
    return await _render_teacher_page(request, db, "task_details.html")


@router.get("/task", response_class=HTMLResponse)
async def task_preview_page(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
):
    return await _render_teacher_page(request, db, "student_problem.html")




@router.get("/task-set-overview", response_class=HTMLResponse)
async def task_set_overview(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
):
    return await _render_teacher_page(request, db, "task_set_overview.html")


@router.get("/create-task-set", response_class=HTMLResponse)
async def create_task_set_page(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
):
    return await _render_teacher_page(request, db, "create_task_set.html")
