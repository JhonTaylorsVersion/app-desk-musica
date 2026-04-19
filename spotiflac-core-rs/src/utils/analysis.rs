use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use crate::utils::ffmpeg::{FFmpeg, FFprobe};
use base64::{Engine as _, engine::general_purpose};
use std::process::Command;
use std::path::Path;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub file_path: String,
    pub file_size: u64,
    pub sample_rate: u32,
    pub channels: u8,
    pub bits_per_sample: u8,
    pub duration: f64,
    pub bit_rate: i32,
    pub bit_depth: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisDecodeResponse {
    pub pcm_base64: String,
    pub sample_rate: u32,
    pub channels: u8,
    pub bits_per_sample: u8,
    pub duration: f64,
    pub bitrate_kbps: Option<i32>,
    pub bit_depth: Option<String>,
}

pub struct AudioAnalyzer;

impl AudioAnalyzer {
    /// Gets detailed technical metadata for an audio file using ffprobe.
    pub fn get_track_metadata(path: &str) -> Result<AnalysisResult> {
        let path_obj = Path::new(path);
        
        // Retry loop to ensure file visibility/accessibility (matching Go original)
        let mut accessible = false;
        for _ in 0..5 {
            if let Ok(file) = std::fs::File::open(path_obj) {
                drop(file);
                accessible = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }

        if !accessible || !path_obj.exists() {
            return Err(anyhow!("File does not exist or is inaccessible: {}", path));
        }

        let ffprobe_path = FFprobe::get_path()?;
        
        let mut cmd = Command::new(ffprobe_path);
        cmd.arg("-v").arg("error")
           .arg("-select_streams").arg("a:0")
           .arg("-show_entries").arg("stream=sample_rate,channels,bits_per_raw_sample,bits_per_sample,duration,bit_rate")
           .arg("-of").arg("default=noprint_wrappers=0")
           .arg(path);

        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let output = cmd.output()?;
        if !output.status.success() {
            return Err(anyhow!("ffprobe failed: {}", String::from_utf8_lossy(&output.stderr)));
        }

        let stdout = String::from_utf8(output.stdout)?;
        let mut info_map = std::collections::HashMap::new();
        for line in stdout.lines() {
            if let Some((key, value)) = line.split_once('=') {
                info_map.insert(key.trim(), value.trim());
            }
        }

        let file_size = std::fs::metadata(path)?.len();
        let sample_rate = info_map.get("sample_rate").and_then(|v| v.parse().ok()).unwrap_or(0);
        let channels = info_map.get("channels").and_then(|v| v.parse().ok()).unwrap_or(0);
        let duration = info_map.get("duration").and_then(|v| v.parse().ok()).unwrap_or(0.0);
        let bit_rate = info_map.get("bit_rate").and_then(|v| if *v == "N/A" { None } else { v.parse().ok() }).unwrap_or(0);

        let mut bits = info_map.get("bits_per_raw_sample").and_then(|v| if *v == "N/A" { None } else { v.parse().ok() }).unwrap_or(0);
        if bits == 0 {
            bits = info_map.get("bits_per_sample").and_then(|v| if *v == "N/A" { None } else { v.parse().ok() }).unwrap_or(0);
        }

        let bit_depth = if bits > 0 { format!("{}-bit", bits) } else { "Unknown".to_string() };

        Ok(AnalysisResult {
            file_path: path.to_string(),
            file_size,
            sample_rate,
            channels,
            bits_per_sample: bits as u8,
            duration,
            bit_rate,
            bit_depth,
        })
    }

    /// Decodes an audio file to a mono PCM stream and returns it as a Base64 string for waveform analysis.
    pub async fn decode_audio_for_analysis(path: &str) -> Result<AnalysisDecodeResponse> {
        let metadata = Self::get_track_metadata(path)?;
        let ffmpeg_path = FFmpeg::get_path()?;

        // Argument sets for different ffmpeg versions/configurations
        let arg_sets = vec![
            vec![
                "-v", "error",
                "-i", path,
                "-vn",
                "-map", "0:a:0",
                "-af", "pan=mono|c0=c0",
                "-f", "s16le",
                "-acodec", "pcm_s16le",
                "pipe:1"
            ],
            vec![
                "-v", "error",
                "-i", path,
                "-vn",
                "-map", "0:a:0",
                "-ac", "1",
                "-f", "s16le",
                "-acodec", "pcm_s16le",
                "pipe:1"
            ]
        ];

        let mut last_err = anyhow!("ffmpeg analysis decode failed");

        for args in arg_sets {
            let mut cmd = Command::new(&ffmpeg_path);
            for arg in args {
                cmd.arg(arg);
            }

            #[cfg(windows)]
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

            let output = cmd.output()?;
            if output.status.success() && !output.stdout.is_empty() {
                let pcm_base64 = general_purpose::STANDARD.encode(output.stdout);
                return Ok(AnalysisDecodeResponse {
                    pcm_base64,
                    sample_rate: metadata.sample_rate,
                    channels: metadata.channels,
                    bits_per_sample: metadata.bits_per_sample,
                    duration: metadata.duration,
                    bitrate_kbps: if metadata.bit_rate > 0 { Some(metadata.bit_rate / 1000) } else { None },
                    bit_depth: Some(metadata.bit_depth),
                });
            } else {
                last_err = anyhow!("ffmpeg failed: {}", String::from_utf8_lossy(&output.stderr));
            }
        }

        Err(last_err)
    }
}
