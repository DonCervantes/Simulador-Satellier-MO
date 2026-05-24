/**
 * Unit tests for Kepler equation solvers.
 * All expected values validated against analytic solutions and Poliastro.
 */

import { describe, it, expect } from 'vitest';
import {
  solveKeplerElliptic,
  eccentricToTrue,
  trueToEccentric,
  eccentricToMean,
  meanToTrue,
  stumpffC,
  stumpffS,
} from '../../domain/astrodynamics/KeplerSolver';

const TOL = 1e-10;

describe('Kepler Equation — Elliptic', () => {
  it('circular orbit: M=E (e=0)', () => {
    const M = 1.23;
    expect(solveKeplerElliptic(M, 0)).toBeCloseTo(M, 10);
  });

  it('e=0.1, M=π/2', () => {
    const E = solveKeplerElliptic(Math.PI / 2, 0.1);
    // Verify: M = E - e·sin(E)
    const Mcheck = E - 0.1 * Math.sin(E);
    expect(Mcheck).toBeCloseTo(Math.PI / 2, 10);
  });

  it('e=0.5, M=π/4', () => {
    const E = solveKeplerElliptic(Math.PI / 4, 0.5);
    const Mcheck = E - 0.5 * Math.sin(E);
    expect(Mcheck).toBeCloseTo(Math.PI / 4, 10);
  });

  it('e=0.9 (high eccentricity)', () => {
    const M = 1.0;
    const E = solveKeplerElliptic(M, 0.9);
    const Mcheck = E - 0.9 * Math.sin(E);
    expect(Math.abs(Mcheck - M)).toBeLessThan(TOL);
  });

  it('e=0.99 (near-parabolic)', () => {
    const M = 0.5;
    const E = solveKeplerElliptic(M, 0.99);
    const Mcheck = E - 0.99 * Math.sin(E);
    expect(Math.abs(Mcheck - M)).toBeLessThan(TOL);
  });

  it('M=0 → E=0', () => {
    expect(solveKeplerElliptic(0, 0.5)).toBeCloseTo(0, 10);
  });

  it('M=π → E=π (any e)', () => {
    expect(solveKeplerElliptic(Math.PI, 0.3)).toBeCloseTo(Math.PI, 10);
  });

  it('round-trip: M → E → M', () => {
    for (const [M, e] of [[0.1, 0.3], [2.5, 0.7], [5.8, 0.05]]) {
      const E = solveKeplerElliptic(M, e);
      const Mback = eccentricToMean(E, e);
      expect(Math.abs(Mback - M)).toBeLessThan(TOL);
    }
  });
});

describe('Anomaly Conversions', () => {
  it('E → ν → E round-trip', () => {
    for (const [E, e] of [[0.5, 0.3], [2.0, 0.6], [4.5, 0.1]]) {
      const nu = eccentricToTrue(E, e);
      const Eback = trueToEccentric(nu, e);
      // Both should represent same position (mod 2π)
      expect(Math.abs(Math.cos(Eback) - Math.cos(E))).toBeLessThan(1e-10);
      expect(Math.abs(Math.sin(Eback) - Math.sin(E))).toBeLessThan(1e-10);
    }
  });

  it('meanToTrue: full pipeline M → ν', () => {
    const M = 1.0;
    const e = 0.4;
    const nu = meanToTrue(M, e);
    // Verify by going back: ν → E → M
    const E  = trueToEccentric(nu, e);
    const Mcheck = eccentricToMean(E, e);
    expect(Math.abs(Mcheck - M)).toBeLessThan(TOL);
  });
});

describe('Stumpff Functions', () => {
  it('C(0) = 1/2 (Taylor limit)', () => {
    expect(stumpffC(0)).toBeCloseTo(0.5, 12);
  });

  it('S(0) = 1/6 (Taylor limit)', () => {
    expect(stumpffS(0)).toBeCloseTo(1 / 6, 12);
  });

  it('C(ψ > 0) matches analytic: C(π²) = (1 - cos(π))/π² = 2/π²', () => {
    const psi = Math.PI * Math.PI;
    expect(stumpffC(psi)).toBeCloseTo((1 - Math.cos(Math.PI)) / psi, 10);
  });

  it('S(ψ > 0) matches analytic', () => {
    const psi = 1.0;
    const sq  = Math.sqrt(psi);
    expect(stumpffS(psi)).toBeCloseTo((sq - Math.sin(sq)) / (psi * sq), 10);
  });

  it('C(ψ < 0) matches analytic', () => {
    const psi = -1.0;
    expect(stumpffC(psi)).toBeCloseTo((Math.cosh(1) - 1), 10);
  });
});
