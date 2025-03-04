import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ExportDialogProps {
  workingDirectory: string | null;
  exportWorkingDirectory: (asZip: boolean) => Promise<string | null>;
}

export function ExportDialog({ workingDirectory, exportWorkingDirectory }: ExportDialogProps) {
  const [exportDialogOpen, setExportDialogOpen] = useState<boolean>(false);
  const [exportAsZip, setExportAsZip] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const handleExport = async () => {
    if (!workingDirectory) {
      toast.error("No data to export", {
        description: "Please select a directory first"
      });
      return;
    }
    
    try {
      setIsExporting(true);
      const exportPath = await exportWorkingDirectory(exportAsZip);
      setExportDialogOpen(false);
      
      if (exportPath) {
        toast.success(`Export completed!`, {
          description: `Files exported to ${exportPath}`
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error("Export failed", {
        description: errorMessage
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export Dataset</DialogTitle>
          <DialogDescription>
            Export your dataset with all media files and captions
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="export-as-zip" 
              checked={exportAsZip} 
              onCheckedChange={(checked) => setExportAsZip(!!checked)}
            />
            <Label htmlFor="export-as-zip">Export as ZIP file</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            {exportAsZip 
              ? "All files will be compressed into a single ZIP file" 
              : "Files will be exported to a folder"}
          </p>
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setExportDialogOpen(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={isExporting || !workingDirectory}
          >
            {isExporting ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}