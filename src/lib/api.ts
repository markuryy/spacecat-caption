import { invoke } from '@tauri-apps/api/core';
import { ImageDetailLevel } from './settings';

/**
 * Generate a caption for an image or video frame
 * @param apiUrl The API URL
 * @param apiKey The API key
 * @param prompt The caption prompt
 * @param mediaPath The path to the media file (image or video)
 * @param model The model to use
 * @param imageDetail The image detail level
 * @param useDetailParameter Whether to include the detail parameter
 * @param videoFrameUrl Optional data URL of a video frame to use instead of the media path
 * @returns Promise with the generated caption
 */
export async function generateCaption(
  apiUrl: string,
  apiKey: string,
  prompt: string,
  mediaPath: string,
  model: string,
  imageDetail: ImageDetailLevel,
  useDetailParameter: boolean,
  videoFrameUrl?: string
): Promise<string> {
  return invoke('generate_caption', { 
    apiUrl, 
    apiKey, 
    prompt, 
    imagePath: mediaPath, 
    model,
    imageDetail,
    useDetailParameter,
    videoFrameUrl
  });
}

/**
 * Generate captions for multiple images
 * @param apiUrl The API URL
 * @param apiKey The API key
 * @param prompt The caption prompt
 * @param imagePaths Array of paths to images
 * @param model The model to use
 * @param imageDetail The image detail level
 * @param useDetailParameter Whether to include the detail parameter
 * @returns Promise with array of [path, caption] tuples
 */
export async function generateCaptions(
  apiUrl: string,
  apiKey: string,
  prompt: string,
  imagePaths: string[],
  model: string,
  imageDetail: ImageDetailLevel,
  useDetailParameter: boolean
): Promise<[string, string][]> {
  return invoke('generate_captions', { 
    apiUrl, 
    apiKey, 
    prompt, 
    imagePaths, 
    model,
    imageDetail,
    useDetailParameter
  });
} 