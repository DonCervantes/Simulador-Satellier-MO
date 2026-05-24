/**
 * Orbital perturbation models (client-side approximations).
 * For high-fidelity propagation, use the backend (scipy RK45 + NRLMSISE-00).
 *
 * References:
 *   Vallado §9.5 (J2), §9.6 (drag), §9.7 (SRP)
 *   Brouwer (1959), Kozai (1959) — secular J2 rates
 */

import { MU_EARTH, J2, R_EARTH, P_SRP, AU } from './constants';
import type { OrbitalElements } from './types';
import { meanMotion } from './TwoBodyProblem';

// ── J2 Secular Rates ─────────────────────────────────────────────────────────

/**
 * J2 secular drift rates for orbital elements.
 * Valid for near-circular orbits; for elliptic use full integration.
 * Vallado Eq. 9-40
 *
 * @returns Rates in rad/s: { dRaan, dOmega, dM }
 */
export function j2SecularRates(oe: OrbitalElements, mu = MU_EARTH): {
  dRaan_radS: number;
  dOmega_radS: number;
  dM_radS: number;
} {
  const { a, e, i } = oe;
  const n   = meanMotion(a, mu);
  const p   = a * (1 - e * e);
  const rp  = R_EARTH / p;         // (R_E/p)
  const rp2 = rp * rp;
  const cosI = Math.cos(i);
  const cos2I = cosI * cosI;

  // dΩ/dt — RAAN regression (negative for posigrade orbits)
  const dRaan_radS = -(3 / 2) * n * J2 * rp2 * cosI;

  // dω/dt — apsidal precession
  const dOmega_radS = (3 / 4) * n * J2 * rp2 * (5 * cos2I - 1);

  // dM/dt — mean motion correction
  const dM_radS = n + (3 / 4) * n * J2 * rp2 * Math.sqrt(1 - e * e) * (3 * cos2I - 1);

  return { dRaan_radS, dOmega_radS, dM_radS };
}

/**
 * J2 acceleration vector in ECI frame.
 * Used for full numerical integration.
 * Vallado Eq. 9-30
 *
 * @param r  ECI position vector, km
 * @returns  Acceleration, km/s²
 */
export function j2Acceleration(r: { x: number; y: number; z: number }, mu = MU_EARTH): {
  x: number; y: number; z: number;
} {
  const r_mag = Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z);
  const r2    = r_mag * r_mag;
  const factor = (3 / 2) * mu * J2 * R_EARTH * R_EARTH / (r2 * r2 * r_mag);
  const zr2   = (r.z / r_mag) * (r.z / r_mag);

  return {
    x: factor * r.x * (5 * zr2 - 1),
    y: factor * r.y * (5 * zr2 - 1),
    z: factor * r.z * (5 * zr2 - 3),
  };
}

/**
 * Propagate orbital elements forward by dt seconds using J2 secular rates.
 * Quick approximation — use full RK45 integration for accuracy > 24h.
 */
export function applyJ2Secular(oe: OrbitalElements, dt_s: number, mu = MU_EARTH): OrbitalElements {
  const rates = j2SecularRates(oe, mu);
  const TWO_PI = 2 * Math.PI;
  return {
    ...oe,
    raan:  ((oe.raan  + rates.dRaan_radS  * dt_s) % TWO_PI + TWO_PI) % TWO_PI,
    omega: ((oe.omega + rates.dOmega_radS * dt_s) % TWO_PI + TWO_PI) % TWO_PI,
    // nu adjusted via mean anomaly drift
  };
}

// ── Atmospheric Drag (exponential model) ─────────────────────────────────────

/**
 * Simplified exponential atmospheric density model.
 * Good for qualitative demonstration; use NRLMSISE-00 on backend for accuracy.
 * Vallado Table 9-3 altitude bands
 *
 * @param alt_km  Geodetic altitude, km
 * @returns       Atmospheric density, kg/m³
 */
