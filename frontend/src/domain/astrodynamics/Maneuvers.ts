/**
 * Orbital maneuver calculations.
 * References: Vallado §6.1-6.3, Curtis §6.1-6.3
 */

import { MU_EARTH } from './constants';
import { visViva, circularSpeed, orbitalPeriod } from './TwoBodyProblem';
import type { HohmannResult } from './types';

// ── Hohmann Transfer ─────────────────────────────────────────────────────────

/**
 * Hohmann transfer between two coplanar circular orbits.
 * Vallado §6.1
 *
 * @param r1_km  Initial circular orbit radius, km
 * @param r2_km  Final circular orbit radius, km
 * @param mu     Gravitational parameter, km³/s²
 */
export function hohmannTransfer(r1_km: number, r2_km: number, mu = MU_EARTH): HohmannResult {
  const aTransfer = (r1_km + r2_km) / 2;
  const eTransfer = Math.abs(r2_km - r1_km) / (r1_km + r2_km);

  // Velocity at periapsis of transfer ellipse
  const v_transfer_peri = visViva(r1_km, aTransfer, mu);
  // Velocity at apoapsis of transfer ellipse
  const v_transfer_apo  = visViva(r2_km, aTransfer, mu);

  const v1 = circularSpeed(r1_km, mu);
  const v2 = circularSpeed(r2_km, mu);

  const dv1 = v_transfer_peri - v1;  // prograde burn at r1
  const dv2 = v2 - v_transfer_apo;    // prograde burn at r2

  // Transfer time = half the period of the transfer ellipse
  const tof = orbitalPeriod(aTransfer, mu) / 2;

  return {
    dv1,
    dv2,
    dvTotal: Math.abs(dv1) + Math.abs(dv2),
    tof,
    aTransfer,
    eTransfer,
  };
}

// ── Bi-Elliptic Transfer ─────────────────────────────────────────────────────

/**
 * Bi-elliptic transfer (more efficient than Hohmann when r2/r1 > 11.94).
 * Three burns: r1 → rb (intermediate apoapsis) → r2
 *
 * @param r1_km  Initial orbit radius, km
 * @param rb_km  Intermediate apoapsis radius, km (r1 < rb, typically rb >> r1)
 * @param r2_km  Final orbit radius, km
 */
export function biEllipticTransfer(r1_km: number, rb_km: number, r2_km: number, mu = MU_EARTH) {
  const a1 = (r1_km + rb_km) / 2;  // first transfer ellipse
  const a2 = (rb_km + r2_km) / 2;  // second transfer ellipse

  const v1  = circularSpeed(r1_km, mu);
  const v2  = circularSpeed(r2_km, mu);
  const vb1 = visViva(r1_km, a1, mu);  // speed at r1 on first ellipse
  const va1 = visViva(rb_km, a1, mu);  // speed at rb on first ellipse (apo)
  const va2 = visViva(rb_km, a2, mu);  // speed at rb on second ellipse (peri)
  const vb2 = visViva(r2_km, a2, mu);  // speed at r2 on second ellipse

  const dv1 = vb1 - v1;               // first burn (prograde, at r1)
  const dv2 = Math.abs(va2 - va1);     // second burn (at rb)
  const dv3 = v2 - vb2;               // third burn (at r2)
  const dvTotal = Math.abs(dv1) + Math.abs(dv2) + Math.abs(dv3);

  const tof = orbitalPeriod(a1, mu) / 2 + orbitalPeriod(a2, mu) / 2;

  return { dv1, dv2, dv3, dvTotal, tof, a1Transfer: a1, a2Transfer: a2 };
}

// ── Plane Change ─────────────────────────────────────────────────────────────

/**
 * Pure plane change maneuver (no altitude change).
 * Δv = 2v·sin(Δi/2)
 *
 * @param v_km_s     Orbital speed at maneuver point, km/s
 * @param deltaI_rad Inclination change, radians
 */
export function planeChange(v_km_s: number, deltaI_rad: number): number {
  return 2 * v_km_s * Math.sin(deltaI_rad / 2);
}

