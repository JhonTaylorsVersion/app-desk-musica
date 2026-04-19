use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::path::Path;
use sled::Db;
use std::time::SystemTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderPriorityEntry {
    pub service: String,
    pub provider: String,
    pub last_outcome: String,
    pub last_attempt: i64,
    pub last_success: i64,
    pub last_failure: i64,
    pub success_count: i64,
    pub failure_count: i64,
}

pub struct ProviderPriorityManager {
    db: Db,
}

impl ProviderPriorityManager {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let db = sled::open(path)?;
        Ok(Self { db })
    }

    pub fn prioritize_providers(&self, service: &str, providers: Vec<String>) -> Vec<String> {
        if providers.len() < 2 {
            return providers;
        }

        let bucket = match self.db.open_tree("ProviderPriority") {
            Ok(b) => b,
            Err(_) => return providers,
        };

        let service_key = service.to_lowercase().trim().to_string();
        let mut entries = std::collections::HashMap::new();

        for provider in &providers {
            let key = format!("{}|{}", service_key, provider);
            if let Ok(Some(val)) = bucket.get(key.as_bytes()) {
                if let Ok(entry) = serde_json::from_slice::<ProviderPriorityEntry>(&val) {
                    entries.insert(provider.clone(), entry);
                }
            }
        }

        let mut ordered = providers.clone();
        
        // Custom sort matching Go logic
        ordered.sort_by(|a, b| {
            let left = entries.get(a);
            let right = entries.get(b);

            let get_rank = |e: Option<&ProviderPriorityEntry>| {
                match e.map(|entry| entry.last_outcome.as_str()) {
                    Some("success") => 2,
                    None | Some("") => 1,
                    _ => 0,
                }
            };

            let left_rank = get_rank(left);
            let right_rank = get_rank(right);

            if left_rank != right_rank {
                return right_rank.cmp(&left_rank); // Higher rank first
            }

            let left_success = left.map(|e| e.last_success).unwrap_or(0);
            let right_success = right.map(|e| e.last_success).unwrap_or(0);
            if left_success != right_success {
                return right_success.cmp(&left_success);
            }

            let left_attempt = left.map(|e| e.last_attempt).unwrap_or(0);
            let right_attempt = right.map(|e| e.last_attempt).unwrap_or(0);
            right_attempt.cmp(&left_attempt)
        });

        ordered
    }

    pub fn record_outcome(&self, service: &str, provider: &str, success: bool) -> Result<()> {
        let bucket = self.db.open_tree("ProviderPriority")?;
        let service_key = service.to_lowercase().trim().to_string();
        let key = format!("{}|{}", service_key, provider);
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let mut entry = ProviderPriorityEntry {
            service: service_key.clone(),
            provider: provider.to_string(),
            last_outcome: String::new(),
            last_attempt: now,
            last_success: 0,
            last_failure: 0,
            success_count: 0,
            failure_count: 0,
        };

        if let Ok(Some(val)) = bucket.get(key.as_bytes()) {
            if let Ok(existing) = serde_json::from_slice::<ProviderPriorityEntry>(&val) {
                entry = existing;
            }
        }

        entry.last_attempt = now;
        if success {
            entry.last_outcome = "success".to_string();
            entry.last_success = now;
            entry.success_count += 1;
        } else {
            entry.last_outcome = "failure".to_string();
            entry.last_failure = now;
            entry.failure_count += 1;
        }

        let val = serde_json::to_vec(&entry)?;
        bucket.insert(key.as_bytes(), val)?;
        self.db.flush()?;

        Ok(())
    }
}
