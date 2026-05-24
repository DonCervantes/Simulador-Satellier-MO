/**
 * Kepler equation solvers for elliptic, parabolic, and hyperbolic orbits.
 * References:
 *   Vallado, "Fundamentals of Astrodynamics", 4th ed., §2.2
 *   Battin, "Introduction to the Mathematics and Methods of Astrodynamics", Ch. 4
 */

const TWO_PI = 2 * Math.PI;

/**
 * Solve Kepler's equation for ELLIPTIC orbits: M = E - e·sin(E)
 * Uses Newton-Raphson iteration with Battin's initial estimate.
 *
 * IMPORTANT: denominator uses (1 - e·cos(E)) NOT (1 - e·cos(M)).
 * The legacy C++ code had a bug using cos(M) throughout, which diverges for e > 0.5.
 *
 * @param M  Mean anomaly [radians], any value (will be normalised to [0, 2π))
 * @param e  Eccentricity [0, 1)
 * @param tol Convergence tolerance (default 1e-12)
 * @returns  Eccentric anomaly E [radians, 0 to 2π)
 */
export function solveKeplerElliptic(M: number, e: number, tol = 1e-12): number {
  // Normalise M to [0, 2π)
  M = ((M % TWO_PI) + TWO_PI) % TWO_PI;

  // Battin's initial estimate (better than M for high eccentricity)
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));

  // Use π as seed for high eccentricity near apoapsis (Battin §2.4)
  if (e > 0.8) E = Math.PI;

  for (let iter = 0; iter < 50; iter++) {
    const sinE  = Math.sin(E);
    const cosE  = Math.cos(E);
    const delta = (E - e * sinE - M) / (1 - e * cosE);  // correct: uses cos(E)
    E -= delta;
    if (Math.abs(delta) < tol) break;
  }

  return ((E % TWO_PI) + TWO_PI) % TWO_PI;
}

/**
 * Convert eccentric anomaly → true anomaly for elliptic orbit.
 * Uses atan2 to preserve quadrant unambiguously.
 * Battin Eq. 2.42: tan(ν/2) = √((1+e)/(1-e)) · tan(E/2)
 */
export function eccentricToTrue(E: number, e: number): number {
  const sq = Math.sqrt((1 + e) / (1 - e));
  return 2 * Math.atan2(sq * Math.sin(E / 2), Math.cos(E / 2));
}

/**
 * Convert true anomaly → eccentric anomaly for elliptic orbit.
 */
export function trueToEccentric(nu: number, e: number): number {
  const cosNu = Math.cos(nu);
  const E = Math.acos((e + cosNu) / (1 + e * cosNu));
  return Math.sin(nu) < 0 ? TWO_PI - E : E;
}

/**
 * Convert eccentric anomaly → mean anomaly: M = E - e·sin(E)
 */
export function eccentricToMean(E: number, e: number): number {
  return E - e * Math.sin(E);
}

/**
 * True anomaly → mean anomaly (elliptic)
 */
export function trueToMean(nu: number, e: number): number {
  return eccentricToMean(trueToEccentric(nu, e), e);
}

/**
 * Mean anomaly → true anomaly for elliptic orbit (combined solve)
 */
export function meanToTrue(M: number, e: number): number {
  return eccentricToTrue(solveKeplerElliptic(M, e), e);
}

/**
 * Solve Kepler's equation for HYPERBOLIC orbits: M = e·sinh(F) - F
 * @param M  Hyperbolic mean anomaly (can be any real)
 * @param e  Eccentricity > 1
 * @returns  Hyperbolic eccentric anomaly F
 */
export function solveKeplerHyperbolic(M: number, e: number, tol = 1e-12): number {
  // Initial estimate
  let F = Math.sign(M) * Math.log(2 * Math.abs(M) / e + 1.8);

  for (let iter = 0; iter < 50; iter++) {
    const delta = (e * Math.sinh(F) - F - M) / (e * Math.cosh(F) - 1);
    F -= delta;
    if (Math.abs(delta) < tol) break;
  }

  return F;
}

/**
 * Convert hyperbolic eccentric anomaly → true anomaly.
 * tan(ν/2) = √((e+1)/(e-1)) · tanh(F/2)
 */
export function hyperbolicToTrue(F: number, e: number): number {
  const sq = Math.sqrt((e + 1) / (e - 1));
  return 2 * Math.atan(sq * Math.tanh(F / 2));
}

/**
 * Stumpff C(ψ) function — needed for universal variable propagation.
 * Valid for ψ > 0 (elliptic), ψ = 0 (parabolic), ψ < 0 (hyperbolic).
 * Battin Eq. 4.1-17
 */
export function stumpffC(psi: number): number {
  if (psi > 1e-6)  return (1 - Math.cos(Math.sqrt(psi))) / psi;
  if (psi < -1e-6) return (Math.cosh(Math.sqrt(-psi)) - 1) / (-psi);
  // Taylor series for near-parabolic
  return 0.5 - psi / 24 + (psi * psi) / 720;
}

/**
 * Stumpff S(ψ) function — companion to C(ψ).
 * Battin Eq. 4.1-18
 */
export function stumpffS(psi: number): number {
  if (psi > 1e-6) {
    const sq = Math.sqrt(psi);
    return (sq - Math.sin(sq)) / (psi * sq);
  }
  if (psi < -1e-6) {
    const sq = Math.sqrt(-psi);
    return (Math.sinh(sq) - sq) / (-psi * sq);
  }
  return 1 / 6 - psi / 120 + (psi * psi) / 5040;
}
