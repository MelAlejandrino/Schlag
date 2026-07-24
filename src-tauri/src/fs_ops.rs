use crate::database;
use crate::indexer::ContentEventSender;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{Error, ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;

// Per-operation cancel flags, keyed by the batch's op_id, managed as Tauri
// state. Each paste/drop batch owns one flag; copy_entry/move_entry create it
// on first use, the copy loop polls it, cancel_copy(op_id) sets it, and
// end_copy(op_id) removes it when the batch finishes. Keyed (not one global
// flag) so two batches running at once — paste in one tab while another is
// still copying — can be cancelled independently.
#[derive(Default)]
pub struct CopyCancels(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

impl CopyCancels {
    fn flag_for(&self, op_id: &str) -> Arc<AtomicBool> {
        self.0
            .lock()
            .unwrap()
            .entry(op_id.to_string())
            .or_insert_with(|| Arc::new(AtomicBool::new(false)))
            .clone()
    }
}

// Sentinel error text a cancelled copy returns, so the frontend can tell a
// deliberate cancel apart from a real failure and not show an error banner.
const COPY_CANCELLED: &str = "__copy_cancelled__";

// Bundles what the tracked (progress-emitting) copy path needs: a closure to
// report progress and the cancel flag to poll. `emit` is a closure rather
// than the AppHandle directly so the copy loop has no Tauri dependency and is
// unit-testable with a no-op emitter (see the cancel test below).
struct CopyCtx<'a> {
    emit: &'a dyn Fn(CopyProgress),
    cancel: &'a AtomicBool,
}

#[tauri::command]
pub fn cancel_copy(state: tauri::State<'_, CopyCancels>, op_id: String) {
    if let Some(flag) = state.0.lock().unwrap().get(&op_id) {
        flag.store(true, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn end_copy(state: tauri::State<'_, CopyCancels>, op_id: String) {
    state.0.lock().unwrap().remove(&op_id);
}

#[derive(Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: u64,
}

#[derive(Serialize)]
pub struct QuickAccessDir {
    pub name: String,
    pub path: String,
}

#[tauri::command]
pub fn list_drives() -> Vec<QuickAccessDir> {
    // ponytail: drive letters via existence probe, not a WinAPI crate —
    // cheap and this app targets Windows for now. Revisit for mount points
    // if/when Linux/macOS support is planned.
    (b'A'..=b'Z')
        .filter_map(|letter| {
            let letter = letter as char;
            let path = format!("{letter}:\\");
            Path::new(&path)
                .exists()
                .then(|| QuickAccessDir { name: format!("{letter}:"), path })
        })
        .collect()
}

#[tauri::command]
pub fn home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "could not determine home directory".to_string())
}

#[tauri::command]
pub fn quick_access_dirs() -> Vec<QuickAccessDir> {
    let candidates = [
        ("Desktop", dirs::desktop_dir()),
        ("Documents", dirs::document_dir()),
        ("Downloads", dirs::download_dir()),
        ("Pictures", dirs::picture_dir()),
        ("Music", dirs::audio_dir()),
        ("Videos", dirs::video_dir()),
    ];
    candidates
        .into_iter()
        .filter_map(|(name, path)| {
            path.map(|p| QuickAccessDir {
                name: name.to_string(),
                path: p.to_string_lossy().into_owned(),
            })
        })
        .collect()
}

// Folders before files, then case-insensitive name — shared by list_dir and
// preview.rs's read_archive_dir (a zip's own listing), so a real folder and
// a zip's synthesized one always agree on order rather than drifting if one
// gets a future tweak (a natural/numeric sort, say) and the other doesn't.
pub fn sort_folders_first(entries: &mut [Entry]) {
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<Entry>, String> {
    let mut entries: Vec<Entry> = fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .filter_map(|res| res.ok())
        .filter_map(|dir_entry| {
            let meta = dir_entry.metadata().ok()?;
            let modified_ms = database::modified_ms(&meta);
            Some(Entry {
                name: dir_entry.file_name().to_string_lossy().into_owned(),
                path: dir_entry.path().to_string_lossy().into_owned(),
                is_dir: meta.is_dir(),
                size: meta.len(),
                modified_ms,
            })
        })
        .collect();

    sort_folders_first(&mut entries);

    Ok(entries)
}

// ponytail: exists() check up front, not just relying on the underlying
// syscall's own error — fs::write has no "create new only" mode and silently
// truncates an existing file to empty instead of failing, and on Windows a
// name collision with an existing *directory* surfaces as the opaque
// "Access is denied. (os error 5)" instead of a real "already exists" error.
// A pre-check gives one friendly, consistent message for both create_dir and
// create_file regardless of what already occupies the name.
#[tauri::command]
pub fn create_dir(path: String, conn: tauri::State<'_, Mutex<rusqlite::Connection>>, _content_tx: tauri::State<'_, ContentEventSender>) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::create_dir(&path).map_err(|e| e.to_string())?;
    database::index_path(&conn, Path::new(&path));
    Ok(())
}

#[tauri::command]
pub fn create_file(path: String, conn: tauri::State<'_, Mutex<rusqlite::Connection>>, content_tx: tauri::State<'_, ContentEventSender>) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::write(&path, []).map_err(|e| e.to_string())?;
    database::index_path(&conn, Path::new(&path));
    content_tx.queue_index(Path::new(&path), 0);
    Ok(())
}

