import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, FileText, RefreshCw, ImageIcon, Video, Wand2 } from "lucide-react";
import { MediaFile } from "@/lib/fs";
import { toast } from "sonner";

interface FileSidebarProps {
  sourceDirectory: string | null;
  workingDirectory: string | null;
  mediaFiles: MediaFile[];
  isLoading: boolean;
  currentFile: MediaFile | null;
  isProcessing: boolean;
  selectSourceDirectory: () => Promise<{
    sourceDirectory: string;
    workingDirectory: string;
    files: MediaFile[];
  }>;
  handleFileSelect: (file: MediaFile) => void;
  updateFileSelection: (fileId: string, selected: boolean) => void;
  handleGenerateCaptions: () => void;
}

export function FileSidebar({
  sourceDirectory,
  workingDirectory,
  mediaFiles,
  isLoading,
  currentFile,
  isProcessing,
  selectSourceDirectory,
  handleFileSelect,
  updateFileSelection,
  handleGenerateCaptions
}: FileSidebarProps) {
  const [fileFilter, setFileFilter] = useState<'all' | 'captioned' | 'uncaptioned'>('all');

  // Handle directory selection
  const handleSelectDirectory = async () => {
    try {
      toast.promise(
        selectSourceDirectory(),
        {
          loading: 'Selecting directory...',
          success: (result) => `Loaded ${result.files.length} media files from ${result.sourceDirectory}`,
          error: (err) => `Failed to load directory: ${err}`
        }
      );
    } catch (err) {
      // Error is handled by toast.promise
    }
  };

  // Handle checkbox selection
  const handleCheckboxChange = (file: MediaFile, checked: boolean) => {
    updateFileSelection(file.id, checked);
  };

  // Filter files based on the current tab
  const filteredFiles = mediaFiles.filter(file => {
    if (fileFilter === 'all') return true;
    if (fileFilter === 'captioned') return file.has_caption;
    if (fileFilter === 'uncaptioned') return !file.has_caption;
    return true;
  });

  return (
    <div className="w-80 border-r border-border flex flex-col h-full">
      {/* Directory selection */}
      {!workingDirectory ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <Button 
            onClick={handleSelectDirectory} 
            className="flex items-center gap-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            {isLoading ? 'Loading...' : 'Select Directory'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col h-full">
          {/* Directory info */}
          <div className="px-4 py-2 border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                <span className="text-sm font-medium truncate">{sourceDirectory?.split('/').pop()}</span>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleSelectDirectory}
                disabled={isLoading}
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          
          {/* File tabs */}
          <Tabs defaultValue="all" className="flex flex-col h-[calc(100%-64px)]" onValueChange={(v) => setFileFilter(v as any)}>
            <div className="px-2">
              <TabsList className="w-full flex">
                <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                <TabsTrigger value="uncaptioned" className="flex-1">Uncaptioned</TabsTrigger>
                <TabsTrigger value="captioned" className="flex-1">Captioned</TabsTrigger>
              </TabsList>
            </div>
            
            {/* File list container */}
            <div className="flex flex-col h-[calc(100%-48px)]">
              {/* Scrollable file list */}
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full pr-2">
                  <div className="p-2">
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center h-40">
                        <RefreshCw className="h-8 w-8 mb-2 animate-spin text-primary" />
                        <p>Loading files...</p>
                      </div>
                    ) : filteredFiles.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                        <FileText className="h-8 w-8 mb-2" />
                        <p>No files found</p>
                      </div>
                    ) : (
                      filteredFiles.map((file) => (
                        <div 
                          key={file.id}
                          className={`flex items-center gap-2 p-2 rounded-md cursor-pointer ${
                            currentFile?.id === file.id ? 'bg-secondary/40' : 'hover:bg-secondary/20'
                          }`}
                          onClick={() => handleFileSelect(file)}
                        >
                          <Checkbox 
                            checked={file.selected} 
                            onCheckedChange={(checked) => {
                              handleCheckboxChange(file, checked as boolean);
                              // Prevent the click from selecting the file
                              event?.stopPropagation();
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          
                          <div className="h-12 w-12 rounded overflow-hidden flex-shrink-0 bg-white flex items-center justify-center">
                            {file.thumbnail ? (
                              <img 
                                src={file.thumbnail} 
                                alt={file.name} 
                                className="h-full w-full object-cover"
                              />
                            ) : file.type === 'image' || file.file_type === 'image' ? (
                              <ImageIcon className="h-6 w-6 text-muted-foreground" />
                            ) : (
                              <Video className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              {file.type === 'image' || file.file_type === 'image' ? (
                                <ImageIcon className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <Video className="h-3 w-3 text-muted-foreground" />
                              )}
                              <p className="text-sm truncate">{file.name}</p>
                            </div>
                            {file.has_caption && (
                              <p className="text-xs text-muted-foreground truncate">
                                Has caption
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
              
              {/* Generate button - Fixed at the bottom */}
              <div className="p-4 pb-0 border-t border-border sticky bg-background">
                <Button 
                  className="w-full flex items-center gap-2"
                  onClick={handleGenerateCaptions}
                  disabled={isProcessing || mediaFiles.filter(f => f.selected).length === 0}
                >
                  {isProcessing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Generate Captions
                </Button>
              </div>
            </div>
          </Tabs>
        </div>
      )}
    </div>
  );
}