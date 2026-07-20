import { useEffect } from "react";
import { fileExplorerService } from "./services/file-explorer.service";
import { useSearchStore } from "./store/search.store";
import { useFileExplorerStore } from "./store/file-explorer.store";
import { useDebouncedValue } from "./lib/useDebouncedValue";
import { promoteExactMatch } from "./lib/promoteExactMatch";
import { filterContentResults } from "./lib/filterContentResults";
import { THIS_PC, type SearchFilters } from "./file-explorer.types";

const DEBOUNCE_MS = 250;

// A manually-set folder filter always wins over the current-folder default —
// setting it is a deliberate, specific choice. The one-shot scopeFolder
// (from "Search in folder" context menu) also takes precedence.
// "This PC" has no real folder to scope to, so it's treated the same as
// scoping being turned off.
function withScope(filters: SearchFilters, scopeToFolder: boolean, currentPath: string, scopeFolder: string | null): SearchFilters {
  if (filters.folder) return filters;
  if (scopeFolder) return { ...filters, folder: scopeFolder };
  if (!scopeToFolder || currentPath === THIS_PC) return filters;
  return { ...filters, folder: currentPath };
}

// Read/act on search state — safe to call from multiple components (backed
// by a shared Zustand store). Does not itself trigger a search; that's
// `useSearchTrigger()`'s job, called from exactly one place (SearchModal), so
// typing doesn't fire the debounced backend call once per caller.
export function useSearch() {
  const search = useSearchStore();

  // Loosely typed on purpose: both filename (Entry) and content
  // (ContentSearchResult) results carry path/is_dir/name, and this is the
  // only part of either shape opening a result actually needs.
  function openResult(entry: { path: string; is_dir: boolean }) {
    if (entry.is_dir) {
      useFileExplorerStore.getState().navigate(entry.path);
    } else {
      fileExplorerService.openFile(entry.path).catch((e) => useSearchStore.setState({ error: String(e) }));
    }
    // Either way the search task is done — close the modal and clear the
    // query so reopening starts fresh, rather than leaving stale results
    // from whatever you just navigated away from or opened.
    search.clear();
    search.closeSearch();
  }

  return {
    ...search,
    hasActiveQuery: search.query.trim().length > 0,
    // "billing.pdf" should outrank "old_billing.pdf" once the query is the
    // exact name typed — a pure client-side reorder over whatever page of
    // results already came back, not a second backend query.
    orderedResults: promoteExactMatch(search.results, search.query),
    orderedContentResults: filterContentResults(promoteExactMatch(search.contentResults, search.query), search.filters),
    openResult,
  };
}

// Debounces the query/filters and fires `search_files`/`search_content`
// (depending on mode) when they settle. Call this exactly once (from
// SearchModal, the only component that lets the user change query/filters)
// — calling it more than once would fire the same debounced search
// redundantly from each call site.
export function useSearchTrigger() {
  const isOpen = useSearchStore((s) => s.isOpen);
  const query = useSearchStore((s) => s.query);
  const filters = useSearchStore((s) => s.filters);
  const scopeToFolder = useSearchStore((s) => s.scopeToFolder);
  const scopeFolder = useSearchStore((s) => s.scopeFolder);
  const mode = useSearchStore((s) => s.mode);
  const keywordMode = useSearchStore((s) => s.keywordMode);
  const runSearch = useSearchStore((s) => s.runSearch);
  const runContentSearch = useSearchStore((s) => s.runContentSearch);
  const currentPath = useFileExplorerStore((s) => s.currentPath);
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);
  const debouncedFilters = useDebouncedValue(filters, DEBOUNCE_MS);

  // No point querying the backend while the modal is closed — the modal
  // being closed doesn't clear query/results (see search.store.ts), so this
  // guard is what actually stops a closed-but-not-yet-reopened search from
  // firing on every keystroke that happened before it was closed.
  useEffect(() => {
    if (!isOpen) return;
    if (mode === "content") {
      runContentSearch(debouncedQuery, withScope(debouncedFilters, scopeToFolder, currentPath, scopeFolder).folder, keywordMode);
    } else {
      runSearch(debouncedQuery, withScope(debouncedFilters, scopeToFolder, currentPath, scopeFolder), keywordMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, debouncedQuery, debouncedFilters, scopeToFolder, scopeFolder, mode, keywordMode, currentPath]);

  // Results are a snapshot from whenever they were last fetched — if a file
  // shown in results gets deleted (or a new one added) somewhere else, e.g.
  // via the OS's own file explorer, switching back to this window wouldn't
  // otherwise re-run the query, so the stale result would just sit there
  // until the user happens to retype something.
  useEffect(() => {
    function refetchOnFocus() {
      const current = useSearchStore.getState();
      if (!current.isOpen || !current.query.trim()) return;
      const path = useFileExplorerStore.getState().currentPath;
      if (current.mode === "content") {
        runContentSearch(current.query, withScope(current.filters, current.scopeToFolder, path, current.scopeFolder).folder, current.keywordMode);
      } else {
        runSearch(current.query, withScope(current.filters, current.scopeToFolder, path, current.scopeFolder), current.keywordMode);
      }
    }
    window.addEventListener("focus", refetchOnFocus);
    return () => window.removeEventListener("focus", refetchOnFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
