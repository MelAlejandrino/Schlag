use rusqlite::{Connection, params};
use std::path::Path;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

/// Last-modified time from filesystem metadata as milliseconds since the Unix
/// epoch, 0 if unavailable. Shared by every place that builds a row/Entry from
/// a stat call, so they can't drift apart.
pub fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// Phase 2 scope only: path/name/extension/size/dates for a working file
// index. Hashes (Duplicate Detection), tags/favorites, preview cache, and
// git status are later-phase columns — don't add them here speculatively.
pub struct FileRow {
    pub path: String,
    pub name: String,
    pub extension: Option<String>,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: u64,
}

pub fn open(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    // WAL: better concurrent read/write behavior and crash resilience than
    // the default rollback journal, at essentially no cost for this workload.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    // Off by default in SQLite; needed for file_tags' ON DELETE CASCADE to
    // actually fire when a file leaves the index (safe here — upsert uses
    // ON CONFLICT DO UPDATE, so re-indexing never deletes+recreates a row).
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            extension TEXT,
            is_dir INTEGER NOT NULL,
            size INTEGER NOT NULL,
            modified_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
        CREATE INDEX IF NOT EXISTS idx_files_recent ON files(is_dir, modified_ms DESC);",
    )?;

    // Trigram-tokenized FTS5 index over `name`, so a leading-wildcard
    // substring search (which a plain B-tree index can't accelerate) stays
    // fast even combined with other filters. Measured live: without this,
    // a substring search combined with an extension/regex filter took
    // 4-7+ seconds against a real ~1.5M-row index. `content='files'`/
    // `content_rowid='id'` makes this an external-content table — it
    // indexes `name` without duplicating it, staying in sync via the
    // triggers below rather than being written to directly. Creating the
    // table/triggers here is always cheap regardless of `files`'s size —
    // populating an *existing* large `files` table into a brand new
    // files_fts is not (see `backfill_fts_if_needed`), so that step is
    // deliberately not done here: this function must stay fast enough to
    // call from a startup path.
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
            name,
            content='files',
            content_rowid='id',
            tokenize='trigram'
        );
        CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
            INSERT INTO files_fts(rowid, name) VALUES (new.id, new.name);
        END;
        CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
            INSERT INTO files_fts(files_fts, rowid, name) VALUES ('delete', old.id, old.name);
        END;
        CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
            INSERT INTO files_fts(files_fts, rowid, name) VALUES ('delete', old.id, old.name);
            INSERT INTO files_fts(rowid, name) VALUES (new.id, new.name);
        END;",
    )?;

    // Tracks the mtime a path's *content* was last fed into the Tantivy
    // index (separate from `files`, which tracks filesystem metadata).
    // Content extraction (parsing a PDF/DOCX/XLSX/PPTX) is far more
    // expensive than a stat call, and the indexer re-walks every drive on
    // every launch — without this, every launch would re-extract every
    // extractable file's content from scratch, which for a real Documents
    // folder is a real, felt slowdown, not a theoretical one. A path is
    // only re-extracted when its current modified_ms no longer matches
    // what's recorded here.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS content_index_state (
            path TEXT PRIMARY KEY,
            indexed_mtime INTEGER NOT NULL
        );",
    )?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT '#888888'
        );
        CREATE TABLE IF NOT EXISTS file_tags (
            file_path TEXT NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (file_path, tag_id),
            FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_file_tags_file_path ON file_tags(file_path);
        CREATE INDEX IF NOT EXISTS idx_file_tags_tag_id ON file_tags(tag_id);",
    )?;

    Ok(conn)
}

// None means "never content-indexed" (or the path was removed from
// `content_index_state`, e.g. after a delete) — the caller should extract.
pub fn content_indexed_mtime(conn: &Connection, path: &str) -> rusqlite::Result<Option<u64>> {
    conn.query_row(
        "SELECT indexed_mtime FROM content_index_state WHERE path = ?1",
        params![path],
        |row| row.get::<_, i64>(0),
    )
    .map(|ms| Some(ms as u64))
    .or_else(|e| if e == rusqlite::Error::QueryReturnedNoRows { Ok(None) } else { Err(e) })
}

pub fn set_content_indexed_mtime(conn: &Connection, path: &str, modified_ms: u64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO content_index_state (path, indexed_mtime) VALUES (?1, ?2)
         ON CONFLICT(path) DO UPDATE SET indexed_mtime = excluded.indexed_mtime",
        params![path, modified_ms as i64],
    )?;
    Ok(())
}

