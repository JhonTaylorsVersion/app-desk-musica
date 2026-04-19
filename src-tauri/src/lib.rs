use base64::{engine::general_purpose, Engine as _};
use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::prelude::Accessor;
use lofty::read_from_path;
use lofty::tag::{ItemKey, Tag, TagType};
use serde::{Deserialize, Serialize};
// Asegúrate de tener esto arriba en tu archivo
use rusqlite::{params, Connection};
use std::cmp::Ordering as CmpOrdering;
use std::fs;
use std::hash::{Hash, Hasher}; // <-- NUEVO: Para crear nombres únicos de carátulas
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::process::Stdio;
use std::thread;
use std::time::Duration;
use std::time::Instant;
use std::time::UNIX_EPOCH;
use tauri::Manager;

use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::State;

// === NUEVAS DEPENDENCIAS PARA BIBLIOTECA ===
use notify::event::ModifyKind;
use notify::{EventKind, RecursiveMode, Watcher};
use tauri::{webview::Color, AppHandle, Emitter};
use walkdir::WalkDir;

// === NUEVAS DEPENDENCIAS PRO ===
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use crossbeam_channel::{bounded, unbounded, Receiver, Sender};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};

use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

// ==========================================
// 1. ESTRUCTURAS DE METADATOS
// ==========================================

struct LibraryCacheState {
    db_path: PathBuf,
}

#[derive(Serialize, Clone)]
pub struct OutputDeviceInfo {
    device_name: String,
    sample_rate: u32,
    channels: u16,
    sample_format: String,
}

#[derive(Serialize, Clone)]
struct LibraryTrackMetadataLite {
    path: String,
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    duration_seconds: u64,
    duration_formatted: String,
    cover_path: Option<String>, // <-- NUEVO: Ruta física de la imagen
    track_number: Option<u32>,  // <-- NUEVO: Agregamos el número de pista
    spotify_id: Option<String>, // <-- NUEVO: ID de Spotify para sincronización
}

#[derive(Serialize, Clone)]
struct CoverArt {
    data_url: Option<String>,
    mime_type: Option<String>,
    description: Option<String>,
    picture_type: Option<String>,
}

#[derive(Serialize)]
pub struct PlaylistTrack {
    path: String,
    #[serde(rename = "fileName")]
    file_name: String,
    extension: String,
}

// NUEVO: Estado para mantener vivo el vigilante de carpetas
struct LibraryWatcherState {
    watcher: std::sync::Mutex<Option<notify::RecommendedWatcher>>,
}

struct SpotiFlacDownloadState {
    lock: tauri::async_runtime::Mutex<()>,
}

static SPOTIFLAC_BRIDGE_TRACE_ID: AtomicU64 = AtomicU64::new(1);
static SPOTIFLAC_DOWNLOADS_IN_FLIGHT: AtomicUsize = AtomicUsize::new(0);

#[derive(Serialize, Clone)]
struct AudioMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    album_artist: Option<String>,
    genre: Option<String>,
    composer: Option<String>,
    lyricist: Option<String>,
    comment: Option<String>,
    lyrics: Option<String>,        // Letras embebidas normales
    synced_lyrics: Option<String>, // NUEVO: Letras sincronizadas (.lrc)
    track_number: Option<String>,
    track_total: Option<String>,
    disc_number: Option<String>,
    disc_total: Option<String>,
    year: Option<String>,
    release_date: Option<String>,

    duration_seconds: Option<u64>,
    duration_formatted: Option<String>,
    channels: Option<u8>,
    sample_rate: Option<u32>,
    bit_depth: Option<u8>,
    audio_bitrate: Option<u32>,
    overall_bitrate: Option<u32>,

    cover_art: Option<CoverArt>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RecentSearchItem {
    query: String,
    title: String,
    subtitle: String,
    cover: Option<String>,
    kind: String,
    #[serde(default)]
    entity_key: String,
    #[serde(default)]
    artist_name: Option<String>,
    #[serde(default)]
    track_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PlaybackContextSnapshot {
    kind: String,
    label: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionQueueTrack {
    path: String,
    queue_id: i64,
    playback_context: PlaybackContextSnapshot,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionShuffleHistoryEntry {
    source: String,
    index: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ViewSnapshot {
    mode: String,
    artist: Option<String>,
    album: Option<String>,
    album_artist: Option<String>,
    #[serde(default)]
    playlist_id: Option<i64>,
    search: String,
    global_query: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PlaylistSummary {
    id: i64,
    name: String,
    track_count: i64,
    created_at: i64,
    updated_at: i64,
    track_paths: Vec<String>,
    spotify_url: Option<String>, 
    spotify_synced_ids: Option<String>, // <-- NUEVO: IDs ya conocidos (JSON)
    is_system: i32, // <-- NUEVO: 1 para playlist del sistema (ej: Tus Me Gusta)
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSessionSnapshot {
    current_track_path: Option<String>,
    current_source: String,
    current_queue_track_id: Option<i64>,
    current_playback_context: Option<PlaybackContextSnapshot>,
    current_time: f64,
    volume: f64,
    is_muted: bool,
    last_volume_before_mute: f64,
    loop_mode: String,
    is_shuffle_enabled: bool,
    was_playing: bool,
    queue: Vec<SessionQueueTrack>,
    queue_original_order_ids: Vec<i64>,
    queue_consumed_history: Vec<SessionQueueTrack>,
    shuffle_history: Vec<SessionShuffleHistoryEntry>,
    next_queue_id: i64,
    library_search: String,
    global_search: String,
    queue_search: String,
    is_queue_panel_open: bool,
    is_routes_manager_open: bool,
    #[serde(default)]
    device_name: Option<String>,
    #[serde(default)]
    output_device_name: Option<String>,
    pub current_view_snapshot: ViewSnapshot,
    #[serde(default)]
    pub asset_storage_mode: Option<String>,
    #[serde(default)]
    pub custom_canvas_path: Option<String>,
    #[serde(default)]
    pub custom_lyrics_path: Option<String>,
    #[serde(default)]
    pub custom_covers_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ConnectCommandRecord {
    id: i64,
    command: String,
    payload: serde_json::Value,
    created_at: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DeviceSessionRecord {
    device: String,
    session: serde_json::Value,
    updated_at: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ConnectStateRecord {
    active_device: Option<String>,
    desktop: Option<DeviceSessionRecord>,
    mobile: Option<DeviceSessionRecord>,
}

// ==========================================
// 2. NUEVO SISTEMA DE MENSAJES Y ESTADO
// ==========================================

// Este es el "idioma" con el que Tauri habla con el hilo de audio
pub enum AudioCommand {
    Play(String, f64), // Ruta y posición de inicio
    Pause,
    Resume,
    Stop,
    Seek(f64),      // Segundo exacto
    SetVolume(f32), // 0.0 a 100.0
}

struct AudioPlayerState {
    // Transmisor para enviar comandos al hilo de fondo
    tx: Sender<AudioCommand>,
    // Posición actual compartida (para que la UI la lea rapidísimo sin bloquear)
    current_position_secs: Arc<Mutex<f64>>,
}

// ==========================================
// 3. FUNCIONES DE AYUDA PARA METADATOS (Intactas)
// ==========================================

fn init_library_cache_db(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo obtener app_data_dir: {}", e))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("No se pudo crear app_data_dir: {}", e))?;

    let db_path = app_data_dir.join("library_cache.db");

    let conn = Connection::open(&db_path).map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS library_cache (
            path TEXT PRIMARY KEY,
            file_name TEXT NOT NULL,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            album TEXT NOT NULL,
            album_artist TEXT,
            duration_seconds INTEGER NOT NULL,
            duration_formatted TEXT NOT NULL,
            modified_at INTEGER NOT NULL,
            cover_path TEXT,
            track_number INTEGER -- <-- NUEVO CAMPO
        );

        CREATE TABLE IF NOT EXISTS music_directories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE
);

        CREATE TABLE IF NOT EXISTS recent_global_searches (
            position INTEGER PRIMARY KEY,
            query TEXT NOT NULL,
            title TEXT NOT NULL,
            subtitle TEXT NOT NULL,
            cover TEXT,
            kind TEXT NOT NULL,
            entity_key TEXT NOT NULL,
            artist_name TEXT,
            track_path TEXT
        );

        CREATE TABLE IF NOT EXISTS app_session (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );

        CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            track_path TEXT NOT NULL,
            position INTEGER NOT NULL,
            added_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_library_cache_modified_at
        ON library_cache(modified_at);

        CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_position
        ON playlist_tracks(playlist_id, position);

        CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_track_path
        ON playlist_tracks(playlist_id, track_path);

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
    )
    .map_err(|e| format!("No se pudo crear tabla cache: {}", e))?;

    // Migraciones silenciosas
    let _ = conn.execute("ALTER TABLE library_cache ADD COLUMN album_artist TEXT", []);
    let _ = conn.execute("ALTER TABLE library_cache ADD COLUMN cover_path TEXT", []);
    // <-- NUEVA MIGRACIÓN PARA ACTUALIZAR TU BD EXISTENTE
    let _ = conn.execute(
        "ALTER TABLE library_cache ADD COLUMN track_number INTEGER",
        [],
    );
    let _ = conn.execute("ALTER TABLE library_cache ADD COLUMN spotify_id TEXT", []);
    let _ = conn.execute("ALTER TABLE playlists ADD COLUMN spotify_url TEXT", []);
    let _ = conn.execute("ALTER TABLE playlists ADD COLUMN spotify_synced_ids TEXT", []);
    let _ = conn.execute("ALTER TABLE playlists ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0", []); // <-- NUEVO
    
    // DEDUPLICACIÓN: Asegurarnos de que solo exista UNA "Tus Me Gusta" y que sea de sistema
    // 1. Si existe una manual llamada "Tus Me Gusta", la promovemos a sistema
    let _ = conn.execute(
        "UPDATE playlists SET is_system = 1 WHERE (name = 'Tus Me Gusta' OR name = 'Tus Me Gusta ') AND is_system = 0",
        [],
    );

    // 2. LIMPIEZA DRÁSTICA: Borramos cualquier duplicado de sistema, quedándonos SOLO con el ID más bajo
    // Esto limpia las que se crearon por el error del bucle anterior.
    let _ = conn.execute(
        "DELETE FROM playlists WHERE is_system = 1 AND id NOT IN (SELECT id FROM playlists WHERE is_system = 1 ORDER BY id ASC LIMIT 1)",
        [],
    );

    // 3. CREACIÓN CONDICIONAL: Solo insertamos si NO existe absolutamente ninguna playlist de sistema
    let _ = conn.execute(
        "INSERT INTO playlists (name, is_system) SELECT 'Tus Me Gusta', 1 WHERE NOT EXISTS (SELECT 1 FROM playlists WHERE is_system = 1)",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE recent_global_searches ADD COLUMN artist_name TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE recent_global_searches ADD COLUMN track_path TEXT",
        [],
    );

    migrate_playlist_tracks_table(&conn)?;

    Ok(db_path)
}

fn migrate_playlist_tracks_table(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("PRAGMA table_info(playlist_tracks)")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(1)?, row.get::<_, i64>(5)?))
        })
        .map_err(|e| e.to_string())?;

    let mut has_id_column = false;
    let mut track_path_is_primary_key = false;

    for row in rows {
        let (name, primary_key_index) = row.map_err(|e| e.to_string())?;
        if name == "id" {
            has_id_column = true;
        }
        if name == "track_path" && primary_key_index > 0 {
            track_path_is_primary_key = true;
        }
    }

    if has_id_column && !track_path_is_primary_key {
        return Ok(());
    }

    conn.execute_batch(
        r#"
        BEGIN IMMEDIATE TRANSACTION;

        ALTER TABLE playlist_tracks RENAME TO playlist_tracks_legacy;

        CREATE TABLE playlist_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            track_path TEXT NOT NULL,
            position INTEGER NOT NULL,
            added_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
        );

        INSERT INTO playlist_tracks (playlist_id, track_path, position, added_at)
        SELECT playlist_id, track_path, position, added_at
        FROM playlist_tracks_legacy
        ORDER BY playlist_id ASC, position ASC, added_at ASC;

        DROP TABLE playlist_tracks_legacy;

        CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_position
        ON playlist_tracks(playlist_id, position);

        CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_track_path
        ON playlist_tracks(playlist_id, track_path);

        COMMIT;
        "#,
    )
    .map_err(|e| format!("No se pudo migrar playlist_tracks: {}", e))?;

    Ok(())
}

fn get_file_modified_at(path: &str) -> Result<i64, String> {
    let metadata = fs::metadata(path).map_err(|e| format!("metadata {}: {}", path, e))?;
    let modified = metadata
        .modified()
        .map_err(|e| format!("modified {}: {}", path, e))?;
    let secs = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("duration_since UNIX_EPOCH {}: {}", path, e))?
        .as_secs() as i64;

    Ok(secs)
}

fn read_light_metadata(path: &str, covers_dir: &Path) -> Result<LibraryTrackMetadataLite, String> {
    let tagged_file = read_from_path(path).map_err(|e| e.to_string())?;
    let tags = build_tag_list(&tagged_file);
    let properties = tagged_file.properties();
    let duration_seconds = properties.duration().as_secs();

    // NUEVO: Extracción de carátula a disco duro
    let mut cover_path = None;
    for tag in &tags {
        if let Some(pic) = tag
            .get_picture_type(PictureType::CoverFront)
            .or_else(|| tag.pictures().first())
        {
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            path.hash(&mut hasher);
            let hash_str = format!("{:x}", hasher.finish());

            let ext = if let Some(mime) = pic.mime_type() {
                let mime_str = format!("{:?}", mime).to_lowercase();
                if mime_str.contains("png") {
                    "png"
                } else {
                    "jpg"
                }
            } else {
                "jpg"
            };

            let img_name = format!("{}.{}", hash_str, ext);
            let img_path = covers_dir.join(&img_name);

            if !img_path.exists() {
                let _ = fs::write(&img_path, pic.data());
            }

            cover_path = Some(img_path.to_string_lossy().to_string());
            break;
        }
    }

    let fallback_name = Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Sin título")
        .to_string();

    let title = first_text(&tags, |tag| tag.title().map(|s| s.to_string()))
        .unwrap_or_else(|| fallback_name.clone());

    let artist = first_text(&tags, |tag| tag.artist().map(|s| s.to_string()))
        .unwrap_or_else(|| "Artista desconocido".to_string());

    let album = first_text(&tags, |tag| tag.album().map(|s| s.to_string()))
        .unwrap_or_else(|| "—".to_string());

    // NUEVO: Extraer Artista del Álbum
    let album_artist = first_text(&tags, |tag| {
        tag.get_string(ItemKey::AlbumArtist).map(|s| s.to_string())
    })
    .unwrap_or_else(|| artist.clone()); // Si no existe, usamos el artista de la pista como fallback

    // Lofty limpia automáticamente formatos tipo "22/22" y nos da el "22" en u32
    let track_number = tags.iter().find_map(|tag| tag.track());

    // NUEVO: Intentar extraer el ID de Spotify usando un campo seguro
    let spotify_id = tags.iter().find_map(|tag| {
        // Quitamos el '&' y usamos MusicBrainzTrackId como contenedor del ID
        tag.get_string(ItemKey::MusicBrainzTrackId)
            .map(|s| s.to_string())
    });

    Ok(LibraryTrackMetadataLite {
        path: path.to_string(),
        title,
        artist,
        album,
        album_artist,
        duration_seconds,
        duration_formatted: format_duration(duration_seconds),
        cover_path,
        track_number,
        spotify_id, // <-- SE AGREGA AQUÍ
    })
}

fn get_cached_track(
    conn: &Connection,
    path: &str,
) -> Result<Option<(LibraryTrackMetadataLite, i64)>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT path, title, artist, album, album_artist, duration_seconds, duration_formatted, modified_at, cover_path, track_number, spotify_id
            FROM library_cache
            WHERE path = ?1
            "#,
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query(params![path]).map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let item = LibraryTrackMetadataLite {
            path: row.get(0).map_err(|e| e.to_string())?,
            title: row.get(1).map_err(|e| e.to_string())?,
            artist: row.get(2).map_err(|e| e.to_string())?,
            album: row.get(3).map_err(|e| e.to_string())?,
            album_artist: row
                .get::<_, Option<String>>(4)
                .map_err(|e| e.to_string())?
                .unwrap_or_else(|| "Artista desconocido".to_string()),
            duration_seconds: row.get::<_, i64>(5).map_err(|e| e.to_string())? as u64,
            duration_formatted: row.get(6).map_err(|e| e.to_string())?,
            cover_path: row.get(8).map_err(|e| e.to_string())?,
            track_number: row.get::<_, Option<u32>>(9).unwrap_or(None),
            spotify_id: row.get::<_, Option<String>>(10).unwrap_or(None), // <-- NUEVO
        };

        let modified_at: i64 = row.get(7).map_err(|e| e.to_string())?;
        return Ok(Some((item, modified_at)));
    }

    Ok(None)
}

