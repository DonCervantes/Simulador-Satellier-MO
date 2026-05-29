/* @ts-self-types="./wasm_physics.d.ts" */

/**
 * ECI → ECEF rotation via GMST (simplified IAU 1982).
 * Returns [rx, ry, rz] ECEF given ECI and Unix timestamp.
 * @param {number} rx
 * @param {number} ry
 * @param {number} rz
 * @param {number} unix_seconds
 * @returns {Float64Array}
 */
export function eci_to_ecef(rx, ry, rz, unix_seconds) {
    const ret = wasm.eci_to_ecef(rx, ry, rz, unix_seconds);
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

export function init() {
    wasm.init();
}

/**
 * Batch: given N satellites each with [raan, inc, omega], compute
 * the 6 precomputed matrix elements needed by propagate_batch:
 * [r11, r12, r21, r22, r31, r32] × N (matching enricher.py naming).
 *
 * Input `elements`: [raan, inc, omega] × N  (all in radians)
 * Output: [r11, r12, r21, r22, r31, r32] × N
 * @param {Float64Array} elements
 * @param {number} n
 * @returns {Float64Array}
 */
export function pqw_to_eci_batch(elements, n) {
    const ptr0 = passArrayF64ToWasm0(elements, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.pqw_to_eci_batch(ptr0, len0, n);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * Build PQW→ECI rotation matrix from orbital elements.
 * Returns flat 9-element row-major array [r00,r01,r02, r10,...,r22].
 * Q = R3(−Ω) · R1(−i) · R3(−ω)
 * @param {number} raan
 * @param {number} inc
 * @param {number} omega
 * @returns {Float64Array}
 */
export function pqw_to_eci_matrix(raan, inc, omega) {
    const ret = wasm.pqw_to_eci_matrix(raan, inc, omega);
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

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
 * @param {Float64Array} sat_data
 * @param {number} sim_time
 * @param {Float32Array} out
 * @param {number} n
 */
export function propagate_batch(sat_data, sim_time, out, n) {
    const ptr0 = passArrayF64ToWasm0(sat_data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = passArrayF32ToWasm0(out, wasm.__wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    wasm.propagate_batch(ptr0, len0, sim_time, ptr1, len1, out, n);
}

/**
 * Single-satellite propagation — returns [x, y, z] ECI km (for testing/JS use).
 * @param {number} a
 * @param {number} e
 * @param {number} m0
 * @param {number} epoch
 * @param {number} n_rad
 * @param {number} r11
 * @param {number} r12
 * @param {number} r21
 * @param {number} r22
 * @param {number} r31
 * @param {number} r32
 * @param {number} sim_time
 * @returns {Float64Array}
 */
export function propagate_single(a, e, m0, epoch, n_rad, r11, r12, r21, r22, r31, r32, sim_time) {
    const ret = wasm.propagate_single(a, e, m0, epoch, n_rad, r11, r12, r21, r22, r31, r32, sim_time);
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

/**
 * Propagate n_steps × dt seconds and return full ephemeris as flat array.
 * Output: [rx,ry,rz,vx,vy,vz] × (n_steps+1), including initial state.
 * @param {number} rx
 * @param {number} ry
 * @param {number} rz
 * @param {number} vx
 * @param {number} vy
 * @param {number} vz
 * @param {number} dt
 * @param {number} n_steps
 * @param {number} use_j2
 * @returns {Float64Array}
 */
export function rk4_propagate(rx, ry, rz, vx, vy, vz, dt, n_steps, use_j2) {
    const ret = wasm.rk4_propagate(rx, ry, rz, vx, vy, vz, dt, n_steps, use_j2);
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

/**
 * Propagate a state vector [rx,ry,rz,vx,vy,vz] by dt seconds using RK4.
 * Returns new [rx,ry,rz,vx,vy,vz].
 * use_j2: 1 = include J2 perturbation, 0 = two-body only.
 * @param {number} rx
 * @param {number} ry
 * @param {number} rz
 * @param {number} vx
 * @param {number} vy
 * @param {number} vz
 * @param {number} dt
 * @param {number} use_j2
 * @returns {Float64Array}
 */
export function rk4_step(rx, ry, rz, vx, vy, vz, dt, use_j2) {
    const ret = wasm.rk4_step(rx, ry, rz, vx, vy, vz, dt, use_j2);
    var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}

/**
 * Compute SMA from mean motion (rev/day).
 * @param {number} mean_motion_rev_day
 * @returns {number}
 */
export function sma_from_mean_motion(mean_motion_rev_day) {
    const ret = wasm.sma_from_mean_motion(mean_motion_rev_day);
    return ret;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_copy_to_typed_array_787746aeb47818bc: function(arg0, arg1, arg2) {
            new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./wasm_physics_bg.js": import0,
    };
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('wasm_physics_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
