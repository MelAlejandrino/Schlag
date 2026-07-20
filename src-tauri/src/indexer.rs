use crate::content_index::{self, ContentSchema};
use crate::database;
use notify::event::{ModifyKind, RenameMode};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rayon::prelude::*;
use rusqlite::Connection;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tantivy::Index;
use walkdir::WalkDir;

// A file whose content should be indexed (create/modify), or one whose
// content should be dropped from the index (removed, or renamed away).
// `modified_ms` travels with Index so the content-indexer thread can skip
// re-extraction without a second stat call.
pub(crate) enum ContentEvent {
    Index(PathBuf, u64),
    Remove(PathBuf),
}

// Wrapper so Tauri can manage the content-event sender as state — the
// indexer's own receiver lives on the dedicated content-indexer thread.
// fs_ops uses this to queue immediate re-indexing after a move/copy/rename,
// rather than relying solely on the notify watcher (which can drop rename
// events under heavy churn on Windows).
#[derive(Clone)]
pub struct ContentEventSender {
    tx: std::sync::mpsc::Sender<ContentEvent>,
}

impl ContentEventSender {
    pub fn queue_index(&self, path: &Path, modified_ms: u64) {
        let _ = self.tx.send(ContentEvent::Index(path.to_path_buf(), modified_ms));
    }

    pub fn queue_remove(&self, path: &Path) {
        let _ = self.tx.send(ContentEvent::Remove(path.to_path_buf()));
    }

    // Exposes the raw sender for internal use by the indexer thread and
    // functions that accept `&Sender<ContentEvent>` (prune_stale_entries,
    // drain_events, scan_drive, etc.).
    pub fn sender(&self) -> &std::sync::mpsc::Sender<ContentEvent> {
        &self.tx
    }
}

pub fn create_content_channel() -> (ContentEventSender, std::sync::mpsc::Receiver<ContentEvent>) {
    let (tx, rx) = std::sync::mpsc::channel();
    (ContentEventSender { tx }, rx)
}

fn queue_content_event(tx: &Sender<ContentEvent>, path: &Path, extension: Option<&str>, modified_ms: u64) {
    if extension.map(content_index::is_extractable).unwrap_or(false) {
        let _ = tx.send(ContentEvent::Index(path.to_path_buf(), modified_ms));
    }
}

fn queue_content_removal(tx: &Sender<ContentEvent>, path: &Path) {
    let extractable = path.extension().and_then(|e| e.to_str()).map(content_index::is_extractable).unwrap_or(false);
    if extractable {
        let _ = tx.send(ContentEvent::Remove(path.to_path_buf()));
    }
}

const BATCH_SIZE: usize = 500;

// Noisy, non-user-data trees that would otherwise dominate scan time
// (dev dependency trees, VCS internals, OS reserved folders). Name-based
// and case-insensitive so it works regardless of walk depth.
// ponytail: hardcoded list, not a setting — add a settings toggle (Phase 6)
// if users ever need to customize it.
const EXCLUDED_DIR_NAMES: &[&str] = &[
    "node_modules",
    ".git",
    ".cache",
    "$recycle.bin",
    "system volume information",
    // Package-manager / dependency / SDK caches — confirmed live via a real
    // filename-search query for "cookies" that surfaced `.bun`/`.dotnet`
    // package-cache hits alongside legitimate project files (see CLAUDE.md);
    // same category as the rest of this group, added on the same evidence
    // bar. Content lives here, never gets user-searched by name: same
    // reasoning already applied to `.venv`/`.cargo` below regardless of
    // where they're nested, not just at $HOME.
    ".cargo",
    ".rustup",
    ".npm",
    ".nuget",
    ".gradle",
    ".m2",
    ".venv",
    "venv",
    "__pycache__",
    "site-packages",
    ".bun",
    ".dotnet",
    ".docker",
    ".android",
    ".expo",
    ".ollama",
    // GitKraken's own workspace-tracking folder (cloudWorkspaces.json,
    // repoMapping.json, etc.) — app config, not user content.
    ".gk",
    // The XDG "user-local" tree (bin/share/state) several Linux-descended
    // CLI tools (pipx, uv, poetry) write under $HOME even on Windows —
    // nothing a user creates or names by hand, same category as .cargo/.npm.
    ".local",
    // Same category, wider ecosystem coverage — Python, JS package managers
    // and version managers, and language/build-tool caches not already
    // covered above. All dot-prefixed (except site-packages/venv above,
    // already covered), which on Windows means "created by a tool," not
    // "a user made this folder via Explorer" — nobody hand-types a leading
    // dot when naming their own folder in the UI.
    ".yarn",
    ".pnpm-store",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".ipynb_checkpoints",
    ".pyenv",
    ".nvm",
    ".rvm",
    ".sdkman",
    ".stack-work",
    ".ccache",
    ".conan",
    ".conan2",
    ".platformio",
    ".pub-cache",
    ".dart_tool",
    ".bundle",
    ".terraform",
    ".terraform.d",
    ".serverless",
    ".vercel",
    ".netlify",
    ".firebase",
    // The XDG "user-config" tree — same reasoning/risk as .cache/.local
    // above: plenty of cross-platform CLI tools (gh, gcloud, htop, and
    // others that hardcode "~/.config" regardless of OS) write here even on
    // Windows, and it's the same "nobody hand-creates a dot-folder" case.
    ".config",
    // Build output — plain English words, so a real (if small) collision
    // risk with a user's own folder, same tier already accepted for
    // target/dist/build below; all four are near-universally build-tool or
    // test-tool output in practice, not personal document folders.
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".output",
    ".svelte-kit",
    ".angular",
    ".astro",
    ".docusaurus",
    ".turbo",
    ".parcel-cache",
    "coverage",
    ".nyc_output",
    "htmlcov",
    // Per-project IDE/editor bookkeeping (workspace settings, indexes,
    // local history) — generated/managed by the editor, not authored by the
    // user, and never searched for by folder name. Same bucket as .git: the
    // *contents* can technically be user-adjacent (e.g. .vscode/settings.json
    // holds real preferences), but the folder itself is tool state, matching
    // how .git's own config/commit metadata is excluded regardless.
    ".vscode",
    ".idea",
    ".vs",
    ".fleet",
    ".settings",
    ".metadata",
    ".history",
    // Version control systems other than Git — same rationale as .git above.
    ".svn",
    ".hg",
    ".bzr",
    // Never index credentials. This isn't a noise/relevance judgment like
    // the rest of this list — a file explorer that surfaces SSH private
    // keys, `known_hosts`, or `authorized_keys` filenames (and, if any ever
    // matched an extractable extension, content) in a general-purpose
    // Recent Files or search UI is a real exposure, independent of whether
    // those files are ever actually modified often enough to be "noisy".
    // .aws/.azure are the same category, just cloud-CLI credential stores
    // (access keys, service-principal tokens) instead of SSH keys.
    ".ssh",
    ".aws",
    ".azure",
    // The entire per-user application-data tree — Roaming, Local, and
    // LocalLow all live directly under a folder literally named "AppData",
    // so this one entry prunes all three at once. Browser profiles (Chrome's
    // `Cookies`/`Cookies-journal`/network-state journal files), npm/yarn/pip
    // caches under the user profile, %TEMP%, and every other app's private
    // scratch data all live here — none of it is ever something a user
    // searches for by name. Confirmed live: this exact junk (Cookies files,
    // npm debug logs, stray %TEMP% files) was dominating the Recent Files
    // list before this was added. This also covers this app's own data
    // directory (`index.db` + WAL, under `%APPDATA%\com.carlo.schlag`) for
    // free — without excluding that specifically, every write to our own
    // index would generate a filesystem event the recursive watcher picks
    // up and re-indexes as if it were a normal file, a self-referential loop.
    "appdata",
    // A handful of individual, singleton *files* (not directories) that live
    // at a drive's root and are among the most frequently-rewritten files on
    // the entire system — Windows' own virtual-memory backing files, touched
    // continuously under normal use, confirmed live sitting at the very top
    // of a real Recent Files list ahead of anything a user actually did.
    // `is_excluded()` already runs against every entry (file or directory)
    // scan_drive's root-level loop and walk_subtree's filter_entry see, so
    // these fit the same name-match list rather than needing a parallel one.
    "hiberfil.sys",
    "pagefile.sys",
    "swapfile.sys",
    "dumpstack.log.tmp",
];