// ponytail: same exists()-check guard as create_dir/create_file, for the
// same reason — Rust's fs::rename maps to Windows' MoveFileExW with
// MOVEFILE_REPLACE_EXISTING, which silently deletes and overwrites whatever
// was already at `to` instead of failing. Renaming a file onto an existing
// name destroyed that other file outright with no error and no trace.
#[tauri::command]
pub fn rename_entry(from: String, to: String, conn: tauri::State<'_, Mutex<rusqlite::Connection>>, content_tx: tauri::State<'_, ContentEventSender>) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::rename(&from, &to).map_err(|e| e.to_string())?;
    // Index the new path first, migrate tags onto it, then drop the old row —
    // this order keeps file_tags' FK valid and stops the ON DELETE CASCADE
    // from wiping the file's tags when the old row goes.
    database::index_path(&conn, Path::new(&to));
    database::retag_path(&conn, &from, &to);
    database::remove_path(&conn, Path::new(&from));
    content_tx.queue_remove(Path::new(&from));
    if let Ok(meta) = fs::metadata(&to) {
        content_tx.queue_index(Path::new(&to), database::modified_ms(&meta));
    }
    Ok(())
}

// ponytail: trash crate sends to the OS recycle bin instead of a raw
// fs::remove_*, so "Delete" never destroys data outright.
#[tauri::command]
// ponytail: async so Tauri runs it off the main thread — a sync command
// blocks the UI event loop, and recycling a large file/folder is slow enough
// to freeze the app. No .await in the body, so the future stays Send and no
// MutexGuard is held across a suspend point.
//
// Returns true if the entry went to the Recycle Bin, false if Windows can't
// recycle it (paths too long / too big) — the frontend then offers permanent
// deletion via delete_entry_permanent. We call IFileOperation ourselves with
// FOFX_RECYCLEONDELETE instead of the `trash` crate, because trash hardcodes
// FOF_WANTNUKEWARNING, which makes Windows pop its own native "permanently
// delete?" dialog for un-recyclable items instead of failing cleanly.
pub async fn delete_entry(path: String, conn: tauri::State<'_, Mutex<rusqlite::Connection>>, content_tx: tauri::State<'_, ContentEventSender>) -> Result<bool, String> {
    let recycled = recycle_to_bin(&path)?;
    if recycled {
        database::remove_path(&conn, Path::new(&path));
        content_tx.queue_remove(Path::new(&path));
    }
    Ok(recycled)
}

