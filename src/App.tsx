import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner"
import spacecatLogo from "./assets/spacecat-white.svg";

import { 
  Settings, 
  FolderOpen, 
  Image as ImageIcon, 
  Video, 
  FileText, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  Trash,
  Wand2,
  Info,
  Bot
} from "lucide-react";
import { useFileSystem } from "@/hooks/useFileSystem";
import { useSettings } from "@/hooks/useSettings";
import { MediaFile } from "@/lib/fs";
import { generateCaption, generateCaptions } from "@/lib/api";
import { ImageDetailLevel } from "@/lib/settings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

function App() {
  // Initialize hooks
  const {
    sourceDirectory,
    workingDirectory,
    mediaFiles,
    isLoading,
    error,
    selectSourceDirectory,
    readCaption,
    writeCaption,
    getThumbnail,
    getMediaUrl,
    updateFileSelection
  } = useFileSystem();
  
  const {
    settings,
    updateSettings,
    updateSingleSetting
  } = useSettings();

  // State
  const [currentFile, setCurrentFile] = useState<MediaFile | null>(null);
  const [caption, setCaption] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [captionModified, setCaptionModified] = useState<boolean>(false);
  const [fileFilter, setFileFilter] = useState<'all' | 'captioned' | 'uncaptioned'>('all');
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

  // Load thumbnails for visible files
  useEffect(() => {
    if (mediaFiles.length === 0 || loadingThumbnails) return;
    
    const loadThumbnails = async () => {
      setLoadingThumbnails(true);
      
      // Only load thumbnails for image files that don't have them yet
      const imagesToProcess = mediaFiles
        .filter(file => (file.type === 'image' || file.file_type === 'image') && !file.thumbnail)
        .slice(0, 20); // Process in batches to avoid overwhelming the system
      
      if (imagesToProcess.length === 0) {
        setLoadingThumbnails(false);
        return;
      }
      
      // Process thumbnails in parallel
      await Promise.all(
        imagesToProcess.map(async (file) => {
          try {
            const thumbnail = await getThumbnail(file);
            if (thumbnail) {
              // Update the file with the thumbnail
              updateFileSelection(file.id, file.selected || false, thumbnail);
            }
          } catch (err) {
            console.error(`Failed to load thumbnail for ${file.name}:`, err);
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

  // Handle directory selection
  const handleSelectDirectory = async () => {
    try {
      toast.promise(
        selectSourceDirectory(),
        {
          loading: 'Selecting directory...',
          success: (result) => {
            const { files, sourceDirectory, workingDirectory } = result;
            
            if (files.length > 0) {
              setCurrentFile(files[0]);
              
              // Load caption if it exists
              if (files[0].has_caption) {
                readCaption(files[0]).then(captionText => {
                  setCaption(captionText);
                });
              } else {
                setCaption('');
              }
            }
            
            return `Loaded ${files.length} media files from ${sourceDirectory}`;
          },
          error: (err) => `Failed to load directory: ${err}`
        }
      );
    } catch (err) {
      // Error is handled by toast.promise
    }
  };

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

  // Handle checkbox selection
  const handleCheckboxChange = (file: MediaFile, checked: boolean) => {
    updateFileSelection(file.id, checked);
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
    const imagePaths = selectedFiles.map(file => file.path);
    
    // Call the API to generate captions
    toast.promise(
      generateCaptions(
        settings.apiUrl,
        settings.apiKey,
        settings.captionPrompt,
        imagePaths,
        settings.model,
        settings.imageDetail,
        settings.useDetailParameter
      ),
      {
        loading: `Generating captions for ${selectedFiles.length} files using ${settings.model}...`,
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

  // Generate caption for current file
  const handleGenerateCurrentCaption = () => {
    if (!currentFile) return;
    
    setIsProcessing(true);
    
    // Call the API to generate a caption
    toast.promise(
      generateCaption(
        settings.apiUrl,
        settings.apiKey,
        settings.captionPrompt,
        currentFile.path,
        settings.model,
        settings.imageDetail,
        settings.useDetailParameter
      ),
      {
        loading: `Generating caption using ${settings.model}...`,
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

  // Filter files based on the current tab
  const filteredFiles = mediaFiles.filter(file => {
    if (fileFilter === 'all') return true;
    if (fileFilter === 'captioned') return file.has_caption;
    if (fileFilter === 'uncaptioned') return !file.has_caption;
    return true;
  });

  // Get current file index for pagination display
  const currentFileIndex = currentFile 
    ? mediaFiles.findIndex(f => f.id === currentFile.id) + 1 
    : 0;

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
      <header className="flex items-center justify-between p-2 mx-2 border-b border-border">
        <div className="flex items-center gap-2">
          <img src={spacecatLogo} alt="Logo" className="h-10 w-10" />
          <h1 className="text-xl font-bold">spacecat caption</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Settings</DialogTitle>
                <DialogDescription>
                  Configure the application settings.
                </DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="general">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="shortcuts">Keyboard Shortcuts</TabsTrigger>
                </TabsList>
                
                <TabsContent value="general" className="mt-4">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="apiUrl">API URL</Label>
                      <Input 
                        id="apiUrl" 
                        value={settings.apiUrl} 
                        onChange={(e) => updateSingleSetting('apiUrl', e.target.value)}
                      />
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="apiKey">API Key</Label>
                      <Input 
                        id="apiKey" 
                        type="password" 
                        value={settings.apiKey} 
                        onChange={(e) => updateSingleSetting('apiKey', e.target.value)}
                      />
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="model">Model</Label>
                      <Input 
                        id="model" 
                        value={settings.model} 
                        onChange={(e) => updateSingleSetting('model', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Recommended models: gpt-4o-2024-05-13, gpt-4o
                      </p>
                    </div>
                    
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="imageDetail">Image Detail Level</Label>
                        <HoverCard>
                          <HoverCardTrigger asChild>
                              <Info className="h-3 w-3" />
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80">
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold">Image Detail Levels</h4>
                              <p className="text-xs">
                                <strong>auto:</strong> The model decides based on image size
                              </p>
                              <p className="text-xs">
                                <strong>low:</strong> Uses a 512px x 512px version (85 tokens)
                              </p>
                              <p className="text-xs">
                                <strong>high:</strong> First uses low-res, then creates detailed crops (255 tokens)
                              </p>
                              <p className="text-xs mt-2">
                                Higher detail means better image understanding but uses more tokens.
                              </p>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      </div>
                      <Select 
                        value={settings.imageDetail} 
                        onValueChange={(value: string) => updateSingleSetting('imageDetail', value as ImageDetailLevel)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select detail level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="useDetailParameter" 
                        checked={settings.useDetailParameter}
                        onCheckedChange={(checked) => 
                          updateSingleSetting('useDetailParameter', checked === true)
                        }
                      />
                      <Label 
                        htmlFor="useDetailParameter" 
                        className="text-sm font-normal"
                      >
                        Include detail parameter in API requests
                      </Label>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="captionPrompt">Caption Prompt</Label>
                      <Textarea 
                        id="captionPrompt" 
                        value={settings.captionPrompt} 
                        onChange={(e) => updateSingleSetting('captionPrompt', e.target.value)}
                      />
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="shortcuts" className="mt-4">
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium">Navigation</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center">
                          <kbd className="px-2 py-1 bg-muted rounded text-xs">Shift</kbd>
                          <span className="mx-1">+</span>
                          <kbd className="px-2 py-1 bg-muted rounded text-xs">←</kbd>
                        </div>
                        <span>Previous image</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center">
                          <kbd className="px-2 py-1 bg-muted rounded text-xs">Shift</kbd>
                          <span className="mx-1">+</span>
                          <kbd className="px-2 py-1 bg-muted rounded text-xs">→</kbd>
                        </div>
                        <span>Next image</span>
                      </div>
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <h3 className="text-sm font-medium">Actions</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center">
                          <kbd className="px-2 py-1 bg-muted rounded text-xs">Shift</kbd>
                          <span className="mx-1">+</span>
                          <kbd className="px-2 py-1 bg-muted rounded text-xs">G</kbd>
                        </div>
                        <span>Generate caption</span>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              
              <DialogFooter>
                <Button type="submit" onClick={() => toast("Settings saved")}>
                  Save changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Button variant="outline">
            Export
          </Button>
        </div>
      </header>
      
      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
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
              <div className="p-4 border-b border-border">
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
                <div className="p-2 pb-0">
                  <TabsList className="w-full flex">
                    <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                    <TabsTrigger value="uncaptioned" className="flex-1">Uncaptioned</TabsTrigger>
                    <TabsTrigger value="captioned" className="flex-1">Captioned</TabsTrigger>
                  </TabsList>
                </div>
                
                {/* File list container */}
                <div className="flex flex-col h-[calc(100%-48px)]">
                  {/* Scrollable file list */}
                  <div className="flex-1 overflow-hidden pb-2">
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
                                currentFile?.id === file.id ? 'bg-secondary' : 'hover:bg-secondary/50'
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
                              
                              <div className="h-12 w-12 rounded overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
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
                  <div className="p-4 border-t border-border sticky bottom-0 bg-background">
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
        
        {/* Main content area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {currentFile ? (
            <>
              {/* Media viewer */}
              <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
                <div className="relative w-[calc(100vh-20rem)] h-[calc(100vh-20rem)] flex items-center justify-center bg-background rounded-md">
                  {currentFile.type === 'image' || currentFile.file_type === 'image' ? (
                    <img 
                      src={getMediaUrl(currentFile)} 
                      alt={currentFile.name}
                      className="max-w-[90%] max-h-[90%] object-contain rounded-md"
                    />
                  ) : (
                    <video 
                      src={getMediaUrl(currentFile)} 
                      controls 
                      className="max-w-[90%] max-h-[90%] object-contain rounded-md"
                    />
                  )}
                </div>
                
                {/* Navigation buttons */}
                <Button 
                  variant="secondary" 
                  size="icon"
                  className="absolute left-8 top-1/2 transform -translate-y-1/2"
                  onClick={() => handleNavigate('prev')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <Button 
                  variant="secondary" 
                  size="icon"
                  className="absolute right-8 top-1/2 transform -translate-y-1/2"
                  onClick={() => handleNavigate('next')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                
                {/* File info */}
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-background/80 backdrop-blur-sm px-4 py-2 rounded-full">
                  <p className="text-sm">
                    {currentFile.name} • {currentFileIndex} / {mediaFiles.length}
                  </p>
                </div>
              </div>
              
              {/* Caption editor */}
              <div className="p-4 border-t border-border">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="caption">Caption</Label>
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
                      
                      
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          setCaption('');
                          setCaptionModified(true);
                        }}
                      >
                        <Trash className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                      
                      <Separator orientation="vertical" className="h-4" />
                      
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="h-8"
                        onClick={handleGenerateCurrentCaption}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Bot className="h-3 w-3 mr-1" />
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
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-muted-foreground">
              {workingDirectory ? (
                <>
                  <ImageIcon className="h-16 w-16 mb-4" />
                  <h2 className="text-xl font-medium mb-2">No file selected</h2>
                  <p>Select a file from the sidebar to view and edit its caption.</p>
                </>
              ) : (
                <>
                  <FolderOpen className="h-16 w-16 mb-4" />
                  <h2 className="text-xl font-medium mb-2">No directory selected</h2>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      
      <Toaster />
    </div>
  );
}

export default App;