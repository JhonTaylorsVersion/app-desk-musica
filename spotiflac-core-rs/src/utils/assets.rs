use anyhow::{Result, anyhow};
use reqwest::Client;
use std::path::{Path, PathBuf};
use std::fs;
use std::io::Write;
use crate::utils::filename::FilenameBuilder;

pub struct AssetsDownloader {
    client: Client,
}

impl AssetsDownloader {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap(),
        }
    }

    /// Downloads artist-related assets (avatar, header, gallery) into a dedicated folder.
    pub async fn download_artist_assets(
        &self, 
        output_dir: &Path, 
        artist_name: &str, 
        avatar_url: Option<&str>, 
        header_url: Option<&str>, 
        gallery_urls: Option<&[String]>
    ) -> Result<()> {
        let safe_artist = FilenameBuilder::sanitize(artist_name);
        let artist_folder = output_dir.join(&safe_artist);
        
        if !artist_folder.exists() {
            fs::create_dir_all(&artist_folder)?;
        }

        // 1. Avatar
        if let Some(url) = avatar_url {
            let path = artist_folder.join(format!("{}_Avatar.jpg", safe_artist));
            if let Err(e) = self.download_file(url, &path).await {
                println!("⚠️ Warning: Failed to download avatar for {}: {}", artist_name, e);
            }
        }

        // 2. Header
        if let Some(url) = header_url {
            let path = artist_folder.join(format!("{}_Header.jpg", safe_artist));
            if let Err(e) = self.download_file(url, &path).await {
                println!("⚠️ Warning: Failed to download header for {}: {}", artist_name, e);
            }
        }

        // 3. Gallery
        if let Some(urls) = gallery_urls {
            for (i, url) in urls.iter().enumerate() {
                let path = artist_folder.join(format!("{}_Gallery_{}.jpg", safe_artist, i + 1));
                if let Err(e) = self.download_file(url, &path).await {
                    println!("⚠️ Warning: Failed to download gallery image {} for {}: {}", i + 1, artist_name, e);
                }
            }
        }

        Ok(())
    }

    async fn download_file(&self, url: &str, path: &Path) -> Result<()> {
        if path.exists() {
            return Ok(());
        }

        let resp = self.client.get(url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("HTTP error: {}", resp.status()));
        }

        let bytes = resp.bytes().await?;
        let mut file = fs::File::create(path)?;
        file.write_all(&bytes)?;

        Ok(())
    }
}
