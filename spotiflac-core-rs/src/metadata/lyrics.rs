use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LRCLibResponse {
    pub id: i64,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: Option<String>,
    pub duration: Option<f64>,
    pub instrumental: bool,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsLine {
    pub start_time_ms: Option<u64>,
    pub words: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsResponse {
    pub sync_type: String, // "LINE_SYNCED" or "UNSYNCED"
    pub lines: Vec<LyricsLine>,
}

pub struct LyricsClient {
    client: Client,
}

impl LyricsClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .unwrap(),
        }
    }

    pub async fn fetch_lyrics_all_sources(
        &self,
        track: &str,
        artist: &str,
        album: Option<&str>,
        duration_sec: Option<u32>,
    ) -> Result<LyricsResponse> {
        // println!("🔍 Buscando letras para: {} - {}", artist, track);

        // 1. Exact match with album
        if let Some(album_name) = album {
            if let Ok(lrc) = self
                .fetch_exact(track, artist, Some(album_name), duration_sec)
                .await
            {
                if lrc.synced_lyrics.is_some() {
                    return Ok(self.convert_to_response(lrc));
                }
            }
        }

        // 2. Exact match without album
        if let Ok(lrc) = self.fetch_exact(track, artist, None, duration_sec).await {
            if lrc.synced_lyrics.is_some() {
                return Ok(self.convert_to_response(lrc));
            }
        }

        // 3. Search match
        if let Ok(results) = self.search(track, artist).await {
            if !results.is_empty() {
                // Return first with synced lyrics, otherwise first with plain
                let best = results
                    .iter()
                    .find(|r| r.synced_lyrics.is_some())
                    .unwrap_or(&results[0]);
                return Ok(self.convert_to_response(best.clone()));
            }
        }

        // 4. Simplified name search
        let simplified = self.simplify_track_name(track);
        if simplified != track {
            // println!("   Intentando con nombre simplificado: {}", simplified);
            return Box::pin(self.fetch_lyrics_all_sources(
                &simplified,
                artist,
                album,
                duration_sec,
            ))
            .await;
        }

        Err(anyhow!("No se encontraron letras en LRCLIB"))
    }

    async fn fetch_exact(
        &self,
        track: &str,
        artist: &str,
        album: Option<&str>,
        duration: Option<u32>,
    ) -> Result<LRCLibResponse> {
        let mut url = format!(
            "https://lrclib.net/api/get?artist_name={}&track_name={}",
            urlencoding::encode(artist),
            urlencoding::encode(track)
        );
        if let Some(a) = album {
            url.push_str(&format!("&album_name={}", urlencoding::encode(a)));
        }
        if let Some(d) = duration {
            url.push_str(&format!("&duration={}", d));
        }

        let resp = self.client.get(url).send().await?;
        if resp.status().is_success() {
            Ok(resp.json().await?)
        } else {
            Err(anyhow!("LRCLIB status {}", resp.status()))
        }
    }

    async fn search(&self, track: &str, artist: &str) -> Result<Vec<LRCLibResponse>> {
        let url = format!(
            "https://lrclib.net/api/search?artist_name={}&track_name={}",
            urlencoding::encode(artist),
            urlencoding::encode(track)
        );
        Ok(self.client.get(url).send().await?.json().await?)
    }

    fn convert_to_response(&self, lrc: LRCLibResponse) -> LyricsResponse {
        let mut lines = Vec::new();
        let sync_type = if lrc.synced_lyrics.is_some() {
            "LINE_SYNCED"
        } else {
            "UNSYNCED"
        };
        let lyrics_text = lrc.synced_lyrics.or(lrc.plain_lyrics).unwrap_or_default();

        for line in lyrics_text.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if line.starts_with('[') && line.len() > 10 {
                if let Some(close_bracket) = line.find(']') {
                    let timestamp = &line[1..close_bracket];
                    let words = &line[close_bracket + 1..];
                    let ms = self.lrc_timestamp_to_ms(timestamp);
                    lines.push(LyricsLine {
                        start_time_ms: Some(ms),
                        words: words.trim().to_string(),
                    });
                    continue;
                }
            }
            lines.push(LyricsLine {
                start_time_ms: None,
                words: line.to_string(),
            });
        }

        LyricsResponse {
            sync_type: sync_type.to_string(),
            lines,
        }
    }

    fn lrc_timestamp_to_ms(&self, timestamp: &str) -> u64 {
        // [mm:ss.xx]
        let parts: Vec<&str> = timestamp.split(':').collect();
        if parts.len() == 2 {
            let minutes: u64 = parts[0].parse().unwrap_or(0);
            let sec_parts: Vec<&str> = parts[1].split('.').collect();
            if vec![1, 2].contains(&sec_parts.len()) {
                let seconds: u64 = sec_parts[0].parse().unwrap_or(0);
                let centi: u64 = if sec_parts.len() == 2 {
                    sec_parts[1].parse().unwrap_or(0)
                } else {
                    0
                };
                return minutes * 60000 + seconds * 1000 + centi * 10;
            }
        }
        0
    }

    pub fn convert_to_lrc(&self, lyrics: &LyricsResponse, title: &str, artist: &str) -> String {
        let mut output = format!("[ti:{}]\n[ar:{}]\n[by:SpotiFlac]\n\n", title, artist);
        for line in &lyrics.lines {
            if let Some(ms) = line.start_time_ms {
                let timestamp = self.ms_to_lrc_timestamp(ms);
                output.push_str(&format!("{}{}\n", timestamp, line.words));
            } else {
                output.push_str(&format!("{}\n", line.words));
            }
        }
        output
    }

    fn ms_to_lrc_timestamp(&self, ms: u64) -> String {
        let minutes = ms / 60000;
        let seconds = (ms % 60000) / 1000;
        let centiseconds = (ms % 1000) / 10;
        format!("[{:02}:{:02}.{:02}]", minutes, seconds, centiseconds)
    }

    fn simplify_track_name(&self, name: &str) -> String {
        if let Some(idx) = name.find('(') {
            return name[..idx].trim().to_string();
        }
        if let Some(idx) = name.find(" - ") {
            return name[..idx].trim().to_string();
        }
        name.to_string()
    }
}
