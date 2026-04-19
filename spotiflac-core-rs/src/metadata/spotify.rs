use crate::isrc::spotify_id;
use crate::isrc::LinkResolver;
use crate::models::TrackMetadata;
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::{json, Value};

pub struct SpotifyMetadataClient {
    resolver: LinkResolver,
    http: Client,
}

impl SpotifyMetadataClient {
    pub fn new() -> Self {
        Self {
            resolver: LinkResolver::new(None),
            http: Client::new(),
        }
    }
    pub async fn fetch_track_info_enriched(
        &self,
        input: &str,
    ) -> Result<(TrackMetadata, Option<String>, Option<String>)> {
        let (entity_type, id) = spotify_id::parse_spotify_url(input)?;
        if entity_type != "track" {
            return Err(anyhow!("Expected a track URL/ID, got: {}", entity_type));
        }

        let token = self.resolver.get_anonymous_token().await?;

        // 1. Basic Metadata (GraphQL)
        let query_url = "https://api-partner.spotify.com/pathfinder/v1/query";
        let variables = json!({ "uri": format!("spotify:track:{}", id) });
        let extensions = json!({
            "persistedQuery": {
                "version": 1,
                "sha256Hash": "612585ae06ba435ad26369870deaae23b5c8800a256cd8a57e08eddc25a37294"
            }
        });

        let response = self
            .http
            .get(query_url)
            .query(&[
                ("operationName", "getTrack"),
                ("variables", &variables.to_string()),
                ("extensions", &extensions.to_string()),
            ])
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?;

        let data: Value = response.json().await?;
        let track_union = data
            .pointer("/data/trackUnion")
            .ok_or_else(|| anyhow!("Track not found in GraphQL response"))?;

        let (mut metadata, first_artist_id, plays) = self.parse_single_track_node(track_union, &data)?;

        // 2. Enriquecimiento vía spclient (ISRC, UPC, Sellos, Totales)
        if let Ok(enriched) = self.fetch_enriched_metadata(&id, &token).await {
            metadata.isrc = enriched.isrc;
            metadata.upc = enriched.upc;
            metadata.label = enriched.label;
            metadata.copyright = enriched.copyright;

            // Solo sobreescribir si no lo obtuvimos de GraphQL
            if metadata.total_tracks.is_none() {
                metadata.total_tracks = enriched.total_tracks;
            }
            if metadata.total_discs.is_none() {
                metadata.total_discs = enriched.total_discs;
            }
            if metadata.album_artist.is_none() {
                metadata.album_artist = enriched.album_artist;
            }
        }

        // 3. Créditos (Compositor)
        if let Ok(composer) = self.fetch_track_composer(&id, &token).await {
            metadata.composer = Some(composer);
        }

        // 4. Assets del Artista (Avatar, Header, Gallery)
        if let Some(artist_id) = &first_artist_id {
            if let Ok(artist_info) = self.fetch_artist_info(&artist_id, &token).await {
                metadata.artist_avatar_url = artist_info.avatar_url;
                metadata.artist_header_url = artist_info.header_url;
                metadata.artist_gallery_urls = Some(artist_info.gallery_urls);
            }
        }

        Ok((metadata, first_artist_id, plays))
    }

    pub async fn fetch_artist_info(
        &self,
        artist_id: &str,
        token: &str,
    ) -> Result<crate::models::ArtistMetadata> {
        let query_url = "https://api-partner.spotify.com/pathfinder/v1/query";
        let variables = json!({ "uri": format!("spotify:artist:{}", artist_id), "locale": "" });
        let extensions = json!({
            "persistedQuery": {
                "version": 1,
                "sha256Hash": "446130b4a0aa6522a686aafccddb0ae849165b5e0436fd802f96e0243617b5d8"
            }
        });

        let response = self
            .http
            .get(query_url)
            .query(&[
                ("operationName", "queryArtistOverview"),
                ("variables", &variables.to_string()),
                ("extensions", &extensions.to_string()),
            ])
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?
            .json::<Value>()
            .await?;

        let artist_union = response
            .pointer("/data/artistUnion")
            .ok_or_else(|| anyhow!("Artist not found"))?;

        let name = artist_union
            .pointer("/profile/name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Artist")
            .to_string();

        let avatar_url = artist_union
            .pointer("/visuals/avatarImage/sources")
            .and_then(|s| s.as_array())
            .and_then(|a| {
                a.iter()
                    .max_by_key(|i| i.get("width").and_then(|w| w.as_u64()).unwrap_or(0))
            })
            .and_then(|i| i.get("url"))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        let header_url = artist_union
            .pointer("/visuals/headerImage/sources")
            .and_then(|s| s.as_array())
            .and_then(|a| a.get(0))
            .and_then(|i| i.get("url"))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        let mut gallery_urls = Vec::new();
        if let Some(items) = artist_union.pointer("/visuals/gallery/items") {
            if let Some(arr) = items.as_array() {
                for item in arr {
                    if let Some(url) = item.pointer("/sources/0/url").and_then(|v| v.as_str()) {
                        gallery_urls.push(url.to_string());
                    }
                }
            }
        }

        Ok(crate::models::ArtistMetadata {
            id: artist_id.to_string(),
            name,
            avatar_url,
            header_url,
            gallery_urls,
        })
    }

