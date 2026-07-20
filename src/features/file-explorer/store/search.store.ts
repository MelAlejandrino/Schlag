import { create } from "zustand/react";
import { fileExplorerService } from "../services/file-explorer.service";
import type { ContentSearchResult, Entry, SearchFilters } from "../file-explorer.types";

type SearchMode = "filename" | "content";

interface SearchState {
  // Whether the SearchModal overlay is open. The query/results are kept on
  // close (not cleared) so reopening resumes where you left off — only a
  // successful "open a result" clears the search, since that's the point
  // where the task is actually done.
  isOpen: boolean;
  query: string;
  filters: SearchFilters;
  // Whether search is scoped to the currently browsed folder (and its
  // subfolders) by default. A manual `filters.folder` value always takes
  // precedence over this — see useSearchTrigger().
  scopeToFolder: boolean;
  // Filename search (fast, trigram-indexed, all SearchFilters apply) vs
  // content search (Tantivy full-text over file contents, folder scope
  // only — see SearchBox's disabled-filters note). A lasting session
  // preference like scopeToFolder, not per-query state — not reset by
  // clear().
  mode: SearchMode;
  // Phrase (default, exact contiguous match) vs Keywords (every word must be
  // present somewhere, any order — see search.rs's build_keyword_match /
  // content_index.rs's keyword_query). A lasting session preference like
  // mode/scopeToFolder, not per-query state — not reset by clear().
  keywordMode: boolean;
  results: Entry[];
  contentResults: ContentSearchResult[];
  isSearching: boolean;
  error: string | null;

  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
  setFilters: (filters: SearchFilters) => void;
  setScopeToFolder: (scopeToFolder: boolean) => void;
  setMode: (mode: SearchMode) => void;
  setKeywordMode: (keywordMode: boolean) => void;
  runSearch: (query: string, filters: SearchFilters, keywordMode: boolean) => Promise<void>;
  runContentSearch: (query: string, folder: string | undefined, keywordMode: boolean) => Promise<void>;
  clear: () => void;
  clearError: () => void;
}

// A slower earlier request resolving after a newer one would otherwise
// overwrite fresher results with stale ones — this tags each call and only
// commits state if it's still the most recent by the time it resolves.
// Shared between runSearch/runContentSearch: switching modes mid-flight
// should also drop a stale response from the mode just left.
let latestRequestId = 0;

// Ephemeral — unlike file-explorer.store.ts, nothing here is persisted.
// Search has its own lifecycle, unrelated to navigation history.
export const useSearchStore = create<SearchState>()((set) => ({
  isOpen: false,
  query: "",
  filters: {},
  scopeToFolder: true,
  mode: "filename",
  keywordMode: false,
  results: [],
  contentResults: [],
  isSearching: false,
  error: null,

  openSearch: () => set({ isOpen: true }),
  closeSearch: () => set({ isOpen: false }),
  setQuery: (query) => set({ query }),
  setFilters: (filters) => set({ filters }),
  setScopeToFolder: (scopeToFolder) => set({ scopeToFolder }),
  setMode: (mode) => set({ mode }),
  setKeywordMode: (keywordMode) => set({ keywordMode }),

  runSearch: async (query, filters, keywordMode) => {
    const requestId = ++latestRequestId;
    if (!query.trim()) {
      if (requestId === latestRequestId) set({ results: [], isSearching: false, error: null });
      return;
    }
    set({ isSearching: true });
    try {
      const results = await fileExplorerService.searchFiles(query, filters, keywordMode);
      if (requestId === latestRequestId) set({ results, isSearching: false, error: null });
    } catch (e) {
      if (requestId === latestRequestId) set({ isSearching: false, error: String(e) });
    }
  },

  runContentSearch: async (query, folder, keywordMode) => {
    const requestId = ++latestRequestId;
    if (!query.trim()) {
      if (requestId === latestRequestId) set({ contentResults: [], isSearching: false, error: null });
      return;
    }
    set({ isSearching: true });
    try {
      const contentResults = await fileExplorerService.searchContent(query, folder, keywordMode);
      if (requestId === latestRequestId) set({ contentResults, isSearching: false, error: null });
    } catch (e) {
      if (requestId === latestRequestId) set({ isSearching: false, error: String(e) });
    }
  },

  clear: () => set({ query: "", filters: {}, results: [], contentResults: [], isSearching: false, error: null }),
  clearError: () => set({ error: null }),
}));
