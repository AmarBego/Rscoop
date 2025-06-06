// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .level(log::LevelFilter::Trace)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![commands::search::search_scoop])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
