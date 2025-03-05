use anyhow::{anyhow, Result};
use base64::{engine::general_purpose, Engine as _};
use image::{self, imageops::FilterType, GenericImageView, ImageOutputFormat};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
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
    let ext_str = path_obj
        .extension()
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
                return Err(format!(
                    "Image too large to process: {} ({}MB)",
                    path.display(),
                    file_size / (1024 * 1024)
                ));
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
            let intermediate =
                img.resize(intermediate_size, intermediate_size, FilterType::Triangle);

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
    let ffmpeg_result = Command::new("ffmpeg").arg("-version").output();

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
        }
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
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());

    let extension = path
        .extension()
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
    let x = crop_params
        .get("x")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing or invalid x coordinate".to_string())?;

    let y = crop_params
        .get("y")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing or invalid y coordinate".to_string())?;

    let width = crop_params
        .get("width")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing or invalid width".to_string())?;

    let height = crop_params
        .get("height")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing or invalid height".to_string())?;

    let rotation = crop_params
        .get("rotation")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let flip_h = crop_params
        .get("flipH")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let flip_v = crop_params
        .get("flipV")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Check if ffmpeg is available
    let ffmpeg_result = Command::new("ffmpeg").arg("-version").output();

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
        filters.push(format!(
            "rotate={}:ow=rotw({}):oh=roth({})",
            angle, angle, angle
        ));
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
                // Log the full error to console
                eprintln!("FFmpeg error (crop): {}", error);

                // Try to remove the temporary file if it exists
                let _ = fs::remove_file(&temp_path);
                // Try to remove the backup file
                let _ = fs::remove_file(&backup_path);

                // Return a more concise error message
                return Err("Failed to crop video. Check logs for details.".to_string());
            }
        }
        Err(e) => {
            // Log the full error to console
            eprintln!("Failed to run ffmpeg (crop): {}", e);

            // Try to remove the temporary file if it exists
            let _ = fs::remove_file(&temp_path);
            // Try to remove the backup file
            let _ = fs::remove_file(&backup_path);

            // Return a more concise error message
            return Err("Failed to run FFmpeg. Check logs for details.".to_string());
        }
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

/// Get the current progress of a video trim operation
/// Used to poll progress from the frontend
#[tauri::command]
pub fn get_trim_progress() -> Result<i32, String> {
    // Get the global progress value
    let progress = match TRIM_PROGRESS.lock() {
        Ok(progress) => *progress,
        Err(_) => 0,
    };

    Ok(progress)
}

// Global variable to track trim progress
static TRIM_PROGRESS: Lazy<Mutex<i32>> = Lazy::new(|| {
    Mutex::new(0) // Initialize with 0% progress
});

/// Reset the trim progress (called when starting a new trim)
#[tauri::command]
pub fn reset_trim_progress() -> Result<(), String> {
    match TRIM_PROGRESS.lock() {
        Ok(mut progress) => {
            *progress = 0;
            Ok(())
        }
        Err(_) => Err("Failed to reset progress".to_string()),
    }
}

