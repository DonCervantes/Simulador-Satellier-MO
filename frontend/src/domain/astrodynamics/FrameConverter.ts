/**
 * Reference frame transformations for orbital mechanics.
 *
 * Supported frames:
 *   ECI  — Earth-Centered Inertial (J2000/GCRS approximation)
 *   ECEF — Earth-Centered Earth-Fixed (ITRS approximation via GMST)
 *   PQW  — Perifocal (P toward periapsis, Q 90° ahead, W = h-hat)
 *   LVLH — Local Vertical / Local Horizontal (CW rendezvous frame)
 *
 * For production accuracy, ECI↔ECEF should go through the backend
 * which uses astropy's full IAU 2006/2000A precession-nutation model.
 *
 * References:
 *   Vallado §3.1, Curtis §4.4, IERS Conventions 2010
 */

import { computeGMST } from './TimeSystem';
import type { Vec3, OrbitalElements } from './types';
import { MU_EARTH } from './constants';

// ── Vector utilities ────────────────────────────────────────────────────────

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vecMag(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function vecNorm(v: Vec3): Vec3 {
  const m = vecMag(v);
  return m > 0 ? vecScale(v, 1 / m) : { x: 0, y: 0, z: 0 };
}

// ── PQW ↔ ECI ───────────────────────────────────────────────────────────────

/**
 * 3×3 rotation matrix from Perifocal (PQW) to ECI frame.
 * Q = R3(−Ω) · R1(−i) · R3(−ω)
 *
 * Returns only the 6 elements needed when z_pqw = 0 (in-plane orbit):
 * row 0: (r11, r12),  row 1: (r21, r22),  row 2: (r31, r32)
 * Full matrix 3rd column is for out-of-plane component (unused for position on orbit).
 */
export function pqwToEciMatrix(raan: number, inc: number, omega: number): number[] {
  const cosO = Math.cos(raan),  sinO = Math.sin(raan);
  const cosI = Math.cos(inc),   sinI = Math.sin(inc);
  const cosW = Math.cos(omega), sinW = Math.sin(omega);

  return [
    cosO * cosW - sinO * sinW * cosI,   // [0,0] = r11
    -cosO * sinW - sinO * cosW * cosI,  // [0,1] = r12
    sinO * sinI,                         // [0,2] = r13
    sinO * cosW + cosO * sinW * cosI,   // [1,0] = r21
    -sinO * sinW + cosO * cosW * cosI,  // [1,1] = r22
    -cosO * sinI,                        // [1,2] = r23
    sinW * sinI,                         // [2,0] = r31
    cosW * sinI,                         // [2,1] = r32
    cosI,                                // [2,2] = r33
  ];
}

/**
 * Transform a position vector from Perifocal frame to ECI using the 9-element matrix.
 */
export function pqwToEci(r_pqw: Vec3, Q: number[]): Vec3 {
  return {
    x: Q[0] * r_pqw.x + Q[1] * r_pqw.y + Q[2] * r_pqw.z,
    y: Q[3] * r_pqw.x + Q[4] * r_pqw.y + Q[5] * r_pqw.z,
    z: Q[6] * r_pqw.x + Q[7] * r_pqw.y + Q[8] * r_pqw.z,
  };
}

// ── ECI ↔ ECEF ──────────────────────────────────────────────────────────────

/**
 * Rotate ECI position to ECEF using GMST rotation about Z-axis.
 * r_ecef = Rz(θ_GMST) · r_eci
 *
 * Accurate to ~1 km for most applications; for sub-meter accuracy
 * use the backend astropy GCRS→ITRS conversion.
 */
export function eciToEcef(r_eci: Vec3, unixTime: number): Vec3 {
  const theta = computeGMST(unixTime);
  const cos_t = Math.cos(theta);
  const sin_t = Math.sin(theta);
  return {
    x:  cos_t * r_eci.x + sin_t * r_eci.y,
    y: -sin_t * r_eci.x + cos_t * r_eci.y,
    z:  r_eci.z,
  };
}

/** Inverse: ECEF → ECI (rotation by −GMST) */
export function ecefToEci(r_ecef: Vec3, unixTime: number): Vec3 {
  const theta = computeGMST(unixTime);
  const cos_t = Math.cos(theta);
  const sin_t = Math.sin(theta);
  return {
    x: cos_t * r_ecef.x - sin_t * r_ecef.y,
    y: sin_t * r_ecef.x + cos_t * r_ecef.y,
    z: r_ecef.z,
  };
}

// ── ECEF → Geodetic ──────────────────────────────────────────────────────────

/**
 * Convert ECEF position to geodetic latitude, longitude, altitude.
 * Uses Bowring iterative method (WGS-84).
 *
 * @returns { lat: degrees, lon: degrees, alt: km }
 */
export function ecefToGeodetic(r: Vec3): { lat: number; lon: number; alt: number } {
  const a  = 6378.1370;    // WGS-84 equatorial radius, km
  const f  = 1 / 298.257223563;
  const e2 = 2 * f - f * f; // first eccentricity squared

  const lon = Math.atan2(r.y, r.x) * (180 / Math.PI);
  const rho = Math.sqrt(r.x * r.x + r.y * r.y);

  // Bowring iteration
  let lat = Math.atan2(r.z, rho * (1 - e2));
  for (let i = 0; i < 5; i++) {
    const sinLat = Math.sin(lat);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    lat = Math.atan2(r.z + e2 * N * sinLat, rho);
  }
  const sinLat = Math.sin(lat);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const alt = rho / Math.cos(lat) - N;

  return { lat: lat * (180 / Math.PI), lon, alt };
}

/** ECI → geodetic (combines ECI→ECEF→geodetic) */
export function eciToGeodetic(r_eci: Vec3, unixTime: number) {
  return ecefToGeodetic(eciToEcef(r_eci, unixTime));
}

// ── Orbital elements utilities ────────────────────────────────────────────────

/**
 * Compute specific angular momentum from orbital elements.
 * h = √(μ·p),  p = a(1−e²)
 */
export function specificAngularMomentum(oe: OrbitalElements): number {
  const p = oe.a * (1 - oe.e * oe.e);
  return Math.sqrt(MU_EARTH * p);
}
