"""add product category and canonical group

Revision ID: e927c3f1b402
Revises: d81376de9f57
Create Date: 2026-10-15 17:45:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e927c3f1b402'
down_revision: str | Sequence[str] | None = 'd81376de9f57'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('products', sa.Column('category', sa.String(length=64), nullable=True))
    op.add_column('products', sa.Column('canonical_group', sa.String(length=64), nullable=True))
    op.create_index(op.f('ix_products_category'), 'products', ['category'], unique=False)
    op.create_index(op.f('ix_products_canonical_group'), 'products', ['canonical_group'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_products_canonical_group'), table_name='products')
    op.drop_index(op.f('ix_products_category'), table_name='products')
    op.drop_column('products', 'canonical_group')
    op.drop_column('products', 'category')
