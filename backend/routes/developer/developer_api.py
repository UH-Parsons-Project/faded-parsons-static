from fastapi import APIRouter, HTTPException, status

import backend.config as config
import backend.reset_db as reset_module
import backend.seed as seed_module

router = APIRouter()


@router.post("/api/reset-db")
async def reset_database():
    """Reset the database (requires DEVELOPMENT_MODE env variable)."""
    if not config.DEVELOPMENT_MODE:
        raise HTTPException(
            status_code=403,
            detail="Database reset is only available in development mode",
        )
    try:
        await reset_module.reset_db()
        return {"status": "success", "message": "Database reset complete"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reset database: {str(e)}",
        ) from e


@router.post("/api/seed-db")
async def seed_database():
    """Seed the database with initial data (requires DEVELOPMENT_MODE env variable)."""
    if not config.DEVELOPMENT_MODE:
        raise HTTPException(
            status_code=403,
            detail="Database seeding is only available in development mode",
        )
    try:
        await seed_module.seed_db()
        return {"status": "success", "message": "Database seeded successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to seed database: {str(e)}",
        ) from e
