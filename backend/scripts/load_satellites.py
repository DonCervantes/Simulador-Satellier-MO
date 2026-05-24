"""
Load satellite catalog from frontend/public/data/satellites.json into PostgreSQL.

Usage (from the backend/ directory, with DB running):
    python -m scripts.load_satellites

The script:
  1. Reads satellites.json (8,247 entries, legacy ETL format)
  2. Recovers RAAN from the Ω-ω ETL bug:  raan = longitudeOfAscendingNode + argumentOfPerigee
  3. Computes mean_motion (rev/day) from semi-major axis
  4. Classifies each orbit (LEO/GEO/MEO/SSO/…)
  5. Bulk-inserts into the satellites table (truncates first for idempotency)
"""

import asyncio
import datetime
import json
import math
import os
import sys

# Allow running from the backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete

from app.infrastructure.database.session import AsyncSessionLocal, engine
from app.infrastructure.database.models import Base, Satellite, TLEHistory
from app.domain.catalog.orbit_classifier import classify_orbit

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MU_EARTH = 398_600.4418     # km³/s²
TAU      = 2 * math.pi
R_EARTH  = 6_378.137        # km

# Path to the JSON catalog (relative to repo root)
_THIS_DIR  = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(os.path.dirname(_THIS_DIR))   # backend/../..
JSON_PATH  = os.path.join(_REPO_ROOT, "frontend", "public", "data", "satellites.json")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_epoch_utc(sat: dict) -> datetime.datetime:
    """
    Build a timezone-aware epoch UTC from the JSON's year/epoch fields.

    The TLE epoch is stored as a fractional day-of-year (e.g. "205.56823986")
    for a two-digit year ("23" = 2023). This preserves sub-minute precision
    that year/month/day/hour/minute alone would lose.
    """
    epoch_doy = float(sat.get("epoch", "1.0"))
    year_str  = str(sat.get("epochYear", "00")).strip()

    # TLE convention: 57-99 → 1957-1999, 00-56 → 2000-2056
    yy = int(year_str)
    year = (1900 + yy) if yy >= 57 else (2000 + yy)

    # Day-of-year to calendar date (day 1 = Jan 1)
    day_int  = int(epoch_doy)
    frac_day = epoch_doy - day_int

    base = datetime.datetime(year, 1, 1, tzinfo=datetime.timezone.utc)
    delta = datetime.timedelta(days=day_int - 1, hours=frac_day * 24)
    return base + delta


def compute_mean_motion(a_km: float) -> float:
    """Mean motion in rev/day from semi-major axis (km)."""
    if a_km <= 0:
        return 0.0
    n_rad_s = math.sqrt(MU_EARTH / a_km ** 3)
    return n_rad_s * 86_400.0 / TAU


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def load() -> None:
    print(f"Reading: {JSON_PATH}")
    if not os.path.exists(JSON_PATH):
        print("ERROR: satellites.json not found. Expected at:", JSON_PATH)
        sys.exit(1)

    with open(JSON_PATH, encoding="utf-8") as fh:
        raw: list[dict] = json.load(fh)

    print(f"Parsed {len(raw)} satellites from JSON.")

    satellites: list[Satellite] = []
    skipped = 0

    for s in raw:
        try:
            norad_id = int(s.get("satelliteNumber", 0))
            if norad_id == 0:
                skipped += 1
                continue

            omega = float(s.get("argumentOfPerigee", 0.0))

            # ─── ETL bug fix: longitudeOfAscendingNode stored Ω-ω, recover Ω ───
            lon_asc = float(s.get("longitudeOfAscendingNode", 0.0))
            raan    = lon_asc + omega

            a   = float(s.get("semiMajorAxis", 0.0))
            e   = float(s.get("eccentricity",  0.0))
            inc = float(s.get("inclination",   0.0))   # radians

            if a <= R_EARTH or e < 0 or e >= 1:
                skipped += 1
                continue

            satellites.append(Satellite(
                norad_id       = norad_id,
                name           = str(s.get("name", "UNKNOWN"))[:24],
                epoch_utc      = parse_epoch_utc(s),
                mean_motion    = compute_mean_motion(a),
                eccentricity   = e,
                inclination    = inc,
                raan           = raan,
                arg_perigee    = omega,
                mean_anomaly   = 0.0,   # not stored in legacy ETL output
                bstar          = 0.0,   # not stored in legacy ETL output
                semi_major_axis= a,
                orbit_type     = classify_orbit(a, e, math.degrees(inc)),
            ))
        except (ValueError, KeyError, TypeError) as exc:
            skipped += 1
            print(f"  [WARN] Skipping norad={s.get('satelliteNumber','?')}: {exc}")

    print(f"Prepared {len(satellites)} valid records ({skipped} skipped).")
    print("Connecting to database…")

    async with engine.begin() as conn:
        # Ensure tables exist (idempotent — same as running alembic upgrade head)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Clear existing data (FK order: tle_history → satellites)
        await session.execute(delete(TLEHistory))
        await session.execute(delete(Satellite))
        await session.flush()

        # Bulk insert in chunks of 500 to avoid huge transactions
        chunk_size = 500
        total = len(satellites)
        for start in range(0, total, chunk_size):
            chunk = satellites[start : start + chunk_size]
            session.add_all(chunk)
            await session.flush()
            print(f"  Inserted {min(start + chunk_size, total)}/{total} …")

        await session.commit()

    print(f"Done. {len(satellites)} satellites loaded into PostgreSQL.")

    # Print a quick orbit-type breakdown
    types: dict[str, int] = {}
    for sat in satellites:
        t = sat.orbit_type or "OTHER"
        types[t] = types.get(t, 0) + 1
    print("\nOrbit type breakdown:")
    for t, n in sorted(types.items(), key=lambda x: -x[1]):
        print(f"  {t:10s}  {n:5d}")


if __name__ == "__main__":
    asyncio.run(load())
