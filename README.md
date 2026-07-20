# Schlag

A modern desktop file explorer, built to feel significantly faster and more capable than the native one — instant indexed search, full-text content search, rich previews, and native file operations, in a Tauri + React desktop app.

Not a clone of Windows Explorer. It combines the best parts of Everything, Finder, Files, VS Code, Raycast, and Obsidian into one tool.

## Status

Phases 1–4 of the roadmap (see [`plan.md`](./plan.md)) are complete:

- **Foundation** — navigation, file operations (copy/move/rename/delete via a real clipboard-based cut/copy/paste flow, create files/folders), multi-select, drag-and-drop, breadcrumbs, a "This PC" landing view, sort/view modes (list, medium/large icons)/group-by, and per-extension file type icons (via [material-icon-theme](https://github.com/material-extensions/vscode-material-icon-theme)).
- **Indexing** — a background thread scans every drive into a SQLite index and keeps it live via filesystem watching, so search never needs to rescan a drive.
- **Search** — instant indexed filename search (FTS5 trigram) plus Tantivy-backed full-text content search across PDF/Markdown/Text/DOCX/XLSX/PPTX, with extension/size/date/folder/regex filters, exposed through a Spotlight-style command palette.
- **Preview** — a resizable side panel rendering images, video, PDF, markdown, text, Office documents, and ZIP archive contents, without opening another app.

Phase 5 (tabs, split panes, tags, workspace restore, git integration, duplicate detection, bulk rename) is next.

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture writeup (why things are built the way they are, non-obvious gotchas already debugged) and [`DESIGN.md`](./DESIGN.md) for the visual spec.

## Tech stack

- **Desktop shell:** [Tauri](https://tauri.app/)
- **Frontend:** React + TypeScript, Zustand for state, Tailwind for styling
- **Backend:** Rust — filesystem ops, SQLite (via `rusqlite`) for metadata/filename search, [Tantivy](https://github.com/quickwit-oss/tantivy) for full-text content search, `notify` for live filesystem watching

## Getting started

> **Platform:** Schlag is currently Windows-only. Cross-platform support (Linux/macOS) is planned for a future release.

```sh
npm install
npm run tauri dev
```

`npm run tauri dev` runs the full desktop app (Rust backend + webview). `npm run dev` alone starts just the Vite dev server — useful for pure-frontend iteration, but `invoke()` calls to the Rust backend will reject without a real Tauri context.

### Other useful commands

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
src-tauri/src/                 # Rust backend: fs_ops, database, indexer, search, content_index, preview
plan.md                        # phase roadmap and feature checklist
CLAUDE.md                      # architecture notes, design rationale, and debugged gotchas
DESIGN.md                      # visual spec (colors, typography, spacing)
```