fn upsert_cached_track(
    conn: &Connection,
    path: &str,
    file_name: &str,
    data: &LibraryTrackMetadataLite,
    modified_at: i64,
) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT INTO library_cache (
            path, file_name, title, artist, album, album_artist, duration_seconds, duration_formatted, modified_at, cover_path, track_number, spotify_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(path) DO UPDATE SET
            file_name = excluded.file_name,
            title = excluded.title,
            artist = excluded.artist,
            album = excluded.album,
            album_artist = excluded.album_artist,
            duration_seconds = excluded.duration_seconds,
            duration_formatted = excluded.duration_formatted,
            modified_at = excluded.modified_at,
            cover_path = excluded.cover_path,
            track_number = excluded.track_number,
            spotify_id = excluded.spotify_id -- <-- NUEVO
        "#,
        params![
            path,
            file_name,
            data.title,
            data.artist,
            data.album,
            data.album_artist,
            data.duration_seconds as i64,
            data.duration_formatted,
            modified_at,
            data.cover_path,
            data.track_number,
            data.spotify_id // <-- NUEVO
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn cleanup_deleted_cache(conn: &Connection, valid_paths: &[String]) -> Result<(), String> {
    if valid_paths.is_empty() {
        conn.execute("DELETE FROM library_cache", [])
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let placeholders = (0..valid_paths.len())
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(",");

    let sql = format!(
        "DELETE FROM library_cache WHERE path NOT IN ({})",
        placeholders
    );

    let params_vec: Vec<&dyn rusqlite::ToSql> = valid_paths
        .iter()
        .map(|p| p as &dyn rusqlite::ToSql)
        .collect();

    conn.execute(&sql, params_vec.as_slice())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_music_directories(cache_state: State<'_, LibraryCacheState>) -> Result<Vec<String>, String> {
    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT path FROM music_directories ORDER BY id ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut directories = Vec::new();
    for row in rows {
        directories.push(row.map_err(|e| e.to_string())?);
    }

    Ok(directories)
}

#[tauri::command]
fn save_music_directories(
    directories: Vec<String>,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    let mut conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for dir in directories {
        tx.execute(
            "INSERT OR IGNORE INTO music_directories (path) VALUES (?1)",
            params![dir],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_music_directories(
    directories: Vec<String>,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    let mut conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM music_directories", [])
        .map_err(|e| e.to_string())?;

    for dir in directories {
        tx.execute(
            "INSERT INTO music_directories (path) VALUES (?1)",
            params![dir],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_recent_global_searches(
    cache_state: State<'_, LibraryCacheState>,
) -> Result<Vec<RecentSearchItem>, String> {
    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT query, title, subtitle, cover, kind, entity_key, artist_name
                 , track_path
            FROM recent_global_searches
            ORDER BY position ASC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(RecentSearchItem {
                query: row.get(0)?,
                title: row.get(1)?,
                subtitle: row.get(2)?,
                cover: row.get(3)?,
                kind: row.get(4)?,
                entity_key: row.get(5)?,
                artist_name: row.get(6)?,
                track_path: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    Ok(items)
}

#[tauri::command]
fn set_recent_global_searches(
    items: Vec<RecentSearchItem>,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    let mut conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM recent_global_searches", [])
        .map_err(|e| e.to_string())?;

    for (index, item) in items.into_iter().take(6).enumerate() {
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
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_app_session(
    cache_state: State<'_, LibraryCacheState>,
) -> Result<Option<AppSessionSnapshot>, String> {
    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let payload: Option<String> = conn
        .query_row("SELECT payload FROM app_session WHERE id = 1", [], |row| {
            row.get(0)
        })
        .ok();

    match payload {
        Some(json) => serde_json::from_str(&json)
            .map(Some)
            .map_err(|e| format!("No se pudo parsear la sesion guardada: {}", e)),
        None => Ok(None),
    }
}

#[tauri::command]
fn set_app_session(
    session: AppSessionSnapshot,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let payload = serde_json::to_string(&session)
        .map_err(|e| format!("No se pudo serializar la sesion: {}", e))?;
    let session_value = serde_json::to_value(&session)
        .map_err(|e| format!("No se pudo serializar la sesion: {}", e))?;

    conn.execute(
        r#"
        INSERT INTO app_session (id, payload, updated_at)
        VALUES (1, ?1, strftime('%s','now'))
        ON CONFLICT(id) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
        "#,
        params![payload],
    )
    .map_err(|e| e.to_string())?;

    upsert_connect_device_session(&conn, "desktop", &session_value, session.was_playing)?;

    Ok(())
}

fn upsert_connect_device_session(
    conn: &Connection,
    device: &str,
    session: &serde_json::Value,
    make_active: bool,
) -> Result<(), String> {
    let payload = serde_json::to_string(session)
        .map_err(|e| format!("No se pudo serializar la sesion connect: {}", e))?;

    conn.execute(
        r#"
        INSERT INTO connect_devices (device, payload, updated_at)
        VALUES (?1, ?2, strftime('%s','now'))
        ON CONFLICT(device) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
        "#,
        params![device, payload],
    )
    .map_err(|e| e.to_string())?;

    if make_active {
        set_active_connect_device_in_conn(conn, device)?;
    }

    Ok(())
}

fn set_active_connect_device_in_conn(conn: &Connection, device: &str) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT INTO connect_active (id, device, updated_at)
        VALUES (1, ?1, strftime('%s','now'))
        ON CONFLICT(id) DO UPDATE SET
            device = excluded.device,
            updated_at = excluded.updated_at
        "#,
        params![device],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn get_connect_device_session(
    conn: &Connection,
    device: &str,
) -> Result<Option<DeviceSessionRecord>, String> {
    let row: Option<(String, i64)> = conn
        .query_row(
            "SELECT payload, updated_at FROM connect_devices WHERE device = ?1",
            params![device],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    let Some((payload, updated_at)) = row else {
        return Ok(None);
    };

    let session = serde_json::from_str(&payload)
        .map_err(|e| format!("No se pudo parsear la sesion connect: {}", e))?;

    Ok(Some(DeviceSessionRecord {
        device: device.to_string(),
        session,
        updated_at,
    }))
}

#[tauri::command]
fn get_desktop_connect_state(
    cache_state: State<'_, LibraryCacheState>,
) -> Result<ConnectStateRecord, String> {
    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let active_device = conn
        .query_row(
            "SELECT device FROM connect_active WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok();

    Ok(ConnectStateRecord {
        active_device,
        desktop: get_connect_device_session(&conn, "desktop")?,
        mobile: get_connect_device_session(&conn, "mobile")?,
    })
}

#[tauri::command]
fn set_desktop_connect_active_device(
    device: String,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    if device != "desktop" && device != "mobile" {
        return Err("Dispositivo no soportado".to_string());
    }

    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;
    set_active_connect_device_in_conn(&conn, &device)
}

#[tauri::command]
fn consume_connect_commands(
    cache_state: State<'_, LibraryCacheState>,
) -> Result<Vec<ConnectCommandRecord>, String> {
    let mut conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let commands = {
        let mut stmt = tx
            .prepare(
                r#"
                SELECT id, command, payload, created_at
                FROM connect_commands
                WHERE status = 'pending'
                ORDER BY created_at ASC, id ASC
                LIMIT 20
                "#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let payload_json: String = row.get(2)?;
                let payload =
                    serde_json::from_str(&payload_json).unwrap_or(serde_json::Value::Null);
                Ok(ConnectCommandRecord {
                    id: row.get(0)?,
                    command: row.get(1)?,
                    payload,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| e.to_string())?);
        }
        items
    };

    for command in &commands {
        tx.execute(
            r#"
            UPDATE connect_commands
            SET status = 'handled', handled_at = strftime('%s','now')
            WHERE id = ?1
            "#,
            params![command.id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(commands)
}

fn load_playlist_track_paths(conn: &Connection, playlist_id: i64) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT track_path
            FROM playlist_tracks
            WHERE playlist_id = ?1
            ORDER BY position ASC, added_at ASC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![playlist_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut track_paths = Vec::new();
    for row in rows {
        track_paths.push(row.map_err(|e| e.to_string())?);
    }

    Ok(track_paths)
}

fn reconcile_playlists_with_filesystem(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id FROM playlists")
        .map_err(|e| e.to_string())?;

    let playlist_ids = stmt
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<i64>, _>>()
        .map_err(|e| e.to_string())?;

    for playlist_id in playlist_ids {
        let tracks = load_playlist_track_paths(conn, playlist_id)?;
        if tracks.is_empty() {
            continue;
        }

        let mut missing_count = 0;
        for track_path in &tracks {
            if !Path::new(track_path).exists() {
                missing_count += 1;

                // Purge broken track record from this playlist
                conn.execute(
                    "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_path = ?2",
                    params![playlist_id, track_path],
                )
                .map_err(|e| e.to_string())?;

                // Purge from library cache since file is gone from disk
                conn.execute(
                    "DELETE FROM library_cache WHERE path = ?1",
                    params![track_path],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // Auto-Delete Sync Rule: If ALL previously existing tracks are gone from disk, remove playlist
        if missing_count > 0 && missing_count == tracks.len() {
            conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn get_playlists(
    cache_state: State<'_, LibraryCacheState>,
) -> Result<Vec<PlaylistSummary>, String> {
    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    // Perform architectural reconciliation first
    reconcile_playlists_with_filesystem(&conn)?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT p.id, p.name, p.created_at, p.updated_at, COUNT(pt.track_path) as track_count, p.spotify_url, p.spotify_synced_ids, p.is_system
            FROM playlists p
            LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
            GROUP BY p.id, p.name, p.created_at, p.updated_at, p.spotify_url, p.spotify_synced_ids, p.is_system
            ORDER BY p.is_system DESC, p.updated_at DESC, p.id DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, i32>(7)?, // is_system
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut playlists = Vec::new();
    for row in rows {
        let (id, name, created_at, updated_at, track_count, spotify_url, spotify_synced_ids, is_system) =
            row.map_err(|e| e.to_string())?;

        playlists.push(PlaylistSummary {
            id,
            name,
            track_count,
            created_at,
            updated_at,
            track_paths: load_playlist_track_paths(&conn, id)?,
            spotify_url,
            spotify_synced_ids,
            is_system,
        });
    }

    Ok(playlists)
}

#[tauri::command]
fn create_playlist(
    name: String,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<PlaylistSummary, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("La playlist necesita un nombre.".to_string());
    }

    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    conn.execute(
        r#"
        INSERT INTO playlists (name, is_system, created_at, updated_at)
        VALUES (?1, 0, strftime('%s','now'), strftime('%s','now'))
        "#,
        params![trimmed],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(PlaylistSummary {
        id,
        name: trimmed.to_string(),
        track_count: 0,
        created_at: 0,
        updated_at: 0,
        track_paths: Vec::new(),
        spotify_url: None,
        spotify_synced_ids: None,
        is_system: 0,
    })
}

#[tauri::command]
fn set_playlist_spotify_url(
    playlist_id: i64,
    spotify_url: String,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let trimmed = spotify_url.trim();
    let url_to_save = if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    };

    println!("[DB][Log] Updating Spotify URL for playlist {}: {:?}", playlist_id, url_to_save);

    let updated_rows = conn
        .execute(
            "UPDATE playlists SET spotify_url = ?1, updated_at = strftime('%s','now') WHERE id = ?2",
            params![url_to_save, playlist_id],
        )
        .map_err(|e| {
            let err = e.to_string();
            println!("[DB][Error] Failed to update URL: {}", err);
            err
        })?;

    if updated_rows == 0 {
        return Err("La playlist ya no existe.".to_string());
    }

    Ok(())
}

#[tauri::command]
fn set_playlist_synced_ids(
    playlist_id: i64,
    synced_ids_json: String,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    println!("[DB][Log] Updating Synced IDs for playlist {}. Length: {} chars", playlist_id, synced_ids_json.len());

    conn.execute(
        "UPDATE playlists SET spotify_synced_ids = ?1, updated_at = ?2 WHERE id = ?3",
        params![
            synced_ids_json,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64,
            playlist_id
        ],
    )
    .map_err(|e| {
        let err = e.to_string();
        println!("[DB][Error] Failed to update Synced IDs: {}", err);
        err
    })?;

    println!("[DB][Log] Synced IDs updated successfully.");

    Ok(())
}

#[tauri::command]
fn add_track_to_playlist(
    playlist_id: i64,
    track_path: String,
    allow_duplicate: Option<bool>,
    position: Option<i64>,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    let mut conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let exists: Option<i64> = tx
        .query_row(
            "SELECT 1 FROM playlists WHERE id = ?1 LIMIT 1",
            params![playlist_id],
            |row| row.get(0),
        )
        .ok();

    if exists.is_none() {
        return Err("La playlist ya no existe.".to_string());
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

    if already_exists.is_some() && !allow_duplicate.unwrap_or(false) {
        tx.execute(
            "UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?1",
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let target_position: i64 = if let Some(pos) = position {
        pos
    } else {
        tx.query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    };

    tx.execute(
        r#"
        INSERT INTO playlist_tracks (playlist_id, track_path, position, added_at)
        VALUES (?1, ?2, ?3, strftime('%s','now'))
        "#,
        params![playlist_id, track_path, target_position],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?1",
        params![playlist_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn remove_track_from_playlist(
    playlist_id: i64,
    track_path: String,
    delete_files: bool,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    let mut conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let exists: Option<i64> = tx
        .query_row(
            "SELECT 1 FROM playlists WHERE id = ?1 LIMIT 1",
            params![playlist_id],
            |row| row.get(0),
        )
        .ok();

    if exists.is_none() {
        return Err("La playlist ya no existe.".to_string());
    }

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
        tx.commit().map_err(|e| e.to_string())?;
        return Ok(());
    };

    tx.execute(
        "DELETE FROM playlist_tracks WHERE id = ?1",
        params![removed_track_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?1",
        params![playlist_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        r#"
        UPDATE playlist_tracks
        SET position = position - 1
        WHERE playlist_id = ?1 AND position > ?2
        "#,
        params![playlist_id, removed_position],
    )
    .map_err(|e| e.to_string())?;

    if delete_files {
        // Physical deletion logic (Same as in delete_playlist)
        // Check "Shared Count" across other playlists (path-specific)
        let other_refs: i64 = tx.query_row(
            "SELECT COUNT(*) FROM playlist_tracks WHERE track_path = ?1 AND playlist_id != ?2",
            params![track_path, playlist_id],
            |row| row.get(0)
        ).unwrap_or(0);

        if other_refs == 0 {
            let path = std::path::Path::new(&track_path);
            
            // Delete physical audio file
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }

            // Delete paired .lrc sidecar if present
            let lrc_path = path.with_extension("lrc");
            if lrc_path.exists() {
                let _ = std::fs::remove_file(lrc_path);
            }

            // Remove library_cache entry only for tracks physically deleted
            let _ = tx.execute(
                "DELETE FROM library_cache WHERE path = ?1",
                params![track_path],
            );
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn rename_playlist(
    playlist_id: i64,
    name: String,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("La playlist necesita un nombre.".to_string());
    }

    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let updated_rows = conn
        .execute(
            r#"
            UPDATE playlists
            SET name = ?1, updated_at = strftime('%s','now')
            WHERE id = ?2
            "#,
            params![trimmed, playlist_id],
        )
        .map_err(|e| e.to_string())?;

    if updated_rows == 0 {
        return Err("La playlist ya no existe.".to_string());
    }

    Ok(())
}

#[tauri::command]
fn try_reconcile_physical_path(
    playlist_id: i64,
    current_path: String,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<Option<String>, String> {
    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| e.to_string())?;

    let playlist_name: String = conn.query_row(
        "SELECT name FROM playlists WHERE id = ?1",
        params![playlist_id],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    let path = Path::new(&current_path);
    let file_name = match path.file_name() {
        Some(n) => n,
        None => return Ok(None),
    };

    println!("[Reconcile] Start checking track: {} for playlist: {}", current_path, playlist_name);

    // Lista de directorios base para buscar la carpeta de la playlist
    let mut search_roots = Vec::new();

    // 1. El abuelo de la ubicación actual (si tiene)
    if let Some(parent) = path.parent() {
        if let Some(grandparent) = parent.parent() {
            search_roots.push(grandparent.to_path_buf());
        }
    }

    // 2. El directorio de música por defecto del sistema
    search_roots.push(PathBuf::from(default_music_directory()));

    // 3. Todos los directorios configurados por el usuario
    if let Ok(mut stmt) = conn.prepare("SELECT path FROM music_directories") {
        if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
            for row in rows {
                if let Ok(dir) = row {
                    search_roots.push(PathBuf::from(dir));
                }
            }
        }
    }

    // Eliminar duplicados para no buscar lo mismo varias veces
    search_roots.sort();
    search_roots.dedup();

    for root in search_roots {
        let candidate = root.join(&playlist_name).join(file_name);
        println!("[Reconcile] Testing candidate: {:?}", candidate);

        if candidate.exists() {
            let new_path = candidate.to_string_lossy().to_string();
            
            // Comparación de rutas de forma normalizada (ignorando separadores y minúsculas)
            let norm_current = current_path.replace("\\", "/").to_lowercase();
            let norm_new = new_path.replace("\\", "/").to_lowercase();

            if norm_current != norm_new {
                update_playlist_track_path(&conn, playlist_id, &current_path, &new_path)?;
                return Ok(Some(new_path));
            } else {
                println!("[Reconcile] Track is already physical (path matches).");
                return Ok(Some(new_path));
            }
        }
    }

    println!("[Reconcile] No physical alternative found for {}", current_path);
    Ok(None)
}

fn update_playlist_track_path(conn: &Connection, playlist_id: i64, old_path: &str, new_path: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE playlist_tracks SET track_path = ?1 WHERE playlist_id = ?2 AND track_path = ?3",
        params![new_path, playlist_id, old_path]
    ).map_err(|e| e.to_string())?;
    println!("[Reconcile] DB Updated succesfully: {} -> {}", old_path, new_path);
    Ok(())
}

#[tauri::command]
fn delete_playlist(
    playlist_id: i64,
    delete_files: bool,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    if delete_files {
        let track_paths = load_playlist_track_paths(&conn, playlist_id)?;
        let mut parent_dirs = std::collections::HashSet::new();

        for path_str in track_paths {
            let track_path = Path::new(&path_str);

            if let Some(parent) = track_path.parent() {
                parent_dirs.insert(parent.to_path_buf());
            }

            // Check "Shared Count" across other playlists (path-specific)
            let other_refs: i64 = conn.query_row(
                "SELECT COUNT(*) FROM playlist_tracks WHERE track_path = ?1 AND playlist_id != ?2",
                params![path_str, playlist_id],
                |row| row.get(0)
            ).unwrap_or(0);

            if other_refs == 0 {
                // Delete physical audio file
                if track_path.exists() {
                    let _ = fs::remove_file(track_path);
                }

                // Delete paired .lrc sidecar if present
                let lrc_path = track_path.with_extension("lrc");
                if lrc_path.exists() {
                    let _ = fs::remove_file(lrc_path);
                }

                // Remove library_cache entry only for tracks physically deleted
                let _ = conn.execute(
                    "DELETE FROM library_cache WHERE path = ?1",
                    params![path_str],
                );
            }
        }

        // Delete playlist from DB (cascades to playlist_tracks)
        let _ = conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id]);

        // Attempt to cleanup folder ONLY if it is completely empty
        for dir in parent_dirs {
            if dir.exists() && dir.is_dir() {
                if let Ok(mut entries) = fs::read_dir(&dir) {
                    if entries.next().is_none() {
                        let _ = fs::remove_dir(&dir);
                    }
                }
            }
        }
    } else {
        // Mode 1: Remove from App only
        let deleted_rows = conn
            .execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])
            .map_err(|e| e.to_string())?;

        if deleted_rows == 0 {
            return Err("La playlist ya no existe.".to_string());
        }
    }

    Ok(())
}

#[tauri::command]
fn get_output_device_info() -> Result<OutputDeviceInfo, String> {
    // Necesitamos importar los traits de cpal aquí para poder usar sus métodos
    use cpal::traits::{DeviceTrait, HostTrait};

    let host = cpal::default_host();

    // Obtenemos el dispositivo de salida que el OS está usando ahora mismo
    let device = host
        .default_output_device()
        .ok_or_else(|| "No se encontró dispositivo de salida de audio".to_string())?;

    // Obtenemos la configuración de hardware actual de ese dispositivo
    let config = device
        .default_output_config()
        .map_err(|e| format!("Error al obtener configuración de hardware: {}", e))?;

    let name = device
        .name()
        .unwrap_or_else(|_| "Dispositivo desconocido".to_string());

    // Traducimos el formato de cpal a un texto legible
    let format_str = match config.sample_format() {
        cpal::SampleFormat::F32 => "32-bit Float",
        cpal::SampleFormat::I16 => "16-bit Int",
        cpal::SampleFormat::U16 => "16-bit Unsigned",
        _ => "Formato Desconocido",
    };

    Ok(OutputDeviceInfo {
        device_name: name,
        sample_rate: config.sample_rate().0,
        channels: config.channels(),
        sample_format: format_str.to_string(),
    })
}

#[tauri::command]
fn get_computer_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Mi PC".to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpotiFlacHostInfo {
    default_download_path: String,
    config_path: String,
}

fn default_music_directory() -> String {
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let music_dir = PathBuf::from(&user_profile).join("Music");
        if music_dir.exists() {
            return music_dir.to_string_lossy().to_string();
        }

        return user_profile;
    }

    ".".to_string()
}

fn spotiflac_legacy_app_dir() -> Result<PathBuf, String> {
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let path = PathBuf::from(user_profile).join(".spotiflac");
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        return Ok(path);
    }

    let fallback = PathBuf::from(".").join(".spotiflac");
    fs::create_dir_all(&fallback).map_err(|e| e.to_string())?;
    Ok(fallback)
}

#[tauri::command]
fn spotiflac_get_host_info(_app_handle: AppHandle) -> Result<SpotiFlacHostInfo, String> {
    let config_path = spotiflac_legacy_app_dir()?;
    Ok(SpotiFlacHostInfo {
        default_download_path: default_music_directory(),
        config_path: config_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn spotiflac_open_folder(path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Ruta vacia".to_string());
    }

    let target = PathBuf::from(path);
    let existing = if target.exists() {
        target
    } else {
        target
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "La ruta no existe".to_string())?
    };

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(existing)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(existing)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(existing)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn spotiflac_write_text_file(path: String, contents: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(target, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn spotiflac_read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(PathBuf::from(path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn spotiflac_write_binary_file(path: String, base64_data: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let bytes = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| e.to_string())?;
    fs::write(target, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn spotiflac_file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn spotiflac_get_file_size_mb(path: String) -> Result<f64, String> {
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("No se pudo leer el tamaño de {}: {}", path, error))?;
    Ok((metadata.len() as f64) / (1024.0 * 1024.0))
}

#[tauri::command]
fn spotiflac_find_duplicate_candidates(
    directory: String,
    base_name: String,
    extension: String,
) -> Result<Vec<String>, String> {
    let dir_path = Path::new(&directory);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Ok(Vec::new());
    }

    let normalized_extension = extension.trim_start_matches('.').to_ascii_lowercase();
    let exact_name = format!("{}.{}", base_name, normalized_extension);
    let variant_prefix = format!("{}__sfdup_", base_name).to_ascii_lowercase();
    let variant_suffix = format!(".{}", normalized_extension);
    let mut matches = Vec::new();

    for entry in fs::read_dir(dir_path)
        .map_err(|error| format!("No se pudo leer el directorio {}: {}", directory, error))?
    {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let file_name = match path.file_name().and_then(|value| value.to_str()) {
            Some(value) => value,
            None => continue,
        };

        let lower_name = file_name.to_ascii_lowercase();
        if lower_name == exact_name.to_ascii_lowercase()
            || (lower_name.starts_with(&variant_prefix) && lower_name.ends_with(&variant_suffix))
        {
            matches.push(path.to_string_lossy().to_string());
        }
    }

    Ok(matches)
}

#[tauri::command]
async fn spotiflac_download_track(
    request: serde_json::Value,
    download_state: State<'_, SpotiFlacDownloadState>,
) -> Result<serde_json::Value, String> {
    let queued_at = Instant::now();
    let _download_guard = download_state.lock.lock().await;
    eprintln!(
        "[spotiflac][download-gate] acquired wait_ms={}",
        queued_at.elapsed().as_millis()
    );
    tauri::async_runtime::spawn_blocking(move || run_spotiflac_bridge("download-track", request))
        .await
        .map_err(|error| format!("Fallo ejecutando descarga de SpotiFLAC: {}", error))?
}

fn debug_spotiflac_written_tags(file_path: &str) {
    match read_from_path(file_path) {
        Ok(tagged_file) => {
            let Some(tag) = tagged_file.primary_tag() else {
                eprintln!("[spotiflac][tags] file={} primary_tag=missing", file_path);
                return;
            };

            let year = tag
                .get_string(ItemKey::Year)
                .or_else(|| tag.get_string(ItemKey::ReleaseDate))
                .map(|value| value.to_string());
            let title = tag.title().map(|value| value.to_string());
            let artist = tag.artist().map(|value| value.to_string());
            let album = tag.album().map(|value| value.to_string());
            let genre = tag.genre().map(|value| value.to_string());
            let item_keys: Vec<String> = tag
                .items()
                .map(|item| format!("{:?}={:?}", item.key(), item.value()))
                .collect();

            eprintln!(
                "[spotiflac][tags] file={} title={:?} artist={:?} album={:?} year={:?} genre={:?} items={}",
                file_path,
                title,
                artist,
                album,
                year,
                genre,
                item_keys.join(" | ")
            );
        }
        Err(error) => {
            eprintln!("[spotiflac][tags] file={} read_error={}", file_path, error);
        }
    }
}

fn normalize_spotiflac_written_tags(
    file_path: &str,
    request_release_date: Option<&str>,
    request_spotify_id: Option<&str>,
    request_embed_genre: bool,
    request_use_single_genre: bool,
) -> Result<(), String> {
    let mut last_error: Option<String> = None;

    for attempt in 0..12 {
        match normalize_spotiflac_written_tags_once(
            file_path,
            request_release_date,
            request_spotify_id,
            request_embed_genre,
            request_use_single_genre,
        ) {
            Ok(()) => return Ok(()),
            Err(error) => {
                let lower = error.to_lowercase();
                let is_locked = lower.contains("being used by another process")
                    || lower.contains("acceso al archivo")
                    || lower.contains("os error 32");

                last_error = Some(error.clone());

                if !is_locked || attempt == 11 {
                    return Err(error);
                }

                thread::sleep(Duration::from_millis(250));
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "No se pudo normalizar metadata".to_string()))
}

fn normalize_spotiflac_text_for_match(value: &str) -> String {
    value
        .chars()
        .filter_map(|ch| {
            if ch.is_alphanumeric() || ch.is_whitespace() {
                Some(ch.to_ascii_lowercase())
            } else {
                None
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn split_spotiflac_artist_candidates(value: &str) -> Vec<String> {
    let normalized = value
        .replace(" feat. ", ",")
        .replace(" ft. ", ",")
        .replace(" featuring ", ",")
        .replace(" & ", ",")
        .replace(";", ",");

    normalized
        .split(',')
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .map(|part| part.to_string())
        .collect()
}

fn fetch_spotiflac_deezer_genres(isrc: &str) -> Result<Vec<String>, String> {
    let clean_isrc = isrc.trim();
    if clean_isrc.is_empty() {
        return Ok(Vec::new());
    }

    let response = run_spotiflac_bridge(
        "get-deezer-genres",
        serde_json::json!({
            "isrc": clean_isrc,
        }),
    )?;

    let genres = response
        .get("genres")
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str())
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if !genres.is_empty() {
        eprintln!(
            "[spotiflac][genre] source=deezer isrc={} genres={}",
            clean_isrc,
            genres.join(" | ")
        );
    }

    Ok(genres)
}

fn fetch_spotiflac_artist_genres(artist_name: &str) -> Result<Vec<String>, String> {
    let search_query = artist_name.trim();
    if search_query.is_empty() {
        return Ok(Vec::new());
    }

    let search_response = run_spotiflac_bridge(
        "search-spotify-by-type",
        serde_json::json!({
            "query": search_query,
            "search_type": "artist",
            "limit": 5,
            "offset": 0,
        }),
    )?;

    let Some(artists) = search_response
        .get("artists")
        .and_then(|value| value.as_array())
    else {
        return Ok(Vec::new());
    };

    let wanted = normalize_spotiflac_text_for_match(search_query);
    let selected_artist = artists
        .iter()
        .find(|artist| {
            artist
                .get("name")
                .and_then(|value| value.as_str())
                .map(|name| normalize_spotiflac_text_for_match(name) == wanted)
                .unwrap_or(false)
        })
        .or_else(|| artists.first());

    let Some(artist_url) = selected_artist
        .and_then(|artist| artist.get("external_urls"))
        .and_then(|value| value.as_str())
    else {
        return Ok(Vec::new());
    };

    let artist_response = run_spotiflac_bridge(
        "get-spotify-metadata",
        serde_json::json!({
            "url": artist_url,
            "batch": false,
            "delay": 0.0,
            "timeout": 15.0,
            "separator": ", ",
        }),
    )?;

    let genres_value = artist_response
        .get("artist_info")
        .and_then(|value| value.get("genres"))
        .or_else(|| {
            artist_response
                .get("artist")
                .and_then(|value| value.get("genres"))
        });

    let genres = genres_value
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str())
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(genres)
}

fn fetch_spotiflac_fallback_genres(
    isrc: Option<&str>,
    primary_artist_name: Option<&str>,
) -> Result<Vec<String>, String> {
    if let Some(isrc) = isrc {
        let deezer_genres = fetch_spotiflac_deezer_genres(isrc)?;
        if !deezer_genres.is_empty() {
            return Ok(deezer_genres);
        }
    }

    let Some(primary_artist_name) = primary_artist_name else {
        return Ok(Vec::new());
    };

    for candidate in split_spotiflac_artist_candidates(primary_artist_name) {
        let genres = fetch_spotiflac_artist_genres(&candidate)?;
        if !genres.is_empty() {
            eprintln!(
                "[spotiflac][genre] artist={} genres={}",
                candidate,
                genres.join(" | ")
            );
            return Ok(genres);
        }
    }

    Ok(Vec::new())
}

fn normalize_spotiflac_tag_fields(
    tag: &mut Tag,
    request_release_date: Option<&str>,
    request_spotify_id: Option<&str>,
    fallback_genres: &[String],
    use_single_genre: bool,
) -> bool {
    let existing_recording_date = tag
        .get_string(ItemKey::RecordingDate)
        .map(|value| value.to_string());
    let existing_release_date = tag
        .get_string(ItemKey::ReleaseDate)
        .map(|value| value.to_string());
    let fallback_release_date = request_release_date
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_string())
        .or(existing_release_date.clone())
        .or(existing_recording_date.clone());

    let mut changed = false;

    if tag.get_string(ItemKey::ReleaseDate).is_none() {
        if let Some(release_date) = fallback_release_date.as_ref() {
            tag.insert_text(ItemKey::ReleaseDate, release_date.clone());
            changed = true;
        }
    }

    if tag.get_string(ItemKey::Year).is_none() {
        if let Some(year) = fallback_release_date
            .as_deref()
            .and_then(|value| value.get(0..4))
            .filter(|value| value.chars().all(|ch| ch.is_ascii_digit()))
        {
            tag.insert_text(ItemKey::Year, year.to_string());
            changed = true;
        }
    }

    if tag.get_string(ItemKey::Genre).is_none() && !fallback_genres.is_empty() {
        let genre_value = if use_single_genre {
            fallback_genres.first().cloned()
        } else {
            Some(fallback_genres.join("; "))
        };

        if let Some(genre_value) = genre_value.filter(|value| !value.trim().is_empty()) {
            tag.insert_text(ItemKey::Genre, genre_value);
            changed = true;
        }
    }

    // NUEVO: Guardar el ID de Spotify usando un campo seguro
    if let Some(spotify_id) = request_spotify_id {
        let key = ItemKey::MusicBrainzTrackId;
        // Quitamos el '&' y no necesitamos .clone()
        if tag.get_string(key).is_none() {
            tag.insert_text(key, spotify_id.to_string());
            changed = true;
        }
    }

    changed
}

fn normalize_spotiflac_written_tags_once(
    file_path: &str,
    request_release_date: Option<&str>,
    request_spotify_id: Option<&str>,
    request_embed_genre: bool,
    request_use_single_genre: bool,
) -> Result<(), String> {
    let mut tagged_file = read_from_path(file_path).map_err(|e| e.to_string())?;
    let primary_artist_name = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())
        .and_then(|tag| {
            tag.get_string(ItemKey::AlbumArtist)
                .map(|value| value.to_string())
                .or_else(|| tag.artist().map(|value| value.to_string()))
        });
    let isrc = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())
        .and_then(|tag| tag.get_string(ItemKey::Isrc))
        .map(|value| value.to_string());
    let should_fetch_genres = request_embed_genre
        && tagged_file
            .primary_tag()
            .or_else(|| tagged_file.first_tag())
            .and_then(|tag| tag.get_string(ItemKey::Genre))
            .is_none();
    let fallback_genres = if should_fetch_genres {
        fetch_spotiflac_fallback_genres(isrc.as_deref(), primary_artist_name.as_deref())?
    } else {
        Vec::new()
    };
    let changed = if let Some(tag) = tagged_file.primary_tag_mut() {
        normalize_spotiflac_tag_fields(
            tag,
            request_release_date,
            request_spotify_id,
            &fallback_genres,
            request_use_single_genre,
        )
    } else if let Some(tag) = tagged_file.first_tag_mut() {
        normalize_spotiflac_tag_fields(
            tag,
            request_release_date,
            request_spotify_id,
            &fallback_genres,
            request_use_single_genre,
        )
    } else {
        return Ok(());
    };

    if changed {
        tagged_file
            .save_to_path(file_path, WriteOptions::default())
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn run_spotiflac_bridge(
    command_name: &str,
    request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let trace_id = SPOTIFLAC_BRIDGE_TRACE_ID.fetch_add(1, Ordering::Relaxed);
    let started_at = Instant::now();
    let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    println!("[BACKEND] Using workspace root: {:?}", workspace_root);
    let workspace_root = workspace_root
        .parent()
        .ok_or_else(|| "No se pudo resolver el workspace root".to_string())?
        .to_path_buf();

    let bridge_path = workspace_root
        .join("SpotiFLAC-main")
        .join("bridge")
        .join("spotiflac-bridge.exe");

    if !bridge_path.exists() {
        return Err(format!(
            "No se encontro el bridge de SpotiFLAC en {}",
            bridge_path.display()
        ));
    }

    let request_json = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
    let is_download_track = command_name == "download-track";
    let inflight_downloads = if is_download_track {
        SPOTIFLAC_DOWNLOADS_IN_FLIGHT.fetch_add(1, Ordering::SeqCst) + 1
    } else {
        SPOTIFLAC_DOWNLOADS_IN_FLIGHT.load(Ordering::SeqCst)
    };

    eprintln!(
        "[spotiflac][bridge:start] trace_id={} command={} inflight_downloads={} request_bytes={}",
        trace_id,
        command_name,
        inflight_downloads,
        request_json.len()
    );

    if is_download_track {
        let genres_value = request.get("genres");
        let genres_kind = match genres_value {
            Some(serde_json::Value::Array(_)) => "array",
            Some(serde_json::Value::String(_)) => "string",
            Some(serde_json::Value::Null) => "null",
            Some(_) => "other",
            None => "missing",
        };
        eprintln!(
            "[spotiflac][request] service={:?} spotify_id={:?} track={:?} release_date={:?} publisher={:?} embed_genre={:?} use_single_genre={:?} genres_kind={} genres={}",
            request.get("service"),
            request.get("spotify_id"),
            request.get("track_name"),
            request.get("release_date"),
            request.get("publisher"),
            request.get("embed_genre"),
            request.get("use_single_genre"),
            genres_kind,
            genres_value
                .map(|value| value.to_string())
                .unwrap_or_else(|| "null".to_string())
        );
    }

    let mut child = Command::new(&bridge_path)
        .arg(command_name)
        .current_dir(workspace_root.join("SpotiFLAC-main"))
        /*
        .env_remove("HTTP_PROXY")
        .env_remove("HTTPS_PROXY")
        .env_remove("http_proxy")
        .env_remove("https_proxy")
        .env_remove("ALL_PROXY")
        .env_remove("all_proxy")
        */
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar el bridge: {}", e))?;

    eprintln!(
        "[spotiflac][bridge:spawned] trace_id={} command={} pid={}",
        trace_id,
        command_name,
        child.id()
    );

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(&request_json)
            .map_err(|e| format!("No se pudo enviar request al bridge: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Fallo esperando el bridge: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if stdout.is_empty() {
        return Err(if stderr.is_empty() {
            "El bridge no devolvio salida".to_string()
        } else {
            stderr
        });
    }

    let parsed: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| {
        format!(
            "Respuesta JSON invalida del bridge: {} | stdout: {}",
            e, stdout
        )
    })?;

    eprintln!(
        "[spotiflac][bridge:end] trace_id={} command={} success={} duration_ms={} stderr={}",
        trace_id,
        command_name,
        output.status.success(),
        started_at.elapsed().as_millis(),
        if stderr.is_empty() {
            "<empty>"
        } else {
            &stderr
        }
    );

    if is_download_track {
        eprintln!(
            "[spotiflac][response] success={} stderr={} body={}",
            output.status.success(),
            if stderr.is_empty() {
                "<empty>"
            } else {
                &stderr
            },
            parsed
        );

        if output.status.success() {
            if let Some(file_path) = parsed.get("file").and_then(|value| value.as_str()) {
                if let Err(error) = normalize_spotiflac_written_tags(
                    file_path,
                    request.get("release_date").and_then(|value| value.as_str()),
                    request.get("spotify_id").and_then(|value| value.as_str()),
                    request
                        .get("embed_genre")
                        .and_then(|value| value.as_bool())
                        .unwrap_or(false),
                    request
                        .get("use_single_genre")
                        .and_then(|value| value.as_bool())
                        .unwrap_or(false),
                ) {
                    eprintln!("[spotiflac][normalize] file={} error={}", file_path, error);
                }
                debug_spotiflac_written_tags(file_path);
            }
        }
    }

    if is_download_track {
        let remaining = SPOTIFLAC_DOWNLOADS_IN_FLIGHT
            .fetch_sub(1, Ordering::SeqCst)
            .saturating_sub(1);
        eprintln!(
            "[spotiflac][bridge:settled] trace_id={} inflight_downloads={}",
            trace_id, remaining
        );
    }

    if output.status.success() {
        Ok(parsed)
    } else if !stderr.is_empty() {
        Ok(match parsed {
            serde_json::Value::Object(mut map) => {
                map.entry("error".to_string())
                    .or_insert(serde_json::Value::String(stderr));
                serde_json::Value::Object(map)
            }
            other => other,
        })
    } else {
        Ok(parsed)
    }
}

#[tauri::command]
async fn spotiflac_get_spotify_metadata(
    url: String,
    batch: Option<bool>,
    delay: Option<f64>,
    timeout: Option<f64>,
    separator: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_spotiflac_bridge(
            "get-spotify-metadata",
            serde_json::json!({
                "url": url,
                "batch": batch.unwrap_or(true),
                "delay": delay.unwrap_or(1.0),
                "timeout": timeout.unwrap_or(300.0),
                "separator": separator.unwrap_or_else(|| ", ".to_string()),
            }),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn spotiflac_get_streaming_urls(
    spotify_track_id: String,
    region: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_spotiflac_bridge(
            "get-streaming-urls",
            serde_json::json!({
                "spotify_track_id": spotify_track_id,
                "region": region.unwrap_or_default(),
            }),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn spotiflac_check_track_availability(
    spotify_track_id: String,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_spotiflac_bridge(
            "check-track-availability",
            serde_json::json!({
                "spotify_track_id": spotify_track_id,
            }),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn spotiflac_search_spotify(
    query: String,
    limit: Option<i32>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_spotiflac_bridge(
            "search-spotify",
            serde_json::json!({
                "query": query,
                "limit": limit.unwrap_or(50),
            }),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn spotiflac_search_spotify_by_type(
    query: String,
    search_type: String,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_spotiflac_bridge(
            "search-spotify-by-type",
            serde_json::json!({
                "query": query,
                "search_type": search_type,
                "limit": limit.unwrap_or(50),
                "offset": offset.unwrap_or(0),
            }),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn spotiflac_get_preview_url(track_id: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_spotiflac_bridge(
            "get-preview-url",
            serde_json::json!({
                "track_id": track_id,
            }),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_library_metadata_batch(
    paths: Vec<String>,
    cache_state: State<'_, LibraryCacheState>,
    app_handle: tauri::AppHandle, // <-- NUEVO: Para obtener la ruta del AppData
) -> Result<Vec<LibraryTrackMetadataLite>, String> {
    let conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    // Preparamos la carpeta "covers"
    let covers_dir = app_handle.path().app_data_dir().unwrap().join("covers");
    let _ = fs::create_dir_all(&covers_dir);

    let mut result = Vec::with_capacity(paths.len());

    for path in &paths {
        let current_modified_at = match get_file_modified_at(path) {
            Ok(v) => v,
            Err(_) => {
                let fallback_name = Path::new(path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Sin título")
                    .to_string();

                result.push(LibraryTrackMetadataLite {
                    path: path.clone(),
                    title: fallback_name,
                    artist: "Artista desconocido".to_string(),
                    album: "—".to_string(),
                    album_artist: "Artista desconocido".to_string(),
                    duration_seconds: 0,
                    duration_formatted: "—".to_string(),
                    cover_path: None,
                    track_number: None, // <-- CORRECCIÓN AQUÍ
                    spotify_id: None,
                });
                continue;
            }
        };

        if let Some((cached, cached_modified_at)) = get_cached_track(&conn, path)? {
            if cached_modified_at == current_modified_at {
                result.push(cached);
                continue;
            }
        }

        let file_name = Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Sin título")
            .to_string();

        // Pasamos covers_dir a read_light_metadata
        match read_light_metadata(path, &covers_dir) {
            Ok(fresh) => {
                upsert_cached_track(&conn, path, &file_name, &fresh, current_modified_at)?;
                result.push(fresh);
            }
            Err(_) => {
                let fallback = LibraryTrackMetadataLite {
                    path: path.clone(),
                    title: file_name.clone(),
                    artist: "Artista desconocido".to_string(),
                    album: "—".to_string(),
                    album_artist: "Artista desconocido".to_string(),
                    duration_seconds: 0,
                    duration_formatted: "—".to_string(),
                    cover_path: None,
                    track_number: None, // <-- CORRECCIÓN AQUÍ
                    spotify_id: None,
                };

                upsert_cached_track(&conn, path, &file_name, &fallback, current_modified_at)?;
                result.push(fallback);
            }
        }
    }

    cleanup_deleted_cache(&conn, &paths)?;

    Ok(result)
}

#[tauri::command]
fn invalidate_library_cache(
    paths: Vec<String>,
    cache_state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    let mut conn = Connection::open(&cache_state.db_path)
        .map_err(|e| format!("No se pudo abrir SQLite: {}", e))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for path in paths {
        tx.execute("DELETE FROM library_cache WHERE path = ?1", params![path])
            .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn format_duration(total_seconds: u64) -> String {
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;

    if hours > 0 {
        format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
    } else {
        format!("{:02}:{:02}", minutes, seconds)
    }
}

fn build_tag_list<'a>(tagged_file: &'a lofty::file::TaggedFile) -> Vec<&'a Tag> {
    let mut tags: Vec<&Tag> = Vec::new();
    if let Some(primary) = tagged_file.primary_tag() {
        tags.push(primary);
    }
    for tag in tagged_file.tags() {
        if !tags.iter().any(|t| t.tag_type() == tag.tag_type()) {
            tags.push(tag);
        }
    }
    tags
}

fn first_text<F>(tags: &[&Tag], getter: F) -> Option<String>
where
    F: Fn(&Tag) -> Option<String>,
{
    for tag in tags {
        if let Some(value) = getter(tag) {
            if !value.trim().is_empty() {
                return Some(value.trim().to_string());
            }
        }
    }
    None
}

fn extract_cover_art(tags: &[&Tag]) -> Option<CoverArt> {
    for tag in tags {
        if let Some(pic) = tag.get_picture_type(PictureType::CoverFront) {
            let mime = pic.mime_type().map(|m| format!("{:?}", m).to_lowercase());
            let mime_for_url = mime.clone().unwrap_or_else(|| "image/jpeg".to_string());
            let data_base64 = general_purpose::STANDARD.encode(pic.data());
            let data_url = format!("data:{};base64,{}", mime_for_url, data_base64);

            return Some(CoverArt {
                data_url: Some(data_url),
                mime_type: mime,
                description: pic.description().map(|s| s.to_string()),
                picture_type: Some("CoverFront".to_string()),
            });
        }
        if let Some(pic) = tag.pictures().first() {
            let mime = pic.mime_type().map(|m| format!("{:?}", m).to_lowercase());
            let mime_for_url = mime.clone().unwrap_or_else(|| "image/jpeg".to_string());
            let data_base64 = general_purpose::STANDARD.encode(pic.data());
            let data_url = format!("data:{};base64,{}", mime_for_url, data_base64);

            return Some(CoverArt {
                data_url: Some(data_url),
                mime_type: mime,
                description: pic.description().map(|s| s.to_string()),
                picture_type: Some(format!("{:?}", pic.pic_type())),
            });
        }
    }
    None
}

#[tauri::command]
fn leer_metadata(
    path: String,
    custom_lyrics_path: Option<String>,
) -> Result<AudioMetadata, String> {
    let tagged_file = read_from_path(&path).map_err(|e| e.to_string())?;
    let tags = build_tag_list(&tagged_file);

    let properties = tagged_file.properties();
    let duration = properties.duration();
    let duration_seconds = duration.as_secs();

    // NUEVO: Intentar leer el archivo .lrc
    let mut synced_lyrics = None;

    // 1. Intentar en carpeta personalizada si existe
    if let Some(custom_dir) = custom_lyrics_path {
        let file_name = std::path::Path::new(&path)
            .file_name()
            .and_then(|n| n.to_str());

        if let Some(name) = file_name {
            let custom_lrc_path = std::path::Path::new(&custom_dir)
                .join(name)
                .with_extension("lrc");
            synced_lyrics = std::fs::read_to_string(custom_lrc_path).ok();
        }
    }

    // 2. Fallback a la misma ruta de la cancion si no se encontro en la personalizada
    if synced_lyrics.is_none() {
        let lrc_path = std::path::Path::new(&path).with_extension("lrc");
        synced_lyrics = std::fs::read_to_string(lrc_path).ok();
    }

    let metadata = AudioMetadata {
        title: first_text(&tags, |tag| tag.title().map(|s| s.to_string())),
        artist: first_text(&tags, |tag| tag.artist().map(|s| s.to_string())),
        album: first_text(&tags, |tag| tag.album().map(|s| s.to_string())),
        genre: first_text(&tags, |tag| tag.genre().map(|s| s.to_string())),
        album_artist: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::AlbumArtist).map(|s| s.to_string())
        })),
        composer: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::Composer).map(|s| s.to_string())
        })),
        lyricist: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::Lyricist).map(|s| s.to_string())
        })),
        comment: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::Comment).map(|s| s.to_string())
        })),
        lyrics: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::Lyrics)
                .or_else(|| tag.get_string(ItemKey::UnsyncLyrics))
                .map(|s| s.to_string())
        })),
        synced_lyrics,
        track_number: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::TrackNumber).map(|s| s.to_string())
        })),
        track_total: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::TrackTotal).map(|s| s.to_string())
        })),
        disc_number: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::DiscNumber).map(|s| s.to_string())
        })),
        disc_total: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::DiscTotal).map(|s| s.to_string())
        })),
        year: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::Year)
                .or_else(|| tag.get_string(ItemKey::ReleaseDate))
                .or_else(|| tag.get_string(ItemKey::RecordingDate))
                .map(|s| s.to_string())
        })),
        release_date: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::ReleaseDate)
                .or_else(|| tag.get_string(ItemKey::RecordingDate))
                .map(|s| s.to_string())
        })),
        duration_seconds: Some(duration_seconds),
        duration_formatted: Some(format_duration(duration_seconds)),
        channels: properties.channels(),
        sample_rate: properties.sample_rate(),
        bit_depth: properties.bit_depth(),
        audio_bitrate: properties.audio_bitrate(),
        overall_bitrate: properties.overall_bitrate(),
        cover_art: extract_cover_art(&tags),
    };
    Ok(metadata)
}