// Whole OS/application-install trees — `C:\Windows`, `C:\Program Files`, etc.
// — matched **only when the name is a drive's own top-level folder**, unlike
// EXCLUDED_DIR_NAMES above (which matches at any depth). "Windows" or
// "Program Files" are real, if uncommon, names a user could legitimately
// give their *own* nested folder (a cross-platform project's own `windows/`
// build folder, say) — matching those by name at arbitrary depth the way
// `node_modules`/`AppData` safely can would risk pruning real user content.
// Restricting the match to "is this the first path component under a drive
// letter" avoids that risk entirely while still catching the exact trees
// this exists for: confirmed live, `C:\Windows` alone (System32, winevt
// event logs, catroot2, scheduled Tasks) was dominating Recent Files with
// pure OS noise once AppData's own noise was cut.
// ponytail: hardcoded, not a setting — same rationale as EXCLUDED_DIR_NAMES.
const EXCLUDED_ROOT_DIR_NAMES: &[&str] = &[
    "windows",
    "program files",
    "program files (x86)",
    "programdata",
    "recovery",
    "perflogs",
    // Windows Update's own staging/history folder.
    "$getcurrent",
    // Legacy compatibility symlink to `Users` present on virtually every
    // real Windows install since Vista — walking it would either duplicate
    // the entire user tree under a second path or (if `walkdir` doesn't
    // follow the symlink, its default) index one harmless-but-pointless
    // junction entry; excluding it outright avoids relying on that default.
    "documents and settings",
];

// User-added exclusions from settings.json, initialized once at startup
// via `set_user_excluded_dirs()` from `spawn()`. Checked alongside the
// built-in lists in `is_excluded()`.
static USER_EXCLUDED_DIRS: OnceLock<Vec<String>> = OnceLock::new();

pub fn set_user_excluded_dirs(dirs: Vec<String>) {
    let _ = USER_EXCLUDED_DIRS.set(dirs);
}

// User-added full-path exclusions from settings.json — unlike
// USER_EXCLUDED_DIRS (a bare name, matched anywhere), each entry here is one
// specific location. Normalized once up front (lowercased, trailing
// separator trimmed) so is_excluded_path() can do a plain prefix compare per
// call instead of re-normalizing on every check.
static USER_EXCLUDED_PATHS: OnceLock<Vec<String>> = OnceLock::new();

pub fn set_user_excluded_paths(paths: Vec<String>) {
    let normalized = paths.iter().map(|p| normalize_path(p)).collect();
    let _ = USER_EXCLUDED_PATHS.set(normalized);
}

fn normalize_path(path: &str) -> String {
    path.trim_end_matches(['\\', '/']).to_lowercase()
}

// True if `path` is exactly one of the user's excluded paths, or nested
// inside one. A plain `starts_with` on the un-normalized string would also
// match a sibling that merely shares a prefix (`C:\Foo` matching
// `C:\FooBar`), so the descendant check requires the next character to be a
// path separator, not just any suffix. Split from is_excluded_path() so the
// comparison itself is testable against a plain Vec<String>, without going
// through the process-global, set-only-once OnceLock.
fn path_matches_excluded(path_str: &str, excluded_paths: &[String]) -> bool {
    excluded_paths
        .iter()
        .any(|excluded| path_str == *excluded || path_str.starts_with(&format!("{excluded}\\")))
}

fn is_excluded_path(path: &Path) -> bool {
    let Some(user_paths) = USER_EXCLUDED_PATHS.get() else {
        return false;
    };
    if user_paths.is_empty() {
        return false;
    }
    let path_str = normalize_path(&path.to_string_lossy());
    path_matches_excluded(&path_str, user_paths)
}

fn is_excluded(name: &OsStr) -> bool {
    let name = name.to_string_lossy();
    if EXCLUDED_DIR_NAMES.iter().any(|excluded| name.eq_ignore_ascii_case(excluded)) {
        return true;
    }
    if let Some(user_dirs) = USER_EXCLUDED_DIRS.get() {
        if user_dirs.iter().any(|excluded| name.eq_ignore_ascii_case(excluded)) {
            return true;
        }
    }
    false
}

// True only for a path whose first component after the drive letter (e.g.
// `Windows` in `C:\Windows\System32\...`) matches EXCLUDED_ROOT_DIR_NAMES —
// deliberately not a "matches anywhere in the path" check like is_excluded(),
// see that constant's own comment for why.
fn is_excluded_root_dir(path: &Path) -> bool {
    let mut components = path.components();
    components.next(); // Prefix, e.g. `C:`
    components.next(); // RootDir, `\`
    match components.next() {
        Some(std::path::Component::Normal(name)) => {
            let name = name.to_string_lossy();
            EXCLUDED_ROOT_DIR_NAMES.iter().any(|excluded| name.eq_ignore_ascii_case(excluded))
        }
        _ => false,
    }
}

// The initial walk prunes excluded directories by name so it never descends
// into them at all. The live notify watcher has no such pruning (it watches
// whole drives recursively), so it needs this instead: check every component
// of an event's path, since the event can be a file several levels inside an
// excluded directory (e.g. a dev server writing into node_modules/.vite).
// Also covers the root-only exclusions above — a live write anywhere under
// `C:\Windows` must be recognized as excluded here too, not just pruned from
// the initial directory walk.
fn path_is_excluded(path: &Path) -> bool {
    path.components().any(|c| is_excluded(c.as_os_str()))
        || is_excluded_root_dir(path)
        || is_excluded_path(path)
}

