# Contributing to Schlag

## Prerequisites

- **Node.js** 20+
- **Rust** stable (via [rustup](https://rustup.rs/))
- **Windows** — Schlag is currently Windows-only (cross-platform support is planned)

## Setup

```sh
git clone https://github.com/MelAlejandrino/Schlag.git
cd Schlag
npm install
npm run tauri dev
```

`npm run tauri dev` runs the full desktop app (Rust backend + webview). `npm run dev` alone starts just the Vite dev server — useful for pure-frontend iteration, but `invoke()` calls to the Rust backend will reject without a real Tauri context.

> **Note:** Changing `src-tauri/capabilities/` or `tauri.conf.json` requires a full stop + restart of `npm run tauri dev` — Tauri compiles capabilities and window config into the Rust binary at build time.

## Running tests

| Command | What it does |
|---|---|
| `npm test` | Frontend unit tests (Vitest) |
| `cargo test` (from `src-tauri/`) | Rust unit tests |
| `cargo clippy` (from `src-tauri/`) | Rust linter — run after any Rust change |

Run all three before submitting a PR.

## Linting and type checking

```sh
npm run build      # runs tsc + vite build
cargo clippy --manifest-path src-tauri/Cargo.toml
```

## Code style

- **Frontend:** React + TypeScript, Zustand for state, Tailwind for styling
- **Backend:** Rust — idiomatic, prefer composition, keep modules focused
- **No comments** unless explicitly asked
- Separate UI from business logic; keep filesystem logic in Rust, React focused on presentation
- Use `useCallback` with stable deps for handler functions passed as props
- Prefer `React.memo` on row/tile components for list virtualization

## Project structure

```
src/features/file-explorer/   # the one frontend feature module
src-tauri/src/                 # Rust backend: fs_ops, database, indexer, search, content_index, preview, terminal, settings
plan.md                        # phase roadmap and feature checklist
CLAUDE.md                      # architecture notes, design rationale, debugged gotchas
DESIGN.md                      # visual spec (colors, typography, spacing)
```

## Submitting changes

1. Fork the repo and create a feature branch from `main`
2. Make your changes, keeping commits focused and atomic
3. Run the full test suite (`npm test` + `cargo test` + `cargo clippy`)
4. Open a PR against `main` with a clear description of what changed and why
