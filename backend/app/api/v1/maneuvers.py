"""Maneuver calculation endpoints."""

import math
from fastapi import APIRouter
from app.domain.astrodynamics.models import (
    HohmannRequest, HohmannResponse, BiEllipticRequest,
    PlaneChangeRequest, ManeuverResponse,
)
from app.domain.astrodynamics.maneuvers import (
    hohmann_transfer, bielliptic_transfer, plane_change,
    combined_maneuver, tsiolkovsky_mass_ratio, circular_speed,
)

router = APIRouter()


@router.post("/hohmann", response_model=HohmannResponse)
async def hohmann(req: HohmannRequest) -> HohmannResponse:
    r = hohmann_transfer(req.r1_km, req.r2_km, req.mu)
    return HohmannResponse(**r)


@router.post("/bielliptic", response_model=ManeuverResponse)
async def bielliptic(req: BiEllipticRequest) -> ManeuverResponse:
    r = bielliptic_transfer(req.r1_km, req.rb_km, req.r2_km, req.mu)
    return ManeuverResponse(dv_total_km_s=r["dv_total_km_s"], details=r)


@router.post("/plane_change", response_model=ManeuverResponse)
async def plane_change_endpoint(req: PlaneChangeRequest) -> ManeuverResponse:
    dv = plane_change(req.v_km_s, math.radians(req.delta_i_deg))
    return ManeuverResponse(dv_total_km_s=abs(dv), details={"dv_km_s": dv})
