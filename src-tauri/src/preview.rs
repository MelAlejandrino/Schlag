use crate::content_index;
use crate::fs_ops::{sort_folders_first, Entry};
use serde::Serialize;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use zip::ZipArchive;

// ponytail: bounds how many rows the frontend ever has to render for a
// pathological archive — a real ZIP with more entries than this just shows
// the first ARCHIVE_ENTRY_LIMIT plus a "truncated" flag, not a hang or a
// giant DOM.
const ARCHIVE_ENTRY_LIMIT: usize = 2000;

#[derive(Serialize)]
pub struct ArchiveEntry {
    name: String,
    size: u64,
    is_dir: bool,
}

// Thin wrapper — no extraction logic of its own. The frontend's previewKind()
// dispatch is what decides this only ever gets called for markdown/text/
// office paths; PDF's own extract_text branch (used for content search) is
// simply never invoked from here, since PDF preview renders the real file
// visually via the asset protocol instead.
#[tauri::command]
pub fn preview_text(path: String) -> Result<Option<String>, String> {
    Ok(content_index::extract_text(Path::new(&path)))
}

// Plain function, no Tauri command wrapper — kept separate so the actual
// logic is directly unit-testable, mirroring search.rs's build_query/
// run_query and content_index.rs's run_content_query split.
fn read_archive_entries(path: &Path) -> Result<(Vec<ArchiveEntry>, bool), String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let total = archive.len();
    let truncated = total > ARCHIVE_ENTRY_LIMIT;
    let mut entries = Vec::with_capacity(total.min(ARCHIVE_ENTRY_LIMIT));
    for i in 0..total.min(ARCHIVE_ENTRY_LIMIT) {
        let zip_entry = archive.by_index(i).map_err(|e| e.to_string())?;
        entries.push(ArchiveEntry {
            name: zip_entry.name().to_string(),
            size: zip_entry.size(),
            is_dir: zip_entry.is_dir(),
        });
    }

    Ok((entries, truncated))
}

#[tauri::command]
pub fn list_archive_entries(path: String) -> Result<(Vec<ArchiveEntry>, bool), String> {
    read_archive_entries(&PathBuf::from(path))
}

// Browsing a zip like a folder — plan.md's Phase 7 sketch. `inner_path` is
// forward-or-backslash, always relative to the archive's own root (never
// includes the archive_path itself). Returns only the immediate children of
// `inner_path`, synthesizing a directory Entry for any deeper nested path a
// zip entry implies even when the zip has no explicit entry for that
// directory itself (most zip writers don't emit one) — mirrors fs_ops::Entry
// so the frontend's existing sort/group/render code needs no zip-specific
// branch. Plain function (not a #[tauri::command]) for the same
// directly-unit-testable reason as search.rs's build_query/run_query split.
fn read_archive_dir(archive_path: &Path, inner_path: &str) -> Result<Vec<Entry>, String> {
    let file = File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let trimmed = inner_path.replace('\\', "/");
    let prefix = if trimmed.trim_matches('/').is_empty() {
        String::new()
    } else {
        format!("{}/", trimmed.trim_matches('/'))
    };

    let archive_display = archive_path.to_string_lossy().into_owned();
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();

    for i in 0..archive.len() {
        let zip_entry = archive.by_index(i).map_err(|e| e.to_string())?;
        // The zip spec mandates forward slash, but not every writer follows
        // it — confirmed live: Windows' own `Compress-Archive` PowerShell
        // cmdlet writes nested entries as "nested\deep.txt" (backslash), which
        // silently produced a single mis-synthesized "nested\deep.txt" file
        // instead of a "nested" folder before this normalization was added.
        let name = zip_entry.name().replace('\\', "/");
        if !name.starts_with(&prefix) {
            continue;
        }
        let rest = &name[prefix.len()..];
        if rest.is_empty() {
            continue; // the directory entry for `prefix` itself, not a child
        }
        let (child_name, is_dir) = match rest.find('/') {
            Some(slash) => (rest[..slash].to_string(), true),
            None if zip_entry.is_dir() => (rest.trim_end_matches('/').to_string(), true),
            None => (rest.to_string(), false),
        };
        if !seen.insert(child_name.clone()) {
            continue; // already synthesized from a deeper sibling entry
        }
        out.push(Entry {
            name: child_name.clone(),
            path: format!("{archive_display}!\\{prefix}{child_name}").replace('/', "\\"),
            is_dir,
            size: if is_dir { 0 } else { zip_entry.size() },
            // ponytail: zip::DateTime -> unix ms needs its own conversion
            // the crate doesn't hand you directly; skipped for this pass,
            // add real per-entry mtimes if grouping/sorting by date inside
            // an archive turns out to matter in practice.
            modified_ms: 0,
        });
        // Same rationale as ARCHIVE_ENTRY_LIMIT above (read_archive_entries):
        // bounds the frontend's render cost against a pathological archive.
        // Unlike that sibling function this silently truncates rather than
        // reporting it — a single directory level inside a zip with more
        // than this many *immediate children* is already an extreme case
        // this pass doesn't try to surface a "truncated" flag for.
        if out.len() >= ARCHIVE_ENTRY_LIMIT {
            break;
        }
    }

    sort_folders_first(&mut out);

    Ok(out)
}

