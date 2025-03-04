import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaFile } from "@/lib/fs";

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

  return (
    <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
      {currentFile && (
        <>
          <div className="relative  h-[calc(100vh-20rem)] flex items-center justify-center bg-background rounded-md">
            {currentFile.type === 'image' || currentFile.file_type === 'image' ? (
              <img 
                src={getMediaUrl(currentFile)} 
                alt={currentFile.name}
                className="max-w-full max-h-full object-contain rounded-md"
              />
            ) : (
              <video 
                src={getMediaUrl(currentFile)} 
                controls 
                className="max-w-full max-h-full object-contain rounded-md"
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
        </>
      )}
    </div>
  );
}