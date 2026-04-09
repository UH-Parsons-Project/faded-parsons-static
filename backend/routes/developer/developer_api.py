from fastapi import APIRouter, HTTPException, status

import backend.config as config
import backend.reset_db as reset_module
import backend.seed as seed_module
from ..utils.commons import run_dev_action

router = APIRouter()


@router.post("/api/reset-db")
async def reset_database():
    """Reset the database (requires DEVELOPMENT_MODE env variable)."""
    return await run_dev_action(
        config.DEVELOPMENT_MODE,
        reset_module.reset_db,
        "Database reset is only available in development mode",
        "Database reset complete",
    )


@router.post("/api/seed-db")
async def seed_database():
    """Seed the database with initial data (requires DEVELOPMENT_MODE env variable)."""
    return await run_dev_action(
        config.DEVELOPMENT_MODE,
        seed_module.seed_db,
        "Database seeding is only available in development mode",
        "Database seeded successfully",
    )
