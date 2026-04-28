"""add original_outline_json to jobs

Revision ID: 0002_original_outline
Revises: 0001_initial
Create Date: 2026-04-27

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import JSONPortable

revision: str = "0002_original_outline"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("original_outline_json", JSONPortable(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("jobs", "original_outline_json")
