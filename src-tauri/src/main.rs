#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! The desktop shell (design/notes/desktop-package-2026-10-23.md): the embedded code build plus the payload beside it, both
//! through Tauri's own protocol.
mod payload;
mod public_assets;

use std::sync::Arc;

use public_assets::{GameAssets, PublicDir};
use tauri::{AppHandle, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// Logs why the payload is incomplete, tells the player and quits once the message is closed.
fn refuse_incomplete(app: &AppHandle, reason: &str) {
    eprintln!("payload check failed: {reason}");
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

fn main() {
    let mut context = tauri::generate_context!();
    let public = Arc::new(PublicDir::default());
    let embedded = context.set_assets(Box::new(public_assets::EmptyAssets));
    let assets = GameAssets::new(embedded, public.clone());
    let embedded_paths = assets.embedded_paths();
    context.set_assets(Box::new(assets));
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            if !check_payload(app.handle(), &public) {
                return Ok(());
            }
            let config = app.config().app.windows.first().expect("the main window's configuration").clone();
            WebviewWindowBuilder::from_config(app.handle(), &config)?
                .on_web_resource_request(public_assets::not_found_handler(embedded_paths, public))
                .visible(true)
                .build()?;
            Ok(())
        })
        .run(context)
        .expect("Failed to launch Seer Classic");
}
