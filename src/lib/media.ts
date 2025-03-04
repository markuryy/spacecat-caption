import { invoke } from '@tauri-apps/api/core';

/**
 * Generate a thumbnail for an image or video file
 * @param path Path to the media file (image or video)
 * @param maxSize Maximum size of the thumbnail (width or height)
 * @returns Promise with the thumbnail as a data URL
 */
export async function getMediaThumbnail(path: string, maxSize: number = 100): Promise<string> {
  return invoke('get_media_thumbnail', { path, maxSize });
} 