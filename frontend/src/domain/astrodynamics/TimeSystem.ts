/**
 * Time system conversions for orbital mechanics.
 * References:
 *   Vallado §3.6, IERS Conventions 2010 Ch. 5
 *   IAU 1982 GMST formula (simplified)
 */

/** Julian Date of Unix epoch (1970-01-01T00:00:00 UTC) */
const JD_UNIX_EPOCH = 2440587.5;
/** Julian Date of J2000.0 (2000-01-01T12:00:00 TT) */
const JD_J2000      = 2451545.0;

/** Unix timestamp (seconds) → Julian Date */
export function unixToJD(unix: number): number {
  return unix / 86400.0 + JD_UNIX_EPOCH;
}

/** Julian Date → Unix timestamp (seconds) */
export function jdToUnix(jd: number): number {
  return (jd - JD_UNIX_EPOCH) * 86400.0;
}

/** Unix timestamp → Julian centuries from J2000.0 */
export function unixToT(unix: number): number {
  return (unixToJD(unix) - JD_J2000) / 36525.0;
}

/**
 * Greenwich Mean Sidereal Time (GMST) in radians.
 * IAU 1982 formula — accurate to ~0.1 arcsecond.
 * For higher accuracy use astropy on the backend (IAU 2006/2000A).
 *
 * @param unix  Unix timestamp (seconds)
 * @returns     GMST in radians [0, 2π)
 */
export function computeGMST(unix: number): number {
  const JD = unixToJD(unix);
  const T  = (JD - JD_J2000) / 36525.0; // Julian centuries from J2000.0

  // GMST at 0h UT1 in degrees
  let theta = 100.4606184
            + 36000.77004 * T
            + 0.000387933 * T * T
            - (T * T * T) / 38710000.0;

  // Add sidereal rotation for fractional UT day
  const fracDay = (unix % 86400.0) / 86400.0;
  theta += 360.98564724 * fracDay;

  // Normalise to [0°, 360°)
  theta = ((theta % 360) + 360) % 360;

  return theta * (Math.PI / 180.0);
}

/**
 * TLE epoch string → Unix timestamp.
 * TLE epoch format: YYDDD.DDDDDDDD (2-digit year, day of year with fraction)
 */
export function tleEpochToUnix(epochYear: number, epochDayFraction: number): number {
  // 2-digit year: 57–99 → 1957–1999, 00–56 → 2000–2056
  const fullYear = epochYear >= 57 ? 1900 + epochYear : 2000 + epochYear;

  // January 1 00:00:00 UTC of fullYear as Unix timestamp
  const jan1 = Date.UTC(fullYear, 0, 1, 0, 0, 0) / 1000;

  // Days are 1-indexed in TLE
  return jan1 + (epochDayFraction - 1) * 86400.0;
}

/**
 * Seconds since J2000.0 epoch → Unix timestamp
 */
export function j2000ToUnix(j2000Seconds: number): number {
  return j2000Seconds + 946727935.816; // J2000_UNIX
}

/**
 * Unix timestamp → seconds since J2000.0
 */
export function unixToJ2000(unix: number): number {
  return unix - 946727935.816;
}
