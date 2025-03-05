import React from 'react';
import { Button } from "../ui/button";
import { Trash2 } from "lucide-react";
import { MediaFile } from "@/lib/fs";

interface RemoveButtonProps {
  currentFile: MediaFile | null;
  onRemove: (file: MediaFile) => void;
  disabled?: boolean;
}

const RemoveButton: React.FC<RemoveButtonProps> = ({ currentFile, onRemove, disabled = false }) => {
  const handleClick = () => {
    if (currentFile) {
      onRemove(currentFile);
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      className="h-8 px-2"
      onClick={handleClick}
      disabled={disabled || !currentFile}
      title="Delete this file and its caption"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
};

export default RemoveButton;