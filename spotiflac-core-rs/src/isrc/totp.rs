use anyhow::Result;
use totp_rs::{Algorithm, Secret, TOTP};
use std::time::SystemTime;

const SPOTIFY_TOTP_SECRET: &str = "GM3TMMJTGYZTQNZVGM4DINJZHA4TGOBYGMZTCMRTGEYDSMJRHE4TEOBUG4YTCMRUGQ4DQOJUGQYTAMRRGA2TCMJSHE3TCMBY";
const SPOTIFY_TOTP_VERSION: i32 = 61;

pub fn generate_spotify_totp() -> Result<(String, i32)> {
    let secret_bytes = Secret::Encoded(SPOTIFY_TOTP_SECRET.to_string()).to_bytes()?;
    
    let totp = TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret_bytes,
    )?;

    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)?
        .as_secs();
        
    let code = totp.generate(now);
    
    Ok((code, SPOTIFY_TOTP_VERSION))
}
