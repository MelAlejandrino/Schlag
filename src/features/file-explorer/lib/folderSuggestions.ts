import type { QuickAccessDir } from "../file-explorer.types";

// Shared by SearchBox's folder filter and PromptModal's copy/move
// destination field — both want "places the user has already marked as
// meaningful" as suggestions, deduped since a favorite can also be a quick
// access folder.
export function folderSuggestions(favorites: string[], quickAccess: QuickAccessDir[]): string[] {
  return Array.from(new Set([...favorites, ...quickAccess.map((q) => q.path)]));
}
