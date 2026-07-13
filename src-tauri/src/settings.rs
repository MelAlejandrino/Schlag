use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// App-level settings persisted as JSON at `{app_data_dir}/settings.json`.
/// Frontend-only preferences (sort, view mode, etc.) live in Zustand's
/// localStorage persist — this struct only covers settings that need the
/// Rust backend (excluded directories, and future backend-gated config).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    /// User-added directory names to exclude from indexing, on top of the
    /// built-in `EXCLUDED_DIR_NAMES` / `EXCLUDED_ROOT_DIR_NAMES` lists.
    /// Each entry is a case-insensitive directory name (not a path), matching
    /// the same convention as the built-in lists.
    pub excluded_dirs: Vec<String>,
}

/// Load settings from disk, falling back to defaults if the file doesn't
/// exist or is malformed. Called once at startup in `lib.rs`'s `.setup()`.
pub fn load_settings(path: &Path) -> AppSettings {
    match fs::read_to_string(path) {
        Ok(json) => match serde_json::from_str::<AppSettings>(&json) {
            Ok(settings) => settings,
            Err(e) => {
                tracing::warn!("Failed to parse settings file, using defaults: {e}");
                AppSettings::default()
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => AppSettings::default(),
        Err(e) => {
            tracing::warn!("Failed to read settings file, using defaults: {e}");
            AppSettings::default()
        }
    }
}

/// Save settings to disk. Creates the parent directory if needed.
pub fn save_settings(path: &Path, settings: &AppSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create settings directory: {e}"))?;
    }
    let json =
        serde_json::to_string_pretty(settings).map_err(|e| format!("Failed to serialize settings: {e}"))?;
    fs::write(path, json).map_err(|e| format!("Failed to write settings file: {e}"))?;
    Ok(())
}

/// Returns the current settings to the frontend.
#[tauri::command]
pub fn get_settings(settings: tauri::State<'_, AppSettings>) -> AppSettings {
    settings.inner().clone()
}

/// Storage usage information displayed in the Settings page.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageInfo {
    /// Size of `index.db` in bytes.
    pub index_db_bytes: u64,
    /// Total size of the `content_index/` Tantivy directory in bytes.
    pub content_index_bytes: u64,
    /// Size of `settings.json` in bytes.
    pub settings_file_bytes: u64,
    /// Number of files/folders in the index.
    pub indexed_entry_count: u64,
}

fn dir_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    if path.is_file() {
        return fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    }
    let mut total = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                total += fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            } else if p.is_dir() {
                total += dir_size(&p);
            }
        }
    }
    total
}

/// Returns storage usage for the settings page.
#[tauri::command]
pub fn get_storage_info(
    data_dir: tauri::State<'_, PathBuf>,
    db: tauri::State<'_, Mutex<Connection>>,
) -> Result<StorageInfo, String> {
    let dir = data_dir.as_path();
    let index_db_bytes = fs::metadata(dir.join("index.db"))
        .map(|m| m.len())
        .unwrap_or(0);
    let content_index_bytes = dir_size(&dir.join("content_index"));
    let settings_file_bytes = fs::metadata(dir.join("settings.json"))
        .map(|m| m.len())
        .unwrap_or(0);

    let conn = db.lock().map_err(|e| format!("Lock error: {e}"))?;
    let indexed_entry_count: u64 = conn
        .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))
        .unwrap_or(0);

    Ok(StorageInfo {
        index_db_bytes,
        content_index_bytes,
        settings_file_bytes,
        indexed_entry_count,
    })
}

/// Updates and persists settings. Returns the updated settings on success.
#[tauri::command]
pub fn update_settings(
    new_settings: AppSettings,
    settings_path: tauri::State<'_, PathBuf>,
    settings: tauri::State<'_, std::sync::Mutex<AppSettings>>,
) -> Result<AppSettings, String> {
    save_settings(&settings_path, &new_settings)?;
    let mut guard = settings.lock().map_err(|e| format!("Lock error: {e}"))?;
    *guard = new_settings.clone();
    Ok(new_settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_path(name: &str) -> PathBuf {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test-scratch");
        fs::create_dir_all(&dir).ok();
        dir.join(name)
    }

    #[test]
    fn load_missing_file_returns_defaults() {
        let path = temp_path("settings_missing.json");
        fs::remove_file(&path).ok();
        let s = load_settings(&path);
        assert!(s.excluded_dirs.is_empty());
    }

    #[test]
    fn save_and_load_roundtrip() {
        let path = temp_path("settings_roundtrip.json");
        let mut s = AppSettings::default();
        s.excluded_dirs.push("my_cache".to_string());
        s.excluded_dirs.push("temp_build".to_string());
        save_settings(&path, &s).unwrap();
        let loaded = load_settings(&path);
        assert_eq!(loaded.excluded_dirs, vec!["my_cache", "temp_build"]);
        fs::remove_file(&path).ok();
    }

    #[test]
    fn load_malformed_file_returns_defaults() {
        let path = temp_path("settings_malformed.json");
        fs::write(&path, "not json!!!").unwrap();
        let s = load_settings(&path);
        assert!(s.excluded_dirs.is_empty());
        fs::remove_file(&path).ok();
    }

    #[test]
    fn load_empty_json_returns_defaults() {
        let path = temp_path("settings_empty.json");
        fs::write(&path, "{}").unwrap();
        let s = load_settings(&path);
        assert!(s.excluded_dirs.is_empty());
        fs::remove_file(&path).ok();
    }
}
