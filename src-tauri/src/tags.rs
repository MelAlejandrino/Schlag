use rusqlite::Connection;
use std::sync::Mutex;

#[derive(serde::Serialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[tauri::command]
pub fn get_tags(conn: tauri::State<Mutex<Connection>>) -> Result<Vec<Tag>, String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, color FROM tags ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_tag(conn: tauri::State<Mutex<Connection>>, name: String, color: String) -> Result<Tag, String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO tags (name, color) VALUES (?1, ?2)",
        rusqlite::params![name, color],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Tag {
        id,
        name,
        color,
    })
}

#[tauri::command]
pub fn delete_tag(conn: tauri::State<Mutex<Connection>>, id: i64) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tags WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_file_tag(conn: tauri::State<Mutex<Connection>>, path: String, tag_id: i64) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO file_tags (file_path, tag_id) VALUES (?1, ?2)",
        rusqlite::params![path, tag_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_file_tag(conn: tauri::State<Mutex<Connection>>, path: String, tag_id: i64) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM file_tags WHERE file_path = ?1 AND tag_id = ?2",
        rusqlite::params![path, tag_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct FileTag {
    pub file_path: String,
    pub tag: Tag,
}

// Every file→tag association at once. Tagged files are a sparse, hand-picked
// set, so the whole table is small — loading it once (at startup) is cheaper
// and simpler than re-querying per folder on every navigation, and sidesteps
// the bound-variable limit an `IN (?,?,…)` batch would hit on a huge folder.
// ponytail: fine while tags are manual; revisit if tagging ever goes bulk/auto.
#[tauri::command]
pub fn get_all_file_tags(conn: tauri::State<Mutex<Connection>>) -> Result<Vec<FileTag>, String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT ft.file_path, t.id, t.name, t.color FROM file_tags ft JOIN tags t ON t.id = ft.tag_id ORDER BY ft.file_path, t.name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(FileTag {
                file_path: row.get(0)?,
                tag: Tag {
                    id: row.get(1)?,
                    name: row.get(2)?,
                    color: row.get(3)?,
                },
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
