use futures::StreamExt;
use reqwest::Client;
use serde::Serialize;
use serde_json::{json, Value};
use spotiflac_core_rs::isrc::{spotify_id, LinkResolver};
use spotiflac_core_rs::metadata::spotify::SpotifyMetadataClient;

type CompatResult<T> = std::result::Result<T, String>;

#[derive(Debug, Clone, Serialize)]
struct ArtistSimpleCompat {
    id: String,
    name: String,
    external_urls: String,
}

#[derive(Debug, Clone, Serialize)]
struct TrackMetadataCompat {
    artists: String,
    name: String,
    album_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    album_artist: Option<String>,
    duration_ms: u32,
    images: String,
    release_date: String,
    track_number: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_tracks: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_discs: Option<u32>,
    disc_number: u32,
    external_urls: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    album_type: Option<String>,
    spotify_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    album_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    album_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artist_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artist_url: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    artists_data: Vec<ArtistSimpleCompat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    isrc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    upc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    copyright: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    composer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    plays: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    preview_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub added_at: Option<String>,
    pub is_explicit: bool,
}

#[derive(Debug, Serialize)]
struct TrackResponseCompat {
    track: TrackMetadataCompat,
}

#[derive(Debug, Serialize)]
struct AlbumInfoCompat {
    total_tracks: usize,
    name: String,
    release_date: String,
    artists: String,
    images: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    upc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artist_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artist_url: Option<String>,
}

#[derive(Debug, Serialize)]
struct AlbumResponseCompat {
    album_info: AlbumInfoCompat,
    track_list: Vec<TrackMetadataCompat>,
}

#[derive(Debug, Serialize)]
struct PlaylistOwnerCompat {
    display_name: String,
    name: String,
    images: String,
}

#[derive(Debug, Serialize)]
struct PlaylistCountCompat {
    total: usize,
}

#[derive(Debug, Serialize)]
struct PlaylistInfoCompat {
    name: String,
    tracks: PlaylistCountCompat,
    followers: PlaylistCountCompat,
    owner: PlaylistOwnerCompat,
    #[serde(skip_serializing_if = "String::is_empty")]
    cover: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct PlaylistResponseCompat {
    playlist_info: PlaylistInfoCompat,
    track_list: Vec<TrackMetadataCompat>,
}

#[derive(Debug, Serialize)]
struct ArtistInfoCompat {
    name: String,
    followers: u64,
    genres: Vec<String>,
    images: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    header: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    gallery: Vec<String>,
    external_urls: String,
    discography_type: String,
    total_albums: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    biography: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    verified: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    listeners: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rank: Option<u64>,
}

#[derive(Debug, Serialize)]
struct DiscographyAlbumCompat {
    id: String,
    name: String,
    album_type: String,
    release_date: String,
    total_tracks: usize,
    artists: String,
    images: String,
    external_urls: String,
}

#[derive(Debug, Serialize)]
struct ArtistDiscographyResponseCompat {
    artist_info: ArtistInfoCompat,
    album_list: Vec<DiscographyAlbumCompat>,
    track_list: Vec<TrackMetadataCompat>,
}

enum SpotifyEntity {
    Track(String),
    Album(String),
    Playlist(String),
    Artist(String),
}

#[derive(Clone)]
struct MetadataCompatClient {
    http: Client,
    token: String,
}

impl MetadataCompatClient {
    async fn new() -> CompatResult<Self> {
        let resolver = LinkResolver::new(None);
        let token = resolver
            .get_anonymous_token()
            .await
            .map_err(|e| e.to_string())?;
        Ok(Self {
            http: Client::new(),
            token,
        })
    }

