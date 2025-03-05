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

/**
 * Save a cropped image to disk
 * @param path Path to the original image file
 * @param dataUrl Data URL containing the cropped image data
 * @returns Promise with the path to the saved cropped image
 */
export async function saveCroppedImage(path: string, dataUrl: string): Promise<string> {
  console.log('Calling save_cropped_image with path:', path);
  console.log('Data URL length:', dataUrl.length);
  try {
    const result = await invoke('save_cropped_image', { path, dataUrl });
    console.log('Success saving cropped image, result:', result);
    return result as string;
  } catch (error) {
    console.error('Error in saveCroppedImage:', error);
    throw error;
  }
}

/**
 * Crop a video using the specified crop parameters
 * @param path Path to the original video file
 * @param cropParams Crop parameters (x, y, width, height, rotation, flipH, flipV)
 * @returns Promise with the path to the saved cropped video
 */
export async function cropVideo(
  path: string, 
  cropParams: { 
    x: number; 
    y: number; 
    width: number; 
    height: number; 
    rotation: number; 
    flipH: boolean; 
    flipV: boolean 
  }
): Promise<string> {
  return invoke('crop_video', { path, cropParams });
}