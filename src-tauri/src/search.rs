use crate::fs_ops::Entry;
use regex::Regex;
use rusqlite::{Connection, ToSql};
use std::cell::RefCell;
use std::sync::Mutex;

const RESULT_LIMIT: i64 = 500;

#[derive(serde::Deserialize, Default)]
pub struct SearchFilters {
    extension: Option<String>,
    min_size: Option<u64>,
    max_size: Option<u64>,
    modified_after_ms: Option<u64>,
    modified_before_ms: Option<u64>,
    folder: Option<String>,
    regex: Option<String>,
}

thread_local! {
    // A REGEXP query re-invokes this function once per row with the SAME
    // pattern — compiling it fresh every time turned a single query into a
    // 300+ second scan against the real ~1.5M-row index (measured live).
    // Caching just the most-recently-compiled pattern is enough, since one
    // query never interleaves two different patterns on the same thread.
    static REGEX_CACHE: RefCell<Option<(String, Regex)>> = const { RefCell::new(None) };
}

// SQLite has no REGEXP function built in — callers must register one before
// it can appear in a query. Registered once on the reader connection at
// startup (see lib.rs), backed by the `regex` crate.
pub fn register_regexp(conn: &Connection) -> rusqlite::Result<()> {
    conn.create_scalar_function(
        "regexp",
        2,
        rusqlite::functions::FunctionFlags::SQLITE_UTF8 | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let pattern = ctx.get::<String>(0)?;
            let value = ctx.get::<String>(1)?;
            REGEX_CACHE.with(|cache| {
                let mut cache = cache.borrow_mut();
                let stale = !matches!(&*cache, Some((cached, _)) if cached == &pattern);
                if stale {
                    let re = Regex::new(&pattern).map_err(|e| rusqlite::Error::UserFunctionError(Box::new(e)))?;
                    *cache = Some((pattern.clone(), re));
                }
                Ok(cache.as_ref().unwrap().1.is_match(&value))
            })
        },
    )
}

