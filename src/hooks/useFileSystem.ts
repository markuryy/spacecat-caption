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
  exportDirectory,
  deleteMediaFile
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
      
      // Load the media files first without thumbnails
      const files = await listDirectoryFiles(duplicatedDir);
      
      // Show files immediately without waiting for thumbnails
      setMediaFiles(files);
      
      // Start thumbnail generation in the background
      generateThumbnails(files);
      
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
   * Generate thumbnails for both image and video files in the background
   */
  const generateThumbnails = useCallback(async (files: MediaFile[]) => {
    // Process both image and video files
    const mediaFiles = files.filter(file => 
      (file.type === 'video' || file.file_type === 'video') ||
      (file.type === 'image' || file.file_type === 'image')
    );
    
    if (mediaFiles.length === 0) return;
    
    // Process thumbnails in smaller batches
    const batchSize = 5;
    const total = mediaFiles.length;
    
    for (let i = 0; i < total; i += batchSize) {
      const batch = mediaFiles.slice(i, i + batchSize);
      
      // Process each batch concurrently
      await Promise.all(
        batch.map(async (file) => {
          try {
            // Generate thumbnail for both images and videos
            const thumbnail = await getMediaThumbnail(file.path, 100);
            
            // Update just this file in the state
            setMediaFiles(prevFiles => 
              prevFiles.map(f => 
                f.id === file.id ? { ...f, thumbnail } : f
              )
            );
          } catch (err) {
            // Silent fail - no logging needed
          }
        })
      );
    }
  }, []);

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
      
      // Show files immediately without waiting for thumbnails
      setMediaFiles(files);
      
      // Start thumbnail generation in the background
      generateThumbnails(files);
      
      return files;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [workingDirectory, generateThumbnails]);

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
    try {
      // Add a cache-busting timestamp to the path to ensure we get a fresh thumbnail
      const timestamp = mediaFile.refreshToken || Date.now();
      const pathWithTimestamp = `${mediaFile.path}?t=${timestamp}`;
      
      return await getMediaThumbnail(pathWithTimestamp, maxSize);
    } catch (err) {
      console.error('Failed to generate thumbnail:', err);
      return null;
    }
  }, []);

  /**
   * Get the asset URL for a media file
   */
  const getMediaUrl = useCallback((mediaFile: MediaFile) => {
    // Add a cache-busting parameter if the media file has a refreshToken
    const url = getAssetUrl(mediaFile.path);
    if (mediaFile.refreshToken) {
      return `${url}?t=${mediaFile.refreshToken}`;
    }
    return url;
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

  /**
   * Remove a media file and its caption
   * @param mediaFile The media file to remove
   * @returns Promise that resolves when the file is deleted
   */
  const removeFile = useCallback(async (mediaFile: MediaFile): Promise<boolean> => {
    try {
      // Delete the file
      await deleteMediaFile(mediaFile.path);
      
      // Update the state to remove the deleted file
      setMediaFiles(prev => prev.filter(f => f.id !== mediaFile.id));
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      return false;
    }
  }, []);

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
    exportWorkingDirectory,
    generateThumbnails,
    removeFile
  };
} 