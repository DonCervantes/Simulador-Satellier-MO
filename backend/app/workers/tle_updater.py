"""
Celery worker: daily fetch from Celestrak GP catalog → upsert to PostgreSQL.

Run:
  celery -A app.workers.tle_updater worker --beat --loglevel=info
"""

import math
import calendar
import logging
from datetime import datetime, timezone

import httpx
from celery import Celery
from celery.schedules import crontab

from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "tle_updater",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.beat_schedule = {
    "refresh-tle-daily": {
        "task": "app.workers.tle_updater.refresh_tle_catalog",
        "schedule": crontab(hour=4, minute=0),  # 04:00 UTC daily
    },
}

CELESTRAK_URL = "https://celestrak.org/SOCRATES/query.php"
CELESTRAK_GP_URL = "https://celestrak.org/SOCRATES/query.php"
CELESTRAK_TLE_URL = (
    "https://celestrak.org/pub/TLE/catalog.txt"
)

MU_EARTH = 398600.4418


def _extract_bstar(line1: str) -> float:
    raw = line1[53:61].strip()
    if not raw or raw == "00000-0":
        return 0.0
    try:
        sign_m   = -1 if raw[0] == "-" else 1
        mantissa = float("0." + raw[1:6])
        sign_e   = -1 if raw[6] == "-" else 1
        exp      = int(raw[7:])
        return sign_m * mantissa * (10 ** (sign_e * exp))
    except (ValueError, IndexError):
        return 0.0


def _parse_tle_to_dict(line0: str, line1: str, line2: str) -> dict | None:
    try:
        name = line0.strip()
        epoch_raw = line1[18:32].strip()
        year_2d   = int(epoch_raw[:2])
        day_frac  = float(epoch_raw[2:])
        full_year = (1900 + year_2d) if year_2d >= 57 else (2000 + year_2d)
        jan1_unix = calendar.timegm((full_year, 1, 1, 0, 0, 0, 0, 1, 0))
        epoch_unix = jan1_unix + (day_frac - 1) * 86400.0

        bstar        = _extract_bstar(line1)
        inclination  = math.radians(float(line2[8:16]))
        raan         = math.radians(float(line2[17:25]))
        eccentricity = float("0." + line2[26:33].strip())
        arg_perigee  = math.radians(float(line2[34:42]))
        mean_anomaly = math.radians(float(line2[43:51]))
        mean_motion  = float(line2[52:63])
        norad_id     = int(line2[2:7])

        n_rad_s = mean_motion * 2 * math.pi / 86400.0
        semi_major_axis = (MU_EARTH / n_rad_s ** 2) ** (1 / 3)

        h_p = semi_major_axis * (1 - eccentricity) - 6378.137
        h_a = semi_major_axis * (1 + eccentricity) - 6378.137
        i_deg = math.degrees(inclination)

        if h_a < 2000:
            orbit_type = "LEO"
        elif 82 < i_deg < 100 and abs(h_a - h_p) < 300:
            orbit_type = "SSO"
        elif 19900 < h_p and h_a < 20700:
            orbit_type = "MEO"
        elif 35686 < h_a < 35886 and eccentricity < 0.01:
            orbit_type = "GEO"
        elif 62 < i_deg < 65 and h_p < 2000 and h_a > 35000:
            orbit_type = "Molniya"
        elif h_p < 2000 and h_a > 35000:
            orbit_type = "GTO"
        else:
            orbit_type = "OTHER"

        return {
            "norad_id":       norad_id,
            "name":           name,
            "epoch_unix":     epoch_unix,
            "mean_motion":    mean_motion,
            "eccentricity":   eccentricity,
            "inclination":    inclination,
            "raan":           raan,
            "arg_perigee":    arg_perigee,
            "mean_anomaly":   mean_anomaly,
            "bstar":          bstar,
            "semi_major_axis": semi_major_axis,
            "orbit_type":     orbit_type,
            "tle_line1":      line1,
            "tle_line2":      line2,
        }
    except (ValueError, IndexError) as err:
        logger.debug("Failed to parse TLE: %s", err)
        return None


@celery_app.task(name="app.workers.tle_updater.refresh_tle_catalog", bind=True, max_retries=3)
def refresh_tle_catalog(self):
    """Fetch full Celestrak TLE catalog and upsert into PostgreSQL."""
    import asyncio
    asyncio.run(_refresh_async())


async def _refresh_async():
    from app.infrastructure.database.session import AsyncSessionLocal
    from app.infrastructure.database.models import Satellite, TLEHistory
    from datetime import datetime, timezone

    logger.info("Fetching Celestrak TLE catalog...")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(CELESTRAK_TLE_URL)
        resp.raise_for_status()
        text = resp.text

    lines = [l.rstrip() for l in text.splitlines() if l.strip()]
    parsed: list[dict] = []
    i = 0
    while i + 2 < len(lines):
        if lines[i + 1].startswith("1 ") and lines[i + 2].startswith("2 "):
            rec = _parse_tle_to_dict(lines[i], lines[i + 1], lines[i + 2])
            if rec:
                parsed.append(rec)
            i += 3
        else:
            i += 1

    logger.info("Parsed %d satellites — upserting to database...", len(parsed))

    async with AsyncSessionLocal() as session:
        for rec in parsed:
            epoch_dt = datetime.fromtimestamp(rec["epoch_unix"], tz=timezone.utc)
            sat = Satellite(
                norad_id       = rec["norad_id"],
                name           = rec["name"],
                epoch_utc      = epoch_dt,
                mean_motion    = rec["mean_motion"],
                eccentricity   = rec["eccentricity"],
                inclination    = rec["inclination"],
                raan           = rec["raan"],
                arg_perigee    = rec["arg_perigee"],
                mean_anomaly   = rec["mean_anomaly"],
                bstar          = rec["bstar"],
                semi_major_axis = rec["semi_major_axis"],
                orbit_type     = rec["orbit_type"],
            )
            tle_hist = TLEHistory(
                norad_id  = rec["norad_id"],
                tle_line1 = rec["tle_line1"],
                tle_line2 = rec["tle_line2"],
                epoch_utc = epoch_dt,
            )

            existing = await session.get(Satellite, rec["norad_id"])
            if existing:
                for col in ("name", "epoch_utc", "mean_motion", "eccentricity",
                            "inclination", "raan", "arg_perigee", "mean_anomaly",
                            "bstar", "semi_major_axis", "orbit_type"):
                    setattr(existing, col, getattr(sat, col))
            else:
                session.add(sat)
            session.add(tle_hist)

        await session.commit()

    logger.info("TLE catalog refresh complete — %d satellites upserted.", len(parsed))
