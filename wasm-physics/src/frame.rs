use wasm_bindgen::prelude::*;

/// Build PQW→ECI rotation matrix from orbital elements.
/// Returns flat 9-element row-major array [r00,r01,r02, r10,...,r22].
/// Q = R3(−Ω) · R1(−i) · R3(−ω)
#[wasm_bindgen]
pub fn pqw_to_eci_matrix(raan: f64, inc: f64, omega: f64) -> Box<[f64]> {
    let (co, so) = (raan.cos(), raan.sin());   // Ω
    let (ci, si) = (inc.cos(), inc.sin());     // i
    let (cw, sw) = (omega.cos(), omega.sin()); // ω

    let m = [
        co*cw - so*sw*ci,  -co*sw - so*cw*ci,   so*si,
        so*cw + co*sw*ci,  -so*sw + co*cw*ci,  -co*si,
        sw*si,              cw*si,               ci,
    ];
    m.to_vec().into_boxed_slice()
}

/// Batch: given N satellites each with [raan, inc, omega], compute
/// the 6 precomputed matrix elements needed by propagate_batch:
/// [r11, r12, r21, r22, r31, r32] × N (matching enricher.py naming).
///
/// Input `elements`: [raan, inc, omega] × N  (all in radians)
/// Output: [r11, r12, r21, r22, r31, r32] × N
#[wasm_bindgen]
pub fn pqw_to_eci_batch(elements: &[f64], n: usize) -> Box<[f64]> {
    let mut out = vec![0.0f64; n * 6];
    for i in 0..n {
        let b = i * 3;
        let raan  = elements[b];
        let inc   = elements[b + 1];
        let omega = elements[b + 2];

        let (co, so) = (raan.cos(), raan.sin());
        let (ci, si) = (inc.cos(), inc.sin());
        let (cw, sw) = (omega.cos(), omega.sin());

        let ob = i * 6;
        out[ob]     = co*cw - so*sw*ci;   // r11
        out[ob + 1] = -co*sw - so*cw*ci;  // r12
        out[ob + 2] = so*cw + co*sw*ci;   // r21
        out[ob + 3] = -so*sw + co*cw*ci;  // r22
        out[ob + 4] = sw*si;              // r31
        out[ob + 5] = cw*si;              // r32
    }
    out.into_boxed_slice()
}

/// ECI → ECEF rotation via GMST (simplified IAU 1982).
/// Returns [rx, ry, rz] ECEF given ECI and Unix timestamp.
#[wasm_bindgen]
pub fn eci_to_ecef(rx: f64, ry: f64, rz: f64, unix_seconds: f64) -> Box<[f64]> {
    let gmst = compute_gmst(unix_seconds);
    let cg = gmst.cos();
    let sg = gmst.sin();
    vec![
        cg * rx + sg * ry,
        -sg * rx + cg * ry,
        rz,
    ]
    .into_boxed_slice()
}

/// GMST in radians (IAU 1982 simplified, same formula as TimeSystem.ts).
fn compute_gmst(unix_seconds: f64) -> f64 {
    let jd = unix_seconds / 86400.0 + 2_440_587.5;
    let t = (jd - 2_451_545.0) / 36525.0;
    let theta = 100.460_618_4
        + 36000.770_04 * t
        + 0.000_387_933 * t * t
        - t * t * t / 38_710_000.0;
    let theta = ((theta % 360.0) + 360.0) % 360.0;
    let theta = theta + 360.985_647_24 * ((unix_seconds % 86400.0) / 86400.0);
    theta.to_radians()
}
