"""Design parity: new call fields, call_queue, skip_log tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-26

"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New columns on calls
    op.add_column("calls", sa.Column("customer_phone", sa.String(), nullable=True))
    op.add_column("calls", sa.Column("outcome", sa.String(), nullable=True))
    op.add_column("calls", sa.Column("compliance_score", sa.Integer(), nullable=True))
    op.add_column("calls", sa.Column("top_objection", sa.String(), nullable=True))
    op.add_column("calls", sa.Column("sentiment_journey", sa.dialects.postgresql.JSONB(), nullable=True))

    # Inbound call queue
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

    # Skip log
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


def downgrade() -> None:
    op.drop_table("skip_log")
    op.drop_index("ix_call_queue_status", "call_queue")
    op.drop_table("call_queue")
    op.drop_column("calls", "sentiment_journey")
    op.drop_column("calls", "top_objection")
    op.drop_column("calls", "compliance_score")
    op.drop_column("calls", "outcome")
    op.drop_column("calls", "customer_phone")
