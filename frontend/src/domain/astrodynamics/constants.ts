// Physical constants — WGS-84 / IERS 2010 standards
// All values in km, kg, s unless noted

export const MU_EARTH    = 398600.4418;       // km³/s² — WGS-84
export const R_EARTH     = 6378.1370;         // km     — WGS-84 equatorial radius
export const J2          = 1.08262668e-3;     //         — IERS 2010, 2nd zonal harmonic
export const J3          = -2.53265648e-6;    //         — 3rd zonal harmonic
export const J4          = -1.61962159e-6;    //         — 4th zonal harmonic
export const F_EARTH     = 1 / 298.257223563; //         — WGS-84 flattening
export const OMEGA_EARTH = 7.2921150e-5;      // rad/s  — Earth sidereal rotation rate (IERS)
export const AU          = 1.495978707e8;     // km     — IAU 2012
export const P_SRP       = 4.56e-6;           // N/m²   — solar radiation pressure at 1 AU
export const C_LIGHT     = 299792.458;        // km/s   — NIST CODATA 2018

// J2000.0 epoch as Unix timestamp (seconds since 1970-01-01T00:00:00 UTC)
export const J2000_UNIX  = 946727935.816;     // 2000-01-01T11:58:55.816 UTC

// Julian date of J2000.0 epoch
export const JD_J2000    = 2451545.0;

// Two-pi
export const TAU = 2 * Math.PI;

// Degree/radian conversion
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
