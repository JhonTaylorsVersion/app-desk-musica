use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use lofty::prelude::*;
use lofty::file::AudioFile;
use lofty::tag::{Accessor, TagType};
use crate::utils::filename::FilenameBuilder;
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub track_number: u32,
    pub disc_number: u32,
    pub year: String,
    pub upc: Option<String>,
    pub isrc: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenamePreview {
    pub old_path: String,
    pub old_name: String,
    pub new_name: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameResult {
    pub path: String,
    pub success: bool,
    pub error: Option<String>,
}

pub struct FileManager;

impl FileManager {
    pub fn list_directory_recursive(path: &Path) -> anyhow::Result<Vec<FileNode>> {
        let mut nodes = Vec::new();
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                let is_dir = p.is_dir();
                let size = if is_dir { 0 } else { fs::metadata(&p).map(|m| m.len()).unwrap_or(0) };
                
                let children = if is_dir {
                    Some(Self::list_directory_recursive(&p)?)
                } else {
                    None
                };

                nodes.push(FileNode {
                    name,
                    path: p.to_string_lossy().to_string(),
                    is_dir,
                    size,
                    children,
                });
            }
        }
        
        // Sort: directories first, then files
        nodes.sort_by(|a, b| {
            if a.is_dir != b.is_dir {
                b.is_dir.cmp(&a.is_dir)
            } else {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            }
        });

        Ok(nodes)
    }

    pub fn read_audio_metadata(path: &Path) -> anyhow::Result<AudioMetadata> {
        let tagged_file = lofty::read_from_path(path)?;
        
        let tag = tagged_file.primary_tag()
            .or_else(|| tagged_file.first_tag())
            .ok_or_else(|| anyhow::anyhow!("No tags found in file"))?;

        Ok(AudioMetadata {
            title: tag.title().unwrap_or_default().to_string(),
            artist: tag.artist().unwrap_or_default().to_string(),
            album: tag.album().unwrap_or_default().to_string(),
            album_artist: tag.get(&ItemKey::AlbumArtist).and_then(|v| v.value().text()).unwrap_or_default().to_string(),
            track_number: tag.track().unwrap_or(0),
            disc_number: tag.disk().unwrap_or(0),
            year: tag.year().map(|y| y.to_string()).unwrap_or_default(),
            upc: None, // lofty doesn't easily expose UPC/ISRC via Accessor, might need custom keys
            isrc: tag.get(&ItemKey::Isrc).and_then(|v| v.value().text()).map(|s| s.to_string()),
        })
    }

    pub fn preview_rename(files: Vec<String>, format_template: &str) -> Vec<RenamePreview> {
        let mut previews = Vec::new();
        for file_path in files {
            let path = Path::new(&file_path);
            let old_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            
            match Self::read_audio_metadata(path) {
                Ok(meta) => {
                    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("flac");
                    let mut new_name = format_template.to_string();
                    new_name = new_name.replace("{title}", &FilenameBuilder::sanitize(&meta.title));
                    new_name = new_name.replace("{artist}", &FilenameBuilder::sanitize(&meta.artist));
                    new_name = new_name.replace("{album}", &FilenameBuilder::sanitize(&meta.album));
                    new_name = new_name.replace("{album_artist}", &FilenameBuilder::sanitize(&meta.album_artist));
                    new_name = new_name.replace("{track}", &format!("{:02}", meta.track_number));
                    new_name = new_name.replace("{disc}", &meta.disc_number.to_string());
                    new_name = new_name.replace("{year}", &meta.year);
                    new_name = new_name.replace("{date}", &meta.year); // simplified
                    new_name = new_name.replace("{isrc}", &meta.isrc.unwrap_or_default());
                    
                    new_name = format!("{}.{}", new_name.trim(), ext);

                    previews.push(RenamePreview {
                        old_path: file_path,
                        old_name,
                        new_name,
                        error: None,
                    });
                }
                Err(e) => {
                    previews.push(RenamePreview {
                        old_path: file_path,
                        old_name,
                        new_name: String::new(),
                        error: Some(e.to_string()),
                    });
                }
            }
        }
        previews
    }

    pub fn execute_rename(files: Vec<String>, format_template: &str) -> Vec<RenameResult> {
        let previews = Self::preview_rename(files, format_template);
        let mut results = Vec::new();

        for preview in previews {
            if let Some(err) = preview.error {
                results.push(RenameResult {
                    path: preview.old_path,
                    success: false,
                    error: Some(err),
                });
                continue;
            }

            let old_path = Path::new(&preview.old_path);
            let new_path = old_path.with_file_name(&preview.new_name);

            match fs::rename(old_path, &new_path) {
                Ok(_) => {
                    results.push(RenameResult {
                        path: new_path.to_string_lossy().to_string(),
                        success: true,
                        error: None,
                    });
                }
                Err(e) => {
                    results.push(RenameResult {
                        path: preview.old_path,
                        success: false,
                        error: Some(e.to_string()),
                    });
                }
            }
        }
        results
    }
}
