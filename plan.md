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
- Text ✅ (plain text, plus a broad set of code/config extensions — same extraction path, since they're just text)
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

# Keyboard Shortcuts

Examples:

Ctrl+P

Quick Open

---

Ctrl+Shift+P

Command Palette

---

Space

Quick Preview

---

Delete

Move to Trash

---

F2

Rename

---

Ctrl+L

Focus Address Bar

---

Ctrl+F

Search Current Folder

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

- Images ✅ (`<img>` via the Tauri asset protocol — no backend processing needed, the webview decodes natively)
- Markdown ✅ (`react-markdown`, AST-based rendering — no `dangerouslySetInnerHTML` — over extracted text from `content_index::extract_text()`)
- PDF ✅ (`<embed type="application/pdf">` via the asset protocol — WebView2's own built-in PDF viewer, not a bundled renderer)
- Video ✅ (`<video controls>` via the asset protocol — WebView2's native codec support, no FFmpeg)
- Office ✅ (docx/xlsx/pptx — extracted **plain text**, not original formatting; reuses `content_index::extract_text()` as-is, no new extraction logic)
- Archives ✅ (ZIP only, via the already-a-dependency `zip` crate — flat entry list: name/size/is_dir, capped at 2000 entries)

Preview UI is a resizable right-side panel (`PreviewPane.tsx`), mirroring the resizable `Sidebar`, toggled from a `Toolbar` button — see `CLAUDE.md`'s Architecture section for the full design. **Not built in this pass** (see `CLAUDE.md`): the separate `# Thumbnail System` section's file-listing icon thumbnails (`image` crate, FFmpeg — different feature, unscheduled to a phase), the `Space` "Quick Preview" keybinding (waits for Phase 6's proper hotkey system), and full WYSIWYG Office rendering.

---

## Phase 5

Power Features

- Tabs ✅ — multiple open folder locations in one window, each with its own current path / back-forward history / selection. Store reorganized so `tabs: Tab[]` + `activeTabId` are the source of truth with the old top-level fields as a live mirror of the active tab (see `CLAUDE.md`), so almost no consumers changed. Includes: new-tab (+) button, click-to-switch, close (×), a tab context menu (Duplicate / Close), "Open in new tab" on folder rows + Sidebar items, drag-to-reorder (live during drag), and drag-a-file-onto-a-background-tab to switch + drop into it. Not persisted across launches (that's Workspace restore, below). Keyboard shortcuts (Ctrl+T / Ctrl+W) deliberately deferred to Phase 6's hotkey system, same as every other shortcut.
- Custom title bar ✅ — **not originally a planned item**; built alongside Tabs once the tab strip existed to host it. Native OS window chrome removed (`decorations: false`); the tab bar doubles as the title bar with window controls (minimize/maximize/close), a drag region, and JS resize handles. See `CLAUDE.md`'s Window chrome note.
- Sidebar context menus ✅ — right-click Quick Access / Drives / Favorites for Open / Open in new tab / Add-or-Remove Favorite / Properties. (Previously right-click did nothing on Sidebar items; this replaces that non-behavior now that "Open in new tab" gave it a clear use case.)
- Split panes
- Favorites ✅ (built in Phase 1, not Phase 5 — folder/file starring, `file-explorer.store.ts`'s `favorites: string[]`, persisted, shown in `Sidebar`/`ThisPCView`, toggled via the context menu and `Toolbar`. This bullet was stale until now — never crossed off despite shipping years of checklist-time ago.)
- Tags
- Workspace restore (would also make Tabs survive a relaunch — currently they reset to one "This PC" tab on launch)
- Git integration
- Duplicate detection
- Bulk rename

---

## Phase 6

Polish

- Keyboard shortcuts
- Settings
- Theme
- Performance optimization
- Accessibility
- Auto updates

---

## Phase 7

AI

- Semantic Search
- Natural language search
- AI organization

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
