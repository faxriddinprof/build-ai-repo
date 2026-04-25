"""replace embedding column: vector(768) → vector(1024) for BGE-M3

Revision ID: 0003
Revises: 0002
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    # Clear existing chunks — dimension change is destructive.
    # Re-ingest PDFs via POST /api/admin/documents/{id}/reindex after migration.
    op.execute("DELETE FROM document_chunks;")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding;")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;")
    op.execute("ALTER TABLE document_chunks ADD COLUMN embedding vector(1024) NOT NULL;")
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding "
        "ON document_chunks USING ivfflat (embedding vector_cosine_ops) "
        "WITH (lists = 100);"
    )


def downgrade():
    op.execute("DELETE FROM document_chunks;")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding;")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;")
    op.execute("ALTER TABLE document_chunks ADD COLUMN embedding vector(768) NOT NULL;")
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding "
        "ON document_chunks USING ivfflat (embedding vector_cosine_ops);"
    )
