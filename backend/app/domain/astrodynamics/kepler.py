"""
Kepler equation solvers and orbital element conversions.
References:
  Vallado "Fundamentals of Astrodynamics and Applications" 4th ed.
  Battin "Introduction to the Mathematics and Methods of Astrodynamics"
"""

import math
import numpy as np

MU_EARTH = 398600.4418  # km³/s²
R_EARTH  = 6378.1370    # km
J2       = 1.08262668e-3
OMEGA_E  = 7.2921150e-5  # rad/s


def stumpff_c(psi: float) -> float:
    """Stumpff C(ψ) function. Battin Eq. 4.1-17"""
    if psi > 1e-6:
        return (1 - math.cos(math.sqrt(psi))) / psi
    if psi < -1e-6:
        return (math.cosh(math.sqrt(-psi)) - 1) / (-psi)
    return 0.5 - psi / 24 + psi ** 2 / 720


def stumpff_s(psi: float) -> float:
    """Stumpff S(ψ) function. Battin Eq. 4.1-18"""
    if psi > 1e-6:
        sq = math.sqrt(psi)
        return (sq - math.sin(sq)) / (psi * sq)
    if psi < -1e-6:
        sq = math.sqrt(-psi)
        return (math.sinh(sq) - sq) / (-psi * sq)
    return 1 / 6 - psi / 120 + psi ** 2 / 5040


def solve_kepler_newton(M: float, e: float, tol: float = 1e-12) -> float:
    """
    Solve Kepler's equation M = E - e·sin(E) by Newton-Raphson.
    Corrected: denominator is (1 - e·cos(E)), not (1 - e·cos(M)).
    """
    M = math.fmod(M, 2 * math.pi)
    if M < 0:
        M += 2 * math.pi

    # Battin's initial estimate
    E = M + e * math.sin(M) * (1 + e * math.cos(M))
    if e > 0.8:
        E = math.pi

    for _ in range(50):
        delta = (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        E -= delta
        if abs(delta) < tol:
            break

    return E % (2 * math.pi)


def eccentric_to_true(E: float, e: float) -> float:
    """Eccentric anomaly → true anomaly (atan2 for correct quadrant)."""
    return 2 * math.atan2(
        math.sqrt(1 + e) * math.sin(E / 2),
        math.sqrt(1 - e) * math.cos(E / 2),
    )


def mean_to_true(M: float, e: float) -> float:
    return eccentric_to_true(solve_kepler_newton(M, e), e)


def state_to_coe(
    r_vec: np.ndarray,
    v_vec: np.ndarray,
    mu: float = MU_EARTH,
) -> dict:
    """
    State vector → Classical Orbital Elements.
    Vallado Algorithm 9.
    Returns dict with a, e, i, raan, omega, nu (all radians).
    """
    r    = np.linalg.norm(r_vec)
    v    = np.linalg.norm(v_vec)
    v_r  = float(np.dot(r_vec, v_vec)) / r

    h_vec = np.cross(r_vec, v_vec)
    h     = np.linalg.norm(h_vec)

    K     = np.array([0.0, 0.0, 1.0])
    N_vec = np.cross(K, h_vec)
    N     = np.linalg.norm(N_vec)

    e_vec = ((v**2 - mu / r) * r_vec - v_r * r * v_vec) / mu
    e     = np.linalg.norm(e_vec)

    energy = v**2 / 2 - mu / r
    a      = -mu / (2 * energy) if abs(energy) > 1e-10 else float("inf")

    i = math.acos(max(-1.0, min(1.0, h_vec[2] / h)))

    raan = 0.0
    if N > 1e-10:
        raan = math.acos(max(-1.0, min(1.0, N_vec[0] / N)))
        if N_vec[1] < 0:
            raan = 2 * math.pi - raan

    omega = 0.0
    if N > 1e-10 and e > 1e-6:
        omega = math.acos(max(-1.0, min(1.0, float(np.dot(N_vec, e_vec)) / (N * e))))
        if e_vec[2] < 0:
            omega = 2 * math.pi - omega

    nu = 0.0
    if e > 1e-6:
        nu = math.acos(max(-1.0, min(1.0, float(np.dot(e_vec, r_vec)) / (e * r))))
        if v_r < 0:
            nu = 2 * math.pi - nu
    else:
        # Circular: use argument of latitude
        if N > 1e-10:
            nu = math.acos(max(-1.0, min(1.0, float(np.dot(N_vec, r_vec)) / (N * r))))
            if r_vec[2] < 0:
                nu = 2 * math.pi - nu

    return {"a": a, "e": float(e), "i": i, "raan": raan, "omega": omega, "nu": nu}


def coe_to_state(
    a: float, e: float, i: float, raan: float, omega: float, nu: float,
    mu: float = MU_EARTH,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Classical Orbital Elements → ECI state vector.
    Vallado Algorithm 10.
    Returns (r_vec_km, v_vec_km_s).
    """
    p     = a * (1 - e**2)
    h     = math.sqrt(mu * p)
    cos_nu = math.cos(nu)
    sin_nu = math.sin(nu)
    r_mag = p / (1 + e * cos_nu)

    # PQW frame
    r_pqw = np.array([r_mag * cos_nu, r_mag * sin_nu, 0.0])
    v_pqw = np.array([-(mu / h) * sin_nu, (mu / h) * (e + cos_nu), 0.0])

    # Rotation matrix PQW → ECI: R3(-Ω)·R1(-i)·R3(-ω)
    cosO, sinO = math.cos(raan),  math.sin(raan)
    cosI, sinI = math.cos(i),     math.sin(i)
    cosW, sinW = math.cos(omega), math.sin(omega)

    Q = np.array([
        [cosO * cosW - sinO * sinW * cosI,  -cosO * sinW - sinO * cosW * cosI,  sinO * sinI],
        [sinO * cosW + cosO * sinW * cosI,  -sinO * sinW + cosO * cosW * cosI, -cosO * sinI],
        [sinW * sinI,                         cosW * sinI,                        cosI],
    ])

    return Q @ r_pqw, Q @ v_pqw