// Permanent delete, used only after delete_entry reports the entry couldn't be
// recycled and the user confirms in-app. ponytail: std remove_dir_all is
// handle-based on Windows since 1.64, so it isn't subject to MAX_PATH — no
// \\?\ prefixing needed for the deep/long-named trees that fail to recycle.
#[tauri::command]
pub async fn delete_entry_permanent(path: String, conn: tauri::State<'_, Mutex<rusqlite::Connection>>, content_tx: tauri::State<'_, ContentEventSender>) -> Result<(), String> {
    let p = Path::new(&path);
    let res = if p.is_dir() { fs::remove_dir_all(p) } else { fs::remove_file(p) };
    res.map_err(|e| e.to_string())?;
    database::remove_path(&conn, p);
    content_tx.queue_remove(p);
    Ok(())
}

// Ok(true) = recycled, Ok(false) = couldn't recycle (offer permanent delete),
// Err = the path/COM setup was invalid. Any failure during the actual delete
// (a nested name too long for the bin) aborts early and reads as Ok(false).
#[cfg(windows)]
fn recycle_to_bin(path: &str) -> Result<bool, String> {
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{FileOperation, IFileOperation, IShellItem, SHCreateItemFromParsingName};
    use windows::core::PCWSTR;

    const FOF_SILENT: u32 = 0x0004;
    const FOF_NOCONFIRMATION: u32 = 0x0010;
    const FOF_ALLOWUNDO: u32 = 0x0040;
    const FOF_NOCONFIRMMKDIR: u32 = 0x0200;
    const FOF_NOERRORUI: u32 = 0x0400;
    const FOFX_RECYCLEONDELETE: u32 = 0x0008_0000; // fail rather than nuke if it can't be recycled
    const FOFX_EARLYFAILURE: u32 = 0x0010_0000;
    const FLAGS: u32 =
        FOF_SILENT | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_NOCONFIRMMKDIR | FOF_ALLOWUNDO | FOFX_RECYCLEONDELETE | FOFX_EARLYFAILURE;

    let path_w: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        // Idempotent per thread; leak the init like the `trash` crate does.
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let pfo: IFileOperation = CoCreateInstance(&FileOperation, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
        pfo.SetOperationFlags(windows::Win32::UI::Shell::FILEOPERATION_FLAGS(FLAGS)).map_err(|e| e.to_string())?;

        let shi: IShellItem = SHCreateItemFromParsingName(PCWSTR(path_w.as_ptr()), None).map_err(|e| e.to_string())?;
        pfo.DeleteItem(&shi, None).map_err(|e| e.to_string())?;

        let performed = pfo.PerformOperations();
        let aborted = pfo.GetAnyOperationsAborted().map(|b| b.as_bool()).unwrap_or(true);
        Ok(performed.is_ok() && !aborted)
    }
}

#[cfg(not(windows))]
fn recycle_to_bin(_path: &str) -> Result<bool, String> {
    Err("not supported on this platform".to_string())
}

// async so Tauri runs this on its worker runtime, not the main thread. A
// synchronous command blocks the main thread, which on Windows is the window
// message pump — a large copy freezes the whole window (drag/click/resize)
// even though the WebView2 process keeps animating the progress bar. No
// `.await` inside, so no MutexGuard is held across a suspend point.
#[tauri::command]
pub async fn copy_entry(
    op_id: String,
    from: String,
    to: String,
    on_progress: Channel<CopyProgress>,
    conn: tauri::State<'_, Mutex<rusqlite::Connection>>,
    content_tx: tauri::State<'_, ContentEventSender>,
    cancels: tauri::State<'_, CopyCancels>,
) -> Result<String, String> {
    let from = Path::new(&from);
    let flag = cancels.flag_for(&op_id);
    // Progress goes back on this invocation's own channel — scoped to this
    // call, so there's no global event to route by id and no way for one
    // batch's updates to land on another's bar.
    let emit = |p: CopyProgress| {
        let _ = on_progress.send(p);
    };
    let ctx = CopyCtx { emit: &emit, cancel: &flag };
    let to = copy_entry_inner(from, Path::new(&to), Some(&ctx))?;
    index_tree(&conn, &content_tx, &to);
    // Return the actual destination (unique_destination may have numbered it)
    // so the frontend can revert exactly this file on cancel, not guess.
    Ok(to.to_string_lossy().into_owned())
}

