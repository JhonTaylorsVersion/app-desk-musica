use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Completed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: String,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub spotify_id: String,
    pub status: DownloadStatus,
    pub progress_mb: f64,
    pub total_size_mb: f64,
    pub speed_mbps: f64,
    pub start_time: u64,
    pub end_time: u64,
    pub error_message: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressUpdate {
    pub item_id: String,
    pub status: DownloadStatus,
    pub progress_mb: f64,
    pub speed_mbps: f64,
}

/// Mirrors Go's ProgressInfo struct
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressInfo {
    pub is_downloading: bool,
    pub mb_downloaded: f64,
    pub speed_mbps: f64,
}

/// Mirrors Go's DownloadQueueInfo struct exactly
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadQueueInfo {
    pub is_downloading: bool,
    pub queue: Vec<DownloadItem>,
    pub current_speed: f64,
    pub total_downloaded: f64,
    pub session_start_time: u64,
    pub queued_count: usize,
    pub completed_count: usize,
    pub failed_count: usize,
    pub skipped_count: usize,
}

pub trait ProgressHandler: Send + Sync {
    fn on_progress(&self, update: ProgressUpdate);
    fn on_status_change(&self, item_id: &str, status: DownloadStatus);
    fn on_log(&self, message: String);
}

struct ProgressState {
    queue: Vec<DownloadItem>,
    is_downloading: bool,
    current_speed: f64,
    total_downloaded: f64,
    session_start_time: u64,
}

pub struct ProgressManager {
    state: Arc<RwLock<ProgressState>>,
    handler: Arc<RwLock<Option<Box<dyn ProgressHandler>>>>,
}

