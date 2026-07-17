# Codebase Audit: Issues & Fixes

> This file documents all code quality issues found during the audit.
> Delete this file once all items are resolved.

---

## Priority 1: Extract `modified_ms` helper (Rust backend)

**Problem:** The same 6-line `modified_ms` calculation is copy-pasted in 6 places across 3 files:

```rust
meta.modified()
    .ok()
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
```

**Locations:**
- `src-tauri/src/fs_ops.rs:87-92` (in `list_dir`)
- `src-tauri/src/fs_ops.rs:151` (in `rename_entry`)
- `src-tauri/src/fs_ops.rs:184` (in `move_entry`)
- `src-tauri/src/fs_ops.rs:260-263` (in `index_tree`)
- `src-tauri/src/database.rs:213-218` (in `row_from_path`)
- `src-tauri/src/indexer.rs:673-678` (in `make_row`)

**Fix:**
1. Add to `database.rs` (after the `use` statements, before `pub struct FileRow`):
   ```rust
   use std::time::UNIX_EPOCH;

   /// Extracts the last-modified time from filesystem metadata as milliseconds
   /// since the Unix epoch. Returns 0 if the timestamp is unavailable.
   pub fn modified_ms(meta: &std::fs::Metadata) -> u64 {
       meta.modified()
           .ok()
           .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
           .map(|d| d.as_millis() as u64)
           .unwrap_or(0)
   }
   ```
2. Replace all 6 inline calculations with `database::modified_ms(&meta)` or `database::modified_ms(&entry.metadata().ok()?)` as appropriate.
3. Remove `use std::time::UNIX_EPOCH;` from `fs_ops.rs` (line 7) since it's no longer used there.

---

## Priority 2: Fix `conn.lock().unwrap()` with poison recovery (Rust backend)

**Problem:** If any code panics while holding the `Mutex<Connection>`, all subsequent `.unwrap()` calls on the mutex will also panic (mutex is poisoned), permanently killing the indexer thread with no recovery.

**Locations (all in `src-tauri/src/indexer.rs`):**
- Line 492: `conn.lock().unwrap()` (WAL checkpoint)
- Line 540: `conn.lock().unwrap()` (in `scan_drive`)
- Line 569: `conn.lock().unwrap()` (in `walk_subtree`)
- Line 572: `conn.lock().unwrap()` (in `walk_subtree`)
- Line 588: `conn.lock().unwrap()` (in `prune_stale_entries`)

**Fix:** Replace every `conn.lock().unwrap()` with:
```rust
conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
```

This recovers from a poisoned mutex instead of panicking, matching the pattern already used in `terminal.rs`.

---

## Priority 3: Add error logging to `database::index_path`/`remove_path`

**Problem:** Database errors (disk full, corruption, lock poisoned) are silently discarded with `let _ =`. Failures are invisible.

**Locations (both in `src-tauri/src/database.rs`):**
- Lines 232-238: `index_path` — `let _ = upsert_entry(&c, &row);`
- Lines 242-248: `remove_path` — `let _ = delete_by_path(&c, p);`

**Fix:**
```rust
pub fn index_path(conn: &Mutex<Connection>, path: &Path) {
    if let Some(row) = row_from_path(path) {
        if let Ok(c) = conn.lock() {
            if let Err(e) = upsert_entry(&c, &row) {
                tracing::warn!("failed to index {}: {e}", path.display());
            }
        }
    }
}

pub fn remove_path(conn: &Mutex<Connection>, path: &Path) {
    if let Some(p) = path.to_str() {
        if let Ok(c) = conn.lock() {
            if let Err(e) = delete_by_path(&c, p) {
                tracing::warn!("failed to remove {p} from index: {e}");
            }
        }
    }
}
```

---

## Priority 4: Memoize `selectedSize`/`totalSize` in FileExplorerView.tsx

**Problem:** Two `reduce` calls iterate over all selected/visible entries on every render, even when nothing changed. In folders with thousands of files, this is O(n) wasted work every render.

**Location:** `src/features/file-explorer/FileExplorerView.tsx:31-32`
```tsx
const selectedSize = explorer.selectedEntries.reduce((sum, e) => sum + (e.is_dir ? 0 : e.size), 0);
const totalSize = explorer.visibleEntries.reduce((sum, e) => sum + (e.is_dir ? 0 : e.size), 0);
```

