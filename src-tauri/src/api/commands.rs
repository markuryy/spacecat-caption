use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::time::Duration;
use std::path::Path;
use serde_json;

// OpenAI API request structure
#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<Message>,
    max_tokens: u32,
    temperature: f32,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: Vec<MessageContent>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum MessageContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    Image { image_url: ImageUrl },
}

#[derive(Serialize)]
struct ImageUrl {
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

// OpenAI API response structure
#[derive(Deserialize, Debug)]
struct OpenAIResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize, Debug)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(Deserialize, Debug)]
struct ChoiceMessage {
    content: String,
}

/// Generate a caption for an image or video frame using OpenAI's API
#[tauri::command]
pub async fn generate_caption(
    api_url: String,
    api_key: String,
    prompt: String,
    image_path: String,
    model: String,
    image_detail: String,
    use_detail_parameter: bool,
    video_frame_url: Option<String>,
) -> Result<String, String> {
    // Use provided video frame if available, otherwise create from image path
    let image_data_url = match video_frame_url {
        Some(url) => url,
        None => match create_data_url_from_image(&image_path).await {
            Ok(url) => url,
            Err(e) => return Err(format!("Failed to create data URL: {}", e)),
        },
    };

    // Set detail parameter if enabled
    let detail = if use_detail_parameter {
        Some(image_detail)
    } else {
        None
    };

    // Create the API request
    let request = OpenAIRequest {
        model,
        messages: vec![Message {
            role: "user".to_string(),
            content: vec![
                MessageContent::Text { text: prompt },
                MessageContent::Image {
                    image_url: ImageUrl {
                        url: image_data_url,
                        detail,
                    },
                },
            ],
        }],
        max_tokens: 300,
        temperature: 0.7,
    };

    // Send the request to OpenAI
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(&api_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    // Check if the request was successful
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        
        // Check for specific Gemini error about file state
        if error_text.contains("not in an ACTIVE state") {
            return Err("The file needs to be re-uploaded. Please try again.".to_string());
        }
        
        return Err(format!(
            "API request failed with status {}: {}",
            status, error_text
        ));
    }

    // Capture response info before parsing
    let status = response.status();
    let headers = response.headers().clone();
    
    // Parse the response
    let response_body: OpenAIResponse = response
        .json()
        .await
        .map_err(|e| {
            println!("Failed to parse OpenAI API response as JSON: {}", e);
            println!("Response status was: {}", status);
            println!("Response headers: {:?}", headers);
            "Failed to parse API response. This might be a network/encoding issue, the API returned non-JSON data, or there's a server error.".to_string()
        })?;

    // Extract the caption
    if let Some(choice) = response_body.choices.first() {
        Ok(choice.message.content.clone())
    } else {
        Err("No caption generated".to_string())
    }
}

/// Create a data URL from an image file
async fn create_data_url_from_image(path: &str) -> Result<String, Box<dyn Error>> {
    use base64::{engine::general_purpose, Engine as _};
    use image::{self, ImageFormat};
    use std::io::Cursor;
    use std::path::Path;

    let path = Path::new(path);

    // Check if the file exists
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()).into());
    }

    // Read the image file
    let img = image::open(path)?;

    // Convert to JPEG format with reasonable quality
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    img.write_to(&mut cursor, ImageFormat::Jpeg)?;

    // Encode as base64
    let base64_string = general_purpose::STANDARD.encode(&buffer);

    // Return as data URL
    Ok(format!("data:image/jpeg;base64,{}", base64_string))
}

/// Generate captions for multiple images and videos
#[tauri::command]
pub async fn generate_captions(
    api_url: String,
    api_key: String,
    prompt: String,
    image_paths: Vec<String>,
    model: String,
    image_detail: String,
    use_detail_parameter: bool,
) -> Result<Vec<(String, String)>, String> {
    let mut results = Vec::new();

    for path in image_paths {
        // Check if the file is a video
        let path_obj = std::path::Path::new(&path);
        let is_video = if let Some(ext) = path_obj.extension() {
            let ext_str = ext.to_string_lossy().to_lowercase();
            ["mp4", "webm", "mov", "avi"].contains(&ext_str.as_str())
        } else {
            false
        };

        // For videos, extract the first frame
        let video_frame_url = if is_video {
            match super::super::media::commands::extract_video_frame(path.clone(), None).await {
                Ok(frame) => Some(frame),
                Err(e) => {
                    eprintln!("Failed to extract video frame: {}", e);
                    None
                }
            }
        } else {
            None
        };

        // Generate caption
        match generate_caption(
            api_url.clone(),
            api_key.clone(),
            prompt.clone(),
            path.clone(),
            model.clone(),
            image_detail.clone(),
            use_detail_parameter,
            video_frame_url,
        )
        .await
        {
            Ok(caption) => results.push((path, caption)),
            Err(e) => results.push((path, format!("Error: {}", e))),
        }
    }

    Ok(results)
}

