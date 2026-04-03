from fastapi import APIRouter, HTTPException, status

from backend.config import TEST_MODE
from backend.reset_db import reset_db
from backend.seed import seed_db

router = APIRouter()


@router.post("/test/reset-db")
async def reset_test_db():
    """Reset the database (requires `TEST_MODE`)."""
    if not TEST_MODE:
        raise HTTPException(
            status_code=403,
            detail="Test endpoints are only available in test mode",
        )

    try:
        await reset_db()
        await seed_db()
        return {"status": "success", "message": "Database reset complete"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reset database: {str(e)}",
        ) from e
