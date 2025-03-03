use fs_extra::dir::CopyOptions;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;
use zip::{write::FileOptions, ZipWriter};
use chrono::Local;

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

/// Select an export directory using the native file dialog
#[tauri::command]
pub async fn select_export_directory(app: AppHandle) -> Result<String, String> {
    // Use the dialog plugin to select a directory for export
    let file_path = app.dialog().file().blocking_pick_folder();

    match file_path {
        Some(path) => Ok(path.to_string()),
        None => Err("No export directory selected".to_string()),
    }
}

/// Export the working directory to a specified destination
#[tauri::command]
pub async fn export_directory(
    source_dir: String,
    destination_dir: String,
    as_zip: bool,
) -> Result<String, String> {
    // Generate a timestamp for the export directory/file name
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let source_path = Path::new(&source_dir);
    
    // Get the source directory name to use as part of the export name
    let source_name = source_path
        .file_name()
        .ok_or_else(|| "Invalid source directory".to_string())?
        .to_string_lossy();
    
    // Create the export name using the timestamp
    let export_name = format!("spacecat_export_{}_{}", source_name, timestamp);
    
    // Create the full destination path
    let dest_path = Path::new(&destination_dir);
    
    if as_zip {
        // Export as a ZIP file
        let zip_filename = format!("{}.zip", export_name);
        let zip_path = dest_path.join(&zip_filename);
        
        println!("Exporting to ZIP file: {}", zip_path.display());
        
        // Create the ZIP file
        zip_directory(&source_dir, &zip_path.to_string_lossy())
            .map_err(|e| format!("Failed to create ZIP file: {}", e))?;
        
        Ok(zip_path.to_string_lossy().to_string())
    } else {
        // Export as a directory
        let export_dir = dest_path.join(&export_name);
        
        println!("Exporting to directory: {}", export_dir.display());
        
        // Create the destination directory
        fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;
        
        // Copy options
        let options = CopyOptions::new().overwrite(true).copy_inside(true);
        
        // Copy the directory contents
        fs_extra::dir::copy(&source_dir, &export_dir, &options)
            .map_err(|e| format!("Failed to copy directory: {}", e))?;
        
        Ok(export_dir.to_string_lossy().to_string())
    }
}

/// Helper function to create a ZIP file from a directory
fn zip_directory(src_dir: &str, zip_path: &str) -> Result<(), String> {
    let src_path = Path::new(src_dir);
    if !src_path.exists() || !src_path.is_dir() {
        return Err(format!("Source directory does not exist: {}", src_dir));
    }
    
    // Create the ZIP file
    let file = fs::File::create(zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    
    // Use default compression
    let options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);
    
    // A buffer for reading files
    let mut buffer = Vec::new();
    
    // Walk the directory
    fn add_directory_to_zip(
        path: &Path,
        src_path: &Path,
        zip: &mut ZipWriter<fs::File>,
        options: &FileOptions,
        buffer: &mut Vec<u8>,
    ) -> Result<(), String> {
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            
            // Create a relative path for the ZIP file
            let name = path.strip_prefix(src_path)
                .map_err(|_| "Failed to create relative path".to_string())?
                .to_string_lossy();
            
            // Handle directories and files
            if path.is_dir() {
                // Add directory to ZIP
                zip.add_directory(name.to_string(), *options)
                    .map_err(|e| format!("Failed to add directory to ZIP: {}", e))?;
                
                // Recursively add contents
                add_directory_to_zip(&path, src_path, zip, options, buffer)?;
            } else {
                // Add file to ZIP
                zip.start_file(name.to_string(), *options)
                    .map_err(|e| format!("Failed to add file to ZIP: {}", e))?;
                
                // Read and write file contents
                let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
                buffer.clear();
                file.read_to_end(buffer).map_err(|e| e.to_string())?;
                zip.write_all(buffer).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    
    // Start adding files to the ZIP
    add_directory_to_zip(src_path, src_path, &mut zip, &options, &mut buffer)?;
    
    // Finalize the ZIP file
    zip.finish().map_err(|e| format!("Failed to finalize ZIP file: {}", e))?;
    
    Ok(())
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
