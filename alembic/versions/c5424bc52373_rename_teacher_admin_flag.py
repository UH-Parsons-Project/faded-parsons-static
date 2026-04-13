"""rename teacher admin flag

Revision ID: c5424bc52373
Revises: 545310b3c7b3
Create Date: 2026-04-13 11:43:57.635815

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c5424bc52373'
down_revision: Union[str, Sequence[str], None] = '545310b3c7b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('teachers', 'has_data_access', new_column_name='is_admin_teacher')


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('teachers', 'is_admin_teacher', new_column_name='has_data_access')
