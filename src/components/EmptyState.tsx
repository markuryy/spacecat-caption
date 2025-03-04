import { FolderOpen, ImageIcon } from "lucide-react";

interface EmptyStateProps {
  workingDirectory: string | null;
}

export function EmptyState({ workingDirectory }: EmptyStateProps) {
  return (
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
  );
}