mod content_index;
mod database;
mod fs_ops;
mod indexer;
mod preview;
mod search;
mod settings;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("index.db");

            app.manage(data_dir.clone());

            // Load app settings (excluded dirs, etc.) — persisted as JSON.
            let settings_path = data_dir.join("settings.json");
            let app_settings = settings::load_settings(&settings_path);
            indexer::set_user_excluded_dirs(app_settings.excluded_dirs.clone());
            app.manage(Mutex::new(app_settings));
            app.manage(settings_path);

            // Search gets its own connection to the same WAL-mode db rather
            // than sharing the indexer thread's writer connection — WAL
            // supports concurrent readers alongside one writer, so this is
            // the minimal-diff way to add the first reader.
            let reader = database::open(&db_path)?;
            search::register_regexp(&reader)?;
            app.manage(Mutex::new(reader));

            // Opening (or creating) the Tantivy index is cheap regardless of
            // its size on either branch — unlike the SQLite FTS5 backfill,
            // there's no full-table-scale migration risk here, so this is
            // safe to do inline in this synchronous setup() hook. The
            // `Index` handle itself is cheaply cloneable/shareable: one
            // clone is managed here for search_content's reads, another is
            // moved into the indexer's dedicated content-writer thread.
            let content_dir = data_dir.join("content_index");
            let (content_index, content_schema) = content_index::open_index(&content_dir)?;
            app.manage(content_index::ContentIndexState {
                index: content_index.clone(),
                schema: content_schema.clone(),
            });

            let drives = fs_ops::list_drives().into_iter().map(|d| d.path).collect();
            let (content_tx, content_rx) = indexer::create_content_channel();
            let status = indexer::spawn(db_path, drives, content_index, content_schema, content_tx.clone(), content_rx);
            app.manage(content_tx);
            app.manage(status);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fs_ops::home_dir,
            fs_ops::quick_access_dirs,
            fs_ops::list_drives,
            fs_ops::list_dir,
            fs_ops::create_dir,
            fs_ops::create_file,
            fs_ops::rename_entry,
            fs_ops::delete_entry,
            fs_ops::copy_entry,
            fs_ops::move_entry,
            fs_ops::open_with_dialog,
            fs_ops::show_properties,
            indexer::index_status,
            search::search_files,
            search::recent_files,
            content_index::search_content,
            preview::preview_text,
            preview::list_archive_entries,
            settings::get_settings,
            settings::update_settings,
            settings::get_storage_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
