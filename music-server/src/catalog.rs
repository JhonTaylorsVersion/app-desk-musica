use std::env;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use anyhow::Context;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::prelude::Accessor;
use lofty::read_from_path;
use lofty::tag::{ItemKey, Tag};
use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;
use walkdir::WalkDir;

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "m4a", "aac", "opus", "aiff", "alac", "wma",
];

#[derive(Clone, Debug, Serialize)]
pub struct TrackRecord {
    pub id: String,
    pub path: PathBuf,
    pub file_name: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub format: String,
    pub duration_seconds: Option<u32>,
    pub duration_formatted: Option<String>,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u8>,
    pub channels: Option<u8>,
    pub file_size: u64,
    pub modified_at: Option<u64>,
    pub has_cover_art: bool,
    pub quality: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct TrackMetadataPayload {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub composer: Option<String>,
    pub lyricist: Option<String>,
    pub comment: Option<String>,
    pub lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
    pub track_number: Option<String>,
    pub track_total: Option<String>,
    pub disc_number: Option<String>,
    pub disc_total: Option<String>,
    pub year: Option<String>,
    pub release_date: Option<String>,
    pub duration_seconds: Option<u32>,
    pub duration_formatted: Option<String>,
    pub channels: Option<u8>,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u8>,
    pub audio_bitrate: Option<u32>,
    pub overall_bitrate: Option<u32>,
    pub has_cover_art: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct ArtistSummary {
    pub id: String,
    pub name: String,
    pub album_count: usize,
    pub track_count: usize,
    pub cover_track_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct AlbumSummary {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub year: Option<String>,
    pub track_count: usize,
    pub cover_track_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct LibraryIndex {
    pub tracks: Vec<TrackRecord>,
    pub roots: Vec<PathBuf>,
    pub source: String,
    pub scanned_at_unix: u64,
}

impl Default for LibraryIndex {
    fn default() -> Self {
        Self {
            tracks: Vec::new(),
            roots: Vec::new(),
            source: "uninitialized".to_string(),
            scanned_at_unix: current_unix_timestamp(),
        }
    }
}

pub fn resolve_library_roots(explicit_root: Option<&Path>) -> (Vec<PathBuf>, String) {
    if let Some(root) = explicit_root.filter(|path| path.exists()) {
        return (vec![root.to_path_buf()], "env-config".to_string());
    }

    let roots_from_db = load_roots_from_desktop_app_db().unwrap_or_default();
    if !roots_from_db.is_empty() {
        return (roots_from_db, "desktop-app-db".to_string());
    }

    let fallback_music_dir = env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .map(|profile| profile.join("Music"))
        .filter(|path| path.exists())
        .map(|path| vec![path])
        .unwrap_or_default();

    if !fallback_music_dir.is_empty() {
        return (fallback_music_dir, "user-music-fallback".to_string());
    }

    (Vec::new(), "missing-library-roots".to_string())
}

pub fn scan_library(roots: &[PathBuf], source: String) -> anyhow::Result<LibraryIndex> {
    let mut tracks = Vec::new();

    for root in roots {
        for entry in WalkDir::new(root)
            .follow_links(true)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let path = entry.into_path();
            if !is_supported_audio_file(&path) {
                continue;
            }

            match read_track_record(&path) {
                Ok(track) => tracks.push(track),
                Err(error) => {
                    tracing::warn!(path = %path.display(), error = %error, "No se pudo leer metadata");
                }
            }
        }
    }

    tracks.sort_by(|left, right| {
        left.artist
            .cmp(&right.artist)
            .then_with(|| left.album.cmp(&right.album))
            .then_with(|| left.title.cmp(&right.title))
    });

    Ok(LibraryIndex {
        tracks,
        roots: roots.to_vec(),
        source,
        scanned_at_unix: current_unix_timestamp(),
    })
}

pub fn extract_cover_art(path: &Path) -> anyhow::Result<Option<(Vec<u8>, String)>> {
    let tagged_file =
        read_from_path(path).with_context(|| format!("No se pudo abrir {}", path.display()))?;
    let tags = build_tag_list(&tagged_file);

    for tag in &tags {
        if let Some(pic) = tag
            .get_picture_type(PictureType::CoverFront)
            .or_else(|| tag.pictures().first())
        {
            let mime = pic
                .mime_type()
                .map(|value| format!("{:?}", value).to_lowercase())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "image/jpeg".to_string());

            return Ok(Some((pic.data().to_vec(), mime)));
        }
    }

    Ok(None)
}

pub fn read_full_metadata(path: &Path) -> anyhow::Result<TrackMetadataPayload> {
    let tagged_file =
        read_from_path(path).with_context(|| format!("No se pudo abrir {}", path.display()))?;
    let tags = build_tag_list(&tagged_file);
    let properties = tagged_file.properties();
    let duration_seconds = properties.duration().as_secs() as u32;
    let synced_lyrics = std::fs::read_to_string(path.with_extension("lrc")).ok();

    Ok(TrackMetadataPayload {
        title: first_text(&tags, |tag| tag.title().map(|s| s.to_string())),
        artist: first_text(&tags, |tag| tag.artist().map(|s| s.to_string())),
        album: first_text(&tags, |tag| tag.album().map(|s| s.to_string())),
        genre: first_text(&tags, |tag| tag.genre().map(|s| s.to_string())),
        album_artist: first_text(&tags, |tag| {
            tag.get_string(ItemKey::AlbumArtist).map(|s| s.to_string())
        }),
        composer: first_text(&tags, |tag| {
            tag.get_string(ItemKey::Composer).map(|s| s.to_string())
        }),
        lyricist: first_text(&tags, |tag| {
            tag.get_string(ItemKey::Lyricist).map(|s| s.to_string())
        }),
        comment: first_text(&tags, |tag| {
            tag.get_string(ItemKey::Comment).map(|s| s.to_string())
        }),
        lyrics: first_text(&tags, |tag| {
            tag.get_string(ItemKey::Lyrics)
                .or_else(|| tag.get_string(ItemKey::UnsyncLyrics))
                .map(|s| s.to_string())
        }),
        synced_lyrics,
        track_number: first_text(&tags, |tag| {
            tag.get_string(ItemKey::TrackNumber).map(|s| s.to_string())
        }),
        track_total: first_text(&tags, |tag| {
            tag.get_string(ItemKey::TrackTotal).map(|s| s.to_string())
        }),
        disc_number: first_text(&tags, |tag| {
            tag.get_string(ItemKey::DiscNumber).map(|s| s.to_string())
        }),
        disc_total: first_text(&tags, |tag| {
            tag.get_string(ItemKey::DiscTotal).map(|s| s.to_string())
        }),
        year: first_text(&tags, |tag| {
            tag.get_string(ItemKey::Year).map(|s| s.to_string())
        }),
        release_date: first_text(&tags, |tag| {
            tag.get_string(ItemKey::ReleaseDate).map(|s| s.to_string())
        }),
        duration_seconds: Some(duration_seconds),
        duration_formatted: Some(format_duration(duration_seconds)),
        channels: properties.channels(),
        sample_rate: properties.sample_rate(),
        bit_depth: properties.bit_depth(),
        audio_bitrate: properties.audio_bitrate(),
        overall_bitrate: properties.overall_bitrate(),
        has_cover_art: tags.iter().any(|tag| {
            tag.get_picture_type(PictureType::CoverFront).is_some() || !tag.pictures().is_empty()
        }),
    })
}

pub fn canvas_video_path(path: &Path) -> Option<PathBuf> {
    let file_stem = path.file_stem()?.to_str()?.trim();
    let user_profile = env::var_os("USERPROFILE").map(PathBuf::from)?;
    let candidate = user_profile
        .join("Videos")
        .join("CANVAS SPOT")
        .join(format!("{file_stem}.mp4"));

    candidate.exists().then_some(candidate)
}

pub fn build_artist_summaries(tracks: &[TrackRecord]) -> Vec<ArtistSummary> {
    let mut grouped = std::collections::BTreeMap::<String, Vec<&TrackRecord>>::new();
    for track in tracks {
        grouped.entry(track.artist.clone()).or_default().push(track);
    }

    grouped
        .into_iter()
        .map(|(name, items)| ArtistSummary {
            id: Uuid::new_v5(&Uuid::NAMESPACE_URL, format!("artist:{name}").as_bytes()).to_string(),
            name,
            album_count: items
                .iter()
                .map(|track| format!("{}::{}", track.album, track.album_artist))
                .collect::<std::collections::BTreeSet<_>>()
                .len(),
            track_count: items.len(),
            cover_track_id: items.iter().find(|track| track.has_cover_art).map(|track| track.id.clone()),
        })
        .collect()
}

pub fn build_album_summaries(tracks: &[TrackRecord]) -> Vec<AlbumSummary> {
    let mut grouped = std::collections::BTreeMap::<(String, String), Vec<&TrackRecord>>::new();
    for track in tracks {
        grouped
            .entry((track.album.clone(), track.album_artist.clone()))
            .or_default()
            .push(track);
    }

    grouped
        .into_iter()
        .map(|((name, artist), items)| AlbumSummary {
            id: Uuid::new_v5(
                &Uuid::NAMESPACE_URL,
                format!("album:{name}::{artist}").as_bytes(),
            )
            .to_string(),
            name,
            artist,
            year: None,
            track_count: items.len(),
            cover_track_id: items.iter().find(|track| track.has_cover_art).map(|track| track.id.clone()),
        })
        .collect()
}

fn load_roots_from_desktop_app_db() -> anyhow::Result<Vec<PathBuf>> {
    let app_data = env::var_os("APPDATA")
        .map(PathBuf::from)
        .context("APPDATA no está disponible")?;
    let db_path = app_data.join("com.tauri.dev").join("library_cache.db");

    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let conn = Connection::open(&db_path)
        .with_context(|| format!("No se pudo abrir {}", db_path.display()))?;

    let mut stmt = conn
        .prepare("SELECT path FROM music_directories ORDER BY id ASC")
        .context("No se pudo consultar music_directories")?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .context("No se pudo leer music_directories")?;

    let mut roots = Vec::new();
    for row in rows {
        let root = PathBuf::from(row?);
        if root.exists() {
            roots.push(root);
        }
    }

    Ok(roots)
}

fn read_track_record(path: &Path) -> anyhow::Result<TrackRecord> {
    let tagged_file =
        read_from_path(path).with_context(|| format!("No se pudo abrir {}", path.display()))?;
    let tags = build_tag_list(&tagged_file);
    let properties = tagged_file.properties();
    let metadata = std::fs::metadata(path)
        .with_context(|| format!("No se pudo leer metadata {}", path.display()))?;

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_string();

    let title = first_text(&tags, |tag| tag.title().map(|value| value.to_string()))
        .unwrap_or_else(|| file_name.clone());
    let artist = first_text(&tags, |tag| tag.artist().map(|value| value.to_string()))
        .unwrap_or_else(|| "Artista desconocido".to_string());
    let album = first_text(&tags, |tag| tag.album().map(|value| value.to_string()))
        .unwrap_or_else(|| "Sin album".to_string());
    let album_artist = first_text(&tags, |tag| {
        tag.get_string(ItemKey::AlbumArtist).map(|value| value.to_string())
    })
    .unwrap_or_else(|| artist.clone());

    let duration_seconds = properties.duration().as_secs() as u32;
    let format = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_lowercase();

    let has_cover_art = tags.iter().any(|tag| {
        tag.get_picture_type(PictureType::CoverFront).is_some() || !tag.pictures().is_empty()
    });

    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs());

    let id = Uuid::new_v5(
        &Uuid::NAMESPACE_URL,
        path.to_string_lossy().as_bytes(),
    )
    .to_string();

    Ok(TrackRecord {
        id,
        path: path.to_path_buf(),
        file_name,
        title,
        artist,
        album,
        album_artist,
        format,
        duration_seconds: Some(duration_seconds),
        duration_formatted: Some(format_duration(duration_seconds)),
        sample_rate: properties.sample_rate(),
        bit_depth: properties.bit_depth(),
        channels: properties.channels(),
        file_size: metadata.len(),
        modified_at,
        has_cover_art,
        quality: "original".to_string(),
    })
}

fn is_supported_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|ext| SUPPORTED_EXTENSIONS.iter().any(|allowed| allowed.eq_ignore_ascii_case(ext)))
        .unwrap_or(false)
}

fn build_tag_list<'a>(tagged_file: &'a lofty::file::TaggedFile) -> Vec<&'a Tag> {
    let mut tags = Vec::new();

    if let Some(primary) = tagged_file.primary_tag() {
        tags.push(primary);
    }

    for tag in tagged_file.tags() {
        if !tags.iter().any(|current| current.tag_type() == tag.tag_type()) {
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
            let normalized = value.trim();
            if !normalized.is_empty() {
                return Some(normalized.to_string());
            }
        }
    }

    None
}

fn format_duration(total_seconds: u32) -> String {
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;

    if hours > 0 {
        format!("{hours:02}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes:02}:{seconds:02}")
    }
}

fn current_unix_timestamp() -> u64 {
    UNIX_EPOCH.elapsed().map(|value| value.as_secs()).unwrap_or(0)
}