// ==========================================
// 4. NUEVOS COMANDOS DE TAURI (Súper rápidos)
// ==========================================

#[tauri::command]
fn play_audio_file(path: String, state: State<'_, AudioPlayerState>) -> Result<(), String> {
    state
        .tx
        .send(AudioCommand::Play(path, 0.0))
        .map_err(|_| "Error de comunicación con el hilo de audio".into())
}

#[tauri::command]
fn play_audio_file_at(
    path: String,
    position: f64,
    state: State<'_, AudioPlayerState>,
) -> Result<(), String> {
    state
        .tx
        .send(AudioCommand::Play(path, position))
        .map_err(|_| "Error de comunicación".into())
}

#[tauri::command]
fn pause_audio(state: State<'_, AudioPlayerState>) {
    let _ = state.tx.send(AudioCommand::Pause);
}

#[tauri::command]
fn resume_audio(state: State<'_, AudioPlayerState>) {
    let _ = state.tx.send(AudioCommand::Resume);
}

#[tauri::command]
fn stop_audio_backend(state: State<'_, AudioPlayerState>) {
    let _ = state.tx.send(AudioCommand::Stop);
    if let Ok(mut pos) = state.current_position_secs.lock() {
        *pos = 0.0;
    }
}

#[tauri::command]
fn seek_audio(position: f64, state: State<'_, AudioPlayerState>) -> Result<(), String> {
    state
        .tx
        .send(AudioCommand::Seek(position))
        .map_err(|_| "Error al hacer seek".into())
}

