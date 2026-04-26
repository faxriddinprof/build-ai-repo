"""Client profile tables + client_id FK on calls/call_queue

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-26

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── clients ─────────────────────────────────────────────────────────────
    op.create_table(
        "clients",
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("first_name", sa.String(), nullable=False),
        sa.Column("last_name", sa.String(), nullable=False),
        sa.Column("middle_name", sa.String(), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("gender", sa.String(10), nullable=True),
        sa.Column("citizenship", sa.String(50), nullable=True),
        sa.Column("pinfl", sa.String(14), nullable=True),
        sa.Column("passport_number", sa.String(20), nullable=True),
        sa.Column("passport_issue_date", sa.Date(), nullable=True),
        sa.Column("passport_issue_place", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.PrimaryKeyConstraint("client_id"),
    )

    # ── contacts ────────────────────────────────────────────────────────────
    op.create_table(
        "contacts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("email", sa.String(200), nullable=True),
        sa.Column("registration_address", sa.Text(), nullable=True),
        sa.Column("actual_address", sa.Text(), nullable=True),
        sa.Column("region", sa.String(100), nullable=True),
        sa.Column(
            "is_primary_phone", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contacts_client_id", "contacts", ["client_id"])

    # ── accounts ────────────────────────────────────────────────────────────
    op.create_table(
        "accounts",
        sa.Column("account_id", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("account_number", sa.String(30), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="UZS"),
        sa.Column("balance", sa.Numeric(18, 2), nullable=False, server_default="0.00"),
        sa.Column("opened_at", sa.Date(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"]),
        sa.PrimaryKeyConstraint("account_id"),
    )
    op.create_index("ix_accounts_client_id", "accounts", ["client_id"])

    # ── cards ────────────────────────────────────────────────────────────────
    op.create_table(
        "cards",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("account_id", sa.String(), nullable=False),
        sa.Column("card_type", sa.String(20), nullable=False),
        sa.Column("card_number_masked", sa.String(25), nullable=False),
        sa.Column("expiry_date", sa.String(7), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.account_id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── transactions ────────────────────────────────────────────────────────
    op.create_table(
        "transactions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("account_id", sa.String(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("type", sa.String(10), nullable=False),
        sa.Column("tx_date", sa.DateTime(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("merchant_category", sa.String(100), nullable=True),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.account_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transactions_account_id", "transactions", ["account_id"])

    # ── loans ────────────────────────────────────────────────────────────────
    op.create_table(
        "loans",
        sa.Column("loan_id", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("loan_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("interest_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("opened_at", sa.Date(), nullable=True),
        sa.Column("due_at", sa.Date(), nullable=True),
        sa.Column(
            "remaining_balance",
            sa.Numeric(18, 2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"]),
        sa.PrimaryKeyConstraint("loan_id"),
    )
    op.create_index("ix_loans_client_id", "loans", ["client_id"])

    # ── loan_payments ────────────────────────────────────────────────────────
    op.create_table(
        "loan_payments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("loan_id", sa.String(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("is_late", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(["loan_id"], ["loans.loan_id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── deposits ─────────────────────────────────────────────────────────────
    op.create_table(
        "deposits",
        sa.Column("deposit_id", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("interest_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("opened_at", sa.Date(), nullable=True),
        sa.Column("matures_at", sa.Date(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"]),
        sa.PrimaryKeyConstraint("deposit_id"),
    )

    # ── risk_profiles ────────────────────────────────────────────────────────
    op.create_table(
        "risk_profiles",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("credit_score", sa.Integer(), nullable=True),
        sa.Column("credit_history_summary", sa.Text(), nullable=True),
        sa.Column("debt_status", sa.String(50), nullable=True),
        sa.Column(
            "risk_category", sa.String(20), nullable=False, server_default="medium"
        ),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_id"),
    )

    # ── client_history ───────────────────────────────────────────────────────
    op.create_table(
        "client_history",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("join_date", sa.Date(), nullable=True),
        sa.Column("branch_name", sa.String(200), nullable=True),
        sa.Column("products_used", JSONB(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── FK additions to existing tables ─────────────────────────────────────
    op.add_column("calls", sa.Column("client_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_calls_client_id", "calls", "clients", ["client_id"], ["client_id"]
    )

    op.add_column("call_queue", sa.Column("client_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_call_queue_client_id", "call_queue", "clients", ["client_id"], ["client_id"]
    )


def downgrade() -> None:
    op.drop_constraint("fk_call_queue_client_id", "call_queue", type_="foreignkey")
    op.drop_column("call_queue", "client_id")

    op.drop_constraint("fk_calls_client_id", "calls", type_="foreignkey")
    op.drop_column("calls", "client_id")

    op.drop_table("client_history")
    op.drop_table("risk_profiles")
    op.drop_table("deposits")
    op.drop_table("loan_payments")
    op.drop_table("loans")
    op.drop_index("ix_transactions_account_id", "transactions")
    op.drop_table("transactions")
    op.drop_table("cards")
    op.drop_index("ix_accounts_client_id", "accounts")
    op.drop_table("accounts")
    op.drop_index("ix_contacts_client_id", "contacts")
    op.drop_table("contacts")
    op.drop_table("clients")
