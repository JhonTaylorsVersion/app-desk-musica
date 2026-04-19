use serde::{Deserialize, Serialize};

pub const APP_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackMetadata {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: Option<String>,
    pub date: Option<String>,
    pub release_date: Option<String>,
    pub track_number: u32,
    pub total_tracks: Option<u32>,
    pub disc_number: u32,
    pub total_discs: Option<u32>,
    pub isrc: Option<String>,
    pub upc: Option<String>,
    pub cover_url: Option<String>,
    pub spotify_url: Option<String>,
    pub genre: Option<String>,
    pub label: Option<String>,
    pub copyright: Option<String>,
    pub composer: Option<String>,
    pub lyrics_text: Option<String>,
    pub is_explicit: bool,
    pub duration_ms: u32,
    pub artist_avatar_url: Option<String>,
    pub artist_header_url: Option<String>,
    pub artist_gallery_urls: Option<Vec<String>>,
}

impl TrackMetadata {
    pub fn new(title: String, artist: String, album: String) -> Self {
        Self {
            id: String::new(),
            title,
            artist,
            album,
            album_artist: None,
            date: None,
            release_date: None,
            track_number: 0,
            total_tracks: None,
            disc_number: 0,
            total_discs: None,
            isrc: None,
            upc: None,
            cover_url: None,
            spotify_url: None,
            genre: None,
            label: None,
            copyright: None,
            composer: None,
            lyrics_text: None,
            is_explicit: false,
            duration_ms: 0,
            artist_avatar_url: None,
            artist_header_url: None,
            artist_gallery_urls: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtistMetadata {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub header_url: Option<String>,
    pub gallery_urls: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AudioQuality {
    Low,      // MP3 320 or similar
    Lossless, // FLAC 16-bit
    HiRes,    // FLAC 24-bit
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub output_dir: String,
    pub download_quality: AudioQuality,
    pub filename_format: String,
    pub embed_metadata: bool,
    pub embed_cover: bool,
    pub embed_genre: bool,
    pub use_single_genre: bool,
    pub redownload_with_suffix: bool,
    pub download_artist_images: bool,
    pub embed_lyrics: bool,
    pub save_lrc_file: bool,
    pub downloader: String,
    pub auto_order: Vec<String>,
    pub allow_resolver_fallback: bool,
    pub folder_structure: String,
    pub separator: String,
    pub use_first_artist_only: bool,
    pub use_album_track_number: bool,
    pub position_override: Option<u32>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentIPInfo {
    pub ip: String,
    pub country: String,
    pub country_code: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SongLinkData {
    pub isrc: Option<String>,
    pub tidal_url: Option<String>,
    pub amazon_url: Option<String>,
    pub deezer_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackAvailability {
    pub spotify_id: String,
    pub tidal: bool,
    pub amazon: bool,
    pub qobuz: bool,
    pub deezer: bool,
    pub tidal_url: Option<String>,
    pub amazon_url: Option<String>,
    pub qobuz_url: Option<String>,
    pub deezer_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub artists: Option<String>,
    pub album_name: Option<String>,
    pub images: String,
    pub release_date: Option<String>,
    pub external_urls: String,
    pub duration_ms: Option<u32>,
    pub total_tracks: Option<u32>,
    pub owner: Option<String>,
    pub is_explicit: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub tracks: Vec<SearchResult>,
    pub albums: Vec<SearchResult>,
    pub artists: Vec<SearchResult>,
    pub playlists: Vec<SearchResult>,
}
