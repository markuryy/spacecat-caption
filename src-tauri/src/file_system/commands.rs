use fs_extra::dir::CopyOptions;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub file_type: String,
    pub has_caption: bool,
}

/// Select a directory using the native file dialog
#[tauri::command]
pub async fn select_directory(app: AppHandle) -> Result<String, String> {
    // In Tauri 2.0 beta, we use the dialog plugin to select a directory
    let file_path = app.dialog().file().blocking_pick_folder();

    match file_path {
        Some(path) => Ok(path.to_string()),
        None => Err("No folder selected".to_string()),
    }
}

/// Duplicate a directory to create a working copy
#[tauri::command]
pub async fn duplicate_directory(source: String, destination: String) -> Result<String, String> {
    // Create the destination directory if it doesn't exist
    let dest_path = Path::new(&destination);
    if !dest_path.exists() {
        fs::create_dir_all(dest_path).map_err(|e| e.to_string())?;
    } else {
        // Clear the destination directory if it already exists
        // This ensures we don't have leftover files from previous runs
        fs::remove_dir_all(dest_path).map_err(|e| e.to_string())?;
        fs::create_dir_all(dest_path).map_err(|e| e.to_string())?;
    }

    // Debug: Print source and destination
    println!("Duplicating directory from {} to {}", source, destination);

    // Get the source directory name
    let source_path = Path::new(&source);
    let source_name = source_path
        .file_name()
        .ok_or_else(|| "Invalid source directory".to_string())?;

    // Create the full destination path including the source directory name
    let full_dest_path = dest_path.join(source_name);

    // Copy options
    let options = CopyOptions::new().overwrite(true).copy_inside(true);

    // Copy the directory
    match fs_extra::dir::copy(&source, &destination, &options) {
        Ok(_) => {
            println!("Successfully copied directory to {}", destination);

            // Return the full destination path where files were copied
            let result_path = full_dest_path.to_string_lossy().to_string();
            println!("Using working directory: {}", result_path);

            Ok(result_path)
        }
        Err(e) => {
            println!("Error copying directory: {}", e);
            Err(e.to_string())
        }
    }
}

/// Register a directory as an asset scope for direct media access
#[tauri::command]
pub async fn register_working_directory(app: AppHandle, path: String) -> Result<(), String> {
    // The correct method is fs_scope() with allow_directory
    // Based on the documentation, allow_directory takes a path and a boolean for recursive
    match app.fs_scope().allow_directory(Path::new(&path), false) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Read a caption file
#[tauri::command]
pub async fn read_caption_file(path: String) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(e) => Err(e.to_string()),
    }
}

/// Write content to a caption file
#[tauri::command]
pub async fn write_caption_file(path: String, content: String) -> Result<(), String> {
    // Ensure the directory exists
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    // Write the file
    match fs::write(path, content) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// List all media files in a directory
#[tauri::command]
pub async fn list_directory_files(directory: String) -> Result<Vec<MediaFile>, String> {
    let dir_path = Path::new(&directory);
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", directory));
    }

    let mut media_files = Vec::new();

    // Debug: Print the directory being processed
    println!("Processing directory: {}", directory);

    // Check if the directory is empty
    let entries = match fs::read_dir(dir_path) {
        Ok(entries) => entries,
        Err(e) => {
            println!("Error reading directory: {}", e);
            return Err(format!("Failed to read directory: {}", e));
        }
    };

    let mut file_count = 0;
    let mut media_count = 0;

    for entry in entries {
        if let Ok(entry) = entry {
            file_count += 1;
            let path = entry.path();

            // Skip directories
            if path.is_dir() {
                println!("Skipping subdirectory: {}", path.display());
                continue;
            }

            // Debug: Print each file being processed
            println!("Processing file: {}", path.display());

            if let Some(extension) = path.extension() {
                let ext = extension.to_string_lossy().to_lowercase();

                // Debug: Print the extension
                println!("File extension: {}", ext);

                // Check if it's a media file
                let file_type = if ["jpg", "jpeg", "png", "gif", "webp"].contains(&ext.as_str()) {
                    "image"
                } else if ["mp4", "webm", "mov", "avi"].contains(&ext.as_str()) {
                    "video"
                } else {
                    println!("Skipping non-media file with extension: {}", ext);
                    continue; // Skip non-media files
                };

                media_count += 1;

                // Get the file name
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                // Get the path as a string
                let path_str = path.to_string_lossy().to_string();

                // Get the relative path from the directory
                let relative_path = path
                    .strip_prefix(dir_path)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();

                // Check if a caption file exists
                let caption_path = path.with_extension("txt");
                let has_caption = caption_path.exists();

                // Create a unique ID
                let id = format!("{}-{}", file_type, name);

                // Debug: Print the media file being added
                println!("Adding media file: {} ({})", name, file_type);

                // Add to the list
                media_files.push(MediaFile {
                    id,
                    name,
                    path: path_str,
                    relative_path,
                    file_type: file_type.to_string(),
                    has_caption,
                });
            } else {
                println!("Skipping file without extension: {}", path.display());
            }
        }
    }

    // Sort by name
    media_files.sort_by(|a, b| a.name.cmp(&b.name));

    // Debug: Print the total number of media files found
    println!(
        "Found {} media files out of {} total files in {}",
        media_files.len(),
        file_count,
        directory
    );

    if media_files.is_empty() && file_count > 0 {
        println!("WARNING: Directory contains files but no media files were found. Check supported extensions.");
    }

    Ok(media_files)
}
