use anyhow::{Result, anyhow};
use serde_json::Value;
use reqwest::Client;
use std::time::Duration;
use regex::Regex;

pub struct SongLinkResolver {
    client: Client,
}

impl SongLinkResolver {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .user_agent(crate::models::APP_USER_AGENT)
                .build()
                .unwrap(),
        }
    }

    pub async fn resolve_from_spotify(&self, spotify_url: &str, region: Option<&str>) -> Result<SongLinkData> {
        self.resolve_from_url(spotify_url, region).await
    }

    pub async fn resolve_from_url(&self, url: &str, region: Option<&str>) -> Result<SongLinkData> {
        let region_str = region.unwrap_or("US");
        
        let mut api_url = format!("https://api.song.link/v1-alpha.1/links?url={}", urlencoding::encode(url));
        api_url.push_str(&format!("&userCountry={}", region_str));

        let response = self.client.get(&api_url).send().await?;
        if !response.status().is_success() {
            return Err(anyhow!("SongLink API failed with status {}", response.status()));
        }

        let body: Value = response.json().await?;
        let mut data = SongLinkData::default();

        // 1. Extract ISRC from entities
        if let Some(entities) = body.get("entitiesByUniqueId") {
            if let Some(obj) = entities.as_object() {
                for (_, entity) in obj {
                    if let Some(isrc) = entity.get("isrc").and_then(|v| v.as_str()) {
                        data.isrc = Some(isrc.to_uppercase().to_string());
                        break;
                    }
                }
            }
        }

        // 2. Extract Platform Links
        if let Some(links) = body.get("linksByPlatform") {
            if let Some(tidal) = links.get("tidal").and_then(|l| l.get("url")).and_then(|v| v.as_str()) {
                data.tidal_url = Some(tidal.to_string());
            }
            if let Some(amazon) = links.get("amazonMusic").and_then(|l| l.get("url")).and_then(|v| v.as_str()) {
                data.amazon_url = self.normalize_amazon_url(amazon);
            }
            if let Some(deezer) = links.get("deezer").and_then(|l| l.get("url")).and_then(|v| v.as_str()) {
                data.deezer_url = self.normalize_deezer_url(deezer);
            }
        }

        Ok(data)
    }

    pub fn normalize_amazon_url(&self, url: &str) -> Option<String> {
        if url.is_empty() { return None; }
        
        // Pattern: trackAsin=B0...
        if let Some(idx) = url.find("trackAsin=") {
            let start = idx + 10;
            let end = url[start..].find('&').map(|i| start + i).unwrap_or(url.len());
            let asin = &url[start..end];
            if !asin.is_empty() {
                return Some(format!("https://music.amazon.com/tracks/{}?musicTerritory=US", asin));
            }
        }

        // Regex patterns for path-based IDs
        let re_album = Regex::new(r"/(?:albums|album)/[A-Z0-9]{10}/?(B[0-9A-Z]{9})?").unwrap();
        let re_track = Regex::new(r"/(?:tracks|track)/(B[0-9A-Z]{9})").unwrap();

        if let Some(caps) = re_track.captures(url) {
            return Some(format!("https://music.amazon.com/tracks/{}?musicTerritory=US", &caps[1]));
        }
        if let Some(caps) = re_album.captures(url) {
             if let Some(asin) = caps.get(1) {
                return Some(format!("https://music.amazon.com/tracks/{}?musicTerritory=US", asin.as_str()));
             }
        }
        
        // Final fallback: just try to find something that looks like an ASIN in the whole URL
        // PARITY: Updated to B[0-9A-Z]{9} to match Go's more inclusive pattern
        let re_asin = Regex::new(r"(B[0-9A-Z]{9})").unwrap();
        if let Some(caps) = re_asin.captures(url) {
             return Some(format!("https://music.amazon.com/tracks/{}?musicTerritory=US", &caps[1]));
        }

        None
    }

    pub fn normalize_deezer_url(&self, url: &str) -> Option<String> {
        if let Some(id) = self.extract_deezer_id(url) {
            return Some(format!("https://www.deezer.com/track/{}", id));
        }
        None
    }

    fn extract_deezer_id(&self, url: &str) -> Option<String> {
        let parts: Vec<&str> = url.split("/track/").collect();
        if parts.len() < 2 { return None; }
        
        let id = parts[1].split('?').next().unwrap_or(parts[1]).trim_matches('/');
        if id.is_empty() { return None; }
        Some(id.to_string())
    }

    pub async fn get_deezer_isrc(&self, deezer_url: &str) -> Result<String> {
        let id = self.extract_deezer_id(deezer_url).ok_or_else(|| anyhow!("Invalid Deezer URL"))?;
        let api_url = format!("https://api.deezer.com/track/{}", id);
        
        let resp = self.client.get(&api_url).send().await?;
        let data: Value = resp.json().await?;
        
        let isrc = data.get("isrc")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("ISRC not found in Deezer API"))?;
            
        Ok(isrc.to_uppercase().to_string())
    }

    pub async fn lookup_deezer_url_by_isrc(&self, isrc: &str) -> Result<String> {
        let api_url = format!("https://api.deezer.com/track/isrc:{}", isrc.to_uppercase());
        
        let resp = self.client.get(&api_url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Deezer ISRC API failed with status {}", resp.status()));
        }

        let body: Value = resp.json().await?;
        
        if let Some(link) = body.get("link").and_then(|v| v.as_str()) {
            return Ok(link.to_string());
        }

        if let Some(id) = body.get("id").and_then(|v| v.as_u64()) {
            return Ok(format!("https://www.deezer.com/track/{}", id));
        }

        Err(anyhow!("No Deezer track link found for ISRC {}", isrc))
    }
}

#[derive(Debug, Default, Clone)]
pub struct SongLinkData {
    pub isrc: Option<String>,
    pub tidal_url: Option<String>,
    pub amazon_url: Option<String>,
    pub deezer_url: Option<String>,
}
