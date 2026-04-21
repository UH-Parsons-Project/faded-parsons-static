"""describe change

Revision ID: 36530b82db8d
Revises: c5424bc52373
Create Date: 2026-04-21 12:42:25.817817

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36530b82db8d'
down_revision: Union[str, Sequence[str], None] = 'c5424bc52373'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('registration_tokens', sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('registration_tokens', 'expires_at')