#[tauri::command]
fn get_audio_position(state: State<'_, AudioPlayerState>) -> f64 {
    *state
        .current_position_secs
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

#[tauri::command]
fn set_audio_volume(volume: f32, state: State<'_, AudioPlayerState>) {
    let _ = state.tx.send(AudioCommand::SetVolume(volume));
}

fn compare_natural_segment(left: &str, right: &str) -> CmpOrdering {
    let left_trimmed = left.trim_start_matches('0');
    let right_trimmed = right.trim_start_matches('0');

    let normalized_left = if left_trimmed.is_empty() {
        "0"
    } else {
        left_trimmed
    };
    let normalized_right = if right_trimmed.is_empty() {
        "0"
    } else {
        right_trimmed
    };

    match normalized_left.len().cmp(&normalized_right.len()) {
        CmpOrdering::Equal => match normalized_left.cmp(normalized_right) {
            CmpOrdering::Equal => left.len().cmp(&right.len()),
            ordering => ordering,
        },
        ordering => ordering,
    }
}

fn compare_natural_text(left: &str, right: &str) -> CmpOrdering {
    let mut left_chars = left.chars().peekable();
    let mut right_chars = right.chars().peekable();

    loop {
        match (left_chars.peek(), right_chars.peek()) {
            (None, None) => return CmpOrdering::Equal,
            (None, Some(_)) => return CmpOrdering::Less,
            (Some(_), None) => return CmpOrdering::Greater,
            (Some(left_char), Some(right_char)) => {
                if left_char.is_ascii_digit() && right_char.is_ascii_digit() {
                    let mut left_number = String::new();
                    let mut right_number = String::new();

                    while let Some(current) = left_chars.peek() {
                        if !current.is_ascii_digit() {
                            break;
                        }
                        left_number.push(*current);
                        left_chars.next();
                    }

                    while let Some(current) = right_chars.peek() {
                        if !current.is_ascii_digit() {
                            break;
                        }
                        right_number.push(*current);
                        right_chars.next();
                    }

                    let ordering = compare_natural_segment(&left_number, &right_number);
                    if ordering != CmpOrdering::Equal {
                        return ordering;
                    }

                    continue;
                }

                let left_lower = left_char.to_ascii_lowercase();
                let right_lower = right_char.to_ascii_lowercase();
                match left_lower.cmp(&right_lower) {
                    CmpOrdering::Equal => {
                        left_chars.next();
                        right_chars.next();
                    }
                    ordering => return ordering,
                }
            }
        }
    }
}

fn compare_library_paths(left: &str, right: &str) -> CmpOrdering {
    let normalized_left = left.replace('\\', "/");
    let normalized_right = right.replace('\\', "/");

    let mut left_parts = normalized_left.split('/');
    let mut right_parts = normalized_right.split('/');

    loop {
        match (left_parts.next(), right_parts.next()) {
            (None, None) => return CmpOrdering::Equal,
            (None, Some(_)) => return CmpOrdering::Less,
            (Some(_), None) => return CmpOrdering::Greater,
            (Some(left_part), Some(right_part)) => {
                let ordering = compare_natural_text(left_part, right_part);
                if ordering != CmpOrdering::Equal {
                    return ordering;
                }
            }
        }
    }
}

#[tauri::command]
fn scan_directories(directories: Vec<String>) -> Vec<PlaylistTrack> {
    let mut tracks = Vec::new();
    let allowed_extensions = ["mp3", "flac", "wav", "ogg", "m4a", "aac"];

    for dir in directories {
        // WalkDir recorre la carpeta y todas sus subcarpetas
        for entry in WalkDir::new(&dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();

            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if allowed_extensions.contains(&ext_lower.as_str()) {
                        let file_name = path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();

                        tracks.push(PlaylistTrack {
                            path: path.to_string_lossy().to_string(),
                            file_name,
                            extension: ext_lower,
                        });
                    }
                }
            }
        }
    }

    tracks.sort_by(|left, right| compare_library_paths(&left.path, &right.path));

    tracks
}

