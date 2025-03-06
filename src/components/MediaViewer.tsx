import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { MediaFile } from "@/lib/fs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useHotkeys } from "react-hotkeys-hook";

interface MediaViewerProps {
  currentFile: MediaFile | null;
  getMediaUrl: (file: MediaFile) => string;
  handleNavigate: (direction: 'prev' | 'next') => void;
}

export function MediaViewer({ 
  currentFile, 
  getMediaUrl,
  handleNavigate
}: MediaViewerProps) {
  // Add a timestamp parameter to force refreshing the image
  const [mediaTimestamp, setMediaTimestamp] = useState<number>(Date.now());
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  
  // Update the timestamp whenever the current file changes
  useEffect(() => {
    setMediaTimestamp(Date.now());
  }, [currentFile, currentFile?.refreshToken]); // refreshToken was added in the App component
  
  // Create a URL with a cache-busting parameter
  const getMediaUrlWithTimestamp = (file: MediaFile) => {
    const url = getMediaUrl(file);
    // For assets, add a timestamp query parameter to prevent caching
    if (url.startsWith('asset://')) {
      return `${url}?t=${mediaTimestamp}`;
    }
    return url;
  };

  const openSpotlight = () => {
    setSpotlightOpen(true);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
      {currentFile && (
        <>
          <div 
            className="relative h-[calc(100vh-20rem)] flex items-center justify-center bg-background rounded-md cursor-pointer"
            onClick={openSpotlight}
          >
            {currentFile.type === 'image' || currentFile.file_type === 'image' ? (
              <img 
                src={getMediaUrlWithTimestamp(currentFile)} 
                alt={currentFile.name}
                className="max-w-full max-h-full object-contain rounded-md"
                key={`img-${currentFile.id}-${mediaTimestamp}`} // Key change forces re-render
              />
            ) : (
              <video 
                src={getMediaUrlWithTimestamp(currentFile)} 
                controls 
                className="max-w-full max-h-full object-contain rounded-md"
                key={`video-${currentFile.id}-${mediaTimestamp}`} // Key change forces re-render
                onClick={(e) => e.stopPropagation()} // Prevent spotlight from opening when clicking video controls
              />
            )}
          </div>
          
          {/* Navigation buttons */}
          <Button 
            variant="secondary" 
            size="icon"
            className="absolute left-6 top-1/2 transform -translate-y-1/2 opacity-70"
            onClick={() => handleNavigate('prev')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Button 
            variant="secondary" 
            size="icon"
            className="absolute right-6 top-1/2 transform -translate-y-1/2 opacity-70"
            onClick={() => handleNavigate('next')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Spotlight Component */}
          <Spotlight 
            isOpen={spotlightOpen}
            onClose={() => setSpotlightOpen(false)}
            currentFile={currentFile}
            getMediaUrlWithTimestamp={getMediaUrlWithTimestamp}
            mediaTimestamp={mediaTimestamp}
            handleNavigate={handleNavigate}
          />
        </>
      )}
    </div>
  );
}

interface SpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  currentFile: MediaFile;
  getMediaUrlWithTimestamp: (file: MediaFile) => string;
  mediaTimestamp: number;
  handleNavigate: (direction: 'prev' | 'next') => void;
}

function Spotlight({ 
  isOpen, 
  onClose, 
  currentFile, 
  getMediaUrlWithTimestamp,
  mediaTimestamp,
  handleNavigate 
}: SpotlightProps) {
  // Add keyboard shortcuts for the spotlight
  useHotkeys('esc', onClose, { enabled: isOpen });
  useHotkeys('left', () => handleNavigate('prev'), { enabled: isOpen });
  useHotkeys('right', () => handleNavigate('next'), { enabled: isOpen });
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0 border-none bg-black/95 flex items-center justify-center"
        onPointerDownOutside={onClose}
        onEscapeKeyDown={onClose}
      >
        <div 
          className="relative w-full h-full flex items-center justify-center overflow-hidden"
          onClick={onClose} // Click anywhere to close
        >
          {(currentFile.type === 'image' || currentFile.file_type === 'image') ? (
            <img 
              src={getMediaUrlWithTimestamp(currentFile)} 
              alt={currentFile.name}
              className="max-w-[90%] max-h-[90%] object-contain"
              key={`spotlight-img-${currentFile.id}-${mediaTimestamp}`}
              onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image
            />
          ) : (
            <video 
              src={getMediaUrlWithTimestamp(currentFile)} 
              controls 
              className="max-w-[90%] max-h-[90%] object-contain"
              key={`spotlight-video-${currentFile.id}-${mediaTimestamp}`}
              onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the video
            />
          )}

          {/* Close button */}
          <Button 
            variant="ghost" 
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-black/20"
            onClick={onClose}
          >
            <X className="h-6 w-6" />
          </Button>
          
          {/* Navigation buttons */}
          <Button 
            variant="ghost" 
            size="icon"
            className="absolute left-6 top-1/2 transform -translate-y-1/2 text-white hover:bg-black/20"
            onClick={(e) => {
              e.stopPropagation();
              handleNavigate('prev');
            }}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon"
            className="absolute right-6 top-1/2 transform -translate-y-1/2 text-white hover:bg-black/20"
            onClick={(e) => {
              e.stopPropagation();
              handleNavigate('next');
            }}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}