pub struct IndexStatus {
    scanning: AtomicBool,
    indexed_count: AtomicU64,
    // Content extraction (PDF/DOCX/XLSX/PPTX/text parsing) trickles in on
    // its own thread/channel, independent of the metadata scan above — see
    // ContentEvent. There's no matching "content_scanning" boolean: unlike
    // the metadata scan, content indexing has no clean "done" moment (new
    // extractable files keep arriving via notify for the app's whole
    // lifetime), so this is just a running total, not a progress bar.
    content_indexed_count: AtomicU64,
}

impl IndexStatus {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            scanning: AtomicBool::new(true),
            indexed_count: AtomicU64::new(0),
            content_indexed_count: AtomicU64::new(0),
        })
    }
}

#[derive(serde::Serialize)]
pub struct IndexStatusSnapshot {
    scanning: bool,
    indexed_count: u64,
    content_indexed_count: u64,
}

#[tauri::command]
pub fn index_status(status: tauri::State<Arc<IndexStatus>>) -> IndexStatusSnapshot {
    IndexStatusSnapshot {
        scanning: status.scanning.load(Ordering::Relaxed),
        indexed_count: status.indexed_count.load(Ordering::Relaxed),
        content_indexed_count: status.content_indexed_count.load(Ordering::Relaxed),
    }
}

// So SettingsPage's "Built-in" chip list is always this list, not a
// hand-copied second one that silently drifted out of sync (found live —
// the frontend's own hardcoded copy had 8 of the ~30 real entries).
// EXCLUDED_ROOT_DIR_NAMES isn't included: it matches only at a drive's own
// root, a different (narrower) rule than this anywhere-in-path list, and
// blending the two would misrepresent what actually gets excluded where.
#[tauri::command]
pub fn built_in_excluded_dirs() -> Vec<String> {
    EXCLUDED_DIR_NAMES.iter().map(|s| s.to_string()).collect()
}

// Spawns the one background thread that owns the SQLite connection for the
// app's lifetime: scans every drive, then watches all of them for changes.
// Never blocks the caller — returns immediately with a handle to poll status.
pub fn spawn(db_path: PathBuf, drives: Vec<String>, content_index: Index, content_schema: ContentSchema, content_tx: ContentEventSender, content_rx: std::sync::mpsc::Receiver<ContentEvent>) -> Arc<IndexStatus> {
    let status = IndexStatus::new();
    let status_thread = status.clone();

    std::thread::spawn(move || {
        let conn = match database::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("failed to open index database, indexing disabled this session: {e}");
                status_thread.scanning.store(false, Ordering::Relaxed);
                return;
            }
        };

        // One-time, potentially slow (measured: 118s against a real
        // ~1.5M-row index) migration for anyone upgrading from before the
        // search feature existed — must run here, off the startup path, not
        // in database::open() itself. A no-op on fresh installs.
        if let Err(e) = database::backfill_fts_if_needed(&conn) {
            tracing::error!("failed to backfill search index: {e}");
        }

        // Start watching *before* scanning: a file created while a large
        // drive is still being scanned would otherwise sit in a gap between
        // "the scan already passed this directory" and "the watcher exists
        // yet" and never get indexed at all — this was a real, reachable
        // bug (create a file mid-scan via the OS's own file explorer, it
        // never shows up in search). Events queue harmlessly until drained.
        let (_watchers, rx) = start_watchers(&drives);

        // Shared with the drain thread below, so live changes get applied
        // *during* the scan (which can take minutes on a large drive)
        // instead of queuing until the whole scan finishes — draining
        // sequentially after the scan was a real, reachable bug: a file
        // created mid-scan wouldn't show up in search until the entire
        // scan completed, which felt indistinguishable from still-broken.
        // Both sides just take the same lock per batch/event; SQLite only
        // allows one writer at a time regardless, so this doesn't add real
        // contention beyond what a single writer already implies.
        let conn = Arc::new(Mutex::new(conn));

        // Self-heals against delete events the watcher missed: watching an
        // entire drive recursively via Windows' ReadDirectoryChangesW can
        // silently drop events under heavy filesystem churn — confirmed
        // live (deleting a file via the `trash` crate produced no notify
        // event at all despite the file genuinely being gone). Without this,
        // a missed delete is effectively permanent — nothing else ever
        // prunes a row for a file that no longer exists. Runs once at
        // startup against last session's index, not continuously.
        let drain_conn = Arc::clone(&conn);

        // Content extraction (parsing PDFs/DOCX/etc.) is far slower per-file
        // than a stat call, so it gets its own thread/channel rather than
        // running inline in the scan — a single dedicated consumer thread
        // owns the Tantivy IndexWriter exclusively (no Mutex needed, unlike
        // the SQLite connection: a writer isn't safely shared across threads
        // the way a Mutex<Connection> already handles).
        let content_conn = Arc::clone(&conn);
        let content_status = status_thread.clone();
        std::thread::spawn(move || run_content_indexer(content_conn, content_index, content_schema, content_rx, content_status));

        let inner_tx = content_tx.sender().clone();
        prune_stale_entries(&conn, &inner_tx);
        prune_stale_content_state(&conn, &inner_tx);

        let drain_content_tx = inner_tx.clone();
        std::thread::spawn(move || drain_events(&drain_conn, rx, &drain_content_tx));

        // Scan the user's own files first so useful results exist quickly,
        // instead of making them wait for the whole drive to finish. It gets
        // walked again as part of its drive below — a small, accepted amount
        // of duplicate (but idempotent) work in exchange for not tracking
        // which paths were already covered.
        if let Ok(home) = crate::fs_ops::home_dir() {
            scan_drive(&conn, Path::new(&home), &status_thread, &inner_tx);
        }

        for drive in &drives {
            scan_drive(&conn, Path::new(drive), &status_thread, &inner_tx);
        }
        status_thread.scanning.store(false, Ordering::Relaxed);
        tracing::info!(
            "initial scan complete: {} entries indexed",
            status_thread.indexed_count.load(Ordering::Relaxed)
        );

        // The scan's sustained batch-write volume can grow the WAL file well
        // past SQLite's default auto-checkpoint threshold (confirmed live:
        // 156MB against a ~1.5M-row scan) — passive checkpoints keep getting
        // deferred under that kind of continuous write pressure rather than
        // ever running to completion. One explicit TRUNCATE checkpoint right
        // after the write burst ends reclaims that space in one shot.
        let checkpoint_result = conn.lock().unwrap_or_else(|e| e.into_inner()).execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        if let Err(e) = checkpoint_result {
            tracing::warn!("wal checkpoint after initial scan failed: {e}");
        }
    });

    status
}

