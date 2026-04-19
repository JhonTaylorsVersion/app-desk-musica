use anyhow::{Result, anyhow};
use std::time::Duration;
use serde_json::Value;

pub mod cache;
pub mod resolvers;
pub mod spotify_id;
pub mod totp;

pub use resolvers::songlink::SongLinkResolver;
pub use resolvers::songstats::SongStatsResolver;
pub use resolvers::soundplate::SoundPlateResolver;
pub use cache::ISRCCache;
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct ResolvedLinks {
    pub isrc: String,
    pub tidal_id: Option<String>,
    pub tidal_url: Option<String>,
    pub amazon_url: Option<String>,
}

pub struct LinkResolver {
    client: reqwest::Client,
    pub songstats: SongStatsResolver,
    pub soundplate: SoundPlateResolver,
    pub songlink: SongLinkResolver,
    pub cache: Option<Arc<ISRCCache>>,
}

impl LinkResolver {
    pub fn new(cache: Option<Arc<ISRCCache>>) -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .user_agent(crate::models::APP_USER_AGENT)
                .build()
                .unwrap(),
            songstats: SongStatsResolver::new(),
            soundplate: SoundPlateResolver::new(),
            songlink: SongLinkResolver::new(),
            cache,
        }
    }

    /// Resolves a Spotify link to ISRC and other platform IDs via SongLink and secondary resolvers.
    pub async fn resolve_links(&self, spotify_url: &str, progress: Option<Arc<crate::progress::ProgressManager>>) -> Result<ResolvedLinks> {
        let clean_url = spotify_url.split('?').next().unwrap_or(spotify_url);
        let (_, spotify_id) = spotify_id::parse_spotify_url(clean_url)?;

        // 0. Check Cache first
        let mut isrc = String::new();
        if let Some(c) = &self.cache {
            if let Ok(Some(cached_isrc)) = c.get(&spotify_id) {
                if let Some(p) = &progress { p.log(&format!("DEBUG [ISRC]: Encontrado en cache -> {}", cached_isrc)); }
                isrc = cached_isrc;
            }
        }
        
        // 1. Resolve ISRC if not in cache (Spotify -> SoundPlate fallback)
        if isrc.is_empty() {
             isrc = self.resolve_isrc_spclient(spotify_url).await.unwrap_or_default();
             if isrc.is_empty() {
                  if let Some(p) = &progress { p.log("DEBUG [ISRC]: Spotify falló, probando SoundPlate..."); }
                  if let Ok(s_isrc) = self.soundplate.resolve_isrc(clean_url).await {
                      isrc = s_isrc;
                  }
             }
        }

        // 2. Resolve Platform Links via SongLink (Tidal, Amazon, Deezer)
        let primary_region = if clean_url.contains("/intl-es/") { "ES" } else { "US" };
        let regions = vec![Some(primary_region), Some("US"), Some("ES"), Some("GB"), None];

        let mut tidal_url = None;
        let mut amazon_url = None;
        let mut deezer_url = None;

        for region in regions {
            if (tidal_url.is_some() || amazon_url.is_some()) && !isrc.is_empty() { break; }

            if let Ok(data) = self.songlink.resolve_from_spotify(clean_url, region).await {
                if isrc.is_empty() { isrc = data.isrc.unwrap_or_default(); }
                if tidal_url.is_none() { tidal_url = data.tidal_url; }
                if amazon_url.is_none() { amazon_url = data.amazon_url; }
                if deezer_url.is_none() { deezer_url = data.deezer_url; }
            }
        }

        // 3. Fallbacks for ISRC (Deezer lookup) and Cross-Platform Resolution
        if deezer_url.is_none() && !isrc.is_empty() {
             if let Some(p) = &progress { p.log(&format!("  🔍 Fallback: Buscando enlace Deezer para ISRC {} (Deezer Pivot)...", isrc)); }
             if let Ok(d_url) = self.songlink.lookup_deezer_url_by_isrc(&isrc).await {
                 deezer_url = Some(d_url);
             }
        }

        if deezer_url.is_some() {
            let d_url = deezer_url.as_ref().unwrap();
            
            // If ISRC is still empty, get it from Deezer
            if isrc.is_empty() {
                if let Ok(d_isrc) = self.songlink.get_deezer_isrc(d_url).await {
                    isrc = d_isrc;
                }
            }

            // CROSS-PLATFORM FALLBACK: Try SongLink again but via Deezer URL
            // This is the secret parity fix from Go! Deezer links often provide better mapping to Amazon/Tidal.
            if let Some(p) = &progress { p.log("  🔄 Re-confirmando enlaces vía Deezer URL (Pivot de Calidad)..."); }
            if let Ok(d_data) = self.songlink.resolve_from_url(d_url, Some("US")).await {
                // We update existing links if Deezer found better ones
                if let Some(new_tidal) = d_data.tidal_url { tidal_url = Some(new_tidal); }
                if let Some(new_amazon) = d_data.amazon_url { amazon_url = Some(new_amazon); }
            }
        }

        // 4. Save to cache if found
        if !isrc.is_empty() {
            if let Some(c) = &self.cache {
                let _ = c.put(&spotify_id, &isrc);
            }
        }

        // 5. SECONDARY RESOLVERS: If SongLink missed something, use SongStats
        if (tidal_url.is_none() || amazon_url.is_none()) && !isrc.is_empty() {
            if let Some(p) = &progress { p.log(&format!("  🔍 Fallback: Probando SongStats para ISRC {}...", isrc)); }
            if let Ok(ss_links) = self.songstats.resolve_links(&isrc).await {
                if tidal_url.is_none() { tidal_url = ss_links.tidal_url; }
                if amazon_url.is_none() { amazon_url = ss_links.amazon_url; }
            }
        }

        let mut tidal_id = None;
        if let Some(t_url) = &tidal_url {
            if let Some(idx) = t_url.find("/track/") {
                tidal_id = Some(t_url[idx+7..].split('?').next().unwrap_or(&t_url[idx+7..]).to_string());
            }
        }

        if isrc.is_empty() { isrc = "UNKNOWN".to_string(); }

        Ok(ResolvedLinks { 
            isrc, 
            tidal_id, 
            tidal_url, 
            amazon_url 
        })
    }

    async fn resolve_isrc_spclient(&self, spotify_url: &str) -> Result<String> {
        let (_entity_type, id) = spotify_id::parse_spotify_url(spotify_url)?;
        let gid = spotify_id::spotify_id_to_gid(&id)?;
        let token = self.get_anonymous_token().await?;

        let metadata_url = format!("https://spclient.wg.spotify.com/metadata/4/track/{}", gid);
        
        let response = self.client.get(&metadata_url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json")
            .header("User-Agent", crate::models::APP_USER_AGENT)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!("Internal Spotify API failed"));
        }

        let body: Value = response.json().await?;
        if let Some(external_ids) = body.get("external_id") {
            if let Some(ids_array) = external_ids.as_array() {
                for entry in ids_array {
                    if entry.get("type").and_then(|v| v.as_str()) == Some("isrc") {
                        if let Some(isrc) = entry.get("id").and_then(|v| v.as_str()) {
                            return Ok(isrc.to_string());
                        }
                    }
                }
            }
        }

        Err(anyhow!("ISRC not found in metadata"))
    }

    pub async fn get_anonymous_token(&self) -> Result<String> {
        let (totp_code, version) = totp::generate_spotify_totp()?;
        let token_url = format!("https://open.spotify.com/api/token?reason=init&productType=web-player&totp={}&totpVer={}&totpServer={}", 
            totp_code, version, totp_code);

        let response = self.client.get(&token_url)
            .header("User-Agent", crate::models::APP_USER_AGENT)
            .send()
            .await?;

        let data: Value = response.json().await?;
        let token = data.get("accessToken")
            .and_then(|t| t.as_str())
            .ok_or_else(|| anyhow!("Token not found"))?;

        Ok(token.to_string())
    }
}
