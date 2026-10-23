//! The main window, the shell's plugins and its own commands: fullscreen and the page's log lines.
use std::borrow::Cow;

use tauri::http::{Request, Response};
use tauri::plugin::TauriPlugin;
use tauri::{App, LogicalSize, Manager, Monitor, Runtime, WebviewWindow, WebviewWindowBuilder, Window};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_plugin_window_state::StateFlags;

/// The game's frame (src/shared/game-display.ts) and the share of the monitor's work area the first window takes.
const FRAME: (f64, f64) = (960.0, 650.0);
const WORK_AREA_SHARE: f64 = 0.9;
/// How far a size may be off after converting between physical and logical pixels.
const ROUNDING_PX: f64 = 1.0;
/// The log file's size cap, and how many older files are kept.
const LOG_BYTES: u128 = 1 << 20;
const LOG_FILES: usize = 3;

/// The largest FRAME-shaped inner size within WORK_AREA_SHARE of a work area, never below the window's minimum (logical px).
pub fn fitted_size(work_area: (f64, f64), minimum: (f64, f64)) -> (f64, f64) {
    let scale = (work_area.0 * WORK_AREA_SHARE / FRAME.0).min(work_area.1 * WORK_AREA_SHARE / FRAME.1);
    ((FRAME.0 * scale).round().max(minimum.0), (FRAME.1 * scale).round().max(minimum.1))
}

/// Whether a window of this outer and inner size fits the work area at no less than the minimum (logical px).
pub fn fits(outer: (f64, f64), inner: (f64, f64), work_area: (f64, f64), minimum: (f64, f64)) -> bool {
    let within = outer.0 <= work_area.0 + ROUNDING_PX && outer.1 <= work_area.1 + ROUNDING_PX;
    within && inner.0 + ROUNDING_PX >= minimum.0 && inner.1 + ROUNDING_PX >= minimum.1
}

/// A monitor's work area in logical pixels.
fn logical_work_area(monitor: &Monitor) -> (f64, f64) {
    let (area, scale) = (monitor.work_area().size, monitor.scale_factor());
    (f64::from(area.width) / scale, f64::from(area.height) / scale)
}

/// The main window from its configuration, fitted to the primary monitor's work area and centred, then given its saved state
/// (the window-state plugin restores it as the window is built), fitted again if that state does not fit, and shown.
pub fn create_main_window<R: Runtime, H>(app: &App<R>, on_request: H) -> tauri::Result<WebviewWindow<R>>
where
    H: Fn(Request<Vec<u8>>, &mut Response<Cow<'static, [u8]>>) + Send + Sync + 'static,
{
    let config = app.config().app.windows.first().expect("the main window's configuration").clone();
    let minimum = (config.min_width.unwrap_or(0.0), config.min_height.unwrap_or(0.0));
    let mut builder = WebviewWindowBuilder::from_config(app.handle(), &config)?.on_web_resource_request(on_request);
    if let Some(monitor) = app.primary_monitor()? {
        let (width, height) = fitted_size(logical_work_area(&monitor), minimum);
        builder = builder.inner_size(width, height).center();
    }
    #[cfg(feature = "smoke")]
    let builder = crate::smoke::window(builder);
    let window = builder.build()?;
    fit_restored(&window, minimum)?;
    #[cfg(feature = "smoke")]
    crate::smoke::place(&window)?;
    window.show()?;
    Ok(window)
}

/// The window-state plugin restores a saved size in physical pixels with no check against the monitor, so a size saved on a 2x
/// display or a larger screen runs past this one (macOS clamps only the height). Such a window, or one below the minimum, gets the
/// first window's fitted size on its monitor and is centred there; a maximized or fullscreen window is left as it is.
fn fit_restored<R: Runtime>(window: &WebviewWindow<R>, minimum: (f64, f64)) -> tauri::Result<()> {
    if window.is_maximized()? || window.is_fullscreen()? {
        return Ok(());
    }
    let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) else { return Ok(()) };
    let scale = window.scale_factor()?;
    let (outer, inner) = (window.outer_size()?.to_logical::<f64>(scale), window.inner_size()?.to_logical::<f64>(scale));
    let work_area = logical_work_area(&monitor);
    if fits((outer.width, outer.height), (inner.width, inner.height), work_area, minimum) {
        return Ok(());
    }
    let (width, height) = fitted_size(work_area, minimum);
    log::info!("the restored window ({}x{}) does not fit its monitor; fitted to {width}x{height}", inner.width, inner.height);
    // From the work area's corner, so that the screen's edge never clamps the new size.
    window.set_position(monitor.work_area().position)?;
    window.set_size(LogicalSize::new(width, height))?;
    window.center()
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

    #[test]
    fn a_restored_window_must_fit_its_work_area_at_no_less_than_the_minimum() {
        let (work_area, minimum) = ((1920.0, 1055.0), (1000.0, 700.0));
        assert!(fits((1255.0, 878.0), (1255.0, 850.0), work_area, minimum));
        // 1255x850 saved on a 2x MacBook is restored as 2510x1700 here; macOS clamps only the height.
        assert!(!fits((2510.0, 1055.0), (2510.0, 1027.0), work_area, minimum));
        // The minimum clamped by the screen's bottom edge.
        assert!(!fits((1000.0, 700.0), (1000.0, 668.0), work_area, minimum));
        // Physical-to-logical rounding is no reason to refit.
        assert!(fits((1920.4, 1055.0), (999.5, 699.6), work_area, minimum));
    }
}
