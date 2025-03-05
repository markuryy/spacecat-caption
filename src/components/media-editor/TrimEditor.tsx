import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "../ui/dialog";
import { Button } from "../ui/button";
import { Scissors, RefreshCw, Check, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface TrimEditorProps {
  src: string;
  filePath: string;
  onSave: (newFilePath: string) => void;
  disabled?: boolean;
}

const TrimEditor: React.FC<TrimEditorProps> = ({ src, filePath, onSave, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (open && videoRef.current) {
      const video = videoRef.current;
      
      // Set up event listener for metadata loaded
      const handleMetadata = () => {
        setDuration(video.duration);
        setEndTime(video.duration);
      };
      
      video.addEventListener('loadedmetadata', handleMetadata);
      
      // Set up event listener for time update
      const handleTimeUpdate = () => {
        setCurrentTime(video.currentTime);
      };
      
      video.addEventListener('timeupdate', handleTimeUpdate);
      
      return () => {
        video.removeEventListener('loadedmetadata', handleMetadata);
        video.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }
  }, [open]);

  const handleTrim = async () => {
    if (!filePath) return;
    
    setIsProcessing(true);
    
    try {
      // Call Rust function to trim the video
      const newPath = await invoke('trim_video', {
        path: filePath,
        startTime,
        endTime,
      });
      
      onSave(newPath as string);
      setOpen(false);
      
    } catch (error) {
      toast.error(`Failed to trim video: ${error}`);
      console.error('Error trimming video:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePreviewPosition = (position: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = position;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleReset = () => {
    setStartTime(0);
    setEndTime(duration);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
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
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Trim Video</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="relative w-full rounded overflow-hidden bg-black">
              <video 
                ref={videoRef}
                src={src}
                className="w-full h-auto"
                controls
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span>Start: {formatTime(startTime)}</span>
                <span>Current: {formatTime(currentTime)}</span>
                <span>End: {formatTime(endTime)}</span>
              </div>
              
              <div className="px-2">
                <Slider
                  value={[startTime, endTime]}
                  min={0}
                  max={duration}
                  step={0.1}
                  onValueChange={([start, end]) => {
                    setStartTime(start);
                    setEndTime(end);
                  }}
                />
              </div>
              
              <div className="flex justify-between gap-2 mt-2">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handlePreviewPosition(startTime)}
                  >
                    Preview Start
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handlePreviewPosition(endTime)}
                  >
                    Preview End
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                </div>

                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" size="sm">
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={handleTrim}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Check className="h-3 w-3 mr-1" />
                    )}
                    {isProcessing ? 'Processing...' : 'Save'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TrimEditor;