// Gemini API structures

// Gemini file upload response
#[derive(Deserialize, Debug)]
struct GeminiFileResponse {
    file: GeminiFile,
}

#[derive(Deserialize, Debug)]
struct GeminiFile {
    name: String,
    uri: String,
}

// Gemini file info response for checking file state
#[derive(Deserialize, Debug)]
struct GeminiFileInfo {
    name: String,
    uri: String,
    state: String,
    // Other fields omitted for brevity
}

// Gemini API request structure
#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiSystemInstruction>,
    generation_config: GeminiGenerationConfig,
}

#[derive(Serialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum GeminiPart {
    Text { text: String },
    FileData { file_data: GeminiFileData },
}

#[derive(Serialize)]
struct GeminiFileData {
    file_uri: String,
    mime_type: String,
}

#[derive(Serialize)]
struct GeminiSystemInstruction {
    role: String,
    parts: Vec<GeminiTextPart>,
}

#[derive(Serialize)]
struct GeminiTextPart {
    text: String,
}

#[derive(Serialize)]
struct GeminiGenerationConfig {
    temperature: f32,
    top_k: i32,
    top_p: f32,
    max_output_tokens: i32,
    response_mime_type: String,
    response_schema: GeminiResponseSchema,
}

#[derive(Serialize)]
struct GeminiResponseSchema {
    #[serde(rename = "type")]
    schema_type: String,
    properties: GeminiProperties,
}

#[derive(Serialize)]
struct GeminiProperties {
    caption: GeminiCaption,
}

#[derive(Serialize)]
struct GeminiCaption {
    #[serde(rename = "type")]
    caption_type: String,
}

// Gemini API response structure
#[derive(Deserialize, Debug)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
}

#[derive(Deserialize, Debug)]
struct GeminiCandidate {
    content: GeminiCandidateContent,
}

#[derive(Deserialize, Debug)]
struct GeminiCandidateContent {
    parts: Vec<GeminiResponsePart>,
}

#[derive(Deserialize, Debug)]
struct GeminiResponsePart {
    text: String,
}

/// Wait for a file to reach the ACTIVE state in Gemini API
async fn wait_for_file_active(
    api_key: &str,
    file_name: &str,
    max_attempts: usize,
) -> Result<bool, Box<dyn Error>> {
    let client = Client::new();
    
    // Get file endpoint
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/files/{}?key={}",
        file_name, api_key
    );
    
    println!("Waiting for file {} to become active...", file_name);
    
    // Poll the file state with backoff
    for attempt in 0..max_attempts {
        // Send request to check file state
        let response = client
            .get(&url)
            .send()
            .await?;
        
        if response.status().is_success() {
            let file_info: GeminiFileInfo = response.json().await?;
            
            println!("File state check attempt {}: state = {}", attempt + 1, file_info.state);
            
            // If file is active, we're good to go
            if file_info.state == "ACTIVE" {
                println!("File is now ACTIVE and ready to use");
                return Ok(true);
            }
            
            // If file failed, no point in waiting
            if file_info.state != "PROCESSING" {
                println!("File is in {} state, not ACTIVE or PROCESSING", file_info.state);
                return Err(format!("File is in {} state, not ACTIVE", file_info.state).into());
            }
            
            // Wait with exponential backoff (start with 5s, then 10s, 20s, etc.)
            let wait_time = Duration::from_secs(5u64.saturating_pow(attempt as u32));
            println!("File still processing, waiting for {} seconds before next check", 5u64.saturating_pow(attempt as u32));
            tokio::time::sleep(wait_time).await;
        } else {
            // If we can't get file info, return error
            let status = response.status();
            let error_text = response.text().await?;
            println!("Failed to get file status: {} - {}", status, error_text);
            return Err(format!("Failed to get file status: {} - {}", status, error_text).into());
        }
    }
    
    // Exhausted all attempts
    println!("Exhausted all {} attempts waiting for file to become active", max_attempts);
    Err("File did not become ACTIVE after maximum wait time".into())
}

