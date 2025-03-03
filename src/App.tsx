import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner"
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
  Copy,
  Wand2,
  Save
} from "lucide-react";

// Types
interface MediaFile {
  id: string;
  name: string;
  path: string;
  type: 'image' | 'video';
  hasCaption: boolean;
  selected: boolean;
  thumbnail?: string;
}

interface AppSettings {
  apiUrl: string;
  apiKey: string;
  captionPrompt: string;
}

function App() {
  // State
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [currentFile, setCurrentFile] = useState<MediaFile | null>(null);
  const [caption, setCaption] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [captionModified, setCaptionModified] = useState<boolean>(false);
  const [settings, setSettings] = useState<AppSettings>({
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    captionPrompt: 'Describe this image in detail:'
  });
  const [fileFilter, setFileFilter] = useState<'all' | 'captioned' | 'uncaptioned'>('all');

  // Auto-save caption when modified (with debounce)
  useEffect(() => {
    if (!currentFile || !captionModified) return;
    
    const timer = setTimeout(() => {
      saveCaption();
      setCaptionModified(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [caption, captionModified]);

  // Save caption function
  const saveCaption = useCallback(() => {
    if (!currentFile) return;
    
    setIsSaving(true);
    
    // In a real app, this would save to a file
    console.log(`Auto-saving caption for ${currentFile.name}: ${caption}`);
    
    // Simulate a brief save operation
    setTimeout(() => {
      setMediaFiles(prev => 
        prev.map(f => f.id === currentFile.id ? { ...f, hasCaption: caption.trim().length > 0 } : f)
      );
      setIsSaving(false);
      
      // Only show toast for manual saves
      if (captionModified === false) {
        toast("Caption saved", {
          description: `Caption saved for ${currentFile.name}`,
        });
      }
    }, 300);
  }, [currentFile, caption, captionModified, toast]);

  // Mock function to select a directory
  const handleSelectDirectory = () => {
    // In a real app, this would use the Tauri API to select a directory
    // For now, we'll mock this with some sample data
    setWorkingDirectory('/Users/example/Pictures');
    
    // Mock loading some files
    const mockFiles: MediaFile[] = Array.from({ length: 50 }, (_, i) => ({
      id: `file-${i}`,
      name: `image${i.toString().padStart(3, '0')}.${i % 3 === 0 ? 'jpg' : 'png'}`,
      path: `/Users/example/Pictures/image${i.toString().padStart(3, '0')}.${i % 3 === 0 ? 'jpg' : 'png'}`,
      type: i % 5 === 0 ? 'video' : 'image',
      hasCaption: i % 4 === 0,
      selected: false,
      thumbnail: `https://source.unsplash.com/random/100x100?sig=${i}`
    }));
    
    setMediaFiles(mockFiles);
    if (mockFiles.length > 0) {
      setCurrentFile(mockFiles[0]);
      // Mock loading a caption
      if (mockFiles[0].hasCaption) {
        setCaption('This is a sample caption for the first image.');
      } else {
        setCaption('');
      }
    }
    
    toast("Directory loaded", {
      description: `Loaded ${mockFiles.length} media files from the selected directory.`,
    });
  };

  // Handle file selection
  const handleFileSelect = (file: MediaFile) => {
    // Auto-save current caption if needed
    if (currentFile && captionModified) {
      saveCaption();
      setCaptionModified(false);
    }
    
    // Set the new current file
    setCurrentFile(file);
    
    // Load caption if it exists
    if (file.hasCaption) {
      // In a real app, this would load from a file
      setCaption(`This is a sample caption for ${file.name}.`);
    } else {
      setCaption('');
    }
  };

  // Handle checkbox selection
  const handleCheckboxChange = (file: MediaFile, checked: boolean) => {
    setMediaFiles(prev => 
      prev.map(f => f.id === file.id ? { ...f, selected: checked } : f)
    );
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
    
    // In a real app, this would call the OpenAI API for each file
    setTimeout(() => {
      setMediaFiles(prev => 
        prev.map(f => f.selected ? { ...f, hasCaption: true, selected: false } : f)
      );
      
      setIsProcessing(false);
      
      toast("Captions generated", {
        description: `Generated captions for ${selectedFiles.length} files.`,
      });
    }, 2000);
  };

  // Handle navigation
  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!currentFile || mediaFiles.length === 0) return;
    
    // Auto-save current caption if needed
    if (captionModified) {
      saveCaption();
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
    if (newFile.hasCaption) {
      // In a real app, this would load from a file
      setCaption(`This is a sample caption for ${newFile.name}.`);
    } else {
      setCaption('');
    }
  };

  // Generate caption for current file
  const handleGenerateCurrentCaption = () => {
    if (!currentFile) return;
    
    setIsProcessing(true);
    
    // Mock API call
    setTimeout(() => {
      const generatedCaption = "A sample AI-generated caption for this media file.";
      setCaption(generatedCaption);
      setCaptionModified(true);
      setIsProcessing(false);
      
      toast("Caption generated", {
        description: "AI caption generated successfully.",
      });
    }, 1000);
  };

  // Filter files based on the current tab
  const filteredFiles = mediaFiles.filter(file => {
    if (fileFilter === 'all') return true;
    if (fileFilter === 'captioned') return file.hasCaption;
    if (fileFilter === 'uncaptioned') return !file.hasCaption;
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
      if (e.key === 'ArrowLeft') {
        handleNavigate('prev');
      } else if (e.key === 'ArrowRight') {
        handleNavigate('next');
      } 
      // Generate caption
      else if (e.key === 'g') {
        handleGenerateCurrentCaption();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFile, captionModified]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-6 w-6" />
          <h1 className="text-xl font-bold">Media Caption Manager</h1>
          <span className="text-xs bg-secondary px-2 py-0.5 rounded-md">alpha</span>
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
              
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="apiUrl">API URL</Label>
                  <Input 
                    id="apiUrl" 
                    value={settings.apiUrl} 
                    onChange={(e) => setSettings({...settings, apiUrl: e.target.value})}
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input 
                    id="apiKey" 
                    type="password" 
                    value={settings.apiKey} 
                    onChange={(e) => setSettings({...settings, apiKey: e.target.value})}
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="captionPrompt">Caption Prompt</Label>
                  <Textarea 
                    id="captionPrompt" 
                    value={settings.captionPrompt} 
                    onChange={(e) => setSettings({...settings, captionPrompt: e.target.value})}
                  />
                </div>
              </div>
              
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
              <Button onClick={handleSelectDirectory} className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Select Directory
              </Button>
            </div>
          ) : (
            <>
              {/* Directory info */}
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    <span className="text-sm font-medium truncate">{workingDirectory}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleSelectDirectory}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* File tabs */}
              <Tabs defaultValue="all" className="flex flex-col h-[calc(100%-64px)]" onValueChange={(v) => setFileFilter(v as any)}>
                <div className="m-2 mb-0">
                  <TabsList className="w-full flex">
                    <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                    <TabsTrigger value="uncaptioned" className="flex-1">Uncaptioned</TabsTrigger>
                    <TabsTrigger value="captioned" className="flex-1">Captioned</TabsTrigger>
                  </TabsList>
                </div>
                
                {/* File list */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  <ScrollArea className="flex-1">
                    <div className="p-2">
                      {filteredFiles.length === 0 ? (
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
                            
                            <div className="h-12 w-12 rounded overflow-hidden flex-shrink-0 bg-muted">
                              {file.thumbnail && (
                                <img 
                                  src={file.thumbnail} 
                                  alt={file.name} 
                                  className="h-full w-full object-cover"
                                />
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                {file.type === 'image' ? (
                                  <ImageIcon className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <Video className="h-3 w-3 text-muted-foreground" />
                                )}
                                <p className="text-sm truncate">{file.name}</p>
                              </div>
                              {file.hasCaption && (
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
                  
                  {/* Batch actions */}
                  <div className="p-4 border-t border-border mt-auto">
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
            </>
          )}
        </div>
        
        {/* Main content area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {currentFile ? (
            <>
              {/* Media viewer */}
              <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
                <div className="relative max-h-full max-w-full">
                  {currentFile.type === 'image' ? (
                    <img 
                      src={currentFile.thumbnail?.replace('100x100', '800x600')} 
                      alt={currentFile.name}
                      className="max-h-[calc(100vh-16rem)] object-contain rounded-md"
                    />
                  ) : (
                    <div className="bg-muted rounded-md flex items-center justify-center h-[calc(100vh-16rem)] w-[calc(100vh-16rem)]">
                      <Video className="h-16 w-16 text-muted-foreground" />
                    </div>
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
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-background/80 backdrop-blur-sm px-4 py-2 rounded-full">
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
                        className="h-8 px-2 text-xs"
                        onClick={() => navigator.clipboard.writeText(caption)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                      
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
                        variant="outline" 
                        size="sm" 
                        className="h-8"
                        onClick={() => {
                          saveCaption();
                          setCaptionModified(false);
                        }}
                        disabled={isSaving || !captionModified}
                      >
                        <Save className="h-3 w-3 mr-1" />
                        Save
                      </Button>
                      
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
                          <Wand2 className="h-3 w-3 mr-1" />
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
                      <span>Shift + ← → Arrow keys: Navigate</span>
                      <span>Shift + G: Generate caption</span>
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
                  <p className="mb-4">Select a directory to get started.</p>
                  <Button onClick={handleSelectDirectory}>Select Directory</Button>
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