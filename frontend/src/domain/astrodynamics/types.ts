// Core astrodynamics type definitions

/** 3D vector in km */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Full 6D state vector: position (km) + velocity (km/s) in ECI frame */
export interface StateVector {
  r: Vec3;   // position, km
  v: Vec3;   // velocity, km/s
  t: number; // epoch, Unix seconds
}

/** Classical Orbital Elements (COEs) */
export interface OrbitalElements {
  a:     number; // semi-major axis, km
  e:     number; // eccentricity (dimensionless)
  i:     number; // inclination, radians [0, π]
  raan:  number; // right ascension of ascending node Ω, radians [0, 2π)
  omega: number; // argument of perigee ω, radians [0, 2π)
  nu:    number; // true anomaly ν, radians [0, 2π)
  // derived, optional
  p?:    number; // semi-latus rectum, km
  h?:    number; // specific angular momentum magnitude, km²/s
  t?:    number; // epoch, Unix seconds
}

/** Orbital energy and momentum invariants */
export interface OrbitalInvariants {
  energy:  number; // specific orbital energy, km²/s² (< 0 elliptic)
  h:       number; // specific angular momentum magnitude, km²/s
  p:       number; // semi-latus rectum, km
  ecc:     number; // eccentricity magnitude
  rPeriap: number; // periapsis radius, km
  rApoap:  number; // apoapsis radius, km (Infinity for hyperbolic)
}

/** Satellite orbit regime */
export type OrbitType = 'LEO' | 'MEO' | 'GEO' | 'SSO' | 'Molniya' | 'Tundra' | 'HEO' | 'GTO' | 'OTHER';

/** Satellite record from TLE catalog */
export interface Satellite {
  noradId:       number;
  name:          string;
  epoch:         number;    // Unix seconds
  meanMotion:    number;    // rev/day (stored raw from TLE)
  eccentricity:  number;
  inclination:   number;    // radians
  raan:          number;    // radians (Ω — NOT Ω−ω as in legacy ETL)
  argPerigee:    number;    // radians (ω)
  meanAnomaly:   number;    // radians (M₀ at epoch)
  bstar:         number;    // drag term, 1/R_Earth
  semiMajorAxis: number;    // km
  orbitType?:    OrbitType;
  // Precomputed rotation matrix rows for fast batch propagation
  // (rows 0-1 of Q_PQW→ECI, since z_pqw=0 for 2D orbit)
  _r11?: number; _r12?: number;
  _r21?: number; _r22?: number;
  _r31?: number; _r32?: number;
  // Mean motion in rad/s (precomputed)
  _nRadS?: number;
}

/** Maneuver impulse */
export interface Impulse {
  dvPrograde:  number; // km/s, positive prograde
  dvNormal:    number; // km/s, positive orbit-normal
  dvRadial:    number; // km/s, positive radial outward
  epochUnix:   number; // when to apply
}

/** Hohmann transfer result */
export interface HohmannResult {
  dv1:          number; // km/s at departure
  dv2:          number; // km/s at arrival
  dvTotal:      number; // km/s total
  tof:          number; // seconds, transfer time
  aTransfer:    number; // km, transfer ellipse SMA
  eTransfer:    number; // transfer ellipse eccentricity
}
