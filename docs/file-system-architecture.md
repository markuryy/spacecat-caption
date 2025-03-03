# SpaceCat Caption - File System Architecture

## Overview

This document outlines the file system architecture for SpaceCat Caption, a desktop application built with Tauri 2 that allows users to manage, view, and edit media files (images, videos) and their associated captions.

## Core Requirements

- Select a working directory containing media files
- Duplicate the selected directory to create a working copy
- Serve media files (images/videos) to the frontend with low latency
- Read and write text files (captions)
- Edit media files (crop images, trim videos)
- Persist selected directories between application sessions

## Technology Stack

- **Frontend**: React with Vite
- **Backend**: Tauri 2 with Rust
- **File Operations**: Tauri File System Plugin
- **Media Serving**: Tauri Asset Scopes
- **Persistence**: Tauri Persisted Scope Plugin

## Architecture Components

### 1. Directory Selection & Management

The application uses the Tauri File System Plugin to:
- Select directories via native file dialogs
- Create duplicate working directories
- Manage file operations (read, write, copy, move, delete)

```rust
// Example: Directory selection
#[tauri::command]
async fn select_directory(app: tauri::AppHandle) -> Result<String, String> {
    let dialog = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .pick_folder();
    
    match dialog {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("No directory selected".into())
    }
}

// Example: Directory duplication
#[tauri::command]
async fn duplicate_directory(source: String, destination: String) -> Result<(), String> {
    match fs_extra::dir::copy(
        source,
        destination,
        &fs_extra::dir::CopyOptions::new()
    ) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string())
    }
}
```

### 2. Media File Serving

The application uses Tauri Asset Scopes to serve media files directly to the frontend:

- Asset scopes provide a secure bridge between the frontend and local files
- Files are accessed via the `asset://` protocol in the frontend
- This approach offers low latency and low memory overhead

```rust
// Example: Registering an asset scope for a selected directory
#[tauri::command]
async fn register_working_directory(app: tauri::AppHandle, path: String) -> Result<(), String> {
    match app.asset_protocol_scope().allow_directory("working-dir", &path, true) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string())
    }
}
```

In the frontend, media files are accessed directly:

```jsx
// Example: Displaying an image from the working directory
<img src={`asset://working-dir/${relativePath}`} alt="Media file" />

// Example: Displaying a video
<video controls>
  <source src={`asset://working-dir/${videoPath}`} type="video/mp4" />
</video>
```

### 3. Text File Operations

For caption files, the application uses direct file system operations:

```rust
// Example: Reading a caption file
#[tauri::command]
async fn read_caption_file(path: String) -> Result<String, String> {
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(e) => Err(e.to_string())
    }
}

// Example: Writing a caption file
#[tauri::command]
async fn write_caption_file(path: String, content: String) -> Result<(), String> {
    match std::fs::write(path, content) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string())
    }
}
```

### 4. Session Persistence

The Tauri Persisted Scope Plugin automatically saves and restores asset scopes between application sessions:

- No additional code required for persistence functionality
- Asset scopes are automatically restored when the application restarts
- Users don't need to reselect their working directory each time

```rust
// In the main.rs file
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        // ... other plugins and configuration
        .invoke_handler(tauri::generate_handler![
            select_directory,
            duplicate_directory,
            register_working_directory,
            read_caption_file,
            write_caption_file,
            // ... other commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Data Flow

1. **Initial Setup**:
   - User selects a directory containing media files
   - Application optionally creates a duplicate working directory
   - Selected directory is registered as an asset scope

2. **Media Browsing**:
   - Frontend requests media files via the `asset://` protocol
   - Tauri serves files directly from the filesystem
   - Low latency and memory overhead for efficient browsing

3. **Caption Editing**:
   - Application reads caption files using the File System Plugin
   - User edits captions in the frontend
   - Changes are written back to disk using the File System Plugin

4. **Session Management**:
   - Persisted Scope Plugin automatically saves asset scope configurations
   - When application restarts, scopes are restored
   - User can continue working with the same files without reconfiguration

## Permissions Configuration

The application requires the following permissions:

```json
{
  "permissions": [
    "fs:default",
    "fs:allow-read",
    "fs:allow-write",
    "fs:allow-create-dir",
    "fs:allow-remove-dir",
    "fs:allow-remove-file"
  ]
}
```

## Implementation Plan

1. **Setup Tauri with Required Plugins**:
   - Add File System plugin
   - Add Persisted Scope plugin
   - Configure appropriate permissions

2. **Implement Core File Operations**:
   - Directory selection
   - Directory duplication
   - Asset scope registration
   - File reading/writing

3. **Create Frontend Components**:
   - Media browser
   - Media viewer
   - Caption editor

4. **Implement Media Editing Features**:
   - Image cropping
   - Video trimming

5. **Testing and Optimization**:
   - Test with large directories
   - Optimize for performance
   - Ensure proper error handling

## Conclusion

This architecture provides a robust foundation for the SpaceCat Caption application, with:

- Direct file system access through the File System plugin
- Efficient media serving via asset scopes
- Simple text file editing with basic read/write commands
- Directory management for selecting and duplicating folders
- Session persistence through the Persisted Scope plugin

The design prioritizes simplicity, reliability, and performance, making it well-suited for a side project while still providing all necessary functionality. 