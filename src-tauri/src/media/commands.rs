use base64::{engine::general_purpose, Engine as _};
use image::{self, imageops::FilterType, GenericImageView, ImageOutputFormat};
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::Path;
use std::process::Command;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tempfile::tempdir;
use std::path::PathBuf;
use anyhow::{Result, anyhow};

// Define a simple cache for thumbnails
struct ThumbnailCache {
    // Map of path and size to base64 thumbnail
    cache: HashMap<(String, u32), (String, u64)>, // (path, size) -> (thumbnail, timestamp)
    max_entries: usize,
}

impl ThumbnailCache {
    fn new(max_entries: usize) -> Self {
        Self {
            cache: HashMap::with_capacity(max_entries),
            max_entries,
        }
    }

    fn get(&self, path: &str, size: u32) -> Option<String> {
        let key = (path.to_string(), size);
        // Get the entry and check if it's still valid (file hasn't been modified)
        if let Some((thumbnail, cached_time)) = self.cache.get(&key) {
            // Check if the file has been modified since caching
            if let Ok(metadata) = fs::metadata(path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(modified_time) = modified.duration_since(UNIX_EPOCH) {
                        let modified_secs = modified_time.as_secs();
                        // If the file is newer than our cache, return None
                        if modified_secs > *cached_time {
                            return None;
                        }
                    }
                }
            }
            Some(thumbnail.clone())
        } else {
            None
        }
    }

    fn set(&mut self, path: &str, size: u32, thumbnail: String) {
        // Get current timestamp
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
            
        let key = (path.to_string(), size);
        
        // If cache is at capacity, remove oldest entry
        if self.cache.len() >= self.max_entries {
            // Simple eviction: remove a random entry
            if let Some(oldest_key) = self.cache.keys().next().cloned() {
                self.cache.remove(&oldest_key);
            }
        }
        
        self.cache.insert(key, (thumbnail, now));
    }
}

// Global cache with lazy initialization
static THUMBNAIL_CACHE: Lazy<Mutex<ThumbnailCache>> = Lazy::new(|| {
    Mutex::new(ThumbnailCache::new(500)) // Cache up to 500 thumbnails
});

/// Generate a thumbnail for an image or video file and return as base64
#[tauri::command]
pub async fn get_media_thumbnail(path: String, max_size: u32) -> Result<String, String> {
    // Strip any timestamp query parameter from the path
    let clean_path = if path.contains('?') {
        path.split('?').next().unwrap_or(&path).to_string()
    } else {
        path.clone()
    };
    
    // Check cache first
    if let Ok(cache) = THUMBNAIL_CACHE.lock() {
        if let Some(cached) = cache.get(&clean_path, max_size) {
            return Ok(cached);
        }
    }
    
    let path_obj = Path::new(&clean_path);

    // Check if the file exists
    if !path_obj.exists() {
        return Err(format!("File not found: {}", path_obj.display()));
    }

    // Get file extension and handle case-insensitively
    let ext_str = path_obj.extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    
    // No debug logging
    
    // Process based on file type (lowercase extensions only)
    let result = if ["jpg", "jpeg", "png", "gif", "webp"].contains(&ext_str.as_str()) {
        // Handle image files
        generate_image_thumbnail(path_obj, max_size)
    } else if ["mp4", "webm", "mov", "avi"].contains(&ext_str.as_str()) {
        // Handle video files
        generate_video_thumbnail(path_obj, max_size).await
    } else {
        // If not recognized, try to detect by examining the file
        if let Ok(file) = std::fs::File::open(path_obj) {
            let mut buffer = [0; 8]; // Read first 8 bytes for magic numbers
            if file.take(8).read(&mut buffer).is_ok() {
                // Check PNG signature (89 50 4E 47 0D 0A 1A 0A)
                if buffer == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
                    return generate_image_thumbnail(path_obj, max_size);
                }
                // Check JPEG signature (FF D8)
                if buffer[0] == 0xFF && buffer[1] == 0xD8 {
                    return generate_image_thumbnail(path_obj, max_size);
                }
            }
        }
        
        Err(format!("Unsupported file type: {}", ext_str))
    };
    
    // If successful, cache the result
    if let Ok(ref thumbnail) = &result {
        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
            cache.set(&clean_path, max_size, thumbnail.clone());
        }
    }
    
    result
}

