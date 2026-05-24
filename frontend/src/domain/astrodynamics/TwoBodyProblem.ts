/**
 * Two-body problem: orbital energy, angular momentum, vis-viva, orbit classification.
 * References: Vallado §2.2, Curtis §2.2-2.4
 */

import { MU_EARTH, R_EARTH } from './constants';
import type { Vec3, OrbitalElements, OrbitType } from './types';
import { vecMag, vecCross } from './FrameConverter';

// ── Orbital Energy ──────────────────────────────────────────────────────────

/** Specific orbital energy: ε = v²/2 - μ/r = -μ/(2a) */
export function specificEnergy(r_mag: number, v_mag: number, mu = MU_EARTH): number {
  return v_mag * v_mag / 2 - mu / r_mag;
}

/** Semi-major axis from specific energy: a = -μ/(2ε) */
export function smaFromEnergy(energy: number, mu = MU_EARTH): number {
  return -mu / (2 * energy);
}

/**
 * Vis-viva equation: v² = μ(2/r - 1/a)
 * @returns Speed at radius r on an orbit with SMA a
 */
export function visViva(r: number, a: number, mu = MU_EARTH): number {
  return Math.sqrt(mu * (2 / r - 1 / a));
}

/** Circular orbital speed at radius r */
export function circularSpeed(r: number, mu = MU_EARTH): number {
  return Math.sqrt(mu / r);
}

/** Escape speed at radius r */
export function escapeSpeed(r: number, mu = MU_EARTH): number {
  return Math.sqrt(2 * mu / r);
}

// ── Angular Momentum ────────────────────────────────────────────────────────

/** Specific angular momentum magnitude: |h| = |r × v| */
export function specificH(r: Vec3, v: Vec3): number {
  return vecMag(vecCross(r, v));
}

/** Semi-latus rectum: p = h²/μ = a(1-e²) */
export function semiLatusRectum(oe: OrbitalElements, mu = MU_EARTH): number {
  if (oe.p !== undefined) return oe.p;
  if (oe.h !== undefined) return oe.h * oe.h / mu;
  return oe.a * (1 - oe.e * oe.e);
}

// ── Orbital Period ──────────────────────────────────────────────────────────

/** Orbital period: T = 2π√(a³/μ) [seconds] */
export function orbitalPeriod(a: number, mu = MU_EARTH): number {
  return 2 * Math.PI * Math.sqrt(a * a * a / mu);
}

/** Mean motion: n = √(μ/a³) [rad/s] */
export function meanMotion(a: number, mu = MU_EARTH): number {
  return Math.sqrt(mu / (a * a * a));
}

// ── Orbit Classification ────────────────────────────────────────────────────

/**
 * Classify orbit by conic type based on eccentricity.
 */
export function orbitConicType(e: number): 'circular' | 'elliptic' | 'parabolic' | 'hyperbolic' {
  if (e < 0.001)  return 'circular';
  if (e < 1.0)    return 'elliptic';
  if (e === 1.0)  return 'parabolic';
  return 'hyperbolic';
}

/**
 * Classify orbit regime (LEO, MEO, GEO, SSO, Molniya, etc.)
 * Based on altitude ranges and inclination.
 */
export function classifyOrbitRegime(oe: OrbitalElements): OrbitType {
  const { a, e, i } = oe;
  const iDeg = i * (180 / Math.PI);

  const hPeriapKm = a * (1 - e) - R_EARTH;
  const hApoKm    = a * (1 + e) - R_EARTH;

  // LEO: apoapsis < 2000 km
  if (hApoKm < 2000) return 'LEO';

  // SSO: near-polar, slightly retrograde, low eccentricity
  // Exact: dΩ/dt matches Sun's drift — inclination ~97-99° for LEO/MEO
  if (iDeg > 82 && iDeg < 100 && Math.abs(hApoKm - hPeriapKm) < 300) return 'SSO';

  // MEO: roughly 2000–35586 km altitude
  if (hPeriapKm > 2000 && hApoKm < 35586) return 'MEO';

  // GEO: altitude ≈ 35786 km, near-circular, equatorial
  if (hApoKm > 35686 && hApoKm < 35886 && e < 0.01 && iDeg < 1) return 'GEO';

  // Molniya: 63.4° inclination, highly elliptic, 12-hr period
  if (iDeg > 61 && iDeg < 65 && hPeriapKm < 2000 && hApoKm > 35000) return 'Molniya';

  // Tundra: 63.4° inclination, 24-hr period
  if (iDeg > 61 && iDeg < 65 && hPeriapKm > 30000 && e > 0.2) return 'Tundra';

  // GTO: Geostationary Transfer Orbit
  if (hPeriapKm < 2000 && hApoKm > 35000) return 'GTO';

  // HEO: High Earth Orbit
  if (hApoKm > 35886) return 'HEO';

  return 'OTHER';
}

// ── SSO Inclination ─────────────────────────────────────────────────────────

/**
 * Required inclination for a Sun-synchronous orbit.
 * Derived from: dΩ/dt = -(3/2)n·J₂·(R_E/p)²·cos(i) = 2π / T_sun
 *
 * @param a_km  Semi-major axis, km
 * @param e     Eccentricity
 * @returns     Required inclination in radians
 */
export function ssoInclination(a_km: number, e: number, mu = MU_EARTH): number {
  const { J2, R_EARTH: RE } = { J2: 1.08262668e-3, R_EARTH: 6378.137 };
  const n     = meanMotion(a_km, mu);                 // rad/s
  const p     = a_km * (1 - e * e);
  const T_sun = 365.2422 * 86400;                     // s per Julian year
  const n_sun = 2 * Math.PI / T_sun;                   // rad/s, Sun's apparent motion

  // cos(i) = -(2/3) · n_sun · p² / (n · J₂ · R_E²)
  const cosI  = -(2 / 3) * n_sun * p * p / (n * J2 * RE * RE);

  if (Math.abs(cosI) > 1) return NaN; // no SSO possible at this altitude
  return Math.acos(cosI);
}

// ── Perifocal Frame Position ─────────────────────────────────────────────────

/**
 * Position in Perifocal frame for given true anomaly.
 * Curtis §2.4: r = p/(1+e·cosν) · [cosν, sinν, 0]
 */
export function perifocalPosition(nu: number, oe: OrbitalElements, mu = MU_EARTH): Vec3 {
  const p = semiLatusRectum(oe, mu);
  const r = p / (1 + oe.e * Math.cos(nu));
  return { x: r * Math.cos(nu), y: r * Math.sin(nu), z: 0 };
}

/**
 * Velocity in Perifocal frame for given true anomaly.
 * Curtis §2.4: v = (μ/h)·[-sinν, e+cosν, 0]
 */
export function perifocalVelocity(nu: number, oe: OrbitalElements, mu = MU_EARTH): Vec3 {
  const p = semiLatusRectum(oe, mu);
  const h = Math.sqrt(mu * p);
  return {
    x: -(mu / h) * Math.sin(nu),
    y:  (mu / h) * (oe.e + Math.cos(nu)),
    z: 0,
  };
}
