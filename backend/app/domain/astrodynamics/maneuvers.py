"""
Orbital maneuver calculations.
References: Vallado §6.1-6.3, Curtis §6.1-6.3
"""

import math
from .kepler import MU_EARTH


def circular_speed(r_km: float, mu: float = MU_EARTH) -> float:
    """Circular orbital speed at radius r_km [km/s]."""
    return math.sqrt(mu / r_km)


def vis_viva(r_km: float, a_km: float, mu: float = MU_EARTH) -> float:
    """Vis-viva equation: speed at radius r on orbit with SMA a [km/s]."""
    return math.sqrt(mu * (2 / r_km - 1 / a_km))


def orbital_period(a_km: float, mu: float = MU_EARTH) -> float:
    """Keplerian orbital period [seconds]."""
    return 2 * math.pi * math.sqrt(a_km**3 / mu)


def hohmann_transfer(r1_km: float, r2_km: float, mu: float = MU_EARTH) -> dict:
    """
    Hohmann transfer between two coplanar circular orbits.
    Vallado §6.1
    """
    a_t   = (r1_km + r2_km) / 2
    e_t   = abs(r2_km - r1_km) / (r1_km + r2_km)
    v1    = circular_speed(r1_km, mu)
    v2    = circular_speed(r2_km, mu)
    vt1   = vis_viva(r1_km, a_t, mu)
    vt2   = vis_viva(r2_km, a_t, mu)
    dv1   = vt1 - v1
    dv2   = v2 - vt2
    tof   = orbital_period(a_t, mu) / 2

    return {
        "dv1_km_s":      dv1,
        "dv2_km_s":      dv2,
        "dv_total_km_s": abs(dv1) + abs(dv2),
        "tof_s":         tof,
        "tof_min":       tof / 60,
        "a_transfer_km": a_t,
        "e_transfer":    e_t,
    }


def bielliptic_transfer(r1_km: float, rb_km: float, r2_km: float, mu: float = MU_EARTH) -> dict:
    """Bi-elliptic transfer. Three burns."""
    a1    = (r1_km + rb_km) / 2
    a2    = (rb_km + r2_km) / 2
    v1    = circular_speed(r1_km, mu)
    v2    = circular_speed(r2_km, mu)
    vb1   = vis_viva(r1_km, a1, mu)   # at r1 on first ellipse
    va1   = vis_viva(rb_km, a1, mu)   # at rb on first ellipse
    va2   = vis_viva(rb_km, a2, mu)   # at rb on second ellipse
    vb2   = vis_viva(r2_km, a2, mu)   # at r2 on second ellipse
    dv1   = vb1 - v1
    dv2   = abs(va2 - va1)
    dv3   = v2 - vb2
    tof   = orbital_period(a1, mu) / 2 + orbital_period(a2, mu) / 2

    return {
        "dv1_km_s":      dv1,
        "dv2_km_s":      dv2,
        "dv3_km_s":      dv3,
        "dv_total_km_s": abs(dv1) + abs(dv2) + abs(dv3),
        "tof_s":         tof,
        "a1_transfer_km": a1,
        "a2_transfer_km": a2,
    }


def plane_change(v_km_s: float, delta_i_rad: float) -> float:
    """Pure plane change: Δv = 2v·sin(Δi/2) [km/s]."""
    return 2 * v_km_s * math.sin(delta_i_rad / 2)


def combined_maneuver(v1_km_s: float, v2_km_s: float, delta_i_rad: float) -> float:
    """Combined altitude + plane change: Δv = √(v1² + v2² − 2v1v2cos(Δi))."""
    return math.sqrt(
        v1_km_s**2 + v2_km_s**2 - 2 * v1_km_s * v2_km_s * math.cos(delta_i_rad)
    )


def edelbaum_delta_v(v1_km_s: float, v2_km_s: float, delta_i_rad: float) -> float:
    """Edelbaum low-thrust approximation."""
    return math.sqrt(
        v1_km_s**2 + v2_km_s**2 - 2 * v1_km_s * v2_km_s * math.cos(math.pi * delta_i_rad / 2)
    )


def tsiolkovsky_mass_ratio(dv_km_s: float, isp_s: float, g0: float = 9.80665) -> float:
    """Tsiolkovsky rocket equation: mass ratio m0/mf."""
    return math.exp(dv_km_s * 1000 / (isp_s * g0))
