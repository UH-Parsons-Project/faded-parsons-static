from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...auth import get_current_user
from .admin_api import router, BASE_DIR


@router.get("/all-tasksets", response_class=HTMLResponse)
async def all_tasksets_page(request: Request, db: AsyncSession = Depends(get_db)):
	"""Serve the page for viewing all task sets (requires data access)."""
	try:
		current_user = await get_current_user(request, db)
		if not current_user.is_admin_teacher:
			raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
	except HTTPException:
		return RedirectResponse(
			url="/", status_code=status.HTTP_303_SEE_OTHER
		)

	all_tasksets_path = BASE_DIR / "templates" / "all_tasksets.html"
	response = FileResponse(all_tasksets_path)
	response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
	response.headers["Pragma"] = "no-cache"
	return response


@router.get("/admin-dashboard", response_class=HTMLResponse)
async def admin_dashboard_page(request: Request, db: AsyncSession = Depends(get_db)):
	"""Serve the admin dashboard page (requires admin access)."""
	try:
		current_user = await get_current_user(request, db)
		if not current_user.is_admin_teacher:
			raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
	except HTTPException:
		return RedirectResponse(
			url="/", status_code=status.HTTP_303_SEE_OTHER
		)

	admin_dashboard_path = BASE_DIR / "templates" / "admin_dashboard.html"
	response = FileResponse(admin_dashboard_path)
	response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
	response.headers["Pragma"] = "no-cache"
	return response


@router.get("/all-users", response_class=HTMLResponse)
async def all_users_page(request: Request, db: AsyncSession = Depends(get_db)):
	"""Serve the page for viewing all users (requires admin access)."""
	try:
		current_user = await get_current_user(request, db)
		if not current_user.is_admin_teacher:
			raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
	except HTTPException:
		return RedirectResponse(
			url="/", status_code=status.HTTP_303_SEE_OTHER
		)

	all_users_path = BASE_DIR / "templates" / "all_users.html"
	response = FileResponse(all_users_path)
	response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
	response.headers["Pragma"] = "no-cache"
	return response


@router.get("/admin/admins_teacher_view", response_class=HTMLResponse)
async def admins_teacher_view_page(request: Request, db: AsyncSession = Depends(get_db)):
	"""Serve the page for viewing a specific teacher's sets and tasks (requires admin access)."""
	try:
		current_user = await get_current_user(request, db)
		if not current_user.is_admin_teacher:
			raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
	except HTTPException:
		return RedirectResponse(
			url="/", status_code=status.HTTP_303_SEE_OTHER
		)

	admins_teacher_view_path = BASE_DIR / "templates" / "admins_teacher_view.html"
	response = FileResponse(admins_teacher_view_path)
	response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
	response.headers["Pragma"] = "no-cache"
	return response


