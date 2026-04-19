use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use spotiflac_core_rs::engine::SpotiFLACEngine;
use spotiflac_core_rs::models::AppConfig;
use spotiflac_core_rs::progress::{
    DownloadQueueInfo, DownloadStatus, ProgressHandler, ProgressInfo, ProgressUpdate,
};
use spotiflac_core_rs::storage::history::FetchHistoryItem;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

pub struct AppState {
    pub engine: SpotiFLACEngine,
}

pub struct TauriProgressHandler {
    app_handle: AppHandle,
}

impl TauriProgressHandler {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }
}

impl ProgressHandler for TauriProgressHandler {
    fn on_progress(&self, update: ProgressUpdate) {
        let _ = self.app_handle.emit("download-progress", update);
    }

    fn on_status_change(&self, item_id: &str, status: DownloadStatus) {
        #[derive(serde::Serialize, Clone)]
        struct StatusUpdate {
            item_id: String,
            status: DownloadStatus,
        }
        let _ = self.app_handle.emit(
            "download-status",
            StatusUpdate {
                item_id: item_id.to_string(),
                status,
            },
        );
    }

    fn on_log(&self, message: String) {
        let _ = self.app_handle.emit("backend-log", message);
    }
}

// ======================================
// REQUEST / RESPONSE TYPES
// ======================================

#[derive(Debug, Deserialize)]
pub struct LyricsDownloadRequest {
    pub spotify_id: String,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub album_artist: Option<String>,
    pub release_date: Option<String>,
    pub isrc: Option<String>,
    pub output_dir: String,
    pub filename_format: String,
    pub track_number: bool,
    pub position: u32,
    pub use_album_track_number: bool,
    pub disc_number: u32,
}

#[derive(Debug, Serialize)]
pub struct LyricsDownloadResponse {
    pub success: bool,
    pub message: String,
    pub file: Option<String>,
    pub error: Option<String>,
    pub already_exists: bool,
}

#[derive(Debug, Deserialize)]
pub struct CoverDownloadRequest {
    pub cover_url: String,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub album_artist: Option<String>,
    pub release_date: Option<String>,
    pub output_dir: String,
    pub filename_format: String,
    pub track_number: bool,
    pub position: u32,
    pub disc_number: u32,
}

#[derive(Debug, Serialize)]
pub struct AssetDownloadResponse {
    pub success: bool,
    pub message: String,
    pub file: Option<String>,
    pub error: Option<String>,
    pub already_exists: bool,
}

#[derive(Debug, Deserialize)]
pub struct HeaderDownloadRequest {
    pub header_url: String,
    pub artist_name: String,
    pub output_dir: String,
}

#[derive(Debug, Deserialize)]
pub struct GalleryImageDownloadRequest {
    pub image_url: String,
    pub artist_name: String,
    pub image_index: usize,
    pub output_dir: String,
}

#[derive(Debug, Deserialize)]
pub struct AvatarDownloadRequest {
    pub avatar_url: String,
    pub artist_name: String,
    pub output_dir: String,
}