#[tauri::command]
pub fn list_archive_dir(archive_path: String, inner_path: String) -> Result<Vec<Entry>, String> {
    read_archive_dir(&PathBuf::from(archive_path), &inner_path)
}

// Opening a file that lives inside a zip: extract it to a temp file, then
// the frontend reuses its existing openFile() (openPath) flow on that real
// path — no separate "open from memory" plumbing needed.
#[tauri::command]
pub fn extract_zip_entry_to_temp(archive_path: String, inner_path: String) -> Result<String, String> {
    let file = File::open(&archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let name = inner_path.replace('\\', "/");
    // by_name() matches the entry's exact stored name — but not every zip
    // writer follows the spec's forward-slash convention (confirmed live:
    // Windows' own Compress-Archive cmdlet stores nested entries backslash-
    // separated, e.g. "nested\deep.txt"), so an exact match against the
    // normalized `name` can miss a real entry. Falls back to a normalized
    // linear scan (same normalization read_archive_dir uses) rather than
    // trusting by_name alone.
    let index = match archive.index_for_name(&name) {
        Some(i) => i,
        None => (0..archive.len())
            .find(|&i| archive.by_index(i).is_ok_and(|e| e.name().replace('\\', "/") == name))
            .ok_or_else(|| format!("\"{name}\" not found in archive"))?,
    };
    let mut zip_entry = archive.by_index(index).map_err(|e| e.to_string())?;

    let file_name = Path::new(&name)
        .file_name()
        .ok_or_else(|| "invalid archive entry name".to_string())?
        .to_string_lossy()
        .into_owned();

    // ponytail: one temp dir per app process, not per-extraction or a real
    // cache — good enough for "open this file once"; nothing cleans these up
    // afterward, same as any other temp file an OS-default app is handed.
    let temp_dir = std::env::temp_dir().join(format!("schlag-zip-{}", std::process::id()));
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let out_path = temp_dir.join(&file_name);
    let mut out_file = File::create(&out_path).map_err(|e| e.to_string())?;
    std::io::copy(&mut zip_entry, &mut out_file).map_err(|e| e.to_string())?;

    Ok(out_path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn make_zip(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut buf);
            let options = zip::write::SimpleFileOptions::default();
            for &(name, content) in entries {
                writer.start_file(name, options).unwrap();
                writer.write_all(content.as_bytes()).unwrap();
            }
            writer.finish().unwrap();
        }
        buf.into_inner()
    }

    #[test]
    fn read_archive_entries_reports_name_size_and_is_dir() {
        let path = std::env::temp_dir().join(format!("schlag_test_preview_zip_{}.zip", std::process::id()));
        std::fs::write(&path, make_zip(&[("readme.txt", "hello"), ("nested/deep.txt", "world")])).unwrap();

        let (entries, truncated) = read_archive_entries(&path).unwrap();
        assert!(!truncated);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "readme.txt");
        assert_eq!(entries[0].size, 5);
        assert!(!entries[0].is_dir);
        assert_eq!(entries[1].name, "nested/deep.txt");
        assert_eq!(entries[1].size, 5);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn read_archive_entries_truncates_past_the_cap_and_flags_it() {
        let names: Vec<(String, String)> =
            (0..(ARCHIVE_ENTRY_LIMIT + 10)).map(|i| (format!("file{i}.txt"), "x".to_string())).collect();
        let entries_ref: Vec<(&str, &str)> = names.iter().map(|(n, c)| (n.as_str(), c.as_str())).collect();

        let path = std::env::temp_dir().join(format!("schlag_test_preview_zip_truncated_{}.zip", std::process::id()));
        std::fs::write(&path, make_zip(&entries_ref)).unwrap();

        let (entries, truncated) = read_archive_entries(&path).unwrap();
        assert!(truncated, "an archive with more entries than the cap should report truncated");
        assert_eq!(entries.len(), ARCHIVE_ENTRY_LIMIT, "entries should stop exactly at the cap, not the full count");

        let _ = std::fs::remove_file(&path);
    }

    // Rust runs tests in parallel threads within one process, so a fixture
    // path keyed only on process::id() collides across every test that calls
    // this — confirmed live: three tests sharing make_dir_zip()'s old
    // PID-only filename raced (one test's write/remove colliding with
    // another's concurrent read), producing an intermittent "invalid Zip
    // archive: Unexpected end" failure. An atomic counter makes every call
    // (even from the same test, even in the same process) get its own file.
    fn unique_test_id() -> u64 {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        COUNTER.fetch_add(1, Ordering::Relaxed)
    }

    fn make_dir_zip() -> PathBuf {
        let path = std::env::temp_dir().join(format!("schlag_test_archive_dir_{}_{}.zip", std::process::id(), unique_test_id()));
        std::fs::write(
            &path,
            make_zip(&[("readme.txt", "hello"), ("nested/deep.txt", "world"), ("nested/more/deeper.txt", "!")]),
        )
        .unwrap();
        path
    }

    #[test]
    fn read_archive_dir_lists_root_with_synthesized_folder() {
        let path = make_dir_zip();

        let entries = read_archive_dir(&path, "").unwrap();
        assert_eq!(entries.len(), 2, "root should show readme.txt and one synthesized 'nested' folder");
        assert_eq!(entries[0].name, "nested");
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].path, format!("{}!\\nested", path.to_string_lossy()));
        assert_eq!(entries[1].name, "readme.txt");
        assert!(!entries[1].is_dir);
        assert_eq!(entries[1].size, 5);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn read_archive_dir_descends_into_a_synthesized_folder() {
        let path = make_dir_zip();

        let entries = read_archive_dir(&path, "nested").unwrap();
        assert_eq!(entries.len(), 2, "'nested' should show deep.txt and a synthesized 'more' folder");
        assert_eq!(entries[0].name, "more");
        assert!(entries[0].is_dir);
        assert_eq!(entries[1].name, "deep.txt");
        assert!(!entries[1].is_dir);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn extract_zip_entry_to_temp_writes_the_real_content() {
        let path = make_dir_zip();

        let out_path = extract_zip_entry_to_temp(path.to_string_lossy().into_owned(), "nested\\deep.txt".to_string()).unwrap();
        assert_eq!(std::fs::read_to_string(&out_path).unwrap(), "world");
        assert_eq!(Path::new(&out_path).file_name().unwrap(), "deep.txt");

        let _ = std::fs::remove_file(&out_path);
        let _ = std::fs::remove_file(&path);
    }

    // The zip spec mandates forward slash for nested entry names, but
    // Windows' own Compress-Archive PowerShell cmdlet doesn't follow it —
    // confirmed live browsing a real Compress-Archive-produced zip in the
    // running app: "nested\deep.txt" rendered as one flat mis-synthesized
    // file instead of a "nested" folder containing "deep.txt". These fixtures
    // reproduce that non-compliant (but very real) backslash convention
    // directly, rather than trusting a forward-slash-only assumption.
    fn make_backslash_dir_zip() -> PathBuf {
        let path = std::env::temp_dir().join(format!("schlag_test_archive_backslash_{}_{}.zip", std::process::id(), unique_test_id()));
        std::fs::write(&path, make_zip(&[("readme.txt", "hello"), ("nested\\deep.txt", "world")])).unwrap();
        path
    }

    #[test]
    fn read_archive_dir_synthesizes_a_folder_from_backslash_separated_entries() {
        let path = make_backslash_dir_zip();

        let entries = read_archive_dir(&path, "").unwrap();
        assert_eq!(entries.len(), 2, "root should show readme.txt and one synthesized 'nested' folder, not a flat 'nested\\deep.txt' file");
        assert_eq!(entries[0].name, "nested");
        assert!(entries[0].is_dir);
        let nested = read_archive_dir(&path, "nested").unwrap();
        assert_eq!(nested.len(), 1);
        assert_eq!(nested[0].name, "deep.txt");
        assert!(!nested[0].is_dir);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn extract_zip_entry_to_temp_finds_a_backslash_separated_entry() {
        let path = make_backslash_dir_zip();

        let out_path = extract_zip_entry_to_temp(path.to_string_lossy().into_owned(), "nested\\deep.txt".to_string()).unwrap();
        assert_eq!(std::fs::read_to_string(&out_path).unwrap(), "world");

        let _ = std::fs::remove_file(&out_path);
        let _ = std::fs::remove_file(&path);
    }
}
