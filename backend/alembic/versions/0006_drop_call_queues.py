"""drop call_queue and skip_log tables

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop FK from call_queue to clients (added in 0005)
    op.drop_constraint("fk_call_queue_client_id", "call_queue", type_="foreignkey")
    # Drop skip_log first (FK references call_queue.id)
    op.drop_table("skip_log")
    # Drop the queue index, then the table
    op.drop_index("ix_call_queue_status", table_name="call_queue")
    op.drop_table("call_queue")


def downgrade() -> None:
    op.create_table(
        "call_queue",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("masked_phone", sa.String(), nullable=False),
        sa.Column("region", sa.String(), nullable=True),
        sa.Column("topic", sa.String(), nullable=True),
        sa.Column("priority", sa.String(), nullable=False, server_default="normal"),
        sa.Column("queued_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_contact_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("customer_token_jti", sa.String(), nullable=True),
        sa.Column("accepted_by", sa.String(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["accepted_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_call_queue_status", "call_queue", ["status"])

    op.create_table(
        "skip_log",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("queue_id", sa.String(), nullable=False),
        sa.Column("agent_id", sa.String(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("ts", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["queue_id"], ["call_queue.id"]),
        sa.ForeignKeyConstraint(["agent_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column("call_queue", sa.Column("client_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_call_queue_client_id", "call_queue", "clients", ["client_id"], ["client_id"]
    )
