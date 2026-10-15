"""add store coordinates

Revision ID: d81376de9f57
Revises: cc75f3ae8281
Create Date: 2026-10-15 15:04:28.800328

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd81376de9f57'
down_revision: str | Sequence[str] | None = 'cc75f3ae8281'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('stores', sa.Column('latitude', sa.Float(), nullable=True))
    op.add_column('stores', sa.Column('longitude', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('stores', 'longitude')
    op.drop_column('stores', 'latitude')