fn is_library_relevant_path(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };

    matches!(
        ext.to_ascii_lowercase().as_str(),
        "mp3" | "flac" | "wav" | "ogg" | "m4a" | "aac" | "lrc" | "m3u8"
    )
}

fn is_library_refresh_event(kind: &EventKind) -> bool {
    matches!(kind, EventKind::Create(_) | EventKind::Remove(_))
        || matches!(kind, EventKind::Modify(ModifyKind::Name(_)))
}

#[tauri::command]
fn watch_directories(
    directories: Vec<String>,
    app_handle: AppHandle,
    watcher_state: State<'_, LibraryWatcherState>,
) -> Result<(), String> {
    let (refresh_tx, refresh_rx) = std::sync::mpsc::channel::<()>();
    let refresh_handle = app_handle.clone();

    thread::spawn(move || loop {
        if refresh_rx.recv().is_err() {
            break;
        }

        loop {
            match refresh_rx.recv_timeout(Duration::from_millis(1500)) {
                Ok(_) => continue,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    let _ = refresh_handle.emit("library-updated", ());
                    break;
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
            }
        }
    });

    // 1. Creamos un nuevo watcher que reaccionará a cambios en el sistema operativo
    let mut watcher =
        notify::recommended_watcher(move |res: notify::Result<notify::Event>| match res {
            Ok(event) => {
                let should_refresh = is_library_refresh_event(&event.kind)
                    && event
                        .paths
                        .iter()
                        .any(|path| is_library_relevant_path(path));

                if should_refresh {
                    let _ = refresh_tx.send(());
                }
            }
            Err(e) => eprintln!("Error en el watcher: {:?}", e),
        })
        .map_err(|e| e.to_string())?;

    // 2. Le decimos al watcher qué carpetas vigilar
    for dir in directories {
        let path = std::path::Path::new(&dir);
        if path.exists() {
            let _ = watcher.watch(path, RecursiveMode::Recursive);
        }
    }

    // 3. Guardamos el watcher en el estado de Tauri para que no sea destruido por Rust
    *watcher_state.watcher.lock().unwrap() = Some(watcher);

    Ok(())
}

