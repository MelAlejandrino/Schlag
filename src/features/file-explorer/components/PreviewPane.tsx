import { useEffect, useState } from "react";
import { File as FileIcon, FileQuestion, Folder as FolderIcon, Loader2, X } from "lucide-react";
import Markdown from "react-markdown";
import { fileExplorerService } from "../services/file-explorer.service";
import { previewKind } from "../lib/previewKind";
import { formatSize } from "../lib/format";
import { usePreviewResize } from "../lib/usePreviewResize";
import type { ArchiveEntry, Entry } from "../file-explorer.types";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-lowest";

interface PreviewPaneProps {
  entry: Entry | null;
  onClose: () => void;
}

// Markdown/Text/Office all go through the same backend text-extraction
// command (preview_text, which just delegates to content_index.rs's
// extract_text) — this state only needs one "text" shape for all three, plus
// "archive" for the zip-listing command. Image/Video/PDF never reach this
// state at all: they render straight from an asset:// URL with no backend
// round-trip, so they're handled entirely in the JSX below, not here.
type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "text"; text: string | null }
  | { status: "archive"; entries: ArchiveEntry[]; truncated: boolean };

// Reused by both the "nothing selected" and "can't preview this" cases —
// same shape, different message/icon.
function EmptyState({ message, icon: Icon = FileQuestion }: { message: string; icon?: typeof FileQuestion }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Icon size={22} strokeWidth={1.5} className="text-outline" />
      <p className="text-[12px] text-outline">{message}</p>
    </div>
  );
}

function ArchiveList({ entries, truncated }: { entries: ArchiveEntry[]; truncated: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 rounded px-1.5 py-1 text-[12px]">
          {entry.is_dir ? (
            <FolderIcon size={13} strokeWidth={1.75} className="shrink-0 text-primary" />
          ) : (
            <FileIcon size={13} strokeWidth={1.75} className="shrink-0 text-outline" />
          )}
          <span className="min-w-0 flex-1 truncate text-on-surface">{entry.name}</span>
          <span className="shrink-0 font-mono text-[11px] text-outline">{formatSize(entry.size, entry.is_dir)}</span>
        </div>
      ))}
      {truncated && (
        <p className="px-1.5 py-1.5 text-[11px] text-outline">Showing the first {entries.length} entries — more exist.</p>
      )}
    </div>
  );
}

// A resizable right-side panel mirroring Sidebar's resizable left-side one —
// same interaction language (usePreviewResize is useSidebarResize's mirror,
// both built on the shared useDragResize mechanics), same handle-as-sibling
// structure so the handle isn't clipped by the scrollable content's own
// overflow (see Sidebar.tsx's identical comment on why).
export function PreviewPane({ entry, onClose }: PreviewPaneProps) {
  const { width, isResizing, onResizeStart, onResizeMove, onResizeEnd } = usePreviewResize();
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const kind = entry ? previewKind(entry.name) : "unsupported";

  useEffect(() => {
    if (!entry || entry.is_dir) {
      setState({ status: "idle" });
      return;
    }
    if (kind === "markdown" || kind === "text" || kind === "office") {
      setState({ status: "loading" });
      fileExplorerService
        .previewText(entry.path)
        .then((text) => setState({ status: "text", text }))
        .catch((e) => setState({ status: "error", message: String(e) }));
    } else if (kind === "archive") {
      setState({ status: "loading" });
      fileExplorerService
        .listArchiveEntries(entry.path)
        .then(([entries, truncated]) => setState({ status: "archive", entries, truncated }))
        .catch((e) => setState({ status: "error", message: String(e) }));
    } else {
      // image/video/pdf render directly from an asset URL below, no fetch
      // needed; anything else falls through to the "can't preview" state.
      setState({ status: "idle" });
    }
  }, [entry, kind]);

  return (
    <aside className="relative flex shrink-0" style={{ width }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize preview pane"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        className={`absolute top-0 left-0 -ml-0.5 h-full w-1.5 shrink-0 cursor-col-resize touch-none transition-colors duration-150 ${
          isResizing ? "bg-primary-container" : "hover:bg-primary-container/50"
        }`}
      />

      <div className="flex min-w-0 flex-1 flex-col border-l border-surface-container-highest bg-surface-container-lowest">
        <div className="flex items-center gap-2 border-b border-surface-container-highest px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-on-surface">
            {entry?.name ?? "Preview"}
          </span>
          <button
            type="button"
            title="Close preview"
            onClick={onClose}
            className={`shrink-0 rounded p-1 text-outline transition-colors duration-150 hover:bg-surface-container-highest hover:text-on-surface ${focusRing}`}
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>

        <div className="themed-scroll min-h-0 flex-1 overflow-y-auto p-3">
          {!entry ? (
            <EmptyState message="Select a file to preview it here." />
          ) : entry.is_dir ? (
            <EmptyState message="Folders don't have a preview." icon={FolderIcon} />
          ) : kind === "image" ? (
            <img src={fileExplorerService.assetUrl(entry.path)} alt={entry.name} className="max-w-full rounded" />
          ) : kind === "video" ? (
            <video src={fileExplorerService.assetUrl(entry.path)} controls className="max-w-full rounded" />
          ) : kind === "pdf" ? (
            <embed
              src={fileExplorerService.assetUrl(entry.path)}
              type="application/pdf"
              className="h-full min-h-[60vh] w-full rounded"
            />
          ) : state.status === "loading" ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={18} strokeWidth={2} className="animate-spin text-outline" />
            </div>
          ) : state.status === "error" ? (
            <EmptyState message={`Couldn't preview this file (${state.message}).`} />
          ) : state.status === "archive" ? (
            <ArchiveList entries={state.entries} truncated={state.truncated} />
          ) : state.status === "text" ? (
            state.text === null ? (
              <EmptyState message="Couldn't preview this file." />
            ) : kind === "markdown" ? (
              <div className="markdown-preview text-[13px] text-on-surface">
                <Markdown>{state.text}</Markdown>
              </div>
            ) : (
              <>
                {kind === "office" && (
                  <p className="mb-2 rounded bg-surface-container px-2 py-1 text-[11px] text-outline">
                    Showing extracted text, not the original formatting.
                  </p>
                )}
                <pre className="whitespace-pre-wrap font-mono text-[12px] text-on-surface-variant">{state.text}</pre>
              </>
            )
          ) : (
            <EmptyState message="This file type can't be previewed yet." />
          )}
        </div>
      </div>
    </aside>
  );
}
