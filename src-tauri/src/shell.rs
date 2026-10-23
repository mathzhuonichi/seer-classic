//! The main window, the shell's plugins and its own commands: fullscreen and the page's log lines.
use std::borrow::Cow;
use std::collections::HashMap;

use serde::Deserialize;
use tauri::http::{Request, Response};
use tauri::plugin::TauriPlugin;
use tauri::{App, Manager, Monitor, Runtime, WebviewWindow, WebviewWindowBuilder, Window};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_plugin_window_state::StateFlags;

/// The main window's label, which is also its entry in the window-state plugin's file.
const MAIN_WINDOW: &str = "main";

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

/// The main window's state as tauri-plugin-window-state saves it, in physical pixels; while maximized, x and y are the
/// monitor's corner and prev_x and prev_y the window's own.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq)]
struct SavedWindow {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    prev_x: i32,
    prev_y: i32,
    maximized: bool,
    fullscreen: bool,
}

/// The main window's saved state, if the plugin's file holds one.
fn saved_window<R: Runtime>(app: &App<R>) -> Option<SavedWindow> {
    let file = app.path().app_config_dir().ok()?.join(tauri_plugin_window_state::DEFAULT_FILENAME);
    let mut saved: HashMap<String, SavedWindow> = serde_json::from_slice(&std::fs::read(file).ok()?).ok()?;
    saved.remove(MAIN_WINDOW)
}

/// A monitor's work area in logical pixels, and its scale.
#[derive(Debug, Clone, Copy)]
struct Screen {
    work_origin: (f64, f64),
    work_size: (f64, f64),
    scale: f64,
}

impl Screen {
    fn of(monitor: &Monitor) -> Self {
        let (area, scale) = (monitor.work_area(), monitor.scale_factor());
        let work_origin = (f64::from(area.position.x) / scale, f64::from(area.position.y) / scale);
        Self { work_origin, work_size: logical_work_area(monitor), scale }
    }
}

/// The saved window's inner size and top-left corner (logical px) on the first screen whose work area holds it at no less than
/// the minimum. The plugin saves physical pixels without their scale: a size saved on a 2x display reads twice as large on a 1x
/// one, and would run past it. Such a window opens as on a first start instead.
fn restorable(saved: &SavedWindow, screens: &[Screen], minimum: (f64, f64)) -> Option<((f64, f64), (f64, f64))> {
    let (x, y) = if saved.maximized { (saved.prev_x, saved.prev_y) } else { (saved.x, saved.y) };
    screens.iter().find_map(|screen| {
        let corner = (f64::from(x) / screen.scale, f64::from(y) / screen.scale);
        let size = (f64::from(saved.width) / screen.scale, f64::from(saved.height) / screen.scale);
        let (origin, area) = (screen.work_origin, screen.work_size);
        let inside = corner.0 + ROUNDING_PX >= origin.0 && corner.1 + ROUNDING_PX >= origin.1
            && corner.0 + size.0 <= origin.0 + area.0 + ROUNDING_PX && corner.1 + size.1 <= origin.1 + area.1 + ROUNDING_PX;
        (inside && size.0 + ROUNDING_PX >= minimum.0 && size.1 + ROUNDING_PX >= minimum.1).then_some((size, corner))
    })
}

/// A monitor's work area in logical pixels.
fn logical_work_area(monitor: &Monitor) -> (f64, f64) {
    let (area, scale) = (monitor.work_area().size, monitor.scale_factor());
    (f64::from(area.width) / scale, f64::from(area.height) / scale)
}

