use anyhow::{Result, anyhow};
use num_bigint::BigUint;

pub fn parse_spotify_url(url: &str) -> Result<(String, String)> {
    if url.contains("track/") {
        let id = url.split("track/").nth(1)
            .ok_or_else(|| anyhow!("Invalid track URL"))?
            .split('?')
            .next().unwrap();
        return Ok(("track".to_string(), id.to_string()));
    }
    
    // Support for spotify:track:ID format
    if url.starts_with("spotify:track:") {
        let id = url.split(':').last()
            .ok_or_else(|| anyhow!("Invalid track URI"))?;
        return Ok(("track".to_string(), id.to_string()));
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
            let digit = alphabet.find(c)
                .ok_or_else(|| anyhow!("Invalid Base62 character: {}", c))?;
            value = (value * &base) + BigUint::from(digit as u32);
        }
        Ok(value)
    }
}