/// Trim a video using FFmpeg, overwriting the original file
/// Now with frame-accurate re-encoding for exact trimming
#[tauri::command]
pub async fn trim_video(
    app: tauri::AppHandle,
    path: String,
    start_time: f64,
    end_time: f64,
) -> Result<String, String> {
    // Reset progress at the beginning
    match TRIM_PROGRESS.lock() {
        Ok(mut progress) => *progress = 0,
        Err(_) => return Err("Failed to initialize progress tracking".to_string()),
    }

    // Validate time parameters
    if start_time < 0.0 {
        return Err("Start time cannot be negative".to_string());
    }

    if end_time <= start_time {
        return Err("End time must be greater than start time".to_string());
    }

    // Check if ffmpeg is available
    let ffmpeg_result = Command::new("ffmpeg").arg("-version").output();

    if ffmpeg_result.is_err() {
        return Err("FFmpeg is not installed or not in PATH. Please install FFmpeg to enable video trimming.".to_string());
    }

    // Create temporary path for the trimmed video
    let path_obj = Path::new(&path);
    let temp_path = generate_modified_filename(path_obj, "_temp");

    // Create a backup of the original file
    let backup_path = generate_modified_filename(path_obj, "_backup");
    if let Err(e) = fs::copy(path_obj, &backup_path) {
        return Err(format!("Failed to create backup of original video: {}", e));
    }

    // Calculate duration
    let duration = end_time - start_time;

    // First, get video info to determine the original codec and quality parameters
    let probe_output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("v:0")
        .arg("-show_entries")
        .arg("stream=codec_name,width,height,r_frame_rate,bit_rate")
        .arg("-of")
        .arg("csv=p=0")
        .arg(&path)
        .output();

    // Variables to store video info
    let mut video_codec = "libx264".to_string(); // Default codec
    let mut crf_value = "18".to_string(); // Default high quality
    let mut preset = "medium".to_string(); // Default preset

    match probe_output {
        Ok(output) => {
            if output.status.success() {
                let info = String::from_utf8_lossy(&output.stdout);
                let parts: Vec<&str> = info.trim().split(',').collect();

                // If we have codec info, try to use similar settings
                if parts.len() >= 1 {
                    let original_codec = parts[0];

                    // Based on original codec, set appropriate encoder and quality settings
                    if original_codec == "h264" || original_codec == "avc1" {
                        video_codec = "libx264".to_string();
                        crf_value = "18".to_string(); // High quality, visually lossless
                        preset = "medium".to_string(); // Good balance between speed and quality
                    } else if original_codec == "hevc" || original_codec == "hvc1" {
                        video_codec = "libx265".to_string();
                        crf_value = "22".to_string(); // HEVC uses different CRF scale
                        preset = "medium".to_string();
                    } else if original_codec == "vp9" {
                        video_codec = "libvpx-vp9".to_string();
                        crf_value = "18".to_string();
                        preset = "good".to_string();
                    } else if original_codec == "av1" {
                        video_codec = "libaom-av1".to_string();
                        crf_value = "20".to_string();
                        preset = "medium".to_string();
                    }

                    // Log what we're using
                    eprintln!(
                        "Original codec: {}, using encoder: {} with CRF: {}",
                        original_codec, video_codec, crf_value
                    );
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to probe video details: {}", e);
            // Continue with defaults
        }
    }

    // Log the command we're about to run
    eprintln!(
        "Trimming video from {} to {} (duration: {})",
        start_time, end_time, duration
    );

    // Create a unique temporary directory and keep it alive until the end of this function
    let temp_progress_dir = tempdir()
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;
    
    // Create the progress file path inside the temp directory
    let progress_file = temp_progress_dir.path().join("progress.txt");

    // Log the ffmpeg command we're about to run with detailed parameters
    let cmd_string = format!(
        "ffmpeg -v verbose -ss {} -i \"{}\" -t {} -c:v {} -crf {} -preset {} -c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart -progress {} {}",
        start_time, path, duration, video_codec, crf_value, preset, progress_file.display(), temp_path.display()
    );
    
    // Print detailed diagnostic info to console
    println!("=== FFMPEG TRIM OPERATION ===");
    println!("Command: {}", cmd_string);
    println!("Input file: {}", path);
    println!("Start time: {}s", start_time);
    println!("End time: {}s", end_time);
    println!("Duration: {}s", duration);
    println!("Codec: {}", video_codec);
    println!("CRF: {}", crf_value);
    println!("Preset: {}", preset);
    println!("Output file: {}", temp_path.display());
    println!("Time: {}", chrono::Local::now().to_rfc3339());
    println!("============================");

    // Create a pipe for stderr to capture output while still allowing the process to run
    let stderr_file = tempfile::tempfile()
        .map_err(|e| format!("Failed to create temporary file for stderr: {}", e))?;
    let stderr_file_clone = stderr_file.try_clone()
        .map_err(|e| format!("Failed to clone stderr file: {}", e))?;
    
    // Launch FFmpeg with progress output and capture stderr
    let child = Command::new("ffmpeg")
        .arg("-v") // Verbose mode for more detailed output
        .arg("verbose")
        .arg("-ss")
        .arg(start_time.to_string())
        .arg("-i")
        .arg(&path)
        .arg("-t")
        .arg(duration.to_string())
        .arg("-c:v")
        .arg(&video_codec) // Use detected/selected codec
        .arg("-crf")
        .arg(&crf_value) // Quality preservation
        .arg("-preset")
        .arg(&preset) // Speed/quality balance
        .arg("-c:a")
        .arg("aac") // Use AAC for audio (widely compatible)
        .arg("-b:a")
        .arg("192k") // Good audio quality
        .arg("-pix_fmt")
        .arg("yuv420p") // Standard pixel format for wide compatibility
        .arg("-movflags")
        .arg("+faststart") // Optimize for web playback
        .arg("-progress")
        .arg(&progress_file) // Write progress info to file
        .arg(&temp_path)
        .stderr(stderr_file) // Capture stderr to our file
        .spawn();

    match child {
        Ok(mut child) => {
            // Monitor progress in a separate thread
            let progress_path = progress_file.clone();
            let total_duration = duration;

            // Create a handle to child.id() that we can use from multiple places
            let child_id = child.id();

            // Spawn a thread that just monitors the progress
            std::thread::spawn(move || {
                let mut last_progress = 0.0;

                // Wait for progress file to be created
                while !progress_path.exists() {
                    std::thread::sleep(std::time::Duration::from_millis(100));

                    // Check if process still exists in a platform-independent way
                    match std::process::Command::new("kill")
                        .arg("-0") // Signal 0 doesn't kill but checks if process exists
                        .arg(child_id.to_string())
                        .output()
                    {
                        Ok(output) => {
                            if !output.status.success() {
                                // Process no longer exists
                                return;
                            }
                        }
                        Err(_) => {
                            // Error checking process, assume it's gone
                            return;
                        }
                    }
                }

                loop {
                    std::thread::sleep(std::time::Duration::from_millis(200));

                    // Check if process still exists in a platform-independent way
                    match std::process::Command::new("kill")
                        .arg("-0") // Signal 0 doesn't kill but checks if process exists
                        .arg(child_id.to_string())
                        .output()
                    {
                        Ok(output) => {
                            if !output.status.success() {
                                // Process is no longer running
                                // We don't set to 100% here in case it failed
                                // The main thread will handle that based on exit code
                                break;
                            }
                        }
                        Err(_) => {
                            // Error checking process, assume it's gone
                            break;
                        }
                    }

                    // Process still running, read progress
                    if let Ok(content) = fs::read_to_string(&progress_path) {
                        // Parse FFmpeg progress output
                        if let Some(time_line) =
                            content.lines().find(|l| l.starts_with("out_time_ms="))
                        {
                            if let Some(time_str) = time_line.strip_prefix("out_time_ms=") {
                                if let Ok(time_ms) = time_str.parse::<f64>() {
                                    let time_s = time_ms / 1000000.0;
                                    let progress = (time_s / total_duration * 100.0).min(99.0);

                                    // Only update if progress changed significantly
                                    if progress - last_progress >= 1.0 {
                                        if let Ok(mut global_progress) = TRIM_PROGRESS.lock() {
                                            *global_progress = progress as i32;
                                        }
                                        last_progress = progress;
                                    }
                                }
                            }
                        }
                    }
                }
            });

            // Meanwhile, wait for the process to complete in the main thread
            let status = child
                .wait()
                .map_err(|e| format!("FFmpeg process error: {}", e))?;

            if !status.success() {
                // Get exit code for more detailed error info
                let exit_code = status.code().unwrap_or(-1);
                
                // Read the captured stderr from our file
                use std::io::{Seek, SeekFrom, Read};
                let mut stderr_content = String::new();
                if let Ok(mut file) = stderr_file_clone.try_clone() {
                    // Rewind the file to the beginning
                    if file.seek(SeekFrom::Start(0)).is_ok() {
                        // Read the entire file content
                        if file.read_to_string(&mut stderr_content).is_err() {
                            stderr_content = "Failed to read stderr content".to_string();
                        }
                    }
                }
                
                // If we couldn't get stderr from the file, try running ffmpeg again to get error info
                if stderr_content.is_empty() {
                    let output = Command::new("ffmpeg")
                        .arg("-v")
                        .arg("error")
                        .arg("-ss")
                        .arg(start_time.to_string())
                        .arg("-i")
                        .arg(&path)
                        .arg("-t")
                        .arg(duration.to_string())
                        .output()
                        .unwrap_or_else(|e| {
                            eprintln!("Failed to get ffmpeg error details: {}", e);
                            std::process::Command::new("echo")
                                .arg("Failed to get ffmpeg error details")
                                .output()
                                .unwrap()
                        });
                    
                    stderr_content = String::from_utf8_lossy(&output.stderr).to_string();
                }
                
                // Print the full error to console
                println!("=== FFMPEG ERROR ===");
                println!("Exit code: {}", exit_code);
                println!("Error details:");
                println!("{}", stderr_content);
                println!("==================");

                // Clean up temporary files
                let _ = fs::remove_file(&temp_path);
                let _ = fs::remove_file(&backup_path);

                // Set progress to error state (-1)
                if let Ok(mut progress) = TRIM_PROGRESS.lock() {
                    *progress = -1;
                }

                // Try to extract a meaningful error message from ffmpeg output
                let user_message = if stderr_content.contains("Invalid data found when processing input") {
                    "Failed to trim video: The video file might be corrupted or in an unsupported format."
                } else if stderr_content.contains("No such file or directory") {
                    "Failed to trim video: Input file could not be accessed."
                } else if stderr_content.contains("Permission denied") {
                    "Failed to trim video: Permission denied when accessing files."
                } else if stderr_content.contains("error while decoding") {
                    "Failed to trim video: The video decoder encountered an error, possibly corrupt frames."
                } else if stderr_content.contains("does not contain any stream") {
                    "Failed to trim video: The file doesn't appear to contain valid video streams."
                } else {
                    "Failed to trim video: Check console logs for details."
                };

                return Err(user_message.to_string());
            } else {
                // Success - set progress to 100%
                if let Ok(mut progress) = TRIM_PROGRESS.lock() {
                    *progress = 100;
                }
            }
        }
        Err(e) => {
            // Log the full error to console
            eprintln!("Failed to run ffmpeg: {}", e);

            // Clean up temporary files
            let _ = fs::remove_file(&temp_path);
            let _ = fs::remove_file(&backup_path);

            // Set progress to error state (-1)
            if let Ok(mut progress) = TRIM_PROGRESS.lock() {
                *progress = -1;
            }

            // Return a more concise error message
            return Err("Failed to run FFmpeg. Check logs for details.".to_string());
        }
    }

    // Check if the temporary file exists
    if !temp_path.exists() {
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