**Fix:** Import `useMemo` from React, then:
```tsx
const selectedSize = useMemo(
  () => explorer.selectedEntries.reduce((sum, e) => sum + (e.is_dir ? 0 : e.size), 0),
  [explorer.selectedEntries]
);
const totalSize = useMemo(
  () => explorer.visibleEntries.reduce((sum, e) => sum + (e.is_dir ? 0 : e.size), 0),
  [explorer.visibleEntries]
);
```

---

## Priority 5: Fix double zip-open in `extract_pptx_text`

**Problem:** `extract_pptx_text` opens the same zip file twice: once to list slide names, then drops the archive and calls `text_from_zip_parts` which opens it again internally.

**Location:** `src-tauri/src/content_index.rs:201-216`
```rust
fn extract_pptx_text(path: &Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;       // open #1
    let archive = ZipArchive::new(file).ok()?;         // parse #1
    let mut slides: Vec<(u32, String)> = /* ... */;
    drop(archive);                                      // drop
    let parts: Vec<String> = slides.into_iter().map(|(_, name)| name).collect();
    text_from_zip_parts(path, &parts)                   // open #2, parse #2 inside
}
```

**Fix:** Refactor `text_from_zip_parts` to accept a `ZipArchive` reference instead of a path. Create a new helper or restructure `extract_pptx_text` to pass the already-opened archive. One approach:

1. Change `text_from_zip_parts` signature to accept `&mut ZipArchive<File>` instead of `path`.
2. In `extract_pptx_text`, pass the opened archive directly.
3. In `extract_docx_text`, open the archive once and pass it through too.

Alternatively, keep `text_from_zip_parts` as-is but have `extract_pptx_text` do its own zip reading inline instead of delegating to `text_from_zip_parts`.

---

## Priority 6: Extract `useClickOutsideClose` hook (4x duplication)

**Problem:** The same "click + resize listeners to close a context/menu" pattern is repeated in 4 files with identical structure.

**Locations:**
- `FileExplorerView.tsx:61-70`
- `Sidebar.tsx:65-74`
- `TabBar.tsx:78-87`
- `RecentFiles.tsx:46-55`

All follow this pattern:
```tsx
useEffect(() => {
  if (!isOpen) return;
  const close = () => setSomething(null);
  window.addEventListener("click", close);
  window.addEventListener("resize", close);
  return () => {
    window.removeEventListener("click", close);
    window.removeEventListener("resize", close);
  };
}, [isOpen]);
```

**Fix:**
1. Create `src/features/file-explorer/lib/useClickOutsideClose.ts`:
   ```typescript
   import { useEffect } from "react";

   export function useClickOutsideClose(isOpen: boolean, onClose: () => void) {
     useEffect(() => {
       if (!isOpen) return;
       const close = () => onClose();
       window.addEventListener("click", close);
       window.addEventListener("resize", close);
       return () => {
         window.removeEventListener("click", close);
         window.removeEventListener("resize", close);
       };
     }, [isOpen, onClose]);
   }
   ```
2. Replace all 4 usages with `useClickOutsideClose(!!contextMenu, close)` (or equivalent).
3. Export the hook from `lib/` barrel if one exists.

---

## Priority 7: Remove dead code

### 7a. `ArchiveEntry` interface — never imported
**File:** `src/features/file-explorer/file-explorer.types.ts:68-72`
```typescript
export interface ArchiveEntry {
  name: string;
  size: number;
  is_dir: boolean;
}
```
**Fix:** Delete lines 68-72.

### 7b. `homeDir` method — never called
**File:** `src/features/file-explorer/services/file-explorer.service.ts:15`
```typescript
homeDir: () => invoke<string>("home_dir"),
```
**Fix:** Delete line 15.

### 7c. Duplicate `useLayoutEffect` — copy-paste error
**File:** `src/features/file-explorer/components/FilterBar.tsx:121-123`
```tsx
useLayoutEffect(() => {
  if (showFilters) positionFilters();
}, [showFilters, positionFilters]);

useLayoutEffect(() => {
  if (showFilters) positionFilters();
}, [showFilters, positionFilters]);
```
**Fix:** Delete lines 121-123 (the second duplicate).