    async fn fetch_enriched_metadata(&self, track_id: &str, token: &str) -> Result<EnrichedData> {
        let gid = spotify_id::spotify_id_to_gid(track_id)?;
        let url = format!("https://spclient.wg.spotify.com/metadata/4/track/{}", gid);

        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json")
            .send()
            .await?
            .json::<Value>()
            .await?;

        let isrc = self.extract_external_id(&resp, "isrc");

        // Go logic: Try to separate standard copyright and phonographic copyright
        let mut copyright = None;
        if let Some(cr_array) = resp.get("copyright").and_then(|v| v.as_array()) {
            let mut standard = None;
            let mut phonographic = None;
            for c in cr_array {
                let text = c.get("text").and_then(|t| t.as_str());
                let c_type = c.get("type").and_then(|t| t.as_str());
                if let Some(t) = text {
                    if c_type == Some("P") {
                        phonographic = Some(t.to_string());
                    } else {
                        standard = Some(t.to_string());
                    }
                }
            }
            copyright = standard.or(phonographic);
        }

        let mut upc = None;
        let mut label = None;
        let mut total_tracks = None;
        let mut total_discs = None;
        let mut album_artist = None;

        if let Some(album_gid) = resp.pointer("/album/gid").and_then(|v| v.as_str()) {
            let album_url = format!(
                "https://spclient.wg.spotify.com/metadata/4/album/{}",
                album_gid
            );
            if let Ok(album_resp) = self
                .http
                .get(&album_url)
                .header("Authorization", format!("Bearer {}", token))
                .header("Accept", "application/json")
                .send()
                .await?
                .json::<Value>()
                .await
            {
                upc = self.extract_external_id(&album_resp, "upc");
                label = album_resp
                    .get("label")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                // Extract Album Artist from spclient if possible
                if let Some(a_arr) = album_resp.get("artist").and_then(|v| v.as_array()) {
                    let artists: Vec<String> = a_arr
                        .iter()
                        .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                        .map(|s| s.to_string())
                        .collect();
                    if !artists.is_empty() {
                        album_artist = Some(artists.join(", "));
                    }
                }

                if let Some(disc) = album_resp.get("disc").and_then(|v| v.as_array()) {
                    total_discs = Some(disc.len() as u32);
                    let mut tracks_count = 0;
                    for d in disc {
                        if let Some(group) = d.get("track_group").and_then(|v| v.as_array()) {
                            tracks_count += group.len() as u32;
                        }
                    }
                    total_tracks = Some(tracks_count);
                }
            }
        }

        Ok(EnrichedData {
            isrc,
            upc,
            label,
            copyright,
            total_tracks,
            total_discs,
            album_artist,
        })
    }

    fn extract_external_id(&self, data: &Value, id_type: &str) -> Option<String> {
        data.get("external_id")
            .and_then(|v| v.as_array())
            .and_then(|arr| {
                arr.iter().find(|entry| {
                    entry
                        .get("type")
                        .and_then(|t| t.as_str())
                        .unwrap_or("")
                        .to_lowercase()
                        == id_type.to_lowercase()
                })
            })
            .and_then(|entry| entry.get("id").and_then(|i| i.as_str()))
            .map(|s| s.to_string())
    }