// async for the same reason as copy_entry: keep the copy off the main thread
// so a large cross-volume move (which falls back to copy+delete) can't freeze
// the window.
#[tauri::command]
pub async fn move_entry(
    op_id: String,
    from: String,
    to: String,
    on_progress: Channel<CopyProgress>,
    conn: tauri::State<'_, Mutex<rusqlite::Connection>>,
    content_tx: tauri::State<'_, ContentEventSender>,
    cancels: tauri::State<'_, CopyCancels>,
) -> Result<String, String> {
    let from_path = PathBuf::from(&from);
    let to = unique_destination(Path::new(&to));
    if fs::rename(&from_path, &to).is_ok() {
        // See rename_entry: new row → migrate tags → drop old, so the cascade
        // doesn't take the tags with the old row.
        database::index_path(&conn, &to);
        if let Some((f, t)) = from_path.to_str().zip(to.to_str()) {
            database::retag_path(&conn, f, t);
        }
        database::remove_path(&conn, &from_path);
        content_tx.queue_remove(&from_path);
        if let Ok(meta) = fs::metadata(&to) {
            content_tx.queue_index(&to, database::modified_ms(&meta));
        }
        return Ok(to.to_string_lossy().into_owned());
    }
    // ponytail: fs::rename fails across drives/volumes; fall back to
    // copy-then-remove-original. Upgrade to a progress-tracked move if
    // large cross-volume transfers become common. `to` is already unique
    // (line above) — copy_entry_inner uniquifying it again is a safe no-op
    // (nothing else can have claimed that exact name in between), not a
    // second, different rename.
    let flag = cancels.flag_for(&op_id);
    let emit = |p: CopyProgress| {
        let _ = on_progress.send(p);
    };
    let ctx = CopyCtx { emit: &emit, cancel: &flag };
    let to = copy_entry_inner(&from_path, &to, Some(&ctx))?;
    if from_path.is_dir() {
        fs::remove_dir_all(&from_path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&from_path).map_err(|e| e.to_string())?;
    }
    database::remove_path(&conn, &from_path);
    index_tree(&conn, &content_tx, &to);
    Ok(to.to_string_lossy().into_owned())
}

// ponytail: uses the real Win32 ShellExecuteExW API (what Explorer itself
// calls) instead of the undocumented rundll32/PowerShell+COM tricks tried
// first — those rely on internal DLL exports and COM apartment defaults
// that silently no-op depending on the calling process's context.
#[tauri::command]
pub fn open_with_dialog(path: String) -> Result<(), String> {
    shell_execute_verb(&path, "openas")
}

#[tauri::command]
pub fn show_properties(path: String) -> Result<(), String> {
    shell_execute_verb(&path, "properties")
}

#[cfg(windows)]
fn shell_execute_verb(path: &str, verb: &str) -> Result<(), String> {
    use windows::Win32::UI::Shell::{SEE_MASK_INVOKEIDLIST, SHELLEXECUTEINFOW, ShellExecuteExW};
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use windows::core::PCWSTR;

    let verb_w: Vec<u16> = verb.encode_utf16().chain(std::iter::once(0)).collect();
    let path_w: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();

    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_INVOKEIDLIST,
        lpVerb: PCWSTR(verb_w.as_ptr()),
        lpFile: PCWSTR(path_w.as_ptr()),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };

    unsafe { ShellExecuteExW(&mut info) }.map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn shell_execute_verb(_path: &str, _verb: &str) -> Result<(), String> {
    Err("not supported on this platform".to_string())
}