// All paths content_index_state currently tracks — used to reconcile it
// directly against exclusion/existence, independent of what's in `files`.
// This table can drift out of sync with `files` on its own: an in-memory
// ContentEvent::Remove queued by prune_stale_entries (files.rs) is lost if
// the app restarts before the content-indexer thread drains it, and once
// the corresponding `files` row is already gone, prune_stale_entries' own
// files-derived stale list never re-queues that removal — see indexer.rs's
// prune_stale_content_state for the reconciliation this backs.
pub fn content_index_state_paths(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    conn.prepare("SELECT path FROM content_index_state")?
        .query_map([], |r| r.get::<_, String>(0))?
        .collect()
}

// Batches many content_index_state deletes into one transaction — same
// rationale as delete_batch for `files`: an individual delete per removal
// event (each its own implicit transaction) is an order of magnitude slower
// once a real backlog of removals needs processing at once.
pub fn delete_content_indexed_mtime_batch(conn: &mut Connection, paths: &[String]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for path in paths {
        tx.execute("DELETE FROM content_index_state WHERE path = ?1", params![path])?;
    }
    tx.commit()
}

// The AFTER INSERT/UPDATE/DELETE triggers only cover rows written from now
// on — a database that already had `files` populated before files_fts
// existed (i.e. anyone upgrading from before this was added) needs a
// one-time backfill via FTS5's built-in 'rebuild' command. Measured live:
// 118 seconds against a real ~1.5M-row index — far too slow to run inline
// in `open()`, which is called from Tauri's synchronous `setup()` hook and
// would block the window from appearing on first launch after this update.
// Callers must run this from a background thread (the indexer thread does,
// before its scan loop). A brand new install never pays this cost at all:
// `files` is empty when the schema is first created, so there's nothing to
// backfill — the triggers alone keep files_fts current as rows stream in.
pub fn backfill_fts_if_needed(conn: &Connection) -> rusqlite::Result<()> {
    let files_count: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))?;
    let fts_count: i64 = conn.query_row("SELECT COUNT(*) FROM files_fts", [], |r| r.get(0))?;
    if fts_count != files_count {
        conn.execute("INSERT INTO files_fts(files_fts) VALUES ('rebuild')", [])?;
    }
    Ok(())
}

const UPSERT_SQL: &str = "INSERT INTO files (path, name, extension, is_dir, size, modified_ms)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(path) DO UPDATE SET
        name = excluded.name,
        extension = excluded.extension,
        is_dir = excluded.is_dir,
        size = excluded.size,
        modified_ms = excluded.modified_ms";

pub fn upsert_entry(conn: &Connection, row: &FileRow) -> rusqlite::Result<()> {
    conn.execute(
        UPSERT_SQL,
        params![row.path, row.name, row.extension, row.is_dir as i64, row.size as i64, row.modified_ms as i64],
    )?;
    Ok(())
}

// Batches many rows into one transaction. A bare loop of individual
// upsert_entry calls (each its own implicit transaction) is an order of
// magnitude slower for a large initial scan.
pub fn upsert_batch(conn: &mut Connection, rows: &[FileRow]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for row in rows {
        tx.execute(
            UPSERT_SQL,
            params![row.path, row.name, row.extension, row.is_dir as i64, row.size as i64, row.modified_ms as i64],
        )?;
    }
    tx.commit()
}

pub fn delete_by_path(conn: &Connection, path: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM files WHERE path = ?1", params![path])?;
    Ok(())
}

// Batches many deletes into one transaction — same rationale as
// upsert_batch: a bare loop of individual delete_by_path calls (each its own
// implicit transaction/commit) is an order of magnitude slower for a large
// one-time prune. Confirmed live: prune_stale_entries pruning ~500k
// newly-AppData-excluded rows out of a real ~1.27M-row index via a per-row
// loop was still removing entries at only ~750/sec after several seconds
// (on track to take ~10+ minutes) — the exact same class of slowdown
// upsert_batch's own comment already describes for inserts.
pub fn delete_batch(conn: &mut Connection, paths: &[String]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for path in paths {
        tx.execute("DELETE FROM files WHERE path = ?1", params![path])?;
    }
    tx.commit()
}

// ---- helpers for fs_ops to directly update the search index ----

