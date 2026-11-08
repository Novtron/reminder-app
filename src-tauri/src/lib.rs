//! یادآوری کارهای روزانه — Rust backend (Tauri v2).
//! The UI lives in ../ui (plain HTML/CSS/JS, Persian RTL, light liquid-glass
//! style) and persists tasks in localStorage. The Rust side only exposes a
//! couple of small commands; reminder timing runs in the frontend while the
//! app is open.

use serde::Serialize;

#[derive(Serialize)]
struct AppInfo {
    name: String,
    version: String,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "یادآوری کارهای روزانه".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
