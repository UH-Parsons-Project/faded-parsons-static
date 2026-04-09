from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path

from ...database import get_db
from ...auth import get_current_user
from ..utils.commons import set_no_cache_headers, require_session_or_redirect

router = APIRouter()

# Project root (same as BASE_DIR in main.py)
BASE_DIR = Path(__file__).resolve().parents[3]

@router.get("/task-statistics", response_class=HTMLResponse)
async def task_statistics_view(request: Request, db: AsyncSession = Depends(get_db)):
    redirect = await require_session_or_redirect(get_current_user, "/", request, db)
    if redirect:
        return redirect

    statistics_path = BASE_DIR / "templates" / "task_statistics.html"
    response = FileResponse(statistics_path)
    return set_no_cache_headers(response)


@router.get("/student_attempts", response_class=HTMLResponse)
async def student_attempts_page(request: Request, db: AsyncSession = Depends(get_db)):
    redirect = await require_session_or_redirect(get_current_user, "/", request, db)
    if redirect:
        return redirect

    attempts_path = BASE_DIR / "templates" / "student_attempts.html"
    response = FileResponse(attempts_path)
    return set_no_cache_headers(response)


@router.get("/student_task_statistics", response_class=HTMLResponse)
async def student_task_statistics_page(request: Request, db: AsyncSession = Depends(get_db)):
    redirect = await require_session_or_redirect(get_current_user, "/", request, db)
    if redirect:
        return redirect

    stats_path = BASE_DIR / "templates" / "student_task_statistics.html"
    response = FileResponse(stats_path)
    return set_no_cache_headers(response)
