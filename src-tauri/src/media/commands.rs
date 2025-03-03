use base64::{engine::general_purpose, Engine as _};
use image::{self, ImageFormat};
use std::io::Cursor;
use std::path::Path;

/// Generate a thumbnail for an image file and return as base64
#[tauri::command]
pub async fn get_media_thumbnail(path: String, max_size: u32) -> Result<String, String> {
    let path = Path::new(&path);

    // Check if the file exists
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    // Check if it's an image file
    if let Some(extension) = path.extension() {
        let ext = extension.to_string_lossy().to_lowercase();

        // Only process image files
        if !["jpg", "jpeg", "png", "gif", "webp"].contains(&ext.as_str()) {
            return Err(format!("Not an image file: {}", path.display()));
        }

        // Read the image
        let img = match image::open(path) {
            Ok(img) => img,
            Err(e) => return Err(format!("Failed to open image: {}", e)),
        };

        // Resize the image to create a thumbnail
        let thumbnail = img.thumbnail(max_size, max_size);

        // Convert to base64
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        if let Err(e) = thumbnail.write_to(&mut cursor, ImageFormat::Jpeg) {
            return Err(format!("Failed to encode thumbnail: {}", e));
        }

        // Encode as base64
        let base64_string = general_purpose::STANDARD.encode(&buffer);

        // Return as data URL
        Ok(format!("data:image/jpeg;base64,{}", base64_string))
    } else {
        Err(format!("Invalid file: {}", path.display()))
    }
}
