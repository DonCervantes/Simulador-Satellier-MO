"""Satellite catalog endpoints — backed by PostgreSQL via SatelliteRepository."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.infrastructure.repositories.satellite_repo import SatelliteRepository

router = APIRouter()


# ── Response schema ───────────────────────────────────────────────────────────

class SatelliteOut(BaseModel):
    norad_id:        int
    name:            str
    epoch:           float           # Unix seconds
    mean_motion:     float           # rev/day
    eccentricity:    float
    inclination:     float           # radians
    raan:            float           # radians Ω
    arg_perigee:     float           # radians ω
    mean_anomaly:    float           # radians M₀
    bstar:           float           # 1/R_Earth
    semi_major_axis: float           # km
    orbit_type:      Optional[str] = None


class SatelliteCountOut(BaseModel):
    total: int
    orbit_type: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[SatelliteOut], summary="List satellites")
async def list_satellites(
    page:       int            = Query(1, ge=1, description="Page number (1-based)"),
    limit:      int            = Query(50, ge=1, le=500, description="Results per page"),
    orbit_type: Optional[str]  = Query(None, description="Filter by orbit type (LEO, MEO, GEO, SSO…)"),
    db:         AsyncSession   = Depends(get_db),
) -> list[SatelliteOut]:
    """Return a paginated list of satellites from the catalog."""
    repo = SatelliteRepository(db)
    sats = await repo.list_all(page=page, limit=limit, orbit_type=orbit_type)
    return [_to_out(s) for s in sats]


@router.get("/count", response_model=SatelliteCountOut, summary="Count satellites")
async def count_satellites(
    orbit_type: Optional[str] = Query(None),
    db:         AsyncSession  = Depends(get_db),
) -> SatelliteCountOut:
    """Return total number of satellites in the catalog (optionally filtered)."""
    repo  = SatelliteRepository(db)
    total = await repo.count(orbit_type=orbit_type)
    return SatelliteCountOut(total=total, orbit_type=orbit_type)


@router.get("/{norad_id}", response_model=SatelliteOut, summary="Get satellite by NORAD ID")
async def get_satellite(
    norad_id: int,
    db:       AsyncSession = Depends(get_db),
) -> SatelliteOut:
    """Return a single satellite by its NORAD catalog number."""
    repo = SatelliteRepository(db)
    sat  = await repo.get_by_norad(norad_id)
    if sat is None:
        raise HTTPException(404, f"Satellite {norad_id} not found in catalog")
    return _to_out(sat)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_out(sat) -> SatelliteOut:
    return SatelliteOut(
        norad_id       = sat.norad_id,
        name           = sat.name,
        epoch          = sat.epoch_utc.timestamp(),
        mean_motion    = sat.mean_motion,
        eccentricity   = sat.eccentricity,
        inclination    = sat.inclination,
        raan           = sat.raan,
        arg_perigee    = sat.arg_perigee,
        mean_anomaly   = sat.mean_anomaly,
        bstar          = sat.bstar,
        semi_major_axis= sat.semi_major_axis,
        orbit_type     = sat.orbit_type,
    )