#[derive(Debug, Deserialize)]
pub struct FileExistenceTrack {
    pub spotify_id: Option<String>,
    pub name: String,
    pub artists: String,
    pub album_name: Option<String>,
    pub filename_format: Option<String>,
    pub position: Option<u32>,
    pub disc_number: Option<u32>,
    pub album_artist: Option<String>,
    pub release_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileExistenceResult {
    pub spotify_id: Option<String>,
    pub exists: bool,
    pub file_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddQueueRequest {
    pub id: String,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub spotify_id: Option<String>,
}

// ======================================
// DOWNLOAD ENDPOINTS
// ======================================

#[tauri::command]
pub async fn download_track(
    url: String,
    config: AppConfig,
    tidal_id_override: Option<String>,
    state: State<'_, AppState>,
) -> Result<PathBuf, String> {
    state
        .engine
        .download_track(&url, &config, tidal_id_override)
        .await
        .map_err(|e| e.to_string())
}

// ======================================
// METADATA ENDPOINTS
// ======================================

#[tauri::command]
pub async fn get_spotify_metadata(url: String) -> Result<serde_json::Value, String> {
    crate::spotiflac::metadata_compat::get_spotify_metadata_compat(&url).await
}

#[tauri::command]
pub async fn check_track_availability(
    url: String,
    state: State<'_, AppState>,
) -> Result<spotiflac_core_rs::models::TrackAvailability, String> {
    state
        .engine
        .check_track_availability(&url)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_api_status(_api_type: String, api_url: String) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(&api_url).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Fetches real unified API status from the SpotiFLAC status endpoint (with 5s cache + 3 retries)
#[tauri::command]
pub async fn fetch_unified_api_status(force_refresh: bool) -> Result<String, String> {
    spotiflac_core_rs::utils::status::UnifiedStatusResolver::fetch_status_payload(force_refresh)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_preview_url(track_id: String) -> Result<String, String> {
    spotiflac_core_rs::utils::spotify::SpotifyUtils::get_preview_url(&track_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_track_isrc(
    spotify_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state
        .engine
        .resolver
        .resolve_links(&format!("https://open.spotify.com/track/{}", spotify_id), Some(state.engine.progress.clone()))
        .await
        .map(|l| l.isrc)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_spotify(
    query: String,
    limit: u32,
) -> Result<spotiflac_core_rs::models::SearchResponse, String> {
    let client = spotiflac_core_rs::metadata::spotify::SpotifyMetadataClient::new();
    client
        .search(&query, limit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_spotify_by_type(
    query: String,
    search_type: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<spotiflac_core_rs::models::SearchResult>, String> {
    let client = spotiflac_core_rs::metadata::spotify::SpotifyMetadataClient::new();
    client
        .search_by_type(&query, &search_type, limit, offset)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_streaming_urls(
    url: String,
    region: Option<String>,
    state: State<'_, AppState>,
) -> Result<spotiflac_core_rs::models::SongLinkData, String> {
    state
        .engine
        .get_streaming_urls(&url, region.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Persists a fetch history item to the sled DB via the engine's HistoryManager
#[tauri::command]
pub async fn add_fetch_history(
    history_item: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let id = history_item["id"].as_str().unwrap_or("").to_string();
    let url = history_item["url"].as_str().unwrap_or("").to_string();
    let name = history_item["name"].as_str().unwrap_or("").to_string();
    let item_type = history_item["type"].as_str().unwrap_or("").to_string();
    let info = history_item["info"].as_str().unwrap_or("").to_string();
    let image = history_item["image"].as_str().unwrap_or("").to_string();
    let data = history_item["data"].as_str().unwrap_or("").to_string();

    state
        .engine
        .add_fetch_history(FetchHistoryItem {
            id,
            url,
            name,
            item_type,
            info,
            image,
            data,
            timestamp: chrono::Utc::now().timestamp(),
        })
        .map_err(|e| e.to_string())
}

/// Returns real current IP/country info (ipwho.is → ipapi.co fallback)
#[tauri::command]
pub async fn get_current_ip_info() -> Result<serde_json::Value, String> {
    match spotiflac_core_rs::utils::ip::IpResolver::fetch_current_ip_info().await {
        Ok(info) => serde_json::to_value(info).map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}

/// Checks which tracks from a list already exist on disk, using HistoryManager + fuzzy AudioScanner
#[tauri::command]
pub async fn check_files_existence(
    output_dir: String,
    _root_dir: String,
    tracks: Vec<serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<Vec<FileExistenceResult>, String> {
    let output_path = PathBuf::from(&output_dir);
    let mut results = Vec::new();

    for track in &tracks {
        let spotify_id = track["spotify_id"].as_str().map(|s| s.to_string());
        let name = track["name"].as_str().unwrap_or("").to_string();
        let artists = track["artists"].as_str().unwrap_or("").to_string();

        let mut exists = false;
        let mut file_path: Option<String> = None;

        // 1. Check download history DB first (exact Spotify ID match)
        if let Some(ref sp_id) = spotify_id {
            if let Some(path) = state.engine.is_already_downloaded(sp_id) {
                if std::path::Path::new(&path).exists() {
                    exists = true;
                    file_path = Some(path);
                }
            }
        }

        // 2. Fuzzy scan on disk
        if !exists {
            if let Some(found) = spotiflac_core_rs::utils::scanner::AudioScanner::find_audio_file(
                &output_path,
                &name,
                &artists,
            ) {
                exists = true;
                file_path = Some(found.to_string_lossy().to_string());
            }
        }

        results.push(FileExistenceResult {
            spotify_id,
            exists,
            file_path,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn skip_download_item(
    item_id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.engine.progress.skip_item(&item_id, file_path);
    Ok(())
}

/// Adds item to the ProgressManager download queue
#[tauri::command]
pub async fn add_to_download_queue(
    id: String,
    track_name: String,
    artist_name: String,
    album_name: String,
    spotify_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let sp_id = spotify_id.unwrap_or_else(|| id.clone());
    state
        .engine
        .progress
        .add_to_queue(id.clone(), track_name, artist_name, album_name, sp_id);
    Ok(id)
}

#[tauri::command]
pub async fn mark_download_item_failed(
    item_id: String,
    error: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.engine.progress.fail_item(&item_id, error);
    Ok(())
}

/// Marks all queued items as Skipped — mirrors Go's CancelAllQueuedItems
#[tauri::command]
pub async fn cancel_all_queued_items(state: State<'_, AppState>) -> Result<(), String> {
    state.engine.progress.cancel_all_queued();
    Ok(())
}

#[tauri::command]
pub fn get_platform() -> String {
    if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else {
        "linux".to_string()
    }
}

#[tauri::command]
pub fn get_app_version(app_handle: AppHandle) -> String {
    app_handle.package_info().version.to_string()
}

#[tauri::command]
pub async fn create_m3u8_file(
    playlist_name: String,
    output_dir: String,
    file_paths: Vec<String>,
) -> Result<(), String> {
    if file_paths.is_empty() {
        return Ok(());
    }

    let output_dir = PathBuf::from(&output_dir);
    std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    let safe_name = sanitize_playlist_filename(&playlist_name);
    let file_name = if safe_name.is_empty() {
        "playlist".to_string()
    } else {
        safe_name
    };
    let m3u8_path = output_dir.join(format!("{}.m3u8", file_name));

    let mut content = String::from("#EXTM3U\n");
    for path in &file_paths {
        if path.trim().is_empty() {
            continue;
        }

        let source_path = PathBuf::from(path);
        let relative_path = if source_path.is_absolute() {
            source_path
                .strip_prefix(&output_dir)
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|_| source_path.clone())
        } else {
            source_path.clone()
        };

        let playlist_path = relative_path.to_string_lossy().replace('\\', "/");
        content.push_str(&playlist_path);
        content.push('\n');
    }

    std::fs::write(&m3u8_path, content).map_err(|e| e.to_string())
}

/// Reads a file as base64 — used by SpectrumVisualization for audio analysis
#[tauri::command]
pub async fn read_file_as_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(bytes))
}

/// Decodes audio file for waveform/spectrum analysis — delegates to spotiflac-core analysis module
#[tauri::command]
pub async fn decode_audio_for_analysis(path: String) -> Result<serde_json::Value, String> {
    match spotiflac_core_rs::utils::analysis::AudioAnalyzer::decode_audio_for_analysis(&path).await
    {
        Ok(analysis) => serde_json::to_value(analysis).map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}

// ======================================
// LYRICS DOWNLOAD
// ======================================

/// Downloads lyrics for a track, saves as .lrc file.
/// Mirrors Go's LyricsClient.DownloadLyrics exactly:
///   - Builds filename from format template
///   - Skips if file already exists (unless redownload_with_suffix setting)
///   - Fetches from LRCLib via 4-strategy search cascade
///   - Converts to LRC and writes to disk
#[tauri::command]
pub async fn download_lyrics(
    request: LyricsDownloadRequest,
    state: State<'_, AppState>,
) -> Result<LyricsDownloadResponse, String> {
    use spotiflac_core_rs::metadata::lyrics::LyricsClient;
    use spotiflac_core_rs::utils::filename::FilenameBuilder;

    if request.spotify_id.is_empty() {
        return Ok(LyricsDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some("Spotify ID is required".to_string()),
            already_exists: false,
        });
    }

    let output_dir = PathBuf::from(&request.output_dir);
    if let Err(e) = std::fs::create_dir_all(&output_dir) {
        return Ok(LyricsDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some(format!("failed to create output directory: {}", e)),
            already_exists: false,
        });
    }

    // Build filename using the same FilenameBuilder used for audio files, with .lrc extension
    let filename_base = FilenameBuilder::build(
        &request.filename_format,
        &request.track_name,
        &request.artist_name,
        &request.album_name,
        request.album_artist.as_deref(),
        request.release_date.as_deref(),
        request.isrc.as_deref(),
        request.position,
        request.disc_number,
    );
    let lrc_path = output_dir.join(format!("{}.lrc", filename_base));

    // Skip if already exists
    if lrc_path.exists() && lrc_path.metadata().map(|m| m.len()).unwrap_or(0) > 0 {
        return Ok(LyricsDownloadResponse {
            success: true,
            message: "Lyrics file already exists".to_string(),
            file: Some(lrc_path.to_string_lossy().to_string()),
            error: None,
            already_exists: true,
        });
    }

    let client = LyricsClient::new();
    match client
        .fetch_lyrics_all_sources(
            &request.track_name,
            &request.artist_name,
            Some(&request.album_name),
            None, // duration not required at this stage
        )
        .await
    {
        Ok(lyrics) => {
            let lrc_content =
                client.convert_to_lrc(&lyrics, &request.track_name, &request.artist_name);
            match std::fs::write(&lrc_path, lrc_content.as_bytes()) {
                Ok(_) => Ok(LyricsDownloadResponse {
                    success: true,
                    message: "Lyrics downloaded successfully".to_string(),
                    file: Some(lrc_path.to_string_lossy().to_string()),
                    error: None,
                    already_exists: false,
                }),
                Err(e) => Ok(LyricsDownloadResponse {
                    success: false,
                    message: String::new(),
                    file: None,
                    error: Some(format!("failed to write LRC file: {}", e)),
                    already_exists: false,
                }),
            }
        }
        Err(e) => Ok(LyricsDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some(e.to_string()),
            already_exists: false,
        }),
    }
}

// ======================================
// COVER / ASSET DOWNLOADS
// ======================================

/// Downloads album cover art as JPEG.
/// Mirrors Go's CoverClient.DownloadCover:
///   - Builds filename from format template
///   - Skips if already exists
///   - Upgrades URL to max resolution (ab67616d000082c1)
#[tauri::command]
pub async fn download_cover(
    request: CoverDownloadRequest,
) -> Result<AssetDownloadResponse, String> {
    use spotiflac_core_rs::utils::filename::FilenameBuilder;

    if request.cover_url.is_empty() {
        return Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some("Cover URL is required".to_string()),
            already_exists: false,
        });
    }

    let output_dir = PathBuf::from(&request.output_dir);
    if let Err(e) = std::fs::create_dir_all(&output_dir) {
        return Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some(format!("failed to create output directory: {}", e)),
            already_exists: false,
        });
    }

    let filename_base = FilenameBuilder::build(
        &request.filename_format,
        &request.track_name,
        &request.artist_name,
        &request.album_name,
        request.album_artist.as_deref(),
        request.release_date.as_deref(),
        None, // no ISRC needed for covers
        request.position,
        request.disc_number,
    );
    let cover_path = output_dir.join(format!("{}.jpg", filename_base));

    if cover_path.exists() && cover_path.metadata().map(|m| m.len()).unwrap_or(0) > 0 {
        return Ok(AssetDownloadResponse {
            success: true,
            message: "Cover file already exists".to_string(),
            file: Some(cover_path.to_string_lossy().to_string()),
            error: None,
            already_exists: true,
        });
    }

    // Upgrade to max-res Spotify cover URL (640 → 3000px equivalent)
    let download_url = upgrade_spotify_cover_url(&request.cover_url);

    match download_file_to_path(&download_url, &cover_path).await {
        Ok(_) => Ok(AssetDownloadResponse {
            success: true,
            message: "Cover downloaded successfully".to_string(),
            file: Some(cover_path.to_string_lossy().to_string()),
            error: None,
            already_exists: false,
        }),
        Err(e) => Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some(e),
            already_exists: false,
        }),
    }
}

/// Downloads artist header image.
/// Mirrors Go's CoverClient.DownloadHeader — saves as {ArtistName}_Header.jpg in artist subfolder
#[tauri::command]
pub async fn download_header(
    request: HeaderDownloadRequest,
) -> Result<AssetDownloadResponse, String> {
    use spotiflac_core_rs::utils::filename::FilenameBuilder;

    if request.header_url.is_empty() {
        return Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some("Header URL is required".to_string()),
            already_exists: false,
        });
    }

    let artist_folder =
        PathBuf::from(&request.output_dir).join(FilenameBuilder::sanitize(&request.artist_name));
    if let Err(e) = std::fs::create_dir_all(&artist_folder) {
        return Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some(format!("failed to create artist folder: {}", e)),
            already_exists: false,
        });
    }

    let filename = format!(
        "{}_Header.jpg",
        FilenameBuilder::sanitize(&request.artist_name)
    );
    let file_path = artist_folder.join(&filename);

    if file_path.exists() && file_path.metadata().map(|m| m.len()).unwrap_or(0) > 0 {
        return Ok(AssetDownloadResponse {
            success: true,
            message: "Header file already exists".to_string(),
            file: Some(file_path.to_string_lossy().to_string()),
            error: None,
            already_exists: true,
        });
    }

    match download_file_to_path(&request.header_url, &file_path).await {
        Ok(_) => Ok(AssetDownloadResponse {
            success: true,
            message: "Header downloaded successfully".to_string(),
            file: Some(file_path.to_string_lossy().to_string()),
            error: None,
            already_exists: false,
        }),
        Err(e) => Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some(e),
            already_exists: false,
        }),
    }
}

/// Downloads a single artist gallery image.
/// Mirrors Go's CoverClient.DownloadGalleryImage — saves as {ArtistName}_Gallery_{N}.jpg
#[tauri::command]
pub async fn download_gallery_image(
    request: GalleryImageDownloadRequest,
) -> Result<AssetDownloadResponse, String> {
    use spotiflac_core_rs::utils::filename::FilenameBuilder;

    if request.image_url.is_empty() {
        return Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some("Image URL is required".to_string()),
            already_exists: false,
        });
    }

