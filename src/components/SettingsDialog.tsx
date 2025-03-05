import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Settings as SettingsIcon, Info, Trash2, RefreshCw, FolderOpen, Sliders, Keyboard, FolderCog } from "lucide-react";
import { toast } from "sonner";
import { AppSettings } from "@/lib/settings";
import { ImageDetailLevel } from "@/lib/settings";
import { useProjectManagement } from "@/hooks/useProjectManagement";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"


interface SettingsDialogProps {
  settings: AppSettings;
  updateSingleSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<boolean>;
}

export function SettingsDialog({ settings, updateSingleSetting }: SettingsDialogProps) {
  const { projects, isLoading, error, fetchProjects, deleteProject, openDirectory } = useProjectManagement();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>("general");

  const handleDeleteProject = async (path: string, name: string) => {
    if (confirm(`Are you sure you want to delete the project "${name}"? This cannot be undone.`)) {
      setIsDeleting(path);
      try {
        const success = await deleteProject(path);
        if (success) {
          toast.success(`Project "${name}" deleted`);
        }
      } finally {
        setIsDeleting(null);
      }
    }
  };
  
  const handleOpenDirectory = async (path: string) => {
    await openDirectory(path);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] min-w-[90vw] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        
        <div className="flex h-[65vh]">
          {/* Sidebar */}
          <div className="w-52 border-r border-border pr-2 pt-2 flex flex-col justify-between">
            <div className="space-y-1">
              <Button
                variant={activeSection === "general" ? "default" : "ghost"} 
                className="w-full justify-start mb-1"
                onClick={() => setActiveSection("general")}
              >
                <Sliders className="h-4 w-4 mr-2" />
                General
              </Button>
              <Button
                variant={activeSection === "shortcuts" ? "default" : "ghost"} 
                className="w-full justify-start mb-1"
                onClick={() => setActiveSection("shortcuts")}
              >
                <Keyboard className="h-4 w-4 mr-2" />
                Shortcuts
              </Button>
              <Button
                variant={activeSection === "projects" ? "default" : "ghost"} 
                className="w-full justify-start"
                onClick={() => setActiveSection("projects")}
              >
                <FolderCog className="h-4 w-4 mr-2" />
                Projects
              </Button>
            </div>
            
            {/* Save button at the bottom of sidebar */}
            <Button 
              type="submit" 
              onClick={() => toast("Settings saved")}
              className="mt-auto"
            >
              Save changes
            </Button>
          </div>
          
          {/* Content Area */}
          <ScrollArea className="flex-1 pl-6 pr-4 py-4">
            {/* General Settings */}
            {activeSection === "general" && (
              <div className="grid gap-4 pb-4">
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
                        <Info className="h-3 w-3 cursor-pointer" />
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
                    className="min-h-[120px]"
                  />
                </div>
              </div>
            )}
            
            {/* Keyboard Shortcuts */}
            {activeSection === "shortcuts" && (
              <div className="space-y-6 pb-4">
                <div>
                  <h3 className="text-sm font-medium mb-3">Navigation</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Shortcut</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>
                          <div className="flex items-center">
                            <kbd className="px-2 py-1 bg-muted rounded text-xs inline-flex items-center justify-center">Shift</kbd>
                            <span className="mx-1">+</span>
                            <kbd className="px-2 py-1 bg-muted rounded text-xs inline-flex items-center justify-center">←</kbd>
                          </div>
                        </TableCell>
                        <TableCell>Previous image</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>
                          <div className="flex items-center">
                            <kbd className="px-2 py-1 bg-muted rounded text-xs inline-flex items-center justify-center">Shift</kbd>
                            <span className="mx-1">+</span>
                            <kbd className="px-2 py-1 bg-muted rounded text-xs inline-flex items-center justify-center">→</kbd>
                          </div>
                        </TableCell>
                        <TableCell>Next image</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                
                <Separator className="my-6" />
                
                <div>
                  <h3 className="text-sm font-medium mb-3">Actions</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Shortcut</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>
                          <div className="flex items-center">
                            <kbd className="px-2 py-1 bg-muted rounded text-xs inline-flex items-center justify-center">Shift</kbd>
                            <span className="mx-1">+</span>
                            <kbd className="px-2 py-1 bg-muted rounded text-xs inline-flex items-center justify-center">G</kbd>
                          </div>
                        </TableCell>
                        <TableCell>Generate caption</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            
            {/* Project Management */}
            {activeSection === "projects" && (
              <div className="space-y-4 pb-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Project Directories</h3>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={fetchProjects}
                    disabled={isLoading}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
                
                <div className="max-h-[350px] rounded-md border p-2">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-36">
                      <p className="text-sm text-muted-foreground">Loading projects...</p>
                    </div>
                  ) : error ? (
                    <div className="flex items-center justify-center h-36">
                      <p className="text-sm text-destructive">Error loading projects: {error.message}</p>
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="flex items-center justify-center h-36">
                      <p className="text-sm text-muted-foreground">No projects found</p>
                    </div>
                  ) : (
                    <div className="w-full overflow-auto">
                      <table className="w-full table-auto border-collapse border-spacing-0 text-sm">
                        <thead>
                          <tr>
                            <th className="text-muted-foreground h-10 px-2 text-left align-middle font-medium">Name</th>
                            <th className="text-muted-foreground h-10 px-2 text-left align-middle font-medium">Last Modified</th>
                            <th className="text-muted-foreground h-10 px-2 text-left align-middle font-medium">Created</th>
                            <th className="text-muted-foreground h-10 px-2 text-right align-middle font-medium">Size</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projects.map((project) => (
                            <ContextMenu key={project.id}>
                              <ContextMenuTrigger asChild>
                                <tr className="hover:bg-muted/50 border-b transition-colors cursor-default h-10">
                                  <td width="40%" className="px-2 py-1 align-middle font-medium">
                                    <div className="truncate">{project.name}</div>
                                  </td>
                                  <td width="20%" className="px-2 py-1 align-middle text-muted-foreground text-xs">
                                    <div className="truncate">{project.modified}</div>
                                  </td>
                                  <td width="20%" className="px-2 py-1 align-middle text-muted-foreground text-xs">
                                    <div className="truncate">{project.created.split(' ')[0]}</div>
                                  </td>
                                  <td width="20%" className="px-2 py-1 text-right align-middle text-muted-foreground text-xs">
                                    {project.formatted_size}
                                  </td>
                                </tr>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem onClick={() => handleOpenDirectory(project.path)}>
                                  <FolderOpen className="h-4 w-4 mr-2" />
                                  Open in file explorer
                                </ContextMenuItem>
                                <ContextMenuItem 
                                  onClick={() => handleDeleteProject(project.path, project.name)}
                                  disabled={isDeleting === project.path}
                                  variant="destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {isDeleting === project.path ? "Deleting..." : "Delete project"}
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                
                <div className="text-xs text-muted-foreground">
                  <p>Projects are working copies of your original media folders.</p>
                  <p>Deleting them will not affect your original files.</p>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}