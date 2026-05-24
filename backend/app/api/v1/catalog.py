"""TLE catalog management endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.session import get_db
from app.infrastructure.database.models import Satellite

router = APIRouter()


@router.get("/stats")
async def catalog_stats(db: AsyncSession = Depends(get_db)):
    """Return orbit-type breakdown of the satellite catalog."""
    result = await db.execute(
        select(Satellite.orbit_type, func.count().label("count"))
        .group_by(Satellite.orbit_type)
        .order_by(func.count().desc())
    )
    rows = result.all()

    total = sum(r.count for r in rows)
    breakdown = {(r.orbit_type or "OTHER"): r.count for r in rows}

    return {
        "total":     total,
        "breakdown": breakdown,
    }
