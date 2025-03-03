import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

export interface MediaFile {
  id: string;
  name: string;
  path: string;
  relative_path: string;
  file_type: string;
  has_caption: boolean;
  // Additional frontend properties
  type?: 'image' | 'video';
  selected?: boolean;
  thumbnail?: string;
}

/**
 * Select a directory using the native file dialog
 * @returns Promise with the selected directory path
 */
export async function selectDirectory(): Promise<string> {
  return invoke('select_directory');
}

/**
 * Duplicate a directory to create a working copy
 * @param source Source directory path
 * @param destination Destination directory path
 * @returns Promise with the destination path
 */
export async function duplicateDirectory(source: string, destination: string): Promise<string> {
  return invoke('duplicate_directory', { source, destination });
}

/**
 * Register a directory as an asset scope for direct media access
 * @param path Directory path to register
 * @returns Promise that resolves when the directory is registered
 */
export async function registerWorkingDirectory(path: string): Promise<void> {
  return invoke('register_working_directory', { path });
}

/**
 * Read a caption file
 * @param path Path to the caption file
 * @returns Promise with the caption content
 */
export async function readCaptionFile(path: string): Promise<string> {
  return invoke('read_caption_file', { path });
}

/**
 * Write content to a caption file
 * @param path Path to the caption file
 * @param content Content to write
 * @returns Promise that resolves when the file is written
 */
export async function writeCaptionFile(path: string, content: string): Promise<void> {
  return invoke('write_caption_file', { path, content });
}

/**
 * List all media files in a directory
 * @param directory Directory path to list
 * @returns Promise with an array of media files
 */
export async function listDirectoryFiles(directory: string): Promise<MediaFile[]> {
  const files: MediaFile[] = await invoke('list_directory_files', { directory });
  
  // Add frontend-specific properties
  return files.map(file => ({
    ...file,
    type: file.file_type === 'image' ? 'image' : 'video',
    selected: false,
    thumbnail: undefined
  }));
}

/**
 * Get the asset URL for a media file
 * @param relativePath Relative path to the media file
 * @returns Asset URL
 */
export function getAssetUrl(relativePath: string): string {
  return convertFileSrc(relativePath);
}

/**
 * Get the caption file path for a media file
 * @param mediaPath Path to the media file
 * @returns Path to the caption file
 */
export function getCaptionPath(mediaPath: string): string {
  return mediaPath.replace(/\.[^.]+$/, '.txt');
}

/**
 * Select a directory for exporting files
 * @returns Promise with the selected directory path
 */
export async function selectExportDirectory(): Promise<string> {
  return invoke('select_export_directory');
}

/**
 * Export the working directory to a destination
 * @param sourceDir Source directory path
 * @param destinationDir Destination directory path
 * @param asZip Whether to export as a ZIP file
 * @returns Promise with the path to the exported directory or ZIP file
 */
export async function exportDirectory(
  sourceDir: string,
  destinationDir: string,
  asZip: boolean
): Promise<string> {
  return invoke('export_directory', { sourceDir, destinationDir, asZip });
}
