use rusqlite::{params, Connection};
use std::io::Read;
use std::path::Path;
use std::sync::Mutex;
use tantivy::collector::TopDocs;
use tantivy::directory::MmapDirectory;
use tantivy::query::QueryParser;
use tantivy::schema::{Field, Schema, Value, STORED, STRING, TEXT};
use tantivy::snippet::SnippetGenerator;
use tantivy::{doc, Index, IndexWriter, TantivyDocument, Term};
use zip::ZipArchive;

// ponytail: bounds pathological-file hang risk and per-doc Tantivy storage
// growth — a source file bigger than this is skipped outright, and any
// extracted text longer than this is truncated, not rejected. Revisit if
// real usage shows either ceiling is too small.
const MAX_SOURCE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_TEXT_CHARS: usize = 500_000;

const RESULT_LIMIT: usize = 100;
// Folder scoping is a post-filter over Tantivy's own top-N ranking, not a
// native Tantivy query (see search_content) — overfetch a wider candidate
// window so a folder-scoped search still has enough to filter from.
// ponytail: if a folder-scoped query needs more than this to find enough
// in-folder matches, results may be incomplete — revisit with a real
// Tantivy-side path-prefix query if that proves common in practice.
const OVERFETCH_FACTOR: usize = 4;

// Legacy binary Office formats (.doc/.xls/.ppt) are deliberately not here —
// they're the old OLE2/Compound File Binary container, structurally nothing
// like the zip-of-XML-parts the docx/xlsx/pptx extraction below depends on.
// Supporting them would need a real binary-format parser, not a longer
// whitelist — out of scope for now (rare in practice since Office defaulted
// to the modern formats back in 2007).
const EXTRACTABLE_EXTENSIONS: &[&str] = &[
    "txt", "md", "markdown", "pdf", "docx", "xlsx", "pptx",
    // Code and config files — already plain text, same extraction path as
    // txt/md (see extract_text's dispatch below), just a longer whitelist.
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rs", "go", "java", "kt", "swift", "c", "h", "cpp", "hpp", "cs",
    "rb", "php", "sh", "ps1", "sql", "html", "css", "scss", "json", "yaml", "yml", "toml", "xml", "vue", "svelte",
];

pub fn is_extractable(ext: &str) -> bool {
    EXTRACTABLE_EXTENSIONS.iter().any(|e| e.eq_ignore_ascii_case(ext))
}

#[derive(Clone)]
pub struct ContentSchema {
    pub schema: Schema,
    pub path: Field,
    pub content: Field,
    pub modified_ms: Field,
}

fn build_schema() -> ContentSchema {
    let mut builder = Schema::builder();
    // STRING (not TEXT): an exact, untokenized key used for delete_term —
    // never searched against directly.
    let path = builder.add_text_field("path", STRING | STORED);
    let content = builder.add_text_field("content", TEXT | STORED);
    let modified_ms = builder.add_u64_field("modified_ms", STORED);
    let schema = builder.build();
    ContentSchema { schema, path, content, modified_ms }
}

// Cheap regardless of index size on both branches: a brand new directory has
// nothing to do, and opening an existing index just reads segment metadata —
// unlike the SQLite FTS5 backfill footgun (a full-table rebuild), this is
// safe to call from Tauri's synchronous setup() hook.
pub fn open_index(dir: &Path) -> tantivy::Result<(Index, ContentSchema)> {
    std::fs::create_dir_all(dir)?;
    let schema = build_schema();
    let mmap_dir = MmapDirectory::open(dir)?;
    let index = Index::open_or_create(mmap_dir, schema.schema.clone())?;
    Ok((index, schema))
}

pub fn index_path(
    writer: &IndexWriter,
    schema: &ContentSchema,
    path: &str,
    content: &str,
    modified_ms: u64,
) -> tantivy::Result<()> {
    // Delete-then-add makes this an idempotent upsert by path, mirroring the
    // SQLite `files` table's ON CONFLICT pattern — indexing the same path
    // twice (e.g. a modify event racing the initial scan) never produces two
    // Tantivy documents for it.
    writer.delete_term(Term::from_field_text(schema.path, path));
    writer.add_document(doc!(
        schema.path => path,
        schema.content => content,
        schema.modified_ms => modified_ms,
    ))?;
    Ok(())
}

