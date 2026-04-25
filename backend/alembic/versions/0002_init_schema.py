"""Initial schema: users, calls, documents, document_chunks, suggestions_log

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-25

"""
import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "calls",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("agent_id", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("customer_name", sa.String(), nullable=True),
        sa.Column("customer_passport", sa.String(), nullable=True),
        sa.Column("customer_region", sa.String(), nullable=True),
        sa.Column("intake_confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("transcript", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("summary", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("compliance_status", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.ForeignKeyConstraint(["agent_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("tag", sa.String(), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("chunk_count", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="indexing"),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("uploaded_by", sa.String(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "document_chunks",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(768), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding "
        "ON document_chunks USING ivfflat (embedding vector_cosine_ops);"
    )

    op.create_table(
        "suggestions_log",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("call_id", sa.String(), nullable=False),
        sa.Column("trigger", sa.Text(), nullable=False),
        sa.Column("suggestion", sa.Text(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["call_id"], ["calls.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("suggestions_log")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding;")
    op.drop_table("document_chunks")
    op.drop_table("documents")
    op.drop_table("calls")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
