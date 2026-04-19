use anyhow::{Result, anyhow};
use crate::models::{AudioQuality, AppConfig};
use crate::metadata::tagger::Tagger;
use crate::utils::ffmpeg::FFmpeg;
use std::path::Path;
use tokio::sync::Mutex;
use std::sync::Arc;
use tokio::task;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConvertRequest {
    pub input_files: Vec<String>,
    pub output_format: String, // "mp3", "m4a", "flac"
    pub bitrate: String,
    pub codec: String, // "aac", "alac", "libmp3lame"
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConvertResult {
    pub input_file: String,
    pub output_file: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResampleRequest {
    pub input_files: Vec<String>,
    pub sample_rate: Option<String>,
    pub bit_depth: Option<String>,
}

pub struct AudioProcessor;

impl AudioProcessor {
    pub async fn convert_batch(req: ConvertRequest) -> Vec<ConvertResult> {
        let results = Arc::new(Mutex::new(Vec::new()));
        let mut handlers = Vec::new();

        for input_file in &req.input_files {
            let input_file = input_file.clone();
            let req_clone = req.clone();
            let results_clone = Arc::clone(&results);

            let handle = task::spawn(async move {
                let input_path = Path::new(&input_file);
                let base_name = input_path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");
                let parent = input_path.parent().unwrap_or_else(|| Path::new("."));
                
                let output_dir = parent.join(req_clone.output_format.to_uppercase());
                if !output_dir.exists() {
                    let _ = std::fs::create_dir_all(&output_dir);
                }

                let output_file = output_dir.join(format!("{}.{}", base_name, req_clone.output_format.to_lowercase()));
                let output_path_str = output_file.to_string_lossy().to_string();

                let mut result = ConvertResult {
                    input_file: input_file.clone(),
                    output_file: output_path_str.clone(),
                    success: false,
                    error: None,
                };

                // 1. Extract Metadata and Cover
                let metadata = Tagger::extract_metadata(input_path).ok();
                let cover = Tagger::extract_cover(input_path).ok().flatten();

                // 2. Perform Conversion
                let ffmpeg_res = Self::run_ffmpeg_convert(&input_file, &output_path_str, &req_clone).await;

                match ffmpeg_res {
                    Ok(_) => {
                        // 3. Re-embed Metadata
                        if let Some(m) = metadata {
                            let lyrics = m.lyrics_text.clone();
                            // For manual conversion, we use a default config for tagging if not provided
                            // In a real scenario, we might want to pass the user's preferred separator here
                            let default_config = AppConfig {
                                output_dir: String::new(),
                                download_quality: AudioQuality::Lossless,
                                filename_format: String::new(),
                                embed_metadata: true,
                                embed_cover: true,
                                embed_genre: true,
                                use_single_genre: true,
                                redownload_with_suffix: false,
                                download_artist_images: false,
                                embed_lyrics: true,
                                save_lrc_file: false,
                                downloader: "auto".to_string(),
                                auto_order: vec!["tidal".to_string()],
                                allow_resolver_fallback: true,
                                folder_structure: "flat".to_string(),
                                separator: "; ".to_string(),
                                use_first_artist_only: false,
                                use_album_track_number: true,
                                position_override: None,
                            };

                            if let Err(e) = Tagger::embed_metadata(&output_file, &m, lyrics.as_deref(), &default_config) {
                                println!("⚠️ Warning: Failed to re-embed metadata to {}: {}", output_path_str, e);
                            }
                        }
                        
                        if let Some(c) = cover {
                            if let Err(e) = Tagger::embed_cover(&output_file, c) {
                                println!("⚠️ Warning: Failed to re-embed cover to {}: {}", output_path_str, e);
                            }
                        }

                        result.success = true;
                    }
                    Err(e) => {
                        result.error = Some(e.to_string());
                    }
                }

                results_clone.lock().await.push(result);
            });
            handlers.push(handle);
        }

        for h in handlers {
            let _ = h.await;
        }

        let mut res = results.lock().await.clone();
        // Maintain original order
        res.sort_by(|a, b| {
            let idx_a = req.input_files.iter().position(|r| r == &a.input_file).unwrap_or(0);
            let idx_b = req.input_files.iter().position(|r| r == &b.input_file).unwrap_or(0);
            idx_a.cmp(&idx_b)
        });
        res
    }

    async fn run_ffmpeg_convert(input: &str, output: &str, req: &ConvertRequest) -> Result<()> {
        let ffmpeg_path = FFmpeg::get_path()?;
        let mut cmd = tokio::process::Command::new(ffmpeg_path);
        
        cmd.arg("-i").arg(input)
           .arg("-y");

        match req.output_format.to_lowercase().as_str() {
            "mp3" => {
                cmd.arg("-codec:a").arg("libmp3lame")
                   .arg("-b:a").arg(&req.bitrate)
                   .arg("-map").arg("0:a")
                   .arg("-id3v2_version").arg("3");
            }
            "m4a" => {
                let codec = if req.codec == "alac" { "alac" } else { "aac" };
                cmd.arg("-codec:a").arg(codec);
                if codec == "aac" {
                    cmd.arg("-b:a").arg(&req.bitrate);
                }
                cmd.arg("-map").arg("0:a");
            }
            "flac" => {
                cmd.arg("-codec:a").arg("flac")
                   .arg("-compression_level").arg("8");
            }
            _ => return Err(anyhow!("Unsupported output format")),
        }

        cmd.arg(output);

        #[cfg(windows)]
        {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let status = cmd.status().await?;
        if status.success() {
            Ok(())
        } else {
            Err(anyhow!("FFmpeg failed with status {}", status))
        }
    }

    pub async fn resample_batch(req: ResampleRequest) -> Vec<ConvertResult> {
        let results = Arc::new(Mutex::new(Vec::new()));
        let mut handlers = Vec::new();
        
        let folder_label = Self::build_folder_label(req.sample_rate.as_deref(), req.bit_depth.as_deref());

        for input_file in &req.input_files {
            let input_file = input_file.clone();
            let req_clone = req.clone();
            let results_clone = Arc::clone(&results);
            let folder_label_clone = folder_label.clone();

            let handle = task::spawn(async move {
                let input_path = Path::new(&input_file);
                let base_name = input_path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");
                let parent = input_path.parent().unwrap_or_else(|| Path::new("."));
                
                let output_dir = parent.join(&folder_label_clone);
                if !output_dir.exists() {
                    let _ = std::fs::create_dir_all(&output_dir);
                }

                let output_file = output_dir.join(format!("{}.flac", base_name));
                let output_path_str = output_file.to_string_lossy().to_string();

                let mut result = ConvertResult {
                    input_file: input_file.clone(),
                    output_file: output_path_str.clone(),
                    success: false,
                    error: None,
                };

                let ffmpeg_res = Self::run_ffmpeg_resample(&input_file, &output_path_str, &req_clone).await;

                match ffmpeg_res {
                    Ok(_) => { result.success = true; }
                    Err(e) => { result.error = Some(e.to_string()); }
                }

                results_clone.lock().await.push(result);
            });
            handlers.push(handle);
        }

        for h in handlers {
            let _ = h.await;
        }

        let res = results.lock().await.clone();
        res
    }

    async fn run_ffmpeg_resample(input: &str, output: &str, req: &ResampleRequest) -> Result<()> {
        let ffmpeg_path = FFmpeg::get_path()?;
        let mut cmd = tokio::process::Command::new(ffmpeg_path);
        
        cmd.arg("-i").arg(input)
           .arg("-y");

        if let Some(bit_depth) = &req.bit_depth {
            match bit_depth.as_str() {
                "16" => { cmd.arg("-c:a").arg("flac").arg("-sample_fmt").arg("s16"); }
                "24" => { cmd.arg("-c:a").arg("flac").arg("-sample_fmt").arg("s32").arg("-bits_per_raw_sample").arg("24"); }
                _ => { cmd.arg("-c:a").arg("flac"); }
            }
        } else {
            cmd.arg("-c:a").arg("flac");
        }

        if let Some(ar) = &req.sample_rate {
            cmd.arg("-ar").arg(ar);
        }

        cmd.arg("-map_metadata").arg("0");
        cmd.arg(output);

        #[cfg(windows)]
        {
            cmd.creation_flags(0x08000000);
        }

        let status = cmd.status().await?;
        if status.success() {
            Ok(())
        } else {
            Err(anyhow!("FFmpeg resampling failed"))
        }
    }

    fn build_folder_label(sample_rate: Option<&str>, bit_depth: Option<&str>) -> String {
        let mut parts = Vec::new();
        if let Some(bd) = bit_depth {
            parts.push(format!("{}bit", bd));
        }
        if let Some(sr) = sample_rate {
            let label = match sr {
                "44100" => "44.1kHz",
                "48000" => "48kHz",
                "96000" => "96kHz",
                "192000" => "192kHz",
                _ => sr,
            };
            parts.push(label.to_string());
        }

        if parts.is_empty() {
            "Resampled".to_string()
        } else {
            parts.join(" ")
        }
    }
}
