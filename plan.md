# Projekt: Schlag
### A Modern, High-Performance Desktop File Explorer

> **Name:** Schlag
>
> Short, memorable, and fits the goal of building an incredibly fast file management tool.

---

# Vision

Build a modern desktop file explorer that feels significantly faster and more capable than the native file explorer.

The application should prioritize:

- Lightning-fast search
- Smooth user experience
- Beautiful previews
- Efficient indexing
- Power-user workflows
- Native desktop performance

The application is **not** intended to simply clone Windows Explorer.

Instead, it should combine the best aspects of:

- Everything
- Finder
- Files
- VS Code
- Raycast
- Obsidian

into one modern desktop application.

---

# Core Principles

## Performance First

Every feature should be designed with performance in mind.

- Never block the UI.
- Heavy operations must run in background tasks.
- Lazy load everything possible.
- Cache expensive operations.
- Parallelize CPU-intensive work.
- Keep memory usage reasonable.

---

## Native Feel

The application should feel native.

Goals:

- Instant startup
- Smooth animations
- No UI freezing
- Responsive interactions
- Fast scrolling
- Fast navigation

---

## Index Once, Search Instantly

Searching should never require rescanning the entire drive.

Instead:

Filesystem

↓

Indexer

↓

SQLite Metadata

↓

Tantivy Search Index

↓

Instant Results

---

# Technology Stack

## Desktop

- Tauri

---

## Backend

- Rust

Responsibilities:

- Filesystem operations
- Search
- Indexing
- Thumbnail generation
- Background workers
- File watching

---

## Frontend

- React
- TypeScript

Responsibilities:

- UI
- State management
- Rendering
- Search interface
- Preview interface

---

# Rust Libraries

## Core

