use anyhow::{Result, anyhow};
use serde_json::Value;
use std::time::Duration;
use reqwest::Client;

pub struct SoundPlateResolver {
    client: Client,
}

impl SoundPlateResolver {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .unwrap(),
        }
    }

    pub async fn resolve_isrc(&self, spotify_url: &str) -> Result<String> {
        let api_url = "https://phpstack-822472-6184058.cloudwaysapps.com/api/spotify.php";
        
        let response = self.client.get(api_url)
            .query(&[("q", spotify_url)])
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")
            .header("Referer", "https://phpstack-822472-6184058.cloudwaysapps.com/?")
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!("SoundPlate returned status {}", response.status()));
        }

        let body: Value = response.json().await?;
        
        if let Some(isrc) = body.get("isrc").and_then(|v| v.as_str()) {
            if !isrc.is_empty() {
                return Ok(isrc.to_string());
            }
        }

        Err(anyhow!("ISRC not found in SoundPlate response"))
    }
}