// ==========================================
// NUEVO: FUNCIÓN PARA RECREAR EL DISPOSITIVO DE AUDIO
// ==========================================
fn create_cpal_stream() -> Option<(Sender<f32>, cpal::Stream, String, u32)> {
    let host = cpal::default_host();
    let device = host.default_output_device()?;

    let device_name = device.name().unwrap_or_else(|_| "Unknown".to_string());

    // Usamos EXACTAMENTE la configuración que pide el hardware por defecto.
    // Modificar esto causa que el Bluetooth rechace el stream y genere el bucle infinito.
    let config = device.default_output_config().ok()?;
    let hardware_sample_rate = config.sample_rate().0;

    let (sample_tx, sample_rx) = bounded::<f32>(8192);
    let err_fn = |err| eprintln!("Error en CPAL: {}", err);

    let stream = match config.sample_format() {
        SampleFormat::F32 => device
            .build_output_stream(
                &config.into(),
                move |data: &mut [f32], _| {
                    for sample in data.iter_mut() {
                        *sample = sample_rx.try_recv().unwrap_or(0.0);
                    }
                },
                err_fn,
                None,
            )
            .ok()?,
        SampleFormat::I16 => device
            .build_output_stream(
                &config.into(),
                move |data: &mut [i16], _| {
                    for sample in data.iter_mut() {
                        let f32_sample = sample_rx.try_recv().unwrap_or(0.0);
                        *sample = <i16 as cpal::Sample>::from_sample(f32_sample);
                    }
                },
                err_fn,
                None,
            )
            .ok()?,
        SampleFormat::U16 => device
            .build_output_stream(
                &config.into(),
                move |data: &mut [u16], _| {
                    for sample in data.iter_mut() {
                        let f32_sample = sample_rx.try_recv().unwrap_or(0.0);
                        *sample = <u16 as cpal::Sample>::from_sample(f32_sample);
                    }
                },
                err_fn,
                None,
            )
            .ok()?,
        _ => return None,
    };

    stream.play().ok()?;
    // Retornamos también el sample_rate nativo del equipo
    Some((sample_tx, stream, device_name, hardware_sample_rate))
}