// Lists root's immediate children on the calling thread, then walks each
// child subdirectory's subtree in parallel via rayon — a real speedup since
// stat-ing millions of files is I/O/CPU bound, not serialized by anything
// except the (fast, batched) writes back into the shared connection. Takes
// the connection behind a shared Mutex (rather than owning it exclusively)
// since a second thread drains live filesystem events concurrently — see
// spawn().
fn scan_drive(conn: &Mutex<Connection>, root: &Path, status: &IndexStatus, content_tx: &Sender<ContentEvent>) {
    let mut root_batch = Vec::new();
    if let Ok(meta) = fs::metadata(root) {
        root_batch.push(make_row(root, &meta));
    }

    let mut subdirs = Vec::new();
    match fs::read_dir(root) {
        Ok(entries) => {
            for entry in entries.filter_map(Result::ok) {
                if is_excluded(&entry.file_name())
                    || is_excluded_root_dir(&entry.path())
                    || is_excluded_path(&entry.path())
                {
                    continue;
                }
                match entry.metadata() {
                    Ok(meta) if meta.is_dir() => subdirs.push(entry.path()),
                    Ok(meta) => {
                        let row = make_row(&entry.path(), &meta);
                        queue_content_event(content_tx, &entry.path(), row.extension.as_deref(), row.modified_ms);
                        root_batch.push(row);
                    }
                    Err(_) => {}
                }
            }
        }
        Err(err) => {
            // Permission denied / locked / disappeared mid-scan — skip, never abort the scan.
            tracing::warn!("failed to read {}: {err}", root.display());
        }
    }
    flush_batch(&mut conn.lock().unwrap_or_else(|e| e.into_inner()), &mut root_batch, status);

    subdirs.par_iter().for_each(|dir| walk_subtree(conn, dir, status, content_tx));
}

fn walk_subtree(conn: &Mutex<Connection>, root: &Path, status: &IndexStatus, content_tx: &Sender<ContentEvent>) {
    let mut batch = Vec::with_capacity(BATCH_SIZE);
    // Unlike is_excluded_root_dir (only ever relevant at a drive's own top
    // level — see that constant's comment), a user-excluded *path* can be
    // anywhere, including deep inside a subtree scan_drive has already
    // handed off here — so is_excluded_path needs its own check per entry,
    // not just at the root-level loop above.
    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| !is_excluded(e.file_name()) && !is_excluded_path(e.path()))
    {
        let entry = match entry {
            Ok(e) => e,
            Err(err) => {
                tracing::warn!("walkdir error under {}: {err}", root.display());
                continue;
            }
        };
        let Ok(meta) = entry.metadata() else { continue };
        let row = make_row(entry.path(), &meta);
        queue_content_event(content_tx, entry.path(), row.extension.as_deref(), row.modified_ms);
        batch.push(row);

        if batch.len() >= BATCH_SIZE {
            flush_batch(&mut conn.lock().unwrap_or_else(|e| e.into_inner()), &mut batch, status);
        }
    }
    flush_batch(&mut conn.lock().unwrap_or_else(|e| e.into_inner()), &mut batch, status);
}

// Checking is a stat call per already-indexed row — cheap individually,
// parallelized via rayon since it's I/O-bound, same reasoning as the scan
// itself. Not something to run continuously (millions of stat calls isn't
// free at that scale), just once per session to catch up.
//
// Also prunes any row that's still present on disk but now falls under an
// exclusion rule (e.g. AppData) — otherwise a user upgrading from before
// that rule existed would keep seeing already-indexed junk forever, since
// the scan only ever adds/updates rows and never deletes ones that still
// exist. path_is_excluded() is a cheap string check with no I/O, so it's
// checked first and short-circuits the stat call entirely for those rows.
fn prune_stale_entries(conn: &Mutex<Connection>, content_tx: &Sender<ContentEvent>) {
    let paths: Vec<String> = {
        let conn = conn.lock().unwrap_or_else(|e| e.into_inner());
        let rows = conn
            .prepare("SELECT path FROM files")
            .and_then(|mut stmt| stmt.query_map([], |r| r.get::<_, String>(0))?.collect());
        match rows {
            Ok(paths) => paths,
            Err(e) => {
                tracing::error!("failed to read paths for stale-entry check: {e}");
                return;
            }
        }
    };

    let stale: Vec<String> = paths
        .into_par_iter()
        .filter(|p| path_is_excluded(Path::new(p)) || !Path::new(p).exists())
        .collect();
    if stale.is_empty() {
        return;
    }
    {
        let mut conn = conn.lock().unwrap_or_else(|e| e.into_inner());
        if let Err(e) = database::delete_batch(&mut conn, &stale) {
            tracing::error!("failed to batch-prune {} stale/excluded entries: {e}", stale.len());
        }
    }
    for path in &stale {
        queue_content_removal(content_tx, Path::new(path));
    }
    tracing::info!("pruned {} stale or now-excluded index entries", stale.len());
}

// content_index_state (the Tantivy content-index's own bookkeeping table)
// can drift out of sync with `files` independently — it's not enough for
// prune_stale_entries above to derive removals from `files`'s own stale
// list, because content_index_state can outlive the `files` row it was
// derived from. Confirmed live: an earlier prune_stale_entries run queued
// ContentEvent::Remove for ~500k newly-excluded AppData paths over the
// content-indexer thread's in-memory channel, but this app restarted
// (Tauri's dev-mode file watcher rebuilding on a source change) before that
// backlog fully drained — those in-memory removal requests are gone once
// the process exits, and since prune_stale_entries only ever looks at
// what's *currently* in `files` (already empty for those same paths by
// then), it never re-queues them. Left over 50,000 content_index_state rows
// (and their Tantivy documents) permanently orphaned under AppData, with
// the content-indexer thread completely idle — not a slow drain, a real
// gap. This reconciles content_index_state directly against its own paths
// instead of relying on that one-shot side channel ever having succeeded.
fn prune_stale_content_state(conn: &Mutex<Connection>, content_tx: &Sender<ContentEvent>) {
    let paths: Vec<String> = {
        let conn = conn.lock().unwrap_or_else(|e| e.into_inner());
        match database::content_index_state_paths(&conn) {
            Ok(paths) => paths,
            Err(e) => {
                tracing::error!("failed to read paths for content-state prune: {e}");
                return;
            }
        }
    };

    let stale: Vec<String> = paths
        .into_par_iter()
        .filter(|p| path_is_excluded(Path::new(p)) || !Path::new(p).exists())
        .collect();
    if stale.is_empty() {
        return;
    }
    for path in &stale {
        let _ = content_tx.send(ContentEvent::Remove(PathBuf::from(path)));
    }
    tracing::info!("queued removal of {} stale/excluded content-index entries", stale.len());
}

fn flush_batch(conn: &mut Connection, batch: &mut Vec<database::FileRow>, status: &IndexStatus) {
    if batch.is_empty() {
        return;
    }
    if let Err(e) = database::upsert_batch(conn, batch) {
        tracing::error!("index batch upsert failed: {e}");
    }
    status.indexed_count.fetch_add(batch.len() as u64, Ordering::Relaxed);
    batch.clear();
}

pub(crate) fn make_row(path: &Path, meta: &fs::Metadata) -> database::FileRow {
    let modified_ms = database::modified_ms(meta);
    database::FileRow {
        path: path.to_string_lossy().into_owned(),
        name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        extension: path.extension().map(|e| e.to_string_lossy().into_owned()),
        is_dir: meta.is_dir(),
        size: meta.len(),
        modified_ms,
    }
}