    let artist_folder =
        PathBuf::from(&request.output_dir).join(FilenameBuilder::sanitize(&request.artist_name));
    if let Err(e) = std::fs::create_dir_all(&artist_folder) {
        return Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some(format!("failed to create artist folder: {}", e)),
            already_exists: false,
        });
    }

    let filename = format!(
        "{}_Gallery_{}.jpg",
        FilenameBuilder::sanitize(&request.artist_name),
        request.image_index + 1
    );
    let file_path = artist_folder.join(&filename);

    if file_path.exists() && file_path.metadata().map(|m| m.len()).unwrap_or(0) > 0 {
        return Ok(AssetDownloadResponse {
            success: true,
            message: "Gallery image already exists".to_string(),
            file: Some(file_path.to_string_lossy().to_string()),
            error: None,
            already_exists: true,
        });
    }

    match download_file_to_path(&request.image_url, &file_path).await {
        Ok(_) => Ok(AssetDownloadResponse {
            success: true,
            message: "Gallery image downloaded successfully".to_string(),
            file: Some(file_path.to_string_lossy().to_string()),
            error: None,
            already_exists: false,
        }),
        Err(e) => Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some(e),
            already_exists: false,
        }),
    }
}

/// Downloads artist avatar image.
/// Mirrors Go's CoverClient.DownloadAvatar — saves as {ArtistName}_Avatar.jpg
#[tauri::command]
pub async fn download_avatar(
    request: AvatarDownloadRequest,
) -> Result<AssetDownloadResponse, String> {
    use spotiflac_core_rs::utils::filename::FilenameBuilder;

    if request.avatar_url.is_empty() {
        return Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some("Avatar URL is required".to_string()),
            already_exists: false,
        });
    }

    let artist_folder =
        PathBuf::from(&request.output_dir).join(FilenameBuilder::sanitize(&request.artist_name));
    if let Err(e) = std::fs::create_dir_all(&artist_folder) {
        return Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some(format!("failed to create artist folder: {}", e)),
            already_exists: false,
        });
    }

    let filename = format!(
        "{}_Avatar.jpg",
        FilenameBuilder::sanitize(&request.artist_name)
    );
    let file_path = artist_folder.join(&filename);

    if file_path.exists() && file_path.metadata().map(|m| m.len()).unwrap_or(0) > 0 {
        return Ok(AssetDownloadResponse {
            success: true,
            message: "Avatar file already exists".to_string(),
            file: Some(file_path.to_string_lossy().to_string()),
            error: None,
            already_exists: true,
        });
    }

    match download_file_to_path(&request.avatar_url, &file_path).await {
        Ok(_) => Ok(AssetDownloadResponse {
            success: true,
            message: "Avatar downloaded successfully".to_string(),
            file: Some(file_path.to_string_lossy().to_string()),
            error: None,
            already_exists: false,
        }),
        Err(e) => Ok(AssetDownloadResponse {
            success: false,
            message: String::new(),
            file: None,
            error: Some(e),
            already_exists: false,
        }),
    }
}

