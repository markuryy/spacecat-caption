import React, { useState, useRef, useEffect } from 'react';
import { Button } from "../ui/button";
import { Crop, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Cropper, CropperRef } from 'react-advanced-cropper';
import 'react-advanced-cropper/dist/style.css';
import 'react-advanced-cropper/dist/themes/corners.css';
import { RotateCcw, FlipHorizontal, FlipVertical, Check, X, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { getMediaThumbnail, saveCroppedImage, cropVideo } from '../../lib/media';

interface CropEditorProps {
  src: string;
  filePath: string;
  fileType: 'image' | 'video';
  onSave: (newFilePath: string) => void;
  disabled?: boolean;
}

const CropEditor: React.FC<CropEditorProps> = ({ 
  src, 
  filePath, 
  fileType, 
  onSave, 
  disabled = false 
}) => {
  const [open, setOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoThumbnail, setVideoThumbnail] = useState<string | null>(null);
  const cropperRef = useRef<CropperRef>(null);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [aspectLocked, setAspectLocked] = useState(false);

  // For videos, we need to extract the first frame as a thumbnail
  useEffect(() => {
    if (open && fileType === 'video' && !videoThumbnail) {
      // Get a higher resolution thumbnail for editing
      const getVideoFrame = async () => {
        try {
          const thumbnail = await getMediaThumbnail(filePath, 1000); // Higher resolution for editing
          setVideoThumbnail(thumbnail);
        } catch (error) {
          console.error('Failed to get video thumbnail:', error);
          toast.error('Failed to prepare video for cropping');
          setOpen(false);
        }
      };
      
      getVideoFrame();
    }
  }, [open, fileType, filePath, videoThumbnail]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setIsProcessing(false);
      if (fileType === 'video') {
        setVideoThumbnail(null);
      }
    }
  }, [open, fileType]);

  const handleSave = async () => {
    if (!cropperRef.current || !filePath) return;
    
    try {
      setIsProcessing(true);
      
      // Get crop coordinates and transformations
      const state = cropperRef.current.getState();
      if (!state || !state.coordinates) {
        toast.error('Invalid crop selection');
        return;
      }
      
      const coords = state.coordinates;
      const transforms = {
        rotation,
        flipH,
        flipV,
        x: coords.left,
        y: coords.top,
        width: coords.width,
        height: coords.height
      };
      
      // Handle differently based on file type
      let newPath;
      
      if (fileType === 'image') {
        // For images, we can generate a data URL and send it to the backend
        const canvas = cropperRef.current.getCanvas({
          width: coords.width,
          height: coords.height,
          minWidth: 100,
          minHeight: 100
        });
        
        if (!canvas) {
          toast.error('Failed to generate cropped image');
          return;
        }
        
        const dataUrl = canvas.toDataURL('image/png', 1.0);
        
        // Send to backend to save
        newPath = await saveCroppedImage(filePath, dataUrl);
      } else {
        // For videos, we'll use ffmpeg through the Rust backend
        newPath = await cropVideo(filePath, transforms);
      }
      
      if (newPath) {
        onSave(newPath);
        setOpen(false);
      }
    } catch (error) {
      // Display a more user-friendly error message
      toast.error(`Failed to crop ${fileType}`, {
        description: "An error occurred during the crop operation. Check the application logs for details.",
        duration: 5000,
      });
      
      // Log the full error to the console
      console.error('Error during crop operation:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    // Reset cropper
    if (cropperRef.current) {
      cropperRef.current.reset();
    }
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleFlipH = () => {
    setFlipH((prev) => !prev);
  };

  const handleFlipV = () => {
    setFlipV((prev) => !prev);
  };

  const toggleAspectLock = () => {
    setAspectLocked(!aspectLocked);
  };

  // Determine which source to use
  const cropperSrc = fileType === 'video' && videoThumbnail ? videoThumbnail : src;

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        className="h-8 px-2"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="Crop media"
      >
        <Crop className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Crop {fileType === 'image' ? 'Image' : 'Video'}</DialogTitle>
          </DialogHeader>
          
          <div className="relative w-full h-96 bg-neutral-800 rounded overflow-hidden">
            {cropperSrc ? (
              <Cropper
                ref={cropperRef}
                src={cropperSrc}
                className="w-full h-full"
                stencilProps={{
                  aspectRatio: aspectLocked ? 1 : undefined,
                  theme: 'corners',
                  movable: true,
                  resizable: true,
                }}
                style={{
                  transform: `
                    rotate(${rotation}deg)
                    scaleX(${flipH ? -1 : 1})
                    scaleY(${flipV ? -1 : 1})
                  `,
                  transition: 'transform 0.2s ease',
                }}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-neutral-400" />
              </div>
            )}
          </div>
          
          {fileType === 'video' && (
            <div className="text-sm text-muted-foreground">
              Note: Cropping a video may take some time depending on the file size.
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleReset}
                className="flex items-center gap-1"
              >
                <RefreshCw size={14} />
                Reset
              </Button>
              <Button variant="outline" size="icon" onClick={handleRotate}>
                <RotateCcw size={16} />
              </Button>
              <Button variant="outline" size="icon" onClick={handleFlipH}>
                <FlipHorizontal size={16} />
              </Button>
              <Button variant="outline" size="icon" onClick={handleFlipV}>
                <FlipVertical size={16} />
              </Button>
              <Button 
                variant={aspectLocked ? "default" : "outline"} 
                size="icon" 
                onClick={toggleAspectLock}
              >
                {aspectLocked ? <Lock size={16} /> : <Unlock size={16} />}
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setOpen(false)}
              >
                <X size={14} className="mr-1" />
                Cancel
              </Button>
              <Button 
                variant="default" 
                size="sm"
                onClick={handleSave}
                disabled={isProcessing || !cropperSrc}
              >
                {isProcessing ? (
                  <RefreshCw size={14} className="mr-1 animate-spin" />
                ) : (
                  <Check size={14} className="mr-1" />
                )}
                {isProcessing ? 'Processing...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CropEditor;