    async fn fetch_track_composer(&self, track_id: &str, token: &str) -> Result<String> {
        let query_url = "https://api-partner.spotify.com/pathfinder/v1/query";
        let variables = json!({
            "trackUri": format!("spotify:track:{}", track_id),
            "contributorsLimit": 100,
            "contributorsOffset": 0
        });
        let extensions = json!({
            "persistedQuery": {
                "version": 1,
                "sha256Hash": "e2ca40d46cf1fde36562261ccec754f23fb31b561877252e9fe0d6834aabb84b"
            }
        });

        let resp = self
            .http
            .get(query_url)
            .query(&[
                ("operationName", "queryTrackCreditsModal"),
                ("variables", &variables.to_string()),
                ("extensions", &extensions.to_string()),
            ])
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?
            .json::<Value>()
            .await?;

        let mut composers = Vec::new();
        if let Some(items) = resp.pointer("/data/trackUnion/creditsTrait/contributors/items") {
            if let Some(arr) = items.as_array() {
                for item in arr {
                    let role = item.get("role").and_then(|r| r.as_str()).unwrap_or("");
                    if role.to_lowercase() == "composer" {
                        if let Some(name) = item.get("name").and_then(|n| n.as_str()) {
                            composers.push(name.to_string());
                        }
                    }
                }
            }
        }

        if composers.is_empty() {
            return Err(anyhow!("No composers found"));
        }

        Ok(composers.join(", "))
    }

