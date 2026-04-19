use anyhow::{Result, anyhow};
use std::process::Command;
use std::path::PathBuf;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub struct FFmpeg;

impl FFmpeg {
    /// Attempts to find the ffmpeg executable in the current directory or system PATH.
    pub fn get_path() -> Result<PathBuf> {
        let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
        
        // 1. Check current directory
        let local = std::env::current_dir()?.join(name);
        if local.exists() {
            return Ok(local);
        }

        // 2. Check ~/.spotiflac directory (Parity with Go)
        if let Some(home) = dirs::home_dir() {
            let app_dir = home.join(".spotiflac").join(name);
            if app_dir.exists() {
                return Ok(app_dir);
            }
        }

        // 3. Check system PATH using 'where' on Windows or 'which' on Unix
        let check_cmd = if cfg!(windows) { "where" } else { "which" };
        let output = Command::new(check_cmd).arg(name).output()?;

        if output.status.success() {
            let path_str = String::from_utf8(output.stdout)?.trim().to_string();
            // 'where' might return multiple lines, take the first
            let first_path = path_str.lines().next().unwrap_or(&path_str);
            return Ok(PathBuf::from(first_path));
        }

        Err(anyhow!("ffmpeg not found in current directory, PATH or ~/.spotiflac"))
    }

    /// Converts an input file to the specified quality using the found ffmpeg binary.
    pub async fn convert(input: &str, output: &str, quality: crate::models::AudioQuality) -> Result<()> {
        let ffmpeg_path = Self::get_path()?;
        
        let mut cmd = std::process::Command::new(ffmpeg_path);
        cmd.arg("-y")
           .arg("-i").arg(input)
           .arg("-vn"); // No video

        match quality {
            crate::models::AudioQuality::Low => {
                cmd.arg("-c:a").arg("libmp3lame")
                   .arg("-b:a").arg("320k")
                   .arg("-map").arg("0:a");
            },
            crate::models::AudioQuality::Lossless | crate::models::AudioQuality::HiRes => {
                cmd.arg("-c:a").arg("flac")
                   .arg("-compression_level").arg("8");
            }
        }

        cmd.arg(output);

        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let status = cmd.status()?;

        if status.success() {
            Ok(())
        } else {
            Err(anyhow!("FFmpeg conversion failed with status: {}", status))
        }
    }

    /// Converts/Decrypts an input file to FLAC using a decryption key.
    pub async fn convert_with_key(input: &str, output: &str, key: &str) -> Result<()> {
        let ffmpeg_path = Self::get_path()?;
        
        let mut cmd = Command::new(ffmpeg_path);
        cmd.arg("-decryption_key").arg(key)
           .arg("-i").arg(input)
           .arg("-c:a").arg("flac")
           .arg("-y")
           .arg(output);

        #[cfg(windows)]
        cmd.creation_flags(0x08000000);

        let status = cmd.status()?;
        if status.success() {
            Ok(())
        } else {
            Err(anyhow!("Decryption failed for: {}", input))
        }
    }

    /// Embeds lyrics into an M4A file using ffmpeg (mirrors Go implementation).
    pub fn embed_lyrics_to_m4a(path: &str, lyrics: &str) -> Result<()> {
        let ffmpeg_path = Self::get_path()?;
        let tmp_path = format!("{}.tmp.m4a", path);

        let mut cmd = Command::new(ffmpeg_path);
        cmd.arg("-i").arg(path)
           .arg("-map").arg("0")
           .arg("-map_metadata").arg("0")
           .arg("-metadata").arg(format!("lyrics-eng={}", lyrics))
           .arg("-metadata").arg(format!("lyrics={}", lyrics))
           .arg("-codec").arg("copy")
           .arg("-f").arg("ipod")
           .arg("-y")
           .arg(&tmp_path);

        #[cfg(windows)]
        cmd.creation_flags(0x08000000);

        let status = cmd.status()?;
        if status.success() {
            let _ = std::fs::rename(tmp_path, path);
            Ok(())
        } else {
            let _ = std::fs::remove_file(tmp_path);
            Err(anyhow!("FFmpeg failed to embed lyrics to M4A"))
        }
    }
}

