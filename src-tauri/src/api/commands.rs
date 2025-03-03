use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::time::Duration;

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

/// Generate a caption for an image using OpenAI's API
#[tauri::command]
pub async fn generate_caption(
    api_url: String,
    api_key: String,
    prompt: String,
    image_path: String,
    model: String,
    image_detail: String,
    use_detail_parameter: bool,
) -> Result<String, String> {
    // Create a data URL from the image
    let image_data_url = match create_data_url_from_image(&image_path).await {
        Ok(url) => url,
        Err(e) => return Err(format!("Failed to create data URL: {}", e)),
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
                MessageContent::Text {
                    text: prompt,
                },
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
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("API request failed with status {}: {}", status, error_text));
    }

    // Parse the response
    let response_body: OpenAIResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

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

/// Generate captions for multiple images
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
        match generate_caption(
            api_url.clone(),
            api_key.clone(),
            prompt.clone(),
            path.clone(),
            model.clone(),
            image_detail.clone(),
            use_detail_parameter,
        ).await {
            Ok(caption) => results.push((path, caption)),
            Err(e) => results.push((path, format!("Error: {}", e))),
        }
    }

    Ok(results)
} 