pub fn remove_path(writer: &IndexWriter, schema: &ContentSchema, path: &str) {
    writer.delete_term(Term::from_field_text(schema.path, path));
}

// Dispatches by extension; returns None for anything unsupported, unreadable,
// oversized, or that extracted to nothing.
pub fn extract_text(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    if !is_extractable(&ext) {
        return None;
    }
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > MAX_SOURCE_BYTES {
            return None;
        }
    }
    // Anything reaching the fallback arm already passed is_extractable()
    // above, so it's one of the plain-text-shaped extensions (txt/md/
    // markdown, or a code/config extension) — no per-extension case needed
    // there, unlike the four formats with their own real parser.
    let text = match ext.as_str() {
        "pdf" => pdf_extract::extract_text(path).ok(),
        "docx" => extract_docx_text(path),
        "pptx" => extract_pptx_text(path),
        "xlsx" => extract_xlsx_text(path),
        _ => extract_plain_text(path),
    }?;
    Some(truncate_chars(text, MAX_TEXT_CHARS))
}

fn truncate_chars(s: String, max: usize) -> String {
    if s.chars().count() > max {
        s.chars().take(max).collect()
    } else {
        s
    }
}

// Bytes, not read_to_string — a lossy conversion beats hard-failing (and
// skipping the whole file) over one stray non-UTF8 byte in an otherwise
// perfectly good text/markdown file.
fn extract_plain_text(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

// DOCX and PPTX are both "a zip of XML parts" (OOXML) — this one helper
// covers both instead of pulling in a bespoke crate per format (docx-rs,
// or any of the several lower-maturity pptx crates surveyed). Both formats'
// visible text runs use the *local* XML tag name `t` (`w:t` in DOCX,
// `a:t` in PPTX — namespace-prefix-stripped local name is the same).
fn text_from_zip_parts(path: &Path, parts: &[String]) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut out = String::new();
    for part in parts {
        let mut entry = archive.by_name(part).ok()?;
        let mut xml = String::new();
        entry.read_to_string(&mut xml).ok()?;
        out.push_str(&text_in_tag(&xml));
        out.push('\n');
    }
    if out.trim().is_empty() {
        None
    } else {
        Some(out)
    }
}

