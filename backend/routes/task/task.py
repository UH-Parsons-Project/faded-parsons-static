from pathlib import Path

from fastapi import APIRouter, Depends, Request, HTTPException, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...auth import get_current_user

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

router = APIRouter()


@router.get("/task", response_class=HTMLResponse)
async def problem_page():
	problem_path = BASE_DIR / "templates" / "task.html"
	return FileResponse(problem_path)


@router.get("/global-statistics")
async def exercise_list(request: Request, db: AsyncSession = Depends(get_db)):
	try:
		await get_current_user(request, db)
	except HTTPException:
		return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)

	all_tasks_path = BASE_DIR / "templates" / "global_statistics.html"
	response = FileResponse(all_tasks_path)
	response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
	response.headers["Pragma"] = "no-cache"
	return response



@router.get("/create-task", response_class=HTMLResponse)
@router.get("/create-task.html", response_class=HTMLResponse)
async def create_task_page(request: Request, db: AsyncSession = Depends(get_db)):
	try:
		await get_current_user(request, db)
	except HTTPException:
		return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)

	create_path = BASE_DIR / "templates" / "create_task.html"
	response = FileResponse(create_path)
	response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
	response.headers["Pragma"] = "no-cache"
	return response


@router.get("/create-task-editor", response_class=HTMLResponse)
@router.get("/create-task-editor.html", response_class=HTMLResponse)
async def create_task_problem_page(request: Request, db: AsyncSession = Depends(get_db)):
	try:
		await get_current_user(request, db)
	except HTTPException:
		return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)

	create_path = BASE_DIR / "templates" / "create_task_editor.html"
	response = FileResponse(create_path)
	response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
	response.headers["Pragma"] = "no-cache"
	return response


@router.get("/task-set-overview", response_class=HTMLResponse)
async def task_set_overview(request: Request, db: AsyncSession = Depends(get_db)):
	try:
		await get_current_user(request, db)
	except HTTPException:
		return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)

	stats_path = BASE_DIR / "templates" / "task_set_overview.html"
	response = FileResponse(stats_path)
	response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
	response.headers["Pragma"] = "no-cache"
	return response


@router.get("/create-task-set", response_class=HTMLResponse)
async def create_task_set_page(request: Request, db: AsyncSession = Depends(get_db)):
	try:
		await get_current_user(request, db)
	except HTTPException:
		return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)

	create_path = BASE_DIR / "templates" / "create_task_set.html"
	response = FileResponse(create_path)
	response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
	response.headers["Pragma"] = "no-cache"
	return response
