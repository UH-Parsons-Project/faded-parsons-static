"""Shared task type definitions and database helpers."""

import re
import unicodedata

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import TaskType


DEFAULT_TASK_TYPES = (
    ("algorithms", "Algorithms", 10),
    ("arithmetic", "Arithmetic", 20),
    ("booleans", "Booleans", 30),
    ("classes", "Classes", 40),
    ("comprehensions", "Comprehensions", 50),
    ("conditionals", "Conditionals", 60),
    ("debugging", "Debugging", 70),
    ("dictionaries", "Dictionaries", 80),
    ("exceptions", "Exceptions", 90),
    ("files", "Files", 100),
    ("functions", "Functions", 110),
    ("imports", "Imports", 120),
    ("input", "Input", 130),
    ("lists", "Lists", 140),
    ("loops", "Loops", 150),
    ("other", "Other", 160),
    ("recursion", "Recursion", 170),
    ("searching", "Searching", 180),
    ("sets", "Sets", 190),
    ("sorting", "Sorting", 200),
    ("strings", "Strings", 210),
    ("testing", "Testing", 220),
    ("tuples", "Tuples", 230),
    ("typecasting", "Typecasting", 240),
    ("variables", "Variables", 250),
)

# These values were written by older versions of the application. They remain
# in the database as inactive entries so existing tasks can keep their value,
# but they are not offered for new tasks.
LEGACY_TASK_TYPES = (
    ("normal", "Normal (legacy)", 9000),
    ("faded", "Faded (legacy)", 9010),
    ("python", "Python (legacy)", 9020),
    ("parsons", "Parsons (legacy)", 9030),
)


def normalize_label(label: str | None) -> str:
    """Trim and collapse whitespace in a task type label."""
    return " ".join((label or "").split())


def slugify_task_type(value: str | None) -> str:
    """Convert a task type label/value into a stable lowercase slug."""
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


def legacy_value_for_slug(slug: str) -> str:
    """Return the historical casing used by old task records."""
    return "Faded" if slug == "faded" else slug


async def ensure_default_task_types(db: AsyncSession) -> None:
    """Insert default and legacy task types when a development DB is empty."""
    result = await db.execute(select(TaskType.slug))
    existing_slugs = {slug.lower() for slug in result.scalars().all()}

    for slug, label, sort_order in (*DEFAULT_TASK_TYPES, *LEGACY_TASK_TYPES):
        if slug in existing_slugs:
            continue
        db.add(
            TaskType(
                slug=slug,
                label=label,
                is_active=slug not in {legacy[0] for legacy in LEGACY_TASK_TYPES},
                sort_order=sort_order,
            )
        )
    await db.flush()


async def find_task_type(
    db: AsyncSession,
    value: str,
    *,
    include_inactive: bool = False,
) -> TaskType | None:
    """Find a task type case-insensitively by slug."""
    statement = select(TaskType).where(func.lower(TaskType.slug) == value.lower())
    if not include_inactive:
        statement = statement.where(TaskType.is_active.is_(True))
    result = await db.execute(statement)
    return result.scalar_one_or_none()