fn row_from_path(path: &Path) -> Option<database::FileRow> {
    let meta = fs::metadata(path).ok()?;
    Some(make_row(path, &meta))
}

// Registers a recursive watcher per drive and returns immediately with the
// receiving end — does not block. Deliberately called *before* the initial
// scan (see spawn()): a file created while a large drive is still being
// scanned would otherwise fall into a gap between "the scan already passed
// this directory" and "the watcher exists yet" and never get indexed at
// all. notify's OS-level watch (and this channel, which is unbounded) queue
// events regardless of whether anything is reading them yet, so starting
// watchers first and draining the channel later never loses an event —
// duplicate upserts against a path the scan also covers are harmless.
// Returns the watchers alongside the receiver — a watcher stops watching
// the moment it's dropped, so the caller must keep them alive (as a local
// binding is enough) for as long as it wants events to keep arriving.
fn start_watchers(drives: &[String]) -> (Vec<RecommendedWatcher>, std::sync::mpsc::Receiver<notify::Event>) {
    let (tx, rx) = std::sync::mpsc::channel::<notify::Event>();
    let mut watchers: Vec<RecommendedWatcher> = Vec::new();

    for drive in drives {
        let tx = tx.clone();
        let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                let _ = tx.send(event);
            }
        });
        match watcher {
            Ok(mut watcher) => match watcher.watch(Path::new(drive), RecursiveMode::Recursive) {
                Ok(()) => watchers.push(watcher),
                Err(e) => tracing::warn!("failed to watch {drive} for changes: {e}"),
            },
            Err(e) => tracing::warn!("failed to create watcher for {drive}: {e}"),
        }
    }

    (watchers, rx)
}

// Blocks forever, applying filesystem change events to the index. Runs on
// its own thread, concurrently with the initial scan (see spawn()) — not
// after it — so a file created while a large drive is still being scanned
// shows up immediately rather than waiting for the whole scan to finish.
fn drain_events(conn: &Mutex<Connection>, rx: std::sync::mpsc::Receiver<notify::Event>, content_tx: &Sender<ContentEvent>) {
    for event in rx {
        apply_event(&conn.lock().unwrap_or_else(|e| e.into_inner()), event, content_tx);
    }
}

// Exclusion must be checked per-path, not once for the whole event: deleting
// a file (whether via Explorer or our own trash-crate-backed delete_entry)
// moves it into $RECYCLE.BIN rather than removing it outright, which notify
// can report as a rename (old real path -> new $RECYCLE.BIN path). Skipping
// the *entire* event because the new (excluded) path is in it was a real
// bug — the old, non-excluded path never got deleted from the index, so a
// deleted file kept showing up in search forever.
fn apply_event(conn: &Connection, event: notify::Event, content_tx: &Sender<ContentEvent>) {
    match event.kind {
        EventKind::Remove(_) => {
            for path in &event.paths {
                if path_is_excluded(path) {
                    continue;
                }
                if let Some(p) = path.to_str() {
                    if let Err(e) = database::delete_by_path(conn, p) {
                        tracing::warn!("failed to remove {p} from index: {e}");
                    }
                }
                queue_content_removal(content_tx, path);
            }
        }
        // Rename delivered as a single before/after pair (most common on Windows/macOS).
        EventKind::Modify(ModifyKind::Name(RenameMode::Both)) if event.paths.len() == 2 => {
            if !path_is_excluded(&event.paths[0]) {
                if let Some(old) = event.paths[0].to_str() {
                    if let Err(e) = database::delete_by_path(conn, old) {
                        tracing::warn!("failed to remove renamed-from {old} from index: {e}");
                    }
                }
                queue_content_removal(content_tx, &event.paths[0]);
            }
            if !path_is_excluded(&event.paths[1]) {
                if let Some(row) = row_from_path(&event.paths[1]) {
                    if let Err(e) = database::upsert_entry(conn, &row) {
                        tracing::warn!("failed to index renamed-to {}: {e}", event.paths[1].display());
                    }
                    queue_content_event(content_tx, &event.paths[1], row.extension.as_deref(), row.modified_ms);
                }
            }
        }
        EventKind::Create(_) | EventKind::Modify(_) => {
            for path in &event.paths {
                if path_is_excluded(path) {
                    continue;
                }
                // Path may already be gone by the time we stat it (rapid create+delete,
                // or the "From" half of a split rename) — skip rather than error.
                if let Some(row) = row_from_path(path) {
                    if let Err(e) = database::upsert_entry(conn, &row) {
                        tracing::warn!("failed to index {}: {e}", path.display());
                    }
                    queue_content_event(content_tx, path, row.extension.as_deref(), row.modified_ms);
                }
            }
        }
        _ => {}
    }
}

// Runs on its own dedicated thread for the app's lifetime, owning the
// Tantivy IndexWriter exclusively — consumes ContentEvents produced by the
// scan, the live notify drain, and the startup stale-entry prune. Commits
// are batched (by count or by elapsed time, whichever comes first) rather
// than per-event, since a Tantivy commit is a real segment-writing operation
// and content events are far less frequent than metadata upserts anyway.
fn run_content_indexer(
    conn: Arc<Mutex<Connection>>,
    index: Index,
    schema: ContentSchema,
    rx: std::sync::mpsc::Receiver<ContentEvent>,
    status: Arc<IndexStatus>,
) {
    let mut writer = match index.writer(50_000_000) {
        Ok(w) => w,
        Err(e) => {
            tracing::error!("failed to open content index writer, content search disabled this session: {e}");
            return;
        }
    };

    const COMMIT_BATCH: usize = 50;
    const COMMIT_INTERVAL: Duration = Duration::from_secs(5);
    let mut since_commit = 0usize;
    let mut last_commit = std::time::Instant::now();
    // Pending content_index_state deletes, flushed in one transaction at the
    // same points writer.commit() already fires below — a bare per-event
    // delete_content_indexed_mtime call (each its own implicit transaction)
    // is an order of magnitude slower once a real removal backlog needs
    // processing at once (confirmed live: prune_stale_content_state can
    // queue tens of thousands of these in one shot after an exclusion-rule
    // change), same class of fix already applied to database::delete_batch.
    let mut pending_removals: Vec<String> = Vec::new();

    for event in rx {
        match event {
            ContentEvent::Remove(path) => {
                let path_str = path.to_string_lossy().into_owned();
                content_index::remove_path(&writer, &schema, &path_str);
                pending_removals.push(path_str);
                since_commit += 1;
            }
            ContentEvent::Index(path, modified_ms) => {
                let path_str = path.to_string_lossy().into_owned();

                // Skip re-extraction if this exact mtime was already
                // indexed — the metadata scan re-walks every drive on every
                // launch, and content extraction is far too expensive to
                // redo unconditionally on files that haven't changed.
                let already_current = conn
                    .lock()
                    .ok()
                    .and_then(|c| database::content_indexed_mtime(&c, &path_str).ok().flatten())
                    .map(|indexed_ms| indexed_ms == modified_ms)
                    .unwrap_or(false);
                if already_current {
                    continue;
                }

                // Confirmed live: pdf-extract can panic outright (not just
                // return an Err) on a malformed PDF (e.g. a font missing
                // width data) — an uncaught panic here unwinds straight
                // through this thread, since it's the sole consumer of this
                // channel (see run_content_indexer's own doc comment); once
                // it dies, content indexing silently stops for the rest of
                // the session, with no visible error and no way to recover
                // short of restarting the app. catch_unwind turns that into
                // "skip this one file," matching how any other extraction
                // failure here is already handled.
                let extracted = std::panic::catch_unwind(|| content_index::extract_text(&path)).unwrap_or_else(|_| {
                    tracing::warn!("content extraction panicked for {}; skipping this file", path.display());
                    None
                });
                if let Some(text) = extracted {
                    match content_index::index_path(&writer, &schema, &path_str, &text, modified_ms) {
                        Ok(()) => {
                            if let Ok(conn) = conn.lock() {
                                let _ = database::set_content_indexed_mtime(&conn, &path_str, modified_ms);
                            }
                            status.content_indexed_count.fetch_add(1, Ordering::Relaxed);
                            since_commit += 1;
                        }
                        Err(e) => tracing::warn!("failed to content-index {}: {e}", path.display()),
                    }
                }
            }
        }

        if since_commit >= COMMIT_BATCH || last_commit.elapsed() >= COMMIT_INTERVAL {
            if let Err(e) = writer.commit() {
                tracing::error!("content index commit failed: {e}");
            }
            since_commit = 0;
            last_commit = std::time::Instant::now();
            flush_pending_removals(&conn, &mut pending_removals);
        }
    }
    let _ = writer.commit();
    flush_pending_removals(&conn, &mut pending_removals);
}

