#[macro_export]
macro_rules! log {
    ( $( $t:tt )* ) => {
        web_sys::console::log_1(&format!( $( $t )* ).into());
    }
}

mod utils;
#[macro_use]
mod wfc_model;

use wasm_bindgen::prelude::*;

// Re-export the model so wasm-bindgen can see it at the top level
pub use wfc_model::WFCModel;
pub use wfc_model::IterationResult;

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen(start)]
pub fn main_js() {
    utils::set_panic_hook();
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}