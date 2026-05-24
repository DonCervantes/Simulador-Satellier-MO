"""
High-fidelity orbital propagator using scipy RK45 adaptive integrator.
Supports: Keplerian, J2, J2+drag, full perturbation models.

References:
  Vallado §9.5, §9.6, §9.7
  scipy.integrate.solve_ivp documentation
"""

import math
import numpy as np
from scipy.integrate import solve_ivp
from datetime import datetime
from typing import Optional

from .kepler import MU_EARTH, R_EARTH, J2, state_to_coe, coe_to_state


# ── Equations of Motion ──────────────────────────────────────────────────────

def eom_two_body(t: float, y: np.ndarray, mu: float = MU_EARTH) -> np.ndarray:
    """Simple two-body EOM. y = [rx, ry, rz, vx, vy, vz]"""
    r_vec = y[:3]
    r     = np.linalg.norm(r_vec)
    accel = -mu / r**3 * r_vec
    return np.concatenate([y[3:], accel])


def j2_accel(r_vec: np.ndarray, mu: float = MU_EARTH) -> np.ndarray:
    """J2 perturbation acceleration in ECI frame. Vallado Eq. 9-30"""
    r    = np.linalg.norm(r_vec)
    fac  = 1.5 * mu * J2 * R_EARTH**2 / r**5
    zr2  = (r_vec[2] / r)**2
    return fac * np.array([
        r_vec[0] * (5 * zr2 - 1),
        r_vec[1] * (5 * zr2 - 1),
        r_vec[2] * (5 * zr2 - 3),
    ])


def eom_j2(t: float, y: np.ndarray, mu: float = MU_EARTH) -> np.ndarray:
    """Two-body + J2 EOM."""
    r_vec = y[:3]
    r     = np.linalg.norm(r_vec)
    a_2b  = -mu / r**3 * r_vec
    a_j2  = j2_accel(r_vec, mu)
    return np.concatenate([y[3:], a_2b + a_j2])


def drag_accel(
    r_vec: np.ndarray,
    v_vec: np.ndarray,
    bcoeff: float,     # C_D·A/m in m²/kg
    omega_e: float = 7.2921150e-5,  # rad/s
) -> np.ndarray:
    """
    Atmospheric drag acceleration.
    Uses simple exponential atmosphere model for client-side estimate.
    For accuracy, use NRLMSISE-00 via the nrlmsise00 Python package.
    """
    from .perturbations import exponential_density

    alt_km  = np.linalg.norm(r_vec) - R_EARTH
    rho     = exponential_density(max(0, alt_km))  # kg/m³

    # Velocity relative to rotating atmosphere
    v_atm   = np.cross(np.array([0.0, 0.0, omega_e]), r_vec)
    v_rel   = v_vec - v_atm
    v_mag   = np.linalg.norm(v_rel)

    if v_mag < 1e-10 or rho < 1e-20:
        return np.zeros(3)

    # Drag in km/s²: (1/2) · bcoeff [m²/kg] · ρ [kg/m³] · v²[km/s]²
    # Convert: ρ × 1e9 = kg/km³; result in km/s² (×1e-9 · 1e9 cancel)
    # Actually: a_drag [km/s²] = 0.5 · bcoeff · rho [kg/m³] · v_rel[km/s]² × 1e-3
    # Full derivation: force/mass = 0.5·Cd·A/m·ρ·v²  [m/s²] → /1000 for km/s²
    a_mag   = 0.5 * bcoeff * rho * v_mag**2 * 1e-3  # km/s² (v in km/s, ρ in kg/m³)

    return -a_mag / v_mag * v_rel