export function exponentialAtmDensity(alt_km: number): number {
  // Exponential segments (altitude band, base density kg/m³, scale height km)
  const layers: [number, number, number][] = [
    [0,    1.225,       8.44],
    [25,   3.899e-2,    6.49],
    [30,   1.774e-2,    6.75],
    [40,   3.972e-3,    7.77],
    [50,   1.057e-3,    8.82],
    [60,   3.206e-4,    9.87],
    [70,   8.770e-5,    10.92],
    [80,   1.905e-5,    13.24],
    [100,  5.408e-7,    16.65],
    [150,  2.070e-9,    22.52],
    [200,  2.789e-10,   29.74],
    [300,  1.806e-11,   53.63],
    [400,  3.396e-12,   53.63],
    [500,  5.297e-13,   56.22],
    [600,  8.380e-14,   67.25],
    [700,  1.136e-14,   84.57],
    [800,  1.585e-15,   97.35],
    [900,  6.967e-16,   100.0],
    [1000, 1.338e-16,   120.0],
  ];

  let idx = layers.length - 1;
  for (let k = 0; k < layers.length - 1; k++) {
    if (alt_km < layers[k + 1][0]) { idx = k; break; }
  }
  const [h0, rho0, H] = layers[idx];
  return rho0 * Math.exp(-(alt_km - h0) / H);
}

/**
 * Atmospheric drag deceleration magnitude.
 * a_drag = (1/2) · (C_D · A/m) · ρ · v_rel²   [km/s²]
 * Note: divide by 1e6 to convert kg/m³ → kg/km³, then adjust units.
 *
 * @param v_rel_km_s   Relative velocity w.r.t. atmosphere, km/s
 * @param rho_kg_m3    Atmospheric density, kg/m³
 * @param bcoeff       Ballistic coefficient C_D·A/m in m²/kg
 * @returns            Drag deceleration magnitude, km/s²
 */
export function dragDeceleration(v_rel_km_s: number, rho_kg_m3: number, bcoeff: number): number {
  // Convert: ρ [kg/m³] → [kg/km³] = ρ × 1e9
  // Then: a [km/s²] = 0.5 · bcoeff · ρ_km3 · v² [km/s]²
  // = 0.5 · bcoeff · (ρ × 1e9) · v² × 1e-9  (cancel 1e9 from ρ_km3 vs km/s² dimensions)
  // Simplifies to: a [km/s²] = 0.5 · bcoeff · ρ [kg/m³] · v² [km²/s²] × 1e3 (for km/s²)
  const rho_km3 = rho_kg_m3 * 1e9;  // kg/km³
  return 0.5 * bcoeff * rho_km3 * v_rel_km_s * v_rel_km_s * 1e-9;
}

// ── Solar Radiation Pressure ──────────────────────────────────────────────────

/**
 * Solar radiation pressure acceleration.
 * a_SRP = P_SRP · (A/m) · C_R · (AU/|r_sun|)²   [m/s²]
 *
 * @param r_sat_km     Satellite ECI position, km
 * @param r_sun_km     Sun ECI position, km (from ephemeris)
 * @param areaToMass   A/m, m²/kg
 * @param cr           Radiation pressure coefficient (1 absorbing, 2 specular)
 * @returns            SRP acceleration vector, km/s²
 */
export function srpAcceleration(
  r_sat_km: { x: number; y: number; z: number },
  r_sun_km: { x: number; y: number; z: number },
  areaToMass: number,
  cr = 1.5
): { x: number; y: number; z: number } {
  const rSun2Sat = {
    x: r_sat_km.x - r_sun_km.x,
    y: r_sat_km.y - r_sun_km.y,
    z: r_sat_km.z - r_sun_km.z,
  };
  const d = Math.sqrt(rSun2Sat.x ** 2 + rSun2Sat.y ** 2 + rSun2Sat.z ** 2);
  const auD = AU / d;
  // a_SRP in m/s², convert to km/s²
  const mag = P_SRP * areaToMass * cr * auD * auD * 1e-3;
  const rHat_d = d > 0 ? d : 1;
  return {
    x: mag * rSun2Sat.x / rHat_d,
    y: mag * rSun2Sat.y / rHat_d,
    z: mag * rSun2Sat.z / rHat_d,
  };
}

// ── J2 Altitude Decay Rate ────────────────────────────────────────────────────

/**
 * Estimate altitude decay rate due to drag (circular orbit approximation).
 * da/dt ≈ -2 · bcoeff · ρ · a · v  [km/s]
 *
 * @param a_km    Semi-major axis, km
 * @param bcoeff  Ballistic coefficient C_D·A/m, m²/kg
 * @param mu      Gravitational parameter, km³/s²
 */
export function altitudeDecayRate(a_km: number, bcoeff: number, mu = MU_EARTH): number {
  const alt = a_km - R_EARTH;
  const rho  = exponentialAtmDensity(alt);
  const v    = Math.sqrt(mu / a_km);  // circular speed, km/s
  // da/dt [km/s] (negative = decay)
  return -2 * bcoeff * rho * 1e9 * a_km * v * 1e-9;
}