/// Upload a file to Gemini's API and wait for it to be ready
async fn upload_file_to_gemini(
    api_key: &str,
    file_path: &str,
    mime_type: &str,
) -> Result<String, Box<dyn Error>> {
    use reqwest::multipart;
    use std::time::{SystemTime, UNIX_EPOCH};
    
    println!("Starting file upload for: {}", file_path);
    
    let file_bytes = tokio::fs::read(file_path).await?;
    println!("Read {} bytes from file", file_bytes.len());
    
    let file_name = Path::new(file_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    
    // Add a timestamp to make each upload unique
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    
    let unique_name = format!("{}_{}", file_name, timestamp);
    println!("Using unique name for upload: {}", unique_name);
    
    let client = Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/upload/v1beta/files?key={}",
        api_key
    );
    
    // Create the file metadata part with unique name
    let metadata_json = format!("{{\"file\": {{\"display_name\": \"{}\"}}}}", unique_name);
    
    println!("Uploading file with MIME type: {}", mime_type);
    
    // Create multipart form with metadata and file
    let form = multipart::Form::new()
        .text("metadata", metadata_json)
        .part(
            "file",
            multipart::Part::bytes(file_bytes)
                .file_name(unique_name.clone())
                .mime_str(mime_type)?
        );
    
    // Send the request
    println!("Sending upload request to Gemini API...");
    let response = client
        .post(&url)
        .multipart(form)
        .send()
        .await?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await?;
        println!("Upload failed with status {}: {}", status, error_text);
        return Err(format!("Upload failed with status {}: {}", status, error_text).into());
    }
    
    println!("Upload successful, parsing response...");
    let file_response: GeminiFileResponse = response.json().await?;
    println!("File uploaded with name: {} and URI: {}", file_response.file.name, file_response.file.uri);
    
    // Extract file name from URI (typically the last part after the slash)
    let file_id = file_response.file.name.split('/').last()
        .ok_or("Invalid file name format")?;
    println!("Extracted file ID: {}", file_id);
    
    // Wait for file to become active (max 10 attempts with exponential backoff)
    println!("Waiting for file to become active...");
    match wait_for_file_active(api_key, file_id, 10).await {
        Ok(_) => {
            println!("File is active and ready to use");
            Ok(file_response.file.uri)
        },
        Err(e) => {
            println!("File activation failed: {}", e);
            Err(format!("File uploaded but not ready for use: {}", e).into())
        },
    }
}

/// Generate a caption for a video or image using Google's Gemini API
#[tauri::command]
pub async fn generate_gemini_caption(
    api_key: String,
    prompt: String,
    media_path: String,
    system_instruction: Option<String>,
    temperature: Option<f32>,
) -> Result<String, String> {
    // Try the operation with one automatic retry for file state errors
    match generate_gemini_caption_internal(
        api_key.clone(),
        prompt.clone(),
        media_path.clone(),
        system_instruction.clone(),
        temperature,
        false, // Not a retry yet
    ).await {
        Ok(caption) => Ok(caption),
        Err(e) => {
            // If the error is about file state, retry once automatically
            if e.contains("file needs to be re-uploaded") {
                generate_gemini_caption_internal(
                    api_key,
                    prompt,
                    media_path,
                    system_instruction,
                    temperature,
                    true, // This is a retry
                ).await
            } else {
                // For other errors, just return the error
                Err(e)
            }
        }
    }
}