// ======================================
// DOWNLOAD QUEUE MANAGEMENT
// ======================================

/// Returns the full download queue info — mirrors Go's GetDownloadQueue exactly
#[tauri::command]
pub async fn get_download_queue(state: State<'_, AppState>) -> Result<DownloadQueueInfo, String> {
    Ok(state.engine.progress.get_queue_info())
}

/// Returns current progress info — mirrors Go's GetDownloadProgress exactly
#[tauri::command]
pub async fn get_download_progress(state: State<'_, AppState>) -> Result<ProgressInfo, String> {
    Ok(state.engine.progress.get_progress_info())
}

/// Removes completed/failed/skipped items — mirrors Go's ClearDownloadQueue
#[tauri::command]
pub async fn clear_completed_downloads(state: State<'_, AppState>) -> Result<(), String> {
    state.engine.progress.clear_completed();
    Ok(())
}

/// Wipes entire queue and resets session — mirrors Go's ClearAllDownloads
#[tauri::command]
pub async fn clear_all_downloads(state: State<'_, AppState>) -> Result<(), String> {
    state.engine.progress.clear_all();
    Ok(())
}

/// Exports failed download items as newline-separated list
#[tauri::command]
pub async fn export_failed_downloads(state: State<'_, AppState>) -> Result<String, String> {
    let failed = state.engine.progress.get_failed_items();
    if failed.is_empty() {
        return Ok("No failed downloads to export".to_string());
    }
    let lines: Vec<String> = failed
        .iter()
        .map(|item| {
            format!(
                "{} - {} | Error: {}",
                item.artist_name,
                item.track_name,
                item.error_message.as_deref().unwrap_or("unknown error")
            )
        })
        .collect();
    Ok(lines.join("\n"))
}

