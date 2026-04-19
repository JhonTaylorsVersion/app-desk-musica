use std::path::{Path, PathBuf};
use crate::utils::filename::FilenameBuilder;

pub struct AudioScanner;

impl AudioScanner {
    /// Scans a directory for an audio file that matches a track and artist.
    /// This mimics Go's findAudioFileForLyrics logic.
    pub fn find_audio_file(dir: &Path, track_name: &str, artist_name: &str) -> Option<PathBuf> {
        if !dir.is_dir() {
            return None;
        }

        let safe_title = FilenameBuilder::sanitize(track_name);
        let safe_artist = FilenameBuilder::sanitize(artist_name);

        let audio_exts = ["flac", "mp3", "m4a", "aac", "wav"];
        
        let patterns = vec![
            format!("{} - {}", safe_title, safe_artist),
            format!("{} - {}", safe_artist, safe_title),
            safe_title.clone(),
        ];

        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    continue;
                }

                if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                    
                    if !audio_exts.contains(&ext.as_str()) {
                        continue;
                    }

                    let base_name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                    
                    for pattern in &patterns {
                        // Strict check: the file must match the pattern exactly 
                        // to be considered "already downloaded".
                        if base_name == *pattern {
                            return Some(path);
                        }
                    }
                }
            }
        }

        None
    }

    /// List all audio files recursively in a directory.
    pub fn list_audio_files(dir: &Path) -> Vec<PathBuf> {
        let mut results = Vec::new();
        let audio_exts = ["flac", "mp3", "m4a", "aac", "wav"];

        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    results.extend(Self::list_audio_files(&path));
                } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if audio_exts.contains(&ext.to_lowercase().as_str()) {
                        results.push(path);
                    }
                }
            }
        }
        results
    }
}
