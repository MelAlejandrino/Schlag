import type { Entry } from "../file-explorer.types";
import { entryTypeLabel } from "./entryType";

export type SortKey = "name" | "type" | "size" | "modified";
export type SortDirection = "asc" | "desc";

function compareByKey(a: Entry, b: Entry, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    case "type":
      return entryTypeLabel(a).localeCompare(entryTypeLabel(b));
    case "size":
      return a.size - b.size;
    case "modified":
      return a.modified_ms - b.modified_ms;
  }
}

// The chosen key applies uniformly to every entry, folders included — no
// forced folders-first tiebreak. (An earlier version forced folders first,
// modeled on Explorer's own default; dropped after explicit feedback that
// it made "sort by date modified, descending" visibly not do what it says.)
export function sortEntries(entries: Entry[], key: SortKey, direction: SortDirection): Entry[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => sign * compareByKey(a, b, key));
}
