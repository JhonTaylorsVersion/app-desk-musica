use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;
use sled::Db;
use std::time::SystemTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ISRCCacheEntry {
    pub track_id: String,
    pub isrc: String,
    pub updated_at: u64,
}

pub struct ISRCCache {
    db: Db,
}

impl ISRCCache {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let db = sled::open(path)?;
        Ok(Self { db })
    }

    pub fn get(&self, track_id: &str) -> Result<Option<String>> {
        let bucket = self.db.open_tree("SpotifyTrackISRC")?;
        let res = bucket.get(track_id.as_bytes())?;
        
        if let Some(val) = res {
            let entry: ISRCCacheEntry = serde_json::from_slice(&val)?;
            return Ok(Some(entry.isrc.to_uppercase()));
        }
        
        Ok(None)
    }

    pub fn put(&self, track_id: &str, isrc: &str) -> Result<()> {
        let bucket = self.db.open_tree("SpotifyTrackISRC")?;
        
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let entry = ISRCCacheEntry {
            track_id: track_id.to_string(),
            isrc: isrc.to_uppercase().trim().to_string(),
            updated_at: now,
        };

        let val = serde_json::to_vec(&entry)?;
        bucket.insert(track_id.as_bytes(), val)?;
        
        // Ensure data is written to disk
        self.db.flush()?;
        
        Ok(())
    }
}