// LIKE treats %, _, and the escape character itself as special — a raw user
// query containing any of them would otherwise be (mis)interpreted as a
// wildcard instead of a literal character.
fn escape_like(raw: &str) -> String {
    raw.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

// FTS5's documented way to do a substring search against a trigram-tokenized
// table is a quoted phrase MATCH — the trigram tokenizer decomposes it into
// overlapping trigrams and matches names containing that exact sequence.
// (A plain `LIKE` against files_fts was tried first and measured *slower*
// than scanning `files` directly — the bundled SQLite's query planner isn't
// applying the newer trigram-LIKE optimization, so MATCH is what actually
// uses the index.) The only escaping MATCH needs is doubling embedded `"`.
fn fts_phrase(raw: &str) -> String {
    format!("\"{}\"", raw.replace('"', "\"\""))
}

// Phrase mode: the whole query, as one contiguous run of characters
// (spaces included) — "tester man test" only matches text that contains
// that literal sequence. The trigram tokenizer can't extract a trigram from
// fewer than 3 characters, so shorter queries fall back to a plain scan —
// acceptable since such broad queries hit the result LIMIT almost
// immediately anyway (measured: a 1-character query still only took ~5ms).
fn build_phrase_match(query: &str) -> (String, Vec<Box<dyn ToSql>>) {
    let use_fts = query.chars().count() >= 3;
    if use_fts {
        (
            "SELECT files.path, files.name, files.is_dir, files.size, files.modified_ms \
             FROM files_fts JOIN files ON files.id = files_fts.rowid \
             WHERE files_fts MATCH ?1"
                .to_string(),
            vec![Box::new(fts_phrase(query))],
        )
    } else {
        (
            "SELECT files.path, files.name, files.is_dir, files.size, files.modified_ms \
             FROM files WHERE files.name LIKE ?1 ESCAPE '\\'"
                .to_string(),
            vec![Box::new(format!("%{}%", escape_like(query)))],
        )
    }
}

// Keyword mode: every whitespace-separated word must appear *somewhere* in
// the name, in any order — "test man tester" and "tester man test" both
// match a query of "tester man test", unlike phrase mode which requires
// them contiguous and in the typed order. Words >= 3 chars each get their
// own quoted FTS5 phrase (still trigram-indexed, still a substring match,
// just ANDed together via FTS5's own boolean query syntax); shorter words
// fall back to their own `LIKE` `AND` clause, same per-word length rule
// phrase mode already applies to the whole query.
fn build_keyword_match(query: &str) -> (String, Vec<Box<dyn ToSql>>) {
    let (fts_words, like_words): (Vec<&str>, Vec<&str>) =
        query.split_whitespace().partition(|w| w.chars().count() >= 3);

    let mut sql = "SELECT files.path, files.name, files.is_dir, files.size, files.modified_ms FROM files".to_string();
    let mut params: Vec<Box<dyn ToSql>> = Vec::new();
    let mut conditions: Vec<String> = Vec::new();

    if !fts_words.is_empty() {
        sql.push_str(" JOIN files_fts ON files.id = files_fts.rowid");
        let combined_phrase = fts_words.iter().map(|w| fts_phrase(w)).collect::<Vec<_>>().join(" AND ");
        conditions.push(format!("files_fts MATCH ?{}", params.len() + 1));
        params.push(Box::new(combined_phrase));
    }
    for word in like_words {
        conditions.push(format!("files.name LIKE ?{} ESCAPE '\\'", params.len() + 1));
        params.push(Box::new(format!("%{}%", escape_like(word))));
    }

    sql.push_str(if conditions.is_empty() { " WHERE 1=1" } else { " WHERE " });
    if !conditions.is_empty() {
        sql.push_str(&conditions.join(" AND "));
    }

    (sql, params)
}

fn build_query(query: &str, filters: &SearchFilters, keyword_mode: bool) -> (String, Vec<Box<dyn ToSql>>) {
    let (mut sql, mut params) =
        if keyword_mode { build_keyword_match(query) } else { build_phrase_match(query) };

    if let Some(extension) = &filters.extension {
        sql.push_str(&format!(" AND files.extension = ?{}", params.len() + 1));
        params.push(Box::new(extension.clone()));
    }
    if let Some(min_size) = filters.min_size {
        sql.push_str(&format!(" AND files.size >= ?{}", params.len() + 1));
        params.push(Box::new(min_size as i64));
    }
    if let Some(max_size) = filters.max_size {
        sql.push_str(&format!(" AND files.size <= ?{}", params.len() + 1));
        params.push(Box::new(max_size as i64));
    }
    if let Some(after) = filters.modified_after_ms {
        sql.push_str(&format!(" AND files.modified_ms >= ?{}", params.len() + 1));
        params.push(Box::new(after as i64));
    }
    if let Some(before) = filters.modified_before_ms {
        sql.push_str(&format!(" AND files.modified_ms <= ?{}", params.len() + 1));
        params.push(Box::new(before as i64));
    }
    if let Some(folder) = &filters.folder {
        // A trailing separator before the wildcard means this only matches
        // *contents* of the folder, not the folder's own row — `path LIKE
        // '{folder}%'` alone also matches the folder itself (any string
        // starts with itself), which showed up as a bizarre "search result"
        // when the folder's own name happened to match the query too.
        let mut prefix = folder.clone();
        if !prefix.ends_with('\\') {
            prefix.push('\\');
        }
        sql.push_str(&format!(" AND files.path LIKE ?{} ESCAPE '\\'", params.len() + 1));
        params.push(Box::new(format!("{}%", escape_like(&prefix))));
    }
    if let Some(pattern) = &filters.regex {
        sql.push_str(&format!(" AND files.name REGEXP ?{}", params.len() + 1));
        params.push(Box::new(pattern.clone()));
    }

    sql.push_str(&format!(" ORDER BY files.name LIMIT {RESULT_LIMIT}"));
    (sql, params)
}

fn run_query(conn: &Connection, query: &str, filters: &SearchFilters, keyword_mode: bool) -> rusqlite::Result<Vec<Entry>> {
    let (sql, params) = build_query(query, filters, keyword_mode);
    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(Entry {
            path: row.get(0)?,
            name: row.get(1)?,
            is_dir: row.get::<_, i64>(2)? != 0,
            size: row.get::<_, i64>(3)? as u64,
            modified_ms: row.get::<_, i64>(4)? as u64,
        })
    })?;
    rows.collect()
}

