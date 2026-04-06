from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter()

# Compute project base dir (same as backend.main's BASE_DIR)
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent


@router.get("/ohtuproj_logo.png")
async def logo_image():
    """Serve the navbar logo image used by templates."""
    logo_path = BASE_DIR / "ohtuproj_logo.png"
    return FileResponse(logo_path)