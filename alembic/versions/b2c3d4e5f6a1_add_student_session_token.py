"""add session_token to student

Revision ID: b2c3d4e5f6a1
Revises: (a1b2c3d4e5f6, af4b5c6d7e8f)
Create Date: 2026-05-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a1'
down_revision: Union[str, Sequence[str], None] = ('a1b2c3d4e5f6', 'af4b5c6d7e8f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('student', sa.Column('session_token', sa.String(64), nullable=True))
    op.create_index('ix_student_session_token', 'student', ['session_token'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_student_session_token', table_name='student')
    op.drop_column('student', 'session_token')