impl ProgressManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(ProgressState {
                queue: Vec::new(),
                is_downloading: false,
                current_speed: 0.0,
                total_downloaded: 0.0,
                session_start_time: 0,
            })),
            handler: Arc::new(RwLock::new(None)),
        }
    }

    pub fn set_handler(&self, handler: Box<dyn ProgressHandler>) {
        let mut h = self.handler.write().unwrap();
        *h = Some(handler);
    }

    pub fn log(&self, message: &str) {
        println!("{}", message);
        log::info!("{}", message);
        let h_lock = self.handler.read().unwrap();
        if let Some(h) = &*h_lock {
            h.on_log(message.to_string());
        }
    }

    pub fn add_to_queue(&self, id: String, track: String, artist: String, album: String, spotify_id: String) {
        let mut state = self.state.write().unwrap();
        if state.session_start_time == 0 {
            state.session_start_time = SystemTime::now()
                .duration_since(UNIX_EPOCH).unwrap().as_secs();
        }
        state.queue.push(DownloadItem {
            id: id.clone(),
            track_name: track,
            artist_name: artist,
            album_name: album,
            spotify_id,
            status: DownloadStatus::Queued,
            progress_mb: 0.0,
            total_size_mb: 0.0,
            speed_mbps: 0.0,
            start_time: 0,
            end_time: 0,
            error_message: None,
            file_path: None,
        });
        drop(state);

        let h_lock = self.handler.read().unwrap();
        if let Some(h) = &*h_lock {
            h.on_status_change(&id, DownloadStatus::Queued);
        }
    }

    pub fn start_item(&self, id: &str) {
        let mut state = self.state.write().unwrap();
        state.is_downloading = true;
        if let Some(item) = state.queue.iter_mut().find(|i| i.id == id) {
            item.status = DownloadStatus::Downloading;
            item.start_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        }
        drop(state);

        let h_lock = self.handler.read().unwrap();
        if let Some(h) = &*h_lock {
            h.on_status_change(id, DownloadStatus::Downloading);
        }
    }

    pub fn update_progress(&self, id: &str, progress: f64, speed: f64) {
        let mut state = self.state.write().unwrap();
        state.current_speed = speed;
        if let Some(item) = state.queue.iter_mut().find(|i| i.id == id) {
            item.progress_mb = progress;
            item.speed_mbps = speed;
        }
        drop(state);

        let h_lock = self.handler.read().unwrap();
        if let Some(h) = &*h_lock {
            h.on_progress(ProgressUpdate {
                item_id: id.to_string(),
                status: DownloadStatus::Downloading,
                progress_mb: progress,
                speed_mbps: speed,
            });
        }
    }

    pub fn complete_item(&self, id: &str, file_path: String, final_size: f64) {
        let mut state = self.state.write().unwrap();
        state.total_downloaded += final_size;
        if let Some(item) = state.queue.iter_mut().find(|i| i.id == id) {
            item.status = DownloadStatus::Completed;
            item.end_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
            item.file_path = Some(file_path);
            item.progress_mb = final_size;
            item.total_size_mb = final_size;
            item.speed_mbps = 0.0;
        }
        // Check if all done
        let all_done = state.queue.iter().all(|i| {
            matches!(i.status, DownloadStatus::Completed | DownloadStatus::Failed | DownloadStatus::Skipped)
        });
        if all_done {
            state.is_downloading = false;
            state.current_speed = 0.0;
        }
        drop(state);

        let h_lock = self.handler.read().unwrap();
        if let Some(h) = &*h_lock {
            h.on_status_change(id, DownloadStatus::Completed);
        }
    }

    pub fn fail_item(&self, id: &str, error: String) {
        let mut state = self.state.write().unwrap();
        if let Some(item) = state.queue.iter_mut().find(|i| i.id == id) {
            item.status = DownloadStatus::Failed;
            item.end_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
            item.error_message = Some(error);
            item.speed_mbps = 0.0;
        }
        let all_done = state.queue.iter().all(|i| {
            matches!(i.status, DownloadStatus::Completed | DownloadStatus::Failed | DownloadStatus::Skipped)
        });
        if all_done {
            state.is_downloading = false;
            state.current_speed = 0.0;
        }
        drop(state);

        let h_lock = self.handler.read().unwrap();
        if let Some(h) = &*h_lock {
            h.on_status_change(id, DownloadStatus::Failed);
        }
    }

    /// Mirrors Go's SkipDownloadItem
    pub fn skip_item(&self, id: &str, file_path: String) {
        let mut state = self.state.write().unwrap();
        if let Some(item) = state.queue.iter_mut().find(|i| i.id == id) {
            item.status = DownloadStatus::Skipped;
            item.end_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
            item.file_path = Some(file_path);
            item.speed_mbps = 0.0;
        }
        let all_done = state.queue.iter().all(|i| {
            matches!(i.status, DownloadStatus::Completed | DownloadStatus::Failed | DownloadStatus::Skipped)
        });
        if all_done {
            state.is_downloading = false;
            state.current_speed = 0.0;
        }
        drop(state);

        let h_lock = self.handler.read().unwrap();
        if let Some(h) = &*h_lock {
            h.on_status_change(id, DownloadStatus::Skipped);
        }
    }

    /// Mirrors Go's ClearDownloadQueue — removes completed/failed/skipped, keeps active/queued
    pub fn clear_completed(&self) {
        let mut state = self.state.write().unwrap();
        state.queue.retain(|item| {
            matches!(item.status, DownloadStatus::Queued | DownloadStatus::Downloading)
        });
    }

    /// Mirrors Go's ClearAllDownloads — wipes everything and resets session
    pub fn clear_all(&self) {
        let mut state = self.state.write().unwrap();
        state.queue.clear();
        state.total_downloaded = 0.0;
        state.session_start_time = 0;
        state.is_downloading = false;
        state.current_speed = 0.0;
    }

    /// Mirrors Go's CancelAllQueuedItems — marks all queued as skipped
    pub fn cancel_all_queued(&self) {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let mut state = self.state.write().unwrap();
        let mut cancelled = vec![];
        for item in state.queue.iter_mut() {
            if item.status == DownloadStatus::Queued {
                item.status = DownloadStatus::Skipped;
                item.end_time = now;
                item.error_message = Some("Cancelled".to_string());
                cancelled.push(item.id.clone());
            }
        }
        drop(state);

        let h_lock = self.handler.read().unwrap();
        if let Some(h) = &*h_lock {
            for id in &cancelled {
                h.on_status_change(id, DownloadStatus::Skipped);
            }
        }
    }

    /// Returns failed items for export
    pub fn get_failed_items(&self) -> Vec<DownloadItem> {
        let state = self.state.read().unwrap();
        state.queue.iter()
            .filter(|i| i.status == DownloadStatus::Failed)
            .cloned()
            .collect()
    }

    /// Mirrors Go's GetDownloadQueue — returns full DownloadQueueInfo
    pub fn get_queue_info(&self) -> DownloadQueueInfo {
        let state = self.state.read().unwrap();
        let mut queued = 0;
        let mut completed = 0;
        let mut failed = 0;
        let mut skipped = 0;
        for item in &state.queue {
            match item.status {
                DownloadStatus::Queued => queued += 1,
                DownloadStatus::Completed => completed += 1,
                DownloadStatus::Failed => failed += 1,
                DownloadStatus::Skipped => skipped += 1,
                _ => {}
            }
        }
        DownloadQueueInfo {
            is_downloading: state.is_downloading,
            queue: state.queue.clone(),
            current_speed: state.current_speed,
            total_downloaded: state.total_downloaded,
            session_start_time: state.session_start_time,
            queued_count: queued,
            completed_count: completed,
            failed_count: failed,
            skipped_count: skipped,
        }
    }

    /// Mirrors Go's GetDownloadProgress — returns current active download progress
    pub fn get_progress_info(&self) -> ProgressInfo {
        let state = self.state.read().unwrap();
        let current_progress = state
            .queue
            .iter()
            .find(|item| item.status == DownloadStatus::Downloading)
            .map(|item| item.progress_mb)
            .unwrap_or(0.0);

        ProgressInfo {
            is_downloading: state.is_downloading,
            mb_downloaded: current_progress,
            speed_mbps: state.current_speed,
        }
    }
}

pub struct ProgressReporter {
    manager: Arc<ProgressManager>,
    item_id: String,
    total_bytes: u64,
    last_reported_time: Instant,
    bytes_since_last_report: u64,
}

impl ProgressReporter {
    pub fn new(manager: Arc<ProgressManager>, item_id: String) -> Self {
        Self {
            manager,
            item_id,
            total_bytes: 0,
            last_reported_time: Instant::now(),
            bytes_since_last_report: 0,
        }
    }

    pub fn update(&mut self, chunk_size: u64) {
        self.total_bytes += chunk_size;
        self.bytes_since_last_report += chunk_size;

        if self.bytes_since_last_report >= 256 * 1024 {
            let now = Instant::now();
            let duration = now.duration_since(self.last_reported_time).as_secs_f64();
            
            let mb_downloaded = self.total_bytes as f64 / (1024.0 * 1024.0);
            let speed_mbps = if duration > 0.0 {
                (self.bytes_since_last_report as f64 / (1024.0 * 1024.0)) / duration
            } else {
                0.0
            };

            self.manager.update_progress(&self.item_id, mb_downloaded, speed_mbps);

            self.last_reported_time = now;
            self.bytes_since_last_report = 0;
        }
    }
}