// ======================================
// FILE SYSTEM / SETTINGS COMMANDS
// ======================================

/// Opens a native folder picker dialog — used by SettingsPage
#[tauri::command]
pub async fn select_folder(app: AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|f| f.to_string()))
}

/// Opens the SpotiFLAC config folder in the system file manager
#[tauri::command]
pub async fn open_config_folder() -> Result<(), String> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| "Could not determine config directory".to_string())?
        .join("spotiflac");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(config_dir.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(config_dir.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(config_dir.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Returns the default music/downloads path — mirrors Go's GetDefaultMusicPath
#[tauri::command]
pub async fn get_default_download_path() -> Result<String, String> {
    let path = dirs::audio_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Music")))
        .ok_or_else(|| "Could not determine default music path".to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Opens the output folder in the system file manager
#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), String> {
    let dir = PathBuf::from(&path);
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(dir.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(dir.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(dir.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("URL is required".to_string());
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Loads app settings from config.json in app data dir
#[tauri::command]
pub async fn load_settings() -> Result<serde_json::Value, String> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| "Could not determine config directory".to_string())?
        .join("spotiflac");
    let config_path = config_dir.join("config.json");

    if !config_path.exists() {
        return Ok(serde_json::Value::Null);
    }

    let data = std::fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

/// Saves app settings to config.json in app data dir
#[tauri::command]
pub async fn save_settings(settings: serde_json::Value) -> Result<(), String> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| "Could not determine config directory".to_string())?
        .join("spotiflac");

    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }

    let config_path = config_dir.join("config.json");
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(config_path, data).map_err(|e| e.to_string())
}

// ======================================
// FFMPEG COMMANDS
// ======================================

/// Checks if FFmpeg binaries are available on the system or in ~/.spotiflac/
#[tauri::command]
pub async fn check_ffmpeg_installed() -> Result<bool, String> {
    let ffmpeg_ok = spotiflac_core_rs::utils::ffmpeg::FFmpeg::get_path().is_ok();
    let ffprobe_ok = spotiflac_core_rs::utils::ffmpeg::FFprobe::get_path().is_ok();
    Ok(ffmpeg_ok && ffprobe_ok)
}

/// Downloads and installs FFmpeg + FFprobe binaries for the current platform
#[tauri::command]
pub async fn download_ffmpeg(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    let handle = app_handle.clone();
    let result = spotiflac_core_rs::utils::ffmpeg_downloader::FFmpegDownloader::download_binaries(
        Some(move |progress: f64, status: &str| {
            let _ = handle.emit("ffmpeg:progress", progress as i32);
            let _ = handle.emit("ffmpeg:status", status.to_string());
        }),
    )
    .await;
    match result {
        Ok(_) => Ok(serde_json::json!({ "success": true })),
        Err(e) => Ok(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

// ======================================
// AUDIO PROCESSING
// ======================================

/// Batch audio format conversion (FLAC → MP3/M4A/etc.)
#[tauri::command]
pub async fn convert_audio_batch(
    request: spotiflac_core_rs::utils::audio_processor::ConvertRequest,
) -> Result<Vec<spotiflac_core_rs::utils::audio_processor::ConvertResult>, String> {
    Ok(spotiflac_core_rs::utils::audio_processor::AudioProcessor::convert_batch(request).await)
}

/// Batch audio resampling (change sample rate / bit depth)
#[tauri::command]
pub async fn resample_audio_batch(
    request: spotiflac_core_rs::utils::audio_processor::ResampleRequest,
) -> Result<Vec<spotiflac_core_rs::utils::audio_processor::ConvertResult>, String> {
    Ok(spotiflac_core_rs::utils::audio_processor::AudioProcessor::resample_batch(request).await)
}

// ======================================
// FILE MANAGER
// ======================================

/// Lists all audio files recursively in a directory — used by SfAudioConverterPage and SfAudioResamplerPage
#[tauri::command]
pub async fn list_audio_files(dir_path: String) -> Result<Vec<serde_json::Value>, String> {
    let dir = PathBuf::from(&dir_path);
    let files = spotiflac_core_rs::utils::scanner::AudioScanner::list_audio_files(&dir);
    let result: Vec<serde_json::Value> = files
        .iter()
        .map(|p| {
            let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
            serde_json::json!({
                "name": p.file_name().and_then(|n| n.to_str()).unwrap_or(""),
                "path": p.to_string_lossy(),
                "is_dir": false,
                "size": size,
            })
        })
        .collect();
    Ok(result)
}

/// Lists all items in a directory as a tree — used by SfFileManagerPage
#[tauri::command]
pub async fn list_directory_items(
    path: String,
) -> Result<Vec<spotiflac_core_rs::utils::file_manager::FileNode>, String> {
    spotiflac_core_rs::utils::file_manager::FileManager::list_directory_recursive(Path::new(&path))
        .map_err(|e| e.to_string())
}

/// Previews renaming of audio files based on metadata and a template
#[tauri::command]
pub async fn preview_rename_files(
    files: Vec<String>,
    format_template: String,
) -> Result<Vec<spotiflac_core_rs::utils::file_manager::RenamePreview>, String> {
    Ok(
        spotiflac_core_rs::utils::file_manager::FileManager::preview_rename(
            files,
            &format_template,
        ),
    )
}

/// Executes renaming of audio files
#[tauri::command]
pub async fn rename_files_by_metadata(
    files: Vec<String>,
    format_template: String,
) -> Result<Vec<spotiflac_core_rs::utils::file_manager::RenameResult>, String> {
    Ok(
        spotiflac_core_rs::utils::file_manager::FileManager::execute_rename(
            files,
            &format_template,
        ),
    )
}

/// Reads metadata from a single audio file
#[tauri::command]
pub async fn read_file_metadata(
    path: String,
) -> Result<spotiflac_core_rs::utils::file_manager::AudioMetadata, String> {
    spotiflac_core_rs::utils::file_manager::FileManager::read_audio_metadata(Path::new(&path))
        .map_err(|e| e.to_string())
}

/// Reads a text file (UTF-8) — used for LRC lyrics preview
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Renames a file to a specific new name (no extension needed, will keep old extension)
#[tauri::command]
pub async fn rename_file_to(old_path: String, new_name: String) -> Result<(), String> {
    let old = Path::new(&old_path);
    if !old.exists() {
        return Err("File not found".to_string());
    }
    let ext = old.extension().and_then(|s| s.to_str()).unwrap_or("");
    let new_filename = if ext.is_empty() {
        new_name
    } else {
        format!("{}.{}", new_name, ext)
    };
    let new_path = old.with_file_name(new_filename);
    std::fs::rename(old, new_path).map_err(|e| e.to_string())
}

/// Reads an image file and returns it as a Base64 data URL
#[tauri::command]
pub async fn read_image_as_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("jpeg")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/jpeg",
    };
    let b64 = general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

// ======================================
// DOWNLOAD HISTORY
// ======================================

/// Returns the full download history from the sled DB
#[tauri::command]
pub async fn get_download_history(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    match state.engine.get_download_history() {
        Ok(items) => {
            let values: Vec<serde_json::Value> = items
                .iter()
                .map(|item| serde_json::to_value(item).unwrap_or_default())
                .collect();
            Ok(values)
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Deletes a single item from download history
#[tauri::command]
pub async fn delete_download_history_item(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .engine
        .delete_download_history_item(&id)
        .map_err(|e| e.to_string())
}

/// Clears the entire download history
#[tauri::command]
pub async fn clear_download_history(state: State<'_, AppState>) -> Result<(), String> {
    state
        .engine
        .clear_download_history()
        .map_err(|e| e.to_string())
}

// ======================================
// FETCH HISTORY
// ======================================

/// Returns the full fetch history
#[tauri::command]
pub async fn get_fetch_history(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    match state.engine.get_fetch_history() {
        Ok(items) => {
            let values: Vec<serde_json::Value> = items
                .iter()
                .map(|item| serde_json::to_value(item).unwrap_or_default())
                .collect();
            Ok(values)
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Deletes a single item from fetch history
#[tauri::command]
pub async fn delete_fetch_history_item(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .engine
        .delete_fetch_history_item(&id)
        .map_err(|e| e.to_string())
}

/// Clears fetch history by type (track, album, playlist, artist, or all)
#[tauri::command]
pub async fn clear_fetch_history_by_type(
    item_type: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .engine
        .clear_fetch_history_by_type(&item_type)
        .map_err(|e| e.to_string())
}

// ======================================
// HELPER FUNCTIONS
// ======================================

/// Upgrades a Spotify CDN URL to the highest resolution variant.
/// Mirrors Go's CoverClient.getMaxResolutionURL
fn upgrade_spotify_cover_url(url: &str) -> String {
    const SIZE_300: &str = "ab67616d00001e02";
    const SIZE_640: &str = "ab67616d0000b273";
    const SIZE_MAX: &str = "ab67616d000082c1";

    if url.contains(SIZE_300) {
        return url.replace(SIZE_300, SIZE_MAX);
    }
    if url.contains(SIZE_640) {
        return url.replace(SIZE_640, SIZE_MAX);
    }
    url.to_string()
}

fn sanitize_playlist_filename(name: &str) -> String {
    let sanitized = name
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect::<String>();

    sanitized.trim().trim_matches('.').to_string()
}

/// Generic file downloader — used by cover/header/avatar/gallery
async fn download_file_to_path(url: &str, path: &PathBuf) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("request failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(path, &bytes).map_err(|e| e.to_string())
}
