import type { Entry } from "../file-explorer.types";

// Client-side substring filter over the already-loaded listing — case-
// insensitive match on the entry name, no backend. Empty/whitespace query
// returns the array unchanged (same reference). Shared by the store's
// selectRange (which slices entries by index and so must see the exact same
// visible set the view renders) and useFileExplorer's visibleEntries.
export function filterEntries(entries: Entry[], query: string): Entry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.name.toLowerCase().includes(q));
}