pub struct FFprobe;

impl FFprobe {
    pub fn get_path() -> Result<PathBuf> {
        let name = if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" };
        
        let local = std::env::current_dir()?.join(name);
        if local.exists() {
            return Ok(local);
        }

        let check_cmd = if cfg!(windows) { "where" } else { "which" };
        let output = std::process::Command::new(check_cmd).arg(name).output()?;

        if output.status.success() {
            let path_str = String::from_utf8(output.stdout)?.trim().to_string();
            let first_path = path_str.lines().next().unwrap_or(&path_str);
            return Ok(PathBuf::from(first_path));
        }

        Err(anyhow!("ffprobe not found in current directory or PATH"))
    }

    pub fn get_duration(path: &str) -> Result<f64> {
        let ffprobe_path = Self::get_path()?;
        let output = std::process::Command::new(ffprobe_path)
            .arg("-v").arg("error")
            .arg("-show_entries").arg("format=duration")
            .arg("-of").arg("default=noprint_wrappers=1:nokey=1")
            .arg(path)
            .output()?;

        if output.status.success() {
            let duration_str = String::from_utf8(output.stdout)?.trim().to_string();
            let duration: f64 = duration_str.parse()?;
            Ok(duration)
        } else {
            Err(anyhow!("FFprobe failed to get duration for: {}", path))
        }
    }

    pub fn get_stream_info(path: &str) -> Result<AudioStreamInfo> {
        let ffprobe_path = Self::get_path()?;
        let output = std::process::Command::new(ffprobe_path)
            .arg("-v").arg("error")
            .arg("-select_streams").arg("a:0")
            .arg("-show_entries").arg("stream=codec_name,sample_rate,bits_per_raw_sample,bit_rate")
            .arg("-of").arg("json")
            .arg(path)
            .output()?;

        if output.status.success() {
            let info: serde_json::Value = serde_json::from_slice(&output.stdout)?;
            let stream = info.pointer("/streams/0").ok_or_else(|| anyhow!("No audio stream found"))?;
            
            Ok(AudioStreamInfo {
                codec: stream.get("codec_name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
                sample_rate: stream.get("sample_rate").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0),
                bit_depth: stream.get("bits_per_raw_sample").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0),
                bit_rate: stream.get("bit_rate").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0),
            })
        } else {
            Err(anyhow!("FFprobe failed to get stream info for: {}", path))
        }
    }

    /// Extracts lyrics from audio tags using ffprobe (mirroring Go parity).
    pub fn get_lyrics(path: &str) -> Result<String> {
        let ffprobe_path = Self::get_path()?;
        let output = std::process::Command::new(ffprobe_path)
            .arg("-v").arg("quiet")
            .arg("-show_entries").arg("format_tags=lyrics:format_tags=unsyncedlyrics:format_tags=lyric:format_tags=LYRICS:format_tags=UNSYNCEDLYRICS:format_tags=LYRIC")
            .arg("-of").arg("json")
            .arg(path)
            .output()?;

        if output.status.success() {
            let data: serde_json::Value = serde_json::from_slice(&output.stdout)?;
            if let Some(tags) = data.pointer("/format/tags").and_then(|t| t.as_object()) {
                for key in ["lyrics", "unsyncedlyrics", "lyric", "LYRICS", "UNSYNCEDLYRICS", "LYRIC"] {
                    if let Some(val) = tags.get(key).and_then(|v| v.as_str()) {
                        if !val.is_empty() {
                            return Ok(val.to_string());
                        }
                    }
                }
            }
        }
        Err(anyhow!("No lyrics found in FFprobe tags"))
    }
}

#[derive(Debug, Clone)]
pub struct AudioStreamInfo {
    pub codec: String,
    pub sample_rate: u32,
    pub bit_depth: u32,
    pub bit_rate: u64,
}
