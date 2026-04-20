use anyhow::{anyhow, Result};
use num_bigint::BigUint;

pub fn parse_spotify_url(url: &str) -> Result<(String, String)> {
    // Handle spotify:type:ID format
    if url.starts_with("spotify:") {
        let parts: Vec<&str> = url.split(':').collect();
        if parts.len() >= 3 {
            return Ok((
                parts[parts.len() - 2].to_string(),
                parts[parts.len() - 1].to_string(),
            ));
        }
    }

    // Handle open.spotify.com URLs
    let trimmed = url.trim();
    let normalized = trimmed
        .replace("https://", "")
        .replace("http://", "")
        .replace("open.spotify.com/", "")
        .replace("play.spotify.com/", "");

    let parts = normalized.split('?').next().unwrap_or(&normalized);
    let segments: Vec<&str> = parts
        .split('/')
        .filter(|part| !part.is_empty() && *part != "embed")
        .collect();

    let types = ["track", "album", "playlist", "artist"];
    for i in 0..segments.len().saturating_sub(1) {
        if types.contains(&segments[i]) {
            return Ok((segments[i].to_string(), segments[i + 1].to_string()));
        }
    }

    // Fallback for simple "track/ID" if it was passed partially
    if url.contains("track/") {
        let id = url
            .split("track/")
            .nth(1)
            .unwrap_or("")
            .split('?')
            .next()
            .unwrap_or("");
        if !id.is_empty() {
            return Ok(("track".to_string(), id.to_string()));
        }
    }

    Err(anyhow!("Unsupported Spotify URL or URI: {}", url))
}

/// Converts a Spotify ID (Base62) to a GID (32-character Hex)
pub fn spotify_id_to_gid(id: &str) -> Result<String> {
    let alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let value = BigUint::ptr_from(id, alphabet)?;

    let hex = format!("{:0>32x}", value);
    Ok(hex)
}

trait BigUintFromAlphabet {
    fn ptr_from(id: &str, alphabet: &str) -> Result<BigUint>;
}

impl BigUintFromAlphabet for BigUint {
    fn ptr_from(id: &str, alphabet: &str) -> Result<BigUint> {
        let mut value = BigUint::from(0u32);
        let base = BigUint::from(62u32);

        for c in id.chars() {
            let digit = alphabet
                .find(c)
                .ok_or_else(|| anyhow!("Invalid Base62 character: {}", c))?;
            value = (value * &base) + BigUint::from(digit as u32);
        }
        Ok(value)
    }
}
