/**
 * Unit tests for State Vector ↔ COE conversions.
 * Reference values from Vallado Example 2-5 (p. 116).
 */

import { describe, it, expect } from 'vitest';
import { stateVectorToCOE, coeToStateVector, propagateStateVector } from '../../domain/astrodynamics/StateVector';
import { MU_EARTH, DEG_TO_RAD, RAD_TO_DEG } from '../../domain/astrodynamics/constants';
import type { StateVector } from '../../domain/astrodynamics/types';

const D2R = DEG_TO_RAD;
const R2D = RAD_TO_DEG;

describe('State Vector ↔ COE (Vallado Example 2-5)', () => {
  // Vallado p.116: r = [6524.834, 6862.875, 6448.296] km
  //                v = [4.901327, 5.533756, -1.976341] km/s
  // Expected COEs:  a ≈ 36127.34 km, e ≈ 0.83285, i ≈ 87.87°,
  //                 Ω ≈ 227.89°, ω ≈ 53.38°, ν ≈ 92.34°
  const sv: StateVector = {
    r: { x: 6524.834, y: 6862.875, z: 6448.296 },
    v: { x: 4.901327, y: 5.533756, z: -1.976341 },
    t: 0,
  };

  let coe: ReturnType<typeof stateVectorToCOE>;

  it('r,v → COE: semi-major axis ≈ 36127 km', () => {
    coe = stateVectorToCOE(sv, MU_EARTH);
    expect(coe.a).toBeCloseTo(36127.34, 0);
  });

  it('r,v → COE: eccentricity ≈ 0.83285', () => {
    coe = stateVectorToCOE(sv, MU_EARTH);
    expect(coe.e).toBeCloseTo(0.83285, 3);
  });

  it('r,v → COE: inclination ≈ 87.87°', () => {
    coe = stateVectorToCOE(sv, MU_EARTH);
    expect(coe.i * R2D).toBeCloseTo(87.87, 1);
  });

  it('r,v → COE: RAAN ≈ 227.89°', () => {
    coe = stateVectorToCOE(sv, MU_EARTH);
    expect(coe.raan * R2D).toBeCloseTo(227.89, 1);
  });

  it('r,v → COE: argument of perigee ≈ 53.38°', () => {
    coe = stateVectorToCOE(sv, MU_EARTH);
    expect(coe.omega * R2D).toBeCloseTo(53.38, 1);
  });

  it('COE → r,v round-trip: position within 1 m', () => {
    coe = stateVectorToCOE(sv, MU_EARTH);
    const { r: r2 } = coeToStateVector(coe, MU_EARTH);
    const dr = Math.sqrt(
      (r2.x - sv.r.x) ** 2 + (r2.y - sv.r.y) ** 2 + (r2.z - sv.r.z) ** 2
    );
    expect(dr).toBeLessThan(0.001); // < 1 m
  });
});

describe('Circular orbit COE consistency', () => {
  it('ISS-like circular orbit: e ≈ 0, i = 51.6°', () => {
    // ISS: a ≈ 6778 km, i = 51.6°, circular
    const a = 6778;
    const e = 0.001;
    const i = 51.6 * D2R;
    const raan = 0;
    const omega = 0;
    const nu = 0;

    const { r, v } = coeToStateVector({ a, e, i, raan, omega, nu }, MU_EARTH);
    const coe = stateVectorToCOE({ r, v, t: 0 }, MU_EARTH);

    expect(coe.a).toBeCloseTo(a, 1);
    expect(coe.e).toBeCloseTo(e, 3);
    expect(coe.i * R2D).toBeCloseTo(51.6, 1);
  });
});

describe('Propagation', () => {
  it('one full period returns to initial state (< 1 km error)', () => {
    const a = 7000;
    const { r, v } = coeToStateVector(
      { a, e: 0.01, i: 30 * DEG_TO_RAD, raan: 0, omega: 0, nu: 0 },
      MU_EARTH
    );
    const sv0: StateVector = { r, v, t: 0 };
    const period = 2 * Math.PI * Math.sqrt(a ** 3 / MU_EARTH);
    const sv1 = propagateStateVector(sv0, period, MU_EARTH);
    const dr = Math.sqrt((sv1.r.x - r.x) ** 2 + (sv1.r.y - r.y) ** 2 + (sv1.r.z - r.z) ** 2);
    expect(dr).toBeLessThan(0.001); // < 1 m
  });
});
