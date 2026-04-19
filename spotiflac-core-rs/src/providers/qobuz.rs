use anyhow::{Result, anyhow};
use async_trait::async_trait;
use crate::models::AudioQuality;
use super::AudioProvider;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::collections::HashMap;
use md5;
use regex::Regex;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH, Duration};

use crate::progress::{ProgressManager, ProgressReporter};
use crate::storage::MirrorManager;

const PROBE_URL: &str = "https://open.qobuz.com/track/1";
const DEFAULT_APP_ID: &str = "712109809";
const DEFAULT_APP_SECRET: &str = "589be88e4538daea11f509d29e4a23b1";
const CREDENTIALS_FILE: &str = "qobuz-api-credentials.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct QobuzCredentials {
    pub app_id: String,
    pub app_secret: String,
    pub fetched_at: u64,
}

#[derive(Deserialize)]
struct QobuzMirrorResponse {
    pub url: Option<String>,
    pub data: Option<QobuzMirrorData>,
}

#[derive(Deserialize)]
struct QobuzMirrorData {
    pub url: Option<String>,
}

pub struct QobuzProvider {
    client: Client,
    creds: Arc<RwLock<Option<QobuzCredentials>>>,
    mirrors: Arc<MirrorManager>,
}

impl QobuzProvider {
    pub fn new(mirrors: Arc<MirrorManager>) -> Self {
        let creds = Self::load_cached_credentials();
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(20))
                .user_agent(crate::models::APP_USER_AGENT)
                .http1_only() // Force HTTP/1.1
                .no_gzip()    // Disable compression types mirrors might not handle
                .no_brotli()
                .build()
                .unwrap(),
            creds: Arc::new(RwLock::new(creds)),
            mirrors,
        }
    }

    fn get_cache_path() -> std::path::PathBuf {
        dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from(".")).join(".spotiflac").join(CREDENTIALS_FILE)
    }

    fn load_cached_credentials() -> Option<QobuzCredentials> {
        let path = Self::get_cache_path();
        if let Ok(mut file) = File::open(path) {
            let mut content = String::new();
            if file.read_to_string(&mut content).is_ok() {
                if let Ok(creds) = serde_json::from_str::<QobuzCredentials>(&content) {
                    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
                    if now - creds.fetched_at < 86400 { // 24h TTL
                        return Some(creds);
                    }
                }
            }
        }
        None
    }

    fn save_credentials(creds: &QobuzCredentials) {
        let path = Self::get_cache_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(mut file) = File::create(path) {
            if let Ok(content) = serde_json::to_string_pretty(creds) {
                let _ = file.write_all(content.as_bytes());
            }
        }
    }

    async fn get_valid_credentials(&self, force_refresh: bool, progress: Arc<ProgressManager>) -> Result<QobuzCredentials> {
        if !force_refresh {
            let creds_lock = self.creds.read().await;
            if let Some(c) = &*creds_lock {
                return Ok(c.clone());
            }
        }

        // Need to fetch
        progress.log("🔄 Renovando credenciales de Qobuz...");
        match self.scrape_credentials().await {
            Ok(c) => {
                let mut creds_lock = self.creds.write().await;
                *creds_lock = Some(c.clone());
                Self::save_credentials(&c);
                Ok(c)
            }
            Err(e) => {
                progress.log(&format!("⚠️ Error en scraping de Qobuz: {}. Usando fallback.", e));
                Ok(QobuzCredentials {
                    app_id: DEFAULT_APP_ID.to_string(),
                    app_secret: DEFAULT_APP_SECRET.to_string(),
                    fetched_at: 0,
                })
            }
        }
    }

    async fn scrape_credentials(&self) -> Result<QobuzCredentials> {
        let shell_html = self.client.get(PROBE_URL).send().await?.text().await?;
        
        let bundle_re = Regex::new(r#"<script[^>]+src="([^"]+/js/main\.js|/resources/[^"]+/js/main\.js)""#)?;
        let bundle_path = bundle_re.captures(&shell_html)
            .and_then(|c| c.get(1))
            .ok_or_else(|| anyhow!("Qobuz bundle JS not found"))?
            .as_str();

        let bundle_url = if bundle_path.starts_with('/') {
            format!("https://open.qobuz.com{}", bundle_path)
        } else {
            bundle_path.to_string()
        };

        let bundle_js = self.client.get(&bundle_url).send().await?.text().await?;
        
        let config_re = Regex::new(r#"app_id:"(\d{9})",app_secret:"([a-f0-9]{32})""#)?;
        let caps = config_re.captures(&bundle_js)
            .ok_or_else(|| anyhow!("Qobuz app_id/secret not found in JS bundle"))?;

        Ok(QobuzCredentials {
            app_id: caps.get(1).unwrap().as_str().to_string(),
            app_secret: caps.get(2).unwrap().as_str().to_string(),
            fetched_at: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(),
        })
    }

    fn generate_signature(&self, path: &str, params: &HashMap<String, String>, timestamp: &str, secret: &str) -> String {
        let normalized_path = path.trim_matches('/').replace("/", "");
        
        let mut keys: Vec<&String> = params.keys().collect();
        keys.sort();

        let mut sig_payload = normalized_path;
        for key in keys {
            if key == "app_id" || key == "request_ts" || key == "request_sig" {
                continue;
            }
            sig_payload.push_str(key);
            sig_payload.push_str(&params[key]);
        }
        
        sig_payload.push_str(timestamp);
        sig_payload.push_str(secret);

        let digest = md5::compute(sig_payload.as_bytes());
        format!("{:x}", digest)
    }

    pub async fn search_qobuz_id_from_isrc_for_availability(&self, isrc: &str, progress: Arc<ProgressManager>) -> Result<i64> {
        self.search_qobuz_id_from_isrc(isrc, false, progress).await
    }

    async fn search_qobuz_id_from_isrc(&self, isrc: &str, force_refresh_creds: bool, progress: Arc<ProgressManager>) -> Result<i64> {
        let creds = self.get_valid_credentials(force_refresh_creds, progress.clone()).await?;
        
        let mut params = HashMap::new();
        params.insert("query".to_string(), isrc.to_string());
        params.insert("limit".to_string(), "1".to_string());
        
        let timestamp = format!("{}", SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs());
        let sig = self.generate_signature("track/search", &params, &timestamp, &creds.app_secret);
        
        let url = "https://www.qobuz.com/api.json/0.2/track/search";
        let resp = self.client.get(url)
            .query(&params)
            .query(&[
                ("app_id", &creds.app_id),
                ("request_ts", &timestamp),
                ("request_sig", &sig),
            ])
            .send()
            .await?;

        if resp.status() == reqwest::StatusCode::UNAUTHORIZED || resp.status() == reqwest::StatusCode::BAD_REQUEST {
            if !force_refresh_creds {
                return Box::pin(self.search_qobuz_id_from_isrc(isrc, true, progress)).await;
            }
        }

        if !resp.status().is_success() {
            return Err(anyhow!("Qobuz API returned {}", resp.status()));
        }

        let body: serde_json::Value = resp.json().await?;
        body.pointer("/tracks/items/0/id")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| anyhow!("Track not found on Qobuz for ISRC: {}", isrc))
    }

    async fn get_download_url_with_fallback(&self, isrc: &str, quality: AudioQuality, allow_fallback: bool, progress: Arc<ProgressManager>) -> Result<String> {
        let q_index = match quality {
            AudioQuality::HiRes => 27,
            AudioQuality::Lossless => 6,
            AudioQuality::Low => 5,
        };

        progress.log(&format!("  🔍 Resolviendo ISRC {} en Qobuz...", isrc));
        let qobuz_id = self.search_qobuz_id_from_isrc(isrc, false, progress.clone()).await?;
        progress.log(&format!("  ✓ Qobuz ID encontrado: {}", qobuz_id));

        let mirrors = vec![
            "https://dab.yeet.su/api".to_string(),
            "https://dabmusic.xyz/api".to_string(),
            "https://qbz.afkarxyz.qzz.io/api".to_string(),
        ];

        let prioritized_mirrors = self.mirrors.prioritize("qobuz", mirrors);
        let mut last_error = anyhow!("No mirrors available");

        for mirror in prioritized_mirrors {
            let url = if mirror.contains("qbz") {
                format!("{}/track/{}/?quality={}", mirror, qobuz_id, q_index)
            } else {
                format!("{}/stream?trackId={}&quality={}", mirror, qobuz_id, q_index)
            };
            
            progress.log(&format!("DEBUG [Qobuz]: Probando Mirror -> {} [UA: Go-http-client/1.1]", mirror));
            
            // --- PARITY: Fresh client per mirror check (mirrors Go's architecture) ---
            let fresh_client = Client::builder()
                .timeout(std::time::Duration::from_secs(30)) // Increased to 30s
                .user_agent("Go-http-client/1.1") // Parity signature
                .http1_only() // Keep HTTP/1.1
                .danger_accept_invalid_certs(true)
                .build()
                .unwrap_or_else(|_| self.client.clone());

            // Anti-429 delay: Increased to 2 seconds for better stability
            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;

            match fresh_client.get(&url)
                .header("Accept", "*/*")
                .header("Connection", "keep-alive")
                .send().await {
                Ok(resp) if resp.status().is_success() => {
                    let body_bytes = resp.bytes().await?;
                    
                    // Try parsing as JSON first (mirrors Go logic)
                    if let Ok(m_resp) = serde_json::from_slice::<QobuzMirrorResponse>(&body_bytes) {
                        if let Some(u) = m_resp.url {
                            progress.log(&format!("DEBUG [Qobuz]: Mirror responde éxito (JSON)"));
                            self.mirrors.record_outcome("qobuz", &mirror, true);
                            return Ok(u);
                        }
                        if let Some(data) = m_resp.data {
                            if let Some(u) = data.url {
                                progress.log(&format!("DEBUG [Qobuz]: Mirror responde éxito (JSON Anidado)"));
                                self.mirrors.record_outcome("qobuz", &mirror, true);
                                return Ok(u);
                            }
                        }
                    }

                    // Fallback to plain text if JSON fails but contains http
                    let text = String::from_utf8_lossy(&body_bytes);
                    if text.contains("http") {
                        let lines: Vec<&str> = text.lines().collect();
                        for line in lines {
                            let trimmed = line.trim();
                            if trimmed.starts_with("http") && !trimmed.contains("{") {
                                progress.log(&format!("DEBUG [Qobuz]: Mirror responde éxito (Texto)"));
                                self.mirrors.record_outcome("qobuz", &mirror, true);
                                return Ok(trimmed.to_string());
                            }
                        }
                    }
                    
                    progress.log(&format!("DEBUG [Qobuz]: Mirror respondió 200 pero el cuerpo no es válido."));
                    self.mirrors.record_outcome("qobuz", &mirror, false);
                },
                Ok(resp) => {
                    progress.log(&format!("DEBUG [Qobuz]: Mirror rechazó [Code: {}]", resp.status()));
                    self.mirrors.record_outcome("qobuz", &mirror, false);
                    last_error = anyhow!("Mirror returned {}", resp.status());
                },
                Err(e) => {
                    let err_msg = format!("{:?}", e);
                    progress.log(&format!("DEBUG [Qobuz]: ERROR DE RED en {}: {}", mirror, err_msg));
                    self.mirrors.record_outcome("qobuz", &mirror, false);
                    last_error = e.into();
                }
            }
        }

        if allow_fallback {
            match quality {
                AudioQuality::HiRes => {
                    progress.log("⚠️ Qobuz HI_RES falló, intentando LOSSLESS...");
                    return Box::pin(self.get_download_url_with_fallback(isrc, AudioQuality::Lossless, true, progress)).await;
                },
                AudioQuality::Lossless => {
                    progress.log("⚠️ Qobuz LOSSLESS falló, intentando LOW...");
                    return Box::pin(self.get_download_url_with_fallback(isrc, AudioQuality::Low, false, progress)).await;
                },
                _ => {}
            }
        }

        Err(last_error)
    }
}

#[async_trait]
impl AudioProvider for QobuzProvider {
    fn name(&self) -> &str { "Qobuz" }

    async fn get_download_url(&self, isrc: &str, quality: AudioQuality, progress: Arc<ProgressManager>) -> Result<String> {
        self.get_download_url_with_fallback(isrc, quality, true, progress).await
    }

    async fn download_track(&self, url: &str, path: &str, progress: Arc<ProgressManager>, item_id: &str) -> Result<()> {
        let mut reporter = ProgressReporter::new(progress, item_id.to_string());
        let mut resp = self.client.get(url).send().await?;
        
        if !resp.status().is_success() {
             return Err(anyhow!("Qobuz download failed: status {}", resp.status()));
        }

        let mut file = File::create(path)?;
        while let Some(chunk) = resp.chunk().await? {
            reporter.update(chunk.len() as u64);
            file.write_all(&chunk)?;
        }
        Ok(())
    }
}
