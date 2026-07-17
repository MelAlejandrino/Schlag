import type { ContentSearchResult, SearchFilters } from "../file-explorer.types";
import { basename } from "./path";

// Client-side filter over content search results. The Tantivy backend only
// accepts query + folder + keywordMode, so extension/size/date/regex filters
// are applied here after results come back.
export function filterContentResults(results: ContentSearchResult[], filters: SearchFilters): ContentSearchResult[] {
  return results.filter((r) => {
    if (filters.extension) {
      const ext = basename(r.name).split(".").pop()?.toLowerCase() ?? "";
      if (ext !== filters.extension.toLowerCase()) return false;
    }
    if (filters.min_size !== undefined && r.size < filters.min_size) return false;
    if (filters.max_size !== undefined && r.size > filters.max_size) return false;
    if (filters.modified_after_ms !== undefined && r.modified_ms < filters.modified_after_ms) return false;
    if (filters.modified_before_ms !== undefined && r.modified_ms > filters.modified_before_ms) return false;
    if (filters.regex) {
      try {
        if (!new RegExp(filters.regex).test(r.name)) return false;
      } catch {
        // Invalid regex — ignore rather than crashing.
      }
    }
    return true;
  });
}
