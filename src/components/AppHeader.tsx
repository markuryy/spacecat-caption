import { SettingsDialog } from "./SettingsDialog";
import { ExportDialog } from "./ExportDialog";
import { AppSettings } from "@/lib/settings";
import spacecatLogo from "../assets/spacecat-white.svg";

interface AppHeaderProps {
  settings: AppSettings;
  updateSingleSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<boolean>;
  workingDirectory: string | null;
  exportWorkingDirectory: (asZip: boolean) => Promise<string | null>;
}

export function AppHeader({
  settings,
  updateSingleSetting,
  workingDirectory,
  exportWorkingDirectory
}: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between py-1 px-2 border-b border-border">
      <div className="flex items-center gap-2">
        <img src={spacecatLogo} alt="Logo" className="h-10 w-10" />
        <h1 className="text-xl font-bold">spacecat caption</h1>
      </div>
      
      <div className="flex items-center gap-2">
        <SettingsDialog
          settings={settings}
          updateSingleSetting={updateSingleSetting}
        />
        
        <ExportDialog
          workingDirectory={workingDirectory}
          exportWorkingDirectory={exportWorkingDirectory}
        />
      </div>
    </header>
  );
}