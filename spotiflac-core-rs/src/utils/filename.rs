use crate::models::AppConfig;
use regex::Regex;
use std::path::PathBuf;

pub struct FilenameBuilder;

impl FilenameBuilder {
    fn apply_template(
        format: &str,
        track_name: &str,
        artist_name: &str,
        album_name: &str,
        album_artist: Option<&str>,
        release_date: Option<&str>,
        isrc: Option<&str>,
        track_number: u32,
        disc_number: u32,
    ) -> String {
        let safe_title = Self::sanitize(track_name);
        let safe_artist = Self::sanitize(artist_name);
        let safe_album = Self::sanitize(album_name);
        let safe_album_artist = Self::sanitize(album_artist.unwrap_or(artist_name));
        let safe_isrc = Self::sanitize(isrc.unwrap_or(""));

        let year = release_date
            .and_then(|d| if d.len() >= 4 { Some(&d[..4]) } else { None })
            .unwrap_or("");

        if format.contains('{') {
            let mut res = format.to_string();
            res = res.replace("{title}", &safe_title);
            res = res.replace("{artist}", &safe_artist);
            res = res.replace("{album}", &safe_album);
            res = res.replace("{album_artist}", &safe_album_artist);
            res = res.replace("{year}", year);
            res = res.replace("{date}", &Self::sanitize(release_date.unwrap_or("")));
            res = res.replace("{isrc}", &safe_isrc);

            if disc_number > 0 {
                res = res.replace("{disc}", &disc_number.to_string());
            } else {
                res = res.replace("{disc}", "");
            }

            if track_number > 0 {
                res = res.replace("{track}", &format!("{:02}", track_number));
            } else {
                // Remove {track} and surrounding separators if track is 0
                let re_track_sep = Regex::new(r"\{track\}[\.\s-]*").unwrap();
                res = re_track_sep.replace_all(&res, "").to_string();
            }
            res
        } else {
            // Fallback modes
            match format {
                "artist-title" => format!("{} - {}", safe_artist, safe_title),
                "title" => safe_title,
                _ => format!("{} - {}", safe_title, safe_artist),
            }
        }
    }

    pub fn build(
        format: &str,
        track_name: &str,
        artist_name: &str,
        album_name: &str,
        album_artist: Option<&str>,
        release_date: Option<&str>,
        isrc: Option<&str>,
        track_number: u32,
        disc_number: u32,
    ) -> String {
        let mut filename = Self::apply_template(
            format,
            track_name,
            artist_name,
            album_name,
            album_artist,
            release_date,
            isrc,
            track_number,
            disc_number,
        );

        // Final cleanup
        filename = filename.trim().to_string();
        if filename.is_empty() {
            filename = "Unknown Track".to_string();
        }

        filename
    }

    pub fn build_full_path(
        config: &AppConfig,
        track_name: &str,
        artist_name: &str,
        album_name: &str,
        album_artist: Option<&str>,
        release_date: Option<&str>,
        isrc: Option<&str>,
        track_number: u32,
        disc_number: u32,
        extension: &str,
    ) -> PathBuf {
        let mut final_artist = artist_name.to_string();
        if config.use_first_artist_only {
            // We split by standard separators like comma or semicolon
            if let Some(first) = artist_name.split(|c| c == ',' || c == ';').next() {
                final_artist = first.trim().to_string();
            }
        }

        let filename = Self::build(
            &config.filename_format,
            track_name,
            &final_artist,
            album_name,
            album_artist,
            release_date,
            isrc,
            track_number,
            disc_number,
        );

        let mut path = PathBuf::from(&config.output_dir);

        match config.folder_structure.as_str() {
            "" | "flat" => {}
            "artist" => {
                path.push(Self::sanitize(&final_artist));
            }
            "artist_album" => {
                path.push(Self::sanitize(&final_artist));
                path.push(Self::sanitize(album_name));
            }
            custom => {
                let folder_path = Self::apply_template(
                    custom,
                    track_name,
                    &final_artist,
                    album_name,
                    album_artist,
                    release_date,
                    isrc,
                    track_number,
                    disc_number,
                );

                for part in folder_path.split('/') {
                    let sanitized = Self::sanitize(part);
                    if !sanitized.is_empty() && sanitized != "Unknown" {
                        path.push(sanitized);
                    }
                }
            }
        }

        path.push(format!("{}.{}", filename, extension));
        path
    }

    pub fn sanitize(name: &str) -> String {
        let mut sanitized = name.replace("/", " ");

        let re_illegal = Regex::new(r#"[<>:"\\|?*]"#).unwrap();
        sanitized = re_illegal.replace_all(&sanitized, " ").to_string();

        // Control characters
        sanitized = sanitized
            .chars()
            .filter(|c| !c.is_control() && *c != '\u{7f}')
            .collect();

        sanitized = sanitized
            .trim_matches(|c: char| c == '.' || c == ' ' || c == '_')
            .to_string();

        let re_whitespace = Regex::new(r"\s+").unwrap();
        sanitized = re_whitespace.replace_all(&sanitized, " ").to_string();

        let re_underscores = Regex::new(r"_+").unwrap();
        sanitized = re_underscores.replace_all(&sanitized, "_").to_string();

        sanitized = sanitized.trim_matches(|c: char| c == '_' || c == ' ').to_string();

        if sanitized.is_empty() {
            return "Unknown".to_string();
        }

        sanitized
    }

    pub fn resolve_path(path: &std::path::Path, redownload_with_suffix: bool) -> std::path::PathBuf {
        if !redownload_with_suffix {
            return path.to_path_buf();
        }

        if !path.exists() {
            return path.to_path_buf();
        }

        let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
        let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");
        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("flac");

        for i in 1..100 {
            let candidate_name = format!("{}_{:02}.{}", file_stem, i, extension);
            let candidate_path = parent.join(candidate_name);
            if !candidate_path.exists() {
                return candidate_path;
            }
        }

        path.to_path_buf()
    }
}
