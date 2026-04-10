use std::io::SeekFrom;

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::header;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::catalog::{
    canvas_video_path, extract_cover_art, read_full_metadata, scan_library, TrackMetadataPayload,
    TrackRecord,
};
use crate::state::AppState;

#[derive(Clone, Serialize)]
pub struct TrackSummary {
    pub id: String,
    pub file_path: String,
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
    pub has_cover_art: bool,
    pub quality: String,
}

#[derive(Serialize)]
pub struct LibraryTracksResponse {
    pub items: Vec<TrackSummary>,
    pub total: usize,
    pub source: String,
    pub roots: Vec<String>,
    pub scanned_at_unix: u64,
}

#[derive(Serialize)]
pub struct TrackDetailResponse {
    pub track: TrackSummary,
    pub file_path: String,
    pub file_size: u64,
    pub modified_at: Option<u64>,
    pub stream_url: String,
    pub cover_url: Option<String>,
    pub canvas_url: Option<String>,
    pub metadata_url: String,
    pub stream_ready: bool,
    pub cover_ready: bool,
    pub canvas_ready: bool,
    pub access_mode: String,
}

pub async fn list_tracks(State(state): State<AppState>) -> Json<LibraryTracksResponse> {
    let library = state.library.read().await;
    let items = library
        .tracks
        .iter()
        .cloned()
        .map(TrackSummary::from)
        .collect::<Vec<_>>();
    let total = items.len();

    Json(LibraryTracksResponse {
        items,
        total,
        source: library.source.clone(),
        roots: library
            .roots
            .iter()
            .map(|path| path.display().to_string())
            .collect(),
        scanned_at_unix: library.scanned_at_unix,
    })
}

pub async fn get_track(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<TrackDetailResponse>, (StatusCode, Json<serde_json::Value>)> {
    let library = state.library.read().await;
    let track = library
        .tracks
        .iter()
        .find(|item| item.id == id)
        .cloned()
        .ok_or_else(not_found)?;

    Ok(Json(TrackDetailResponse {
        file_path: track.path.display().to_string(),
        file_size: track.file_size,
        modified_at: track.modified_at,
        stream_url: format!("/api/v1/library/tracks/{}/stream", track.id),
        cover_url: track
            .has_cover_art
            .then(|| format!("/api/v1/library/tracks/{}/cover", track.id)),
        canvas_url: canvas_video_path(&track.path)
            .map(|_| format!("/api/v1/library/tracks/{}/canvas", track.id)),
        metadata_url: format!("/api/v1/library/tracks/{}/metadata", track.id),
        track: TrackSummary::from(track.clone()),
        stream_ready: true,
        cover_ready: track.has_cover_art,
        canvas_ready: canvas_video_path(&track.path).is_some(),
        access_mode: library.source.clone(),
    }))
}

pub async fn get_track_metadata(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<TrackMetadataPayload>, (StatusCode, Json<serde_json::Value>)> {
    let track = {
        let library = state.library.read().await;
        library
            .tracks
            .iter()
            .find(|item| item.id == id)
            .cloned()
            .ok_or_else(not_found)?
    };

    read_full_metadata(&track.path)
        .map(Json)
        .map_err(internal_error)
}

pub async fn get_track_cover(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let track = {
        let library = state.library.read().await;
        library
            .tracks
            .iter()
            .find(|item| item.id == id)
            .cloned()
            .ok_or_else(not_found)?
    };

    let Some((bytes, mime_type)) =
        extract_cover_art(&track.path).map_err(internal_error)?
    else {
        return Err(not_found_cover());
    };

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&mime_type).map_err(|_| internal_error_message("mime_type_invalido"))?,
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=86400"),
    );

    Ok((StatusCode::OK, headers, bytes).into_response())
}

pub async fn stream_track(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let track = {
        let library = state.library.read().await;
        library
            .tracks
            .iter()
            .find(|item| item.id == id)
            .cloned()
            .ok_or_else(not_found)?
    };

    stream_file_with_range(track.path, "application/octet-stream", headers).await
}

pub async fn stream_canvas(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let track = {
        let library = state.library.read().await;
        library
            .tracks
            .iter()
            .find(|item| item.id == id)
            .cloned()
            .ok_or_else(not_found)?
    };

    let Some(canvas_path) = canvas_video_path(&track.path) else {
        return Err(not_found_canvas());
    };

    stream_file_with_range(canvas_path, "video/mp4", headers).await
}

pub async fn rescan_library(
    State(state): State<AppState>,
) -> Result<Json<LibraryTracksResponse>, (StatusCode, Json<serde_json::Value>)> {
    let roots = {
        let library = state.library.read().await;
        library.roots.clone()
    };

    if roots.is_empty() {
        return Err(internal_error_message("No hay carpetas configuradas para escanear"));
    }

    let refreshed = scan_library(&roots, "manual-rescan".to_string()).map_err(internal_error)?;

    {
        let mut library = state.library.write().await;
        *library = refreshed.clone();
    }

    let items = refreshed
        .tracks
        .iter()
        .cloned()
        .map(TrackSummary::from)
        .collect::<Vec<_>>();
    let total = items.len();

    Ok(Json(LibraryTracksResponse {
        items,
        total,
        source: refreshed.source,
        roots: refreshed
            .roots
            .iter()
            .map(|path| path.display().to_string())
            .collect(),
        scanned_at_unix: refreshed.scanned_at_unix,
    }))
}

