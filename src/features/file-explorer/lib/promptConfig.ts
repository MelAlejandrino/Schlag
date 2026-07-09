import { FilePlus, FolderPlus, Pencil } from "lucide-react";
import type { PromptModalConfig } from "../components/PromptModal";
import type { Entry } from "../file-explorer.types";

export type PromptKind = "new-folder" | "new-file" | "rename";

// Windows reserves these in filenames regardless of filesystem — catching it
// here beats a round trip to the backend just to learn the name is invalid.
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/;

function validateFilename(value: string): string | null {
  if (!value.trim()) return "Name can't be empty.";
  if (INVALID_FILENAME_CHARS.test(value)) return `Name can't contain ${'< > : " / \\ | ? *'}`;
  return null;
}

interface PromptContext {
  selectedEntries: Entry[];
}

// Pure derivation (no hooks, no side effects) of what PromptModal should
// show for whichever prompt is currently open — kept out of useFileExplorer
// itself only because of its size, not because it needs to live outside a
// hook; it's still business logic, not presentation.
export function getPromptConfig(kind: PromptKind, ctx: PromptContext): PromptModalConfig | null {
  const { selectedEntries } = ctx;

  switch (kind) {
    case "new-folder":
      return {
        icon: FolderPlus,
        title: "New Folder",
        label: "Name",
        initialValue: "",
        placeholder: "New folder",
        confirmLabel: "Create",
        validate: validateFilename,
      };

    case "new-file":
      return {
        icon: FilePlus,
        title: "New File",
        label: "Name",
        initialValue: "",
        placeholder: "New file.txt",
        confirmLabel: "Create",
        validate: validateFilename,
      };

    case "rename": {
      const entry = selectedEntries[0];
      if (!entry) return null;
      return {
        icon: Pencil,
        title: "Rename",
        label: "New name",
        initialValue: entry.name,
        confirmLabel: "Rename",
        validate: validateFilename,
      };
    }
  }
}
