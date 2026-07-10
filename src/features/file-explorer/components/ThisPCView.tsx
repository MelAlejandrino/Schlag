import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { useDropTarget } from "../lib/useDropTarget";
import { driveIcon, folderIcon } from "../lib/folderIcon";
import { toNamedPaths } from "../lib/path";
import type { QuickAccessDir } from "../file-explorer.types";
import { RecentFiles } from "./RecentFiles";

interface ThisPCViewProps {
  quickAccess: QuickAccessDir[];
  favorites: string[];
  drives: QuickAccessDir[];
  onNavigate: (path: string) => void;
  onDrop: (sourcePaths: string[], targetPath: string, isCopy: boolean) => void;
}

export function ThisPCView({ quickAccess, favorites, drives, onNavigate, onDrop }: ThisPCViewProps) {
  const favoriteItems = toNamedPaths(favorites);

  return (
    <div className="themed-scroll min-h-0 flex-1 overflow-y-auto p-5">
      <TileSection title="Folders" resolveIcon={(item) => folderIcon(item.name)} items={quickAccess} onNavigate={onNavigate} onDrop={onDrop} />
      <TileSection
        title="Favorites"
        resolveIcon={(item) => folderIcon(item.name)}
        items={favoriteItems}
        onNavigate={onNavigate}
        onDrop={onDrop}
        className="mt-7"
      />
      <TileSection title="Drives" resolveIcon={() => driveIcon} items={drives} onNavigate={onNavigate} onDrop={onDrop} className="mt-7" />
      <RecentFiles className="mt-7" />
    </div>
  );
}

interface TileSectionProps {
  title: string;
  resolveIcon: (item: QuickAccessDir) => ComponentType<LucideProps>;
  items: QuickAccessDir[];
  onNavigate: (path: string) => void;
  onDrop: (sourcePaths: string[], targetPath: string, isCopy: boolean) => void;
  className?: string;
}

function TileSection({ title, resolveIcon, items, onNavigate, onDrop, className = "" }: TileSectionProps) {
  if (items.length === 0) return null;

  return (
    <div className={className}>
      <div className="pb-2.5 font-mono text-[11px] tracking-wide text-outline uppercase">{title}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3">
        {items.map((item) => (
          <Tile key={item.path} Icon={resolveIcon(item)} item={item} onNavigate={onNavigate} onDrop={onDrop} />
        ))}
      </div>
    </div>
  );
}

interface TileProps {
  Icon: ComponentType<LucideProps>;
  item: QuickAccessDir;
  onNavigate: (path: string) => void;
  onDrop: (sourcePaths: string[], targetPath: string, isCopy: boolean) => void;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface";

function Tile({ Icon, item, onNavigate, onDrop }: TileProps) {
  const dropTarget = useDropTarget(item.path, onDrop);

  return (
    <button
      onClick={() => onNavigate(item.path)}
      onDragOver={dropTarget.onDragOver}
      onDragLeave={dropTarget.onDragLeave}
      onDrop={dropTarget.onDrop}
      className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors duration-150 hover:bg-surface-container ${focusRing} ${
        dropTarget.isOver ? "border-primary-container" : "border-surface-container-highest"
      }`}
    >
      <Icon size={26} strokeWidth={1.5} className="text-primary" />
      <span className="w-full truncate text-[13px] text-on-surface">{item.name}</span>
    </button>
  );
}
