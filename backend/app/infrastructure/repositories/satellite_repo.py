"""Satellite repository — async SQLAlchemy queries."""

from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import Satellite, TLEHistory


class SatelliteRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_norad(self, norad_id: int) -> Satellite | None:
        result = await self.db.execute(
            select(Satellite).where(Satellite.norad_id == norad_id)
        )
        return result.scalar_one_or_none()

    async def list_all(
        self,
        page: int = 1,
        limit: int = 50,
        orbit_type: str | None = None,
    ) -> list[Satellite]:
        q = select(Satellite)
        if orbit_type:
            q = q.where(Satellite.orbit_type == orbit_type.upper())
        q = q.offset((page - 1) * limit).limit(limit).order_by(Satellite.norad_id)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def count(self, orbit_type: str | None = None) -> int:
        q = select(func.count()).select_from(Satellite)
        if orbit_type:
            q = q.where(Satellite.orbit_type == orbit_type.upper())
        result = await self.db.execute(q)
        return result.scalar_one()

    async def upsert(self, sat: Satellite) -> None:
        """Insert or update a satellite record."""
        existing = await self.get_by_norad(sat.norad_id)
        if existing:
            for col in ("name", "epoch_utc", "mean_motion", "eccentricity",
                        "inclination", "raan", "arg_perigee", "mean_anomaly",
                        "bstar", "semi_major_axis", "orbit_type"):
                setattr(existing, col, getattr(sat, col))
            existing.updated_at = datetime.now(timezone.utc)
        else:
            self.db.add(sat)

    async def save_tle_history(self, record: TLEHistory) -> None:
        self.db.add(record)
