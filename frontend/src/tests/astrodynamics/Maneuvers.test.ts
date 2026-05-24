/**
 * Unit tests for orbital maneuver calculations.
 * Reference values from Vallado Example 6-1 and Curtis §6.
 */

import { describe, it, expect } from 'vitest';
import {
  hohmannTransfer,
  biEllipticTransfer,
  planeChange,
  combinedManeuver,
  tsiolkovskyMassRatio,
} from '../../domain/astrodynamics/Maneuvers';
import { circularSpeed } from '../../domain/astrodynamics/TwoBodyProblem';
import { MU_EARTH, R_EARTH } from '../../domain/astrodynamics/constants';

describe('Hohmann Transfer', () => {
  it('LEO 191km → GEO (Vallado Example 6-1, p.328)', () => {
    // Vallado uses: r1 = 6563.5 km (191.34 km altitude), r2 = 42164 km
    const r1 = 6563.5;
    const r2 = 42164.0;
    const result = hohmannTransfer(r1, r2);

    // Vallado Example 6-1: Δv_total = 3.935 km/s (2.458 + 1.478)
    expect(result.dvTotal).toBeCloseTo(3.935, 2);
    expect(result.dv1).toBeGreaterThan(0);
    expect(result.dv2).toBeGreaterThan(0);
  });

  it('circular orbit to self → Δv = 0', () => {
    const r = R_EARTH + 400;
    const result = hohmannTransfer(r, r);
    expect(result.dvTotal).toBeCloseTo(0, 10);
  });

  it('transfer SMA = mean of r1 and r2', () => {
    const r1 = R_EARTH + 300;
    const r2 = R_EARTH + 600;
    const result = hohmannTransfer(r1, r2);
    expect(result.aTransfer).toBeCloseTo((r1 + r2) / 2, 5);
  });

  it('descending transfer (r1 > r2): both Δv negative', () => {
    const r1 = R_EARTH + 1000;
    const r2 = R_EARTH + 300;
    const result = hohmannTransfer(r1, r2);
    expect(result.dv1).toBeLessThan(0);
    expect(result.dv2).toBeLessThan(0);
  });
});

describe('Bi-Elliptic Transfer', () => {
  it('should be more efficient than Hohmann when r2/r1 >> 1 (r2/r1 ≈ 31)', () => {
    // Bi-elliptic wins only when r2/r1 > 11.94 (Battin)
    // Use r1 = 200km LEO, r2 = 200,000 km (deep space), r2/r1 ≈ 31
    const r1 = R_EARTH + 200;   // 6578 km
    const rb = R_EARTH + 500000; // very high intermediate orbit
    const r2 = R_EARTH + 200000; // 206578 km, r2/r1 ≈ 31 > 11.94

    const biEl = biEllipticTransfer(r1, rb, r2);
    const hohm = hohmannTransfer(r1, r2);

    // Bi-elliptic should be cheaper for large r2/r1
    expect(biEl.dvTotal).toBeLessThan(hohm.dvTotal);
  });
});

describe('Plane Change', () => {
  it('pure 90° plane change in circular orbit', () => {
    const v = circularSpeed(R_EARTH + 400, MU_EARTH);
    const dv = planeChange(v, Math.PI / 2);
    // Δv = 2v·sin(45°) = v·√2
    expect(dv).toBeCloseTo(v * Math.sqrt(2), 8);
  });

  it('zero inclination change → zero Δv', () => {
    expect(planeChange(7.8, 0)).toBeCloseTo(0, 10);
  });

  it('combined maneuver ≤ sequential for same Δv+plane change', () => {
    const v1 = 7.8;
    const v2 = 3.075;
    const dI = 28 * Math.PI / 180;

    const combined   = combinedManeuver(v1, v2, dI);
    const sequential = Math.abs(v2 - v1) + planeChange(v2, dI);

    expect(combined).toBeLessThanOrEqual(sequential + 1e-10);
  });
});

describe('Tsiolkovsky Rocket Equation', () => {
  it('Isp=300s, Δv=1 km/s → mass ratio ≈ 1.404', () => {
    const mr = tsiolkovskyMassRatio(1.0, 300);
    expect(mr).toBeCloseTo(Math.exp(1000 / (300 * 9.80665)), 8);
  });

  it('Δv=0 → mass ratio = 1 (no propellant consumed)', () => {
    expect(tsiolkovskyMassRatio(0, 300)).toBeCloseTo(1, 10);
  });
});
