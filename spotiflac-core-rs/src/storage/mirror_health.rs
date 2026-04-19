use serde::{Deserialize, Serialize};
use sled::Db;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorHealthEntry {
    pub service: String,
    pub mirror_url: String,
    pub last_outcome: String, // "success" or "failure"
    pub last_attempt: u64,
    pub last_success: u64,
    pub last_failure: u64,
    pub success_count: u64,
    pub failure_count: u64,
}

pub struct MirrorManager {
    db: Arc<Db>,
}

impl MirrorManager {
    pub fn new(db_path: Option<PathBuf>) -> Self {
        let path = db_path.unwrap_or_else(|| {
            let mut p = std::env::current_dir().unwrap();
            p.push("mirror_health.db");
            p
        });
        
        let db = sled::open(path).expect("Failed to open mirror health DB");
        Self { db: Arc::new(db) }
    }

    pub fn prioritize(&self, service: &str, mirrors: Vec<String>) -> Vec<String> {
        let mut entries = Vec::new();
        let service_key = service.to_lowercase();

        for mirror in mirrors {
            let key = format!("{}|{}", service_key, mirror);
            let entry = if let Ok(Some(data)) = self.db.get(&key) {
                serde_json::from_slice::<MirrorHealthEntry>(&data).ok()
            } else {
                None
            };
            entries.push((mirror, entry));
        }

        // Sort: Success (2) > Unknown (1) > Failure (0)
        entries.sort_by(|a, b| {
            let rank_a = self.outcome_rank(a.1.as_ref().map(|e| e.last_outcome.as_str()).unwrap_or(""));
            let rank_b = self.outcome_rank(b.1.as_ref().map(|e| e.last_outcome.as_str()).unwrap_or(""));

            if rank_a != rank_b {
                return rank_b.cmp(&rank_a); // Higher rank first
            }

            // Tie breaker: Last success time
            let success_a = a.1.as_ref().map(|e| e.last_success).unwrap_or(0);
            let success_b = b.1.as_ref().map(|e| e.last_success).unwrap_or(0);
            if success_a != success_b {
                return success_b.cmp(&success_a);
            }

            // Keep original order as final tie breaker
            std::cmp::Ordering::Equal
        });

        entries.into_iter().map(|(url, _)| url).collect()
    }

    pub fn record_outcome(&self, service: &str, mirror_url: &str, success: bool) {
        let service_key = service.to_lowercase();
        let key = format!("{}|{}", service_key, mirror_url);
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

        let mut entry = if let Ok(Some(data)) = self.db.get(&key) {
            serde_json::from_slice::<MirrorHealthEntry>(&data).unwrap_or_else(|_| self.new_entry(service, mirror_url))
        } else {
            self.new_entry(service, mirror_url)
        };

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

        if let Ok(data) = serde_json::to_vec(&entry) {
            let _ = self.db.insert(key, data);
            let _ = self.db.flush();
        }
    }

    fn new_entry(&self, service: &str, url: &str) -> MirrorHealthEntry {
        MirrorHealthEntry {
            service: service.to_string(),
            mirror_url: url.to_string(),
            last_outcome: "".to_string(),
            last_attempt: 0,
            last_success: 0,
            last_failure: 0,
            success_count: 0,
            failure_count: 0,
        }
    }

    fn outcome_rank(&self, outcome: &str) -> i32 {
        match outcome {
            "success" => 2,
            "" => 1,
            _ => 0,
        }
    }
}