/// Internal implementation of Gemini caption generation with retry flag
async fn generate_gemini_caption_internal(
    api_key: String,
    prompt: String,
    media_path: String,
    system_instruction: Option<String>,
    temperature: Option<f32>,
    is_retry: bool,
) -> Result<String, String> {
    println!("Starting Gemini caption generation for: {}", media_path);
    if is_retry {
        println!("This is a retry attempt");
    }
    
    // Determine mime type from file extension
    let path = Path::new(&media_path);
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    let mime_type = match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "webm" => "video/webm",
        _ => return Err(format!("Unsupported file type: {}", extension)),
    };
    println!("Detected MIME type: {}", mime_type);
    
    // Upload the file to Gemini
    println!("Uploading file to Gemini API...");
    let file_uri = match upload_file_to_gemini(&api_key, &media_path, mime_type).await {
        Ok(uri) => {
            println!("File uploaded successfully with URI: {}", uri);
            uri
        },
        Err(e) => {
            println!("File upload failed: {}", e);
            return Err(format!("Failed to upload file: {}", e));
        },
    };
    
    // Create the API request
    let temp = temperature.unwrap_or(1.0);
    
    let contents = vec![
        GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart::FileData {
                file_data: GeminiFileData {
                    file_uri,
                    mime_type: mime_type.to_string(),
                },
            }],
        },
        GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart::Text {
                text: prompt,
            }],
        },
    ];
    
    let system_instruction_obj = system_instruction.map(|instruction| {
        GeminiSystemInstruction {
            role: "user".to_string(),
            parts: vec![GeminiTextPart {
                text: instruction,
            }],
        }
    });
    
    let request = GeminiRequest {
        contents,
        system_instruction: system_instruction_obj,
        generation_config: GeminiGenerationConfig {
            temperature: temp,
            top_k: 40,
            top_p: 0.95,
            max_output_tokens: 1024,
            response_mime_type: "application/json".to_string(),
            response_schema: GeminiResponseSchema {
                schema_type: "object".to_string(),
                properties: GeminiProperties {
                    caption: GeminiCaption {
                        caption_type: "string".to_string(),
                    },
                },
            },
        },
    };
    
    // Send the request to Gemini
    println!("Creating HTTP client for Gemini API request...");
    let client = Client::builder()
        .timeout(Duration::from_secs(120)) // Longer timeout for video processing
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={}",
        api_key
    );
    
    println!("Sending caption generation request to Gemini API...");
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            println!("API request failed: {}", e);
            format!("API request failed: {}", e)
        })?;
    
    // Check if the request was successful
    if !response.status().is_success() {
        let status = response.status();
        println!("Received error status code: {}", status);
        
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        
        println!("Error response body: {}", error_text);
        
        // Check for specific Gemini error about file state
        if error_text.contains("not in an ACTIVE state") {
            println!("Detected 'not in an ACTIVE state' error");
            if is_retry {
                // If this is already a retry, give up
                println!("This was already a retry attempt, giving up");
                return Err("Failed to process file after retry. Please try again later.".to_string());
            } else {
                println!("Will retry with a fresh upload");
                return Err("The file needs to be re-uploaded. Please try again.".to_string());
            }
        }
        
        return Err(format!(
            "API request failed with status {}: {}",
            status, error_text
        ));
    }
    
    println!("Received successful response from Gemini API");
    
    // Parse the response
    println!("Parsing JSON response...");
    let response_body: GeminiResponse = response
        .json()
        .await
        .map_err(|e| {
            println!("Failed to parse Gemini API response as JSON: {}", e);
            format!("Failed to parse API response: {}. This might be a network/encoding issue or the API returned non-JSON data.", e)
        })?;
    
    // Extract the caption (JSON parsing)
    println!("Extracting caption from response...");
    if let Some(candidate) = response_body.candidates.first() {
        if let Some(part) = candidate.content.parts.first() {
            // Try to parse the JSON response to extract just the caption
            println!("Received text response: {}", part.text);
            match serde_json::from_str::<serde_json::Value>(&part.text) {
                Ok(json) => {
                    println!("Successfully parsed JSON response");
                    if let Some(caption) = json.get("caption").and_then(|c| c.as_str()) {
                        println!("Extracted caption: {}", caption);
                        return Ok(caption.to_string());
                    } else {
                        println!("No 'caption' field found in JSON, returning full text");
                        return Ok(part.text.clone()); // Return full text if can't extract caption
                    }
                },
                Err(e) => {
                    println!("Response is not valid JSON ({}), returning as plain text", e);
                    return Ok(part.text.clone()); // Not valid JSON, return as is
                }
            }
        } else {
            println!("No parts found in response");
        }
    } else {
        println!("No candidates found in response");
    }
    
    Err("No caption generated".to_string())
}

/// Generate captions for multiple media files using Gemini
#[tauri::command]
pub async fn generate_gemini_captions(
    api_key: String,
    prompt: String,
    media_paths: Vec<String>,
    system_instruction: Option<String>,
    temperature: Option<f32>,
) -> Result<Vec<(String, String)>, String> {
    let mut results = Vec::new();

    for path in media_paths {
        match generate_gemini_caption(
            api_key.clone(),
            prompt.clone(),
            path.clone(),
            system_instruction.clone(),
            temperature,
        )
        .await
        {
            Ok(caption) => results.push((path, caption)),
            Err(e) => results.push((path, format!("Error: {}", e))),
        }
    }

    Ok(results)
}