/// Generate a thumbnail for an image file
fn generate_image_thumbnail(path: &Path, max_size: u32) -> Result<String, String> {
    // Get file size to determine processing approach
    let file_size = match fs::metadata(path) {
        Ok(metadata) => metadata.len(),
        Err(_) => 0,
    };
    
    // For very large images, use a more memory-efficient approach
    let large_threshold = 10 * 1024 * 1024; // 10MB threshold
    
    // Try to open the image
    let img = match image::open(path) {
        Ok(img) => img,
        Err(e) => {
            // Special handling for large images that may cause memory issues
            if file_size > large_threshold {
                return Err(format!("Image too large to process: {} ({}MB)", path.display(), file_size / (1024 * 1024)));
            }
            return Err(format!("Failed to open image: {}", e));
        }
    };
    
    // For large images, use progressive downsampling to avoid memory issues
    let thumbnail = if file_size > large_threshold {
        // Get dimensions
        let (width, height) = img.dimensions();
        
        // Determine if we need progressive downsampling
        if width > max_size * 4 || height > max_size * 4 {
            // First downsample to an intermediate size to reduce memory usage
            let intermediate_size = max_size * 2;
            let intermediate = img.resize(intermediate_size, intermediate_size, FilterType::Triangle);
            
            // Then create the final thumbnail
            intermediate.resize(max_size, max_size, FilterType::Lanczos3)
        } else {
            // Use direct thumbnail generation for smaller images
            img.thumbnail(max_size, max_size)
        }
    } else {
        // For smaller images, use the standard approach
        img.thumbnail(max_size, max_size)
    };

    // Convert to base64 with appropriate format
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    
    // Always use JPEG for thumbnails regardless of transparency to avoid PNG rendering issues
    if let Err(e) = thumbnail.write_to(&mut cursor, ImageOutputFormat::Jpeg(80)) {
        return Err(format!("Failed to encode JPEG thumbnail: {}", e));
    }
    
    // Encode as base64
    let base64_string = general_purpose::STANDARD.encode(&buffer);
    
    // Return as JPEG data URL
    let result = Ok(format!("data:image/jpeg;base64,{}", base64_string));
    
    // Set a more detailed debug log
    let path_display = path.display();
    
    // No debug logging
    
    result
}

/// Generate a thumbnail for a video file by extracting the first frame
async fn generate_video_thumbnail(path: &Path, max_size: u32) -> Result<String, String> {
    // Create a temporary directory to store the extracted frame
    let temp_dir = match tempdir() {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to create temporary directory: {}", e)),
    };
    
    // Create a path for the extracted frame
    let frame_path = temp_dir.path().join("frame.jpg");
    let frame_path_str = frame_path.to_string_lossy().to_string();
    
    // Use ffmpeg to extract the first frame
    // Check if ffmpeg is available
    let ffmpeg_result = Command::new("ffmpeg")
        .arg("-version")
        .output();
    
    if ffmpeg_result.is_err() {
        return Err("FFmpeg is not installed or not in PATH. Please install FFmpeg to enable video thumbnails.".to_string());
    }
    
    // Extract the first frame using ffmpeg
    let output = Command::new("ffmpeg")
        .arg("-i")
        .arg(path.to_string_lossy().to_string())
        .arg("-vframes")
        .arg("1")
        .arg("-q:v")
        .arg("2")
        .arg(&frame_path_str)
        .output();
    
    match output {
        Ok(output) => {
            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Failed to extract video frame: {}", error));
            }
        },
        Err(e) => return Err(format!("Failed to run ffmpeg: {}", e)),
    }
    
    // Check if the frame was extracted
    if !frame_path.exists() {
        return Err("Failed to extract video frame".to_string());
    }
    
    // Generate a thumbnail from the extracted frame
    let result = generate_image_thumbnail(&frame_path, max_size);
    
    // Clean up the temporary file
    let _ = fs::remove_file(&frame_path);
    
    result
}

/// Generate a file name with a suffix for modified files
fn generate_modified_filename(path: &Path, suffix: &str) -> PathBuf {
    let stem = path.file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    
    let extension = path.extension()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "".to_string());
    
    let new_name = if extension.is_empty() {
        format!("{}{}", stem, suffix)
    } else {
        format!("{}{}.{}", stem, suffix, extension)
    };
    
    path.with_file_name(new_name)
}

