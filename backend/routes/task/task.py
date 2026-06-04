from pathlib import Path

from fastapi import APIRouter, Depends, Request, HTTPException, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...auth import get_current_user
from ..utils.commons import set_no_cache_headers, require_session_or_redirect

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

router = APIRouter()


@router.get("/task", response_class=HTMLResponse)
async def problem_page():
	problem_path = BASE_DIR / "templates" / "task.html"
	return FileResponse(problem_path)


@router.get("/not-found", response_class=HTMLResponse)
async def not_found_page():
	not_found_path = BASE_DIR / "templates" / "not_found.html"
	return FileResponse(not_found_path, status_code=404)


@router.get("/global-statistics")
async def exercise_list(request: Request, db: AsyncSession = Depends(get_db)):
	redirect = await require_session_or_redirect(get_current_user, "/", request, db)
	if redirect:
		return redirect

	all_tasks_path = BASE_DIR / "templates" / "global_statistics.html"
	response = FileResponse(all_tasks_path)
	return set_no_cache_headers(response)



@router.get("/create-task", response_class=HTMLResponse)
@router.get("/create-task.html", response_class=HTMLResponse)
async def create_task_page(request: Request, db: AsyncSession = Depends(get_db)):
	redirect = await require_session_or_redirect(get_current_user, "/", request, db)
	if redirect:
		return redirect

	create_path = BASE_DIR / "templates" / "create_task.html"
	response = FileResponse(create_path)
	return set_no_cache_headers(response)


@router.get("/create-task-editor", response_class=HTMLResponse)
@router.get("/create-task-editor.html", response_class=HTMLResponse)
async def create_task_problem_page(request: Request, db: AsyncSession = Depends(get_db)):
	redirect = await require_session_or_redirect(get_current_user, "/", request, db)
	if redirect:
		return redirect

	create_path = BASE_DIR / "templates" / "create_task_editor.html"
	response = FileResponse(create_path)
	return set_no_cache_headers(response)


@router.get("/task-set-overview", response_class=HTMLResponse)
async def task_set_overview(request: Request, db: AsyncSession = Depends(get_db)):
	redirect = await require_session_or_redirect(get_current_user, "/", request, db)
	if redirect:
		return redirect

	stats_path = BASE_DIR / "templates" / "task_set_overview.html"
	response = FileResponse(stats_path)
	return set_no_cache_headers(response)


@router.get("/create-task-set", response_class=HTMLResponse)
async def create_task_set_page(request: Request, db: AsyncSession = Depends(get_db)):
	redirect = await require_session_or_redirect(get_current_user, "/", request, db)
	if redirect:
		return redirect

	create_path = BASE_DIR / "templates" / "create_task_set.html"
	response = FileResponse(create_path)
	return set_no_cache_headers(response)
