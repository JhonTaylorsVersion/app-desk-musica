use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;

use crate::desktop_data::{
    add_track_to_playlist, create_playlist, delete_playlist, enqueue_connect_command,
    get_app_session, get_connect_state, get_recent_searches, list_playlists,
    remove_track_from_playlist, rename_playlist, set_active_device, set_app_session,
    set_device_session, set_recent_searches, ConnectCommandRecord, ConnectStateRecord,
    DesktopSessionRecord, PlaylistRecord, RecentSearchRecord,
};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct CreatePlaylistPayload {
    pub name: String,
}

#[derive(Deserialize)]
pub struct RenamePlaylistPayload {
    pub name: String,
}

#[derive(Deserialize)]
pub struct PlaylistTrackPayload {
    pub track_path: String,
    pub allow_duplicate: Option<bool>,
}

#[derive(Deserialize)]
pub struct ConnectCommandPayload {
    pub command: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Deserialize)]
pub struct DeviceSessionPayload {
    pub session: serde_json::Value,
    #[serde(default)]
    pub make_active: bool,
}

#[derive(Deserialize)]
pub struct ActiveDevicePayload {
    pub device: String,
}

pub async fn get_playlists_route() -> Result<Json<Vec<PlaylistRecord>>, (StatusCode, Json<serde_json::Value>)> {
    list_playlists()
        .map(Json)
        .map_err(internal_error)
}

pub async fn get_app_session_route(
) -> Result<Json<DesktopSessionRecord>, (StatusCode, Json<serde_json::Value>)> {
    get_app_session()
        .map(Json)
        .map_err(internal_error)
}

pub async fn set_app_session_route(
    Json(session): Json<serde_json::Value>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    set_app_session(&session)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(internal_error)
}

pub async fn get_connect_state_route(
) -> Result<Json<ConnectStateRecord>, (StatusCode, Json<serde_json::Value>)> {
    get_connect_state()
        .map(Json)
        .map_err(internal_error)
}

pub async fn put_device_session_route(
    Path(device): Path<String>,
    Json(payload): Json<DeviceSessionPayload>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    set_device_session(&device, &payload.session, payload.make_active)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(internal_error)
}

pub async fn put_active_device_route(
    Json(payload): Json<ActiveDevicePayload>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    set_active_device(&payload.device)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(internal_error)
}

pub async fn post_connect_command_route(
    Json(payload): Json<ConnectCommandPayload>,
) -> Result<Json<ConnectCommandRecord>, (StatusCode, Json<serde_json::Value>)> {
    let command = payload.command.trim();
    if command.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "invalid_command",
                "message": "El comando no puede estar vacio",
            })),
        ));
    }

    enqueue_connect_command(command, payload.payload)
        .map(Json)
        .map_err(internal_error)
}

pub async fn create_playlist_route(
    Json(payload): Json<CreatePlaylistPayload>,
) -> Result<Json<PlaylistRecord>, (StatusCode, Json<serde_json::Value>)> {
    create_playlist(&payload.name)
        .map(Json)
        .map_err(internal_error)
}

pub async fn rename_playlist_route(
    Path(playlist_id): Path<i64>,
    Json(payload): Json<RenamePlaylistPayload>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    rename_playlist(playlist_id, &payload.name)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(internal_error)
}

pub async fn delete_playlist_route(
    Path(playlist_id): Path<i64>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    delete_playlist(playlist_id)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(internal_error)
}

pub async fn add_track_to_playlist_route(
    Path(playlist_id): Path<i64>,
    Json(payload): Json<PlaylistTrackPayload>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    add_track_to_playlist(
        playlist_id,
        &payload.track_path,
        payload.allow_duplicate.unwrap_or(false),
    )
    .map(|_| StatusCode::NO_CONTENT)
    .map_err(internal_error)
}

pub async fn remove_track_from_playlist_route(
    Path(playlist_id): Path<i64>,
    Json(payload): Json<PlaylistTrackPayload>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    remove_track_from_playlist(playlist_id, &payload.track_path)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(internal_error)
}

pub async fn get_recent_searches_route() -> Result<Json<Vec<RecentSearchRecord>>, (StatusCode, Json<serde_json::Value>)> {
    get_recent_searches()
        .map(Json)
        .map_err(internal_error)
}

pub async fn set_recent_searches_route(
    Json(items): Json<Vec<RecentSearchRecord>>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    set_recent_searches(&items)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(internal_error)
}

pub async fn get_playback_contexts_route(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let library = state.library.read().await;
    let playlists = list_playlists().unwrap_or_default();

    let artists = library
        .tracks
        .iter()
        .map(|track| track.artist.clone())
        .collect::<std::collections::BTreeSet<_>>();

    let albums = library
        .tracks
        .iter()
        .map(|track| format!("{}::{}", track.album, track.album_artist))
        .collect::<std::collections::BTreeSet<_>>();

    Json(serde_json::json!({
        "library_tracks": library.tracks.len(),
        "artists": artists.len(),
        "albums": albums.len(),
        "playlists": playlists.len(),
    }))
}

fn internal_error(error: anyhow::Error) -> (StatusCode, Json<serde_json::Value>) {
    tracing::error!(error = %error, "music-server app data error");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({
            "error": "internal_server_error",
            "message": error.to_string(),
        })),
    )
}
