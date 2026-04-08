use base64::{engine::general_purpose, Engine as _};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::prelude::Accessor;
use lofty::read_from_path;
use lofty::tag::{ItemKey, Tag};
use serde::{Deserialize, Serialize};
// Asegúrate de tener esto arriba en tu archivo
use rusqlite::{params, Connection};
use std::fs;
use std::hash::{Hash, Hasher}; // <-- NUEVO: Para crear nombres únicos de carátulas
use std::path::{Path, PathBuf};
use std::time::Instant;
use std::time::UNIX_EPOCH;
use tauri::Manager;

use std::sync::{Arc, Mutex};
use tauri::State;

// === NUEVAS DEPENDENCIAS PARA BIBLIOTECA ===
use notify::{EventKind, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};
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
    search: String,
    global_query: String,
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
    current_view_snapshot: ViewSnapshot,
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

        CREATE INDEX IF NOT EXISTS idx_library_cache_modified_at
        ON library_cache(modified_at);
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
    let _ = conn.execute(
        "ALTER TABLE recent_global_searches ADD COLUMN artist_name TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE recent_global_searches ADD COLUMN track_path TEXT",
        [],
    );

    Ok(db_path)
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

    Ok(LibraryTrackMetadataLite {
        path: path.to_string(),
        title,
        artist,
        album,
        album_artist,
        duration_seconds,
        duration_formatted: format_duration(duration_seconds),
        cover_path,
        track_number, // <-- SE AGREGA AQUÍ
    })
}

fn get_cached_track(
    conn: &Connection,
    path: &str,
) -> Result<Option<(LibraryTrackMetadataLite, i64)>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT path, title, artist, album, album_artist, duration_seconds, duration_formatted, modified_at, cover_path, track_number
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
            track_number: row.get::<_, Option<u32>>(9).unwrap_or(None), // <-- NUEVO
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
            path, file_name, title, artist, album, album_artist, duration_seconds, duration_formatted, modified_at, cover_path, track_number
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
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
            track_number = excluded.track_number -- <-- NUEVO
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
            data.track_number // <-- NUEVO
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
                };

                upsert_cached_track(&conn, path, &file_name, &fallback, current_modified_at)?;
                result.push(fallback);
            }
        }
    }

    cleanup_deleted_cache(&conn, &paths)?;

    Ok(result)
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
fn leer_metadata(path: String) -> Result<AudioMetadata, String> {
    let tagged_file = read_from_path(&path).map_err(|e| e.to_string())?;
    let tags = build_tag_list(&tagged_file);

    let properties = tagged_file.properties();
    let duration = properties.duration();
    let duration_seconds = duration.as_secs();

    // NUEVO: Intentar leer el archivo .lrc en la misma ruta
    let lrc_path = std::path::Path::new(&path).with_extension("lrc");
    let synced_lyrics = std::fs::read_to_string(lrc_path).ok();

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
            tag.get_string(ItemKey::Year).map(|s| s.to_string())
        })),
        release_date: non_empty(first_text(&tags, |tag| {
            tag.get_string(ItemKey::ReleaseDate).map(|s| s.to_string())
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

    tracks
}

#[tauri::command]
fn watch_directories(
    directories: Vec<String>,
    app_handle: AppHandle,
    watcher_state: State<'_, LibraryWatcherState>,
) -> Result<(), String> {
    // 1. Creamos un nuevo watcher que reaccionará a cambios en el sistema operativo
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        match res {
            Ok(event) => {
                // Si se crea o se borra un archivo, le avisamos a Vue
                if matches!(event.kind, EventKind::Create(_) | EventKind::Remove(_)) {
                    let _ = app_handle.emit("library-updated", ());
                }
            }
            Err(e) => eprintln!("Error en el watcher: {:?}", e),
        }
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
    let (tx, rx) = unbounded::<AudioCommand>();
    let position_state = Arc::new(Mutex::new(0.0));

    let player_state = AudioPlayerState {
        tx,
        // Clonamos la referencia de Arc para el estado de Tauri,
        // así nos queda el original para el hilo de audio
        current_position_secs: Arc::clone(&position_state),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(player_state)
        .manage(LibraryWatcherState {
            watcher: std::sync::Mutex::new(None),
        })
        .setup(move |app| {
            // <-- IMPORTANTE: Añadir 'move' aquí
            let db_path = init_library_cache_db(app.handle())?;
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
            get_music_directories,
            save_music_directories,
            set_music_directories,
            get_recent_global_searches,
            set_recent_global_searches,
            get_app_session,
            set_app_session,
        ])
        .run(tauri::generate_context!())
        .expect("Error al iniciar la aplicación Tauri");
}
