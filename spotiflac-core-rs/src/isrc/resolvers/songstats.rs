use anyhow::{Result, anyhow};
use serde_json::Value;
use regex::Regex;
use std::time::Duration;
use reqwest::Client;

pub struct SongStatsResolver {
    client: Client,
}

impl SongStatsResolver {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .unwrap(),
        }
    }

    pub async fn resolve_links(&self, isrc: &str) -> Result<super::ResolvedPlatformLinks> {
        let page_url = format!("https://songstats.com/{}?ref=ISRCFinder", isrc.to_uppercase());
        let mut links = super::ResolvedPlatformLinks::default();

        let response = self.client.get(&page_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36")
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!("SongStats returned status {}", response.status()));
        }

        let body = response.text().await?;
        let script_pattern = Regex::new(r#"(?is)<script[^>]+type=["']application/ld\+json["'][^>]*>(.*?)</script>"#)?;

        let mut found = false;
        for cap in script_pattern.captures_iter(&body) {
            if let Some(json_str) = cap.get(1) {
                let json_str = json_str.as_str().trim();
                // We don't have html_unescape easily, but usually JSON in script is fine
                if let Ok(payload) = serde_json::from_str::<Value>(json_str) {
                    if self.collect_links(&payload, &mut links) {
                        found = true;
                    }
                }
            }
        }

        if !found {
            return Err(anyhow!("No platform links found in SongStats"));
        }

        Ok(links)
    }

    fn collect_links(&self, value: &Value, links: &mut super::ResolvedPlatformLinks) -> bool {
        let mut changed = false;
        match value {
            Value::Object(map) => {
                if let Some(same_as) = map.get("sameAs") {
                    if self.apply_same_as(same_as, links) {
                        changed = true;
                    }
                }
                for (_, v) in map {
                    if self.collect_links(v, links) {
                        changed = true;
                    }
                }
            }
            Value::Array(arr) => {
                for v in arr {
                    if self.collect_links(v, links) {
                        changed = true;
                    }
                }
            }
            _ => {}
        }
        changed
    }

    fn apply_same_as(&self, value: &Value, links: &mut super::ResolvedPlatformLinks) -> bool {
        let mut changed = false;
        match value {
            Value::String(s) => {
                if self.assign_link(s, links) {
                    changed = true;
                }
            }
            Value::Array(arr) => {
                for v in arr {
                    if let Some(s) = v.as_str() {
                        if self.assign_link(s, links) {
                            changed = true;
                        }
                    }
                }
            }
            _ => {}
        }
        changed
    }

    fn assign_link(&self, link: &str, links: &mut super::ResolvedPlatformLinks) -> bool {
        let link = link.trim();
        if link.is_empty() { return false; }

        if link.contains("listen.tidal.com/track") && links.tidal_url.is_none() {
            links.tidal_url = Some(link.to_string());
            println!("✓ Tidal URL found via SongStats");
            return true;
        }

        if link.contains("music.amazon.com") && links.amazon_url.is_none() {
            links.amazon_url = Some(link.to_string());
            println!("✓ Amazon URL found via SongStats");
            return true;
        }

        if link.contains("deezer.com") && links.deezer_url.is_none() {
            links.deezer_url = Some(link.to_string());
            println!("✓ Deezer URL found via SongStats");
            return true;
        }

        false
    }
}