/// Save a cropped image from the provided data URL, overwriting the original file
#[tauri::command]
pub async fn save_cropped_image(path: String, data_url: String) -> Result<String, String> {
    // Parse the data URL
    if !data_url.starts_with("data:image/") {
        return Err("Invalid data URL format".to_string());
    }
    
    // Extract the base64 part
    let base64_data = match data_url.split(',').nth(1) {
        Some(data) => data,
        None => return Err("Invalid data URL format".to_string()),
    };
    
    // Decode the base64 data
    let image_data = match general_purpose::STANDARD.decode(base64_data) {
        Ok(data) => data,
        Err(e) => return Err(format!("Failed to decode base64 data: {}", e)),
    };
    
    // Use the original path
    let path_obj = Path::new(&path);
    
    // Create a backup of the original file (just in case)
    let backup_path = generate_modified_filename(path_obj, "_backup");
    if let Err(e) = fs::copy(path_obj, &backup_path) {
        return Err(format!("Failed to create backup of original image: {}", e));
    }
    
    // Save the image data, overwriting the original file
    if let Err(e) = fs::write(path_obj, image_data) {
        // If writing fails, try to restore from backup
        let _ = fs::copy(&backup_path, path_obj); // Best effort restore
        let _ = fs::remove_file(&backup_path); // Clean up backup
        return Err(format!("Failed to write cropped image: {}", e));
    }
    
    // Clean up the backup file
    let _ = fs::remove_file(&backup_path);
    
    // Return the original path (for consistency with the existing interface)
    Ok(path)
}

/// Crop a video using FFmpeg, overwriting the original file
#[tauri::command]
pub async fn crop_video(path: String, crop_params: serde_json::Value) -> Result<String, String> {
    // Parse crop parameters
    let x = crop_params.get("x")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing or invalid x coordinate".to_string())?;
    
    let y = crop_params.get("y")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing or invalid y coordinate".to_string())?;
    
    let width = crop_params.get("width")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing or invalid width".to_string())?;
    
    let height = crop_params.get("height")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing or invalid height".to_string())?;
    
    let rotation = crop_params.get("rotation")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    
    let flip_h = crop_params.get("flipH")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    let flip_v = crop_params.get("flipV")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    // Check if ffmpeg is available
    let ffmpeg_result = Command::new("ffmpeg")
        .arg("-version")
        .output();
    
    if ffmpeg_result.is_err() {
        return Err("FFmpeg is not installed or not in PATH. Please install FFmpeg to enable video cropping.".to_string());
    }
    
    // Create a temporary path for the cropped video
    let path_obj = Path::new(&path);
    let temp_path = generate_modified_filename(path_obj, "_temp");
    
    // Create a backup of the original file
    let backup_path = generate_modified_filename(path_obj, "_backup");
    if let Err(e) = fs::copy(path_obj, &backup_path) {
        return Err(format!("Failed to create backup of original video: {}", e));
    }
    
    // Build FFmpeg filter chain
    let mut filters = Vec::new();
    
    // Add rotation if needed
    if rotation != 0 {
        let angle = match rotation % 360 {
            90 => "PI/2",
            180 => "PI",
            270 => "3*PI/2",
            _ => "0",
        };
        filters.push(format!("rotate={}:ow=rotw({}):oh=roth({})", angle, angle, angle));
    }
    
    // Add flips if needed
    if flip_h {
        filters.push("hflip".to_string());
    }
    if flip_v {
        filters.push("vflip".to_string());
    }
    
    // Add crop filter with appropriate parameters
    filters.push(format!("crop={}:{}:{}:{}", width, height, x, y));
    
    // Build the complete filter chain
    let filter_chain = filters.join(",");
    
    // Execute FFmpeg with the filter chain
    let output = Command::new("ffmpeg")
        .arg("-i")
        .arg(&path)
        .arg("-vf")
        .arg(filter_chain)
        .arg("-c:a")
        .arg("copy") // Copy audio stream without re-encoding
        .arg("-c:v")
        .arg("libx264") // Use H.264 codec for video
        .arg("-preset")
        .arg("medium") // Balance between speed and quality
        .arg("-crf")
        .arg("23") // Reasonable quality
        .arg(&temp_path)
        .output();
    
    match output {
        Ok(output) => {
            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                // Try to remove the temporary file if it exists
                let _ = fs::remove_file(&temp_path);
                // Try to remove the backup file
                let _ = fs::remove_file(&backup_path);
                return Err(format!("Failed to crop video: {}", error));
            }
        },
        Err(e) => {
            // Try to remove the temporary file if it exists
            let _ = fs::remove_file(&temp_path);
            // Try to remove the backup file
            let _ = fs::remove_file(&backup_path);
            return Err(format!("Failed to run ffmpeg: {}", e))
        },
    }
    
    // Check if the temp file exists
    if !temp_path.exists() {
        // Try to remove the backup file
        let _ = fs::remove_file(&backup_path);
        return Err("Failed to create cropped video".to_string());
    }
    
    // Move the temp file to overwrite the original
    if let Err(e) = fs::rename(&temp_path, path_obj) {
        // If rename fails, try to restore from backup
        let _ = fs::copy(&backup_path, path_obj);
        // Try to remove the temporary file
        let _ = fs::remove_file(&temp_path);
        // Try to remove the backup file
        let _ = fs::remove_file(&backup_path);
        return Err(format!("Failed to replace original video: {}", e));
    }
    
    // Remove the backup file
    let _ = fs::remove_file(&backup_path);
    
    // Return the original path
    Ok(path)
}

