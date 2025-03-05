// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod api;
mod file_system;
mod media;

use file_system::commands::{
    delete_media_file, delete_project_directory, duplicate_directory, export_directory,
    list_directory_files, list_project_directories, open_project_directory, read_caption_file,
    register_working_directory, select_directory, select_export_directory, write_caption_file,
};

use api::commands::{generate_caption, generate_captions};
use media::commands::{crop_video, get_media_thumbnail, get_trim_progress, reset_trim_progress, save_cropped_image, trim_video};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
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
            select_export_directory,
            duplicate_directory,
            register_working_directory,
            read_caption_file,
            write_caption_file,
            list_directory_files,
            export_directory,
            list_project_directories,
            delete_project_directory,
            open_project_directory,
            delete_media_file,
            // Media commands
            get_media_thumbnail,
            crop_video,
            trim_video,
            save_cropped_image,
            reset_trim_progress,
            get_trim_progress,
            // API commands
            generate_caption,
            generate_captions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
