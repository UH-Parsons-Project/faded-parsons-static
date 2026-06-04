"""Add is_hidden to task_set_items

Revision ID: a1b2c3d4e5f6
Revises: 36530b82db8d
Create Date: 2026-05-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '36530b82db8d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_hidden column to task_set_items."""
    op.add_column(
        'task_set_items',
        sa.Column('is_hidden', sa.Boolean(), server_default='false', nullable=False)
    )


def downgrade() -> None:
    """Remove is_hidden column from task_set_items."""
    op.drop_column('task_set_items', 'is_hidden')
