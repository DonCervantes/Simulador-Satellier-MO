/**
 * Conversions between State Vectors (r⃗, v⃗) and Classical Orbital Elements (COEs).
 *
 * References:
 *   Vallado Algorithm 9 (r,v → COEs)
 *   Vallado Algorithm 10 (COEs → r,v)
 *   Curtis §4.3, §4.4
 */

import type { Vec3, StateVector, OrbitalElements, OrbitalInvariants } from './types';
import { MU_EARTH } from './constants';
import {
  vecAdd, vecScale, vecDot, vecCross, vecMag,
  pqwToEciMatrix, pqwToEci,
} from './FrameConverter';
import { meanToTrue, trueToMean } from './KeplerSolver';

const TWO_PI = 2 * Math.PI;

// ── State Vector → COEs ──────────────────────────────────────────────────────

/**
 * Convert ECI state vector to classical orbital elements.
 * Vallado Algorithm 9.
 *
 * Edge cases handled:
 *   - Circular equatorial (e ≈ 0, i ≈ 0): uses true longitude λ_true
 *   - Circular inclined  (e ≈ 0, i ≠ 0): uses argument of latitude u
 *   - Equatorial elliptic (i ≈ 0, e ≠ 0): uses true longitude of periapsis ω̃
 */
export function stateVectorToCOE(sv: StateVector, mu = MU_EARTH): OrbitalElements {
  const { r, v } = sv;
  const r_mag = vecMag(r);
  const v_mag = vecMag(v);
  const v_r   = vecDot(r, v) / r_mag; // radial velocity component

  // Specific angular momentum h⃗ = r × v
  const h_vec = vecCross(r, v);
  const h     = vecMag(h_vec);

  // Node vector N⃗ = K̂ × h⃗  (points toward ascending node)
  const K    = { x: 0, y: 0, z: 1 };
  const N_vec = vecCross(K, h_vec);
  const N     = vecMag(N_vec);

  // Eccentricity vector e⃗ = (1/μ)[(v²-μ/r)r⃗ - v_r·r·v⃗]  (BMW Eq. 2.4-10)
  const factor = (v_mag * v_mag - mu / r_mag);
  const e_vec  = vecScale(
    vecAdd(
      vecScale(r, factor),
      vecScale(v, -v_r * r_mag)
    ),
    1 / mu
  );
  const e = vecMag(e_vec);

  // Specific mechanical energy ε = v²/2 - μ/r
  const energy = v_mag * v_mag / 2 - mu / r_mag;

  // Semi-major axis: a = -μ/(2ε)  (∞ for parabolic)
  const a = Math.abs(energy) > 1e-10 ? -mu / (2 * energy) : Infinity;

  // Inclination: cos(i) = h_z / |h|
  const i = Math.acos(Math.min(1, Math.max(-1, h_vec.z / h)));

  // RAAN Ω: cos(Ω) = N_x/|N|
  let raan = 0;
  if (N > 1e-10) {
    raan = Math.acos(Math.min(1, Math.max(-1, N_vec.x / N)));
    if (N_vec.y < 0) raan = TWO_PI - raan;
  }

  // Argument of perigee ω: cos(ω) = (N⃗·e⃗)/(|N||e|)
  let omega = 0;
  if (N > 1e-10 && e > 1e-6) {
    omega = Math.acos(Math.min(1, Math.max(-1, vecDot(N_vec, e_vec) / (N * e))));
    if (e_vec.z < 0) omega = TWO_PI - omega;
  }

  // True anomaly ν: cos(ν) = (e⃗·r⃗)/(|e||r|)
  let nu = 0;
  if (e > 1e-6) {
    nu = Math.acos(Math.min(1, Math.max(-1, vecDot(e_vec, r) / (e * r_mag))));
    if (v_r < 0) nu = TWO_PI - nu;
  } else {
    // Circular orbit: ν = argument of latitude (angle from node to satellite)
    if (N > 1e-10) {
      nu = Math.acos(Math.min(1, Math.max(-1, vecDot(N_vec, r) / (N * r_mag))));
      if (r.z < 0) nu = TWO_PI - nu;
    }
  }

  const p = h * h / mu;

  return { a, e, i, raan, omega, nu, p, h, t: sv.t };
}