fn flush_pending_removals(conn: &Mutex<Connection>, pending: &mut Vec<String>) {
    if pending.is_empty() {
        return;
    }
    if let Ok(mut conn) = conn.lock() {
        if let Err(e) = database::delete_content_indexed_mtime_batch(&mut conn, pending) {
            tracing::error!("failed to batch-delete {} content-index-state rows: {e}", pending.len());
        }
    }
    pending.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests exercise scan_drive/apply_event/prune_stale_entries directly,
    // without a real content-indexer thread consuming the channel — a
    // throwaway sender with nothing on the receiving end is enough, since
    // an unbounded mpsc channel with a dropped receiver just silently
    // discards sends rather than erroring or blocking.
    fn test_content_tx() -> Sender<ContentEvent> {
        std::sync::mpsc::channel().0
    }

    // Fixtures must live somewhere no component of EXCLUDED_DIR_NAMES
    // matches: on Windows, the standard temp-dir API resolves under
    // %LOCALAPPDATA%\Temp, which the "appdata" entry now (correctly) prunes
    // — and naively nesting this under the crate's own target/ directory
    // instead trips the *"target"* entry (Rust's own build-output exclusion)
    // just as fast. Either would get silently pruned by the very code under
    // test. "test-scratch" is a sibling of target/, not a child of it —
    // git-ignored below, same as target/ itself.
    fn test_scratch_dir() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("test-scratch")
    }

    #[test]
    fn prune_stale_entries_removes_rows_for_missing_files_only() {
        let base = test_scratch_dir().join("schlag_test_indexer_prune");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let kept = base.join("still_here.txt");
        fs::write(&kept, b"hi").unwrap();
        let gone = base.join("already_deleted.txt");
        fs::write(&gone, b"bye").unwrap();

        let db_path = test_scratch_dir().join("schlag_test_indexer_prune.sqlite");
        let _ = fs::remove_file(&db_path);
        let mut conn = database::open(&db_path).unwrap();
        database::upsert_batch(
            &mut conn,
            &[
                make_row(&kept, &fs::metadata(&kept).unwrap()),
                make_row(&gone, &fs::metadata(&gone).unwrap()),
            ],
        )
        .unwrap();
        assert_eq!(database::count(&conn).unwrap(), 2);

        // Simulate a missed delete event: the file is gone from disk, but
        // (unlike a real notify-driven delete) the row was never removed.
        fs::remove_file(&gone).unwrap();

        let conn = Mutex::new(conn);
        prune_stale_entries(&conn, &test_content_tx());
        let conn = conn.into_inner().unwrap();

        assert_eq!(database::count(&conn).unwrap(), 1);
        let remaining: String = conn.query_row("SELECT path FROM files", [], |r| r.get(0)).unwrap();
        assert_eq!(remaining, kept.to_string_lossy());

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }

    // Exercises the same scan_drive() used by the real background thread,
    // without spawning it or touching notify — deterministic and fast.
    #[test]
    fn scan_drive_indexes_nested_files_and_directories() {
        let base = test_scratch_dir().join("schlag_test_indexer_scan");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("nested")).unwrap();
        fs::write(base.join("root.txt"), b"hello").unwrap();
        fs::write(base.join("nested").join("deep.txt"), b"world").unwrap();

        let db_path = test_scratch_dir().join("schlag_test_indexer_scan.sqlite");
        let _ = fs::remove_file(&db_path);
        let conn = Mutex::new(database::open(&db_path).unwrap());
        let status = IndexStatus::new();

        scan_drive(&conn, &base, &status, &test_content_tx());
        let conn = conn.into_inner().unwrap();

        // base itself + root.txt + nested/ + nested/deep.txt
        assert_eq!(database::count(&conn).unwrap(), 4);
        assert_eq!(status.indexed_count.load(Ordering::Relaxed), 4);

        let root_path = base.join("root.txt").to_string_lossy().into_owned();
        let size: i64 = conn
            .query_row("SELECT size FROM files WHERE path = ?1", [&root_path], |row| row.get(0))
            .unwrap();
        assert_eq!(size, 5);

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn scan_drive_skips_excluded_directories() {
        let base = test_scratch_dir().join("schlag_test_indexer_excluded");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("node_modules").join("some-pkg")).unwrap();
        fs::write(base.join("node_modules").join("some-pkg").join("index.js"), b"noise").unwrap();
        fs::write(base.join("keep.txt"), b"kept").unwrap();

        let db_path = test_scratch_dir().join("schlag_test_indexer_excluded.sqlite");
        let _ = fs::remove_file(&db_path);
        let conn = Mutex::new(database::open(&db_path).unwrap());
        let status = IndexStatus::new();

        scan_drive(&conn, &base, &status, &test_content_tx());
        let conn = conn.into_inner().unwrap();

        // base itself + keep.txt only — node_modules/ is pruned entirely, not just its contents.
        assert_eq!(database::count(&conn).unwrap(), 2);
        let keep_path = base.join("keep.txt").to_string_lossy().into_owned();
        conn.query_row("SELECT path FROM files WHERE path = ?1", [&keep_path], |row| row.get::<_, String>(0))
            .expect("keep.txt should be indexed");

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn scan_drive_skips_ssh_and_extra_tool_caches() {
        let base = test_scratch_dir().join("schlag_test_indexer_ssh_and_caches");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join(".ssh")).unwrap();
        fs::write(base.join(".ssh").join("id_ed25519"), b"fake private key").unwrap();
        fs::create_dir_all(base.join(".bun").join("install")).unwrap();
        fs::write(base.join(".bun").join("install").join("cache.json"), b"noise").unwrap();
        fs::write(base.join("keep.txt"), b"kept").unwrap();

        let db_path = test_scratch_dir().join("schlag_test_indexer_ssh_and_caches.sqlite");
        let _ = fs::remove_file(&db_path);
        let conn = Mutex::new(database::open(&db_path).unwrap());
        let status = IndexStatus::new();

        scan_drive(&conn, &base, &status, &test_content_tx());
        let conn = conn.into_inner().unwrap();

        // base itself + keep.txt only — .ssh/ and .bun/ are pruned entirely.
        assert_eq!(database::count(&conn).unwrap(), 2);
        let keep_path = base.join("keep.txt").to_string_lossy().into_owned();
        conn.query_row("SELECT path FROM files WHERE path = ?1", [&keep_path], |row| row.get::<_, String>(0))
            .expect("keep.txt should be indexed");

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn is_excluded_root_dir_matches_only_the_drives_own_top_level_folder() {
        assert!(is_excluded_root_dir(Path::new(r"C:\Windows")));
        assert!(is_excluded_root_dir(Path::new(r"C:\Windows\System32\drivers\etc\hosts")));
        assert!(is_excluded_root_dir(Path::new(r"D:\Program Files\Vendor\app.exe")));
        assert!(is_excluded_root_dir(Path::new(r"C:\ProgramData\Bitdefender\cache.db")));

        // A user's own nested folder that happens to share a name with an
        // excluded root dir must not be excluded — only the drive's own
        // top-level folder should match, which is the whole reason this is
        // a separate, position-restricted check rather than reusing
        // is_excluded()'s anywhere-in-the-path matching.
        assert!(!is_excluded_root_dir(Path::new(r"C:\Users\carlo\Documents\myproject\windows\build.rs")));
    }

    #[test]
    fn path_is_excluded_covers_both_anywhere_names_and_root_only_names() {
        assert!(path_is_excluded(Path::new(r"C:\Users\carlo\AppData\Local\Temp\a.txt")));
        assert!(path_is_excluded(Path::new(r"C:\Windows\System32\foo.dll")));
        assert!(!path_is_excluded(Path::new(r"C:\Users\carlo\Documents\report.txt")));
    }

    #[test]
    fn path_matches_excluded_matches_exactly_and_descendants_only() {
        let excluded = vec![normalize_path(r"D:\Downloads\ISOs")];

        assert!(path_matches_excluded(&normalize_path(r"D:\Downloads\ISOs"), &excluded));
        assert!(path_matches_excluded(&normalize_path(r"D:\Downloads\ISOs\win11.iso"), &excluded));
        // Case-insensitive, matching every other name check in this module.
        assert!(path_matches_excluded(&normalize_path(r"D:\downloads\isos\win11.iso"), &excluded));

        // A sibling that merely shares a prefix must not match — this is
        // the whole reason the descendant check requires a trailing
        // separator rather than a plain starts_with.
        assert!(!path_matches_excluded(&normalize_path(r"D:\Downloads\ISOsBackup"), &excluded));
        assert!(!path_matches_excluded(&normalize_path(r"D:\Downloads\other.txt"), &excluded));
    }

    #[test]
    fn normalize_path_lowercases_and_strips_trailing_separator() {
        assert_eq!(normalize_path(r"D:\Downloads\ISOs\"), r"d:\downloads\isos");
        assert_eq!(normalize_path(r"D:\Downloads\ISOs"), r"d:\downloads\isos");
    }

    #[test]
    fn scan_drive_skips_noisy_root_level_system_files() {
        let base = test_scratch_dir().join("schlag_test_indexer_sysfiles");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        fs::write(base.join("pagefile.sys"), b"fake").unwrap();
        fs::write(base.join("keep.txt"), b"kept").unwrap();

        let db_path = test_scratch_dir().join("schlag_test_indexer_sysfiles.sqlite");
        let _ = fs::remove_file(&db_path);
        let conn = Mutex::new(database::open(&db_path).unwrap());
        let status = IndexStatus::new();

        scan_drive(&conn, &base, &status, &test_content_tx());
        let conn = conn.into_inner().unwrap();

        // base itself + keep.txt only.
        assert_eq!(database::count(&conn).unwrap(), 2);
        let keep_path = base.join("keep.txt").to_string_lossy().into_owned();
        conn.query_row("SELECT path FROM files WHERE path = ?1", [&keep_path], |row| row.get::<_, String>(0))
            .expect("keep.txt should be indexed");

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn scan_drive_skips_appdata_case_insensitively() {
        let base = test_scratch_dir().join("schlag_test_indexer_appdata");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("AppData").join("Local").join("Google").join("Chrome").join("User Data")).unwrap();
        fs::write(base.join("AppData").join("Local").join("Google").join("Chrome").join("User Data").join("Cookies"), b"noise").unwrap();
        fs::write(base.join("keep.txt"), b"kept").unwrap();

        let db_path = test_scratch_dir().join("schlag_test_indexer_appdata.sqlite");
        let _ = fs::remove_file(&db_path);
        let conn = Mutex::new(database::open(&db_path).unwrap());
        let status = IndexStatus::new();

        scan_drive(&conn, &base, &status, &test_content_tx());
        let conn = conn.into_inner().unwrap();

        // base itself + keep.txt only — the whole AppData subtree is pruned entirely.
        assert_eq!(database::count(&conn).unwrap(), 2);
        let keep_path = base.join("keep.txt").to_string_lossy().into_owned();
        conn.query_row("SELECT path FROM files WHERE path = ?1", [&keep_path], |row| row.get::<_, String>(0))
            .expect("keep.txt should be indexed");

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn prune_stale_entries_also_removes_existing_files_under_a_newly_excluded_directory() {
        let base = test_scratch_dir().join("schlag_test_indexer_prune_excluded");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("AppData").join("Local")).unwrap();
        let excluded_but_present = base.join("AppData").join("Local").join("Cookies");
        fs::write(&excluded_but_present, b"still on disk").unwrap();
        let kept = base.join("still_here.txt");
        fs::write(&kept, b"hi").unwrap();

        let db_path = test_scratch_dir().join("schlag_test_indexer_prune_excluded.sqlite");
        let _ = fs::remove_file(&db_path);
        let mut conn = database::open(&db_path).unwrap();
        // Simulate rows indexed by an older build, before AppData was excluded.
        database::upsert_batch(
            &mut conn,
            &[
                make_row(&kept, &fs::metadata(&kept).unwrap()),
                make_row(&excluded_but_present, &fs::metadata(&excluded_but_present).unwrap()),
            ],
        )
        .unwrap();
        assert_eq!(database::count(&conn).unwrap(), 2);

        let conn = Mutex::new(conn);
        prune_stale_entries(&conn, &test_content_tx());
        let conn = conn.into_inner().unwrap();

        // The AppData row is gone even though the file genuinely still exists on disk.
        assert_eq!(database::count(&conn).unwrap(), 1);
        let remaining: String = conn.query_row("SELECT path FROM files", [], |r| r.get(0)).unwrap();
        assert_eq!(remaining, kept.to_string_lossy());

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }

    // Reproduces the exact gap found live: a content_index_state row can
    // outlive the `files` row it was derived from (the in-memory
    // ContentEvent::Remove queued for it never got processed before an app
    // restart), so this must reconcile content_index_state's own paths
    // directly — not rely on `files` still having a matching row to key off.
    #[test]
    fn prune_stale_content_state_queues_removal_for_excluded_and_missing_paths_only() {
        let base = test_scratch_dir().join("schlag_test_indexer_prune_content_state");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("AppData").join("Local")).unwrap();
        let excluded_but_present = base.join("AppData").join("Local").join("notes.md");
        fs::write(&excluded_but_present, b"still on disk").unwrap();
        let missing = base.join("deleted.md");
        let kept = base.join("kept.md");
        fs::write(&kept, b"hi").unwrap();

        let db_path = test_scratch_dir().join("schlag_test_indexer_prune_content_state.sqlite");
        let _ = fs::remove_file(&db_path);
        let conn = database::open(&db_path).unwrap();
        // These paths intentionally have NO corresponding row in `files` —
        // reproducing the exact scenario where `files` was already pruned
        // in an earlier, interrupted pass.
        database::set_content_indexed_mtime(&conn, &excluded_but_present.to_string_lossy(), 1_700_000_000_000).unwrap();
        database::set_content_indexed_mtime(&conn, &missing.to_string_lossy(), 1_700_000_000_000).unwrap();
        database::set_content_indexed_mtime(&conn, &kept.to_string_lossy(), 1_700_000_000_000).unwrap();

        let conn = Mutex::new(conn);
        let (tx, rx) = std::sync::mpsc::channel::<ContentEvent>();
        prune_stale_content_state(&conn, &tx);
        drop(tx);

        let mut removed: Vec<String> = rx
            .iter()
            .map(|e| match e {
                ContentEvent::Remove(p) => p.to_string_lossy().into_owned(),
                ContentEvent::Index(..) => panic!("prune_stale_content_state should only ever send Remove events"),
            })
            .collect();
        removed.sort();
        let mut expected = vec![excluded_but_present.to_string_lossy().into_owned(), missing.to_string_lossy().into_owned()];
        expected.sort();
        assert_eq!(removed, expected, "only the excluded-but-present and missing paths should be queued for removal, not the kept one");

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn apply_event_handles_create_and_remove() {
        let base = test_scratch_dir().join("schlag_test_indexer_events");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let file = base.join("a.txt");
        fs::write(&file, b"hi").unwrap();

        let db_path = test_scratch_dir().join("schlag_test_indexer_events.sqlite");
        let _ = fs::remove_file(&db_path);
        let conn = database::open(&db_path).unwrap();

        apply_event(
            &conn,
            notify::Event { kind: EventKind::Create(notify::event::CreateKind::File), paths: vec![file.clone()], attrs: Default::default() },
            &test_content_tx(),
        );
        assert_eq!(database::count(&conn).unwrap(), 1);

        apply_event(
            &conn,
            notify::Event { kind: EventKind::Remove(notify::event::RemoveKind::File), paths: vec![file.clone()], attrs: Default::default() },
            &test_content_tx(),
        );
        assert_eq!(database::count(&conn).unwrap(), 0);

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }

    // Deleting a file (whether via the OS's own Explorer or our own
    // fs_ops::delete_entry, which uses the `trash` crate) moves it into
    // $RECYCLE.BIN rather than removing it outright — notify can report
    // that as a rename (old real path -> new $RECYCLE.BIN path), not a
    // plain Remove. The old path should still drop out of the index even
    // though the new path is excluded.
    #[test]
    fn apply_event_removes_old_path_when_moved_into_excluded_destination() {
        let base = test_scratch_dir().join("schlag_test_indexer_recycle");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let file = base.join("doomed.txt");
        fs::write(&file, b"hi").unwrap();
        let recycled = std::path::Path::new(r"C:\$RECYCLE.BIN\S-1-5-21-doomed.txt").to_path_buf();

        let db_path = test_scratch_dir().join("schlag_test_indexer_recycle.sqlite");
        let _ = fs::remove_file(&db_path);
        let conn = database::open(&db_path).unwrap();

        apply_event(
            &conn,
            notify::Event { kind: EventKind::Create(notify::event::CreateKind::File), paths: vec![file.clone()], attrs: Default::default() },
            &test_content_tx(),
        );
        assert_eq!(database::count(&conn).unwrap(), 1);

        apply_event(
            &conn,
            notify::Event {
                kind: EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                paths: vec![file.clone(), recycled],
                attrs: Default::default(),
            },
            &test_content_tx(),
        );
        assert_eq!(database::count(&conn).unwrap(), 0, "deleting a file should remove it from the index even though its recycle-bin destination is excluded");

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn apply_event_create_is_immediately_searchable() {
        let base = test_scratch_dir().join("schlag_test_indexer_search_sync");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let file = base.join("brand_new_report.txt");
        fs::write(&file, b"hi").unwrap();

        let db_path = test_scratch_dir().join("schlag_test_indexer_search_sync.sqlite");
        let _ = fs::remove_file(&db_path);
        let conn = database::open(&db_path).unwrap();

        apply_event(
            &conn,
            notify::Event { kind: EventKind::Create(notify::event::CreateKind::File), paths: vec![file.clone()], attrs: Default::default() },
            &test_content_tx(),
        );

        let fts_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM files_fts WHERE files_fts MATCH '\"brand_new_report\"'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fts_count, 1, "a file created via a live notify event should be searchable via FTS immediately, not just present in `files`");

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn apply_event_ignores_paths_under_excluded_directories() {
        let base = test_scratch_dir().join("schlag_test_indexer_excluded_events");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("node_modules").join(".vite")).unwrap();
        let file = base.join("node_modules").join(".vite").join("chunk.js");
        fs::write(&file, b"noise").unwrap();

        let db_path = test_scratch_dir().join("schlag_test_indexer_excluded_events.sqlite");
        let _ = fs::remove_file(&db_path);
        let conn = database::open(&db_path).unwrap();

        apply_event(
            &conn,
            notify::Event { kind: EventKind::Create(notify::event::CreateKind::File), paths: vec![file.clone()], attrs: Default::default() },
            &test_content_tx(),
        );
        assert_eq!(database::count(&conn).unwrap(), 0);

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&db_path);
    }
}
