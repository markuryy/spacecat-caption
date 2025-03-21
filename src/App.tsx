import { useState, useEffect, useCallback } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useFileSystem } from "@/hooks/useFileSystem";
import { useSettings } from "@/hooks/useSettings";
import { MediaFile } from "@/lib/fs";
import { 
  generateCaption, 
  generateCaptions, 
  generateGeminiCaption, 
  generateGeminiCaptions,
  generateCaptionWithPreferredProvider
} from "@/lib/api";

// Import components
import { AppHeader } from "@/components/AppHeader";
import { FileSidebar } from "@/components/FileSidebar";
import { MediaViewer } from "@/components/MediaViewer";
import { CaptionEditor } from "@/components/CaptionEditor";
import { EmptyState } from "@/components/EmptyState";

function App() {
  // Initialize hooks
  const {
    sourceDirectory,
    workingDirectory,
    mediaFiles,
    isLoading,
    selectSourceDirectory,
    loadExistingProject,
    readCaption,
    writeCaption,
    getThumbnail,
    getMediaUrl,
    updateFileSelection,
    exportWorkingDirectory,
    removeFile
  } = useFileSystem();
  
  const {
    settings,
    updateSingleSetting
  } = useSettings();

  // State
  const [currentFile, setCurrentFile] = useState<MediaFile | null>(null);
  const [caption, setCaption] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [captionModified, setCaptionModified] = useState<boolean>(false);
  const [loadingThumbnails, setLoadingThumbnails] = useState<boolean>(false);

  // Auto-save caption when modified (with debounce)
  useEffect(() => {
    if (!currentFile || !captionModified) return;
    
    const timer = setTimeout(() => {
      saveCaption();
      setCaptionModified(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [caption, captionModified]);

  // Load thumbnails for both image and video files
  useEffect(() => {
    if (mediaFiles.length === 0 || loadingThumbnails) return;
    
    const loadThumbnails = async () => {
      setLoadingThumbnails(true);
      
      // Process both image and video files that don't have thumbnails yet
      const filesToProcess = mediaFiles
        .filter(file => (
          ((file.type === 'video' || file.file_type === 'video') || 
           (file.type === 'image' || file.file_type === 'image')) && 
          !file.thumbnail
        ))
        .slice(0, 15); // Process in smaller batches to avoid overwhelming the system
      
      if (filesToProcess.length === 0) {
        setLoadingThumbnails(false);
        return;
      }
      
      // Process thumbnails in parallel
      await Promise.all(
        filesToProcess.map(async (file) => {
          try {
            const thumbnail = await getThumbnail(file);
            if (thumbnail) {
              // Update the file with the thumbnail
              updateFileSelection(file.id, file.selected || false, thumbnail);
            }
          } catch (err) {
            // Silent fail - no need to log every thumbnail generation error
          }
        })
      );
      
      setLoadingThumbnails(false);
    };
    
    loadThumbnails();
  }, [mediaFiles, loadingThumbnails, getThumbnail, updateFileSelection]);

  // Save caption function
  const saveCaption = useCallback(async () => {
    if (!currentFile) return;
    
    setIsSaving(true);
    
    try {
      await writeCaption(currentFile, caption);
      
      // Only show toast for manual saves
      if (captionModified === false) {
        toast("Caption saved", {
          description: `Caption saved for ${currentFile.name}`,
        });
      }
    } catch (err) {
      toast("Error", {
        description: `Failed to save caption: ${err}`
      });
    } finally {
      setIsSaving(false);
    }
  }, [currentFile, caption, captionModified, writeCaption]);

  // Handle file selection
  const handleFileSelect = async (file: MediaFile) => {
    // Auto-save current caption if needed
    if (currentFile && captionModified) {
      await writeCaption(currentFile, caption);
      setCaptionModified(false);
    }
    
    // Set the new current file
    setCurrentFile(file);
    
    // Load caption if it exists
    if (file.has_caption) {
      const captionText = await readCaption(file);
      setCaption(captionText);
    } else {
      setCaption('');
    }
  };

  // Handle caption change
  const handleCaptionChange = (value: string) => {
    setCaption(value);
    setCaptionModified(true);
  };

  // Handle generating captions for selected files
  const handleGenerateCaptions = () => {
    const selectedFiles = mediaFiles.filter(f => f.selected);
    if (selectedFiles.length === 0) {
      toast("No files selected", {
        description: "Please select at least one file to generate captions.",
      });
      return;
    }
    
    setIsProcessing(true);
    
    // Get the paths of the selected files
    const mediaPaths = selectedFiles.map(file => file.path);
    
    // Determine which API to use based on settings
    const useGemini = settings.preferredProvider === 'gemini';
    const modelName = useGemini ? settings.geminiModel : settings.model;
    
    // Call the appropriate API to generate captions
    const captionPromise = useGemini
      ? generateGeminiCaptions(
          settings.geminiApiKey,
          settings.captionPrompt,
          mediaPaths,
          settings.geminiSystemInstruction
        )
      : generateCaptions(
          settings.apiUrl,
          settings.apiKey,
          settings.captionPrompt,
          mediaPaths,
          settings.model,
          settings.imageDetail,
          settings.useDetailParameter
        );
    
    toast.promise(
      captionPromise,
      {
        loading: `Generating captions for ${selectedFiles.length} files using ${modelName}...`,
        success: (results) => {
          // Update the captions for each file
          results.forEach(([path, caption]) => {
            const file = mediaFiles.find(f => f.path === path);
            if (file) {
              writeCaption(file, caption)
                .catch(err => console.error(`Failed to save caption for ${file.name}:`, err));
            }
          });
          
          // If the current file was one of the selected files, update its caption
          if (currentFile && selectedFiles.some(f => f.id === currentFile.id)) {
            const result = results.find(([path]) => path === currentFile.path);
            if (result) {
              setCaption(result[1]);
              setCaptionModified(true);
            }
          }
          
          setIsProcessing(false);
          return `Generated captions for ${results.length} files`;
        },
        error: (err) => {
          setIsProcessing(false);
          return `Failed to generate captions: ${err}`;
        }
      }
    );
  };

  // Handle navigation
  const handleNavigate = async (direction: 'prev' | 'next') => {
    if (!currentFile || mediaFiles.length === 0) return;
    
    // Auto-save current caption if needed
    if (captionModified) {
      await writeCaption(currentFile, caption);
      setCaptionModified(false);
    }
    
    const currentIndex = mediaFiles.findIndex(f => f.id === currentFile.id);
    let newIndex;
    
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : mediaFiles.length - 1;
    } else {
      newIndex = currentIndex < mediaFiles.length - 1 ? currentIndex + 1 : 0;
    }
    
    const newFile = mediaFiles[newIndex];
    setCurrentFile(newFile);
    
    // Load caption if it exists
    if (newFile.has_caption) {
      const captionText = await readCaption(newFile);
      setCaption(captionText);
    } else {
      setCaption('');
    }
  };
  
  // Handle file update from media editors (crop/trim)
  const handleFileUpdate = useCallback(async (oldFile: MediaFile, _newPath: string) => {
    try {
      // Since we're now overwriting the original file, we don't need to change the path
      // However, we do need to refresh the file's thumbnail
      
      // Create an updated file object with the same path but refreshed
      const updatedFile = {
        ...oldFile,
        // We'll update the timestamp to force a refresh of the thumbnail
        refreshToken: Date.now()
      };
      
      // If this is the current file, update it
      if (currentFile && currentFile.id === oldFile.id) {
        setCurrentFile(updatedFile);
      }
      
      // Update the file in the mediaFiles array to trigger thumbnail refresh
      updateFileSelection(updatedFile.id, updatedFile.selected || false);
      
      // Get a new thumbnail for the file
      try {
        const newThumbnail = await getThumbnail(updatedFile);
        if (newThumbnail) {
          // Update the file with the new thumbnail
          updateFileSelection(updatedFile.id, updatedFile.selected || false, newThumbnail);
        }
      } catch (err) {
        console.warn("Could not refresh thumbnail after editing", err);
      }
      
      toast.success("File updated successfully");
    } catch (error) {
      toast.error("Failed to update file");
      console.error("Error updating file:", error);
    }
  }, [currentFile, mediaFiles, updateFileSelection, getThumbnail]);
  
  // Handle file removal
  const handleRemoveFile = useCallback(async (file: MediaFile) => {
    if (!file) return;
    
    try {
      // Show confirmation toast
      toast.promise(
        (async () => {
          // Delete the file
          const success = await removeFile(file);
          if (!success) throw new Error("Failed to delete file");
          
          // If this was the current file, navigate to another file or clear current file
          if (currentFile && currentFile.id === file.id) {
            // Find the next file to show
            if (mediaFiles.length > 1) {
              const currentIndex = mediaFiles.findIndex(f => f.id === file.id);
              const nextIndex = currentIndex < mediaFiles.length - 1 ? currentIndex + 1 : currentIndex - 1;
              
              if (nextIndex >= 0) {
                // Navigate to the next file
                await handleFileSelect(mediaFiles[nextIndex]);
              } else {
                // No more files, clear current file
                setCurrentFile(null);
                setCaption('');
              }
            } else {
              // This was the only file, clear current file
              setCurrentFile(null);
              setCaption('');
            }
          }
          
          return file.name;
        })(),
        {
          loading: "Deleting file...",
          success: (filename) => `Deleted ${filename}`,
          error: (error) => `Failed to delete file: ${error}`
        }
      );
    } catch (error) {
      console.error("Error removing file:", error);
    }
  }, [currentFile, mediaFiles, removeFile, handleFileSelect]);

  // Generate caption for current file
  const handleGenerateCurrentCaption = (currentVideoTime?: number) => {
    if (!currentFile) return;
    
    setIsProcessing(true);
    
    const captionProcess = async () => {
      let videoFrameUrl: string | undefined;
      const isVideo = currentFile.type === 'video' || currentFile.file_type === 'video';
      
      // If it's a video and we're using OpenAI, extract the current frame
      if (isVideo && (!settings.useGeminiForVideos || settings.preferredProvider === 'openai')) {
        try {
          // If a specific time was provided, use that, otherwise use the default first frame
          const time = typeof currentVideoTime === 'number' ? currentVideoTime : undefined;
          videoFrameUrl = await import('./lib/media').then(
            module => module.extractVideoFrame(currentFile.path, time)
          );
        } catch (error) {
          console.error("Failed to extract video frame:", error);
          // Continue without the frame if extraction fails
        }
      }
      
      // Call the API to generate a caption using the preferred provider
      return generateCaptionWithPreferredProvider(
        currentFile.path,
        settings,
        isVideo,
        videoFrameUrl
      );
    };
    
    // Determine which model to show in the loading message
    const modelName = settings.preferredProvider === 'gemini' || 
                     (settings.useGeminiForVideos && 
                      (currentFile.type === 'video' || currentFile.file_type === 'video'))
                     ? settings.geminiModel
                     : settings.model;
    
    toast.promise(
      captionProcess(),
      {
        loading: `Generating caption using ${modelName}...`,
        success: (caption) => {
          setCaption(caption);
          setCaptionModified(true);
          setIsProcessing(false);
          return "Caption generated successfully";
        },
        error: (err) => {
          setIsProcessing(false);
          return `Failed to generate caption: ${err}`;
        }
      }
    );
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if inside input or textarea
      if (
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      
      // Navigation
      if (e.key === 'ArrowLeft' && e.shiftKey) {
        handleNavigate('prev');
      } else if (e.key === 'ArrowRight' && e.shiftKey) {
        handleNavigate('next');
      } 
      // Generate caption
      else if (e.key === 'g' && e.shiftKey) {
        handleGenerateCurrentCaption();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFile, captionModified]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <AppHeader
        settings={settings}
        updateSingleSetting={updateSingleSetting}
        workingDirectory={workingDirectory}
        exportWorkingDirectory={exportWorkingDirectory}
      />
      
      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <FileSidebar
          sourceDirectory={sourceDirectory}
          workingDirectory={workingDirectory}
          mediaFiles={mediaFiles}
          isLoading={isLoading}
          currentFile={currentFile}
          isProcessing={isProcessing}
          selectSourceDirectory={selectSourceDirectory}
          loadExistingProject={loadExistingProject}
          handleFileSelect={handleFileSelect}
          updateFileSelection={updateFileSelection}
          handleGenerateCaptions={handleGenerateCaptions}
        />
        
        {/* Main content area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {currentFile ? (
            <>
              {/* Media viewer */}
              <MediaViewer
                currentFile={currentFile}
                getMediaUrl={getMediaUrl}
                handleNavigate={handleNavigate}
              />
              
              {/* Caption editor */}
              <CaptionEditor
                currentFile={currentFile}
                caption={caption}
                isSaving={isSaving}
                captionModified={captionModified}
                isProcessing={isProcessing}
                mediaFiles={mediaFiles}
                handleCaptionChange={handleCaptionChange}
                saveCaption={saveCaption}
                handleGenerateCurrentCaption={handleGenerateCurrentCaption}
                handleFileUpdate={handleFileUpdate}
                handleRemoveFile={handleRemoveFile}
              />
            </>
          ) : (
            <EmptyState workingDirectory={workingDirectory} />
          )}
        </div>
      </div>
      
      <Toaster />
    </div>
  );
}

export default App;