/**
 * Combined plane change + altitude change (one burn, more efficient than sequential).
 * Δv = √(v1² + v2² - 2·v1·v2·cos(Δi))
 *
 * @param v1_km_s   Speed before maneuver, km/s
 * @param v2_km_s   Speed after maneuver, km/s
 * @param deltaI_rad Inclination change, radians
 */
export function combinedManeuver(v1_km_s: number, v2_km_s: number, deltaI_rad: number): number {
  return Math.sqrt(
    v1_km_s * v1_km_s
    + v2_km_s * v2_km_s
    - 2 * v1_km_s * v2_km_s * Math.cos(deltaI_rad)
  );
}

// ── Low-Thrust (Edelbaum) ────────────────────────────────────────────────────

/**
 * Edelbaum approximation for low-thrust orbit raising with inclination change.
 * More accurate than simple Δv for continuous thrust.
 *
 * @param v1_km_s    Initial circular orbit speed, km/s
 * @param v2_km_s    Final circular orbit speed, km/s
 * @param deltaI_rad Inclination change, radians
 */
export function edelbaumDeltaV(v1_km_s: number, v2_km_s: number, deltaI_rad: number): number {
  return Math.sqrt(
    v1_km_s * v1_km_s
    + v2_km_s * v2_km_s
    - 2 * v1_km_s * v2_km_s * Math.cos(Math.PI * deltaI_rad / 2)
  );
}

// ── Rendezvous (Clohessy-Wiltshire) ─────────────────────────────────────────

/**
 * CW (Hill's) equations for relative motion in LVLH frame.
 * Used for proximity operations and rendezvous.
 * Equations:
 *   ẍ - 2nẏ - 3n²x = fx  (radial, x positive outward)
 *   ÿ + 2nẋ = fy           (along-track, y positive prograde)
 *   z̈ + n²z = fz          (cross-track, z positive orbit-normal)
 *
 * @param n  Mean motion of target, rad/s
 */
export function cwPropagateRelative(
  state0: { x: number; y: number; z: number; dx: number; dy: number; dz: number },
  n: number,
  dt: number
): { x: number; y: number; z: number; dx: number; dy: number; dz: number } {
  const { x, y, z, dx, dy, dz } = state0;
  const s  = Math.sin(n * dt);
  const c  = Math.cos(n * dt);

  // Analytical CW solution (Clohessy & Wiltshire 1960)
  return {
    x:  (4 - 3 * c) * x + s / n * dx + 2 * (1 - c) / n * dy,
    y:  6 * (s - n * dt) * x + y - 2 * (1 - c) / n * dx + (4 * s - 3 * n * dt) / n * dy,
    z:  z * c + dz / n * s,
    dx: 3 * n * s * x + c * dx + 2 * s * dy,
    dy: -6 * n * (1 - c) * x - 2 * s * dx + (4 * c - 3) * dy,
    dz: -z * n * s + dz * c,
  };
}

// ── Delta-v Budget ───────────────────────────────────────────────────────────

/**
 * Tsiolkovsky rocket equation: Δv = Isp·g0·ln(m0/mf)
 * Solve for mass ratio given Δv and specific impulse.
 *
 * @param dv_km_s   Required Δv, km/s
 * @param isp_s     Specific impulse, seconds
 * @param g0_m_s2   Standard gravity, m/s² (default 9.80665)
 * @returns         Mass ratio m0/mf
 */
export function tsiolkovskyMassRatio(dv_km_s: number, isp_s: number, g0_m_s2 = 9.80665): number {
  return Math.exp(dv_km_s * 1000 / (isp_s * g0_m_s2));
}

/**
 * Propellant mass fraction from Tsiolkovsky equation.
 * @returns  Propellant fraction (0 to 1)
 */
export function propellantFraction(dv_km_s: number, isp_s: number): number {
  const mr = tsiolkovskyMassRatio(dv_km_s, isp_s);
  return 1 - 1 / mr;
}
