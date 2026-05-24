"""
Propagation endpoint: Kepler, J2, J2+drag.

Supports two input modes:
  - norad_id: loads orbital elements from PostgreSQL catalog
  - initial_state: custom ECI state vector (r⃗, v⃗) at start_iso

Results are cached in Redis for 1 hour (keyed by norad+params).
"""

import math
import numpy as np
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.astrodynamics.models import (
    PropagationRequest, PropagationResponse,
    EphemerisPoint, GroundTrackPoint, COEPoint,
)
from app.domain.astrodynamics.propagator import propagate
from app.domain.astrodynamics.frame_converter import eci_to_ecef_astropy, ecef_to_geodetic
from app.domain.astrodynamics.kepler import (
    state_to_coe, coe_to_state, solve_kepler_newton, eccentric_to_true, MU_EARTH,
)
from app.infrastructure.database.session import get_db
from app.infrastructure.repositories.satellite_repo import SatelliteRepository
from app.infrastructure.redis.cache import cache_get, cache_set, ephemeris_key

router = APIRouter()

TAU = 2 * math.pi


@router.post("/propagate", response_model=PropagationResponse)
async def propagate_orbit(
    req: PropagationRequest,
    db:  AsyncSession = Depends(get_db),
) -> PropagationResponse:
    """
    Propagate an orbit and return ephemeris + optional ground track / COE history.

    Provide either:
      - norad_id: looks up the satellite in the catalog and propagates from the
                  given start_iso using its stored orbital elements.
      - initial_state: custom ECI state vector at start_iso.
    """
    if req.initial_state is None and req.norad_id is None:
        raise HTTPException(400, "Provide either norad_id or initial_state")

    # ── Parse start time ──────────────────────────────────────────────────────
    try:
        t0     = datetime.fromisoformat(req.start_iso.replace("Z", "+00:00"))
        t0_unix = t0.timestamp()
    except ValueError:
        raise HTTPException(400, f"Invalid start_iso: {req.start_iso!r}")

    # ── Redis cache check (only for catalog-based requests) ───────────────────
    redis_key: str | None = None
    if req.norad_id is not None:
        redis_key = ephemeris_key(
            req.norad_id, req.start_iso,
            req.duration_s, req.step_s, req.propagator.value,
        )
        try:
            cached = await cache_get(redis_key)
            if cached is not None:
                return PropagationResponse(**cached)
        except Exception:
            pass   # Redis unavailable — proceed without cache

    # ── Build initial state vector ────────────────────────────────────────────
    if req.initial_state is not None:
        sv = req.initial_state
        r0 = np.array([sv.rx, sv.ry, sv.rz])
        v0 = np.array([sv.vx, sv.vy, sv.vz])
    else:
        # Catalog lookup -------------------------------------------------------
        repo = SatelliteRepository(db)
        sat  = await repo.get_by_norad(req.norad_id)  # type: ignore[arg-type]
        if sat is None:
            raise HTTPException(404, f"Satellite {req.norad_id} not found in catalog")

        # Compute mean anomaly at t0 from stored epoch + mean motion
        n_rad_s    = sat.mean_motion * TAU / 86_400.0      # rev/day → rad/s
        epoch_unix = sat.epoch_utc.timestamp()
        dt         = t0_unix - epoch_unix
        M          = (sat.mean_anomaly + n_rad_s * dt) % TAU

        # Kepler: M → E → ν
        E  = solve_kepler_newton(M, sat.eccentricity)
        nu = eccentric_to_true(E, sat.eccentricity)

        # COE → ECI state vector (Vallado Algorithm 10)
        r0, v0 = coe_to_state(
            sat.semi_major_axis, sat.eccentricity,
            sat.inclination, sat.raan, sat.arg_perigee, nu,
        )

    # ── Run propagation ───────────────────────────────────────────────────────
    points = propagate(
        r0=r0, v0=v0,
        t0_unix=t0_unix,
        duration_s=req.duration_s,
        step_s=req.step_s,
        propagator=req.propagator.value,
        bcoeff=req.ballistic_coeff_kg_m2,
    )

    # ── Assemble response ─────────────────────────────────────────────────────
    ephemeris = [EphemerisPoint(**p) for p in points]

    # Ground track
    ground_track: list[GroundTrackPoint] = []
    if req.compute_ground_track:
        for p in points:
            r_eci  = np.array([p["rx"], p["ry"], p["rz"]])
            r_ecef = eci_to_ecef_astropy(r_eci, p["t"])
            geo    = ecef_to_geodetic(r_ecef)
            ground_track.append(GroundTrackPoint(
                t=p["t"], lat=geo["lat_deg"], lon=geo["lon_deg"], alt=geo["alt_km"],
            ))

    # Optional COE history
    coe_history: list[COEPoint] | None = None
    if req.compute_coe_history:
        coe_history = []
        for p in points:
            rv  = np.array([p["rx"], p["ry"], p["rz"]])
            vv  = np.array([p["vx"], p["vy"], p["vz"]])
            c   = state_to_coe(rv, vv, MU_EARTH)
            rad2deg = 180.0 / math.pi
            coe_history.append(COEPoint(
                t=p["t"],
                a=c["a"], e=c["e"],
                i_deg=c["i"]     * rad2deg,
                raan_deg=c["raan"]  * rad2deg,
                omega_deg=c["omega"] * rad2deg,
                nu_deg=c["nu"]    * rad2deg,
            ))

    response = PropagationResponse(
        ephemeris=ephemeris,
        ground_track=ground_track,
        coe_history=coe_history,
        propagator=req.propagator,
        duration_s=req.duration_s,
        n_points=len(points),
    )

    # ── Store in Redis (1-hour TTL) ───────────────────────────────────────────
    if redis_key is not None:
        try:
            await cache_set(redis_key, response.model_dump(), ttl_s=3_600)
        except Exception:
            pass   # Redis unavailable — skip caching gracefully

    return response
