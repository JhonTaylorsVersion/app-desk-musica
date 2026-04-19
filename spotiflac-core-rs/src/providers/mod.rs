pub mod tidal;
pub mod qobuz;
pub mod amazon;

use async_trait::async_trait;
use anyhow::Result;
use crate::models::AudioQuality;

use crate::progress::ProgressManager;
use std::sync::Arc;

#[async_trait]
pub trait AudioProvider: Send + Sync {
    fn name(&self) -> &str;
    async fn get_download_url(&self, query_id: &str, quality: AudioQuality, progress: Arc<ProgressManager>) -> Result<String>;
    async fn download_track(&self, url: &str, path: &str, progress: Arc<ProgressManager>, item_id: &str) -> Result<()>;
}
