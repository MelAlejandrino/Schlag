export interface Entry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_ms: number;
}

export interface QuickAccessDir {
  name: string;
  path: string;
}

export interface ContextMenuState {
  x: number;
  y: number;
  // Background menus (right-click on empty space, not a row) show a reduced
  // item set (Paste only) instead of the per-entry actions.
  background: boolean;
}

export type ClipboardOp = "copy" | "cut";

export interface ClipboardState {
  paths: string[];
  op: ClipboardOp;
}

export interface IndexStatus {
  scanning: boolean;
  indexed_count: number;
}

// All fields optional — omitted/undefined means unfiltered. Tags isn't here:
// the SQLite index has no tags column yet (Phase 5).
export interface SearchFilters {
  extension?: string;
  min_size?: number;
  max_size?: number;
  modified_after_ms?: number;
  modified_before_ms?: number;
  folder?: string;
  regex?: string;
}

// A Tantivy full-text content match — deliberately not just an `Entry` plus
// a snippet field bolted on, since content search's own filters are a
// subset of SearchFilters (folder scope only, see search.store.ts). The
// snippet is plain text plus highlight byte ranges, not pre-built HTML —
// Tantivy's own `Snippet::to_html()` doesn't escape the surrounding
// fragment, and that fragment is raw file content the app doesn't control,
// so rendering it as trusted HTML would be a real XSS vector. Highlights are
// built client-side via plain (auto-escaping) JSX span-splitting instead.
export interface ContentSearchResult {
  path: string;
  name: string;
  is_dir: boolean;
  size: number;
  modified_ms: number;
  snippet: string;
  highlight_ranges: [number, number][];
}

// Virtual location, not a real filesystem path — selecting it shows Quick
// Access + Drives as content (like Explorer's "This PC"), no directory listing.
export const THIS_PC = "this-pc";

export interface ArchiveEntry {
  name: string;
  size: number;
  is_dir: boolean;
}
