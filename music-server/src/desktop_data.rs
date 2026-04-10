use std::env;
use std::path::PathBuf;

use anyhow::{anyhow, Context};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlaylistRecord {
    pub id: i64,
    pub name: String,
    pub track_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub track_paths: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecentSearchRecord {
    pub query: String,
    pub title: String,
    pub subtitle: String,
    pub cover: Option<String>,
    pub kind: String,
    pub entity_key: String,
    pub artist_name: Option<String>,
    pub track_path: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConnectCommandRecord {
    pub id: i64,
    pub command: String,
    pub payload: serde_json::Value,
    pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DesktopSessionRecord {
    pub session: Option<serde_json::Value>,
    pub updated_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeviceSessionRecord {
    pub device: String,
    pub session: serde_json::Value,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConnectStateRecord {
    pub active_device: Option<String>,
    pub desktop: Option<DeviceSessionRecord>,
    pub mobile: Option<DeviceSessionRecord>,
}

pub fn list_playlists() -> anyhow::Result<Vec<PlaylistRecord>> {
    let conn = open_desktop_db()?;
    let mut stmt = conn.prepare(
        r#"
        SELECT p.id, p.name, p.created_at, p.updated_at, COUNT(pt.track_path) as track_count
        FROM playlists p
        LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
        GROUP BY p.id, p.name, p.created_at, p.updated_at
        ORDER BY p.updated_at DESC, p.id DESC
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, i64>(4)?,
        ))
    })?;

    let mut playlists = Vec::new();
    for row in rows {
        let (id, name, created_at, updated_at, track_count) = row?;
        playlists.push(PlaylistRecord {
            id,
            name,
            track_count,
            created_at,
            updated_at,
            track_paths: load_playlist_track_paths(&conn, id)?,
        });
    }

    Ok(playlists)
}

pub fn get_app_session() -> anyhow::Result<DesktopSessionRecord> {
    let conn = open_desktop_db()?;
    ensure_connect_tables(&conn)?;

    let row = conn
        .query_row(
            "SELECT payload, updated_at FROM app_session WHERE id = 1",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .ok();

    let Some((payload, updated_at)) = row else {
        return Ok(DesktopSessionRecord {
            session: None,
            updated_at: None,
        });
    };

    let session = serde_json::from_str(&payload)
        .with_context(|| "No se pudo parsear la sesion del desktop")?;

    Ok(DesktopSessionRecord {
        session: Some(session),
        updated_at: Some(updated_at),
    })
}

pub fn set_app_session(session: &serde_json::Value) -> anyhow::Result<()> {
    let conn = open_desktop_db()?;
    ensure_connect_tables(&conn)?;

    let payload = serde_json::to_string(session)?;
    conn.execute(
        r#"
        INSERT INTO app_session (id, payload, updated_at)
        VALUES (1, ?1, strftime('%s','now'))
        ON CONFLICT(id) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
        "#,
        params![payload],
    )?;

    Ok(())
}

pub fn set_device_session(
    device: &str,
    session: &serde_json::Value,
    make_active: bool,
) -> anyhow::Result<()> {
    let conn = open_desktop_db()?;
    ensure_connect_tables(&conn)?;

    let normalized_device = normalize_device(device)?;
    let payload = serde_json::to_string(session)?;

    conn.execute(
        r#"
        INSERT INTO connect_devices (device, payload, updated_at)
        VALUES (?1, ?2, strftime('%s','now'))
        ON CONFLICT(device) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
        "#,
        params![normalized_device, payload],
    )?;

    if make_active {
        set_active_device_in_conn(&conn, normalized_device)?;
    }

    Ok(())
}

pub fn set_active_device(device: &str) -> anyhow::Result<()> {
    let conn = open_desktop_db()?;
    ensure_connect_tables(&conn)?;
    let normalized_device = normalize_device(device)?;
    set_active_device_in_conn(&conn, normalized_device)
}

pub fn get_connect_state() -> anyhow::Result<ConnectStateRecord> {
    let conn = open_desktop_db()?;
    ensure_connect_tables(&conn)?;

    let active_device = conn
        .query_row("SELECT device FROM connect_active WHERE id = 1", [], |row| {
            row.get::<_, String>(0)
        })
        .ok();

    Ok(ConnectStateRecord {
        active_device,
        desktop: get_device_session_from_conn(&conn, "desktop")?,
        mobile: get_device_session_from_conn(&conn, "mobile")?,
    })
}

pub fn enqueue_connect_command(
    command: &str,
    payload: serde_json::Value,
) -> anyhow::Result<ConnectCommandRecord> {
    let conn = open_desktop_db()?;
    ensure_connect_tables(&conn)?;

    let payload_json = serde_json::to_string(&payload)?;
    conn.execute(
        r#"
        INSERT INTO connect_commands (command, payload, status, created_at)
        VALUES (?1, ?2, 'pending', strftime('%s','now'))
        "#,
        params![command, payload_json],
    )?;

    let id = conn.last_insert_rowid();
    let created_at = conn.query_row(
        "SELECT created_at FROM connect_commands WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;

    Ok(ConnectCommandRecord {
        id,
        command: command.to_string(),
        payload,
        created_at,
    })
}

pub fn create_playlist(name: &str) -> anyhow::Result<PlaylistRecord> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
      return Err(anyhow!("La playlist necesita un nombre"));
    }

    let conn = open_desktop_db()?;
    conn.execute(
        r#"
        INSERT INTO playlists (name, created_at, updated_at)
        VALUES (?1, strftime('%s','now'), strftime('%s','now'))
        "#,
        params![trimmed],
    )?;

    let id = conn.last_insert_rowid();
    Ok(PlaylistRecord {
        id,
        name: trimmed.to_string(),
        track_count: 0,
        created_at: 0,
        updated_at: 0,
        track_paths: Vec::new(),
    })
}

pub fn rename_playlist(playlist_id: i64, name: &str) -> anyhow::Result<()> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("La playlist necesita un nombre"));
    }

    let conn = open_desktop_db()?;
    let updated = conn.execute(
        r#"
        UPDATE playlists
        SET name = ?1, updated_at = strftime('%s','now')
        WHERE id = ?2
        "#,
        params![trimmed, playlist_id],
    )?;

    if updated == 0 {
        return Err(anyhow!("La playlist ya no existe"));
    }

    Ok(())
}

