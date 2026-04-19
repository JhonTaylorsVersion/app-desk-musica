use anyhow::{Result, anyhow};
use std::path::Path;
use serde::{Serialize, Deserialize};
use tokio::sync::mpsc;
use crate::utils::ffmpeg::{FFmpeg, FFprobe};

#[derive(Debug, Serialize, Deserialize)]
pub struct FlacInfo {
    pub path: String,
    pub sample_rate: u32,
    pub bit_depth: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResampleRequest {
    pub input_files: Vec<String>,
    pub sample_rate: String,
    pub bit_depth: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResampleResult {
    pub input_file: String,
    pub output_file: String,
    pub success: bool,
    pub error: Option<String>,
}

pub struct Resampler;

impl Resampler {
    /// Gets technical info (sample rate, bit depth) for a batch of FLAC files in parallel.
    pub async fn get_flac_info_batch(paths: Vec<String>) -> Vec<FlacInfo> {
        let count = paths.len();
        let (tx, mut rx) = mpsc::channel(count);

        for path in paths {
            let tx = tx.clone();
            tokio::spawn(async move {
                let info = match FFprobe::get_stream_info(&path) {
                    Ok(i) => FlacInfo {
                        path: path.clone(),
                        sample_rate: i.sample_rate,
                        bit_depth: i.bit_depth,
                    },
                    Err(_) => FlacInfo {
                        path: path.clone(),
                        sample_rate: 0,
                        bit_depth: 0,
                    },
                };
                let _ = tx.send(info).await;
            });
        }

        drop(tx);
        let mut results = Vec::with_capacity(count);
        while let Some(res) = rx.recv().await {
            results.push(res);
        }

        results
    }

    /// Resamples a batch of audio files to a target sample rate and bit depth.
    pub async fn resample_audio(req: ResampleRequest) -> Result<Vec<ResampleResult>> {
        if req.sample_rate.is_empty() && req.bit_depth.is_empty() {
            return Err(anyhow!("At least one of sample rate or bit depth must be specified"));
        }

        let folder_label = Self::build_folder_label(&req.sample_rate, &req.bit_depth);
        let ffmpeg_path = FFmpeg::get_path()?;
        
        let count = req.input_files.len();
        let (tx, mut rx) = mpsc::channel(count);

        for input_file in req.input_files {
            let tx = tx.clone();
            let sample_rate = req.sample_rate.clone();
            let bit_depth = req.bit_depth.clone();
            let folder_label = folder_label.clone();
            let ffmpeg_path = ffmpeg_path.clone();

            tokio::spawn(async move {
                let mut result = ResampleResult {
                    input_file: input_file.clone(),
                    output_file: String::new(),
                    success: false,
                    error: None,
                };

                let input_path = Path::new(&input_file);
                let base_name = input_path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");
                let input_dir = input_path.parent().unwrap_or(Path::new("."));
                
                let output_dir = input_dir.join(&folder_label);
                if let Err(e) = std::fs::create_dir_all(&output_dir) {
                    result.error = Some(format!("Failed to create output directory: {}", e));
                    let _ = tx.send(result).await;
                    return;
                }

                let output_file = output_dir.join(format!("{}.flac", base_name));
                let output_file_str = output_file.to_string_lossy().to_string();
                result.output_file = output_file_str.clone();

                let mut cmd = std::process::Command::new(ffmpeg_path);
                cmd.arg("-i").arg(&input_file).arg("-y");

                // Apply Bit Depth specific flags for FLAC
                if !bit_depth.is_empty() {
                    match bit_depth.as_str() {
                        "16" => {
                            cmd.arg("-c:a").arg("flac").arg("-sample_fmt").arg("s16");
                        },
                        "24" => {
                            // 24-bit FLAC in FFmpeg usually requires s32 format and specific bit depth flag
                            cmd.arg("-c:a").arg("flac").arg("-sample_fmt").arg("s32").arg("-bits_per_raw_sample").arg("24");
                        },
                        _ => {
                            cmd.arg("-c:a").arg("flac");
                        }
                    }
                } else {
                    cmd.arg("-c:a").arg("flac");
                }

                // Apply Sample Rate
                if !sample_rate.is_empty() {
                    cmd.arg("-ar").arg(&sample_rate);
                }

                // Preserve metadata
                cmd.arg("-map_metadata").arg("0");
                cmd.arg(&output_file_str);

                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }

                match cmd.output() {
                    Ok(output) if output.status.success() => {
                        result.success = true;
                    },
                    Ok(output) => {
                        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
                        result.error = Some(if err_msg.is_empty() { "Unknown FFmpeg error".to_string() } else { err_msg });
                    },
                    Err(e) => {
                        result.error = Some(e.to_string());
                    }
                }

                let _ = tx.send(result).await;
            });
        }

        drop(tx);
        let mut results = Vec::with_capacity(count);
        while let Some(res) = rx.recv().await {
            results.push(res);
        }

        Ok(results)
    }

    /// Builds a descriptive folder name based on the target quality.
    fn build_folder_label(sample_rate: &str, bit_depth: &str) -> String {
        let mut parts = Vec::new();
        if !bit_depth.is_empty() {
            parts.push(format!("{}bit", bit_depth));
        }

        match sample_rate {
            "44100" => parts.push("44.1kHz".to_string()),
            "48000" => parts.push("48kHz".to_string()),
            "96000" => parts.push("96kHz".to_string()),
            "192000" => parts.push("192kHz".to_string()),
            "" => {},
            _ => parts.push(format!("{}Hz", sample_rate)),
        }

        if parts.is_empty() {
            return "Resampled".to_string();
        }
        parts.join(" ")
    }
}
