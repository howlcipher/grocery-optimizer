"""add store locality and observation ownership

Revision ID: cc75f3ae8281
Revises: 2530c8dd1af6
Create Date: 2026-10-15 13:42:03.291316

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'cc75f3ae8281'
down_revision: str | Sequence[str] | None = '2530c8dd1af6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('stores', sa.Column('address', sa.String(length=255), nullable=True))
    op.add_column('stores', sa.Column('city', sa.String(length=128), nullable=True))
    op.add_column('stores', sa.Column('state', sa.String(length=32), nullable=True))
    op.add_column('stores', sa.Column('zip_code', sa.String(length=20), nullable=True))
    op.add_column(
        'stores',
        sa.Column('is_unresolved_location', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(op.f('ix_stores_zip_code'), 'stores', ['zip_code'], unique=False)

    op.add_column(
        'price_observations',
        sa.Column('edit_token_hash', sa.String(length=64), nullable=True),
    )
    op.create_index(
        op.f('ix_price_observations_edit_token_hash'),
        'price_observations',
        ['edit_token_hash'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_price_observations_edit_token_hash'), table_name='price_observations')
    op.drop_column('price_observations', 'edit_token_hash')
    op.drop_index(op.f('ix_stores_zip_code'), table_name='stores')
    op.drop_column('stores', 'is_unresolved_location')
    op.drop_column('stores', 'zip_code')
    op.drop_column('stores', 'state')
    op.drop_column('stores', 'city')
    op.drop_column('stores', 'address')
