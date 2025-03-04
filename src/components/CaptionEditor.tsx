import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw } from "lucide-react";
import { MediaFile } from "@/lib/fs";
import { Badge } from "@/components/ui/badge";

interface CaptionEditorProps {
  currentFile: MediaFile | null;
  caption: string;
  isSaving: boolean;
  captionModified: boolean;
  isProcessing: boolean;
  mediaFiles: MediaFile[];
  handleCaptionChange: (value: string) => void;
  saveCaption: () => Promise<void>;
  handleGenerateCurrentCaption: () => void;
}

export function CaptionEditor({
  currentFile,
  caption,
  isSaving,
  captionModified,
  isProcessing,
  mediaFiles,
  handleCaptionChange,
  handleGenerateCurrentCaption
}: CaptionEditorProps) {
  // Get current file index for pagination display
  const currentFileIndex = currentFile 
    ? mediaFiles.findIndex(f => f.id === currentFile.id) + 1 
    : 0;
  
  // Function to shorten long filenames by replacing middle characters with "..."
  const shortenFileName = (fileName: string, maxLength: number = 30) => {
    if (fileName.length <= maxLength) return fileName;
    
    const extensionMatch = fileName.match(/\.[^.]+$/);
    const extension = extensionMatch ? extensionMatch[0] : '';
    const nameWithoutExtension = extension ? fileName.slice(0, -extension.length) : fileName;
    
    if (nameWithoutExtension.length <= maxLength - extension.length) return fileName;
    
    // Calculate how many characters to keep at the beginning and end
    const charsToKeep = Math.floor((maxLength - 3) / 2); // 3 is for "..."
    const start = nameWithoutExtension.slice(0, charsToKeep);
    const end = nameWithoutExtension.slice(-charsToKeep);
    
    return `${start}...${end}${extension}`;
  };
    
  return (
    <div className="p-4 border-t border-border">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentFile && (
              <span className="text-sm font-medium">
                {shortenFileName(currentFile.name)}
                <Badge className="ml-2">
                  {currentFileIndex} / {mediaFiles.length}
                </Badge>
              </span>
            )}
            {isSaving && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            {captionModified && !isSaving && (
              <span className="text-xs text-muted-foreground">
                Modified
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* TODO: Add trim (conditional, video only), crop (image and video), and delete (image and video plus corresponding caption) here */}            
            <Button 
              variant="default" 
              size="sm" 
              className="h-8"
              onClick={handleGenerateCurrentCaption}
              disabled={isProcessing || !currentFile}
            >
              {isProcessing && (
                <RefreshCw className="h-3 w-3 animate-spin" />
              )}
              Generate
            </Button>
          </div>
        </div>
        
        <Textarea 
          id="caption" 
          value={caption} 
          onChange={(e) => handleCaptionChange(e.target.value)}
          placeholder="Enter a caption for this media file..."
          className="min-h-[100px] resize-none"
          disabled={!currentFile}
        />
        
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{caption.length} characters</span>
          <div className="flex gap-4">
            <span>Shift+← Shift+→: Navigate</span>
            <span>Shift+G: Generate caption</span>
          </div>
        </div>
      </div>
    </div>
  );
}