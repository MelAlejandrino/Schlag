import type { ComponentType } from "react";
import { AppWindow, Download, FileText, Folder, HardDrive, Image, Music, Video, type LucideProps } from "lucide-react";

const BY_NAME: Record<string, ComponentType<LucideProps>> = {
  Desktop: AppWindow,
  Documents: FileText,
  Downloads: Download,
  Pictures: Image,
  Music: Music,
  Videos: Video,
};

// Special OS folders get a semantic icon (matching Windows' own This PC
// screen); anything else — including starred arbitrary folders — falls
// back to a generic folder icon. Drives use HardDrive regardless of name.
export function folderIcon(name: string): ComponentType<LucideProps> {
  return BY_NAME[name] ?? Folder;
}

export const driveIcon: ComponentType<LucideProps> = HardDrive;