pub fn delete_playlist(playlist_id: i64) -> anyhow::Result<()> {
    let conn = open_desktop_db()?;
    let deleted = conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])?;

    if deleted == 0 {
        return Err(anyhow!("La playlist ya no existe"));
    }

    Ok(())
}

pub fn add_track_to_playlist(
    playlist_id: i64,
    track_path: &str,
    allow_duplicate: bool,
) -> anyhow::Result<()> {
    let mut conn = open_desktop_db()?;
    let tx = conn.transaction()?;

    let exists: Option<i64> = tx
        .query_row(
            "SELECT 1 FROM playlists WHERE id = ?1 LIMIT 1",
            params![playlist_id],
            |row| row.get(0),
        )
        .ok();

    if exists.is_none() {
        return Err(anyhow!("La playlist ya no existe"));
    }

    let already_exists: Option<i64> = tx
        .query_row(
            r#"
            SELECT 1
            FROM playlist_tracks
            WHERE playlist_id = ?1 AND track_path = ?2
            LIMIT 1
            "#,
            params![playlist_id, track_path],
            |row| row.get(0),
        )
        .ok();

    if already_exists.is_some() && !allow_duplicate {
        tx.execute(
            "UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?1",
            params![playlist_id],
        )?;
        tx.commit()?;
        return Ok(());
    }

    let next_position: i64 = tx.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
        params![playlist_id],
        |row| row.get(0),
    )?;

    tx.execute(
        r#"
        INSERT INTO playlist_tracks (playlist_id, track_path, position, added_at)
        VALUES (?1, ?2, ?3, strftime('%s','now'))
        "#,
        params![playlist_id, track_path, next_position],
    )?;

    tx.execute(
        "UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?1",
        params![playlist_id],
    )?;

    tx.commit()?;
    Ok(())
}

