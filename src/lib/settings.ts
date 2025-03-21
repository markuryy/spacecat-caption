import { LazyStore } from '@tauri-apps/plugin-store';

export type ImageDetailLevel = 'auto' | 'low' | 'high';
export type ApiProvider = 'openai' | 'gemini';

export interface AppSettings {
  // OpenAI settings
  apiUrl: string;
  apiKey: string;
  captionPrompt: string;
  model: string;
  imageDetail: ImageDetailLevel;
  useDetailParameter: boolean;
  
  // Gemini settings
  geminiApiKey: string;
  geminiModel: string;
  geminiSystemInstruction: string;
  
  // Provider selection
  preferredProvider: ApiProvider;
  useGeminiForVideos: boolean;
}

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
  // OpenAI defaults
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  captionPrompt: 'Describe this image in detail:',
  model: 'gpt-4o-2024-05-13',
  imageDetail: 'auto',
  useDetailParameter: true,
  
  // Gemini defaults
  geminiApiKey: '',
  geminiModel: 'gemini-2.0-flash',
  geminiSystemInstruction: 'You are an image and video captioner. Do not mention the medium (e.g. image, video) in the caption itself, simply describe it visually. Return only the caption in json format.',
  
  // Provider selection defaults
  preferredProvider: 'openai',
  useGeminiForVideos: true
};

// Create a lazy store for settings
const settingsStore = new LazyStore('settings.json');

/**
 * Load settings from the store
 * @returns Promise with the settings
 */
export async function loadSettings(): Promise<AppSettings> {
  try {
    // Initialize the store if it doesn't exist
    if (!(await settingsStore.has('settings'))) {
      await settingsStore.set('settings', DEFAULT_SETTINGS);
      await settingsStore.save();
    }
    
    // Get the settings
    const settings = await settingsStore.get<AppSettings>('settings');
    
    // Handle migration for existing settings without new fields
    let needsUpdate = false;
    
    if (settings && !('model' in settings)) {
      (settings as AppSettings).model = DEFAULT_SETTINGS.model;
      needsUpdate = true;
    }
    
    if (settings && !('imageDetail' in settings)) {
      (settings as AppSettings).imageDetail = DEFAULT_SETTINGS.imageDetail;
      needsUpdate = true;
    }
    
    if (settings && !('useDetailParameter' in settings)) {
      (settings as AppSettings).useDetailParameter = DEFAULT_SETTINGS.useDetailParameter;
      needsUpdate = true;
    }
    
    // Add Gemini settings if they don't exist
    if (settings && !('geminiApiKey' in settings)) {
      (settings as AppSettings).geminiApiKey = DEFAULT_SETTINGS.geminiApiKey;
      needsUpdate = true;
    }
    
    if (settings && !('geminiModel' in settings)) {
      (settings as AppSettings).geminiModel = DEFAULT_SETTINGS.geminiModel;
      needsUpdate = true;
    }
    
    if (settings && !('geminiSystemInstruction' in settings)) {
      (settings as AppSettings).geminiSystemInstruction = DEFAULT_SETTINGS.geminiSystemInstruction;
      needsUpdate = true;
    }
    
    if (settings && !('preferredProvider' in settings)) {
      (settings as AppSettings).preferredProvider = DEFAULT_SETTINGS.preferredProvider;
      needsUpdate = true;
    }
    
    if (settings && !('useGeminiForVideos' in settings)) {
      (settings as AppSettings).useGeminiForVideos = DEFAULT_SETTINGS.useGeminiForVideos;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await settingsStore.set('settings', settings);
      await settingsStore.save();
    }
    
    return settings || DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to the store
 * @param settings The settings to save
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await settingsStore.set('settings', settings);
    await settingsStore.save();
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}

/**
 * Update a single setting
 * @param key The setting key to update
 * @param value The new value
 */
export async function updateSetting<K extends keyof AppSettings>(
  key: K, 
  value: AppSettings[K]
): Promise<void> {
  try {
    const settings = await loadSettings();
    settings[key] = value;
    await saveSettings(settings);
  } catch (error) {
    console.error(`Failed to update setting ${key}:`, error);
    throw error;
  }
}
