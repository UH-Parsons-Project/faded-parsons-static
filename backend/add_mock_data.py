#!/usr/bin/env python3
"""
Script to add mock activity data to the database for development/testing.
Run this after the initial seed_db() has completed.

Usage: python3 -m backend.add_mock_data (from project root)
       or: python3 add_mock_data.py (from backend dir with proper PYTHONPATH)
"""

import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.seed import seed_mock_activity


async def main():
    """Run the mock data seeding."""
    # Prevent running on production
    development_mode = os.getenv('DEVELOPMENT_MODE', 'false').lower() == 'true'
    if not development_mode:
        print("✗ Cannot run mock data seeding outside of development mode!")
        print("Set DEVELOPMENT_MODE=true to enable.")
        sys.exit(1)

    print("Starting mock activity data seeding...")
    try:
        await seed_mock_activity()
        print("\n✓ Mock data successfully added!")
        print("You can now view the activity charts in the admin dashboard.")
    except Exception as e:
        print(f"\n✗ Error adding mock data: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