- tokio (deferred as of Phase 2 — the indexer's scan+watch thread is plain `std::thread`, since rusqlite/walkdir/notify are all synchronous and nothing else in the codebase is async yet; revisit only when a real async I/O need shows up)
- rayon ✅ (Phase 2 — parallelizes the initial scan across a drive's top-level subdirectories; see Indexing section)
- regex ✅ (Phase 3 — backs the search `REGEXP` filter)
- walkdir
- notify
- serde
- anyhow
- tracing
- image
- trash

---

## Search

- Tantivy ✅ (Phase 3 — full-text content search, `content_index.rs`)
- pdf-extract ✅ (Phase 3 — PDF text extraction)
- calamine ✅ (Phase 3 — XLSX text extraction)
- zip + quick-xml ✅ (Phase 3 — shared low-level DOCX/PPTX text extraction; both formats are a zip of XML parts, so one dependency pair covers both instead of a bespoke crate per format)

---

## Storage

- SQLite

---

## Optional

- FFmpeg

Used for:

- Video thumbnails
- Video metadata

---

# Tauri Plugins

- tauri-plugin-dialog
- tauri-plugin-fs
- tauri-plugin-opener
- tauri-plugin-shell
- tauri-plugin-store

Optional:

- tauri-plugin-updater

---

# Architecture

```
React UI
      │
      ▼
Tauri Commands
      │
      ▼
Rust Services
      │
      ├── Filesystem
      ├── Search
      ├── Indexer
      ├── Preview
      ├── Git
      ├── Duplicate Detection
      └── Settings
      │
      ▼
SQLite
      │
      ▼
Tantivy Index
```

---

# Project Structure

```
src/
    components/
    pages/
    hooks/
    services/
    layouts/
    store/
    types/

src-tauri/
    src/
        filesystem/
        search/
        indexer/
        preview/
        git/
        settings/
        duplicate/
        commands/
        database/
        models/
```

---

# Core Features

## File Explorer

- Folder tree
- File list
- Breadcrumbs
- Address bar
- Tabs ✅ (Phase 5 — see the Phase 5 checklist below and `CLAUDE.md`)
- Split panes
- Drag and drop
- Multi-select
- This PC: virtual sidebar landing (not a real path) showing Quick Access folders and Drives as content tiles, plus a Recent Files list ✅ (see the dedicated Recent Files section below).
- Sort — click a column header (Name/Date/Size/Type) to sort the current listing, matching native Explorer. Gap identified after Phase 4 shipped: never listed here or in any phase checklist until now.
- View modes — List (the current `EntryTable` row layout), Medium icons, Large icons, matching native Explorer's view-mode toggle. Same gap as Sort.
- Group by — collapsible groups within the listing (by Type/Date modified/Size), matching native Explorer's group-by. Same gap as Sort.
- Sidebar Drives — `Sidebar.tsx` gained a Drives section (same `drives` list `ThisPCView`'s Drives tiles already use, `HardDrive` icon) between Quick Access and Favorites, so a drive is reachable without going through This PC. Added out of phase order, same rationale as Sort/View modes/Group by above.
- File type icons — files in `EntryTable`/`EntryGrid` now show a real per-extension icon from the `material-icon-theme` npm package (Philipp Kief's actual VS Code icon set) instead of one generic Lucide glyph for every file. Same out-of-phase "core browsing furniture" rationale as Sort/View modes/Group by/Sidebar Drives — see `CLAUDE.md`'s `lib/fileTypeIcon.tsx` entry for the resolution logic.

---

## File Operations

- Copy
- Move
- Rename
- Delete
- Recycle Bin support
- Create files
- Create folders
- Open With: invokes the native OS "Open With" picker (`rundll32 shell32.dll,OpenAs_RunDLL`) rather than a custom app-picker UI.
- Properties: invokes the native OS Properties dialog (General/Security/Sharing tabs) via a Shell.Application COM call, rather than a reimplemented panel. Revisit as a proper in-app panel in Phase 4 (Preview) if indexed metadata makes a custom "Get Info" card (per DESIGN.md) worthwhile later.
- **Open Terminal** ✅ — opens a real PowerShell PTY (`portable-pty`, `terminal.rs`) at the current folder, via a Toolbar button and background/folder-row context menu items, matching Explorer's own "Open in Terminal." Rendered by `TerminalPanel.tsx` (xterm.js) as a bottom-docked, resizable panel. Was the one release-gating item in this list; now shipped.

---

## Search

### Filename Search

Indexed. ✅ (Phase 3 — `search_files` command, queries the Phase 2 SQLite index via an FTS5 trigram-tokenized virtual table over `name`, kept in sync with `files` via triggers)

Instant. ✅ — measured against the real ~1.5M-row index: sub-millisecond to ~120ms for plain substring queries, ~2-3ms combined with a selective filter. Queries under 3 characters (too short for a trigram) fall back to a full scan, bounded by hitting the result cap almost immediately in practice.

---

### Full Text Search

Using Tantivy.

✅ (Phase 3 — a second index, `content_index.rs`, separate from the SQLite filename index; see `CLAUDE.md`'s Architecture section for the full extraction/indexing/search-query design, the DOCX/PPTX shared zip+XML approach, the UTF-16 snippet-offset conversion, and the XSS-safe snippet design)

Support:

- PDFs ✅
- Markdown ✅
- Text ✅ (plain text, CSV, plus a broad set of code/config extensions — same extraction path, since they're all just text)
- Office Documents ✅ (.docx, .xlsx, .pptx — legacy binary .doc/.xls/.ppt deliberately excluded, see CLAUDE.md)

---

### Advanced Filters

- Extension ✅ (Phase 3)
- Size ✅ (Phase 3 — min/max)
- Date ✅ (Phase 3 — modified before/after)
- Regex ✅ (Phase 3 — SQLite `REGEXP` scalar function backed by the `regex` crate, compiled pattern cached per-thread)
- Folder ✅ (Phase 3 — path-prefix scope)
- Tags — not built; no schema for it yet (Phase 5)

---

# Indexing

The indexer should run in the background.

Responsibilities:

- Scan drives ✅ (Phase 2 — one background thread, all detected drives, on startup; the user's home directory is scanned first so useful results show up quickly, and each drive's subdirectories are walked in parallel via rayon)
- Skip noisy, non-user-data trees ✅ (Phase 2 — node_modules, .git, .cache, Recycle Bin, System Volume Information, package-manager/dependency/SDK caches (.cargo, .rustup, .npm, .nuget, .gradle, .m2, .venv/venv, __pycache__, site-packages, .bun, .dotnet, .docker, .android, .expo, .ollama), and build output (target, dist, build, .next) are pruned by name, not walked at all; extended post-Phase-4 once the Recent Files feature (below) made AppData/Windows/Program Files/ProgramData noise directly visible — see CLAUDE.md's Indexing section for the full evidence trail, the position-restricted root-dir check Windows/Program Files needed, the .ssh security-motivated exclusion, and the content_index_state reconciliation bug this surfaced and fixed)
- Detect new files ✅ (notify `Create`/`Modify` events → upsert)
- Detect deleted files ✅ (notify `Remove` events → delete by path)
- Detect renamed files ✅ (notify's paired before/after rename event; split rename events fall back to delete-old + create-new)
- Detect modified files ✅ (notify `Modify` events → upsert)

Never rescan everything unnecessarily. Once the initial scan completes, only notify-driven incremental updates touch the DB.

Use notify for filesystem updates. ✅

---

# SQLite

Store:

- Path ✅ (Phase 2)
- Filename ✅ (Phase 2)
- Extension ✅ (Phase 2)
- Size ✅ (Phase 2)
- Dates ✅ (Phase 2, as `modified_ms`)
- Hashes (Phase 5 — Duplicate Detection)
- Tags (Phase 5)
- Favorites (still localStorage-only per Phase 1's Recent Files note above; not moved into SQLite)
- Preview cache (Phase 4)
- Git status (Phase 5)
- Search metadata (Phase 3 ✅ — filename search via an FTS5 trigram index over `name`; full-text content search via a separate Tantivy index, with a small `content_index_state(path, indexed_mtime)` SQLite table tracking which paths' content is current, so re-launching the app doesn't re-extract every PDF/Office doc from scratch)

SQLite should not store actual file contents. ✅ — the `files` table is still path/name/extension/is_dir/size/modified_ms only (plus the Phase 3 `files_fts` virtual table, which indexes `name` without duplicating it, and the Phase 3 `content_index_state` table, which stores only a path+mtime bookkeeping pair, not content — actual extracted text lives in Tantivy's own index, not SQLite); the rest of this list is intentionally not built yet, don't add those columns until their owning phase.

---

# Tantivy

Responsible for:

- Full-text indexing
- Fast searching
- Ranking
- Query parsing

---

# Preview System

Design previews as plugins.

```
Preview Manager

├── Images
├── Video
├── PDF
├── Markdown
├── Office
├── Archives
└── Text
```

Each preview renderer should be isolated.

---

# Thumbnail System

Images:

- image crate

Videos:

- FFmpeg

Generate thumbnails lazily.

Cache thumbnails.

Never regenerate unnecessarily.

---

# Duplicate Detection

Pipeline:

1. Group by size
2. xxHash
3. SHA256 verification

Avoid hashing every file.

---

# Git Integration

Display:

- Modified
- Added
- Deleted
- Ignored
- Untracked

Support repositories naturally while browsing.

---

# Favorites

Users can:

- Favorite folders
- Favorite files
- Pin projects

---

# Tags

Support:

- Colored tags
- Custom tags
- Multiple tags

Stored in SQLite.

---

# Search History

Remember:

- Previous searches
- Saved searches
- Recent folders

---

# Recent Files

✅ Recently *modified* files, surfaced in the This PC view (`components/RecentFiles.tsx`, `search::recent_files`) — top 10 by `modified_ms` desc, system-wide across the Phase 2 index, queried instantly instead of a live recursive scan. "Opened" and "created" tracking isn't built — the index only ever stores `modified_ms` (see the SQLite section below), not separate open/create timestamps; not a blocker, just a narrower scope than this section originally described. Placed at the *bottom* of This PC (below Folders/Favorites/Drives), not the top — see CLAUDE.md for why an unfiltered "most recent" list needed the `AppData` indexing exclusion (below) before leading with it made sense.

---

# Workspace

Restore:

- Tabs
- Split panes
- Window size
- Sidebar state
- Search history

---

# Keyboard Shortcuts ✅

All shortcuts implemented in `useKeyboardShortcuts.ts` (global) and `useEntryKeyboard.ts` (listing-scoped).

Global: Ctrl+Tab / Ctrl+Shift+Tab (switch tabs), Escape (close context menu / clear selection), Ctrl+R (refresh), Ctrl+F (search), Ctrl+L (focus address bar), Ctrl+T (new tab), Ctrl+W (close tab), Ctrl+N (new folder), Ctrl+D (toggle favorite), Ctrl+, (settings), Ctrl+C/X/V (copy/cut/paste), F2 (rename), Delete (trash). Ctrl+P (toggle preview) was removed alongside the Preview pane itself — see Phase 4.

Listing (when EntryTable/EntryGrid is focused): Arrow keys (grid-aware, skips group headers), Home/End, Enter (open), Delete, F2, Shift+F10 / ContextMenu key (open context menu at focus), Ctrl+A (select all), a-z (type-ahead jump), Shift+↑↓ (range select). Space (toggle preview) was removed for the same reason as Ctrl+P above.

---

# UI Goals

The UI should feel:

- Clean
- Modern
- Minimal
- Fast

Avoid unnecessary animations.

Prefer subtle transitions.

---

# Performance Goals

Everything expensive must happen off the UI thread.

Examples:

- Searching
- Thumbnail generation
- Indexing
- Hashing
- Preview generation

All should be asynchronous.

---

# Caching Strategy

Cache:

- Search results
- Folder metadata
- Thumbnails
- Preview data

Invalidate intelligently.

---

# Error Handling

Never crash because of:

- Permission denied
- Locked files
- Missing drives
- Corrupted files

Always recover gracefully.

---

# Logging

Use tracing.

Support:

- Debug logs
- Performance timings
- Index statistics
- Search statistics

---

# Future Features

## AI

- Semantic Search
- Natural language search
- Auto tagging
- Smart organization

---

## Cloud

- OneDrive
- Google Drive
- Dropbox

---

## Remote

- SSH
- SFTP
- SMB

---

## Plugins

Future plugin system.

Potentially:

- WASM
- Rust plugins

---

# Development Phases

## Phase 1

Foundation

- Tauri
- React
- Rust backend
- Navigation
- File operations
- Sort / View modes (List/Medium icons/Large icons) / Group by — added after Phase 4 shipped, once identified as a real gap in both this checklist and the `File Explorer` feature list above; being scoped and built now, out of phase order, since it's core browsing furniture rather than anything specific to Phases 2–4's own themes (Indexing/Search/Preview).
- Sidebar Drives — added after Phase 4 shipped, same out-of-phase-order rationale as Sort/View modes/Group by.

---

## Phase 2

Indexing

- SQLite
- notify
- Background workers
- Metadata storage

---

## Phase 3

Search

- Filename search ✅
- Tantivy ✅ (full-text content search over PDF/Markdown/Text/DOCX/XLSX/PPTX — see CLAUDE.md's `content_index.rs` architecture notes)
- Filters ✅ (extension, size, date, folder, regex — tags deferred to Phase 5; content search itself only supports the folder filter, by design — see CLAUDE.md)
- Search UI ✅ (a Spotlight/Raycast-style centered `SearchModal` overlay opened from a single Toolbar icon — not a persistent toolbar box; a filename/content mode toggle, a phrase/keywords match-mode toggle, and a folder-scope toggle, defaulting to scoping search to the currently browsed folder with a one-click toggle to search the whole index; Ctrl+F/Ctrl+L wiring deferred to Phase 6)

Phase 3 is complete.

---

## Phase 4

Preview

**Removed, not currently shipped.** Built in full for this phase originally (Images/Markdown/PDF/Video/Office/Archives, a resizable right-side `PreviewPane.tsx`), then deliberately deleted outright in commit `c820b54` ("Redesign toolbar, remove Preview pane...") alongside its resize hook, the `Ctrl+P`/`Space` shortcuts, and the `react-markdown` dependency, in favor of the current toolbar's simpler two-popover shape. The backend commands it used (`preview_text`, `list_archive_entries` in `preview.rs`) are still registered but unreferenced from the frontend. Consciously descoped for this release rather than restored — revisit if a future pass wants preview back, at which point it's a re-add against the current `Toolbar.tsx`/`FileExplorerView.tsx` shape, not a straight revert of `c820b54`.

---

## Phase 5

Power Features

- Tabs ✅ — multiple open folder locations in one window, each with its own current path / back-forward history / selection. Store reorganized so `tabs: Tab[]` + `activeTabId` are the source of truth with the old top-level fields as a live mirror of the active tab (see `CLAUDE.md`), so almost no consumers changed. Includes: new-tab (+) button, click-to-switch, close (×), a tab context menu (Duplicate / Close), "Open in new tab" on folder rows + Sidebar items, drag-to-reorder (live during drag), and drag-a-file-onto-a-background-tab to switch + drop into it. Not persisted across launches (that's Workspace restore, Phase 7). Keyboard shortcuts (Ctrl+T / Ctrl+W) deliberately deferred to Phase 6's hotkey system, same as every other shortcut.
- Custom title bar ✅ — **not originally a planned item**; built alongside Tabs once the tab strip existed to host it. Native OS window chrome removed (`decorations: false`); the tab bar doubles as the title bar with window controls (minimize/maximize/close), a drag region, and JS resize handles. See `CLAUDE.md`'s Window chrome note.
- Sidebar context menus ✅ — right-click Quick Access / Drives / Favorites for Open / Open in new tab / Add-or-Remove Favorite / Properties. (Previously right-click did nothing on Sidebar items; this replaces that non-behavior now that "Open in new tab" gave it a clear use case.)
- Favorites ✅ (built in Phase 1, not Phase 5 — folder/file starring, `file-explorer.store.ts`'s `favorites: string[]`, persisted, shown in `Sidebar`/`ThisPCView`, toggled via the context menu and `Toolbar`. This bullet was stale until now — never crossed off despite shipping years of checklist-time ago.)
- Direct index updates after file operations ✅ — `move_entry`/`copy_entry`/`delete_entry`/`rename_entry`/`create_dir`/`create_file` in `fs_ops.rs` now directly update the SQLite search index and queue Tantivy content events immediately after the filesystem operation, rather than relying solely on the `notify` watcher (which can silently drop events on Windows under heavy churn). See `CLAUDE.md`'s Indexing section.

Phase 5 is complete. The remaining items (Split panes, Tags, Workspace restore, Git integration, Duplicate detection, Bulk rename) have been moved to Phase 7.

---

## Phase 6

Polish

- Keyboard shortcuts ✅ — Ctrl+T / Ctrl+W (new/close tab), Ctrl+Tab / Ctrl+Shift+Tab (cycle tabs), Ctrl+F / Ctrl+L (search/focus address bar), F2 (rename), Delete (trash), Ctrl+C / Ctrl+X / Ctrl+V (copy/cut/paste), Ctrl+D (toggle favorite), Ctrl+N (new folder), Ctrl+R (refresh), Escape (close context menu / clear selection), plus listing-scoped: arrows (group-aware), Home/End, Enter, Ctrl+A, type-ahead, Shift+arrows, Shift+F10/ContextMenu key. Ctrl+P and Space (quick preview) shipped in this pass but were later removed along with the Preview pane itself — see Phase 4.
- Settings page ✅ — a full page (`SettingsPage.tsx`) that replaces the main content area (like ThisPCView), with a left sidebar nav for switching between six sections: About Schlag (app info, version, tech stack), Appearance (theme/accent color), General (startup behavior, default sort/group/view), Indexing (user-added excluded directory names and full paths), Storage (index size, content index size, entry count via `get_storage_info` command), and Guide (keyboard shortcuts reference, tips). Navigation: `file-explorer.store.ts`'s `viewState: "browse" | "settings"` controls which view renders in `<main>`; `openSettings()`/`closeSettings()` toggle it. Backend settings persisted as `{app_data_dir}/settings.json` via `settings.rs`; frontend defaults via Zustand localStorage. Toolbar gear icon and Ctrl+, open settings. Indexer's `is_excluded()`/`is_excluded_path()` check both built-in and user-provided lists (via `OnceLock`).
- Theme system ✅ — light/dark toggle + 4 user-selectable accent colors (Cyber Indigo/Green/Orange/Pink), applied live via `data-theme`/`data-accent` attributes overriding the same CSS custom properties Tailwind's utilities already read through (`App.css`). Light palette is a real, contrast-checked (WCAG AA) design, not inverted dark values — see `DESIGN.md`'s Light Theme / Accent Colors sections.
- Performance optimization ✅ — `EntryTable` (list view) now virtualizes via `@tanstack/react-virtual`, the same pattern `EntryGrid` already used for icon views (audited first: grid view had it, table view didn't — a real, previously-unchecked gap, not just a checkbox left stale). Required rebuilding the table as a div-based CSS Grid rather than a native `<table>`, since a `<tr>` can't be individually absolutely-positioned without losing its table-cell alignment. `FileTypeIcon`'s `<img>` now has `loading="lazy"`/`decoding="async"`, matching what `EntryGrid`'s image tiles already had. `EntryRow`/`EntryTile` are `React.memo`-wrapped so a selection change only re-renders the 1-2 rows whose selection actually flipped — **this didn't actually work on the first pass**: `useFileExplorer.ts`'s `openEntry`/`selectEntry`/`openContextMenuForEntry`/`getDragPaths`/`dropOnto` (all passed straight through to `EntryRow`/`EntryTile` as props) were plain functions redefined every render of `useFileExplorer()`, which itself re-renders on *any* store change (`useFileExplorerStore()` is called with no selector). Fresh function references every render meant `React.memo`'s shallow prop comparison saw "changed props" and re-rendered every row regardless — silently defeating the exact optimization it was supposed to provide. Caught by verifying the fix actually did something, not just that it compiled. Fixed by wrapping those five handlers in `useCallback` with stable `[]` deps, reading current state via `useFileExplorerStore.getState()` instead of the reactive closure (the same pattern `useEntryKeyboard.ts` already used for its own Ctrl+A handler). Memory profiling itself is a "run and document" exercise, not code — left to whoever needs it, since there's nothing to check off in advance.
- Accessibility ✅ — audited first (keyboard-only *browsing* was already solid — arrows/rename/delete/etc. all worked); closed the concrete gaps that were left: `aria-label`s on ~14 previously title-only icon buttons (`Toolbar`, `WindowControls`, `IndexStatusBadge`'s `role="status"`), `role="grid"`/`"listbox"` + `aria-selected`/`aria-multiselectable` on `EntryTable`/`EntryGrid` (selection was purely a background-color class before, invisible to assistive tech), real `role="menu"`/`"menuitem"` + arrow-key nav + Escape handling on all four popover menus (`ContextMenu`, `SidebarContextMenu`, `TabContextMenu`, `ViewMenu` — via a new shared `lib/useMenuKeyboard.ts`, none of them had any `role=`/`aria-`/`onKeyDown` before), a real keyboard trigger for the context menu itself (Shift+F10 / the `ContextMenu` key, opening at the focused row's position — previously right-click was the *only* way in, making "Open with…"/"Properties"/"Open in new tab"/"Open file location" unreachable without a mouse), a real Escape-closes-context-menu fix (it previously fell through to toggling preview/clearing selection instead), and a `forced-colors: active` baseline in `App.css` restoring real `outline`s for focus rings (the shared `focusRing` string is `outline-none` + a box-shadow ring — invisible under Windows High Contrast Mode, which drops box-shadow rendering entirely) and for `aria-selected`/`aria-checked` elements (selection state, otherwise pure background-color, also disappears under forced-colors).
- Auto updates ✅ — the infrastructure decision this item was deferred on is now made: GitHub Releases hosts the signed installer + `latest.json`, the repo already had a `MelAlejandrino/Schlag` remote to publish to. `tauri-plugin-updater`/`tauri-plugin-process` registered in `lib.rs`; `tauri.conf.json`'s `plugins.updater` points at `https://github.com/MelAlejandrino/Schlag/releases/latest/download/latest.json` and carries the minisign public key (`bundle.createUpdaterArtifacts: true` makes the bundler emit the signed `.sig` files `latest.json` needs). `.github/workflows/release.yml` (windows-latest only — this is a Windows-only app, see Architecture) builds/signs/publishes a draft GitHub Release via `tauri-apps/tauri-action` on any `v*` tag push; the signing keypair lives outside the repo (`~/.tauri/schlag-updater.key` + password) with the private key and password stored as the `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo secrets CI signs with. `lib/useUpdater.ts` wraps `check()`/`downloadAndInstall()`/`relaunch()`; surfaced in `SettingsPage.tsx`'s About section (Check for Updates → shows available version → Download and Install → Restart Now), next to a `getVersion()`-sourced version string (previously hardcoded).

---

## Phase 7

Advanced Features

- ~~Open Terminal — release gate~~ ✅ **Done, no longer blocks release** — see the `File Operations` feature list above and `CLAUDE.md`'s terminal.rs/TerminalPanel.tsx notes.
- **Browse zip contents inline** ✅ — built per the sketch above. Double-clicking a `.zip` (or opening it from any context) navigates into it in the main listing like a folder, via the virtual-path scheme (`C:\a\b.zip!\sub\file.txt`) landing exactly as sketched: `lib/zipPath.ts`'s `zipSplit`/`zipRootPath`/`isInsideZip` are the only new path-parsing code — `lib/path.ts` itself needed zero changes, confirming the marker-inside-one-segment design. `file-explorer.store.ts`'s `loadEntries()` branches to a new `list_archive_dir` command (`preview.rs`) for a zip-virtual path instead of `list_dir`, so navigate/refresh/back/forward/new-tab all got zip support for free through that one chokepoint. Opening a file inside the archive extracts it to a per-process temp dir via a new `extract_zip_entry_to_temp` command, then reuses the existing `openFile` flow on that real path. Write actions are blocked exactly as sketched — `useFileExplorer.ts` suppresses the context menu entirely (both background and per-row) while browsing a zip, rather than showing disabled-looking buttons, and every other write entry point (New folder/file, Paste, Rename, Delete, Copy, Cut, Open Terminal) bails via the same `isInsideZip()` check the Toolbar's New/Terminal buttons also use to grey themselves out. `AddressBar.tsx`'s breadcrumbs strip the trailing `!` marker for display only (the real segment path, used for navigation, is untouched). **Known ponytail-documented gaps, not built in this pass**: per-entry modified times inside a zip (`read_archive_dir` reports `modified_ms: 0` for every entry — `zip::DateTime` needs its own conversion the crate doesn't hand back directly); `read_archive_dir`/`extract_zip_entry_to_temp` each re-open and re-parse the whole archive's central directory on every call (no "zip session" kept alive while browsing one) — fine for typical archives, a real cost for one with a very large entry count, capped the same way `list_archive_entries` already was (`ARCHIVE_ENTRY_LIMIT`) rather than left fully unbounded; a real file whose own name happens to contain the literal substring `.zip!` (legal but exceedingly unlikely) is misidentified as an archive location by the plain-substring marker detection; filename/content search doesn't reach inside archives. **Caught and fixed during review, not shipped as gaps**: `dropOnto` only checked the drop *destination* against `isInsideZip`, not the dragged *source* paths (a row inside a zip is still draggable) — now filtered out alongside the existing THIS_PC/self-drop filters; the explicit-target write functions used by `SearchModal`'s per-result menu (`renameEntry`/`copyEntryToClipboard`/`cutEntryToClipboard`/`deleteEntryPrompt`) had no `isInsideZip` guard at all (currently unreachable in practice since search doesn't index archive contents, but fixed for defense-in-depth); `lib/tabs.ts`'s `tabLabel()` and `Sidebar.tsx`'s favorites list both rendered the raw `basename()` of a zip-virtual path, leaking the `!` marker the same way the address bar breadcrumbs originally would have — consolidated into one shared `lib/zipPath.ts#stripZipMarkerSuffix()` used by all three display sites instead of three separate fixes.
- Split panes — side-by-side folder view within the same window
- Tags — colored/custom tags, multiple tags per file, stored in SQLite
- Workspace restore — persist and restore tabs, split panes, window size, sidebar state across launches
- Git integration — show modified/added/deleted/ignored/untracked status per file while browsing repositories
- Duplicate detection — group-by-size → xxHash → SHA256 pipeline, avoid hashing every file
- Bulk rename — rename multiple files at once with pattern/regex/counter support

---

## Phase 8

AI

- Semantic Search — vector-embedded search over file contents and names
- Natural language search — query files using conversational language
- AI organization — smart folder suggestions, auto-tagging, content-based grouping

---

## Phase 9

Cross-platform (Linux/macOS) — scoped, not started

Tauri itself is cross-platform, but this codebase has made several deliberate Windows-only choices (see `CLAUDE.md`'s Architecture section) that make this a real port, not a recompile:

- Drive enumeration probes `A:`–`Z:` (`fs_ops.rs`) — Linux/macOS have a single root (`/`) with mount points instead, needs its own listing strategy.
- Open With / Properties (`fs_ops.rs`) shell out to `ShellExecuteExW` via the Windows-only `windows` crate — no equivalent API; Linux would need something like `xdg-open`/a custom app-picker, macOS its own Finder/AppleScript calls, and neither platform has a native "Properties" dialog in the same sense.
- `.github/workflows/release.yml` builds `windows-latest` only, by explicit decision — a real cross-platform release needs its own build/sign/notarize (macOS) pipeline per OS.
- Not yet audited: path-separator assumptions throughout `lib/path.ts` and any other Windows-path-string handling.

Deliberately not implemented yet — revisit if/when there's actual demand for a non-Windows build.

---

# Non-Functional Requirements

## Startup

Target:

< 1 second (warm start)

---

## Search

Target:

< 20 ms indexed search

Measured (Phase 3, real ~1.5M-row index): sub-ms to ~120ms for plain filename substring queries, ~2-3ms combined with a selective filter — close to target for the common case. Queries under 3 characters fall back to a full scan (a few hundred ms to ~1s) since the trigram index can't help there; acceptable in practice since such broad queries hit the result cap almost immediately.

---

## Folder Navigation

Target:

No visible UI blocking.

---

## Thumbnail Loading

Visible thumbnails should begin appearing immediately, with placeholders shown while loading. Background generation must prioritize visible items.

---

## Memory

Keep memory usage stable even when indexing millions of files.

---

## Scalability

Designed to support:

- Millions of files
- Multiple drives
- Large repositories
- Network drives (future)

---

# Coding Standards

- Prefer composition over inheritance.
- Keep modules focused and small.
- Avoid global mutable state.
- Write idiomatic Rust.
- Write typed React components.
- Separate UI from business logic.
- Keep filesystem logic entirely in Rust.
- Keep React focused on presentation and interaction.
- Benchmark before optimizing.
- Favor maintainability over cleverness.

---

# Success Criteria

The project is successful if users can:

- Navigate massive folders smoothly.
- Search millions of indexed files almost instantly.
- Preview common file types without opening external applications.
- Perform common file operations quickly and reliably.
- Experience a desktop application that feels fast, polished, and native.
- Reliably use the application as a daily driver for file management.

The guiding principle is simple:

> **Every interaction should feel immediate.**

<!-- TO BE ADDED: ATTACH FUNCTION, SCALE DATABASE MULTIPLE SQL FILES BUT IGNORE THIS FOR NOW -->
