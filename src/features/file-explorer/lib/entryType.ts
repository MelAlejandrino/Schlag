import type { Entry } from "../file-explorer.types";

// A dot at index 0 is a dotfile (".gitignore"), not an extension — same
// treatment as previewKind.ts's own extensionOf (duplicated here rather than
// imported: the two serve different purposes — previewKind categorizes into
// broad renderer buckets, this shows the literal extension — and it's four
// lines, not worth a cross-file dependency for).
function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return undefined;
  return name.slice(dot + 1).toUpperCase();
}

// The "Type" column/grouping value is the extension itself ("PNG", "TXT"),
// not an OS-style friendly name ("PNG Image", "Text Document") — a deliberate
// v1 tradeoff, same honesty-over-polish call as PreviewPane's Office banner.
export function entryTypeLabel(entry: Entry): string {
  if (entry.is_dir) return "Folder";
  return extensionOf(entry.name) ?? "File";
}
