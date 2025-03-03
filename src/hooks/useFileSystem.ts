import { useState, useCallback } from 'react';
import { join } from '@tauri-apps/api/path';
import { appDataDir } from '@tauri-apps/api/path';
import { 
  selectDirectory, 
  duplicateDirectory, 
  registerWorkingDirectory,
  listDirectoryFiles,
  readCaptionFile,
  writeCaptionFile,
  MediaFile,
  getAssetUrl,
  getCaptionPath,
  selectExportDirectory,
  exportDirectory
} from '../lib/fs';
import { getMediaThumbnail } from '../lib/media';

export interface UseFileSystemProps {
  workingDirName?: string;
}

export function useFileSystem({ workingDirName = 'spacecat-working' }: UseFileSystemProps = {}) {
  const [sourceDirectory, setSourceDirectory] = useState<string | null>(null);
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Select a source directory and create a working copy
   */
  const selectSourceDirectory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Select the source directory
      const selectedDir = await selectDirectory();
      setSourceDirectory(selectedDir);
      
      // Create the working directory path
      const appData = await appDataDir();
      const workingDir = await join(appData, workingDirName);
      
      // Create a duplicate of the source directory
      const duplicatedDir = await duplicateDirectory(selectedDir, workingDir);
      setWorkingDirectory(duplicatedDir);
      
      // Register the working directory as an asset scope
      await registerWorkingDirectory(duplicatedDir);
      
      // Load the media files
      const files = await listDirectoryFiles(duplicatedDir);
      setMediaFiles(files);
      
      return { sourceDirectory: selectedDir, workingDirectory: duplicatedDir, files };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [workingDirName]);

  /**
   * Load media files from the working directory
   */
  const loadMediaFiles = useCallback(async () => {
    if (!workingDirectory) {
      setError('No working directory selected');
      return [];
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const files = await listDirectoryFiles(workingDirectory);
      setMediaFiles(files);
      return files;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [workingDirectory]);

  /**
   * Read a caption file for a media file
   */
  const readCaption = useCallback(async (mediaFile: MediaFile) => {
    try {
      const captionPath = getCaptionPath(mediaFile.path);
      return await readCaptionFile(captionPath);
    } catch (err) {
      // If the file doesn't exist, return an empty string
      return '';
    }
  }, []);

  /**
   * Write a caption file for a media file
   */
  const writeCaption = useCallback(async (mediaFile: MediaFile, content: string) => {
    try {
      const captionPath = getCaptionPath(mediaFile.path);
      await writeCaptionFile(captionPath, content);
      
      // Update the media file in the state
      setMediaFiles(prev => 
        prev.map(f => f.id === mediaFile.id ? { ...f, has_caption: true } : f)
      );
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      return false;
    }
  }, []);

  /**
   * Update the selected state of a media file
   */
  const updateFileSelection = useCallback((fileId: string, selected: boolean, thumbnail?: string) => {
    setMediaFiles(prev => 
      prev.map(f => f.id === fileId ? { ...f, selected, thumbnail: thumbnail || f.thumbnail } : f)
    );
  }, []);

  /**
   * Get a thumbnail for a media file
   */
  const getThumbnail = useCallback(async (mediaFile: MediaFile, maxSize: number = 100) => {
    if (mediaFile.file_type !== 'image' && mediaFile.type !== 'image') {
      return null;
    }
    
    try {
      return await getMediaThumbnail(mediaFile.path, maxSize);
    } catch (err) {
      console.error('Failed to generate thumbnail:', err);
      return null;
    }
  }, []);

  /**
   * Get the asset URL for a media file
   */
  const getMediaUrl = useCallback((mediaFile: MediaFile) => {
    return getAssetUrl(mediaFile.path);
  }, []);

  /**
   * Export the current working directory
   * @param asZip Whether to export as a ZIP file
   * @returns Promise with the path to the exported directory or ZIP file
   */
  const exportWorkingDirectory = useCallback(async (asZip: boolean): Promise<string | null> => {
    if (!workingDirectory) {
      setError('No working directory to export');
      return null;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      // Select the export destination directory
      const exportDestination = await selectExportDirectory();
      
      // Export the working directory
      const exportedPath = await exportDirectory(workingDirectory, exportDestination, asZip);
      
      return exportedPath;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [workingDirectory]);

  return {
    sourceDirectory,
    workingDirectory,
    mediaFiles,
    isLoading,
    error,
    selectSourceDirectory,
    loadMediaFiles,
    readCaption,
    writeCaption,
    updateFileSelection,
    getThumbnail,
    getMediaUrl,
    exportWorkingDirectory
  };
} 