fn text_in_tag(xml: &str) -> String {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();
    let mut inside = false;
    let mut out = String::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) if e.local_name().as_ref() == b"t" => inside = true,
            Ok(Event::End(e)) if e.local_name().as_ref() == b"t" => inside = false,
            Ok(Event::Text(e)) if inside => {
                if let Ok(decoded) = e.decode() {
                    if let Ok(unescaped) = quick_xml::escape::unescape(&decoded) {
                        out.push_str(&unescaped);
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    out
}

fn extract_docx_text(path: &Path) -> Option<String> {
    text_from_zip_parts(path, &["word/document.xml".to_string()])
}

fn extract_pptx_text(path: &Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let archive = ZipArchive::new(file).ok()?;
    let mut slides: Vec<(u32, String)> = archive
        .file_names()
        .filter(|n| n.starts_with("ppt/slides/slide") && n.ends_with(".xml"))
        .map(|n| (slide_number(n), n.to_string()))
        .collect();
    slides.sort_by_key(|(n, _)| *n);
    drop(archive);
    let parts: Vec<String> = slides.into_iter().map(|(_, name)| name).collect();
    if parts.is_empty() {
        return None;
    }
    text_from_zip_parts(path, &parts)
}

// "ppt/slides/slide12.xml" -> 12. Numeric, not lexicographic, sort — a
// straight string sort would put slide10 before slide2.
fn slide_number(name: &str) -> u32 {
    name.trim_start_matches("ppt/slides/slide").trim_end_matches(".xml").parse().unwrap_or(0)
}

fn extract_xlsx_text(path: &Path) -> Option<String> {
    use calamine::{open_workbook_auto, Data, Reader as _};

    let mut workbook = open_workbook_auto(path).ok()?;
    let mut out = String::new();
    for sheet_name in workbook.sheet_names().to_owned() {
        let Ok(range) = workbook.worksheet_range(&sheet_name) else { continue };
        for row in range.rows() {
            for cell in row {
                if !matches!(cell, Data::Empty) {
                    out.push_str(&cell.to_string());
                    out.push(' ');
                }
            }
        }
        out.push('\n');
    }
    if out.trim().is_empty() {
        None
    } else {
        Some(out)
    }
}

#[derive(serde::Serialize)]
pub struct ContentSearchResult {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: u64,
    pub snippet: String,
    // (start, end) byte offsets into `snippet` to highlight — plain data,
    // not pre-built HTML. See search_content's doc comment for why.
    pub highlight_ranges: Vec<(usize, usize)>,
}

// Owns the Tantivy `Index` handle shared between this command (reads) and
// the indexer's dedicated content-writer thread (writes) — `Index` is
// designed to be cheaply cloned/shared for concurrent readers alongside one
// writer, so no Mutex is needed here (unlike the SQLite `Mutex<Connection>`
// pattern, which exists because `Connection` itself isn't `Sync`).
pub struct ContentIndexState {
    pub index: Index,
    pub schema: ContentSchema,
}

// Tantivy's `Snippet::to_html()` wraps matches in `<b>` but does NOT
// HTML-escape the surrounding fragment — since that fragment is raw file
// content the app doesn't control, rendering it as trusted HTML would be a
// real XSS vector (a file whose text happens to contain `<script>`). This
// command exposes the plain fragment plus highlight byte ranges instead, so
// the frontend can build highlighted spans via ordinary (auto-escaping) JSX.
#[tauri::command]
pub fn search_content(
    state: tauri::State<ContentIndexState>,
    conn: tauri::State<Mutex<Connection>>,
    query: String,
    folder: Option<String>,
    keyword_mode: bool,
) -> Result<Vec<ContentSearchResult>, String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;
    run_content_query(&state.index, &state.schema, &conn, &query, folder, keyword_mode)
}

// Tantivy's quoted-phrase syntax needs an embedded `"` escaped, or it would
// terminate the phrase early instead of being treated as a literal
// character.
fn phrase_query(raw: &str) -> String {
    format!("\"{}\"", raw.replace('"', "\\\""))
}

// Keyword mode: every whitespace-separated word must appear *somewhere* in
// the content, in any order — mirrors search.rs's build_keyword_match for
// the exact same reason. Each word gets quoted individually (still a
// literal, not free-form query syntax — see phrase_query's own doc comment)
// and the words are ANDed together explicitly, rather than relying on
// Tantivy's QueryParser default-conjunction setting: this way a raw word
// containing something that looks like query syntax (a colon, a paren)
// still can't reach the parser unescaped.
fn keyword_query(raw: &str) -> String {
    raw.split_whitespace().map(phrase_query).collect::<Vec<_>>().join(" AND ")
}

// Plain function, no Tauri State wrapper — kept separate from the command
// above so the actual search logic is directly callable from tests,
// mirroring search.rs's build_query/run_query split from its own
// #[tauri::command] search_files.
fn run_content_query(
    index: &Index,
    schema: &ContentSchema,
    conn: &Connection,
    query: &str,
    folder: Option<String>,
    keyword_mode: bool,
) -> Result<Vec<ContentSearchResult>, String> {
    let reader = index.reader().map_err(|e| e.to_string())?;
    let searcher = reader.searcher();
    let parser = QueryParser::for_index(index, vec![schema.content]);
    // Phrase mode wraps the whole query as a quoted phrase, not parsed as
    // free-form query syntax: this is a "find this text" search, not a
    // query language. Tantivy's default QueryParser splits unquoted input
    // on whitespace and matches each word independently (any-of,
    // score-ranked) — searching "am a file" would then match a document
    // containing "am", "a", or "file" *anywhere*, not that exact run of
    // words together. A phrase query requires the terms adjacent, in order,
    // matching the same "shouldn't break" contiguous substring guarantee
    // filename search already gets from its own quoted FTS5 MATCH phrase
    // (see search.rs's fts_phrase()). Keyword mode is the explicit opt-in
    // for the opposite: all the words, any order, not necessarily adjacent.
    let query_text = if keyword_mode { keyword_query(query) } else { phrase_query(query) };
    let parsed = parser.parse_query(&query_text).map_err(|e| e.to_string())?;

    let overfetch = if folder.is_some() { RESULT_LIMIT * OVERFETCH_FACTOR } else { RESULT_LIMIT };
    let top_docs =
        searcher.search(&parsed, &TopDocs::with_limit(overfetch).order_by_score()).map_err(|e| e.to_string())?;

    let mut snippet_gen = SnippetGenerator::create(&searcher, &parsed, schema.content).map_err(|e| e.to_string())?;
    snippet_gen.set_max_num_chars(160);

    let folder_prefix = folder.map(|f| if f.ends_with('\\') { f } else { format!("{f}\\") });

    let mut results = Vec::new();
    for (_score, addr) in top_docs {
        if results.len() >= RESULT_LIMIT {
            break;
        }
        let doc: TantivyDocument = searcher.doc(addr).map_err(|e| e.to_string())?;
        let Some(path_value) = doc.get_first(schema.path).and_then(|v| v.as_str()) else {
            continue;
        };
        let path_value = path_value.to_string();

        if let Some(prefix) = &folder_prefix {
            if !path_value.starts_with(prefix.as_str()) {
                continue;
            }
        }

        let Some((name, is_dir, size, modified_ms)) = lookup_metadata(conn, &path_value) else {
            continue;
        };

        let snippet = snippet_gen.snippet_from_doc(&doc);
        let fragment = snippet.fragment();
        results.push(ContentSearchResult {
            path: path_value,
            name,
            is_dir,
            size,
            modified_ms,
            snippet: fragment.to_string(),
            highlight_ranges: byte_ranges_to_utf16(fragment, snippet.highlighted()),
        });
    }
    Ok(results)
}

// Tantivy's Snippet::highlighted() ranges are *byte* offsets into the UTF-8
// fragment — but the frontend is JavaScript, which indexes strings in UTF-16
// code units. Those coincide for ASCII text but diverge for anything else
// (accented characters, non-Latin scripts, emoji), which would silently
// mis-highlight or crash on a substring slice at a non-character boundary.
// Converting here means the frontend can just slice its string directly with
// no encoding awareness of its own.
fn byte_ranges_to_utf16(text: &str, ranges: &[std::ops::Range<usize>]) -> Vec<(usize, usize)> {
    let mut byte_to_utf16 = std::collections::HashMap::with_capacity(text.len() + 1);
    let mut utf16_offset = 0usize;
    for (byte_offset, ch) in text.char_indices() {
        byte_to_utf16.insert(byte_offset, utf16_offset);
        utf16_offset += ch.len_utf16();
    }
    byte_to_utf16.insert(text.len(), utf16_offset);

    ranges
        .iter()
        .filter_map(|r| Some((*byte_to_utf16.get(&r.start)?, *byte_to_utf16.get(&r.end)?)))
        .collect()
}

fn lookup_metadata(conn: &Connection, path: &str) -> Option<(String, bool, u64, u64)> {
    conn.query_row("SELECT name, is_dir, size, modified_ms FROM files WHERE path = ?1", params![path], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0, row.get::<_, i64>(2)? as u64, row.get::<_, i64>(3)? as u64))
    })
    .ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;

    #[test]
    fn run_content_query_joins_metadata_and_respects_folder_scope() {
        let dir = std::env::temp_dir().join(format!("schlag_test_run_content_query_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let (index, schema) = open_index(&dir).unwrap();
        let mut writer = index.writer(15_000_000).unwrap();
        index_path(&writer, &schema, "C:\\Docs\\a.txt", "the quick brown fox", 100).unwrap();
        index_path(&writer, &schema, "C:\\Other\\b.txt", "a quick unrelated fox", 200).unwrap();
        writer.commit().unwrap();

        let db_path = std::env::temp_dir().join(format!("schlag_test_run_content_query_{}.sqlite", std::process::id()));
        let _ = std::fs::remove_file(&db_path);
        let mut conn = database::open(&db_path).unwrap();
        database::upsert_batch(
            &mut conn,
            &[
                database::FileRow {
                    path: "C:\\Docs\\a.txt".into(),
                    name: "a.txt".into(),
                    extension: Some("txt".into()),
                    is_dir: false,
                    size: 10,
                    modified_ms: 100,
                },
                database::FileRow {
                    path: "C:\\Other\\b.txt".into(),
                    name: "b.txt".into(),
                    extension: Some("txt".into()),
                    is_dir: false,
                    size: 10,
                    modified_ms: 200,
                },
            ],
        )
        .unwrap();

        let all = run_content_query(&index, &schema, &conn, "quick", None, false).unwrap();
        assert_eq!(all.len(), 2, "unscoped query should match both indexed documents");

        let scoped = run_content_query(&index, &schema, &conn, "quick", Some("C:\\Docs".to_string()), false).unwrap();
        assert_eq!(scoped.len(), 1, "folder-scoped query should exclude matches outside the folder");
        assert_eq!(scoped[0].path, "C:\\Docs\\a.txt");
        assert_eq!(scoped[0].name, "a.txt");
        assert_eq!(scoped[0].size, 10);

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(&db_path);
    }

    #[test]
    fn run_content_query_treats_the_query_as_a_contiguous_phrase_not_separate_words() {
        let dir = std::env::temp_dir().join(format!("schlag_test_content_phrase_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let (index, schema) = open_index(&dir).unwrap();
        let mut writer = index.writer(15_000_000).unwrap();
        // Contains "am a file" verbatim.
        index_path(&writer, &schema, "C:\\Docs\\contiguous.txt", "I am a file called report", 100).unwrap();
        // Contains the words "am", "a", "file" — just never in that order, together.
        index_path(&writer, &schema, "C:\\Docs\\scattered.txt", "a file was here, I am not that", 200).unwrap();
        writer.commit().unwrap();

        let db_path = std::env::temp_dir().join(format!("schlag_test_content_phrase_{}.sqlite", std::process::id()));
        let _ = std::fs::remove_file(&db_path);
        let mut conn = database::open(&db_path).unwrap();
        database::upsert_batch(
            &mut conn,
            &[
                database::FileRow {
                    path: "C:\\Docs\\contiguous.txt".into(),
                    name: "contiguous.txt".into(),
                    extension: Some("txt".into()),
                    is_dir: false,
                    size: 10,
                    modified_ms: 100,
                },
                database::FileRow {
                    path: "C:\\Docs\\scattered.txt".into(),
                    name: "scattered.txt".into(),
                    extension: Some("txt".into()),
                    is_dir: false,
                    size: 10,
                    modified_ms: 200,
                },
            ],
        )
        .unwrap();

        let results = run_content_query(&index, &schema, &conn, "am a file", None, false).unwrap();
        assert_eq!(results.len(), 1, "only the document containing the exact phrase should match");
        assert_eq!(results[0].path, "C:\\Docs\\contiguous.txt");

        // Keyword mode: both documents contain "am", "a", and "file" somewhere,
        // regardless of order/contiguity — unlike phrase mode above.
        let mut keyword_results = run_content_query(&index, &schema, &conn, "am a file", None, true).unwrap();
        keyword_results.sort_by(|a, b| a.path.cmp(&b.path));
        assert_eq!(
            keyword_results.iter().map(|r| r.path.as_str()).collect::<Vec<_>>(),
            vec!["C:\\Docs\\contiguous.txt", "C:\\Docs\\scattered.txt"],
            "keyword mode should match both documents since each contains all three words"
        );

        // A document missing one of the words should not match keyword mode either.
        let partial = run_content_query(&index, &schema, &conn, "am a nonexistentword", None, true).unwrap();
        assert!(partial.is_empty(), "keyword mode must not match when only a subset of words is present");

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(&db_path);
    }

    #[test]
    fn byte_ranges_to_utf16_accounts_for_multibyte_characters() {
        // "café " is 6 bytes (é is 2 bytes in UTF-8) but 5 UTF-16 code units.
        // The highlighted word "search" starts right after it.
        let text = "café search";
        #[allow(clippy::single_range_in_vec_init)] // one literal byte range is the actual test fixture, not a full-range shorthand
        let byte_ranges = [6..12];
        let utf16_ranges = byte_ranges_to_utf16(text, &byte_ranges);
        assert_eq!(utf16_ranges, vec![(5, 11)], "byte offset 6 should map to UTF-16 offset 5, one less due to é");

        // Sanity check against what JS-style UTF-16 slicing would actually see.
        let utf16_units: Vec<u16> = text.encode_utf16().collect();
        let highlighted: String = String::from_utf16(&utf16_units[5..11]).unwrap();
        assert_eq!(highlighted, "search");
    }
    use std::io::Write;

    #[test]
    fn is_extractable_matches_supported_extensions_case_insensitively() {
        for ext in [
            "txt", "TXT", "md", "markdown", "pdf", "docx", "xlsx", "pptx", "PDF", "rs", "py", "TS", "json", "html",
        ] {
            assert!(is_extractable(ext), "{ext} should be extractable");
        }
        // Legacy binary Office formats are a deliberate exclusion, not an
        // oversight — see EXTRACTABLE_EXTENSIONS' own comment on why.
        for ext in ["exe", "png", "zip", "doc", "xls", "ppt", ""] {
            assert!(!is_extractable(ext), "{ext} should not be extractable");
        }
    }

    #[test]
    fn extract_text_reads_code_files_as_plain_text() {
        let path = std::env::temp_dir().join(format!("schlag_test_content_code_{}.rs", std::process::id()));
        std::fs::write(&path, b"fn zebraquokka() { println!(\"hi\"); }").unwrap();

        let text = extract_text(&path).unwrap();
        assert!(text.contains("zebraquokka"));

        let _ = std::fs::remove_file(&path);
    }

    // Builds a zip in-memory (no checked-in binary fixtures) shaped like a
    // minimal OOXML part set.
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
    fn extract_docx_text_pulls_visible_text_from_document_xml() {
        let xml = r#"<?xml version="1.0"?><w:document xmlns:w="ns"><w:body><w:p><w:r><w:t>Hello docx world</w:t></w:r></w:p></w:body></w:document>"#;
        let zip_bytes = make_zip(&[("word/document.xml", xml)]);
        let path = std::env::temp_dir().join("schlag_test_content_docx.docx");
        std::fs::write(&path, &zip_bytes).unwrap();

        let text = extract_docx_text(&path).unwrap();
        assert!(text.contains("Hello docx world"));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn extract_pptx_text_concatenates_slides_in_numeric_not_lexicographic_order() {
        let slide = |text: &str| format!(r#"<p:sld xmlns:a="ns" xmlns:p="ns"><a:t>{text}</a:t></p:sld>"#);
        // Written out of order, and slide10 would sort before slide2
        // lexicographically — proves slide_number()'s numeric sort matters.
        let zip_bytes = make_zip(&[
            ("ppt/slides/slide10.xml", &slide("Tenth slide")),
            ("ppt/slides/slide2.xml", &slide("Second slide")),
            ("ppt/slides/slide1.xml", &slide("First slide")),
        ]);
        let path = std::env::temp_dir().join("schlag_test_content_pptx.pptx");
        std::fs::write(&path, &zip_bytes).unwrap();

        let text = extract_pptx_text(&path).unwrap();
        let first = text.find("First slide").unwrap();
        let second = text.find("Second slide").unwrap();
        let tenth = text.find("Tenth slide").unwrap();
        assert!(first < second && second < tenth, "slides should be ordered 1, 2, 10 — not 1, 10, 2");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn index_path_upsert_is_idempotent_and_remove_path_drops_it() {
        let dir = std::env::temp_dir().join(format!("schlag_test_content_tantivy_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let (index, schema) = open_index(&dir).unwrap();
        let mut writer = index.writer(15_000_000).unwrap();

        index_path(&writer, &schema, "C:\\a.txt", "first version of the text", 100).unwrap();
        index_path(&writer, &schema, "C:\\a.txt", "second version of the text", 200).unwrap();
        writer.commit().unwrap();

        let reader = index.reader().unwrap();
        let searcher = reader.searcher();
        let parser = QueryParser::for_index(&index, vec![schema.content]);

        let second_hits = searcher
            .search(&parser.parse_query("second").unwrap(), &TopDocs::with_limit(10).order_by_score())
            .unwrap();
        assert_eq!(second_hits.len(), 1, "re-indexing the same path should replace, not duplicate, the doc");

        let first_hits = searcher
            .search(&parser.parse_query("first").unwrap(), &TopDocs::with_limit(10).order_by_score())
            .unwrap();
        assert_eq!(first_hits.len(), 0, "the old version's text should no longer be searchable");

        remove_path(&writer, &schema, "C:\\a.txt");
        writer.commit().unwrap();
        reader.reload().unwrap();
        let searcher = reader.searcher();
        let after_remove = searcher
            .search(&parser.parse_query("second").unwrap(), &TopDocs::with_limit(10).order_by_score())
            .unwrap();
        assert_eq!(after_remove.len(), 0, "removed path should no longer be searchable");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
