#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! The desktop shell (design/notes/desktop-package-2026-10-23.md): the embedded code build plus the payload beside it, both
//! through Tauri's own protocol.
mod payload;
mod public_assets;
mod saves;
mod shell;

use std::sync::Arc;

use public_assets::{GameAssets, PublicDir};
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// Logs why the payload is incomplete, tells the player and quits once the message is closed.
fn refuse_incomplete(app: &AppHandle, reason: &str) {
    log::error!("payload check failed: {reason}");
    let quit = app.clone();
    app.dialog()
        .message(payload::INCOMPLETE)
        .title("赛尔经典")
        .kind(MessageDialogKind::Error)
        .show(move |_| quit.exit(1));
}

/// Checks the payload: its manifest now, every file's size on a background thread. False when the app must not start.
fn check_payload(app: &AppHandle, public: &PublicDir) -> bool {
    if tauri::is_dev() {
        return true;
    }
    let Some(root) = public.root().map(|root| root.to_path_buf()) else {
        refuse_incomplete(app, "no public/ beside the app");
        return false;
    };
    match payload::read(&root, &app.package_info().version.to_string()) {
        Ok(manifest) => {
            let app = app.clone();
            std::thread::spawn(move || {
                if let Err(reason) = payload::check_files(&root, &manifest) {
                    refuse_incomplete(&app, &reason);
                }
            });
            true
        }
        Err(reason) => {
            refuse_incomplete(app, &reason);
            false
        }
    }
}

/// The page's commands.
macro_rules! commands {
    () => {
        tauri::generate_handler![
            saves::read_save,
            saves::write_save,
            saves::keep_unreadable_save,
            saves::export_save,
            shell::toggle_fullscreen,
            shell::log_web
        ]
    };
}

fn main() {
    let mut context = tauri::generate_context!();
    let public = Arc::new(PublicDir::default());
    let embedded = context.set_assets(Box::new(public_assets::EmptyAssets));
    let assets = GameAssets::new(embedded, public.clone());
    let embedded_paths = assets.embedded_paths();
    context.set_assets(Box::new(assets));
    let builder = tauri::Builder::default()
        .plugin(shell::single_instance_plugin())
        .plugin(shell::log_plugin())
        .plugin(shell::window_state_plugin())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(commands!())
        .setup(move |app| {
            shell::log_panics();
            log::info!("Seer Classic {} starting", app.package_info().version);
            // Development runs keep their own saves beside the player's.
            let saves = app.path().app_data_dir()?.join(if tauri::is_dev() { "saves-dev" } else { "saves" });
            app.manage(saves::SaveState::open(saves));
            if check_payload(app.handle(), &public) {
                shell::create_main_window(app, public_assets::not_found_handler(embedded_paths, public))?;
            }
            Ok(())
        });
    #[cfg(target_os = "macos")]
    let builder = builder.on_web_content_process_terminate(|_| log::warn!("the web content process ended; the page reloads"));
    let app = builder.build(context).expect("Failed to launch Seer Classic");
    app.run(|app, event| {
        // The last save handed to the writer reaches the disk before the process ends.
        if let RunEvent::Exit = event {
            if let Some(saves) = app.try_state::<saves::SaveState>() {
                saves.drain();
            }
        }
    });
}
