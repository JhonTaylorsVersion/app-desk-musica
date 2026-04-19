use std::collections::HashSet;

pub struct MetadataFormatter;

impl MetadataFormatter {
    /// Splits a metadata string (like artists or genres) into multiple values based on common separators.
    /// This mimics the logic in Go's author_format.go and metadata.go.
    pub fn split_credits(input: &str, separator: Option<&str>) -> Vec<String> {
        let input = input.trim();
        if input.is_empty() {
            return Vec::new();
        }

        // 1. Initial split by internal separator if present (matching Go logic)
        let segments: Vec<&str> = if input.contains("|||SEP|||") {
            input.split("|||SEP|||").collect()
        } else {
            vec![input]
        };

        let mut all_parts = Vec::new();
        let norm_sep = separator.and_then(Self::normalize_separator);

        for segment in segments {
            if let Some(sep) = &norm_sep {
                all_parts.extend(segment.split(sep));
            } else if segment.contains(';') {
                all_parts.extend(segment.split(';'));
            } else {
                all_parts.push(segment);
            }
        }

        // Deduplicate and trim
        let mut seen = HashSet::new();
        let mut result = Vec::new();
        for p in all_parts {
            let trimmed = p.trim().to_string();
            if !trimmed.is_empty() && !seen.contains(&trimmed) {
                seen.insert(trimmed.clone());
                result.push(trimmed);
            }
        }

        result
    }

    /// Normalizes the separator to only allow common ones like ',' or ';'.
    fn normalize_separator(sep: &str) -> Option<String> {
        let s = sep.trim();
        if s == "," || s == ";" {
            Some(s.to_string())
        } else {
            None
        }
    }

    /// Forms a display string for multiple values (e.g. for logging or UI).
    pub fn join_values(values: &[String], separator: &str) -> String {
        let sep = if let Some(s) = Self::normalize_separator(separator) {
            format!("{} ", s)
        } else {
            "; ".to_string()
        };
        values.join(&sep)
    }
    
    /// Formats seconds into a string like "03:45" or "01:02:03".
    pub fn format_duration(total_seconds: u32) -> String {
        let hours = total_seconds / 3600;
        let minutes = (total_seconds % 3600) / 60;
        let seconds = total_seconds % 60;

        if hours > 0 {
            format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
        } else {
            format!("{:02}:{:02}", minutes, seconds)
        }
    }
}
