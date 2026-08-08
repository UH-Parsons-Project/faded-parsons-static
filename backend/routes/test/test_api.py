from fastapi import APIRouter, HTTPException

import backend.reset_db as reset_module
import backend.seed as seed_module
from backend import config

router = APIRouter()


@router.post("/test/reset-db")
async def reset_test_db():
    """Reset the database (requires `TEST_MODE`)."""
    if not config.TEST_MODE:
        raise HTTPException(
            status_code=403,
            detail="Test endpoints are only available in test mode",
        )

    try:
        await reset_module.reset_db()
        await seed_module.seed_db()
        return {"status": "success", "message": "Database reset complete"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reset database: {e!s}",
        ) from e