### 7d. Unused `SearchMode` export — only used internally
**File:** `src/features/file-explorer/store/search.store.ts:5`
```typescript
export type SearchMode = "filename" | "content";
```
**Fix:** Remove the `export` keyword (it's only used within the same file).

### 7e. Unused `SnippetSegment` and `splitHighlights` — only used in tests
**File:** `src/features/file-explorer/lib/highlightSnippet.ts`
- `SnippetSegment` interface (line 1)
- `splitHighlights` function (line 13)

**Fix:** If these are only referenced in test files, remove the `export` keyword.

### 7f. Unused `PreviewKind` type
**File:** `src/features/file-explorer/lib/previewKind.ts:1`
```typescript
export type PreviewKind = /* ... */;
```
**Fix:** Remove the `export` keyword (only `previewKind` function is used).

### 7g. Unused `Theme` type export
**File:** `src/features/file-explorer/store/settings.store.ts:11`
**Fix:** Remove the `export` keyword.

### 7h. Conditional `use std::io::Write` in production
**File:** `src-tauri/src/content_index.rs:2` (import) and line 540 (usage)
```rust
use std::io::Write;  // only used in #[cfg(test)]
```
**Fix:** Move the import inside the `#[cfg(test)]` block.

---

## Priority 8: Extract `focusRing` base constant (18 components)

**Problem:** 18 component files each define their own `focusRing` constant with near-identical strings. The only variation is the `ring-offset-*` suffix (which differs per component's background color).

**Locations:** All `.tsx` files under `src/features/file-explorer/components/` (18 files total).

**Variants found:**
| Variant | Components |
|---------|-----------|
| No offset | FilterBar |
| `ring-offset-surface-container-high` | Combobox, ConfirmModal, ContextMenu, PromptModal, SearchFiltersFields, SidebarContextMenu, TabContextMenu, ViewMenu |
| `ring-offset-surface-container-low` | EditActionsBar, ListingActions, TabBar, Toolbar |
| `ring-offset-surface-container` | AddressBar |
| `ring-offset-surface-container-lowest` | Sidebar |
| `ring-offset-surface` | RecentFiles, SettingsPage, ThisPCView |

**Fix:**
1. Create `src/features/file-explorer/lib/focusRing.ts`:
   ```typescript
   const FOCUS_VISIBLE = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container";

   /** Focus ring for components on surface-container-high backgrounds */
   export const focusRingHigh = `${FOCUS_VISIBLE} focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high`;

   /** Focus ring for components on surface-container-low backgrounds */
   export const focusRingLow = `${FOCUS_VISIBLE} focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-low`;

   /** Focus ring for components on surface backgrounds */
   export const focusRingSurface = `${FOCUS_VISIBLE} focus-visible:ring-offset-1 focus-visible:ring-offset-surface`;

   /** Focus ring for components on surface-container backgrounds */
   export const focusRingContainer = `${FOCUS_VISIBLE} focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container`;

   /** Focus ring for components on surface-container-lowest backgrounds */
   export const focusRingLowest = `${FOCUS_VISIBLE} focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-lowest`;

   /** Focus ring with no offset (for FilterBar floating overlay) */
   export const focusRingMinimal = FOCUS_VISIBLE;
   ```
2. Replace each component's local `const focusRing = "..."` with an import from the shared module, using the appropriate variant for that component's background.

---

## Additional Notes

### `indexer.rs:765,771` — Silent error swallowing on rename events
In `apply_event`, database errors from `delete_by_path` and `upsert_entry` are discarded with `let _ =`. Consider adding `tracing::warn!` logging here too, consistent with Priority 3.

### `indexer.rs:372` — Unbounded loop in `unique_destination`
The loop in `fs_ops.rs:372-384` has no upper bound. Add a cap (e.g., 1000 iterations) and return an error.

### `content_index.rs:540` — `use std::io::Write` is test-only
Move this import inside the `#[cfg(test)]` module block.

### `settings.store.ts:11` — `Theme` type unused externally
Remove `export` from `Theme` type if only used internally.

### `highlightSnippet.ts` — `SnippetSegment`/`splitHighlights` test-only
Remove `export` if only used in tests.