#[tauri::command]
pub fn search_files(
    conn: tauri::State<Mutex<Connection>>,
    query: String,
    filters: SearchFilters,
    keyword_mode: bool,
) -> Result<Vec<Entry>, String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;
    run_query(&conn, &query, &filters, keyword_mode).map_err(|e| e.to_string())
}

const RECENT_FILES_LIMIT: i64 = 10;

// ponytail: a plain global sort by modified_ms, no per-app noise filtering
// (a browser's constantly-rewritten profile files would show up if they're
// genuinely the newest) — not requested, add a filter if this proves noisy
// in practice.
fn run_recent_files(conn: &Connection) -> rusqlite::Result<Vec<Entry>> {
    let mut stmt = conn.prepare(
        "SELECT path, name, is_dir, size, modified_ms FROM files \
         WHERE is_dir = 0 ORDER BY modified_ms DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([RECENT_FILES_LIMIT], |row| {
        Ok(Entry {
            path: row.get(0)?,
            name: row.get(1)?,
            is_dir: row.get::<_, i64>(2)? != 0,
            size: row.get::<_, i64>(3)? as u64,
            modified_ms: row.get::<_, i64>(4)? as u64,
        })
    })?;
    rows.collect()
}

#[tauri::command]
pub fn recent_files(conn: tauri::State<Mutex<Connection>>) -> Result<Vec<Entry>, String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;
    run_recent_files(&conn).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;

    fn seed_db(name: &str) -> (std::path::PathBuf, Connection) {
        let path = std::env::temp_dir().join(name);
        let _ = std::fs::remove_file(&path);
        let mut conn = database::open(&path).unwrap();
        register_regexp(&conn).unwrap();

        let rows = [
            ("C:\\Users\\carlo\\Documents\\report.txt", "report.txt", Some("txt"), 100u64, 1_700_000_000_000u64),
            ("C:\\Users\\carlo\\Documents\\report_final.txt", "report_final.txt", Some("txt"), 5000, 1_700_000_500_000),
            ("C:\\Users\\carlo\\Pictures\\report.png", "report.png", Some("png"), 200_000, 1_700_001_000_000),
            ("C:\\Users\\carlo\\Documents\\100%.txt", "100%.txt", Some("txt"), 10, 1_700_000_000_000),
            ("C:\\Users\\carlo\\Documents\\unrelated.md", "unrelated.md", Some("md"), 10, 1_700_000_000_000),
        ];
        let file_rows: Vec<database::FileRow> = rows
            .iter()
            .map(|(path, name, ext, size, modified_ms)| database::FileRow {
                path: path.to_string(),
                name: name.to_string(),
                extension: ext.map(|e| e.to_string()),
                is_dir: false,
                size: *size,
                modified_ms: *modified_ms,
            })
            .collect();
        database::upsert_batch(&mut conn, &file_rows).unwrap();

        (path, conn)
    }

    #[test]
    fn multi_word_query_matches_as_a_contiguous_phrase_surrounded_by_other_text() {
        let path = std::env::temp_dir().join("schlag_test_search_phrase.sqlite");
        let _ = std::fs::remove_file(&path);
        let mut conn = database::open(&path).unwrap();
        let rows = [
            // Contains "tester man test" verbatim, with extra text on both sides.
            ("C:\\a\\123 tester man test 123.txt", "123 tester man test 123.txt"),
            // Contains the same three words, just not in that contiguous order.
            ("C:\\a\\test man tester.txt", "test man tester.txt"),
        ];
        let file_rows: Vec<database::FileRow> = rows
            .iter()
            .map(|(path, name)| database::FileRow {
                path: path.to_string(),
                name: name.to_string(),
                extension: Some("txt".to_string()),
                is_dir: false,
                size: 10,
                modified_ms: 1_700_000_000_000,
            })
            .collect();
        database::upsert_batch(&mut conn, &file_rows).unwrap();

        let results = run_query(&conn, "tester man test", &SearchFilters::default(), false).unwrap();
        assert_eq!(results.len(), 1, "only the name containing the exact phrase should match");
        assert_eq!(results[0].name, "123 tester man test 123.txt");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn keyword_mode_matches_all_words_in_any_order_but_not_a_partial_subset() {
        let path = std::env::temp_dir().join("schlag_test_search_keywords.sqlite");
        let _ = std::fs::remove_file(&path);
        let mut conn = database::open(&path).unwrap();
        let rows = [
            // Contiguous, matching order.
            ("C:\\a\\tester man test.txt", "tester man test.txt"),
            // Same three words, scattered — phrase mode would reject this, keyword mode should not.
            ("C:\\a\\test man tester.txt", "test man tester.txt"),
            // Only one of the three words present — must not match.
            ("C:\\a\\tester 123.txt", "tester 123.txt"),
        ];
        let file_rows: Vec<database::FileRow> = rows
            .iter()
            .map(|(path, name)| database::FileRow {
                path: path.to_string(),
                name: name.to_string(),
                extension: Some("txt".to_string()),
                is_dir: false,
                size: 10,
                modified_ms: 1_700_000_000_000,
            })
            .collect();
        database::upsert_batch(&mut conn, &file_rows).unwrap();

        let mut results = run_query(&conn, "tester man test", &SearchFilters::default(), true).unwrap();
        results.sort_by(|a, b| a.name.cmp(&b.name));
        assert_eq!(
            results.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(),
            vec!["test man tester.txt", "tester man test.txt"],
            "both orderings of all three words should match, but not the file missing two of them"
        );

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn keyword_mode_handles_a_mix_of_short_and_long_words() {
        let path = std::env::temp_dir().join("schlag_test_search_keywords_short.sqlite");
        let _ = std::fs::remove_file(&path);
        let mut conn = database::open(&path).unwrap();
        let rows = [
            // "ok" (2 chars, falls back to LIKE) and "report" (>= 3 chars, uses FTS) both present.
            ("C:\\a\\ok_report.txt", "ok_report.txt"),
            // Only "report" present, missing "ok" entirely — must not match.
            ("C:\\a\\report_only.txt", "report_only.txt"),
        ];
        let file_rows: Vec<database::FileRow> = rows
            .iter()
            .map(|(path, name)| database::FileRow {
                path: path.to_string(),
                name: name.to_string(),
                extension: Some("txt".to_string()),
                is_dir: false,
                size: 10,
                modified_ms: 1_700_000_000_000,
            })
            .collect();
        database::upsert_batch(&mut conn, &file_rows).unwrap();

        let results = run_query(&conn, "ok report", &SearchFilters::default(), true).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "ok_report.txt");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn plain_substring_matches_case_insensitively() {
        // Query case deliberately doesn't match the fixture's lowercase
        // names ("report.txt", etc.) — a same-case query would pass even if
        // the trigram tokenizer's case-folding were broken, since it'd also
        // pass as a trivial exact-case match.
        let (path, conn) = seed_db("schlag_test_search_substring.sqlite");
        let results = run_query(&conn, "REPORT", &SearchFilters::default(), false).unwrap();
        assert_eq!(results.len(), 3);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn special_characters_in_query_are_escaped_not_wildcards() {
        // "100%" is 4 characters, so this actually exercises the FTS5
        // quoted-phrase MATCH branch (build_phrase_match's >=3-char path),
        // not escape_like's LIKE-branch escaping — FTS5 phrase quoting
        // treats every character literally regardless. Kept as its own
        // assertion since it's a real, distinct guarantee (a quoted MATCH
        // doesn't need escaping for this to work), separate from the
        // short-query LIKE-branch test below.
        let (path, conn) = seed_db("schlag_test_search_escape.sqlite");
        let results = run_query(&conn, "100%", &SearchFilters::default(), false).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "100%.txt");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn short_query_special_characters_are_escaped_not_wildcards() {
        // Queries under 3 characters fall back to a plain `LIKE ... ESCAPE
        // '\'` scan (the trigram tokenizer can't extract a trigram from
        // fewer than 3 characters) — this is the only test that actually
        // exercises escape_like()'s LIKE-branch escaping; the test above
        // uses a 4-character query, which never reaches this branch.
        let path = std::env::temp_dir().join("schlag_test_search_escape_short.sqlite");
        let _ = std::fs::remove_file(&path);
        let mut conn = database::open(&path).unwrap();
        let rows = [
            // Contains a literal "_x" — should match.
            ("C:\\a\\file_x.txt", "file_x.txt"),
            // Contains "x" preceded by a different single character, not an
            // underscore — should NOT match if '_' is escaped as a literal
            // character. If '_' were left as a raw SQL LIKE wildcard
            // (matches any one character), this row would wrongly match too,
            // since "A" would satisfy the "any one char" wildcard.
            ("C:\\a\\fileAx.txt", "fileAx.txt"),
        ];
        let file_rows: Vec<database::FileRow> = rows
            .iter()
            .map(|(path, name)| database::FileRow {
                path: path.to_string(),
                name: name.to_string(),
                extension: Some("txt".to_string()),
                is_dir: false,
                size: 10,
                modified_ms: 1_700_000_000_000,
            })
            .collect();
        database::upsert_batch(&mut conn, &file_rows).unwrap();

        let results = run_query(&conn, "_x", &SearchFilters::default(), false).unwrap();
        assert_eq!(results.len(), 1, "'_' must be escaped as a literal character, not a single-char wildcard");
        assert_eq!(results[0].name, "file_x.txt");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn extension_filter_narrows_results() {
        let (path, conn) = seed_db("schlag_test_search_ext.sqlite");
        let filters = SearchFilters { extension: Some("png".to_string()), ..Default::default() };
        let results = run_query(&conn, "report", &filters, false).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "report.png");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn size_range_filter_narrows_results() {
        let (path, conn) = seed_db("schlag_test_search_size.sqlite");
        let filters = SearchFilters { min_size: Some(1000), max_size: Some(10_000), ..Default::default() };
        let results = run_query(&conn, "report", &filters, false).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "report_final.txt");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn date_range_filter_narrows_results() {
        let (path, conn) = seed_db("schlag_test_search_date.sqlite");
        let filters = SearchFilters {
            modified_after_ms: Some(1_700_000_600_000),
            ..Default::default()
        };
        let results = run_query(&conn, "report", &filters, false).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "report.png");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn folder_filter_narrows_results() {
        let (path, conn) = seed_db("schlag_test_search_folder.sqlite");
        let filters = SearchFilters {
            folder: Some("C:\\Users\\carlo\\Pictures".to_string()),
            ..Default::default()
        };
        let results = run_query(&conn, "report", &filters, false).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "report.png");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn folder_filter_excludes_the_folder_itself() {
        let path = std::env::temp_dir().join("schlag_test_search_folder_self.sqlite");
        let _ = std::fs::remove_file(&path);
        let mut conn = database::open(&path).unwrap();
        let rows = vec![
            database::FileRow {
                path: "C:\\Users\\carlo\\Documents".to_string(),
                name: "Documents".to_string(),
                extension: None,
                is_dir: true,
                size: 0,
                modified_ms: 1_700_000_000_000,
            },
            database::FileRow {
                path: "C:\\Users\\carlo\\Documents\\Documents_report.txt".to_string(),
                name: "Documents_report.txt".to_string(),
                extension: Some("txt".to_string()),
                is_dir: false,
                size: 10,
                modified_ms: 1_700_000_000_000,
            },
        ];
        database::upsert_batch(&mut conn, &rows).unwrap();

        let filters = SearchFilters { folder: Some("C:\\Users\\carlo\\Documents".to_string()), ..Default::default() };
        let results = run_query(&conn, "Documents", &filters, false).unwrap();

        // Searching for "Documents" while scoped to the Documents folder
        // itself should only match its *contents*, not the folder's own
        // row — even though the folder's own name also matches the query.
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Documents_report.txt");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn regex_filter_narrows_results() {
        let (path, conn) = seed_db("schlag_test_search_regex.sqlite");
        let filters = SearchFilters { regex: Some(r"^report\.".to_string()), ..Default::default() };
        let results = run_query(&conn, "report", &filters, false).unwrap();
        // Matches report.txt and report.png (name starts with "report."),
        // not report_final.txt (underscore, no dot right after "report").
        assert_eq!(results.len(), 2);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn combined_filters_apply_together() {
        let (path, conn) = seed_db("schlag_test_search_combined.sqlite");
        let filters = SearchFilters {
            extension: Some("txt".to_string()),
            max_size: Some(1000),
            ..Default::default()
        };
        let results = run_query(&conn, "report", &filters, false).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "report.txt");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn recent_files_excludes_dirs_orders_newest_first_and_respects_the_limit() {
        let path = std::env::temp_dir().join("schlag_test_recent_files.sqlite");
        let _ = std::fs::remove_file(&path);
        let mut conn = database::open(&path).unwrap();

        // 15 files, oldest to newest by index, plus one directory with a
        // modified_ms newer than every file — it must never appear.
        let mut rows: Vec<database::FileRow> = (0..15)
            .map(|i| database::FileRow {
                path: format!("C:\\recent\\file{i}.txt"),
                name: format!("file{i}.txt"),
                extension: Some("txt".to_string()),
                is_dir: false,
                size: 10,
                modified_ms: 1_700_000_000_000 + i as u64 * 1000,
            })
            .collect();
        rows.push(database::FileRow {
            path: "C:\\recent\\a_newer_folder".to_string(),
            name: "a_newer_folder".to_string(),
            extension: None,
            is_dir: true,
            size: 0,
            modified_ms: 9_999_999_999_999,
        });
        database::upsert_batch(&mut conn, &rows).unwrap();

        let results = run_recent_files(&conn).unwrap();

        assert_eq!(results.len(), RECENT_FILES_LIMIT as usize);
        assert!(results.iter().all(|e| !e.is_dir), "a directory must never appear in a files-only recent list");
        assert_eq!(results[0].name, "file14.txt", "newest file must come first");
        assert_eq!(results.last().unwrap().name, "file5.txt", "only the 10 newest files should be returned");
        for pair in results.windows(2) {
            assert!(pair[0].modified_ms >= pair[1].modified_ms, "results must be strictly newest-first");
        }

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn result_limit_is_respected() {
        let path = std::env::temp_dir().join("schlag_test_search_limit.sqlite");
        let _ = std::fs::remove_file(&path);
        let mut conn = database::open(&path).unwrap();

        let rows: Vec<database::FileRow> = (0..(RESULT_LIMIT as usize + 50))
            .map(|i| database::FileRow {
                path: format!("C:\\many\\match{i}.txt"),
                name: format!("match{i}.txt"),
                extension: Some("txt".to_string()),
                is_dir: false,
                size: 1,
                modified_ms: 1_700_000_000_000,
            })
            .collect();
        database::upsert_batch(&mut conn, &rows).unwrap();

        let results = run_query(&conn, "match", &SearchFilters::default(), false).unwrap();
        assert_eq!(results.len(), RESULT_LIMIT as usize);
        let _ = std::fs::remove_file(&path);
    }
}
