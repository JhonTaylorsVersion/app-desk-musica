use anyhow::{Result, anyhow};
use serde::Deserialize;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::sync::Mutex;
use lazy_static::lazy_static;
use reqwest::{Client, StatusCode};

lazy_static! {
    static ref MB_LAST_REQUEST: Mutex<Instant> = Mutex::new(Instant::now() - Duration::from_secs(2));
    static ref MB_STATUS: Mutex<MBStatus> = Mutex::new(MBStatus {
        last_checked: 0,
        online: true,
    });
    static ref MB_CACHE: Mutex<std::collections::HashMap<String, String>> = Mutex::new(std::collections::HashMap::new());
    static ref MB_IN_FLIGHT: Mutex<std::collections::HashMap<String, tokio::sync::broadcast::Sender<Result<String, String>>>> = Mutex::new(std::collections::HashMap::new());
}

struct MBStatus {
    last_checked: u64,
    online: bool,
}

pub struct MusicBrainzClient {
    client: Client,
}

#[derive(Deserialize, Debug)]
pub struct MBRecordingResponse {
    pub recordings: Vec<MBRecording>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct MBRecording {
    pub id: String,
    pub title: String,
    pub tags: Option<Vec<MBTag>>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct MBTag {
    pub count: i32,
    pub name: String,
}

impl MusicBrainzClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap(),
        }
    }

    fn should_skip(&self) -> bool {
        let status = MB_STATUS.lock().unwrap();
        if status.online {
            return false;
        }

        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        // Skip for 5 minutes if offline
        now - status.last_checked < 300
    }

    fn update_status(&self, online: bool) {
        let mut status = MB_STATUS.lock().unwrap();
        status.online = online;
        status.last_checked = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    }

    async fn wait_for_slot(&self) {
        let sleep_duration = {
            let last_req = MB_LAST_REQUEST.lock().unwrap();
            let elapsed = last_req.elapsed();
            let min_interval = Duration::from_millis(1100);
            if elapsed < min_interval {
                Some(min_interval - elapsed)
            } else {
                None
            }
        };

        if let Some(d) = sleep_duration {
            tokio::time::sleep(d).await;
        }
        
        let mut last_req = MB_LAST_REQUEST.lock().unwrap();
        *last_req = Instant::now();
    }

    fn to_title_case(&self, s: &str) -> String {
        s.split_whitespace()
            .map(|word| {
                let mut chars = word.chars();
                match chars.next() {
                    None => String::new(),
                    Some(first) => first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
                }
            })
            .collect::<Vec<String>>()
            .join(" ")
    }

    pub async fn fetch_genre(&self, isrc: &str, use_single: bool) -> Result<String> {
        let cache_key = format!("{}|{}", isrc, use_single);
        
        // 1. Check Cache
        {
            let cache = MB_CACHE.lock().unwrap();
            if let Some(genre) = cache.get(&cache_key) {
                return Ok(genre.clone());
            }
        }

        // 2. Check In-Flight
        let action = {
            let mut in_flight = MB_IN_FLIGHT.lock().unwrap();
            if let Some(tx) = in_flight.get(&cache_key) {
                Some(tx.subscribe())
            } else {
                let (tx, _rx) = tokio::sync::broadcast::channel(1);
                in_flight.insert(cache_key.clone(), tx);
                None // None means we need to execute the fetch
            }
        };

        if let Some(mut rx) = action {
            // We are a follower. Wait for the primary.
            match rx.recv().await {
                Ok(Ok(genre)) => Ok(genre),
                Ok(Err(e)) => Err(anyhow!(e)),
                Err(_) => Err(anyhow!("In-flight request failed")),
            }
        } else {
            // We are the primary.
            self.execute_fetch_and_notify(isrc, use_single, cache_key).await
        }
    }

    async fn execute_fetch_and_notify(&self, isrc: &str, use_single: bool, cache_key: String) -> Result<String> {
        let result = self.perform_fetch(isrc, use_single).await;
        
        let mut in_flight = MB_IN_FLIGHT.lock().unwrap();
        if let Some(tx) = in_flight.remove(&cache_key) {
            let send_res = match &result {
                Ok(g) => {
                    let mut cache = MB_CACHE.lock().unwrap();
                    cache.insert(cache_key, g.clone());
                    Ok(g.clone())
                }
                Err(e) => Err(e.to_string()),
            };
            let _ = tx.send(send_res);
        }
        result
    }

    async fn perform_fetch(&self, isrc: &str, use_single: bool) -> Result<String> {
        if self.should_skip() {
            return Err(anyhow!("Skipping MusicBrainz lookup (API reported offline)"));
        }

        let mut last_error = anyhow!("Failed to fetch from MusicBrainz");

        for attempt in 0..3 {
            if attempt > 0 {
                tokio::time::sleep(Duration::from_secs(3)).await;
            }

            self.wait_for_slot().await;

            let url = format!("https://musicbrainz.org/ws/2/recording?query=isrc:{}&fmt=json&inc=tags", isrc);
            
            let response = match self.client.get(&url)
                .header("User-Agent", "SpotiFLAC/1.0 ( https://github.com/spotbye/SpotiFLAC )")
                .header("Accept", "application/json")
                .send()
                .await {
                    Ok(r) => r,
                    Err(e) => {
                        last_error = e.into();
                        continue;
                    }
                };

            if response.status() == StatusCode::SERVICE_UNAVAILABLE || response.status().is_server_error() {
                self.update_status(false);
                last_error = anyhow!("MusicBrainz returned status {}", response.status());
                continue;
            }

            if !response.status().is_success() {
                last_error = anyhow!("MusicBrainz returned status {}", response.status());
                continue;
            }

            self.update_status(true);

            let body: MBRecordingResponse = response.json().await?;
            
            if let Some(recording) = body.recordings.first() {
                if let Some(tags) = &recording.tags {
                    let mut sorted_tags = tags.clone();
                    sorted_tags.sort_by(|a, b| b.count.cmp(&a.count));
                    
                    if use_single {
                        if let Some(best_tag) = sorted_tags.first() {
                            return Ok(self.to_title_case(&best_tag.name));
                        }
                    } else {
                        let top_tags: Vec<String> = sorted_tags.iter()
                            .take(5)
                            .map(|t| self.to_title_case(&t.name))
                            .collect();
                        
                        if !top_tags.is_empty() {
                            return Ok(top_tags.join("; "));
                        }
                    }
                }
            }
            
            return Err(anyhow!("No genre found in MusicBrainz for ISRC {}", isrc));
        }

        Err(last_error)
    }
}
