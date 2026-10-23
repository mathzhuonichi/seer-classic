//! The packaged smoke test's build only (`--features smoke`, run by tools/distribution/smoke_macos.py, built under its own
//! identifier): the page driver (src-tauri/smoke/driver.js) runs in every page, exports go to a fixed file instead of the save
//! dialog, and the app never activates itself, so the test never takes the player's focus. Nothing here is in a release build.
use std::path::PathBuf;

use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri::{App, AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

const DRIVER: &str = include_str!("../smoke/driver.js");

/// The driver with its phase (SEER_SMOKE_PHASE) and the save it seeds into local storage (the file SEER_SMOKE_SEED names).
fn driver() -> String {
    let phase = std::env::var("SEER_SMOKE_PHASE").unwrap_or_default();
    let seed = std::env::var("SEER_SMOKE_SEED").ok().and_then(|path| std::fs::read_to_string(path).ok());
    format!("window.__seerSmoke = {};\n{DRIVER}", serde_json::json!({ "phase": phase, "seed": seed }))
}

/// How much of the window stays on screen, at the bottom-right corner: WebKit stops animation frames in a window it cannot see.
const SHOWN: (f64, f64) = (160.0, 110.0);

/// The main window: unfocused, kept above other windows but almost entirely off screen, never throttled, with the driver.
pub fn window<'a, R: Runtime, M: Manager<R>>(app: &App<R>, builder: WebviewWindowBuilder<'a, R, M>) -> WebviewWindowBuilder<'a, R, M> {
    let builder = match app.primary_monitor() {
        Ok(Some(monitor)) => {
            let (size, scale) = (monitor.size(), monitor.scale_factor());
            builder.position(f64::from(size.width) / scale - SHOWN.0, f64::from(size.height) / scale - SHOWN.1)
        }
        _ => builder,
    };
    builder
        .focused(false)
        .focusable(false)
        .always_on_top(true)
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .initialization_script(driver())
}

/// Exports go to <app data>/smoke-export.json.
pub async fn export_path<R: Runtime>(app: AppHandle<R>, _window: WebviewWindow<R>, _name: String) -> Result<Option<PathBuf>, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(Some(dir.join("smoke-export.json")))
}

/// Quits as the app does when its window closes.
#[tauri::command]
pub fn smoke_quit<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}

/// tao activates the app at launch and wry whenever it creates a web view; both become no-ops, with the Accessory policy
/// (no Dock icon) set in setup.
#[cfg(target_os = "macos")]
pub fn neuter_activation() {
    use objc2::runtime::{AnyClass, Imp, Sel};
    use objc2::sel;
    unsafe extern "C-unwind" fn ignore(_this: *mut std::ffi::c_void, _cmd: Sel) {}
    unsafe extern "C-unwind" fn ignore_flag(_this: *mut std::ffi::c_void, _cmd: Sel, _flag: bool) {}
    let class = AnyClass::get(c"NSApplication").expect("NSApplication") as *const AnyClass as *mut AnyClass;
    // SAFETY: both replacements have the replaced methods' signatures (v@: and v@:B) and do nothing.
    unsafe {
        let plain: Imp = std::mem::transmute(ignore as unsafe extern "C-unwind" fn(*mut std::ffi::c_void, Sel));
        let flagged: Imp = std::mem::transmute(ignore_flag as unsafe extern "C-unwind" fn(*mut std::ffi::c_void, Sel, bool));
        objc2::ffi::class_replaceMethod(class, sel!(activate), plain, c"v@:".as_ptr());
        objc2::ffi::class_replaceMethod(class, sel!(activateIgnoringOtherApps:), flagged, c"v@:B".as_ptr());
    }
}
