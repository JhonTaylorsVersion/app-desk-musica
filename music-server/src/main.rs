mod auth;
mod catalog;
mod config;
mod desktop_data;
mod routes;
mod state;

use anyhow::Context;
use axum::middleware;
use axum::routing::{get, post};
use axum::Router;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;

use crate::auth::bearer_auth;
use crate::catalog::{resolve_library_roots, scan_library};
use crate::config::AppConfig;
use crate::routes::app_data::{
    add_track_to_playlist_route, create_playlist_route, delete_playlist_route,
    get_app_session_route, get_connect_state_route, get_playback_contexts_route,
    get_playlists_route, get_recent_searches_route, post_connect_command_route,
    put_active_device_route, put_device_session_route,
    remove_track_from_playlist_route, rename_playlist_route, set_app_session_route,
    set_recent_searches_route,
};
use crate::routes::browse::{
    get_album, get_artist, list_albums, list_artists, playlist_tracks, search_library,
};
use crate::routes::health::healthcheck;
use crate::routes::library::{
    get_track, get_track_cover, get_track_metadata, list_tracks, rescan_library, stream_canvas,
    stream_track,
};
use crate::state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing();

    let config = AppConfig::from_env();
    let addr = config.socket_addr();
    let (roots, source) = resolve_library_roots(config.library_root.as_deref());
    let library = scan_library(&roots, source)?;
    let state = AppState::new(config, library);

    let api_routes = Router::new()
        .route("/api/v1/library/tracks", get(list_tracks))
        .route("/api/v1/library/tracks/{id}", get(get_track))
        .route("/api/v1/library/tracks/{id}/metadata", get(get_track_metadata))
        .route("/api/v1/library/tracks/{id}/cover", get(get_track_cover))
        .route("/api/v1/library/tracks/{id}/canvas", get(stream_canvas))
        .route("/api/v1/library/tracks/{id}/stream", get(stream_track))
        .route("/api/v1/library/rescan", post(rescan_library))
        .route("/api/v1/artists", get(list_artists))
        .route("/api/v1/artists/{id}", get(get_artist))
        .route("/api/v1/albums", get(list_albums))
        .route("/api/v1/albums/{id}", get(get_album))
        .route("/api/v1/search", get(search_library))
        .route("/api/v1/catalog", get(playlist_tracks))
        .route("/api/v1/playlists", get(get_playlists_route).post(create_playlist_route))
        .route("/api/v1/playlists/{id}", axum::routing::patch(rename_playlist_route).delete(delete_playlist_route))
        .route("/api/v1/playlists/{id}/tracks", post(add_track_to_playlist_route).delete(remove_track_from_playlist_route))
        .route("/api/v1/recent-searches", get(get_recent_searches_route).put(set_recent_searches_route))
        .route("/api/v1/app-session", get(get_app_session_route).put(set_app_session_route))
        .route("/api/v1/connect/state", get(get_connect_state_route))
        .route("/api/v1/connect/active-device", axum::routing::put(put_active_device_route))
        .route("/api/v1/connect/devices/{device}/session", axum::routing::put(put_device_session_route))
        .route("/api/v1/connect/commands", post(post_connect_command_route))
        .route("/api/v1/playback-contexts", get(get_playback_contexts_route))
        .layer(middleware::from_fn_with_state(state.clone(), bearer_auth));

    let app = Router::new()
        .route("/health", get(healthcheck))
        .merge(api_routes)
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .layer(TraceLayer::new_for_http())
        .with_state(state.clone());

    let listener = TcpListener::bind(addr)
        .await
        .with_context(|| format!("No se pudo abrir el puerto {}", addr))?;

    info!(
        host = %state.config.host,
        port = state.config.port,
        library_roots = ?state.library.read().await.roots,
        auth_enabled = state.config.auth_token.is_some(),
        "music-server listo"
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("El servidor se detuvo con error")?;

    Ok(())
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "music_server=debug,tower_http=info".into()),
        )
        .with_target(false)
        .compact()
        .init();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{signal, SignalKind};

        if let Ok(mut stream) = signal(SignalKind::terminate()) {
            stream.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
