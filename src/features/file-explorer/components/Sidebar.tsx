import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { Monitor, Star, X } from "lucide-react";
import { basename, longestMatchingPath } from "../lib/path";
import { useDropTarget } from "../lib/useDropTarget";
import { useSidebarResize } from "../lib/useSidebarResize";
import { driveIcon, folderIcon } from "../lib/folderIcon";
import { THIS_PC } from "../file-explorer.types";
import type { QuickAccessDir } from "../file-explorer.types";

type DropHandler = (sourcePaths: string[], targetPath: string, isCopy: boolean) => void;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-lowest";

interface SidebarProps {
  quickAccess: QuickAccessDir[];
  favorites: string[];
  drives: QuickAccessDir[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onUnstar: (path: string) => void;
  onDrop: DropHandler;
}

export function Sidebar({ quickAccess, favorites, drives, currentPath, onNavigate, onUnstar, onDrop }: SidebarProps) {
  const activePath = longestMatchingPath(currentPath, [
    ...quickAccess.map((d) => d.path),
    ...favorites,
    ...drives.map((d) => d.path),
  ]);
  const thisPcActive = currentPath === THIS_PC;
  const { width, isResizing, onResizeStart, onResizeMove, onResizeEnd } = useSidebarResize();

  return (
    // The resize handle is a sibling of the scrollable content, not a child
    // of it — a child positioned outside the scrollable div's own bounds
    // would get clipped: per the CSS overflow spec, setting overflow-y also
    // forces the other axis to compute as auto (not visible), so any
    // negative-offset bleed on the handle would be cut off.
    <aside className="relative flex shrink-0" style={{ width }}>
      <div className="themed-scroll min-w-0 flex-1 overflow-y-auto border-r border-surface-container-highest bg-surface-container-lowest p-3">
        <button
          onClick={() => onNavigate(THIS_PC)}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors duration-150 hover:bg-surface-container ${focusRing} ${
            thisPcActive ? "bg-surface-container-high text-primary" : "text-on-surface"
          }`}
        >
          <Monitor size={15} strokeWidth={1.75} className={thisPcActive ? "text-primary" : "text-outline"} />
          This PC
        </button>

        <div className="mt-5">
          <LinkSection title="Quick Access" links={quickAccess} activePath={activePath} onNavigate={onNavigate} onDrop={onDrop} />
        </div>

        <div className="mt-5">
          <LinkSection
            title="Drives"
            links={drives}
            activePath={activePath}
            onNavigate={onNavigate}
            onDrop={onDrop}
            resolveIcon={() => driveIcon}
          />
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-1.5 px-2 pb-1.5 font-mono text-[11px] font-medium tracking-wide text-outline uppercase">
            <Star size={11} strokeWidth={2} />
            Favorites
          </div>
          {favorites.length === 0 && <div className="px-2 text-xs text-outline">Star a folder to pin it here</div>}
          {favorites.map((path) => (
            <FavoriteItem
              key={path}
              path={path}
              active={path === activePath}
              onNavigate={onNavigate}
              onUnstar={onUnstar}
              onDrop={onDrop}
            />
          ))}
        </div>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        className={`absolute top-0 right-0 h-full w-1.5 -mr-0.5 shrink-0 cursor-col-resize touch-none transition-colors duration-150 ${
          isResizing ? "bg-primary-container" : "hover:bg-primary-container/50"
        }`}
      />
    </aside>
  );
}

interface LinkSectionProps {
  title: string;
  links: QuickAccessDir[];
  activePath: string | null;
  onNavigate: (path: string) => void;
  onDrop: DropHandler;
  resolveIcon?: (link: QuickAccessDir) => ComponentType<LucideProps>;
}

function LinkSection({ title, links, activePath, onNavigate, onDrop, resolveIcon }: LinkSectionProps) {
  if (links.length === 0) return null;

  return (
    <div>
      <div className="px-2 pb-1.5 font-mono text-[11px] font-medium tracking-wide text-outline uppercase">
        {title}
      </div>
      {links.map((link) => (
        <LinkButton
          key={link.path}
          link={link}
          active={link.path === activePath}
          onNavigate={onNavigate}
          onDrop={onDrop}
          icon={resolveIcon?.(link)}
        />
      ))}
    </div>
  );
}

interface LinkButtonProps {
  link: QuickAccessDir;
  active: boolean;
  onNavigate: (path: string) => void;
  onDrop: DropHandler;
  icon?: ComponentType<LucideProps>;
}

function LinkButton({ link, active, onNavigate, onDrop, icon }: LinkButtonProps) {
  const dropTarget = useDropTarget(link.path, onDrop);
  const Icon = icon ?? folderIcon(link.name);

  return (
    <button
      onClick={() => onNavigate(link.path)}
      onDragOver={dropTarget.onDragOver}
      onDragLeave={dropTarget.onDragLeave}
      onDrop={dropTarget.onDrop}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors duration-150 hover:bg-surface-container ${focusRing} ${
        active ? "bg-surface-container-high text-primary" : "text-on-surface"
      } ${dropTarget.isOver ? "outline-2 -outline-offset-2 outline-primary-container" : ""}`}
    >
      <Icon size={15} strokeWidth={1.75} className={active ? "text-primary" : "text-outline"} />
      <span className="truncate">{link.name}</span>
    </button>
  );
}

interface FavoriteItemProps {
  path: string;
  active: boolean;
  onNavigate: (path: string) => void;
  onUnstar: (path: string) => void;
  onDrop: DropHandler;
}

function FavoriteItem({ path, active, onNavigate, onUnstar, onDrop }: FavoriteItemProps) {
  const dropTarget = useDropTarget(path, onDrop);
  const Icon = folderIcon(basename(path));

  return (
    <div
      onDragOver={dropTarget.onDragOver}
      onDragLeave={dropTarget.onDragLeave}
      onDrop={dropTarget.onDrop}
      className={`group flex items-center gap-2 rounded-lg pr-1 pl-2 transition-colors duration-150 hover:bg-surface-container ${
        active ? "bg-surface-container-high text-primary" : "text-on-surface"
      } ${dropTarget.isOver ? "outline-2 -outline-offset-2 outline-primary-container" : ""}`}
    >
      <Icon size={15} strokeWidth={1.75} className={active ? "text-primary" : "text-outline"} />
      <button
        onClick={() => onNavigate(path)}
        className={`min-w-0 flex-1 truncate py-1.5 text-left text-[13px] ${focusRing}`}
      >
        {basename(path)}
      </button>
      <button
        title="Remove favorite"
        onClick={() => onUnstar(path)}
        className={`rounded p-1 text-outline opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-surface-container-highest hover:text-on-surface focus-visible:opacity-100 ${focusRing}`}
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
