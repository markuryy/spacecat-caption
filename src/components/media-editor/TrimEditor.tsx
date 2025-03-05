import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "../ui/dialog";
import { Button } from "../ui/button";
import { Scissors, Check, X, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface TrimEditorProps {
  src: string;
  filePath: string;
  onSave: (newFilePath: string) => void;
  disabled?: boolean;
}

const DEFAULT_MIN_TRIM = 1; // 1 second minimum trim duration

export function TrimEditor({ src, filePath, onSave, disabled = false }: TrimEditorProps) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(100);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mediaTimestamp, setMediaTimestamp] = useState<number>(Date.now());
  const [progressPercent, setProgressPercent] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Set up progress polling
  useEffect(() => {
    let progressInterval: number | undefined;
    
    // Only poll when processing
    if (isProcessing) {
      // Poll every 200ms for progress updates
      progressInterval = window.setInterval(async () => {
        try {
          const progress: number = await invoke('get_trim_progress');
          
          // Check for error state (-1)
          if (progress === -1) {
            toast.error("Trim operation failed");
            setIsProcessing(false);
            setProgressPercent(0);
            clearInterval(progressInterval);
            return;
          }
          
          // Update progress
          setProgressPercent(progress);
          
          // If we're done, clean up
          if (progress === 100) {
            clearInterval(progressInterval);
          }
        } catch (error) {
          console.error("Failed to get progress:", error);
        }
      }, 200);
    }
    
    // Clean up
    return () => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    };
  }, [isProcessing]);

  // Update timestamp when dialog opens to force video reload
  useEffect(() => {
    if (open) {
      setMediaTimestamp(Date.now());
    }
  }, [open]);

  // Create a URL with a cache-busting parameter
  const getVideoUrlWithTimestamp = () => {
    // For assets, add a timestamp query parameter to prevent caching
    if (src.startsWith('asset://')) {
      return `${src}?t=${mediaTimestamp}`;
    }
    return src;
  };

  // Initialize when dialog opens
  useEffect(() => {
    if (open && videoRef.current) {
      const video = videoRef.current;
      
      const handleMetadata = () => {
        console.log("Video metadata loaded, duration:", video.duration);
        setDuration(video.duration);
        setTrimEnd(100);
        setIsLoading(false);
      };
      
      video.addEventListener('loadedmetadata', handleMetadata);
      
      return () => {
        video.removeEventListener('loadedmetadata', handleMetadata);
      };
    }
  }, [open, mediaTimestamp]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTrimStart(0);
      setTrimEnd(100);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setIsLoading(true);
      setProgressPercent(0);
      setIsProcessing(false);
    }
  }, [open]);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) {
      return "00:00";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMouseDown = (handle: 'start' | 'end') => (e: React.MouseEvent) => {
    setIsDragging(handle);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = (x / rect.width) * 100;

    if (isDragging === 'start') {
      const newStart = Math.min(percentage, trimEnd - (DEFAULT_MIN_TRIM / duration * 100));
      setTrimStart(newStart);
      if (videoRef.current) {
        videoRef.current.currentTime = (newStart * duration) / 100;
      }
    } else {
      const newEnd = Math.max(percentage, trimStart + (DEFAULT_MIN_TRIM / duration * 100));
      setTrimEnd(newEnd);
      if (videoRef.current) {
        videoRef.current.currentTime = (newEnd * duration) / 100;
      }
    }
  }, [isDragging, trimStart, trimEnd, duration]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Adjust time to nearest frame boundary
  const adjustTimeToFrameBoundary = (timeInSeconds: number) => {
    // Assuming 30fps as a common frame rate if we don't know the actual one
    const assumedFrameRate = 30;
    const frameTime = 1 / assumedFrameRate;
    
    // Round to nearest frame
    return Math.round(timeInSeconds / frameTime) * frameTime;
  };

  // Handle trim operation
  const handleTrim = async () => {
    if (!filePath) return;
    
    try {
      // Reset progress tracking first
      await invoke('reset_trim_progress');
      
      setIsProcessing(true);
      setProgressPercent(0);
      
      // Calculate actual start and end times in seconds
      let startTime = (trimStart * duration) / 100;
      let endTime = (trimEnd * duration) / 100;
      
      // Adjust times to nearest frame boundaries for more accurate trimming
      startTime = adjustTimeToFrameBoundary(startTime);
      endTime = adjustTimeToFrameBoundary(endTime);
      
      console.log("Trimming video from", startTime, "to", endTime, "(adjusted to frame boundaries)");
      
      // Call Rust function to trim the video with AppHandle parameter
      const newPath = await invoke('trim_video', {
        path: filePath,
        startTime,
        endTime,
      });
      
      // When processing is complete and successful
      // The progress polling will handle the UI updates
      // Only here we close the dialog and save
      onSave(newPath as string);
      setOpen(false);
      
    } catch (error) {
      // Get the error message from the error object
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
          ? error 
          : "Unknown error";
      
      // Display a more user-friendly error message
      toast.error("Failed to trim video", {
        description: errorMessage,
        duration: 5000,
      });
      
      // Log the full error to the console
      console.error('Error trimming video:', error);
      setProgressPercent(0);
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        className="h-8 px-2"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="Trim video"
      >
        <Scissors className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Trim Video</DialogTitle>
          </DialogHeader>

          <div className="w-full max-w-3xl mx-auto space-y-4">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              )}
              <video
                ref={videoRef}
                src={getVideoUrlWithTimestamp()}
                className="w-full h-full"
                controls={true}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                key={`video-${mediaTimestamp}`} // Key change forces re-render
              />
            </div>

            <div className="relative pt-10 px-6">
              <div className="flex justify-between text-sm text-muted-foreground mb-6">
                <span>{formatTime(0)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              <div className="relative">
                <div className="absolute -top-8 left-0 right-0 flex justify-between text-xs font-medium">
                  <div className="absolute" style={{ left: `${trimStart}%` }}>
                    <div className="bg-primary text-primary-foreground px-2 py-1 rounded-md -translate-x-1/2">
                      {duration > 0 ? formatTime((trimStart * duration) / 100) : "00:00"}
                    </div>
                  </div>
                  <div className="absolute" style={{ left: `${trimEnd}%` }}>
                    <div className="bg-primary text-primary-foreground px-2 py-1 rounded-md -translate-x-1/2">
                      {duration > 0 ? formatTime((trimEnd * duration) / 100) : "00:00"}
                    </div>
                  </div>
                </div>
                
                <div 
                  ref={containerRef}
                  className="flex-1 h-12 relative rounded-md overflow-hidden bg-black/20"
                >
                  <div
                    className="absolute inset-0 bg-primary/20"
                    style={{
                      left: `${trimStart}%`,
                      right: `${100 - trimEnd}%`
                    }}
                  />

                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-6 h-6 -ml-3 bg-primary rounded-md cursor-ew-resize flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform"
                    style={{ left: `${trimStart}%` }}
                    onMouseDown={handleMouseDown('start')}
                  >
                    <GripHorizontal className="w-4 h-4 text-primary-foreground rotate-90" />
                  </div>

                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-6 h-6 -ml-3 bg-primary rounded-md cursor-ew-resize flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform"
                    style={{ left: `${trimEnd}%` }}
                    onMouseDown={handleMouseDown('end')}
                  >
                    <GripHorizontal className="w-4 h-4 text-primary-foreground rotate-90" />
                  </div>

                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none"
                    style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-4">
              <DialogClose asChild>
                <Button variant="outline" size="sm">
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </DialogClose>
              {isProcessing ? (
                <div className="flex flex-col w-24">
                  <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden mb-1">
                    <div 
                      className="h-full bg-primary transition-all duration-300 ease-in-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-xs text-center">{progressPercent}%</span>
                </div>
              ) : (
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={handleTrim}
                  disabled={isProcessing}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Save
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default TrimEditor;
