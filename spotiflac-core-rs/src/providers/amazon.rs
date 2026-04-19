use anyhow::{Result, anyhow};
use async_trait::async_trait;
use crate::models::AudioQuality;
use super::AudioProvider;
use reqwest::Client;
use serde_json::Value;
use std::fs::File;
use std::io::Write;
use regex::Regex;

use crate::progress::{ProgressManager, ProgressReporter};
use std::sync::Arc;

pub struct AmazonProvider {
    client: Client,
}

impl AmazonProvider {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .user_agent(crate::models::APP_USER_AGENT)
                .build()
                .unwrap(),
        }
    }

    fn extract_asin(url: &str) -> Option<String> {
        // PARITY: Updated regex to be more inclusive
        let re = Regex::new(r"(B[0-9A-Z]{9})").unwrap();
        re.find(url).map(|m| m.as_str().to_string())
    }
}

#[async_trait]
impl AudioProvider for AmazonProvider {
    fn name(&self) -> &str { "Amazon" }

    async fn get_download_url(&self, amazon_query: &str, _quality: AudioQuality, progress: Arc<ProgressManager>) -> Result<String> {
        let asin = if amazon_query.starts_with("http") {
             Self::extract_asin(amazon_query).ok_or_else(|| anyhow!("Could not extract ASIN from Amazon URL: {}", amazon_query))?
        } else {
             amazon_query.to_string()
        };
        
        progress.log(&format!("  🔍 Buscando ASIN {} en mirrors de Amazon...", asin));

        let api_url = format!("https://amzn.afkarxyz.qzz.io/api/track/{}", asin);
        
        // PARITY: Use browser User-Agent for mirror requests
        let resp = self.client.get(&api_url)
            .header("User-Agent", crate::models::APP_USER_AGENT)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Amazon Mirror API Error: {} (Status: {})", api_url, resp.status()));
        }

        let body: Value = resp.json().await?;
        let stream_url = body.get("streamUrl").and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("No streamUrl found for Amazon track ASIN: {}", asin))?;
        
        let key = body.get("decryptionKey").and_then(|v| v.as_str()).unwrap_or("");

        if !key.is_empty() {
             Ok(format!("DECRYPT:{}:::{}", stream_url, key))
        } else {
             Ok(stream_url.to_string())
        }
    }

    async fn download_track(&self, encoded_url: &str, path: &str, progress: Arc<ProgressManager>, item_id: &str) -> Result<()> {
        let mut reporter = ProgressReporter::new(progress.clone(), item_id.to_string());
        
        let (url, _key) = if encoded_url.starts_with("DECRYPT:") {
            let parts: Vec<&str> = encoded_url[8..].split(":::").collect();
            (parts[0].to_string(), Some(parts[1].to_string()))
        } else {
            progress.log(&format!("DEBUG: Probando Mirror Amazon -> {}", encoded_url));
            match self.client.get(encoded_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let text = resp.text().await?;
                    if text.contains("http") {
                        progress.log("  ✓ URL de stream obtenida de Amazon.");
                        (text.trim().to_string(), None)
                    } else {
                        (encoded_url.to_string(), None)
                    }
                },
                Ok(resp) => {
                    progress.log(&format!("DEBUG: Mirror Amazon respondió con estado: {}", resp.status()));
                    (encoded_url.to_string(), None)
                },
                Err(e) => {
                    progress.log(&format!("DEBUG: Fallo mirror Amazon: {}", e));
                    (encoded_url.to_string(), None)
                }
            }
        };

        let mut resp = self.client.get(&url).send().await?;
        let mut file = File::create(path)?;
        while let Some(chunk) = resp.chunk().await? {
            reporter.update(chunk.len() as u64);
            file.write_all(&chunk)?;
        }
        
        Ok(())
    }
}