// ==========================================
// 5. MOTOR DE AUDIO (SYMPHONIA + CPAL)
// ==========================================

fn start_audio_thread(
    rx: Receiver<AudioCommand>,
    position_state: Arc<Mutex<f64>>,
    app_handle: AppHandle,
) {
    std::thread::spawn(move || {
        let mut sample_tx: Option<Sender<f32>> = None;
        let mut active_stream: Option<cpal::Stream> = None;
        let mut current_device_name = String::new();
        let mut current_stream_rate = 0u32;
        let mut fractional_position = 0.0f32; // Para el resampler matemático

        let mut format: Option<Box<dyn FormatReader>> = None;
        let mut decoder: Option<Box<dyn symphonia::core::codecs::Decoder>> = None;
        let mut track_id = 0u32;

        let mut sample_buf: Option<SampleBuffer<f32>> = None;
        let mut sample_buf_capacity_frames: u64 = 0;
        let mut sample_buf_channels: usize = 0;
        let mut sample_buf_rate: u32 = 0;

        let mut is_playing = false;
        let mut volume = 1.0f32;

        // EL FRENO DE MANO: Control por tiempo real
        let mut last_device_check = Instant::now();

        loop {
            // ========================================================
            // BUCLE INTERNO DE COMANDOS (Queda igual)
            // ========================================================
            loop {
                let command_result = if is_playing {
                    rx.try_recv()
                } else {
                    rx.recv()
                        .map_err(|_| crossbeam_channel::TryRecvError::Disconnected)
                };

                match command_result {
                    Ok(command) => match command {
                        AudioCommand::Play(path, pos) => {
                            let src = match std::fs::File::open(&path) {
                                Ok(f) => f,
                                Err(_) => {
                                    is_playing = false;
                                    continue;
                                }
                            };
                            let mss = MediaSourceStream::new(Box::new(src), Default::default());
                            let mut hint = Hint::new();
                            if let Some(ext) = std::path::Path::new(&path)
                                .extension()
                                .and_then(|e| e.to_str())
                            {
                                hint.with_extension(ext);
                            }
                            let probed = match symphonia::default::get_probe().format(
                                &hint,
                                mss,
                                &FormatOptions::default(),
                                &MetadataOptions::default(),
                            ) {
                                Ok(p) => p,
                                Err(_) => {
                                    is_playing = false;
                                    continue;
                                }
                            };
                            let mut new_format = probed.format;
                            let track = match new_format
                                .tracks()
                                .iter()
                                .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
                            {
                                Some(t) => t,
                                None => {
                                    is_playing = false;
                                    continue;
                                }
                            };
                            track_id = track.id;
                            let new_decoder = match symphonia::default::get_codecs()
                                .make(&track.codec_params, &DecoderOptions::default())
                            {
                                Ok(d) => d,
                                Err(_) => {
                                    is_playing = false;
                                    continue;
                                }
                            };

                            if pos > 0.0 {
                                let seek_time = SeekTo::Time {
                                    time: std::time::Duration::from_secs_f64(pos).into(),
                                    track_id: Some(track_id),
                                };
                                let _ = new_format.seek(SeekMode::Accurate, seek_time);
                            }

                            format = Some(new_format);
                            decoder = Some(new_decoder);
                            sample_buf = None;
                            sample_buf_capacity_frames = 0;
                            sample_buf_channels = 0;
                            sample_buf_rate = 0;

                            if let Ok(mut state_pos) = position_state.lock() {
                                *state_pos = pos.max(0.0);
                            }
                            is_playing = true;
                        }
                        AudioCommand::Pause => {
                            is_playing = false;
                        }
                        AudioCommand::Resume => {
                            if format.is_some() {
                                is_playing = true;
                            }
                        }
                        AudioCommand::Stop => {
                            is_playing = false;
                            format = None;
                            decoder = None;
                            sample_buf = None;
                            if let Ok(mut state_pos) = position_state.lock() {
                                *state_pos = 0.0;
                            }
                        }
                        AudioCommand::SetVolume(v) => {
                            volume = v.clamp(0.0, 100.0) / 100.0;
                        }
                        AudioCommand::Seek(pos) => {
                            if let Some(fmt) = format.as_mut() {
                                let seek_time = SeekTo::Time {
                                    time: std::time::Duration::from_secs_f64(pos).into(),
                                    track_id: Some(track_id),
                                };
                                if fmt.seek(SeekMode::Accurate, seek_time).is_ok() {
                                    if let Ok(mut state_pos) = position_state.lock() {
                                        *state_pos = pos.max(0.0);
                                    }
                                    sample_buf = None;
                                }
                            }
                        }
                    },
                    Err(crossbeam_channel::TryRecvError::Empty) => break,
                    Err(crossbeam_channel::TryRecvError::Disconnected) => return,
                }
            }

            // ========================================================
            // LÓGICA DE REPRODUCCIÓN, RESAMPLING Y RECONEXIÓN
            // ========================================================
            if is_playing {
                if let (Some(fmt), Some(dec)) = (format.as_mut(), decoder.as_mut()) {
                    match fmt.next_packet() {
                        Ok(packet) => {
                            if packet.track_id() != track_id {
                                continue;
                            }

                            match dec.decode(&packet) {
                                Ok(decoded) => {
                                    let spec = *decoded.spec();
                                    let needed_frames = decoded.capacity() as u64;
                                    let needed_channels = spec.channels.count();
                                    let needed_rate = spec.rate; // Hz de la canción

                                    // 1. INICIAR STREAM O RECUPERARLO SI SE PERDIÓ
                                    if active_stream.is_none() {
                                        sample_tx = None; // Soltamos el canal viejo
                                        if let Some((new_tx, new_stream, dev_name, dev_rate)) =
                                            create_cpal_stream()
                                        {
                                            sample_tx = Some(new_tx);
                                            active_stream = Some(new_stream);
                                            current_device_name = dev_name;
                                            current_stream_rate = dev_rate;
                                            fractional_position = 0.0;
                                        } else {
                                            // Freno para evitar uso del 100% de CPU si no hay dispositivos de audio en absoluto
                                            std::thread::sleep(std::time::Duration::from_millis(
                                                200,
                                            ));
                                            continue;
                                        }
                                    }

                                    // 2. VIGILAR CAMBIOS DE DISPOSITIVO (SOLO 1 VEZ POR SEGUNDO)
                                    if last_device_check.elapsed().as_millis() >= 1000 {
                                        last_device_check = Instant::now();
                                        if let Some(default_dev) =
                                            cpal::default_host().default_output_device()
                                        {
                                            if let Ok(name) = default_dev.name() {
                                                if name != current_device_name
                                                    && !current_device_name.is_empty()
                                                {
                                                    // El usuario conectó/desconectó algo. Matamos el stream viejo.
                                                    active_stream = None;
                                                    let _ =
                                                        app_handle.emit("audio-device-changed", ());
                                                    continue;
                                                }
                                            }
                                        }
                                    }

                                    let must_recreate = sample_buf.is_none()
                                        || sample_buf_capacity_frames < needed_frames
                                        || sample_buf_channels != needed_channels
                                        || sample_buf_rate != needed_rate;

                                    if must_recreate {
                                        sample_buf =
                                            Some(SampleBuffer::<f32>::new(needed_frames, spec));
                                        sample_buf_capacity_frames = needed_frames;
                                        sample_buf_channels = needed_channels;
                                        sample_buf_rate = needed_rate;
                                    }

                                    if let Some(buf) = sample_buf.as_mut() {
                                        buf.copy_interleaved_ref(decoded);
                                        let mut device_lost = false;

                                        if let Some(tx) = &sample_tx {
                                            // 3. EL RESAMPLER LINEAL PARA CORREGIR LA VELOCIDAD
                                            let ratio =
                                                needed_rate as f32 / current_stream_rate as f32;

                                            if (ratio - 1.0).abs() < 0.001 {
                                                // Mismos Hz, pasa directo
                                                for &sample in buf.samples() {
                                                    if tx.send(sample * volume).is_err() {
                                                        device_lost = true;
                                                        break;
                                                    }
                                                }
                                            } else {
                                                // Distintos Hz, aplicamos Interpolación Lineal
                                                let samples = buf.samples();
                                                let frames = samples.len() / needed_channels;
                                                let mut i = fractional_position;

                                                while (i as usize) < frames {
                                                    let idx = i as usize;
                                                    let frac = i - idx as f32;

                                                    for ch in 0..needed_channels {
                                                        let s1 =
                                                            samples[idx * needed_channels + ch];
                                                        let s2 = if idx + 1 < frames {
                                                            samples
                                                                [(idx + 1) * needed_channels + ch]
                                                        } else {
                                                            s1
                                                        };

                                                        let interpolated = s1 + frac * (s2 - s1);

                                                        if tx.send(interpolated * volume).is_err() {
                                                            device_lost = true;
                                                            break;
                                                        }
                                                    }
                                                    if device_lost {
                                                        break;
                                                    }
                                                    i += ratio;
                                                }
                                                fractional_position = i - frames as f32;
                                            }
                                        } else {
                                            device_lost = true;
                                        }

                                        // 4. MANEJO DE CAÍDA DEL DISPOSITIVO
                                        if device_lost {
                                            // Pausamos medio segundo para darle tiempo al OS a reasignar el audio
                                            std::thread::sleep(std::time::Duration::from_millis(
                                                500,
                                            ));

                                            // Destruimos la conexión muerta
                                            active_stream = None;
                                            sample_tx = None;

                                            // Avisamos a Vue SOLO UNA VEZ gracias a que destruimos active_stream
                                            let _ = app_handle.emit("audio-device-changed", ());
                                            continue;
                                        }

                                        // Actualizar la barra de progreso en UI
                                        if let Some(track) =
                                            fmt.tracks().iter().find(|t| t.id == track_id)
                                        {
                                            if let Some(tb) = track.codec_params.time_base {
                                                let time = tb.calc_time(packet.ts());
                                                if let Ok(mut state_pos) = position_state.lock() {
                                                    *state_pos = time.seconds as f64 + time.frac;
                                                }
                                            }
                                        }
                                    }
                                }
                                Err(_) => {}
                            }
                        }
                        Err(_) => {
                            is_playing = false;
                        }
                    }
                }
            }
        }
    });
}

