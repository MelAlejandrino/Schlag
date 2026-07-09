use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

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

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<Entry>, String> {
    let mut entries: Vec<Entry> = fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .filter_map(|res| res.ok())
        .filter_map(|dir_entry| {
            let meta = dir_entry.metadata().ok()?;
            let modified_ms = meta
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            Some(Entry {
                name: dir_entry.file_name().to_string_lossy().into_owned(),
                path: dir_entry.path().to_string_lossy().into_owned(),
                is_dir: meta.is_dir(),
                size: meta.len(),
                modified_ms,
            })
        })
        .collect();

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

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
pub fn create_dir(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::create_dir(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::write(path, []).map_err(|e| e.to_string())
}

// ponytail: same exists()-check guard as create_dir/create_file, for the
// same reason — Rust's fs::rename maps to Windows' MoveFileExW with
// MOVEFILE_REPLACE_EXISTING, which silently deletes and overwrites whatever
// was already at `to` instead of failing. Renaming a file onto an existing
// name destroyed that other file outright with no error and no trace.
#[tauri::command]
pub fn rename_entry(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::rename(from, to).map_err(|e| e.to_string())
}

// ponytail: trash crate sends to the OS recycle bin instead of a raw
// fs::remove_*, so "Delete" never destroys data outright.
#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    trash::delete(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_entry(from: String, to: String) -> Result<(), String> {
    let from = Path::new(&from);
    let to = unique_destination(Path::new(&to));
    if from.is_dir() {
        copy_dir_all(from, &to).map_err(|e| e.to_string())
    } else {
        fs::copy(from, &to).map(|_| ()).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn move_entry(from: String, to: String) -> Result<(), String> {
    let to = unique_destination(Path::new(&to));
    if fs::rename(&from, &to).is_ok() {
        return Ok(());
    }
    // ponytail: fs::rename fails across drives/volumes; fall back to
    // copy-then-remove-original. Upgrade to a progress-tracked move if
    // large cross-volume transfers become common.
    copy_entry(from.clone(), to.to_string_lossy().into_owned())?;
    let from_path = Path::new(&from);
    if from_path.is_dir() {
        fs::remove_dir_all(from_path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(from_path).map_err(|e| e.to_string())
    }
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
            fs::copy(entry.path(), dst_path)?;
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
    fn copy_entry_copies_file_and_directory_recursively() {
        let base = std::env::temp_dir().join("schlag_test_copy_entry");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let src_file = base.join("a.txt");
        fs::write(&src_file, b"hello").unwrap();
        let dst_file = base.join("a_copy.txt");
        copy_entry(path(&src_file), path(&dst_file)).unwrap();
        assert_eq!(fs::read_to_string(&dst_file).unwrap(), "hello");

        let src_dir = base.join("src_dir");
        fs::create_dir_all(src_dir.join("nested")).unwrap();
        fs::write(src_dir.join("root.txt"), b"root").unwrap();
        fs::write(src_dir.join("nested").join("deep.txt"), b"deep").unwrap();
        let dst_dir = base.join("dst_dir");
        copy_entry(path(&src_dir), path(&dst_dir)).unwrap();
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
        copy_entry(path(&src_file), path(&src_file)).unwrap();
        assert_eq!(fs::read_to_string(base.join("a (1).txt")).unwrap(), "hello");
        assert!(src_file.exists(), "original must be untouched");

        let src_dir = base.join("folder");
        fs::create_dir_all(&src_dir).unwrap();
        fs::write(src_dir.join("f.txt"), b"x").unwrap();
        copy_entry(path(&src_dir), path(&src_dir)).unwrap();
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

        move_entry(path(&src), path(&dst)).unwrap();

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

        let err = create_file(path(&existing)).unwrap_err();
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

        let err = create_file(path(&existing_dir)).unwrap_err();
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

        let err = create_dir(path(&existing)).unwrap_err();
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

        let err = rename_entry(path(&source), path(&existing)).unwrap_err();
        assert!(err.contains("already exists"));
        assert_eq!(fs::read_to_string(&existing).unwrap(), "existing content");
        assert_eq!(fs::read_to_string(&source).unwrap(), "source content");

        let _ = fs::remove_dir_all(&base);
    }

    fn path(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }
}
