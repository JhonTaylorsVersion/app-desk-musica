use std::sync::Arc;

use tokio::sync::RwLock;

use crate::catalog::LibraryIndex;
use crate::config::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub library: Arc<RwLock<LibraryIndex>>,
}

impl AppState {
    pub fn new(config: AppConfig, library: LibraryIndex) -> Self {
        Self {
            config: Arc::new(config),
            library: Arc::new(RwLock::new(library)),
        }
    }
}
