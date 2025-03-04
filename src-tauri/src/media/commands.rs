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
    // Check cache first
    if let Ok(cache) = THUMBNAIL_CACHE.lock() {
        if let Some(cached) = cache.get(&path, max_size) {
            return Ok(cached);
        }
    }
    
    let path_obj = Path::new(&path);

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
    if let Ok(ref thumbnail) = result {
        if let Ok(mut cache) = THUMBNAIL_CACHE.lock() {
            cache.set(&path, max_size, thumbnail.clone());
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
