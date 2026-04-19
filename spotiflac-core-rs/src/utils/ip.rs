use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use crate::models::CurrentIPInfo;

#[derive(Deserialize)]
struct IpWhoisResponse {
    success: bool,
    ip: String,
    country: String,
    country_code: String,
    message: Option<String>,
}

#[derive(Deserialize)]
struct IpapiResponse {
    ip: String,
    country_name: String,
    country_code: String,
    error: Option<bool>,
    reason: Option<String>,
}

pub struct IpResolver;

impl IpResolver {
    pub async fn fetch_current_ip_info() -> Result<CurrentIPInfo> {
        let client = Client::builder()
            .timeout(Duration::from_secs(8))
            .build()?;

        // Try ipwho.is first
        match Self::try_ipwhois(&client).await {
            Ok(info) => return Ok(info),
            Err(e) => println!("⚠️ ipwho.is lookup failed: {}, trying fallback...", e),
        }

        // Try ipapi.co fallback
        match Self::try_ipapi(&client).await {
            Ok(info) => return Ok(info),
            Err(e) => Err(anyhow!("failed to detect public IP: fallback failed: {}", e)),
        }
    }

    async fn try_ipwhois(client: &Client) -> Result<CurrentIPInfo> {
        let url = "https://ipwho.is/";
        let resp = client.get(url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")
            .header("Accept", "application/json")
            .send().await?;

        if !resp.status().is_success() {
            return Err(anyhow!("ipwho.is returned status {}", resp.status()));
        }

        let payload: IpWhoisResponse = resp.json().await?;
        if !payload.success {
            return Err(anyhow!("ipwho.is lookup failed: {}", payload.message.unwrap_or_else(|| "unknown error".to_string())));
        }

        if payload.ip.trim().is_empty() || payload.country.trim().is_empty() {
            return Err(anyhow!("ipwho.is returned incomplete data"));
        }

        Ok(CurrentIPInfo {
            ip: payload.ip.trim().to_string(),
            country: payload.country.trim().to_string(),
            country_code: payload.country_code.trim().to_string(),
            source: "ipwho.is".to_string(),
        })
    }

    async fn try_ipapi(client: &Client) -> Result<CurrentIPInfo> {
        let url = "https://ipapi.co/json/";
        let resp = client.get(url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")
            .header("Accept", "application/json")
            .send().await?;

        if !resp.status().is_success() {
            return Err(anyhow!("ipapi.co returned status {}", resp.status()));
        }

        let payload: IpapiResponse = resp.json().await?;
        if payload.error.unwrap_or(false) {
            return Err(anyhow!("ipapi.co lookup failed: {}", payload.reason.unwrap_or_else(|| "unknown error".to_string())));
        }

        if payload.ip.trim().is_empty() || payload.country_name.trim().is_empty() {
            return Err(anyhow!("ipapi.co returned incomplete data"));
        }

        Ok(CurrentIPInfo {
            ip: payload.ip.trim().to_string(),
            country: payload.country_name.trim().to_string(),
            country_code: payload.country_code.trim().to_string(),
            source: "ipapi.co".to_string(),
        })
    }
}
