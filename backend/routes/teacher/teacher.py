from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...teacher_auth import get_current_user
from ...database import get_db
from ..utils.commons import require_session_or_redirect, set_no_cache_headers

# Resolve project base directory (project root)
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

router = APIRouter()

async def _render_teacher_page(request: Request, db: AsyncSession, template_name: str) -> FileResponse:
    redirect = await require_session_or_redirect(get_current_user, "/", request, db)
    if redirect:
        return redirect
    return set_no_cache_headers(FileResponse(BASE_DIR / "templates" / template_name))


@router.get("/", response_class=HTMLResponse)
async def index():
    """Serve the main index page."""
    index_path = BASE_DIR / "templates" / "index.html"
    return FileResponse(index_path)


@router.get("/teacher-dashboard", response_class=HTMLResponse)
async def teacher_selector(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
):
    return await _render_teacher_page(request, db, "teacher_dashboard.html")


@router.get("/teacher/profile", response_class=HTMLResponse)
async def teacher_profile_page(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
):
    return await _render_teacher_page(request, db, "teacher_profile.html")



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
async def teacher_instructions_content(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
):
    """Serve the teacher-only instructions fragment for authenticated users."""
    return await _render_teacher_page(request, db, "instructions_teacher_fragment.html")

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
