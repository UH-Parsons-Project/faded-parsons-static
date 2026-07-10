from pathlib import Path

from fastapi import APIRouter, Depends, Request, HTTPException, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...auth import get_current_user


# Resolve project base directory (project root)
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
async def index():
    """Serve the main index page."""
    index_path = BASE_DIR / "templates" / "index.html"
    return FileResponse(index_path)


@router.get("/teacher-dashboard", response_class=HTMLResponse)
async def teacher_selector(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await get_current_user(request, db)
    except HTTPException:
        return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)

    teacher_dashboard_path = BASE_DIR / "templates" / "teacher_dashboard.html"
    response = FileResponse(teacher_dashboard_path)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response



@router.get("/teacher-register", response_class=HTMLResponse)
async def teacher_register_page():
    """Serve a simple registration page."""
    teacher_register_path = BASE_DIR / "templates" / "teacher_register.html"
    return FileResponse(teacher_register_path)


@router.get("/instructions", response_class=HTMLResponse)
async def teacher_instructions_page():
    """Serve a simple teacher instructions page."""
    instructions_path = BASE_DIR / "templates" / "instructions.html"
    return FileResponse(instructions_path)


@router.get("/instructions/teacher-content", response_class=HTMLResponse)
async def teacher_instructions_content(request: Request, db: AsyncSession = Depends(get_db)):
    """Serve the teacher-only instructions fragment for authenticated users."""
    await get_current_user(request, db)

    fragment_path = BASE_DIR / "templates" / "instructions_teacher_fragment.html"
    response = FileResponse(fragment_path)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response

@router.get("/privacy-policy", response_class=HTMLResponse)
async def privacy_policy_page():
    """Serve the privacy policy page."""
    privacy_policy_path = BASE_DIR / "templates" / "privacy_policy.html"
    return FileResponse(privacy_policy_path)

@router.get("/data-retention-policy", response_class=HTMLResponse)
async def data_retention_policy_page():
    """Serve the data retention policy page."""
    data_retention_path = BASE_DIR / "templates" / "data_retention_policy.html"
    return FileResponse(data_retention_path)

@router.get("/contact", response_class=HTMLResponse)
async def contact_page():
    """Serve the contact page."""
    contact_path = BASE_DIR / "templates" / "contact.html"
    return FileResponse(contact_path)
