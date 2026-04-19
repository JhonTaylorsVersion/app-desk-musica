use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::path::Path;
use sled::Db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryItem {
    pub id: String,
    pub spotify_id: String,
    pub title: String,
    pub artists: String,
    pub album: String,
    pub duration_str: String,
    pub cover_url: String,
    pub quality: String,
    pub format: String,
    pub path: String,
    pub source: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchHistoryItem {
    pub id: String,
    pub url: String,
    pub item_type: String, // renamed to item_type, maps to 'type' in json
    pub name: String,
    pub info: String,
    pub image: String,
    pub data: String,
    pub timestamp: i64,
}

pub struct HistoryManager {
    db: Db,
}

impl HistoryManager {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let db = sled::open(path)?;
        Ok(Self { db })
    }

    // --- DOWNLOAD HISTORY ---

    pub fn add_download_item(&self, mut item: HistoryItem) -> Result<()> {
        let bucket = self.db.open_tree("download_history")?;
        
        let now = chrono::Utc::now().timestamp();
        item.timestamp = now;
        
        // Use ISRC/SpotifyID as key for deduplication if needed, but here we use a unique timestamp ID
        let id = format!("{}-{}", now, item.spotify_id);
        item.id = id.to_string();

        let val = serde_json::to_vec(&item)?;
        bucket.insert(id.as_bytes(), val)?;
        
        // Clean up if too many
        self.enforce_limit("download_history", 10000)?;
        
        Ok(())
    }

    pub fn get_download_history(&self) -> Result<Vec<HistoryItem>> {
        let bucket = self.db.open_tree("download_history")?;
        let mut items = Vec::new();

        for result in bucket.iter() {
            let (_, val) = result?;
            if let Ok(item) = serde_json::from_slice::<HistoryItem>(&val) {
                items.push(item);
            }
        }

        // Sort by timestamp desc
        items.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(items)
    }

    pub fn is_already_downloaded(&self, spotify_id: &str) -> Option<String> {
        let bucket = self.db.open_tree("download_history").ok();
        if let Some(tree) = bucket {
            for result in tree.iter() {
                if let Ok((_, val)) = result {
                    if let Ok(item) = serde_json::from_slice::<HistoryItem>(&val) {
                        if item.spotify_id == spotify_id {
                            return Some(item.path.clone());
                        }
                    }
                }
            }
        }
        None
    }

    pub fn delete_download_item(&self, id: &str) -> Result<()> {
        let bucket = self.db.open_tree("download_history")?;
        bucket.remove(id.as_bytes())?;
        Ok(())
    }

    pub fn clear_download_history(&self) -> Result<()> {
        self.db.drop_tree("download_history")?;
        Ok(())
    }

    // --- FETCH HISTORY ---

    pub fn add_fetch_item(&self, mut item: FetchHistoryItem) -> Result<()> {
        let bucket = self.db.open_tree("fetch_history")?;
        
        let now = chrono::Utc::now().timestamp();
        if item.timestamp == 0 {
            item.timestamp = now;
        }

        // Deduplicate: remove existing with same URL
        for result in bucket.iter() {
             let (k, v) = result?;
             if let Ok(existing) = serde_json::from_slice::<FetchHistoryItem>(&v) {
                 if existing.url == item.url {
                     bucket.remove(k)?;
                 }
             }
        }

        let id = format!("{}-fetch", chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0));
        item.id = id.clone();
        
        let val = serde_json::to_vec(&item)?;
        bucket.insert(id.as_bytes(), val)?;

        self.enforce_limit("fetch_history", 1000)?;

        Ok(())
    }

    pub fn get_fetch_history(&self) -> Result<Vec<FetchHistoryItem>> {
        let bucket = self.db.open_tree("fetch_history")?;
        let mut items = Vec::new();

        for result in bucket.iter() {
            let (_, val) = result?;
            if let Ok(item) = serde_json::from_slice::<FetchHistoryItem>(&val) {
                items.push(item);
            }
        }

        items.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(items)
    }

    pub fn delete_fetch_item(&self, id: &str) -> Result<()> {
        let bucket = self.db.open_tree("fetch_history")?;
        bucket.remove(id.as_bytes())?;
        Ok(())
    }

    pub fn clear_fetch_history_by_type(&self, item_type: &str) -> Result<()> {
        let bucket = self.db.open_tree("fetch_history")?;
        if item_type == "all" {
            self.db.drop_tree("fetch_history")?;
            return Ok(());
        }

        let mut to_remove = Vec::new();
        for result in bucket.iter() {
            let (k, v) = result?;
            if let Ok(item) = serde_json::from_slice::<FetchHistoryItem>(&v) {
                if item.item_type.eq_ignore_ascii_case(item_type) {
                    to_remove.push(k);
                }
            }
        }

        for k in to_remove {
            bucket.remove(k)?;
        }
        Ok(())
    }

    fn enforce_limit(&self, tree_name: &str, limit: usize) -> Result<()> {
        let bucket = self.db.open_tree(tree_name)?;
        if bucket.len() > limit {
            // Delete oldest 10%
            let to_remove = limit / 10;
            let mut keys = Vec::new();
            for result in bucket.iter().take(to_remove) {
                let (k, _) = result?;
                keys.push(k);
            }
            for k in keys {
                bucket.remove(k)?;
            }
        }
        Ok(())
    }

    pub fn clear_all(&self) -> Result<()> {
        self.db.drop_tree("download_history")?;
        self.db.drop_tree("fetch_history")?;
        Ok(())
    }
}