// Builds a FileRow from a live filesystem path by stat-ing it. Returns None
// if the path no longer exists (rapid create+delete) or is unreadable —
// callers should skip silently, same as the indexer's own row_from_path.
fn row_from_path(path: &Path) -> Option<FileRow> {
    let meta = std::fs::metadata(path).ok()?;
    let modified_ms = modified_ms(&meta);
    Some(FileRow {
        path: path.to_string_lossy().into_owned(),
        name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        extension: path.extension().map(|e| e.to_string_lossy().into_owned()),
        is_dir: meta.is_dir(),
        size: meta.len(),
        modified_ms,
    })
}

// Immediate SQLite index upsert for a path — called by fs_ops after a
// successful create/move/copy so the filename search index reflects the
// change without waiting for the notify watcher to fire.
pub fn index_path(conn: &Mutex<Connection>, path: &Path) {
    if let Some(row) = row_from_path(path) {
        if let Ok(c) = conn.lock() {
            if let Err(e) = upsert_entry(&c, &row) {
                tracing::warn!("failed to index {}: {e}", path.display());
            }
        }
    }
}

// Immediate SQLite index removal for a path — the companion to index_path
// for the old path after a rename/move/delete.
pub fn remove_path(conn: &Mutex<Connection>, path: &Path) {
    if let Some(p) = path.to_str() {
        if let Ok(c) = conn.lock() {
            if let Err(e) = delete_by_path(&c, p) {
                tracing::warn!("failed to remove {p} from index: {e}");
            }
        }
    }
}

// Re-point a file's tag associations after a rename/move so tags follow the
// file. Must run AFTER the new files row exists and BEFORE the old one is
// removed (foreign_keys=ON means file_tags.file_path must always reference a
// live files row). OR IGNORE drops a would-be duplicate if `to` already
// carries that tag.
// ponytail: migrates only the exact path — tags on files *inside* a renamed/
// moved directory aren't carried (their new files rows don't exist yet, so the
// FK would reject the update, and the cross-volume copy+delete fallback is
// likewise not covered). Add a subtree files+tags path-rewrite if that matters.
pub fn retag_path(conn: &Mutex<Connection>, from: &str, to: &str) {
    if let Ok(c) = conn.lock() {
        if let Err(e) = c.execute(
            "UPDATE OR IGNORE file_tags SET file_path = ?1 WHERE file_path = ?2",
            params![to, from],
        ) {
            tracing::warn!("failed to migrate tags {from} -> {to}: {e}");
        }
    }
}

