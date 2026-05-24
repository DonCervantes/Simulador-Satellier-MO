"""
Orbit type classifier based on classical orbital elements.
Reference: Vallado §2.6; Plan Part IV Module 7.
"""

import math

R_EARTH = 6378.137  # km (WGS-84 equatorial)


def classify_orbit(a_km: float, e: float, i_deg: float) -> str:
    """
    Classify orbit type from semi-major axis, eccentricity, and inclination.

    Returns one of: LEO, MEO, GEO, SSO, MOLNIYA, HEO, GTO, OTHER
    """
    if a_km <= 0 or e < 0 or e >= 1:
        return "OTHER"

    h_p = a_km * (1.0 - e) - R_EARTH   # perigee altitude km
    h_a = a_km * (1.0 + e) - R_EARTH   # apogee  altitude km

    # GEO — geostationary ring ±150 km, near-circular
    if 35_536 < h_a < 36_036 and 35_536 < h_p < 36_036 and e < 0.01:
        return "GEO"

    # GTO — geostationary transfer (low perigee, GEO apogee)
    if h_p < 2_000 and 35_500 < h_a < 36_500 and e > 0.6:
        return "GTO"

    # Molniya — ~12-h, high-eccentricity, 63.4° inclination
    if 62.0 < i_deg < 65.0 and h_p < 2_000 and h_a > 35_000:
        return "MOLNIYA"

    # SSO — Sun-synchronous (polar, near-circular LEO)
    if 82.0 < i_deg < 99.0 and h_a < 2_000 and abs(h_a - h_p) < 500:
        return "SSO"

    # LEO — below 2,000 km apogee
    if h_a < 2_000:
        return "LEO"

    # MEO — GPS/Galileo/GLONASS band
    if 2_000 <= h_p and h_a <= 35_300:
        return "MEO"

    # HEO — highly elliptical (Tundra, etc.)
    if h_a > 35_300:
        return "HEO"

    return "OTHER"


def sso_inclination(h_km: float) -> float:
    """
    Required inclination for a Sun-synchronous circular orbit at altitude h_km.
    Returns inclination in degrees.
    Reference: Vallado Eq. 9-40 (secular RAAN drift = solar rate).
    """
    MU_EARTH  = 398_600.4418  # km³/s²
    J2        = 1.08262668e-3
    T_sun     = 365.2421897 * 86_400.0   # s per year (tropical)
    a         = R_EARTH + h_km
    n         = math.sqrt(MU_EARTH / a ** 3)       # rad/s
    p         = a                                   # circular → p = a
    omega_sun = 2 * math.pi / T_sun                 # rad/s, rate Sun moves along ecliptic

    # dΩ/dt = -(3/2)·n·J₂·(R_E/p)²·cos(i) = omega_sun
    cos_i = -omega_sun / ((3 / 2) * n * J2 * (R_EARTH / p) ** 2)
    cos_i = max(-1.0, min(1.0, cos_i))
    return math.degrees(math.acos(cos_i))