// ── COEs → State Vector ──────────────────────────────────────────────────────

/**
 * Convert classical orbital elements to ECI state vector.
 * Vallado Algorithm 10.
 *
 * @param oe  Orbital elements (ν = true anomaly at desired time)
 * @param mu  Gravitational parameter, km³/s²
 */
export function coeToStateVector(oe: OrbitalElements, mu = MU_EARTH): { r: Vec3; v: Vec3 } {
  const { a, e, i, raan, omega, nu } = oe;

  const cosNu = Math.cos(nu);
  const sinNu = Math.sin(nu);

  const p = a * (1 - e * e);         // semi-latus rectum
  const h = Math.sqrt(mu * p);       // specific angular momentum
  const r_pqw_mag = p / (1 + e * cosNu);

  // Position and velocity in Perifocal (PQW) frame
  const r_pqw: Vec3 = {
    x: r_pqw_mag * cosNu,
    y: r_pqw_mag * sinNu,
    z: 0,
  };
  const v_pqw: Vec3 = {
    x: -(mu / h) * sinNu,
    y:  (mu / h) * (e + cosNu),
    z: 0,
  };

  // Rotation matrix PQW → ECI: Q = R3(-Ω)·R1(-i)·R3(-ω)
  const Q = pqwToEciMatrix(raan, i, omega);

  return {
    r: pqwToEci(r_pqw, Q),
    v: pqwToEci(v_pqw, Q),
  };
}

// ── Orbital Invariants ───────────────────────────────────────────────────────

/**
 * Compute orbital energy, angular momentum, and derived invariants.
 */
export function computeInvariants(sv: StateVector, mu = MU_EARTH): OrbitalInvariants {
  const r = vecMag(sv.r);
  const v = vecMag(sv.v);
  const h_vec = vecCross(sv.r, sv.v);
  const h     = vecMag(h_vec);
  const energy = v * v / 2 - mu / r;
  const a = Math.abs(energy) > 1e-10 ? -mu / (2 * energy) : Infinity;
  const e_num = vecAdd(
    vecScale(sv.r, v * v - mu / r),
    vecScale(sv.v, -vecDot(sv.r, sv.v))
  );
  const ecc = vecMag(vecScale(e_num, 1 / mu));
  const p = h * h / mu;

  return {
    energy,
    h,
    p,
    ecc,
    rPeriap: a * (1 - ecc),
    rApoap:  ecc < 1 ? a * (1 + ecc) : Infinity,
  };
}

// ── Propagation helpers ───────────────────────────────────────────────────────

/**
 * Fast Kepler propagation: advance a satellite from epoch to target time.
 * Returns new true anomaly only (for use in render loops).
 *
 * @param M0_rad    Mean anomaly at epoch [radians]
 * @param n_rad_s   Mean motion [rad/s]
 * @param e         Eccentricity
 * @param t_epoch   Epoch [Unix seconds]
 * @param t_target  Target time [Unix seconds]
 */
export function keplerPropagate(
  M0_rad: number,
  n_rad_s: number,
  e: number,
  t_epoch: number,
  t_target: number
): number {
  const dt = t_target - t_epoch;
  const M  = ((M0_rad + n_rad_s * dt) % TWO_PI + TWO_PI) % TWO_PI;
  return meanToTrue(M, e);
}

/**
 * Full state vector propagation using Kepler's laws.
 * Advance an orbital state by dt seconds.
 */
export function propagateStateVector(sv: StateVector, dt: number, mu = MU_EARTH): StateVector {
  const coe = stateVectorToCOE(sv, mu);
  const n   = Math.sqrt(mu / (coe.a * coe.a * coe.a));  // mean motion, rad/s
  const M0  = trueToMean(coe.nu, coe.e);
  const M   = ((M0 + n * dt) % TWO_PI + TWO_PI) % TWO_PI;
  const nu  = meanToTrue(M, coe.e);
  const { r, v } = coeToStateVector({ ...coe, nu }, mu);
  return { r, v, t: sv.t + dt };
}
