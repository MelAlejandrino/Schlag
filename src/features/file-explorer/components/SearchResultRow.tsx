import { File as FileIcon, Folder as FolderIcon } from "lucide-react";
import type { ContentSearchResult, Entry } from "../file-explorer.types";
import { formatDate } from "../lib/format";
import { splitHighlights } from "../lib/highlightSnippet";

export type SearchResult = Entry | ContentSearchResult;

export function isContentResult(item: SearchResult): item is ContentSearchResult {
  return "snippet" in item;
}

interface SearchResultRowProps {
  item: SearchResult;
  index: number;
  highlighted: boolean;
  onHover: () => void;
  onOpen: () => void;
  onContextMenu: (x: number, y: number) => void;
}

// A single search result — shared by the floating search's results panel.
// Hover moves the highlight (so ↑/↓ + Enter act on whatever the pointer is
// over); opening is double-click or Enter, matching EntryTable/EntryGrid so a
// stray click can't fire off the wrong file.
export function SearchResultRow({ item, index, highlighted, onHover, onOpen, onContextMenu }: SearchResultRowProps) {
  const Icon = item.is_dir ? FolderIcon : FileIcon;

  return (
    <div
      id={`search-result-${index}`}
      data-index={index}
      role="option"
      aria-selected={highlighted}
      onMouseEnter={onHover}
      onDoubleClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e.clientX, e.clientY);
      }}
      className={`flex cursor-default flex-col gap-0.5 px-4 py-2 transition-colors duration-100 select-none ${
        highlighted ? "bg-surface-container-highest" : ""
      }`}
    >
      <div className="flex items-center gap-2 text-[13px]">
        <Icon size={15} strokeWidth={1.75} className={item.is_dir ? "shrink-0 text-primary" : "shrink-0 text-outline"} />
        <span className={`truncate font-medium ${highlighted ? "text-primary" : "text-on-surface"}`}>{item.name}</span>
        {!isContentResult(item) && (
          <span className="ml-auto shrink-0 font-mono text-[11px] text-outline">{formatDate(item.modified_ms)}</span>
        )}
      </div>
      <p className="truncate pl-[23px] text-[11px] text-outline" title={item.path}>
        {item.path}
      </p>
      {isContentResult(item) && (
        <p className="line-clamp-2 pl-[23px] text-[12px] leading-snug text-on-surface-variant">
          {splitHighlights(item.snippet, item.highlight_ranges).map((seg, i) =>
            seg.highlighted ? (
              <mark key={i} className="rounded-sm bg-primary-container/30 px-0.5 text-primary">
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      )}
    </div>
  );
}
