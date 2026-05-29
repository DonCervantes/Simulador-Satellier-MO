/* tslint:disable */
/* eslint-disable */

/**
 * ECI → ECEF rotation via GMST (simplified IAU 1982).
 * Returns [rx, ry, rz] ECEF given ECI and Unix timestamp.
 */
export function eci_to_ecef(rx: number, ry: number, rz: number, unix_seconds: number): Float64Array;

export function init(): void;

/**
 * Batch: given N satellites each with [raan, inc, omega], compute
 * the 6 precomputed matrix elements needed by propagate_batch:
 * [r11, r12, r21, r22, r31, r32] × N (matching enricher.py naming).
 *
 * Input `elements`: [raan, inc, omega] × N  (all in radians)
 * Output: [r11, r12, r21, r22, r31, r32] × N
 */
export function pqw_to_eci_batch(elements: Float64Array, n: number): Float64Array;

/**
 * Build PQW→ECI rotation matrix from orbital elements.
 * Returns flat 9-element row-major array [r00,r01,r02, r10,...,r22].
 * Q = R3(−Ω) · R1(−i) · R3(−ω)
 */
export function pqw_to_eci_matrix(raan: number, inc: number, omega: number): Float64Array;

/**
 * Batch Keplerian propagation for N satellites.
 *
 * Layout of `sat_data` (13 f64 per satellite):
 *   [0]  a        — semi-major axis (km)
 *   [1]  e        — eccentricity
 *   [2]  M0       — mean anomaly at epoch (rad)
 *   [3]  epoch    — TLE epoch (Unix seconds)
 *   [4]  n_rad_s  — mean motion (rad/s)
 *   [5]  r11  [6] r12
 *   [7]  r21  [8] r22
 *   [9]  r31  [10] r32
 *   (r31/r32 are used only for z; indices match enricher.py precomputed matrix)
 *
 * Output `out`: [x, y, z] × N (ECI km), stored as f32 for GPU upload.
 * N.B. sat_data length must be exactly 11 * n.
 */
export function propagate_batch(sat_data: Float64Array, sim_time: number, out: Float32Array, n: number): void;

/**
 * Single-satellite propagation — returns [x, y, z] ECI km (for testing/JS use).
 */
export function propagate_single(a: number, e: number, m0: number, epoch: number, n_rad: number, r11: number, r12: number, r21: number, r22: number, r31: number, r32: number, sim_time: number): Float64Array;

/**
 * Propagate n_steps × dt seconds and return full ephemeris as flat array.
 * Output: [rx,ry,rz,vx,vy,vz] × (n_steps+1), including initial state.
 */
export function rk4_propagate(rx: number, ry: number, rz: number, vx: number, vy: number, vz: number, dt: number, n_steps: number, use_j2: number): Float64Array;

/**
 * Propagate a state vector [rx,ry,rz,vx,vy,vz] by dt seconds using RK4.
 * Returns new [rx,ry,rz,vx,vy,vz].
 * use_j2: 1 = include J2 perturbation, 0 = two-body only.
 */
export function rk4_step(rx: number, ry: number, rz: number, vx: number, vy: number, vz: number, dt: number, use_j2: number): Float64Array;

/**
 * Compute SMA from mean motion (rev/day).
 */
export function sma_from_mean_motion(mean_motion_rev_day: number): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly eci_to_ecef: (a: number, b: number, c: number, d: number) => [number, number];
    readonly pqw_to_eci_batch: (a: number, b: number, c: number) => [number, number];
    readonly pqw_to_eci_matrix: (a: number, b: number, c: number) => [number, number];
    readonly propagate_batch: (a: number, b: number, c: number, d: number, e: number, f: any, g: number) => void;
    readonly propagate_single: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number];
    readonly rk4_propagate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly rk4_step: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly sma_from_mean_motion: (a: number) => number;
    readonly init: () => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
