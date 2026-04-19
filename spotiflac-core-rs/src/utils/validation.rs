use anyhow::{Result, anyhow};
use crate::utils::ffmpeg::FFprobe;

const PREVIEW_MAX_SECONDS: i32 = 35;
const PREVIEW_EXPECTED_MIN_SECONDS: i32 = 60;
const LARGE_MISMATCH_MIN_EXPECTED: i32 = 90;
const MIN_ALLOWED_DURATION_DIFF: i32 = 15;
const DURATION_DIFF_RATIO: f64 = 0.25;

pub struct DownloadValidator;

impl DownloadValidator {
    pub fn validate_duration(file_path: &str, expected_ms: u32) -> Result<()> {
        if expected_ms == 0 {
            return Ok(());
        }

        let actual_duration = FFprobe::get_duration(file_path)?;
        let actual_seconds = actual_duration.round() as i32;
        let expected_seconds = (expected_ms as f64 / 1000.0).round() as i32;

        if actual_seconds <= 0 {
            return Err(anyhow!("Duration validation failed: actual duration is 0"));
        }

        // 1. Detect Preview/Sample
        if expected_seconds >= PREVIEW_EXPECTED_MIN_SECONDS && actual_seconds <= PREVIEW_MAX_SECONDS {
             return Err(anyhow!(
                 "Detected preview/sample download: file is {}s, expected about {}s.", 
                 actual_seconds, expected_seconds
             ));
        }

        // 2. Large Mismatch Logic
        if expected_seconds >= LARGE_MISMATCH_MIN_EXPECTED {
            let allowed_diff = (expected_seconds as f64 * DURATION_DIFF_RATIO).round() as i32;
            let allowed_diff = allowed_diff.max(MIN_ALLOWED_DURATION_DIFF);
            
            let diff = (actual_seconds - expected_seconds).abs();
            if diff > allowed_diff {
                return Err(anyhow!(
                    "Downloaded file duration mismatch: file is {}s, expected about {}s.", 
                    actual_seconds, expected_seconds
                ));
            }
        }

        Ok(())
    }
}