def eom_j2_drag(
    t: float,
    y: np.ndarray,
    bcoeff: float,
    mu: float = MU_EARTH,
) -> np.ndarray:
    """Two-body + J2 + atmospheric drag EOM."""
    r_vec, v_vec = y[:3], y[3:]
    r     = np.linalg.norm(r_vec)
    a_2b  = -mu / r**3 * r_vec
    a_j2  = j2_accel(r_vec, mu)
    a_d   = drag_accel(r_vec, v_vec, bcoeff)
    return np.concatenate([v_vec, a_2b + a_j2 + a_d])


# ── Propagation Entry Point ──────────────────────────────────────────────────

def propagate(
    r0: np.ndarray,
    v0: np.ndarray,
    t0_unix: float,
    duration_s: float,
    step_s: float = 60.0,
    propagator: str = "kepler",
    bcoeff: Optional[float] = None,  # m²/kg
    mu: float = MU_EARTH,
) -> list[dict]:
    """
    Propagate an orbit from initial state (r0, v0) for duration_s seconds.

    Returns list of {t, rx, ry, rz, vx, vy, vz} at each step_s interval.

    Propagators:
      kepler    — pure two-body (analytic, no perturbations)
      j2        — two-body + J2 (scipy RK45)
      j2_drag   — two-body + J2 + drag (scipy RK45)
      full      — J2 + drag + SRP (scipy RK45, future)
    """
    t_span  = (0.0, duration_s)
    t_eval  = np.arange(0, duration_s + step_s, step_s)
    y0      = np.concatenate([r0, v0])

    if propagator == "kepler":
        return _propagate_kepler(r0, v0, t0_unix, duration_s, step_s, mu)

    # Choose EOM
    if propagator == "j2":
        fun = lambda t, y: eom_j2(t, y, mu)
    elif propagator in ("j2_drag", "full"):
        _bcoeff = bcoeff or 0.01  # default 1% m²/kg if not specified
        fun = lambda t, y: eom_j2_drag(t, y, _bcoeff, mu)
    else:
        fun = lambda t, y: eom_two_body(t, y, mu)

    sol = solve_ivp(
        fun=fun,
        t_span=t_span,
        y0=y0,
        method="RK45",
        t_eval=t_eval,
        rtol=1e-10,
        atol=1e-12,
        dense_output=False,
    )

    result = []
    for k in range(len(sol.t)):
        y = sol.y[:, k]
        result.append({
            "t":  t0_unix + sol.t[k],
            "rx": float(y[0]), "ry": float(y[1]), "rz": float(y[2]),
            "vx": float(y[3]), "vy": float(y[4]), "vz": float(y[5]),
        })

    return result


def _propagate_kepler(
    r0: np.ndarray,
    v0: np.ndarray,
    t0_unix: float,
    duration_s: float,
    step_s: float,
    mu: float,
) -> list[dict]:
    """Pure Keplerian propagation using state vector approach."""
    from .kepler import state_to_coe, coe_to_state, mean_to_true
    import math

    coe    = state_to_coe(r0, v0, mu)
    a, e   = coe["a"], coe["e"]
    n      = math.sqrt(mu / a**3)  # mean motion [rad/s]
    M0     = _true_to_mean(coe["nu"], e)

    result = []
    t      = 0.0
    while t <= duration_s + 1e-9:
        M  = (M0 + n * t) % (2 * math.pi)
        nu = mean_to_true(M, e)
        r_vec, v_vec = coe_to_state(a, e, coe["i"], coe["raan"], coe["omega"], nu, mu)
        result.append({
            "t":  t0_unix + t,
            "rx": float(r_vec[0]), "ry": float(r_vec[1]), "rz": float(r_vec[2]),
            "vx": float(v_vec[0]), "vy": float(v_vec[1]), "vz": float(v_vec[2]),
        })
        t += step_s

    return result


def _true_to_mean(nu: float, e: float) -> float:
    import math
    E = 2 * math.atan2(
        math.sqrt(1 - e) * math.sin(nu / 2),
        math.sqrt(1 + e) * math.cos(nu / 2),
    )
    return (E - e * math.sin(E)) % (2 * math.pi)
