import { invoke } from '@tauri-apps/api/core';
import { ApiProvider, ImageDetailLevel } from './settings';

/**
 * Generate a caption for an image or video frame using OpenAI
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
 * Generate a caption for an image or video using Google's Gemini API
 * @param apiKey The Gemini API key
 * @param prompt The caption prompt
 * @param mediaPath The path to the media file (image or video)
 * @param systemInstruction Optional system instruction
 * @param temperature Optional temperature parameter
 * @returns Promise with the generated caption
 */
export async function generateGeminiCaption(
  apiKey: string,
  prompt: string,
  mediaPath: string,
  systemInstruction?: string,
  temperature?: number
): Promise<string> {
  return invoke('generate_gemini_caption', {
    apiKey,
    prompt,
    mediaPath,
    systemInstruction,
    temperature
  });
}

/**
 * Generate captions for multiple images using OpenAI
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

/**
 * Generate captions for multiple media files using Gemini
 * @param apiKey The Gemini API key
 * @param prompt The caption prompt
 * @param mediaPaths Array of paths to media files
 * @param systemInstruction Optional system instruction
 * @param temperature Optional temperature parameter
 * @returns Promise with array of [path, caption] tuples
 */
export async function generateGeminiCaptions(
  apiKey: string,
  prompt: string,
  mediaPaths: string[],
  systemInstruction?: string,
  temperature?: number
): Promise<[string, string][]> {
  return invoke('generate_gemini_captions', {
    apiKey,
    prompt,
    mediaPaths,
    systemInstruction,
    temperature
  });
}

/**
 * Generate a caption for a media file using the preferred provider
 * @param mediaPath The path to the media file
 * @param settings The application settings
 * @param isVideo Whether the media is a video
 * @param videoFrameUrl Optional data URL of a video frame (for OpenAI)
 * @returns Promise with the generated caption
 */
export async function generateCaptionWithPreferredProvider(
  mediaPath: string,
  settings: any,
  isVideo: boolean = false,
  videoFrameUrl?: string
): Promise<string> {
  // Determine which provider to use
  const useGemini = isVideo && settings.useGeminiForVideos 
    ? true 
    : settings.preferredProvider === 'gemini';
  
  if (useGemini) {
    return generateGeminiCaption(
      settings.geminiApiKey,
      settings.captionPrompt,
      mediaPath,
      settings.geminiSystemInstruction
    );
  } else {
    return generateCaption(
      settings.apiUrl,
      settings.apiKey,
      settings.captionPrompt,
      mediaPath,
      settings.model,
      settings.imageDetail,
      settings.useDetailParameter,
      videoFrameUrl
    );
  }
}