/// Trim a video using FFmpeg, overwriting the original file
#[tauri::command]
pub async fn trim_video(path: String, start_time: f64, end_time: f64) -> Result<String, String> {
    // Validate time parameters
    if start_time < 0.0 {
        return Err("Start time cannot be negative".to_string());
    }
    
    if end_time <= start_time {
        return Err("End time must be greater than start time".to_string());
    }
    
    // Check if ffmpeg is available
    let ffmpeg_result = Command::new("ffmpeg")
        .arg("-version")
        .output();
    
    if ffmpeg_result.is_err() {
        return Err("FFmpeg is not installed or not in PATH. Please install FFmpeg to enable video trimming.".to_string());
    }
    
    // Create a temporary path for the trimmed video
    let path_obj = Path::new(&path);
    let temp_path = generate_modified_filename(path_obj, "_temp");
    
    // Create a backup of the original file
    let backup_path = generate_modified_filename(path_obj, "_backup");
    if let Err(e) = fs::copy(path_obj, &backup_path) {
        return Err(format!("Failed to create backup of original video: {}", e));
    }
    
    // Calculate duration
    let duration = end_time - start_time;
    
    // Execute FFmpeg to trim the video
    let output = Command::new("ffmpeg")
        .arg("-i")
        .arg(&path)
        .arg("-ss")
        .arg(start_time.to_string())
        .arg("-t")
        .arg(duration.to_string())
        .arg("-c:v")
        .arg("copy") // Copy video stream without re-encoding to preserve quality
        .arg("-c:a")
        .arg("copy") // Copy audio stream without re-encoding
        .arg("-avoid_negative_ts")
        .arg("make_zero")
        .arg(&temp_path)
        .output();
    
    match output {
        Ok(output) => {
            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                // Try to remove the temporary file if it exists
                let _ = fs::remove_file(&temp_path);
                // Try to remove the backup file
                let _ = fs::remove_file(&backup_path);
                return Err(format!("Failed to trim video: {}", error));
            }
        },
        Err(e) => {
            // Try to remove the temporary file if it exists
            let _ = fs::remove_file(&temp_path);
            // Try to remove the backup file
            let _ = fs::remove_file(&backup_path);
            return Err(format!("Failed to run ffmpeg: {}", e));
        },
    }
    
    // Check if the temporary file exists
    if !temp_path.exists() {
        // Try to remove the backup file
        let _ = fs::remove_file(&backup_path);
        return Err("Failed to create trimmed video".to_string());
    }
    
    // Move the temporary file to overwrite the original
    if let Err(e) = fs::rename(&temp_path, path_obj) {
        // If rename fails, try to restore from backup
        let _ = fs::copy(&backup_path, path_obj);
        // Try to remove the temporary file
        let _ = fs::remove_file(&temp_path);
        // Try to remove the backup file
        let _ = fs::remove_file(&backup_path);
        return Err(format!("Failed to replace original video: {}", e));
    }
    
    // Remove the backup file
    let _ = fs::remove_file(&backup_path);
    
    // Return the original path
    Ok(path)
}
