import { invoke } from '@tauri-apps/api/core';
import { ImageDetailLevel } from './settings';

/**
 * Generate a caption for an image
 * @param apiUrl The API URL
 * @param apiKey The API key
 * @param prompt The caption prompt
 * @param imagePath The path to the image
 * @param model The model to use
 * @param imageDetail The image detail level
 * @param useDetailParameter Whether to include the detail parameter
 * @returns Promise with the generated caption
 */
export async function generateCaption(
  apiUrl: string,
  apiKey: string,
  prompt: string,
  imagePath: string,
  model: string,
  imageDetail: ImageDetailLevel,
  useDetailParameter: boolean
): Promise<string> {
  return invoke('generate_caption', { 
    apiUrl, 
    apiKey, 
    prompt, 
    imagePath, 
    model,
    imageDetail,
    useDetailParameter
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