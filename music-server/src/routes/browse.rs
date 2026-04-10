use std::collections::BTreeMap;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::catalog::{build_album_summaries, build_artist_summaries, AlbumSummary, ArtistSummary};
use crate::routes::library::TrackSummary;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
}

#[derive(Serialize)]
pub struct SearchResponse {
    pub query: String,
    pub top_tracks: Vec<TrackSummary>,
    pub artists: Vec<ArtistSummary>,
    pub albums: Vec<AlbumSummary>,
}

#[derive(Serialize)]
pub struct ArtistDetailResponse {
    pub artist: ArtistSummary,
    pub tracks: Vec<TrackSummary>,
    pub albums: Vec<AlbumSummary>,
}

#[derive(Serialize)]
pub struct AlbumDetailResponse {
    pub album: AlbumSummary,
    pub tracks: Vec<TrackSummary>,
}

pub async fn list_artists(State(state): State<AppState>) -> Json<Vec<ArtistSummary>> {
    let library = state.library.read().await;
    Json(build_artist_summaries(&library.tracks))
}

pub async fn get_artist(
    State(state): State<AppState>,
    Path(artist_id): Path<String>,
) -> Result<Json<ArtistDetailResponse>, (StatusCode, Json<serde_json::Value>)> {
    let library = state.library.read().await;
    let artists = build_artist_summaries(&library.tracks);
    let artist = artists
        .iter()
        .find(|item| item.id == artist_id)
        .cloned()
        .ok_or_else(not_found)?;

    let tracks = library
        .tracks
        .iter()
        .filter(|track| track.artist == artist.name)
        .cloned()
        .map(TrackSummary::from)
        .collect::<Vec<_>>();

    let albums = build_album_summaries(
        &library
            .tracks
            .iter()
            .filter(|track| track.artist == artist.name)
            .cloned()
            .collect::<Vec<_>>(),
    );

    Ok(Json(ArtistDetailResponse { artist, tracks, albums }))
}

pub async fn list_albums(State(state): State<AppState>) -> Json<Vec<AlbumSummary>> {
    let library = state.library.read().await;
    Json(build_album_summaries(&library.tracks))
}

pub async fn get_album(
    State(state): State<AppState>,
    Path(album_id): Path<String>,
) -> Result<Json<AlbumDetailResponse>, (StatusCode, Json<serde_json::Value>)> {
    let library = state.library.read().await;
    let albums = build_album_summaries(&library.tracks);
    let album = albums
        .iter()
        .find(|item| item.id == album_id)
        .cloned()
        .ok_or_else(not_found)?;

    let tracks = library
        .tracks
        .iter()
        .filter(|track| track.album == album.name && track.album_artist == album.artist)
        .cloned()
        .map(TrackSummary::from)
        .collect::<Vec<_>>();

    Ok(Json(AlbumDetailResponse { album, tracks }))
}

pub async fn search_library(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Json<SearchResponse> {
    let normalized = query.q.unwrap_or_default().trim().to_lowercase();
    let library = state.library.read().await;

    if normalized.is_empty() {
        return Json(SearchResponse {
            query: String::new(),
            top_tracks: library
                .tracks
                .iter()
                .take(10)
                .cloned()
                .map(TrackSummary::from)
                .collect(),
            artists: build_artist_summaries(&library.tracks).into_iter().take(6).collect(),
            albums: build_album_summaries(&library.tracks).into_iter().take(6).collect(),
        });
    }

    let filtered_tracks = library
        .tracks
        .iter()
        .filter(|track| {
            format!(
                "{} {} {} {} {}",
                track.title, track.artist, track.album, track.album_artist, track.file_name
            )
            .to_lowercase()
            .contains(&normalized)
        })
        .cloned()
        .collect::<Vec<_>>();

    let filtered_artists = {
        let grouped = build_artist_summaries(&library.tracks);
        grouped
            .into_iter()
            .filter(|artist| artist.name.to_lowercase().contains(&normalized))
            .take(8)
            .collect::<Vec<_>>()
    };

    let filtered_albums = {
        let grouped = build_album_summaries(&library.tracks);
        grouped
            .into_iter()
            .filter(|album| {
                format!("{} {}", album.name, album.artist)
                    .to_lowercase()
                    .contains(&normalized)
            })
            .take(8)
            .collect::<Vec<_>>()
    };

    Json(SearchResponse {
        query: normalized,
        top_tracks: filtered_tracks
            .into_iter()
            .take(20)
            .map(TrackSummary::from)
            .collect(),
        artists: filtered_artists,
        albums: filtered_albums,
    })
}

pub async fn playlist_tracks(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let library = state.library.read().await;
    let mut album_map = BTreeMap::new();
    for album in build_album_summaries(&library.tracks) {
        album_map.insert(album.id.clone(), album);
    }

    Json(serde_json::json!({
        "artists": build_artist_summaries(&library.tracks),
        "albums": album_map.into_values().collect::<Vec<_>>(),
    }))
}

fn not_found() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({
            "error": "entity_not_found"
        })),
    )
}