pub fn remove_track_from_playlist(playlist_id: i64, track_path: &str) -> anyhow::Result<()> {
    let mut conn = open_desktop_db()?;
    let tx = conn.transaction()?;

    let removed_track: Option<(i64, i64)> = tx
        .query_row(
            r#"
            SELECT id, position
            FROM playlist_tracks
            WHERE playlist_id = ?1 AND track_path = ?2
            ORDER BY position ASC, added_at ASC, id ASC
            LIMIT 1
            "#,
            params![playlist_id, track_path],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    let Some((removed_track_id, removed_position)) = removed_track else {
        tx.commit()?;
        return Ok(());
    };

    tx.execute("DELETE FROM playlist_tracks WHERE id = ?1", params![removed_track_id])?;
    tx.execute(
        "UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?1",
        params![playlist_id],
    )?;
    tx.execute(
        r#"
        UPDATE playlist_tracks
        SET position = position - 1
        WHERE playlist_id = ?1 AND position > ?2
        "#,
        params![playlist_id, removed_position],
    )?;

    tx.commit()?;
    Ok(())
}

pub fn get_recent_searches() -> anyhow::Result<Vec<RecentSearchRecord>> {
    let conn = open_desktop_db()?;
    let mut stmt = conn.prepare(
        r#"
        SELECT query, title, subtitle, cover, kind, entity_key, artist_name, track_path
        FROM recent_global_searches
        ORDER BY position ASC
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(RecentSearchRecord {
            query: row.get(0)?,
            title: row.get(1)?,
            subtitle: row.get(2)?,
            cover: row.get(3)?,
            kind: row.get(4)?,
            entity_key: row.get(5)?,
            artist_name: row.get(6)?,
            track_path: row.get(7)?,
        })
    })?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }

    Ok(items)
}

pub fn set_recent_searches(items: &[RecentSearchRecord]) -> anyhow::Result<()> {
    let mut conn = open_desktop_db()?;
    let tx = conn.transaction()?;

    tx.execute("DELETE FROM recent_global_searches", [])?;

    for (index, item) in items.iter().take(6).enumerate() {
        tx.execute(
            r#"
            INSERT INTO recent_global_searches (
                position, query, title, subtitle, cover, kind, entity_key, artist_name, track_path
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                index as i64,
                item.query,
                item.title,
                item.subtitle,
                item.cover,
                item.kind,
                item.entity_key,
                item.artist_name,
                item.track_path,
            ],
        )?;
    }

    tx.commit()?;
    Ok(())
}

fn load_playlist_track_paths(conn: &Connection, playlist_id: i64) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT track_path
        FROM playlist_tracks
        WHERE playlist_id = ?1
        ORDER BY position ASC, added_at ASC
        "#,
    )?;

    let rows = stmt.query_map(params![playlist_id], |row| row.get::<_, String>(0))?;
    let mut track_paths = Vec::new();
    for row in rows {
        track_paths.push(row?);
    }
    Ok(track_paths)
}

fn open_desktop_db() -> anyhow::Result<Connection> {
    let db_path = desktop_db_path()?;
    let conn = Connection::open(&db_path)
        .with_context(|| format!("No se pudo abrir {}", db_path.display()))?;
    ensure_connect_tables(&conn)?;
    Ok(conn)
}

fn desktop_db_path() -> anyhow::Result<PathBuf> {
    let app_data = env::var_os("APPDATA")
        .map(PathBuf::from)
        .context("APPDATA no está disponible")?;
    Ok(app_data.join("com.tauri.dev").join("library_cache.db"))
}

fn ensure_connect_tables(conn: &Connection) -> anyhow::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS app_session (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );

        CREATE TABLE IF NOT EXISTS connect_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command TEXT NOT NULL,
            payload TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            handled_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_connect_commands_status_created
        ON connect_commands(status, created_at, id);

        CREATE TABLE IF NOT EXISTS connect_devices (
            device TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );

        CREATE TABLE IF NOT EXISTS connect_active (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            device TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );
        "#,
    )?;

    Ok(())
}

fn normalize_device(device: &str) -> anyhow::Result<&'static str> {
    match device.trim() {
        "desktop" => Ok("desktop"),
        "mobile" => Ok("mobile"),
        _ => Err(anyhow!("Dispositivo no soportado")),
    }
}

fn set_active_device_in_conn(conn: &Connection, device: &'static str) -> anyhow::Result<()> {
    conn.execute(
        r#"
        INSERT INTO connect_active (id, device, updated_at)
        VALUES (1, ?1, strftime('%s','now'))
        ON CONFLICT(id) DO UPDATE SET
            device = excluded.device,
            updated_at = excluded.updated_at
        "#,
        params![device],
    )?;

    Ok(())
}

fn get_device_session_from_conn(
    conn: &Connection,
    device: &str,
) -> anyhow::Result<Option<DeviceSessionRecord>> {
    let row = conn
        .query_row(
            "SELECT payload, updated_at FROM connect_devices WHERE device = ?1",
            params![device],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .ok();

    let Some((payload, updated_at)) = row else {
        return Ok(None);
    };

    Ok(Some(DeviceSessionRecord {
        device: device.to_string(),
        session: serde_json::from_str(&payload)?,
        updated_at,
    }))
}
