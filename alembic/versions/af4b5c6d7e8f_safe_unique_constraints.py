"""safe unique constraints for parsons and task_sets

Revision ID: af4b5c6d7e8f
Revises: 9f1a2b3c4d5e
Create Date: 2026-05-26 12:30:00.000000

This migration is written defensively so it can run in test and production
environments regardless of exact existing constraint/index names.
It will drop any unique constraint/index that enforces uniqueness only on
`task_sets.title` and will create unique constraints for
`(created_by_teacher_id, title)` on `parsons` and `(teacher_id, title)` on
`task_sets` if they do not already exist.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "af4b5c6d7e8f"
down_revision: Union[str, Sequence[str], None] = "9f1a2b3c4d5e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add unique constraints safely and remove any global unique on task_sets.title."""

    # Drop any unique constraint on task_sets that only references the column title
    op.execute("""
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'task_sets'
          AND c.contype = 'u'
          AND array_length(c.conkey,1) = 1
          AND (SELECT attname FROM pg_attribute att WHERE att.attrelid = t.oid AND att.attnum = c.conkey[1]) = 'title'
      LOOP
        EXECUTE format('ALTER TABLE task_sets DROP CONSTRAINT IF EXISTS %I', r.conname);
      END LOOP;
    END$$;
    """)

    # Drop unique indexes that only cover title
    op.execute("""
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'task_sets' AND indexdef ~* 'UNIQUE' AND indexdef ~* '\\(\s*title\s*\\)'
      LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
      END LOOP;
    END$$;
    """)

    # Add unique constraint on parsons (created_by_teacher_id, title) if not exists
    op.execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'parsons'
          AND c.contype = 'u'
          AND array_length(c.conkey,1) = 2
          AND (
            SELECT COUNT(*) FROM pg_attribute att
            WHERE att.attrelid = t.oid AND att.attnum = ANY(c.conkey)
              AND att.attname IN ('created_by_teacher_id','title')
          ) = 2
      ) THEN
        ALTER TABLE parsons ADD CONSTRAINT uq_parsons_teacher_title UNIQUE (created_by_teacher_id, title);
      END IF;
    END$$;
    """)

    # Add unique constraint on task_sets (teacher_id, title) if not exists
    op.execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'task_sets'
          AND c.contype = 'u'
          AND array_length(c.conkey,1) = 2
          AND (
            SELECT COUNT(*) FROM pg_attribute att
            WHERE att.attrelid = t.oid AND att.attnum = ANY(c.conkey)
              AND att.attname IN ('teacher_id','title')
          ) = 2
      ) THEN
        ALTER TABLE task_sets ADD CONSTRAINT uq_task_sets_teacher_title UNIQUE (teacher_id, title);
      END IF;
    END$$;
    """)


def downgrade() -> None:
    """Remove the unique constraints added by this migration."""
    op.execute("ALTER TABLE parsons DROP CONSTRAINT IF EXISTS uq_parsons_teacher_title")
    op.execute("ALTER TABLE task_sets DROP CONSTRAINT IF EXISTS uq_task_sets_teacher_title")
