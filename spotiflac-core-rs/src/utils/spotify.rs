use anyhow::{Result, anyhow};
use reqwest::Client;
use std::time::Duration;
use regex::Regex;

pub struct SpotifyUtils;

impl SpotifyUtils {
    pub async fn get_preview_url(track_id: &str) -> Result<String> {
        if track_id.is_empty() {
            return Err(anyhow!("Track ID cannot be empty"));
        }

        let embed_url = format!("https://open.spotify.com/embed/track/{}", track_id);
        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            .build()?;

        let resp = client.get(&embed_url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Embed page returned status {}", resp.status()));
        }

        let html = resp.text().await?;
        let re = Regex::new(r"https://p\.scdn\.co/mp3-preview/[a-zA-Z0-9]+")?;
        
        if let Some(mat) = re.find(&html) {
            Ok(mat.as_str().to_string())
        } else {
            Err(anyhow!("Preview URL not found in embed page"))
        }
    }
}
