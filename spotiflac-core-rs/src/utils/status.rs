use anyhow::{anyhow, Result};
use lazy_static::lazy_static;
use reqwest::Client;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const UNIFIED_STATUS_API_URL: &str = "https://api-status.afkarxyz.qzz.io/api/status/spotiflac/";
const CACHE_TTL: Duration = Duration::from_secs(5);

struct StatusCache {
    body: String,
    expiry: Instant,
}

lazy_static! {
    static ref STATUS_CACHE: Mutex<Option<StatusCache>> = Mutex::new(None);
}

pub struct UnifiedStatusResolver;

impl UnifiedStatusResolver {
    pub async fn fetch_status_payload(force_refresh: bool) -> Result<String> {
        if !force_refresh {
            let cache = STATUS_CACHE.lock().unwrap();
            if let Some(c) = &*cache {
                if Instant::now() < c.expiry {
                    return Ok(c.body.clone());
                }
            }
        }

        let client = Client::builder().timeout(Duration::from_secs(10)).build()?;

        let mut last_error = anyhow!("Unknown error");
        for attempt in 1..=3 {
            match Self::perform_fetch(&client).await {
                Ok(raw_payload) => {
                    // Enrich payload locally to match original Go app logic
                    let mut payload: serde_json::Value = serde_json::from_str(&raw_payload)
                        .unwrap_or_else(|_| serde_json::json!({}));

                    // 1. Replicate Tidal status to mirrors (Tidal A -> Tidal B-G)
                    if let Some(tidal_status) = payload.get("tidal") {
                        let status_val = tidal_status.clone();
                        for mirror in &["tidal_b", "tidal_c", "tidal_d", "tidal_e", "tidal_f", "tidal_g"] {
                            payload.as_object_mut().unwrap().insert(mirror.to_string(), status_val.clone());
                        }
                    }

                    // 2. Direct check for MusicBrainz status
                    let mb_status = match client.get("https://musicbrainz.org").timeout(Duration::from_secs(3)).send().await {
                         Ok(resp) if resp.status().is_success() => "up",
                         _ => "down",
                    };
                    payload.as_object_mut().unwrap().insert("musicbrainz".to_string(), serde_json::json!(mb_status));

                    let enriched_payload = serde_json::to_string(&payload)?;

                    let mut cache = STATUS_CACHE.lock().unwrap();
                    *cache = Some(StatusCache {
                        body: enriched_payload.clone(),
                        expiry: Instant::now() + CACHE_TTL,
                    });
                    return Ok(enriched_payload);
                }
                Err(e) => {
                    last_error = e;
                    if attempt < 3 {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        }

        Err(anyhow!(
            "Unified status API failed after 3 retries: {}",
            last_error
        ))
    }

    async fn perform_fetch(client: &Client) -> Result<String> {
        let resp = client.get(UNIFIED_STATUS_API_URL)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")
            .header("Accept", "application/json")
            .send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            let preview = if body.len() > 200 {
                &body[..200]
            } else {
                &body
            };
            return Err(anyhow!("returned status {} ({})", status, preview));
        }

        let body = resp.text().await?.trim().to_string();
        if body.is_empty() {
            return Err(anyhow!("empty response body"));
        }

        Ok(body)
    }
}