async fn stream_file_with_range(
    path: std::path::PathBuf,
    fallback_content_type: &str,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let file = File::open(&path)
        .await
        .map_err(|error| internal_error(error.into()))?;
    let metadata = file
        .metadata()
        .await
        .map_err(|error| internal_error(error.into()))?;
    let file_size = metadata.len();
    let content_type = mime_guess::from_path(&path)
        .first_raw()
        .unwrap_or(fallback_content_type)
        .to_string();

    if let Some(range_header) = headers.get(header::RANGE).and_then(|value| value.to_str().ok()) {
        let (start, end) = parse_range_header(range_header, file_size)?;
        let content_length = end - start + 1;

        let mut ranged_file = file;
        ranged_file
            .seek(SeekFrom::Start(start))
            .await
            .map_err(|error| internal_error(error.into()))?;

        let stream = ReaderStream::new(ranged_file.take(content_length));
        let body = Body::from_stream(stream);

        let mut response_headers = HeaderMap::new();
        response_headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_str(&content_type)
                .map_err(|_| internal_error_message("content_type_invalido"))?,
        );
        response_headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
        response_headers.insert(
            header::CONTENT_LENGTH,
            HeaderValue::from_str(&content_length.to_string())
                .map_err(|_| internal_error_message("content_length_invalido"))?,
        );
        response_headers.insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes {}-{}/{}", start, end, file_size))
                .map_err(|_| internal_error_message("content_range_invalido"))?,
        );

        return Ok((StatusCode::PARTIAL_CONTENT, response_headers, body).into_response());
    }

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&content_type)
            .map_err(|_| internal_error_message("content_type_invalido"))?,
    );
    response_headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    response_headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&file_size.to_string())
            .map_err(|_| internal_error_message("content_length_invalido"))?,
    );

    Ok((StatusCode::OK, response_headers, body).into_response())
}

impl From<TrackRecord> for TrackSummary {
    fn from(value: TrackRecord) -> Self {
        Self {
            id: value.id,
            file_path: value.path.display().to_string(),
            title: value.title,
            artist: value.artist,
            album: value.album,
            album_artist: value.album_artist,
            format: value.format,
            duration_seconds: value.duration_seconds,
            duration_formatted: value.duration_formatted,
            sample_rate: value.sample_rate,
            bit_depth: value.bit_depth,
            channels: value.channels,
            has_cover_art: value.has_cover_art,
            quality: value.quality,
        }
    }
}

fn not_found() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({
            "error": "track_not_found"
        })),
    )
}

fn not_found_cover() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({
            "error": "cover_not_found"
        })),
    )
}

fn not_found_canvas() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({
            "error": "canvas_not_found"
        })),
    )
}

fn internal_error(error: anyhow::Error) -> (StatusCode, Json<serde_json::Value>) {
    tracing::error!(error = %error, "music-server request error");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({
            "error": "internal_server_error",
            "message": error.to_string(),
        })),
    )
}

fn internal_error_message(message: &'static str) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({
            "error": "internal_server_error",
            "message": message,
        })),
    )
}

fn parse_range_header(
    range_header: &str,
    file_size: u64,
) -> Result<(u64, u64), (StatusCode, Json<serde_json::Value>)> {
    if file_size == 0 {
        return Err((
            StatusCode::RANGE_NOT_SATISFIABLE,
            Json(serde_json::json!({ "error": "empty_file" })),
        ));
    }

    let Some(raw) = range_header.strip_prefix("bytes=") else {
        return Err(range_not_satisfiable("range_prefix_invalido"));
    };

    let Some((start_raw, end_raw)) = raw.split_once('-') else {
        return Err(range_not_satisfiable("range_formato_invalido"));
    };

    let start = if start_raw.is_empty() {
        let suffix_length = end_raw
            .parse::<u64>()
            .map_err(|_| range_not_satisfiable("range_suffix_invalido"))?;
        file_size.saturating_sub(suffix_length)
    } else {
        start_raw
            .parse::<u64>()
            .map_err(|_| range_not_satisfiable("range_inicio_invalido"))?
    };

    let end = if end_raw.is_empty() {
        file_size - 1
    } else {
        end_raw
            .parse::<u64>()
            .map_err(|_| range_not_satisfiable("range_fin_invalido"))?
    };

    if start >= file_size || end >= file_size || start > end {
        return Err(range_not_satisfiable("range_fuera_de_limites"));
    }

    Ok((start, end))
}

fn range_not_satisfiable(message: &'static str) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::RANGE_NOT_SATISFIABLE,
        Json(serde_json::json!({
            "error": "invalid_range",
            "message": message,
        })),
    )
}