// Test-only: production code reports progress via IndexStatus's in-memory
// atomics (cheap to poll), not a live SQLite COUNT(*).
#[cfg(test)]
pub fn count(conn: &Connection) -> rusqlite::Result<u64> {
    conn.query_row("SELECT COUNT(*) FROM files", [], |row| row.get::<_, i64>(0))
        .map(|c| c as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db(name: &str) -> (std::path::PathBuf, Connection) {
        let path = std::env::temp_dir().join(name);
        let _ = std::fs::remove_file(&path);
        let conn = open(&path).unwrap();
        (path, conn)
    }

    fn row(path: &str) -> FileRow {
        FileRow {
            path: path.to_string(),
            name: path.rsplit(['\\', '/']).next().unwrap_or(path).to_string(),
            extension: None,
            is_dir: false,
            size: 42,
            modified_ms: 1_700_000_000_000,
        }
    }

    #[test]
    fn upsert_then_update_keeps_a_single_row() {
        let (path, conn) = temp_db("schlag_test_db_upsert.sqlite");

        let mut r = row("C:\\Users\\carlo\\a.txt");
        upsert_entry(&conn, &r).unwrap();
        assert_eq!(count(&conn).unwrap(), 1);

        r.size = 100; // same path, changed metadata -> update, not a second row
        upsert_entry(&conn, &r).unwrap();
        assert_eq!(count(&conn).unwrap(), 1);

        let stored_size: i64 = conn
            .query_row("SELECT size FROM files WHERE path = ?1", params![r.path], |row| row.get(0))
            .unwrap();
        assert_eq!(stored_size, 100);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn retag_path_moves_tags_to_the_new_path_and_survives_the_cascade() {
        let (path, conn) = temp_db("schlag_test_db_retag.sqlite");

        // A tagged file at the old path.
        upsert_entry(&conn, &row("C:\\a\\old.txt")).unwrap();
        conn.execute("INSERT INTO tags (name, color) VALUES ('work', '#111')", []).unwrap();
        conn.execute("INSERT INTO file_tags (file_path, tag_id) VALUES ('C:\\a\\old.txt', 1)", []).unwrap();

        // Rename flow: new row first, migrate tags, then drop the old row.
        upsert_entry(&conn, &row("C:\\a\\new.txt")).unwrap();
        let m = std::sync::Mutex::new(conn);
        retag_path(&m, "C:\\a\\old.txt", "C:\\a\\new.txt");
        {
            let c = m.lock().unwrap();
            delete_by_path(&c, "C:\\a\\old.txt").unwrap();
        }

        let c = m.lock().unwrap();
        let at_new: i64 = c
            .query_row("SELECT COUNT(*) FROM file_tags WHERE file_path = 'C:\\a\\new.txt'", [], |r| r.get(0))
            .unwrap();
        let at_old: i64 = c
            .query_row("SELECT COUNT(*) FROM file_tags WHERE file_path = 'C:\\a\\old.txt'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(at_new, 1, "tag should follow the file to its new path");
        assert_eq!(at_old, 0, "no tag rows should linger at the old path");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn delete_by_path_removes_only_that_row() {
        let (path, mut conn) = temp_db("schlag_test_db_delete.sqlite");

        upsert_batch(&mut conn, &[row("C:\\a.txt"), row("C:\\b.txt")]).unwrap();
        assert_eq!(count(&conn).unwrap(), 2);

        delete_by_path(&conn, "C:\\a.txt").unwrap();
        assert_eq!(count(&conn).unwrap(), 1);

        let remaining: String = conn.query_row("SELECT path FROM files", [], |row| row.get(0)).unwrap();
        assert_eq!(remaining, "C:\\b.txt");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn delete_batch_removes_exactly_the_given_paths_in_one_transaction() {
        let (path, mut conn) = temp_db("schlag_test_db_delete_batch.sqlite");

        upsert_batch(&mut conn, &[row("C:\\a.txt"), row("C:\\b.txt"), row("C:\\c.txt")]).unwrap();
        assert_eq!(count(&conn).unwrap(), 3);

        delete_batch(&mut conn, &["C:\\a.txt".to_string(), "C:\\c.txt".to_string()]).unwrap();
        assert_eq!(count(&conn).unwrap(), 1);

        let remaining: String = conn.query_row("SELECT path FROM files", [], |row| row.get(0)).unwrap();
        assert_eq!(remaining, "C:\\b.txt");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn upsert_batch_commits_all_rows_in_one_transaction() {
        let (path, mut conn) = temp_db("schlag_test_db_batch.sqlite");

        let rows: Vec<FileRow> = (0..50).map(|i| row(&format!("C:\\file{i}.txt"))).collect();
        upsert_batch(&mut conn, &rows).unwrap();
        assert_eq!(count(&conn).unwrap(), 50);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn content_indexed_mtime_round_trips_and_defaults_to_none() {
        let (path, mut conn) = temp_db("schlag_test_db_content_state.sqlite");

        assert_eq!(content_indexed_mtime(&conn, "C:\\a.txt").unwrap(), None);

        set_content_indexed_mtime(&conn, "C:\\a.txt", 1_700_000_000_000).unwrap();
        assert_eq!(content_indexed_mtime(&conn, "C:\\a.txt").unwrap(), Some(1_700_000_000_000));

        // Re-setting the same path updates in place, not a second row.
        set_content_indexed_mtime(&conn, "C:\\a.txt", 1_700_000_500_000).unwrap();
        assert_eq!(content_indexed_mtime(&conn, "C:\\a.txt").unwrap(), Some(1_700_000_500_000));

        delete_content_indexed_mtime_batch(&mut conn, &["C:\\a.txt".to_string()]).unwrap();
        assert_eq!(content_indexed_mtime(&conn, "C:\\a.txt").unwrap(), None);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn content_index_state_paths_and_batch_delete_round_trip() {
        let (path, mut conn) = temp_db("schlag_test_db_content_state_batch.sqlite");

        set_content_indexed_mtime(&conn, "C:\\a.txt", 1_700_000_000_000).unwrap();
        set_content_indexed_mtime(&conn, "C:\\b.txt", 1_700_000_000_000).unwrap();
        set_content_indexed_mtime(&conn, "C:\\c.txt", 1_700_000_000_000).unwrap();

        let mut paths = content_index_state_paths(&conn).unwrap();
        paths.sort();
        assert_eq!(paths, vec!["C:\\a.txt", "C:\\b.txt", "C:\\c.txt"]);

        delete_content_indexed_mtime_batch(&mut conn, &["C:\\a.txt".to_string(), "C:\\c.txt".to_string()]).unwrap();
        let remaining = content_index_state_paths(&conn).unwrap();
        assert_eq!(remaining, vec!["C:\\b.txt"]);

        let _ = std::fs::remove_file(&path);
    }
}
