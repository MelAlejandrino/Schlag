use crate::content_index;
use serde::Serialize;
use std::fs::File;
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
}
