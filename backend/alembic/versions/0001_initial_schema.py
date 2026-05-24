"""Initial schema — satellites, missions, propagation_cache, tle_history.

Revision ID: 0001
Revises:
Create Date: 2026-05-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "satellites",
        sa.Column("norad_id",        sa.Integer(),      primary_key=True),
        sa.Column("name",            sa.String(24),     nullable=False),
        sa.Column("epoch_utc",       sa.DateTime(timezone=True), nullable=False),
        sa.Column("mean_motion",     sa.Double(),       nullable=False),
        sa.Column("eccentricity",    sa.Double(),       nullable=False),
        sa.Column("inclination",     sa.Double(),       nullable=False),
        sa.Column("raan",            sa.Double(),       nullable=False),
        sa.Column("arg_perigee",     sa.Double(),       nullable=False),
        sa.Column("mean_anomaly",    sa.Double(),       nullable=False),
        sa.Column("bstar",           sa.Double(),       nullable=False),
        sa.Column("semi_major_axis", sa.Double(),       nullable=False),
        sa.Column("orbit_type",      sa.String(10)),
        sa.Column("updated_at",      sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
    )

    op.create_table(
        "missions",
        sa.Column("id",            UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("name",          sa.String(255),     nullable=False),
        sa.Column("target_orbit",  JSONB),
        sa.Column("maneuver_plan", JSONB),
        sa.Column("created_at",    sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
    )

    op.create_table(
        "propagation_cache",
        sa.Column("id",          UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("norad_id",    sa.Integer(),
                  sa.ForeignKey("satellites.norad_id"), nullable=False),
        sa.Column("start_epoch", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_s",  sa.Double(),  nullable=False),
        sa.Column("step_s",      sa.Double(),  nullable=False),
        sa.Column("propagator",  sa.String(20), nullable=False),
        sa.Column("ephemeris",   JSONB,         nullable=False),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
        sa.UniqueConstraint("norad_id", "start_epoch", "duration_s", "step_s", "propagator",
                            name="uq_propagation_cache"),
    )

    op.create_table(
        "tle_history",
        sa.Column("id",          sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("norad_id",    sa.Integer(),
                  sa.ForeignKey("satellites.norad_id"), nullable=False),
        sa.Column("tle_line1",   sa.String(69),  nullable=False),
        sa.Column("tle_line2",   sa.String(69),  nullable=False),
        sa.Column("epoch_utc",   sa.DateTime(timezone=True), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()")),
    )
    op.create_index("ix_tle_history_norad_epoch", "tle_history",
                    ["norad_id", sa.text("epoch_utc DESC")])


def downgrade() -> None:
    op.drop_table("tle_history")
    op.drop_table("propagation_cache")
    op.drop_table("missions")
    op.drop_table("satellites")