// Recursively indexes a path (and all children if it's a directory) into
// the SQLite search database and queues content events. Called after
// move/copy operations so the search index reflects the new files
// immediately, without waiting for the notify watcher.
fn index_tree(conn: &Mutex<rusqlite::Connection>, content_tx: &ContentEventSender, path: &Path) {
    database::index_path(conn, path);
    if let Ok(meta) = fs::metadata(path) {
        if meta.is_dir() {
            if let Ok(entries) = fs::read_dir(path) {
                for entry in entries.filter_map(Result::ok) {
                    index_tree(conn, content_tx, &entry.path());
                }
            }
        } else {
            content_tx.queue_index(path, database::modified_ms(&meta));
        }
    }
}

// Windows' ERROR_SHARING_VIOLATION (raw_os_error 32) is almost always a
// *transient* lock — antivirus real-time scanning, another app briefly
// holding a handle, cloud-sync reading the file — rather than a genuine
// permissions problem, and `fs::copy` has zero retry of its own. A short,
// bounded retry clears the transient case for free without masking a real,
// persistent lock (it still fails with the same error after MAX_ATTEMPTS).
// ponytail: no proof yet this is hit in real usage often enough to matter —
// added defensively since it's a well-known Windows failure mode for any
// file a real user might copy while it's mid-scan/mid-sync, and the fix is
// three lines; revisit if it never actually fires in practice.
const SHARING_VIOLATION: i32 = 32;
const MAX_COPY_ATTEMPTS: u32 = 5;
const COPY_RETRY_DELAY: std::time::Duration = std::time::Duration::from_millis(50);

fn copy_with_retry(from: &Path, to: &Path) -> std::io::Result<u64> {
    let mut last_err = None;
    for attempt in 0..MAX_COPY_ATTEMPTS {
        match fs::copy(from, to) {
            Ok(bytes) => return Ok(bytes),
            Err(e) if e.raw_os_error() == Some(SHARING_VIOLATION) && attempt + 1 < MAX_COPY_ATTEMPTS => {
                std::thread::sleep(COPY_RETRY_DELAY);
                last_err = Some(e);
            }
            Err(e) => return Err(e),
        }
    }
    Err(last_err.expect("loop always sets this before exhausting MAX_COPY_ATTEMPTS"))
}

// ponytail: chunked copy with progress events for large files. `fs::copy`
// is a single blocking syscall with no intermediate feedback — a multi-GB
// file copy blocks the command for the entire duration and the UI appears
// frozen. This reads/writes in 1MB chunks and emits a progress event after
// each chunk so the frontend can show a live progress bar.
const COPY_CHUNK_SIZE: usize = 1024 * 1024; // 1 MB
// Throttle progress sends to ~10/sec regardless of file size. The old
// "every 256KB" rule sent hundreds of messages for a large file, each one an
// IPC round-trip that re-rendered the frontend — the actual source of the
// UI lag during a big copy. Time-based caps that no matter how fast the disk.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Clone, Serialize)]
pub struct CopyProgress {
    pub total: u64,
    pub written: u64,
}

fn copy_with_progress(
    from: &Path,
    to: &Path,
    ctx: &CopyCtx,
) -> std::io::Result<u64> {
    let total = fs::metadata(from)?.len();
    let mut src = fs::File::open(from)?;
    let mut dst = fs::File::create(to)?;
    let mut buf = vec![0u8; COPY_CHUNK_SIZE];
    let mut written: u64 = 0;
    let mut last_emit = Instant::now();

    loop {
        // Poll the cancel flag each chunk. On cancel, drop the destination
        // handle and delete the half-written file so a cancelled copy leaves
        // no partial garbage behind, then return the sentinel error.
        if ctx.cancel.load(Ordering::Relaxed) {
            drop(dst);
            let _ = fs::remove_file(to);
            return Err(Error::new(ErrorKind::Interrupted, COPY_CANCELLED));
        }
        let n = src.read(&mut buf)?;
        if n == 0 {
            break;
        }
        dst.write_all(&buf[..n])?;
        written += n as u64;

        // Time-throttled so a fast disk doesn't flood the event channel.
        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            (ctx.emit)(CopyProgress { total, written });
            last_emit = Instant::now();
        }
    }

    dst.flush()?;
    // Always send a final 100% update so the bar completes even if the whole
    // copy finished inside one throttle window.
    (ctx.emit)(CopyProgress { total, written });
    Ok(written)
}

