"""
Pydantic models for astrodynamics API input/output.
All units: km, km/s, seconds, radians (unless noted).
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal
from enum import Enum


class OrbitalElements(BaseModel):
    a:     float = Field(..., description="Semi-major axis, km", gt=0)
    e:     float = Field(..., description="Eccentricity", ge=0)
    i:     float = Field(..., description="Inclination, radians", ge=0, le=3.14159265359)
    raan:  float = Field(..., description="RAAN Ω, radians")
    omega: float = Field(..., description="Argument of perigee ω, radians")
    nu:    float = Field(..., description="True anomaly ν, radians")
    t:     Optional[float] = Field(None, description="Epoch, Unix seconds")


class StateVector(BaseModel):
    rx: float = Field(..., description="ECI position x, km")
    ry: float = Field(..., description="ECI position y, km")
    rz: float = Field(..., description="ECI position z, km")
    vx: float = Field(..., description="ECI velocity x, km/s")
    vy: float = Field(..., description="ECI velocity y, km/s")
    vz: float = Field(..., description="ECI velocity z, km/s")
    t:  float = Field(..., description="Epoch, Unix seconds")


class EphemerisPoint(BaseModel):
    t:  float         # Unix seconds
    rx: float; ry: float; rz: float   # km
    vx: float; vy: float; vz: float   # km/s


class GroundTrackPoint(BaseModel):
    t:   float   # Unix seconds
    lat: float   # degrees
    lon: float   # degrees
    alt: float   # km


class COEPoint(BaseModel):
    t:     float
    a:     float; e: float; i_deg: float
    raan_deg: float; omega_deg: float; nu_deg: float


class PropagatorType(str, Enum):
    kepler   = "kepler"
    j2       = "j2"
    j2_drag  = "j2_drag"
    full     = "full"


class PropagationRequest(BaseModel):
    norad_id:              Optional[int]    = None
    initial_state:         Optional[StateVector] = None
    start_iso:             str
    duration_s:            float = Field(..., gt=0, le=86400 * 365)
    step_s:                float = Field(60.0, gt=0)
    propagator:            PropagatorType = PropagatorType.kepler
    ballistic_coeff_kg_m2: Optional[float] = Field(None, description="C_D·A/m in m²/kg")
    compute_ground_track:  bool = True
    compute_coe_history:   bool = False


class PropagationResponse(BaseModel):
    ephemeris:    list[EphemerisPoint]
    ground_track: list[GroundTrackPoint]
    coe_history:  Optional[list[COEPoint]] = None
    propagator:   PropagatorType
    duration_s:   float
    n_points:     int


class HohmannRequest(BaseModel):
    r1_km: float = Field(..., gt=6378, description="Initial orbit radius, km")
    r2_km: float = Field(..., gt=6378, description="Final orbit radius, km")
    mu:    float = Field(398600.4418, description="Gravitational parameter, km³/s²")


class HohmannResponse(BaseModel):
    dv1_km_s:      float
    dv2_km_s:      float
    dv_total_km_s: float
    tof_s:         float
    tof_min:       float
    a_transfer_km: float
    e_transfer:    float


class BiEllipticRequest(BaseModel):
    r1_km: float = Field(..., gt=6378)
    rb_km: float = Field(..., gt=6378)
    r2_km: float = Field(..., gt=6378)
    mu:    float = 398600.4418


class PlaneChangeRequest(BaseModel):
    v_km_s:       float = Field(..., gt=0, description="Orbital speed at maneuver, km/s")
    delta_i_deg:  float = Field(..., ge=0, le=180)


class ManeuverResponse(BaseModel):
    dv_total_km_s: float
    details:       dict
