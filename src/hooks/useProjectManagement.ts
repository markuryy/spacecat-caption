import { useState, useEffect, useCallback } from 'react';
import { listProjectDirectories, deleteProjectDirectory, openProjectDirectory, ProjectDirectory } from '@/lib/fs';
import { toast } from 'sonner';

/**
 * Custom hook for managing project directories
 * @returns Project management state and functions
 */
export function useProjectManagement() {
  const [projects, setProjects] = useState<ProjectDirectory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Load project directories on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  // Fetch project directories
  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const projectList = await listProjectDirectories();
      setProjects(projectList);
    } catch (err) {
      console.error('Failed to load project directories:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      toast.error('Failed to load project directories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete a project directory
  const deleteProject = useCallback(async (path: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await deleteProjectDirectory(path);
      
      // Reload projects after deletion
      await fetchProjects();
      
      return true;
    } catch (err) {
      console.error('Failed to delete project directory:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      toast.error('Failed to delete project directory');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchProjects]);

  // Open a project directory in the system's file explorer
  const openDirectory = useCallback(async (path: string) => {
    try {
      await openProjectDirectory(path);
      return true;
    } catch (err) {
      console.error('Failed to open project directory:', err);
      toast.error('Failed to open project directory');
      return false;
    }
  }, []);

  return {
    projects,
    isLoading,
    error,
    fetchProjects,
    deleteProject,
    openDirectory
  };
}