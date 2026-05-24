"""
Reference frame conversions using astropy for production accuracy.
Uses IAU 2006/2000A precession-nutation model via GCRS→ITRS.
"""

from datetime import datetime, timezone
import math
import numpy as np

try:
    from astropy.time import Time
    from astropy.coordinates import GCRS, ITRS
    import astropy.units as u
    ASTROPY_AVAILABLE = True
except ImportError:
    ASTROPY_AVAILABLE = False


def eci_to_ecef_astropy(
    r_eci_km: np.ndarray,
    epoch_unix: float,
) -> np.ndarray:
    """
    ECI (GCRS) → ECEF (ITRS) using astropy's full precession-nutation model.
    Accurate to sub-meter level.
    Falls back to GMST rotation if astropy unavailable.
    """
    if not ASTROPY_AVAILABLE:
        return eci_to_ecef_gmst(r_eci_km, epoch_unix)

    t = Time(epoch_unix, format="unix", scale="utc")
    gcrs = GCRS(
        x=r_eci_km[0] * u.km,
        y=r_eci_km[1] * u.km,
        z=r_eci_km[2] * u.km,
        representation_type="cartesian",
        obstime=t,
    )
    itrs = gcrs.transform_to(ITRS(obstime=t))
    xyz  = itrs.cartesian.xyz.to(u.km).value
    return xyz


def eci_to_ecef_gmst(r_eci_km: np.ndarray, epoch_unix: float) -> np.ndarray:
    """
    ECI → ECEF via GMST rotation about Z-axis.
    Simplified (IAU 1982), accurate to ~1 km.
    """
    theta = compute_gmst(epoch_unix)
    c, s  = math.cos(theta), math.sin(theta)
    return np.array([
         c * r_eci_km[0] + s * r_eci_km[1],
        -s * r_eci_km[0] + c * r_eci_km[1],
        r_eci_km[2],
    ])


def compute_gmst(unix_s: float) -> float:
    """Greenwich Mean Sidereal Time, radians. IAU 1982."""
    JD   = unix_s / 86400.0 + 2440587.5
    T    = (JD - 2451545.0) / 36525.0
    theta = (100.4606184
             + 36000.77004 * T
             + 0.000387933 * T**2
             - T**3 / 38710000.0)
    theta = math.fmod(theta, 360.0)
    if theta < 0:
        theta += 360.0
    frac_day = math.fmod(unix_s, 86400.0) / 86400.0
    theta   += 360.98564724 * frac_day
    return math.fmod(theta, 360.0) * math.pi / 180.0


def ecef_to_geodetic(r_ecef_km: np.ndarray) -> dict:
    """ECEF → geodetic latitude, longitude, altitude (WGS-84)."""
    a  = 6378.1370
    f  = 1 / 298.257223563
    e2 = 2 * f - f**2

    x, y, z = r_ecef_km
    lon = math.atan2(y, x)
    rho = math.sqrt(x**2 + y**2)

    lat = math.atan2(z, rho * (1 - e2))
    for _ in range(5):
        sinLat = math.sin(lat)
        N = a / math.sqrt(1 - e2 * sinLat**2)
        lat = math.atan2(z + e2 * N * sinLat, rho)

    sinLat = math.sin(lat)
    N   = a / math.sqrt(1 - e2 * sinLat**2)
    alt = rho / math.cos(lat) - N if abs(math.cos(lat)) > 1e-10 else abs(z) - N * (1 - e2)

    return {
        "lat_deg": lat * 180 / math.pi,
        "lon_deg": lon * 180 / math.pi,
        "alt_km":  alt,
    }