// Non-Tauri version of copy_entry for internal use by move_entry's
// cross-drive fallback (and by copy_entry itself, below). Applies
// unique_destination internally and returns the actual path used — the
// real bug this fixes: this function used to skip uniquification entirely
// (only the public copy_entry command applied it, via its own separate,
// duplicated copy logic), so calling this directly with the same source and
// destination path — copying a file onto itself — hit Windows'
// ERROR_SHARING_VIOLATION deterministically (you cannot open one file
// simultaneously for reading and truncating-writing), which looked like a
// flaky antivirus-lock race until actually diagnosed: a plain fs::copy to a
// *different* destination succeeded immediately, proving there was no
// ambient lock at all — the retry above was solving a different, real but
// separate problem, not this one.
//
// `app` is optional: when provided, chunked progress events are emitted
// for each file so the frontend can show a live progress bar. When `None`,
// plain `fs::copy` is used (tests, internal callers without Tauri context).
fn copy_entry_inner(from: &Path, to: &Path, ctx: Option<&CopyCtx>) -> Result<PathBuf, String> {
    let to = unique_destination(to);
    let result: std::io::Result<()> = match ctx {
        Some(ctx) => {
            if from.is_dir() {
                copy_dir_all_tracked(from, &to, ctx)
            } else {
                copy_with_progress(from, &to, ctx).map(|_| ())
            }
        }
        None => {
            if from.is_dir() {
                copy_dir_all(from, &to)
            } else {
                copy_with_retry(from, &to).map(|_| ())
            }
        }
    };
    if let Err(e) = result {
        // A cancelled *directory* copy leaves a half-copied tree behind —
        // copy_with_progress only removes the single in-flight file, not the
        // files already copied. Remove the whole destination we were building
        // so cancel actually undoes the paste (a single-file copy already
        // cleaned itself up, so remove_file here is a harmless no-op).
        if e.to_string() == COPY_CANCELLED {
            let _ = if to.is_dir() {
                fs::remove_dir_all(&to)
            } else {
                fs::remove_file(&to)
            };
        }
        return Err(e.to_string());
    }
    Ok(to)
}

// Recursive directory copy that emits per-file progress events. On cancel it
// returns the sentinel error; copy_entry_inner then removes the whole partial
// destination tree (so a cancelled folder paste leaves nothing behind).
fn copy_dir_all_tracked(
    src: &Path,
    dst: &Path,
    ctx: &CopyCtx,
) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        if ctx.cancel.load(Ordering::Relaxed) {
            return Err(Error::new(ErrorKind::Interrupted, COPY_CANCELLED));
        }
        let entry = entry?;
        let dst_path: PathBuf = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all_tracked(&entry.path(), &dst_path, ctx)?;
        } else {
            copy_with_progress(&entry.path(), &dst_path, ctx)?;
        }
    }
    Ok(())
}

#[cfg(test)]
fn create_dir_inner(path: &str) -> Result<(), String> {
    if Path::new(path).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::create_dir(path).map_err(|e| e.to_string())
}

#[cfg(test)]
fn create_file_inner(path: &str) -> Result<(), String> {
    if Path::new(path).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::write(path, []).map_err(|e| e.to_string())
}

#[cfg(test)]
fn rename_entry_inner(from: &str, to: &str) -> Result<(), String> {
    if Path::new(to).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::rename(from, to).map_err(|e| e.to_string())
}

