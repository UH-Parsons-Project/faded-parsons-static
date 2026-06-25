"""scope unique_link_code uniqueness to teacher

Revision ID: d1e2f3a4b5c6
Revises: b2c3d4e5f6a1, c5424bc52373
Create Date: 2026-06-25 00:00:00.000000

Drops the global unique constraint on task_sets.unique_link_code and
replaces it with a per-teacher unique constraint on (teacher_id, unique_link_code).
"""
from typing import Sequence, Union

from alembic import op


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = ("b2c3d4e5f6a1", "c5424bc52373")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop any global unique constraint/index on unique_link_code
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
          AND array_length(c.conkey, 1) = 1
          AND (
            SELECT attname FROM pg_attribute
            WHERE attrelid = t.oid AND attnum = c.conkey[1]
          ) = 'unique_link_code'
      LOOP
        EXECUTE format('ALTER TABLE task_sets DROP CONSTRAINT IF EXISTS %I', r.conname);
      END LOOP;
    END$$;
    """)

    op.execute("""
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'task_sets'
          AND indexdef ~* 'UNIQUE'
          AND indexdef ~* '\\(\\s*unique_link_code\\s*\\)'
      LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
      END LOOP;
    END$$;
    """)

    # Add per-teacher unique constraint
    op.execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'task_sets'
          AND c.contype = 'u'
          AND array_length(c.conkey, 1) = 2
          AND (
            SELECT COUNT(*) FROM pg_attribute
            WHERE attrelid = t.oid AND attnum = ANY(c.conkey)
              AND attname IN ('teacher_id', 'unique_link_code')
          ) = 2
      ) THEN
        ALTER TABLE task_sets
          ADD CONSTRAINT uq_task_sets_teacher_link_code
          UNIQUE (teacher_id, unique_link_code);
      END IF;
    END$$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE task_sets DROP CONSTRAINT IF EXISTS uq_task_sets_teacher_link_code")
    op.execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'task_sets'
          AND c.contype = 'u'
          AND array_length(c.conkey, 1) = 1
          AND (
            SELECT attname FROM pg_attribute
            WHERE attrelid = t.oid AND attnum = c.conkey[1]
          ) = 'unique_link_code'
      ) THEN
        ALTER TABLE task_sets ADD CONSTRAINT uq_task_sets_unique_link_code UNIQUE (unique_link_code);
      END IF;
    END$$;
    """)
