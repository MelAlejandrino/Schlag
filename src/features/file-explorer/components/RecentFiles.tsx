import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { fileExplorerService } from "../services/file-explorer.service";
import { useFileExplorer } from "../useFileExplorer";
import { useIndexStatus } from "../lib/useIndexStatus";
import { formatDate } from "../lib/format";
import { FileTypeIcon } from "../lib/fileTypeIcon";
import { ContextMenu } from "./ContextMenu";
import type { Entry } from "../file-explorer.types";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface";

interface RowMenuState {
  x: number;
  y: number;
  entry: Entry;
}

// Self-contained, like SearchModal: calls useFileExplorer() itself to reach
// the explicit-target entry actions (openEntry/renameEntry/etc.) that were
// already built for search results — no plumbing needed here or in
// useFileExplorer.ts. ThisPCView passes only spacing (className), same as
// every other TileSection here.
export function RecentFiles({ className = "" }: { className?: string }) {
  const explorer = useFileExplorer();
  const indexStatus = useIndexStatus();
  const [files, setFiles] = useState<Entry[] | null>(null);
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null);

  // Fetched fresh on every mount rather than cached in the store — ThisPCView
  // unmounts this component whenever the user navigates away, so revisiting
  // "This PC" already gets a fresh list for free.
  useEffect(() => {
    let cancelled = false;
    fileExplorerService.recentFiles().then((result) => {
      if (!cancelled) setFiles(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Same click-outside-closes pattern SearchModal uses for its own local
  // result-row context menu.
  useEffect(() => {
    if (!rowMenu) return;
    const close = () => setRowMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
    };
  }, [rowMenu]);

  return (
    <div className={className}>
      <div className="pb-2.5 font-mono text-[11px] tracking-wide text-outline uppercase">Recent Files</div>

      {files === null ? (
        <RecentFilesSkeleton />
      ) : files.length === 0 ? (
        <RecentFilesEmpty scanning={indexStatus?.scanning ?? false} />
      ) : (
        <div className="divide-y divide-surface-container-highest overflow-hidden rounded-lg border border-surface-container-highest">
          {files.map((entry) => (
            <RecentFileRow
              key={entry.path}
              entry={entry}
              onOpen={() => explorer.openEntry(entry)}
              onContextMenu={(x, y) => setRowMenu({ x, y, entry })}
            />
          ))}
        </div>
      )}

      {rowMenu && (
        <div onClick={(e) => e.stopPropagation()}>
          <ContextMenu
            state={{ x: rowMenu.x, y: rowMenu.y, background: false }}
            selectedCount={1}
            selectedIsDir={false}
            canPaste={false}
            isCurrentFavorite={false}
            onOpen={() => {
              setRowMenu(null);
              explorer.openEntry(rowMenu.entry);
            }}
            onOpenLocation={() => {
              setRowMenu(null);
              explorer.openFileLocation(rowMenu.entry);
            }}
            onOpenWith={() => {
              setRowMenu(null);
              explorer.openEntryWith(rowMenu.entry);
            }}
            onRename={() => {
              setRowMenu(null);
              explorer.renameEntry(rowMenu.entry);
            }}
            onCopy={() => {
              setRowMenu(null);
              explorer.copyEntryToClipboard(rowMenu.entry);
            }}
            onCut={() => {
              setRowMenu(null);
              explorer.cutEntryToClipboard(rowMenu.entry);
            }}
            onPaste={() => {}}
            onDelete={() => {
              setRowMenu(null);
              explorer.deleteEntryPrompt(rowMenu.entry);
            }}
            onProperties={() => {
              setRowMenu(null);
              explorer.showEntryProperties(rowMenu.entry);
            }}
            onNewFolder={() => {}}
            onNewFile={() => {}}
            onRefresh={() => {}}
            onToggleFavorite={() => {}}
          />
        </div>
      )}
    </div>
  );
}

interface RecentFileRowProps {
  entry: Entry;
  onOpen: () => void;
  onContextMenu: (x: number, y: number) => void;
}

function RecentFileRow({ entry, onOpen, onContextMenu }: RecentFileRowProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e.clientX, e.clientY);
      }}
      className={`flex w-full cursor-default flex-col gap-0.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-container-highest ${focusRing}`}
    >
      <div className="flex items-center gap-2 text-[13px]">
        <FileTypeIcon name={entry.name} size={15} />
        <span className="truncate font-medium text-on-surface">{entry.name}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-outline">{formatDate(entry.modified_ms)}</span>
      </div>
      <p className="truncate pl-[23px] text-[11px] text-outline" title={entry.path}>
        {entry.path}
      </p>
    </button>
  );
}

function RecentFilesSkeleton() {
  return (
    <div className="divide-y divide-surface-container-highest overflow-hidden rounded-lg border border-surface-container-highest">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-[15px] w-[15px] shrink-0 animate-pulse rounded bg-surface-container-highest" />
            <div className="h-3 w-32 animate-pulse rounded bg-surface-container-highest" />
            <div className="ml-auto h-3 w-16 animate-pulse rounded bg-surface-container-highest" />
          </div>
          <div className="ml-[23px] h-2.5 w-48 animate-pulse rounded bg-surface-container-highest" />
        </div>
      ))}
    </div>
  );
}

function RecentFilesEmpty({ scanning }: { scanning: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-surface-container-highest px-4 py-8 text-center">
      <Clock size={20} strokeWidth={1.5} className="text-outline" />
      <p className="text-[13px] text-on-surface-variant">{scanning ? "Indexing your files…" : "No recently modified files yet"}</p>
      <p className="text-[11px] text-outline">
        {scanning ? "Recent files will appear here once indexing catches up." : "Files you edit will show up here."}
      </p>
    </div>
  );
}
