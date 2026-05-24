use wasm_bindgen::prelude::*;

const MU: f64 = 398_600.4418; // km³/s²
const J2: f64 = 1.082_626_68e-3;
const R_E: f64 = 6_378.137; // km

/// Two-body equations of motion: ẍ = −μ/r³ · r⃗
#[inline(always)]
fn two_body(state: &[f64; 6]) -> [f64; 6] {
    let (rx, ry, rz) = (state[0], state[1], state[2]);
    let r2 = rx * rx + ry * ry + rz * rz;
    let r3 = r2 * r2.sqrt();
    let a = -MU / r3;
    [state[3], state[4], state[5], a * rx, a * ry, a * rz]
}

/// J2 perturbation acceleration in ECI (Vallado Eq. 9-7).
#[inline(always)]
fn j2_accel(r: &[f64; 3]) -> [f64; 3] {
    let (rx, ry, rz) = (r[0], r[1], r[2]);
    let r2 = rx * rx + ry * ry + rz * rz;
    let r_mag = r2.sqrt();
    let factor = (3.0 / 2.0) * J2 * MU * R_E * R_E / (r2 * r2 * r_mag);
    let zr2 = 5.0 * rz * rz / r2;
    [
        factor * rx * (zr2 - 1.0),
        factor * ry * (zr2 - 1.0),
        factor * rz * (zr2 - 3.0),
    ]
}

#[inline(always)]
fn add_scaled(a: &[f64; 6], b: &[f64; 6], s: f64) -> [f64; 6] {
    [
        a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s,
        a[3] + b[3] * s, a[4] + b[4] * s, a[5] + b[5] * s,
    ]
}

/// RK4 step with J2 perturbation.
/// state: [rx, ry, rz, vx, vy, vz] (km, km/s)
#[inline(always)]
fn eom_j2(state: &[f64; 6]) -> [f64; 6] {
    let r = [state[0], state[1], state[2]];
    let tb = two_body(state);
    let j2a = j2_accel(&r);
    [
        tb[0], tb[1], tb[2],
        tb[3] + j2a[0], tb[4] + j2a[1], tb[5] + j2a[2],
    ]
}

fn rk4_internal(state: &[f64; 6], dt: f64, use_j2: bool) -> [f64; 6] {
    let f = if use_j2 { eom_j2 } else { two_body };
    let k1 = f(state);
    let s2 = add_scaled(state, &k1, dt / 2.0);
    let k2 = f(&s2);
    let s3 = add_scaled(state, &k2, dt / 2.0);
    let k3 = f(&s3);
    let s4 = add_scaled(state, &k3, dt);
    let k4 = f(&s4);
    let dt6 = dt / 6.0;
    [
        state[0] + dt6 * (k1[0] + 2.0*k2[0] + 2.0*k3[0] + k4[0]),
        state[1] + dt6 * (k1[1] + 2.0*k2[1] + 2.0*k3[1] + k4[1]),
        state[2] + dt6 * (k1[2] + 2.0*k2[2] + 2.0*k3[2] + k4[2]),
        state[3] + dt6 * (k1[3] + 2.0*k2[3] + 2.0*k3[3] + k4[3]),
        state[4] + dt6 * (k1[4] + 2.0*k2[4] + 2.0*k3[4] + k4[4]),
        state[5] + dt6 * (k1[5] + 2.0*k2[5] + 2.0*k3[5] + k4[5]),
    ]
}

/// Propagate a state vector [rx,ry,rz,vx,vy,vz] by dt seconds using RK4.
/// Returns new [rx,ry,rz,vx,vy,vz].
/// use_j2: 1 = include J2 perturbation, 0 = two-body only.
#[wasm_bindgen]
pub fn rk4_step(
    rx: f64, ry: f64, rz: f64,
    vx: f64, vy: f64, vz: f64,
    dt: f64,
    use_j2: u32,
) -> Box<[f64]> {
    let state = [rx, ry, rz, vx, vy, vz];
    let result = rk4_internal(&state, dt, use_j2 != 0);
    result.to_vec().into_boxed_slice()
}

/// Propagate n_steps × dt seconds and return full ephemeris as flat array.
/// Output: [rx,ry,rz,vx,vy,vz] × (n_steps+1), including initial state.
#[wasm_bindgen]
pub fn rk4_propagate(
    rx: f64, ry: f64, rz: f64,
    vx: f64, vy: f64, vz: f64,
    dt: f64,
    n_steps: usize,
    use_j2: u32,
) -> Box<[f64]> {
    let mut out = Vec::with_capacity((n_steps + 1) * 6);
    let mut state = [rx, ry, rz, vx, vy, vz];
    out.extend_from_slice(&state);
    for _ in 0..n_steps {
        state = rk4_internal(&state, dt, use_j2 != 0);
        out.extend_from_slice(&state);
    }
    out.into_boxed_slice()
}