#[cfg(test)]
fn move_entry_inner(from: &str, to: &str) -> Result<(), String> {
    let to = unique_destination(Path::new(to));
    if fs::rename(from, &to).is_ok() {
        return Ok(());
    }
    copy_entry_inner(Path::new(from), &to, None)?;
    let from_path = Path::new(from);
    if from_path.is_dir() {
        fs::remove_dir_all(from_path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(from_path).map_err(|e| e.to_string())
    }
}

// Explorer/Finder-style collision handling: "file.txt" -> "file (1).txt",
// "folder" -> "folder (1)". Prevents copying/moving onto an existing path
// from silently overwriting it or (when source == destination) erroring
// with a sharing violation.
fn unique_destination(dst: &Path) -> PathBuf {
    if !dst.exists() {
        return dst.to_path_buf();
    }
    let parent = dst.parent().unwrap_or_else(|| Path::new(""));
    let stem = dst.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = dst.extension().map(|e| e.to_string_lossy().into_owned());

    // ponytail: no iteration cap — each pass tries a strictly new "stem (n)"
    // and returns the first that's free, so this only spins while every lower
    // number is already taken on disk. Physically bounded by the filesystem;
    // no realistic input keeps it looping.
    let mut n = 1;
    loop {
        let candidate_name = match &ext {
            Some(ext) => format!("{stem} ({n}).{ext}"),
            None => format!("{stem} ({n})"),
        };
        let candidate = parent.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let dst_path: PathBuf = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &dst_path)?;
        } else {
            copy_with_retry(&entry.path(), &dst_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quick_access_dirs_resolves_known_folders() {
        let dirs = quick_access_dirs();
        for d in &dirs {
            println!("{}: {}", d.name, d.path);
        }
        assert!(!dirs.is_empty(), "expected at least Documents to resolve");
        assert!(dirs.iter().any(|d| d.name == "Documents"));
    }

    #[test]
    fn list_drives_finds_c_drive() {
        let drives = list_drives();
        for d in &drives {
            println!("{}: {}", d.name, d.path);
        }
        assert!(drives.iter().any(|d| d.name == "C:"), "expected C: to resolve");
    }

    #[test]
    fn cancelled_copy_aborts_and_removes_partial_destination() {
        let base = std::env::temp_dir().join("schlag_test_copy_cancel");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let src = base.join("big.bin");
        fs::write(&src, vec![7u8; 4 * 1024 * 1024]).unwrap();
        let dst = base.join("big_copy.bin");

        // Flag already set → the loop bails on its first poll (before any
        // bytes) and cleans up the empty destination it just created.
        let cancel = AtomicBool::new(true);
        let ctx = CopyCtx { emit: &|_| {}, cancel: &cancel };
        let err = copy_with_progress(&src, &dst, &ctx).unwrap_err();
        assert_eq!(err.to_string(), COPY_CANCELLED);
        assert!(!dst.exists(), "cancelled copy must leave no partial file behind");

        // Sanity: same source copies fine when not cancelled.
        cancel.store(false, Ordering::SeqCst);
        copy_with_progress(&src, &dst, &ctx).unwrap();
        assert_eq!(fs::metadata(&dst).unwrap().len(), 4 * 1024 * 1024);
    }

    #[test]
    fn cancelled_folder_copy_removes_the_whole_partial_tree() {
        let base = std::env::temp_dir().join("schlag_test_copy_cancel_dir");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let src = base.join("src_folder");
        fs::create_dir_all(src.join("nested")).unwrap();
        fs::write(src.join("a.txt"), b"a").unwrap();
        fs::write(src.join("nested").join("b.txt"), b"b").unwrap();
        let dst = base.join("dst_folder");

        // Cancel is set before the copy runs, so copy_entry_inner must delete
        // the destination directory it created — not leave a partial folder
        // behind (the real bug: a cancelled folder paste left the folder).
        let cancel = AtomicBool::new(true);
        let ctx = CopyCtx { emit: &|_| {}, cancel: &cancel };
        let err = copy_entry_inner(&src, &dst, Some(&ctx)).unwrap_err();
        assert_eq!(err, COPY_CANCELLED);
        assert!(!dst.exists(), "cancelled folder copy must leave no partial folder behind");
    }

    #[test]
    fn copy_entry_copies_file_and_directory_recursively() {
        let base = std::env::temp_dir().join("schlag_test_copy_entry");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let src_file = base.join("a.txt");
        fs::write(&src_file, b"hello").unwrap();
        let dst_file = base.join("a_copy.txt");
        copy_entry_inner(&src_file, &dst_file, None).unwrap();
        assert_eq!(fs::read_to_string(&dst_file).unwrap(), "hello");

        let src_dir = base.join("src_dir");
        fs::create_dir_all(src_dir.join("nested")).unwrap();
        fs::write(src_dir.join("root.txt"), b"root").unwrap();
        fs::write(src_dir.join("nested").join("deep.txt"), b"deep").unwrap();
        let dst_dir = base.join("dst_dir");
        copy_entry_inner(&src_dir, &dst_dir, None).unwrap();
        assert_eq!(fs::read_to_string(dst_dir.join("root.txt")).unwrap(), "root");
        assert_eq!(fs::read_to_string(dst_dir.join("nested").join("deep.txt")).unwrap(), "deep");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn copy_entry_into_same_dir_auto_renames_instead_of_colliding() {
        let base = std::env::temp_dir().join("schlag_test_copy_entry_collision");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let src_file = base.join("a.txt");
        fs::write(&src_file, b"hello").unwrap();
        // Copying "into" the file's own directory means dest == src.
        copy_entry_inner(&src_file, &src_file, None).unwrap();
        assert_eq!(fs::read_to_string(base.join("a (1).txt")).unwrap(), "hello");
        assert!(src_file.exists(), "original must be untouched");

        let src_dir = base.join("folder");
        fs::create_dir_all(&src_dir).unwrap();
        fs::write(src_dir.join("f.txt"), b"x").unwrap();
        copy_entry_inner(&src_dir, &src_dir, None).unwrap();
        assert!(base.join("folder (1)").join("f.txt").exists());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn move_entry_relocates_within_same_volume() {
        let base = std::env::temp_dir().join("schlag_test_move_entry");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let src = base.join("source.txt");
        fs::write(&src, b"move me").unwrap();
        let dst = base.join("moved.txt");

        move_entry_inner(&path(&src), &path(&dst)).unwrap();

        assert!(!src.exists());
        assert_eq!(fs::read_to_string(&dst).unwrap(), "move me");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn create_file_rejects_name_colliding_with_existing_file_without_truncating_it() {
        let base = std::env::temp_dir().join("schlag_test_create_file_collision");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let existing = base.join("a.txt");
        fs::write(&existing, b"keep me").unwrap();

        let err = create_file_inner(&path(&existing)).unwrap_err();
        assert!(err.contains("already exists"));
        assert_eq!(fs::read_to_string(&existing).unwrap(), "keep me");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn create_file_rejects_name_colliding_with_existing_dir() {
        let base = std::env::temp_dir().join("schlag_test_create_file_dir_collision");
        let _ = fs::remove_dir_all(&base);
        let existing_dir = base.join("a");
        fs::create_dir_all(&existing_dir).unwrap();

        let err = create_file_inner(&path(&existing_dir)).unwrap_err();
        assert!(err.contains("already exists"));
        assert!(existing_dir.is_dir());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn create_dir_rejects_name_colliding_with_existing_entry() {
        let base = std::env::temp_dir().join("schlag_test_create_dir_collision");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let existing = base.join("a.txt");
        fs::write(&existing, b"keep me").unwrap();

        let err = create_dir_inner(&path(&existing)).unwrap_err();
        assert!(err.contains("already exists"));
        assert!(existing.is_file());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rename_entry_rejects_name_colliding_with_existing_entry_without_destroying_it() {
        let base = std::env::temp_dir().join("schlag_test_rename_collision");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let source = base.join("source.txt");
        fs::write(&source, b"source content").unwrap();
        let existing = base.join("existing.txt");
        fs::write(&existing, b"existing content").unwrap();

        let err = rename_entry_inner(&path(&source), &path(&existing)).unwrap_err();
        assert!(err.contains("already exists"));
        assert_eq!(fs::read_to_string(&existing).unwrap(), "existing content");
        assert_eq!(fs::read_to_string(&source).unwrap(), "source content");

        let _ = fs::remove_dir_all(&base);
    }

    fn path(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }
}
