use wasm_bindgen::prelude::*;
use std::f64::consts::TAU;

const MU_EARTH: f64 = 398_600.4418; // km³/s²
const TOL: f64 = 1e-12;
const MAX_ITER: usize = 50;

/// Solve Kepler's equation M = E - e·sin(E) via Newton-Raphson.
/// Initial estimate: Battin (1987) starter, handles high eccentricity.
/// Denominator: (1 - e·cos(E)) — the CORRECT form (not e·cos(M)).
#[inline(always)]
fn solve_kepler(m: f64, e: f64) -> f64 {
    let m = m.rem_euclid(TAU);
    let mut e_anom = if e > 0.8 {
        std::f64::consts::PI
    } else {
        m + e * m.sin() * (1.0 + e * m.cos())
    };
    for _ in 0..MAX_ITER {
        let delta = (e_anom - e * e_anom.sin() - m) / (1.0 - e * e_anom.cos());
        e_anom -= delta;
        if delta.abs() < TOL {
            break;
        }
    }
    e_anom
}

/// Convert eccentric anomaly E to true anomaly ν via half-angle identity.
/// ν = 2·atan2(√(1+e)·sin(E/2), √(1−e)·cos(E/2))
#[inline(always)]
fn eccentric_to_true(e_anom: f64, e: f64) -> f64 {
    let half = e_anom * 0.5;
    2.0 * half.sin().atan2(((1.0 - e) / (1.0 + e)).sqrt() * half.cos())
}

/// Batch Keplerian propagation for N satellites.
///
/// Layout of `sat_data` (13 f64 per satellite):
///   [0]  a        — semi-major axis (km)
///   [1]  e        — eccentricity
///   [2]  M0       — mean anomaly at epoch (rad)
///   [3]  epoch    — TLE epoch (Unix seconds)
///   [4]  n_rad_s  — mean motion (rad/s)
///   [5]  r11  [6] r12
///   [7]  r21  [8] r22
///   [9]  r31  [10] r32
///   (r31/r32 are used only for z; indices match enricher.py precomputed matrix)
///
/// Output `out`: [x, y, z] × N (ECI km), stored as f32 for GPU upload.
/// N.B. sat_data length must be exactly 11 * n.
#[wasm_bindgen]
pub fn propagate_batch(sat_data: &[f64], sim_time: f64, out: &mut [f32], n: usize) {
    const STRIDE: usize = 11;
    for i in 0..n {
        let b = i * STRIDE;
        let a       = sat_data[b];
        let e       = sat_data[b + 1];
        let m0      = sat_data[b + 2];
        let epoch   = sat_data[b + 3];
        let n_rad   = sat_data[b + 4];
        let r11     = sat_data[b + 5];
        let r12     = sat_data[b + 6];
        let r21     = sat_data[b + 7];
        let r22     = sat_data[b + 8];
        let r31     = sat_data[b + 9];
        let r32     = sat_data[b + 10];

        let m = (m0 + n_rad * (sim_time - epoch)).rem_euclid(TAU);
        let e_anom = solve_kepler(m, e);
        let nu = eccentric_to_true(e_anom, e);

        // Position in orbital (perifocal) frame
        let p = a * (1.0 - e * e);
        let r_mag = p / (1.0 + e * nu.cos());
        let x_orb = r_mag * nu.cos();
        let y_orb = r_mag * nu.sin();

        // Apply precomputed PQW→ECI rotation matrix (rows from enricher.py)
        let ox = i * 3;
        out[ox]     = (r11 * x_orb + r12 * y_orb) as f32;
        out[ox + 1] = (r21 * x_orb + r22 * y_orb) as f32;
        out[ox + 2] = (r31 * x_orb + r32 * y_orb) as f32;
    }
}

/// Single-satellite propagation — returns [x, y, z] ECI km (for testing/JS use).
#[wasm_bindgen]
pub fn propagate_single(
    a: f64, e: f64, m0: f64, epoch: f64, n_rad: f64,
    r11: f64, r12: f64, r21: f64, r22: f64, r31: f64, r32: f64,
    sim_time: f64,
) -> Box<[f64]> {
    let m = (m0 + n_rad * (sim_time - epoch)).rem_euclid(TAU);
    let e_anom = solve_kepler(m, e);
    let nu = eccentric_to_true(e_anom, e);
    let p = a * (1.0 - e * e);
    let r_mag = p / (1.0 + e * nu.cos());
    let x_orb = r_mag * nu.cos();
    let y_orb = r_mag * nu.sin();
    vec![
        r11 * x_orb + r12 * y_orb,
        r21 * x_orb + r22 * y_orb,
        r31 * x_orb + r32 * y_orb,
    ]
    .into_boxed_slice()
}

/// Compute SMA from mean motion (rev/day).
#[wasm_bindgen]
pub fn sma_from_mean_motion(mean_motion_rev_day: f64) -> f64 {
    let n = mean_motion_rev_day * TAU / 86400.0;
    (MU_EARTH / (n * n)).cbrt()
}