    pub async fn search(&self, query: &str, limit: u32) -> Result<crate::models::SearchResponse> {
        let token = self.resolver.get_anonymous_token().await?;
        let query_url = "https://api-partner.spotify.com/pathfinder/v1/query";

        let payload = json!({
            "variables": {
                "searchTerm": query,
                "offset": 0,
                "limit": limit,
                "numberOfTopResults": 5,
                "includeAudiobooks": true,
                "includeArtistHasConcertsField": false,
                "includePreReleases": true,
                "includeAuthors": false
            },
            "operationName": "searchDesktop",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "fcad5a3e0d5af727fb76966f06971c19cfa2275e6ff7671196753e008611873c"
                }
            }
        });

        let response: Value = self
            .http
            .post(query_url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&payload)
            .send()
            .await?
            .json()
            .await?;

        let search_results = response
            .pointer("/data/searchV2")
            .ok_or_else(|| anyhow!("Search data not found"))?;

        let tracks = self.extract_tracks_from_node(search_results);
        let albums = self.extract_albums_from_node(search_results);
        let artists = self.extract_artists_from_node(search_results);
        let playlists = self.extract_playlists_from_node(search_results);

        Ok(crate::models::SearchResponse {
            tracks,
            albums,
            artists,
            playlists,
        })
    }

    pub async fn search_by_type(
        &self,
        query: &str,
        search_type: &str,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<crate::models::SearchResult>> {
        let token = self.resolver.get_anonymous_token().await?;
        let query_url = "https://api-partner.spotify.com/pathfinder/v1/query";

        let payload = json!({
            "variables": {
                "searchTerm": query,
                "offset": offset,
                "limit": limit,
                "numberOfTopResults": 5,
                "includeAudiobooks": true,
                "includeArtistHasConcertsField": false,
                "includePreReleases": true,
                "includeAuthors": false
            },
            "operationName": "searchDesktop",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "fcad5a3e0d5af727fb76966f06971c19cfa2275e6ff7671196753e008611873c"
                }
            }
        });

        let response = self
            .http
            .post(query_url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&payload)
            .send()
            .await?
            .json::<Value>()
            .await?;

        let search_results = response
            .pointer("/data/searchV2")
            .ok_or_else(|| anyhow!("Search data not found"))?;
        let results = match search_type {
            "track" => self.extract_tracks_from_node(search_results),
            "album" => self.extract_albums_from_node(search_results),
            "artist" => self.extract_artists_from_node(search_results),
            "playlist" => self.extract_playlists_from_node(search_results),
            _ => return Err(anyhow!("Unsupported search type: {}", search_type)),
        };

        Ok(results)
    }

    fn extract_tracks_from_node(&self, search_results: &Value) -> Vec<crate::models::SearchResult> {
        let mut results: Vec<crate::models::SearchResult> = Vec::new();
        let track_node = search_results
            .get("tracksV2")
            .or_else(|| search_results.get("tracks"));

        if let Some(items_container) = track_node.and_then(|t| t.get("items")) {
            for item in items_container.as_array().unwrap_or(&vec![]) {
                let node = item
                    .get("item")
                    .and_then(|i| i.get("data"))
                    .or_else(|| item.get("track"))
                    .unwrap_or(item);

                let id = node.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if id.is_empty() {
                    continue;
                }

                let name = match node.get("name").and_then(|v| v.as_str()) {
                    Some(s) => s.to_string(),
                    None => continue,
                };

                let artists = match node
                    .pointer("/artists/items")
                    .and_then(|a| a.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|a| a.pointer("/profile/name").and_then(|v| v.as_str()))
                            .collect::<Vec<_>>()
                            .join(", ")
                    }) {
                    Some(s) if !s.is_empty() => s,
                    _ => continue,
                };

                let album = node
                    .pointer("/albumOfTrack/name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Album")
                    .to_string();
                let duration_ms = node
                    .pointer("/duration/totalMilliseconds")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32);
                let is_explicit =
                    node.pointer("/contentRating/label").and_then(|v| v.as_str()) == Some("EXPLICIT");

                let images = node
                    .pointer("/albumOfTrack/coverArt/sources/0/url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                results.push(crate::models::SearchResult {
                    id: id.to_string(),
                    name,
                    item_type: "track".to_string(),
                    artists: Some(artists),
                    album_name: Some(album),
                    images,
                    release_date: None,
                    external_urls: format!("https://open.spotify.com/track/{}", id),
                    duration_ms,
                    total_tracks: None,
                    owner: None,
                    is_explicit: Some(is_explicit),
                });
            }
        }
        results
    }

    fn extract_albums_from_node(&self, search_results: &Value) -> Vec<crate::models::SearchResult> {
        let mut results: Vec<crate::models::SearchResult> = Vec::new();
        let album_node = search_results
            .get("albumsV2")
            .or_else(|| search_results.get("albums"));

        if let Some(items_container) = album_node.and_then(|a| a.get("items")) {
            for item in items_container.as_array().unwrap_or(&vec![]) {
                let node = item
                    .get("item")
                    .and_then(|i| i.get("data"))
                    .or_else(|| item.get("data"))
                    .or_else(|| item.get("album"))
                    .unwrap_or(item);

                let id = node
                    .get("id")
                    .and_then(|v| v.as_str())
                    .or_else(|| {
                        node.get("uri")
                            .and_then(|v| v.as_str())
                            .map(|s| s.split(':').last().unwrap_or(""))
                    })
                    .unwrap_or("");
                if id.is_empty() {
                    continue;
                }

                let name = match node.get("name").and_then(|v| v.as_str()) {
                    Some(s) => s.to_string(),
                    None => continue,
                };

                let artists = match node
                    .pointer("/artists/items")
                    .and_then(|a| a.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|a| a.pointer("/profile/name").and_then(|v| v.as_str()))
                            .collect::<Vec<_>>()
                            .join(", ")
                    }) {
                    Some(s) if !s.is_empty() => s,
                    _ => continue,
                };

                let images = node
                    .pointer("/coverArt/sources/0/url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let date = node
                    .pointer("/date/isoString")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                results.push(crate::models::SearchResult {
                    id: id.to_string(),
                    name,
                    item_type: "album".to_string(),
                    artists: Some(artists),
                    album_name: None,
                    images,
                    release_date: date,
                    external_urls: format!("https://open.spotify.com/album/{}", id),
                    duration_ms: None,
                    total_tracks: None,
                    owner: None,
                    is_explicit: None,
                });
            }
        }
        results
    }

    fn extract_artists_from_node(&self, search_results: &Value) -> Vec<crate::models::SearchResult> {
        let mut results: Vec<crate::models::SearchResult> = Vec::new();
        let artist_node = search_results
            .get("artistsV2")
            .or_else(|| search_results.get("artists"));

        if let Some(items_container) = artist_node.and_then(|a| a.get("items")) {
            for item in items_container.as_array().unwrap_or(&vec![]) {
                let node = item
                    .get("item")
                    .and_then(|i| i.get("data"))
                    .or_else(|| item.get("data"))
                    .or_else(|| item.get("artist"))
                    .unwrap_or(item);

                let id = node
                    .get("id")
                    .and_then(|v| v.as_str())
                    .or_else(|| {
                        node.get("uri")
                            .and_then(|v| v.as_str())
                            .map(|s| s.split(':').last().unwrap_or(""))
                    })
                    .unwrap_or("");
                if id.is_empty() {
                    continue;
                }

                let name = match node.pointer("/profile/name").and_then(|v| v.as_str()) {
                    Some(s) => s.to_string(),
                    None => continue,
                };
                let images = node
                    .pointer("/visuals/avatarImage/sources/0/url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                results.push(crate::models::SearchResult {
                    id: id.to_string(),
                    name,
                    item_type: "artist".to_string(),
                    artists: None,
                    album_name: None,
                    images,
                    release_date: None,
                    external_urls: format!("https://open.spotify.com/artist/{}", id),
                    duration_ms: None,
                    total_tracks: None,
                    owner: None,
                    is_explicit: None,
                });
            }
        }
        results
    }

    fn extract_playlists_from_node(&self, search_results: &Value) -> Vec<crate::models::SearchResult> {
        let mut results: Vec<crate::models::SearchResult> = Vec::new();
        let playlist_node = search_results
            .get("playlistsV2")
            .or_else(|| search_results.get("playlists"));

        if let Some(items_container) = playlist_node.and_then(|p| p.get("items")) {
            for item in items_container.as_array().unwrap_or(&vec![]) {
                let node = item
                    .get("item")
                    .and_then(|i| i.get("data"))
                    .or_else(|| item.get("data"))
                    .or_else(|| item.get("playlist"))
                    .unwrap_or(item);

                let id = node
                    .get("id")
                    .and_then(|v| v.as_str())
                    .or_else(|| {
                        node.get("uri")
                            .and_then(|v| v.as_str())
                            .map(|s| s.split(':').last().unwrap_or(""))
                    })
                    .unwrap_or("");
                if id.is_empty() {
                    continue;
                }

                let name = match node.get("name").and_then(|v| v.as_str()) {
                    Some(s) => s.to_string(),
                    None => continue,
                };
                let images = node
                    .pointer("/images/items/0/sources/0/url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let owner = node
                    .pointer("/ownerV2/data/name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Community")
                    .to_string();

                results.push(crate::models::SearchResult {
                    id: id.to_string(),
                    name,
                    item_type: "playlist".to_string(),
                    artists: None,
                    album_name: None,
                    images,
                    release_date: None,
                    external_urls: format!("https://open.spotify.com/playlist/{}", id),
                    duration_ms: None,
                    total_tracks: None,
                    owner: Some(owner),
                    is_explicit: None,
                });
            }
        }
        results
    }

    pub fn parse_duration(&self, duration_str: &str) -> u32 {
        let parts: Vec<&str> = duration_str.split(':').collect();
        match parts.len() {
            1 => parts[0].parse::<u32>().unwrap_or(0) * 1000,
            2 => {
                let mins = parts[0].parse::<u32>().unwrap_or(0);
                let secs = parts[1].parse::<u32>().unwrap_or(0);
                (mins * 60 + secs) * 1000
            }
            _ => 0,
        }
    }

    pub fn parse_single_track_node(
        &self,
        node: &Value,
        root: &Value,
    ) -> Result<(TrackMetadata, Option<String>, Option<String>)> {
        let name = node
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Track")
            .to_string();

        let mut artists = Vec::new();
        let mut first_artist_id = None;

        if let Some(first) = node.pointer("/firstArtist/items").and_then(|v| v.as_array()) {
            for a in first {
                if first_artist_id.is_none() {
                    first_artist_id =
                        a.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                    if first_artist_id.is_none() {
                        first_artist_id = a
                            .get("uri")
                            .and_then(|v| v.as_str())
                            .map(|s| s.split(':').last().unwrap_or("").to_string());
                    }
                }
            }
        }

        let mut append_unique_artist = |value: &Value| {
            let name = value
                .pointer("/profile/name")
                .and_then(|v| v.as_str())
                .or_else(|| value.get("name").and_then(|v| v.as_str()));

            if let Some(name) = name {
                if !artists.iter().any(|existing| existing == name) {
                    artists.push(name.to_string());
                }
            }
        };

        if let Some(first) = node.pointer("/firstArtist/items").and_then(|v| v.as_array()) {
            for a in first {
                append_unique_artist(a);
            }
        }

        if let Some(arr) = node
            .get("artists")
            .and_then(|v| v.as_array())
            .or_else(|| node.pointer("/artists/items").and_then(|v| v.as_array()))
        {
            for a in arr {
                append_unique_artist(a);
            }
        }

        if let Some(other) = node.pointer("/otherArtists/items").and_then(|v| v.as_array()) {
            for a in other {
                append_unique_artist(a);
            }
        }

        if artists.is_empty() {
            if let Some(first) = node.pointer("/firstArtist/items").and_then(|v| v.as_array()) {
                for a in first {
                    if let Some(n) = a.pointer("/profile/name").and_then(|v| v.as_str()) {
                        artists.push(n.to_string());
                    }
                }
            }
        }

        let artists_str = if artists.is_empty() {
            "Unknown Artist".to_string()
        } else {
            artists.join(", ")
        };

        let album_node = node
            .get("albumOfTrack")
            .or_else(|| root.pointer("/data/albumUnion"))
            .or_else(|| if root.get("name").is_some() { Some(root) } else { None });
        let album_name = album_node
            .and_then(|n| n.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Album")
            .to_string();

        // Album Artist from GraphQL
        let mut album_artist = None;
        if let Some(aa_node) = album_node
            .and_then(|n| n.get("artists"))
            .and_then(|v| v.as_array())
        {
            let aa_list: Vec<String> = aa_node
                .iter()
                .filter_map(|a| {
                    a.get("name")
                        .and_then(|n| n.as_str())
                        .or_else(|| a.pointer("/profile/name").and_then(|v| v.as_str()))
                })
                .map(|s| s.to_string())
                .collect();
            if !aa_list.is_empty() {
                album_artist = Some(aa_list.join(", "));
            }
        }

        let cover_url = album_node
            .and_then(|n| n.pointer("/coverArt/sources"))
            .and_then(|s| s.as_array())
            .and_then(|a| {
                // Find largest
                a.iter()
                    .max_by_key(|i| i.get("width").and_then(|v| v.as_u64()).unwrap_or(0))
            })
            .and_then(|i| i.get("url"))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        let track_id = node
            .get("id")
            .and_then(|v| v.as_str())
            .or_else(|| {
                node.get("uri")
                    .and_then(|v| v.as_str())
                    .map(|s| s.split(':').last().unwrap_or(""))
            })
            .unwrap_or("")
            .to_string();

        let track_num = node
            .get("trackNumber")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        let disc_num = node.get("discNumber").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
        let is_explicit = node
            .get("contentRating")
            .and_then(|v| v.get("label"))
            .and_then(|v| v.as_str())
            == Some("EXPLICIT");
        let duration_ms = node.get("durationMs")
            .or_else(|| node.pointer("/duration/totalMilliseconds"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        let plays = node.get("playcount")
            .or_else(|| node.get("playCount"))
            .or_else(|| node.pointer("/stats/playcount"))
            .or_else(|| node.pointer("/stats/playCount"))
            .and_then(|v| {
                v.as_str().map(|s| s.to_string())
                 .or_else(|| v.as_u64().map(|n| n.to_string()))
            });

        let total_tracks = album_node
            .and_then(|n| {
                n.pointer("/tracks/totalCount")
                    .or(n.pointer("/tracks/total_count"))
            })
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);

        let total_discs = album_node
            .and_then(|n| {
                n.pointer("/discs/totalCount")
                    .or(n.pointer("/discs/total_count"))
            })
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);

        let date_str = album_node
            .and_then(|n| n.pointer("/date/isoString"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Ok((
            TrackMetadata {
                id: track_id.clone(),
                title: name,
                artist: artists_str,
                album: album_name,
                album_artist,
                date: date_str.clone(),
                release_date: date_str,
                track_number: track_num,
                total_tracks,
                disc_number: disc_num,
                total_discs,
                isrc: None,
                upc: None,
                cover_url,
                spotify_url: Some(format!("https://open.spotify.com/track/{}", track_id)),
                genre: None,
                label: None,
                copyright: None,
                composer: None,
                lyrics_text: None,
                is_explicit,
                duration_ms,
                artist_avatar_url: None,
                artist_header_url: None,
                artist_gallery_urls: None,
            },
            first_artist_id,
            plays,
        ))
    }
}

#[derive(Debug)]
struct EnrichedData {
    isrc: Option<String>,
    upc: Option<String>,
    label: Option<String>,
    copyright: Option<String>,
    total_tracks: Option<u32>,
    total_discs: Option<u32>,
    album_artist: Option<String>,
}
