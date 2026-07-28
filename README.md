
<br />
<div align="center">

# ⚡ Schlag

### *A modern desktop file explorer for Windows — instant search, tabs, terminal, and native file operations, built for speed.*

<br />

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.2.0-black)
![Platform](https://img.shields.io/badge/platform-Windows-0078D4)
![Built with](https://img.shields.io/badge/built%20with-Tauri%20%2B%20React%20%2B%20Rust-da4c44)

<br />

> **Not a clone of Windows Explorer.** Schlag is a purpose-built file manager with indexed search (no live rescans), a pro-tool UI that stays out of your way, and real native performance. Inspired by the speed of **Everything**, the clarity of **Finder**, the polish of **Files**, and the keyboard-driven flow of **Raycast**.

<br />

</div>

---

## ✨ Features

### 🔍 Search everything

**Instant filename search** across every indexed drive — sub-millisecond for most queries, never rescans. Powered by SQLite FTS5 with a trigram tokenizer.

**Full-text content search** across PDF, DOCX, XLSX, PPTX, Markdown, plain text, CSV, and code files — powered by Tantivy. Find what's *inside* your files, not just what they're called.

Filters for extension, size, date, folder scope, and regex. Phrase and keyword matching modes. Results show snippets with your search term highlighted.

### 📂 Browse with tabs

Open multiple folders in one window, each with its own history and selection. Drag to reorder. Drag files onto tabs to move or copy. The tab strip doubles as the title bar — clean, borderless, all yours.

### 🖥️ Integrated terminal

Open a real PowerShell terminal at any folder — toolbar button or right-click context menu. Docked at the bottom, resizable, running a real PTY via `portable-pty` + `xterm.js`.

### 📦 Zip browsing

Double-click a `.zip` and navigate its contents inline like a folder. Open files from within the archive without extracting the whole thing.

### 📋 Native file operations

Copy, cut, paste, rename, delete (via Recycle Bin), create files and folders. Open With and Properties invoke the real Windows dialogs — no reimplemented panels.

Async, cancellable, revertable transfers with live progress. Large copies no longer freeze the window.

### 🎨 Dark & light themes

System theme detection out of the box. Four accent colors: Cyber Indigo, Green, Orange, Pink. Full keyboard accessibility and WCAG AA contrast.

### ⚙️ Settings

About, Appearance, General, Indexing exclusions, Storage info, and a keyboard shortcuts guide — all in one settings page.

---

## 📥 Install

Download the latest installer from the [Releases page](https://github.com/MelAlejandrino/Schlag/releases).

Auto-updates are built in — Schlag checks for new versions and can download and install them from Settings.

> **Platform:** Windows only. Cross-platform support (Linux/macOS) is [planned](./plan.md#phase-9).

---

## 🧱 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop shell** | [Tauri](https://tauri.app/) (Rust + WebView2) |
| **Frontend** | React 19, TypeScript, Zustand, Tailwind CSS 4 |
| **Backend** | Rust — SQLite (metadata + filename search), Tantivy (full-text content search), `notify` (live filesystem watching) |
| **Virtualization** | `@tanstack/react-virtual` |
| **Terminal** | `portable-pty` (Rust) + `@xterm/xterm` |
| **Icons** | [Lucide](https://lucide.dev/) + [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) |
| **Fonts** | [Geist](https://vercel.com/font) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+
- **Rust** stable (via [rustup](https://rustup.rs/))
- **Windows** — Schlag is currently Windows-only

### Development

```sh
git clone https://github.com/MelAlejandrino/Schlag.git
cd Schlag
npm install
npm run tauri dev
```

`npm run tauri dev` runs the full desktop app (Rust backend + webview). `npm run dev` alone starts just the Vite dev server — useful for pure-frontend iteration, but `invoke()` calls to the Rust backend will reject without a real Tauri context.

> **Note:** Changing `src-tauri/capabilities/` or `tauri.conf.json` requires a full stop + restart of `npm run tauri dev` — Tauri compiles capabilities and window config into the Rust binary at build time.

### Other commands

| Command | What it does |
|---------|--------------|
| `npm run build` | Type-checks (`tsc`) and produces a production frontend build |
| `npm test` | Runs the frontend unit test suite (Vitest) |
| `cargo test` (from `src-tauri/`) | Runs the Rust unit test suite |
| `cargo clippy` (from `src-tauri/`) | Lints the Rust backend — run after any Rust change |

---

## 📁 Project Structure

```
src/features/file-explorer/   # Frontend feature module — components, hooks, store, services, lib
src-tauri/src/                 # Rust backend — fs_ops, database, indexer, search, content_index, preview, terminal, settings
plan.md                        # Phase roadmap and feature checklist
CLAUDE.md                      # Architecture notes, design rationale, and debugged gotchas
DESIGN.md                      # Visual spec (colors, typography, spacing)
CONTRIBUTING.md                # Contribution guide
CHANGELOG.md                   # Release history
```

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Setup instructions
- Running tests and linters
- Code style guidelines
- PR submission process

---

## 📄 License

[MIT](./LICENSE) © 2026 Schlag Contributors