    async fn query(
        &self,
        operation_name: &str,
        variables: Value,
        sha256_hash: &str,
    ) -> CompatResult<Value> {
        let url = "https://api-partner.spotify.com/pathfinder/v1/query";
        let query_params = [
            ("operationName", operation_name),
            ("variables", &variables.to_string()),
            (
                "extensions",
                &json!({
                    "persistedQuery": {
                        "version": 1,
                        "sha256Hash": sha256_hash,
                    }
                })
                .to_string(),
            ),
        ];

        // println!("[DEBUG][Rust][Spotify] Requesting {}...", operation_name);
        // println!("[DEBUG][Rust][Spotify]   URL: {}", url);
        // println!("[DEBUG][Rust][Spotify]   Params: {:?}", query_params);
        // println!("[DEBUG][Rust][Spotify]   Token (prefix): {}...", if self.token.len() > 10 { &self.token[0..10] } else { "too short" });

        let response = self
            .http
            .get(url)
            .query(&query_params)
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await
            .map_err(|e| format!("query failed for {}: {}", operation_name, e))?;

        let status = response.status();
        if !status.is_success() {
            let error_body = response
                .text()
                .await
                .unwrap_or_else(|_| "Could not read error body".to_string());
            let err_msg = format!(
                "non-success response for {}: HTTP {} - Body: {}",
                operation_name, status, error_body
            );
            // println!("[DEBUG][Rust][Spotify] ERROR: {}", err_msg);
            return Err(err_msg);
        }

        response
            .json::<Value>()
            .await
            .map_err(|e| format!("invalid JSON response: {}", e))
    }
}

pub async fn get_spotify_metadata_compat(url: &str) -> Result<Value, String> {
    let entity = parse_spotify_entity(url)?;
    let compat = MetadataCompatClient::new().await?;

    let value = match entity {
        SpotifyEntity::Track(track_id) => serde_json::to_value(TrackResponseCompat {
            track: fetch_track_compat(&compat, &track_id, None, None, None, None).await?,
        }),
        SpotifyEntity::Album(album_id) => {
            serde_json::to_value(fetch_album_compat(&compat, &album_id).await?)
        }
        SpotifyEntity::Playlist(playlist_id) => {
            serde_json::to_value(fetch_playlist_compat(&compat, &playlist_id).await?)
        }
        SpotifyEntity::Artist(artist_id) => {
            serde_json::to_value(fetch_artist_discography_compat(&compat, &artist_id).await?)
        }
    }
    .map_err(|e| e.to_string())?;

    Ok(value)
}

async fn fetch_track_compat(
    compat: &MetadataCompatClient,
    track_id: &str,
    pre_fetched_node: Option<&Value>,
    fallback_album: Option<&Value>,
    status: Option<String>,
    added_at: Option<String>,
) -> CompatResult<TrackMetadataCompat> {
    let metadata_client = SpotifyMetadataClient::new();

    let queried_track = if pre_fetched_node.is_none() {
        Some(
            compat
                .query(
                    "getTrack",
                    json!({
                        "uri": format!("spotify:track:{}", track_id),
                    }),
                    "612585ae06ba435ad26369870deaae23b5c8800a256cd8a57e08eddc25a37294",
                )
                .await?,
        )
    } else {
        None
    };

    let resolved_track_node = pre_fetched_node.or_else(|| {
        queried_track
            .as_ref()
            .and_then(|payload| payload.pointer("/data/trackUnion"))
    });
    let resolved_album_node =
        fallback_album.or_else(|| resolved_track_node.and_then(|node| node.get("albumOfTrack")));

    let (mut track, _first_artist_id, mut plays) = if let Some(node) = resolved_track_node {
        metadata_client
            .parse_single_track_node(node, resolved_album_node.unwrap_or(&Value::Null))
            .map_err(|e| e.to_string())?
    } else {
        metadata_client
            .fetch_track_info_enriched(&format!("https://open.spotify.com/track/{}", track_id))
            .await
            .map_err(|e| e.to_string())?
    };

    if pre_fetched_node.is_none() {
        if let Ok((enriched_track, _, enriched_plays)) = metadata_client
            .fetch_track_info_enriched(&format!("https://open.spotify.com/track/{}", track_id))
            .await
        {
            if track.isrc.is_none() {
                track.isrc = enriched_track.isrc;
            }
            if track.upc.is_none() {
                track.upc = enriched_track.upc;
            }
            if track.label.is_none() {
                track.label = enriched_track.label;
            }
            if track.composer.is_none() {
                track.composer = enriched_track.composer;
            }
            if track.album_artist.is_none() {
                track.album_artist = enriched_track.album_artist;
            }
            if track.total_tracks.is_none() {
                track.total_tracks = enriched_track.total_tracks;
            }
            if track.total_discs.is_none() {
                track.total_discs = enriched_track.total_discs;
            }
            if track.copyright.is_none() {
                track.copyright = enriched_track.copyright;
            }
            if track.cover_url.is_none() {
                track.cover_url = enriched_track.cover_url;
            }
            if track.release_date.is_none() {
                track.release_date = enriched_track.release_date;
            }
            if track.spotify_url.is_none() {
                track.spotify_url = enriched_track.spotify_url;
            }
            if track.album == "Unknown Album" || track.album.is_empty() {
                track.album = enriched_track.album;
            }
            if track.artist == "Unknown Artist" || track.artist.is_empty() {
                track.artist = enriched_track.artist;
            }
            if track.title == "Unknown Track" || track.title.is_empty() {
                track.title = enriched_track.title;
            }
            if track.duration_ms == 0 {
                track.duration_ms = enriched_track.duration_ms;
            }
            if plays.is_none() {
                plays = enriched_plays;
            }
        }
    }

    if (track.copyright.is_none() || track.copyright.as_deref() == Some(""))
        && resolved_album_node.is_some()
    {
        track.copyright = extract_album_copyright(resolved_album_node);
    }

    let album_id = resolved_album_node
        .and_then(|album| extract_id(album))
        .or_else(|| track.spotify_url.as_ref().and_then(|_| None));

    let album_name = if track.album.is_empty() || track.album == "Unknown Album" {
        resolved_album_node
            .and_then(|v| {
                json_pointer_string(v, "/name").or_else(|| v.get("name").and_then(Value::as_str))
            })
            .unwrap_or("Unknown Album")
            .to_string()
    } else {
        track.album.clone()
    };

    let album_url = album_id
        .as_ref()
        .map(|id| format!("https://open.spotify.com/album/{}", id));

    let artist_items = resolved_track_node
        .map(track_artist_items)
        .filter(|items| !items.is_empty())
        .or_else(|| {
            resolved_album_node.and_then(|album| {
                album
                    .pointer("/artists/items")
                    .or_else(|| album.get("artists"))
                    .and_then(Value::as_array)
                    .cloned()
            })
        })
        .unwrap_or_default();

    let artists_data = if artist_items.is_empty() {
        build_simple_artists_from_names(&track.artist)
    } else {
        artist_items
            .iter()
            .filter_map(parse_artist_simple)
            .collect::<Vec<_>>()
    };

    let artist_id = artists_data.first().map(|artist| artist.id.clone());
    let artist_url = artists_data
        .first()
        .map(|artist| artist.external_urls.clone());

    Ok(TrackMetadataCompat {
        artists: track.artist,
        name: track.title,
        album_name,
        album_artist: track.album_artist,
        duration_ms: track.duration_ms,
        images: track.cover_url.unwrap_or_default(),
        release_date: track.release_date.unwrap_or_default(),
        track_number: track.track_number,
        total_tracks: track.total_tracks,
        total_discs: track.total_discs,
        disc_number: track.disc_number,
        external_urls: track
            .spotify_url
            .unwrap_or_else(|| format!("https://open.spotify.com/track/{}", track_id)),
        album_type: resolved_album_node.and_then(|album| {
            json_pointer_string(album, "/type")
                .or_else(|| json_pointer_string(album, "/albumType"))
                .map(ToOwned::to_owned)
        }),
        spotify_id: track_id.to_string(),
        added_at,
        album_id,
        album_url,
        artist_id,
        artist_url,
        artists_data,
        isrc: track.isrc,
        upc: track.upc,
        copyright: track.copyright,
        publisher: track.label,
        composer: track.composer,
        plays,
        preview_url: None,
        status,
        is_explicit: track.is_explicit,
    })
}

async fn fetch_album_compat(
    compat: &MetadataCompatClient,
    album_id: &str,
) -> CompatResult<AlbumResponseCompat> {
    let album: Value = compat
        .query(
            "getAlbum",
            json!({
                "uri": format!("spotify:album:{}", album_id),
                "locale": "",
                "offset": 0,
                "limit": 300,
            }),
            "b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10",
        )
        .await?;

    let album_union = album
        .pointer("/data/albumUnion")
        .ok_or_else(|| "albumUnion not found".to_string())?;

    let items = album_union
        .pointer("/tracks/items")
        .or_else(|| album_union.pointer("/tracksV2/items"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let artists = join_artist_names(
        album_union
            .pointer("/artists/items")
            .or_else(|| album_union.get("artists"))
            .and_then(Value::as_array),
    );
    let cover = max_image_url(
        album_union
            .pointer("/coverArt/sources")
            .or_else(|| album_union.pointer("/coverArt/items/0/sources")),
    );
    let release_date = json_pointer_string(album_union, "/date/isoString")
        .unwrap_or_default()
        .to_string();
    let artist_id = album_union
        .pointer("/artists/items")
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .and_then(extract_id);
    let artist_url = artist_id
        .as_ref()
        .map(|id| format!("https://open.spotify.com/artist/{}", id));

    let mut tracks = Vec::new();
    for item in items {
        let node = item
            .get("track")
            .or_else(|| item.get("item"))
            .unwrap_or(&item);
        if let Some(track_id) = extract_id(node) {
            tracks.push(
                fetch_track_compat(compat, &track_id, Some(node), Some(album_union), None, None)
                    .await?,
            );
        }
    }

    Ok(AlbumResponseCompat {
        album_info: AlbumInfoCompat {
            total_tracks: tracks.len(),
            name: json_pointer_string(album_union, "/name")
                .unwrap_or("Unknown Album")
                .to_string(),
            release_date,
            artists,
            images: cover,
            upc: None,
            artist_id,
            artist_url,
        },
        track_list: tracks,
    })
}

async fn fetch_playlist_compat(
    compat: &MetadataCompatClient,
    playlist_id: &str,
) -> CompatResult<PlaylistResponseCompat> {
    let mut offset = 0;
    let limit = 300;
    let mut track_list = Vec::new();
    let mut total_tracks = 0;
    let mut playlist_info = None;

    loop {
        // println!("[DEBUG][Rust][Spotify] Fetching playlist page - Offset: {}, Limit: {}", offset, limit);
        let playlist: Value = compat
            .query(
                "fetchPlaylist",
                json!({
                    "uri": format!("spotify:playlist:{}", playlist_id),
                    "offset": offset,
                    "limit": limit,
                    "enableWatchFeedEntrypoint": true,
                }),
                "bb67e0af06e8d6f52b531f97468ee4acd44cd0f82b988e15c2ea47b1148efc77",
            )
            .await?;

        let playlist_v2 = playlist
            .pointer("/data/playlistV2")
            .or_else(|| playlist.pointer("/data/playlist"))
            .ok_or_else(|| "playlist payload not found".to_string())?;

        // Initialize playlist info and total tracks from the first page
        if playlist_info.is_none() {
            total_tracks = json_pointer_u64(playlist_v2, "/content/totalCount")
                .map(|v| v as usize)
                .unwrap_or(0);

            let owner_name = json_pointer_string(playlist_v2, "/ownerV2/data/name")
                .or_else(|| json_pointer_string(playlist_v2, "/owner/name"))
                .unwrap_or("Unknown")
                .to_string();
            let owner_avatar = first_image_url(
                playlist_v2
                    .pointer("/ownerV2/data/avatar/sources")
                    .or_else(|| playlist_v2.pointer("/owner/images/items/0/sources"))
                    .or_else(|| playlist_v2.pointer("/owner/images/sources")),
            );

            playlist_info = Some(PlaylistInfoCompat {
                name: json_pointer_string(playlist_v2, "/name")
                    .unwrap_or("Unknown Playlist")
                    .to_string(),
                tracks: PlaylistCountCompat {
                    total: total_tracks,
                },
                followers: PlaylistCountCompat {
                    total: json_pointer_u64(playlist_v2, "/followers")
                        .or_else(|| json_pointer_u64(playlist_v2, "/followersCount"))
                        .map(|v| v as usize)
                        .unwrap_or(0),
                },
                owner: PlaylistOwnerCompat {
                    display_name: owner_name.clone(),
                    name: owner_name,
                    images: owner_avatar,
                },
                cover: first_image_url(
                    playlist_v2
                        .pointer("/images/items/0/sources")
                        .or_else(|| playlist_v2.pointer("/images/sources")),
                ),
                description: json_pointer_string(playlist_v2, "/description")
                    .unwrap_or_default()
                    .to_string(),
                snapshot_id: json_pointer_string(playlist_v2, "/revision").map(ToOwned::to_owned),
            });
        }

        let content_items = playlist_v2
            .pointer("/content/items")
            .and_then(Value::as_array);

        if let Some(items) = content_items {
            if items.is_empty() {
                break;
            }

            let page_len = items.len();
            for item in items {
                let status = json_pointer_string(item, "/itemV2/data/status")
                    .or_else(|| json_pointer_string(item, "/status"))
                    .map(ToOwned::to_owned);
                let node = item
                    .pointer("/itemV2/data")
                    .or_else(|| item.pointer("/item/data"))
                    .or_else(|| item.get("track"))
                    .unwrap_or(item);

                if let Some(track_id) = extract_id(node) {
                    let added_at =
                        json_pointer_string(item, "/addedAt/isoString").map(ToOwned::to_owned);
                    track_list.push(
                        fetch_track_compat(compat, &track_id, Some(node), None, status, added_at)
                            .await?,
                    );
                }
            }

            offset += page_len;

            // Si ya tenemos todas las canciones o la pÃ¡gina vino incompleta, terminamos
            if offset >= total_tracks || page_len < limit {
                break;
            }
        } else {
            break;
        }
    }

    let info = playlist_info.ok_or_else(|| "Playlist info not found".to_string())?;

    Ok(PlaylistResponseCompat {
        playlist_info: info,
        track_list,
    })
}

async fn fetch_artist_discography_compat(
    compat: &MetadataCompatClient,
    artist_id: &str,
) -> CompatResult<ArtistDiscographyResponseCompat> {
    let overview: Value = compat
        .query(
            "queryArtistOverview",
            json!({
                "uri": format!("spotify:artist:{}", artist_id),
                "locale": "",
            }),
            "446130b4a0aa6522a686aafccddb0ae849165b5e0436fd802f96e0243617b5d8",
        )
        .await?;

    let discography: Value = compat
        .query(
            "queryArtistDiscographyAll",
            json!({
                "uri": format!("spotify:artist:{}", artist_id),
                "offset": 0,
                "limit": 100,
                "locale": "",
            }),
            "5e07d323febb57b4a56a42abbf781490e58764aa45feb6e3dc0591564fc56599",
        )
        .await?;

    let artist_union = overview
        .pointer("/data/artistUnion")
        .ok_or_else(|| "artistUnion not found".to_string())?;
    let album_items = discography
        .pointer("/data/artistUnion/discography/all/items")
        .or_else(|| discography.pointer("/data/artistUnion/discography/albums/items"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let artist_name = json_pointer_string(artist_union, "/profile/name")
        .unwrap_or("Unknown Artist")
        .to_string();

    let mut album_list = Vec::new();
    let mut track_list = Vec::new();

    let compat_clone = compat.clone();
    let artist_name_clone = artist_name.clone();

    let album_results = futures::stream::iter(album_items.into_iter().filter_map(|item| {
        let album_node = item
            .pointer("/releases/items/0")
            .or_else(|| item.get("item"))
            .unwrap_or(&item)
            .clone();
        extract_id(&album_node).map(|id| (id, album_node))
    }))
    .map(|(album_id, album_node)| {
        let c = compat_clone.clone();
        let an = artist_name_clone.clone();
        async move {
            let disc_album = DiscographyAlbumCompat {
                id: album_id.clone(),
                name: json_pointer_string(&album_node, "/name")
                    .unwrap_or("Unknown Album")
                    .to_string(),
                album_type: json_pointer_string(&album_node, "/type")
                    .or_else(|| json_pointer_string(&album_node, "/albumType"))
                    .unwrap_or("album")
                    .to_string(),
                release_date: json_pointer_string(&album_node, "/date/isoString")
                    .unwrap_or_default()
                    .to_string(),
                total_tracks: json_pointer_u64(&album_node, "/tracks/totalCount")
                    .or_else(|| json_pointer_u64(&album_node, "/trackCount"))
                    .map(|v| v as usize)
                    .unwrap_or(0),
                artists: an,
                images: max_image_url(
                    album_node
                        .pointer("/coverArt/sources")
                        .or_else(|| album_node.pointer("/coverArt/items/0/sources")),
                ),
                external_urls: format!("https://open.spotify.com/album/{}", album_id),
            };

            let album_details = fetch_album_compat(&c, &album_id).await.ok();
            (disc_album, album_details)
        }
    })
    .buffer_unordered(5)
    .collect::<Vec<_>>()
    .await;

    for (disc_album, album_details) in album_results {
        album_list.push(disc_album);
        if let Some(details) = album_details {
            track_list.extend(details.track_list);
        }
    }

    Ok(ArtistDiscographyResponseCompat {
        artist_info: ArtistInfoCompat {
            name: artist_name,
            followers: json_pointer_u64(artist_union, "/stats/followers").unwrap_or(0),
            genres: artist_union
                .pointer("/genres/items")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(|item| {
                            item.get("name")
                                .and_then(Value::as_str)
                                .or_else(|| item.as_str())
                                .map(ToOwned::to_owned)
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default(),
            images: max_image_url(artist_union.pointer("/visuals/avatarImage/sources")),
            header: Some(first_image_url(
                artist_union.pointer("/visuals/headerImage/sources"),
            ))
            .filter(|value| !value.is_empty()),
            gallery: artist_union
                .pointer("/visuals/gallery/items")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .map(|item| first_image_url(item.pointer("/sources")))
                        .filter(|url| !url.is_empty())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default(),
            external_urls: format!("https://open.spotify.com/artist/{}", artist_id),
            discography_type: "all".to_string(),
            total_albums: album_list.len(),
            biography: json_pointer_string(artist_union, "/profile/biography/text")
                .or_else(|| json_pointer_string(artist_union, "/profile/biography"))
                .map(ToOwned::to_owned),
            verified: artist_union
                .pointer("/profile/verified")
                .and_then(Value::as_bool),
            listeners: json_pointer_u64(artist_union, "/stats/monthlyListeners"),
            rank: json_pointer_u64(artist_union, "/stats/worldRank"),
        },
        album_list,
        track_list,
    })
}

fn parse_spotify_entity(input: &str) -> CompatResult<SpotifyEntity> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Spotify URL is required".to_string());
    }

    if let Ok((entity_type, id)) = spotify_id::parse_spotify_url(trimmed) {
        return match entity_type.as_str() {
            "track" => Ok(SpotifyEntity::Track(id)),
            "album" => Ok(SpotifyEntity::Album(id)),
            "playlist" => Ok(SpotifyEntity::Playlist(id)),
            "artist" => Ok(SpotifyEntity::Artist(id)),
            other => Err(format!("unsupported Spotify entity: {}", other)),
        };
    }

    let normalized = trimmed
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("open.spotify.com/")
        .trim_start_matches("play.spotify.com/");
    let parts = normalized.split('?').next().unwrap_or(normalized);
    let segments = parts
        .split('/')
        .filter(|part| !part.is_empty() && *part != "embed")
        .collect::<Vec<_>>();

    for i in 0..segments.len().saturating_sub(1) {
        match segments[i] {
            "track" => return Ok(SpotifyEntity::Track(segments[i + 1].to_string())),
            "album" => return Ok(SpotifyEntity::Album(segments[i + 1].to_string())),
            "playlist" => return Ok(SpotifyEntity::Playlist(segments[i + 1].to_string())),
            "artist" => return Ok(SpotifyEntity::Artist(segments[i + 1].to_string())),
            _ => continue,
        }
    }

    if !segments.is_empty() {
        return Err(format!(
            "unsupported Spotify entity or locale: {}",
            segments[0]
        ));
    }

    Err("invalid Spotify URL".to_string())
}

fn parse_artist_simple(value: &Value) -> Option<ArtistSimpleCompat> {
    let id = extract_id(value)?;
    let name = json_pointer_string(value, "/profile/name")
        .or_else(|| json_pointer_string(value, "/name"))
        .unwrap_or("Unknown Artist")
        .to_string();
    Some(ArtistSimpleCompat {
        id: id.clone(),
        name,
        external_urls: format!("https://open.spotify.com/artist/{}", id),
    })
}

fn build_simple_artists_from_names(artists: &str) -> Vec<ArtistSimpleCompat> {
    artists
        .split(',')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| ArtistSimpleCompat {
            id: String::new(),
            name: name.to_string(),
            external_urls: String::new(),
        })
        .collect()
}

fn track_artist_items(track_node: &Value) -> Vec<Value> {
    let mut combined = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let mut push_unique = |items: Option<&Vec<Value>>| {
        if let Some(items) = items {
            for item in items {
                let key = extract_id(item)
                    .or_else(|| {
                        json_pointer_string(item, "/profile/name")
                            .or_else(|| json_pointer_string(item, "/name"))
                            .map(ToOwned::to_owned)
                    })
                    .unwrap_or_default();

                if key.is_empty() || seen.insert(key) {
                    combined.push(item.clone());
                }
            }
        }
    };

    push_unique(
        track_node
            .pointer("/firstArtist/items")
            .and_then(Value::as_array),
    );
    push_unique(
        track_node
            .pointer("/artists/items")
            .or_else(|| track_node.get("artists"))
            .and_then(Value::as_array),
    );
    push_unique(
        track_node
            .pointer("/otherArtists/items")
            .and_then(Value::as_array),
    );

    combined
}

fn extract_album_copyright(album_node: Option<&Value>) -> Option<String> {
    let items = album_node?
        .pointer("/copyright/items")
        .and_then(Value::as_array)?;

    let standard = items.iter().find_map(|item| {
        let text = json_pointer_string(item, "/text")?;
        let kind = json_pointer_string(item, "/type");
        if kind != Some("P") && !text.trim().is_empty() {
            Some(text.to_string())
        } else {
            None
        }
    });

    standard.or_else(|| {
        items.iter().find_map(|item| {
            let text = json_pointer_string(item, "/text")?;
            if !text.trim().is_empty() {
                Some(text.to_string())
            } else {
                None
            }
        })
    })
}

fn join_artist_names(items: Option<&Vec<Value>>) -> String {
    items
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    json_pointer_string(item, "/profile/name")
                        .or_else(|| json_pointer_string(item, "/name"))
                        .map(ToOwned::to_owned)
                })
                .collect::<Vec<_>>()
                .join(", ")
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Unknown Artist".to_string())
}

fn extract_id(value: &Value) -> Option<String> {
    value
        .get("id")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| {
            value
                .get("uri")
                .and_then(Value::as_str)
                .map(|uri| uri.split(':').next_back().unwrap_or_default().to_string())
        })
}

fn json_pointer_string<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer).and_then(Value::as_str)
}

fn json_pointer_u64(value: &Value, pointer: &str) -> Option<u64> {
    value.pointer(pointer).and_then(Value::as_u64)
}

fn first_image_url(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .and_then(|entry| entry.get("url").and_then(Value::as_str))
        .unwrap_or_default()
        .to_string()
}

fn max_image_url(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_array)
        .and_then(|arr| {
            arr.iter().max_by_key(|entry| {
                entry
                    .get("width")
                    .and_then(Value::as_u64)
                    .unwrap_or_default()
            })
        })
        .and_then(|entry| entry.get("url").and_then(Value::as_str))
        .unwrap_or_default()
        .to_string()
}
