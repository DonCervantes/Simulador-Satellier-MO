/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const eci_to_ecef: (a: number, b: number, c: number, d: number) => [number, number];
export const pqw_to_eci_batch: (a: number, b: number, c: number) => [number, number];
export const pqw_to_eci_matrix: (a: number, b: number, c: number) => [number, number];
export const propagate_batch: (a: number, b: number, c: number, d: number, e: number, f: any, g: number) => void;
export const propagate_single: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number];
export const rk4_propagate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
export const rk4_step: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
export const sma_from_mean_motion: (a: number) => number;
export const init: () => void;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_start: () => void;
