/**
 * Satellite orbit regime classifier.
 * Wraps TwoBodyProblem.classifyOrbitRegime for catalog use.
 */

import { classifyOrbitRegime, ssoInclination } from '../astrodynamics/TwoBodyProblem';
import type { OrbitalElements, OrbitType } from '../astrodynamics/types';
import { R_EARTH, RAD_TO_DEG } from '../astrodynamics/constants';

export { classifyOrbitRegime };

/** Classify from catalog fields (SMA km, e, inclination radians) */
export function classifyFromCatalog(smaKm: number, eccentricity: number, inclinationRad: number): OrbitType {
  const oe: OrbitalElements = { a: smaKm, e: eccentricity, i: inclinationRad, raan: 0, omega: 0, nu: 0 };
  return classifyOrbitRegime(oe);
}

/** Human-readable label for orbit type */
export function orbitTypeLabel(type: OrbitType): string {
  const labels: Record<OrbitType, string> = {
    LEO:     'Low Earth Orbit',
    MEO:     'Medium Earth Orbit',
    GEO:     'Geostationary Orbit',
    SSO:     'Sun-Synchronous Orbit',
    Molniya: 'Molniya Orbit',
    Tundra:  'Tundra Orbit',
    GTO:     'GTO / Transfer',
    HEO:     'High Earth Orbit',
    OTHER:   'Other',
  };
  return labels[type] ?? 'Unknown';
}

/** Altitude range for display */
export function orbitAltitudeRange(smaKm: number, e: number) {
  return {
    periapsisKm: smaKm * (1 - e) - R_EARTH,
    apoapsisKm:  smaKm * (1 + e) - R_EARTH,
  };
}

/** Required inclination for SSO at given altitude */
export function requiredSSOInclination(altKm: number, e = 0): string {
  const a   = R_EARTH + altKm;
  const inc = ssoInclination(a, e);
  if (isNaN(inc)) return 'N/A';
  return `${(inc * RAD_TO_DEG).toFixed(2)}°`;
}
