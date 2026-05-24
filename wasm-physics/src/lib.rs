mod kepler;
mod rk4;
mod frame;

use wasm_bindgen::prelude::*;

pub use kepler::propagate_batch;
pub use rk4::rk4_step;
pub use frame::pqw_to_eci_batch;

#[wasm_bindgen(start)]
pub fn init() {
    // Set panic hook for better error messages in dev builds
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
