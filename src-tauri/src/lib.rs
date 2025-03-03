// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod file_system;
mod media;
mod api;

use file_system::commands::{
    duplicate_directory, list_directory_files, read_caption_file, register_working_directory,
    select_directory, write_caption_file,
};

use media::commands::get_media_thumbnail;
use api::commands::{generate_caption, generate_captions};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        // Add required plugins
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_opener::init())
        // Register command handlers
        .invoke_handler(tauri::generate_handler![
            // File system commands
            select_directory,
            duplicate_directory,
            register_working_directory,
            read_caption_file,
            write_caption_file,
            list_directory_files,
            // Media commands
            get_media_thumbnail,
            // API commands
            generate_caption,
            generate_captions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
