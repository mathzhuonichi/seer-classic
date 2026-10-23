//! The main window, the shell's plugins and its own commands: fullscreen and the page's log lines.
use std::borrow::Cow;

use tauri::http::{Request, Response};
use tauri::plugin::TauriPlugin;
use tauri::{App, Manager, Runtime, WebviewWindow, WebviewWindowBuilder, Window};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_plugin_window_state::StateFlags;

/// The game's frame (src/shared/game-display.ts) and the share of the monitor's work area the first window takes.
const FRAME: (f64, f64) = (960.0, 650.0);
const WORK_AREA_SHARE: f64 = 0.9;
/// The log file's size cap, and how many older files are kept.
const LOG_BYTES: u128 = 1 << 20;
const LOG_FILES: usize = 3;

/// The largest FRAME-shaped inner size within WORK_AREA_SHARE of a work area, never below the window's minimum (logical px).
pub fn fitted_size(work_area: (f64, f64), minimum: (f64, f64)) -> (f64, f64) {
    let scale = (work_area.0 * WORK_AREA_SHARE / FRAME.0).min(work_area.1 * WORK_AREA_SHARE / FRAME.1);
    ((FRAME.0 * scale).round().max(minimum.0), (FRAME.1 * scale).round().max(minimum.1))
}

/// The main window from its configuration, fitted to the primary monitor's work area and centred, then given its saved state
/// (the window-state plugin restores it as the window is built) and shown.
pub fn create_main_window<R: Runtime, H>(app: &App<R>, on_request: H) -> tauri::Result<WebviewWindow<R>>
where
    H: Fn(Request<Vec<u8>>, &mut Response<Cow<'static, [u8]>>) + Send + Sync + 'static,
{
    let config = app.config().app.windows.first().expect("the main window's configuration").clone();
    let mut builder = WebviewWindowBuilder::from_config(app.handle(), &config)?.on_web_resource_request(on_request);
    if let Some(monitor) = app.primary_monitor()? {
        let (area, scale) = (monitor.work_area().size, monitor.scale_factor());
        let minimum = (config.min_width.unwrap_or(0.0), config.min_height.unwrap_or(0.0));
        let (width, height) = fitted_size((f64::from(area.width) / scale, f64::from(area.height) / scale), minimum);
        builder = builder.inner_size(width, height).center();
    }
    let window = builder.build()?;
    window.show()?;
    Ok(window)
}

/// The log in the platform's log folder (~/Library/Logs/<identifier>, %LOCALAPPDATA%\<identifier>\logs), size-capped.
pub fn log_plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::LogDir { file_name: None }))
        .max_file_size(LOG_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(LOG_FILES))
        .level(log::LevelFilter::Info)
        .build()
}

/// Restores size, position, maximized and fullscreen; the window is shown by `create_main_window`.
pub fn window_state_plugin<R: Runtime>() -> TauriPlugin<R> {
    let flags = StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN;
    tauri_plugin_window_state::Builder::default().with_state_flags(flags).build()
}

/// A second launch focuses the running game instead: two instances would overwrite each other's save.
pub fn single_instance_plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_single_instance::init(|app, _arguments, _directory| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    })
}

/// Panics go to the log as well as to the default hook.
pub fn log_panics() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("panic: {info}");
        default(info);
    }));
}

/// The game's fullscreen button: the window fills the screen (WebView2 does not resize for HTML fullscreen). Returns the
/// new state.
#[tauri::command]
pub fn toggle_fullscreen<R: Runtime>(window: Window<R>) -> Result<bool, String> {
    let fullscreen = !window.is_fullscreen().map_err(|error| error.to_string())?;
    window.set_fullscreen(fullscreen).map_err(|error| error.to_string())?;
    Ok(fullscreen)
}

/// A line from the page: its errors and unhandled rejections, and its timing notes.
#[tauri::command]
pub fn log_web(level: String, message: String) {
    match level.as_str() {
        "error" => log::error!(target: "web", "{message}"),
        "warn" => log::warn!(target: "web", "{message}"),
        _ => log::info!(target: "web", "{message}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_window_keeps_the_frame_within_the_work_area() {
        // A 1512x982 MacBook (menu bar removed) and 1920x1080 at 125 % above the taskbar.
        assert_eq!(fitted_size((1512.0, 944.0), (1000.0, 700.0)), (1255.0, 850.0));
        assert_eq!(fitted_size((1536.0, 816.0), (1000.0, 700.0)), (1085.0, 734.0));
        // A small screen keeps the minimum; preventOverflow then clamps the window to the work area.
        assert_eq!(fitted_size((1280.0, 680.0), (1000.0, 700.0)), (1000.0, 700.0));
    }
}
