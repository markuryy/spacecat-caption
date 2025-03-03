import { LazyStore } from '@tauri-apps/plugin-store';

export type ImageDetailLevel = 'auto' | 'low' | 'high';

export interface AppSettings {
  apiUrl: string;
  apiKey: string;
  captionPrompt: string;
  model: string;
  imageDetail: ImageDetailLevel;
  useDetailParameter: boolean;
}

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  captionPrompt: 'Describe this image in detail:',
  model: 'gpt-4o-2024-05-13',
  imageDetail: 'auto',
  useDetailParameter: true
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
      settings.model = DEFAULT_SETTINGS.model;
      needsUpdate = true;
    }
    
    if (settings && !('imageDetail' in settings)) {
      settings.imageDetail = DEFAULT_SETTINGS.imageDetail;
      needsUpdate = true;
    }
    
    if (settings && !('useDetailParameter' in settings)) {
      settings.useDetailParameter = DEFAULT_SETTINGS.useDetailParameter;
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