// ==========================================
// 6. INICIALIZACIÓN DE TAURI
// ==========================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let tauri_start = Instant::now();
    println!("[Tauri][init:start] {:.1?}", tauri_start.elapsed());

    let (tx, rx) = unbounded::<AudioCommand>();
    let position_state = Arc::new(Mutex::new(0.0));

    let player_state = AudioPlayerState {
        tx,
        // Clonamos la referencia de Arc para el estado de Tauri,
        // así nos queda el original para el hilo de audio
        current_position_secs: Arc::clone(&position_state),
    };

    println!("[Tauri] Initializing application...");
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(player_state)
        .manage(SpotiFlacDownloadState {
            lock: tauri::async_runtime::Mutex::new(()),
        })
        .manage(LibraryWatcherState {
            watcher: std::sync::Mutex::new(None),
        })
        .setup(move |app| {
            // <-- IMPORTANTE: Añadir 'move' aquí
            if let Some(main_window) = app.get_webview_window("main") {
                let background = Color(15, 17, 21, 255);
                let _ = main_window.set_background_color(Some(background));
            }

            println!("[Tauri][db:init:start] {:.1?}", tauri_start.elapsed());
            let db_path = init_library_cache_db(app.handle())?;
            println!("[Tauri][db:init:end] {:.1?}", tauri_start.elapsed());
            app.manage(LibraryCacheState { db_path });

            // ==========================================
            // NUEVO: Iniciamos el hilo de audio AQUÍ
            // ==========================================
            let app_handle = app.handle().clone();
            start_audio_thread(rx, position_state, app_handle);
            // ==========================================

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            leer_metadata,
            play_audio_file,
            play_audio_file_at,
            pause_audio,
            resume_audio,
            stop_audio_backend,
            seek_audio,
            get_audio_position,
            set_audio_volume,
            scan_directories,
            watch_directories,
            get_library_metadata_batch,
            get_output_device_info,
            get_computer_name,
            spotiflac_get_host_info,
            spotiflac_open_folder,
            spotiflac_write_text_file,
            spotiflac_read_text_file,
            spotiflac_write_binary_file,
            spotiflac_file_exists,
            spotiflac_get_file_size_mb,
            spotiflac_find_duplicate_candidates,
            spotiflac_download_track,
            spotiflac_get_spotify_metadata,
            spotiflac_get_streaming_urls,
            spotiflac_check_track_availability,
            spotiflac_search_spotify,
            spotiflac_search_spotify_by_type,
            spotiflac_get_preview_url,
            get_music_directories,
            save_music_directories,
            set_music_directories,
            get_playlists,
            create_playlist,
            add_track_to_playlist,
            remove_track_from_playlist,
            rename_playlist,
            try_reconcile_physical_path,
            delete_playlist,
            set_playlist_spotify_url,
            set_playlist_synced_ids, // <-- NUEVO
            get_recent_global_searches,
            set_recent_global_searches,
            get_app_session,
            set_app_session,
            get_desktop_connect_state,
            set_desktop_connect_active_device,
            consume_connect_commands,
            invalidate_library_cache,
        ])
        .run(tauri::generate_context!())
        .expect("Error al iniciar la aplicación Tauri");
}
