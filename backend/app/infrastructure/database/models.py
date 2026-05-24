"""SQLAlchemy ORM models — matches PostgreSQL schema in PART VI of the plan."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Double, ForeignKey,
    Index, Integer, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database.session import Base


class Satellite(Base):
    __tablename__ = "satellites"

    norad_id:        Mapped[int]      = mapped_column(Integer, primary_key=True)
    name:            Mapped[str]      = mapped_column(String(24), nullable=False)
    epoch_utc:       Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    mean_motion:     Mapped[float]    = mapped_column(Double, nullable=False)   # rev/day
    eccentricity:    Mapped[float]    = mapped_column(Double, nullable=False)
    inclination:     Mapped[float]    = mapped_column(Double, nullable=False)   # rad
    raan:            Mapped[float]    = mapped_column(Double, nullable=False)   # rad Ω
    arg_perigee:     Mapped[float]    = mapped_column(Double, nullable=False)   # rad ω
    mean_anomaly:    Mapped[float]    = mapped_column(Double, nullable=False)   # rad M₀
    bstar:           Mapped[float]    = mapped_column(Double, nullable=False)   # 1/R_Earth
    semi_major_axis: Mapped[float]    = mapped_column(Double, nullable=False)   # km
    orbit_type:      Mapped[str | None] = mapped_column(String(10))
    updated_at:      Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    tle_history: Mapped[list["TLEHistory"]] = relationship(
        back_populates="satellite", cascade="all, delete-orphan"
    )


class Mission(Base):
    __tablename__ = "missions"

    id:            Mapped[uuid.UUID]  = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name:          Mapped[str]        = mapped_column(String(255), nullable=False)
    target_orbit:  Mapped[dict | None] = mapped_column(JSONB)   # {a,e,i,raan,omega}
    maneuver_plan: Mapped[dict | None] = mapped_column(JSONB)   # [{type,dv_km_s,epoch_unix}]
    created_at:    Mapped[datetime]   = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PropagationCache(Base):
    __tablename__ = "propagation_cache"

    id:          Mapped[uuid.UUID]  = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    norad_id:    Mapped[int]        = mapped_column(
        Integer, ForeignKey("satellites.norad_id"), nullable=False
    )
    start_epoch: Mapped[datetime]   = mapped_column(DateTime(timezone=True), nullable=False)
    duration_s:  Mapped[float]      = mapped_column(Double, nullable=False)
    step_s:      Mapped[float]      = mapped_column(Double, nullable=False)
    propagator:  Mapped[str]        = mapped_column(String(20), nullable=False)
    ephemeris:   Mapped[dict]       = mapped_column(JSONB, nullable=False)
    created_at:  Mapped[datetime]   = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("norad_id", "start_epoch", "duration_s", "step_s", "propagator"),
    )


class TLEHistory(Base):
    __tablename__ = "tle_history"

    id:         Mapped[int]       = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    norad_id:   Mapped[int]       = mapped_column(
        Integer, ForeignKey("satellites.norad_id"), nullable=False
    )
    tle_line1:  Mapped[str]       = mapped_column(String(69), nullable=False)
    tle_line2:  Mapped[str]       = mapped_column(String(69), nullable=False)
    epoch_utc:  Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    satellite: Mapped["Satellite"] = relationship(back_populates="tle_history")

    __table_args__ = (
        Index("ix_tle_history_norad_epoch", "norad_id", "epoch_utc"),
    )
