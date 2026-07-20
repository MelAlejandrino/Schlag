# Schlag

A modern desktop file explorer for Windows. Instant search, full-text content search, tabs, an integrated terminal, and native file operations — built to feel significantly faster and more capable than the one that ships with your OS.

Not a clone of Windows Explorer. It combines the best parts of Everything, Finder, Files, VS Code, Raycast, and Obsidian into one tool.

> **Platform:** Windows only. Cross-platform support (Linux/macOS) is [planned](./plan.md#phase-9).

## Install

Download the latest installer from [Releases](https://github.com/MelAlejandrino/Schlag/releases).

Auto-updates are built in — Schlag checks for new versions and can download and install them from Settings.

## Highlights

### Search everything

**Instant filename search** across every indexed drive — sub-millisecond for most queries, never rescans. Powered by SQLite FTS5 with a trigram tokenizer.

**Full-text content search** across PDF, DOCX, XLSX, PPTX, Markdown, plain text, CSV, and code files — powered by Tantivy. Find what's *inside* your files, not just what they're called.

Filters for extension, size, date, folder scope, and regex. Phrase and keyword matching modes.

### Browse with tabs

Open multiple folders in one window, each with its own history and selection. Drag to reorder. Drag files onto tabs to move or copy.

### Integrated terminal

Open a real PowerShell terminal at any folder — toolbar button or right-click context menu. Docked at the bottom, resizable, running a real PTY.

### Zip browsing

Double-click a `.zip` and navigate its contents inline like a folder. Open files from within the archive without extracting the whole thing.

### Native file operations

Copy, cut, paste, rename, delete (via recycle bin), create files and folders. Open With and Properties invoke the real Windows dialogs — no reimplemented panels.

### Tabs as title bar

Custom borderless window with the tab strip doubling as the title bar. Window controls, drag region, and resize handles are all built in.

### Dark and light themes

System theme detection out of the box. Four accent colors: Cyber Indigo, Green, Orange, Pink. Full keyboard accessibility and WCAG AA contrast.

### Settings

About, Appearance, General, Indexing exclusions, Storage info, and a keyboard shortcuts guide — all in one settings page.

## Tech stack

- **Desktop shell:** [Tauri](https://tauri.app/) (Rust + WebView2)
- **Frontend:** React, TypeScript, Zustand, Tailwind CSS
- **Backend:** Rust — SQLite for metadata and filename search, Tantivy for full-text content search, `notify` for live filesystem watching
- **Fonts:** [Geist](https://vercel.com/font)

## Getting started (development)

```sh
npm install
npm run tauri dev
```

`npm run tauri dev` runs the full desktop app (Rust backend + webview). `npm run dev` alone starts just the Vite dev server — useful for pure-frontend iteration, but `invoke()` calls to the Rust backend will reject without a real Tauri context.

### Other commands

| Command | What it does |
|---|---|
| `npm run build` | Type-checks (`tsc`) and produces a production frontend build |
| `npm test` | Runs the frontend unit test suite (Vitest) |
| `cargo test` (from `src-tauri/`) | Runs the Rust unit test suite |
| `cargo clippy` (from `src-tauri/`) | Lints the Rust backend — run after any Rust change |

**Note:** changing `src-tauri/capabilities/` or `tauri.conf.json` requires a full stop + restart of `npm run tauri dev`, not just a browser refresh — Tauri compiles capabilities and window config into the Rust binary at build time.

## Project structure

```
src/features/file-explorer/   # the one frontend feature module — components, hooks, store, services, lib
src-tauri/src/                 # Rust backend: fs_ops, database, indexer, search, content_index, preview, terminal, settings
plan.md                        # phase roadmap and feature checklist
CLAUDE.md                      # architecture notes, design rationale, and debugged gotchas
DESIGN.md                      # visual spec (colors, typography, spacing)
```

## License

[MIT](./LICENSE)
