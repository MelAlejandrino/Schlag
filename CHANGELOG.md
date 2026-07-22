# Changelog

All notable changes to Schlag will be documented in this file.

## [1.0.3] - 2026-07-22

### Added

- **File tagging system:** Create, assign, and manage color-coded tags on files directly from the context menu. Tags persist in the index database and survive renames/moves.
- **Tag-based search filtering:** Search+ now includes a Tags filter field, allowing files to be filtered by one or more tags (AND logic). Tag suggestions appear as you type.
- **Tag chips in entry views:** Assigned tags display as colored chips next to file names in both grid and table views.
- **Context menu Tags flyout:** A "Tags ▸" submenu in the right-click context menu provides quick tag toggling and inline tag creation without leaving the menu.

## [1.0.2] - 2026-07-20

### Added

- **Search+ open/close animation:** The bar now grows smoothly into the Search+ (index search) level with a width/border reveal, and the mode/scope/filters controls fade in as part of the expansion rather than popping in. Closing mirrors the motion.

### Fixed

- Search+ controls no longer flash at full height then collapse on open (removed a flex-wrap reflow during the width transition)
- Search+ on This PC opens with a slower, smoother 500ms reveal (was snapping at 300ms), and now closes at the same pacing instead of snapping shut

## [1.0.1] - 2026-07-20

### Fixed

- Default accent color now correctly applies green on fresh install (no persisted settings)
- Default theme correctly follows system preference on fresh install
- Rewrote README as product-focused landing page

## [1.0.0] - 2026-07-20

### Added

- **Navigation:** Breadcrumbs, address bar, back/forward/up, This PC landing view with Quick Access tiles and Drives
- **File operations:** Create directory, create file, rename, delete (via trash crate), copy, cut, paste (clipboard-based, mirroring OS Explorer behavior), Open With, Properties (native Windows dialogs via ShellExecuteExW)
- **Multi-select and drag-and-drop** with keyboard modifiers and visual cut-state dimming
- **Sort, view modes, and group by:** List / Medium icons / Large icons, sort by Name/Date/Size/Type, group by Type/Date/Size — single global preference
- **Per-extension file type icons** via material-icon-theme
- **Sidebar:** Quick Access, Favorites, Drives sections with context menus and drag-drop support
- **Background SQLite indexing** with live filesystem watching (notify) and rayon parallelism — home directory scanned first for quick results
- **Exclusion lists:** Built-in exclusions for node_modules, .git, AppData, package manager caches, build output, and OS-level root directories (Windows, Program Files, etc.) — user-configurable exclusions via Settings
- **Filename search:** FTS5 trigram tokenizer with extension/size/date/folder/regex filters, keyword and phrase matching modes
- **Full-text content search:** Tantivy-backed search over PDF, DOCX, XLSX, PPTX, Markdown, plaintext, CSV, and code files — with phrase and keyword modes, folder scoping, and XSS-safe snippet highlighting
- **Tabbed interface:** Multiple open folders in one window, each with own history/selection, drag-to-reorder, drag-to-switch
- **Custom borderless title bar** with tab strip as title bar, window controls, drag region, and JS resize handles
- **Keyboard shortcuts:** Ctrl+T/W/Tab/Shift+Tab/F/L/R/N/D/, and listing-scoped arrow keys, Home/End, Enter, F2, Delete, Ctrl+A, type-ahead, Shift+F10/ContextMenu key
- **Settings page:** About, Appearance (theme/accent), General, Indexing, Storage, Guide sections
- **Theme system:** Dark/light toggle with system theme detection, 4 accent colors (Cyber Indigo, Green, Orange, Pink), WCAG AA contrast-checked
- **Accessibility:** aria-labels, role attributes, keyboard navigation for all menus, forced-colors support
- **Auto updates:** GitHub Releases with minisign signing, tauri-plugin-updater, Settings UI for check/download/restart
- **Integrated terminal:** Real PowerShell PTY via portable-pty + xterm.js, docked at bottom with drag-resize
- **Zip browsing:** Navigate ZIP contents inline like a folder, extract and open files from within archives
- **In-folder filter:** Scope search results to the current directory
- **Search in folder:** Context menu option to search within a specific folder
- **Content search filters:** Client-side filtering for content search results
- **Tab animations:** Open/reorder/close transitions
- **Drag-out prevention:** Files cannot be dragged out to external apps as image bytes
- **Context menus:** Entry-level, folder background, sidebar, tab, and search result context menus

### Fixed

- **File collision detection:** create_dir/create_file/rename_entry reject name collisions instead of silently truncating or deleting files
- **Cut-paste same-folder no-op:** Cutting a file and pasting into the same folder does nothing (previously created a numbered duplicate)
- **Content search UTF-16 ranges:** Byte-to-UTF-16 conversion for correct snippet highlighting with non-ASCII text
- **Folder filter self-match:** Folder-scoped search no longer returns the folder itself as a result
- **Content search phrase mode:** Queries are wrapped in quotes to prevent scattered word matching
- **dropOnto memoization:** Drag-drop onto tabs now works correctly
- **Folder-scoped search:** No longer misses files created outside the app during indexing
- **Ellipsis button search leak:** Fixed 's' character leaking into search
- **Floating filters panel:** Click-outside now properly closes the panel
- **Terminal search dismissal:** Opening terminal now dismisses active search
- **Multi-menu conflicts:** Only one context/popover menu can be open at a time via useExclusiveMenu
- **Scrollbar instability:** Fixed in grid and table views
- **List-view type-ahead:** Jump scrolling and letter-spam cycling fixed
- **Content index state reconciliation:** Independent reconciliation pass prevents orphaned entries after process restart
- **Mutex recovery:** Fixed in shared indexer state

### Removed

- **Preview pane:** Deliberately descoped for release. Backend commands (preview_text, list_archive_entries) still registered but unreferenced from frontend. May return in a future release.
- **react-markdown dependency:** Removed alongside Preview pane

### Changed

- **Toolbar redesigned:** New folder/file and View/sort/group collapsed into two popover menus (NewMenu/ViewMenu)
- **Folder star:** Moved from Toolbar to AddressBar as omnibox-style bookmark
- **Font standardized:** JetBrains Mono replaced with Geist throughout
- **Store reorganized:** tabs[] + activeTabId are source of truth; pre-existing fields are live mirror of active tab
- **Index status:** Exposed via in-memory atomics instead of live SELECT COUNT(*)
- **Default accent:** Changed to green (from Cyber Indigo)
- **Default theme:** Follows system theme instead of forcing dark
