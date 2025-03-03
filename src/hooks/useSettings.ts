import { useState, useEffect, useCallback } from 'react';
import { AppSettings, DEFAULT_SETTINGS, loadSettings, saveSettings, updateSetting } from '@/lib/settings';
import { toast } from 'sonner';

/**
 * Custom hook for managing application settings
 * @returns Settings state and functions to update settings
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Load settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const storedSettings = await loadSettings();
        setSettings(storedSettings);
        setError(null);
      } catch (err) {
        console.error('Failed to load settings:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        toast.error('Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSettings();
  }, []);

  // Update all settings
  const updateSettings = useCallback(async (newSettings: AppSettings) => {
    try {
      setSettings(newSettings);
      await saveSettings(newSettings);
      return true;
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      toast.error('Failed to save settings');
      return false;
    }
  }, []);

  // Update a single setting
  const updateSingleSetting = useCallback(async <K extends keyof AppSettings>(
    key: K, 
    value: AppSettings[K]
  ) => {
    try {
      // Update local state immediately for responsive UI
      setSettings(current => ({ ...current, [key]: value }));
      
      // Update the store
      await updateSetting(key, value);
      return true;
    } catch (err) {
      console.error(`Failed to update setting ${String(key)}:`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
      toast.error(`Failed to update ${String(key)}`);
      return false;
    }
  }, []);

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    updateSingleSetting
  };
} 