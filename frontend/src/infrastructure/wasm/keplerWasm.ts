/**
 * TypeScript wrapper for wasm-physics batch Kepler propagator.
 * Falls back to JS propagation if WASM fails to load.
 *
 * The wasm-pack output is at wasm_physics.js / wasm_physics_bg.wasm (same directory).
 */

import type { Satellite } from '../../domain/astrodynamics/types';
import initWasm, {
  propagate_batch as wasm_propagate_batch,
  propagate_single as wasm_propagate_single,
  rk4_propagate as wasm_rk4_propagate,
} from './wasm_physics.js';

// Stride for sat_data: [a, e, M0, epoch, n_rad_s, r11, r12, r21, r22, r31, r32]
const STRIDE = 11;

let wasmReady = false;
let wasmFailed = false;

export async function loadWasm(): Promise<boolean> {
  if (wasmReady) return true;
  if (wasmFailed) return false;
  try {
    await initWasm();
    wasmReady = true;
    console.info('[WASM] Kepler physics module loaded');
    return true;
  } catch (err) {
    console.warn('[WASM] Failed to load — falling back to JS propagation:', err);
    wasmFailed = true;
    return false;
  }
}

export function isWasmAvailable(): boolean {
  return wasmReady;
}

/**
 * Pack satellite catalog into a flat Float64Array for WASM batch propagation.
 * Layout per satellite (STRIDE=11): [a, e, M0, epoch, n_rad_s, r11, r12, r21, r22, r31, r32]
 */
export function packSatData(satellites: Satellite[]): Float64Array {
  const n = satellites.length;
  const data = new Float64Array(n * STRIDE);
  for (let i = 0; i < n; i++) {
    const s = satellites[i];
    const b = i * STRIDE;
    data[b]      = s.semiMajorAxis;
    data[b + 1]  = s.eccentricity;
    data[b + 2]  = s.meanAnomaly ?? 0;
    data[b + 3]  = s.epoch;
    data[b + 4]  = s._nRadS ?? 0;
    data[b + 5]  = s._r11 ?? 0;
    data[b + 6]  = s._r12 ?? 0;
    data[b + 7]  = s._r21 ?? 0;
    data[b + 8]  = s._r22 ?? 0;
    data[b + 9]  = s._r31 ?? 0;
    data[b + 10] = s._r32 ?? 0;
  }
  return data;
}

/**
 * Batch-propagate all satellites using WASM.
 * Returns a Float32Array of [x,y,z] × n (ECI km).
 */
export function batchPropagateWasm(
  satData: Float64Array,
  simTime: number,
  n: number,
): Float32Array | null {
  if (!wasmReady) return null;
  const out = new Float32Array(n * 3);
  wasm_propagate_batch(satData, simTime, out, n);
  return out;
}

/**
 * Single-satellite propagation via WASM (for UI panels, orbit traces).
 * Returns [x, y, z] ECI km.
 */
export function singlePropagateWasm(sat: Satellite, simTime: number): [number, number, number] | null {
  if (!wasmReady) return null;
  const r = wasm_propagate_single(
    sat.semiMajorAxis, sat.eccentricity, sat.meanAnomaly ?? 0,
    sat.epoch, sat._nRadS ?? 0,
    sat._r11 ?? 0, sat._r12 ?? 0, sat._r21 ?? 0, sat._r22 ?? 0, sat._r31 ?? 0, sat._r32 ?? 0,
    simTime,
  );
  return [r[0]!, r[1]!, r[2]!];
}

/**
 * RK4 propagation via WASM — full ephemeris for a single satellite.
 * Returns flat [rx,ry,rz,vx,vy,vz] × (nSteps+1).
 */
export function rk4PropagateWasm(
  r0: [number, number, number],
  v0: [number, number, number],
  dt: number,
  nSteps: number,
  useJ2 = false,
): Float64Array | null {
  if (!wasmReady) return null;
  return wasm_rk4_propagate(
    r0[0], r0[1], r0[2],
    v0[0], v0[1], v0[2],
    dt, nSteps, useJ2 ? 1 : 0,
  );
}