/// The main window from its configuration, at its saved frame when that still fits a monitor, otherwise fitted to the primary
/// monitor's work area and centred; then maximized or fullscreen as saved, and shown. The shell restores the saved state itself,
/// before the window is built: the window-state plugin's restore runs after it, and on macOS its size and position land later
/// still (tao sets them asynchronously), so they could not be checked. The plugin only saves.
pub fn create_main_window<R: Runtime, H>(app: &App<R>, on_request: H) -> tauri::Result<WebviewWindow<R>>
where
    H: Fn(Request<Vec<u8>>, &mut Response<Cow<'static, [u8]>>) + Send + Sync + 'static,
{
    let config = app.config().app.windows.first().expect("the main window's configuration").clone();
    let minimum = (config.min_width.unwrap_or(0.0), config.min_height.unwrap_or(0.0));
    let mut builder = WebviewWindowBuilder::from_config(app.handle(), &config)?.on_web_resource_request(on_request);
    let saved = saved_window(app);
    let screens: Vec<Screen> = app.available_monitors()?.iter().map(Screen::of).collect();
    if let Some((size, corner)) = saved.and_then(|saved| restorable(&saved, &screens, minimum)) {
        builder = builder.inner_size(size.0, size.1).position(corner.0, corner.1);
    } else if let Some(monitor) = app.primary_monitor()? {
        if let Some(saved) = saved {
            log::info!("the saved window ({}x{} at {},{}) fits no monitor now; it opens as on a first start", saved.width, saved.height, saved.x, saved.y);
        }
        let (width, height) = fitted_size(logical_work_area(&monitor), minimum);
        builder = builder.inner_size(width, height).center();
    }
    #[cfg(feature = "smoke")]
    let builder = crate::smoke::window(builder);
    let window = builder.build()?;
    if saved.is_some_and(|saved| saved.maximized) {
        window.maximize()?;
    }
    if saved.is_some_and(|saved| saved.fullscreen) {
        window.set_fullscreen(true)?;
    }
    #[cfg(feature = "smoke")]
    crate::smoke::place(&window)?;
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

/// Saves size, position, maximized and fullscreen; `create_main_window` restores them and shows the window.
pub fn window_state_plugin<R: Runtime>() -> TauriPlugin<R> {
    let flags = StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN;
    tauri_plugin_window_state::Builder::default().with_state_flags(flags).skip_initial_state(MAIN_WINDOW).build()
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

    fn saved(width: u32, height: u32, x: i32, y: i32) -> SavedWindow {
        SavedWindow { width, height, x, y, prev_x: 0, prev_y: 0, maximized: false, fullscreen: false }
    }

    #[test]
    fn a_saved_window_opens_where_it_was_only_while_a_work_area_holds_it() {
        let minimum = (1000.0, 700.0);
        let macbook = Screen { work_origin: (0.0, 38.0), work_size: (1512.0, 944.0), scale: 2.0 };
        let external = Screen { work_origin: (1512.0, 0.0), work_size: (1920.0, 1080.0), scale: 1.0 };
        // 1255x850 at (128, 70) on the 2x MacBook, saved as physical pixels, opens there again.
        assert_eq!(restorable(&saved(2510, 1700, 256, 140), &[macbook, external], minimum), Some(((1255.0, 850.0), (128.0, 70.0))));
        // The same state with only a 1x screen reads as 2510x1700, wider than it: a first start's placement instead.
        let alone = Screen { work_origin: (0.0, 0.0), work_size: (1920.0, 1080.0), scale: 1.0 };
        assert_eq!(restorable(&saved(2510, 1700, 256, 140), &[alone], minimum), None);
        assert_eq!(restorable(&saved(4000, 3000, 0, 0), &[alone], minimum), None);
        // A window on the external screen opens there; one running past the bottom edge, or below the minimum, does not.
        assert_eq!(restorable(&saved(1400, 900, 1600, 100), &[macbook, external], minimum), Some(((1400.0, 900.0), (1600.0, 100.0))));
        assert_eq!(restorable(&saved(1000, 700, 1760, 970), &[alone], minimum), None);
        assert_eq!(restorable(&saved(900, 700, 100, 100), &[alone], minimum), None);
        // A maximized window's own corner is prev_x, prev_y.
        let maximized = SavedWindow { prev_x: 300, prev_y: 100, maximized: true, ..saved(1400, 900, 0, 0) };
        assert_eq!(restorable(&maximized, &[alone], minimum), Some(((1400.0, 900.0), (300.0, 100.0))));
    }

    #[test]
    fn the_plugins_file_reads_as_saved_windows() {
        let file = r#"{"main":{"width":2510,"height":1700,"x":256,"y":140,"prev_x":256,"prev_y":140,"maximized":false,
            "visible":true,"decorated":true,"fullscreen":false}}"#;
        let windows: HashMap<String, SavedWindow> = serde_json::from_str(file).unwrap();
        assert_eq!(windows[MAIN_WINDOW], SavedWindow { prev_x: 256, prev_y: 140, ..saved(2510, 1700, 256, 140) });
    }
}
