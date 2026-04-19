use anyhow::{Result, anyhow};
use crate::models::{TrackMetadata, AppConfig};
use crate::utils::metadata_formatter::MetadataFormatter;
use crate::utils::upc::PREFERRED_UPC_TAG_KEY;
use lofty::prelude::*;
use lofty::file::AudioFile;
use lofty::tag::{Tag, TagItem, ItemKey, ItemValue};
use lofty::picture::{Picture, PictureType, MimeType};
use lofty::config::WriteOptions;
use std::path::Path;

pub struct Tagger;

impl Tagger {
    /// Embeds all available metadata into the audio file.
    pub fn embed_metadata(path: &Path, metadata: &TrackMetadata, lyrics: Option<&str>, config: &AppConfig) -> Result<()> {
        let mut tagged_file = lofty::read_from_path(path)?;
        
        let tag_type = tagged_file.primary_tag_type();
        let tag = match tagged_file.primary_tag_mut() {
            Some(t) => t,
            None => {
                let new_tag = Tag::new(tag_type);
                tagged_file.insert_tag(new_tag);
                tagged_file.primary_tag_mut().unwrap()
            }
        };

        // 1. Artist formatting based on settings
        let mut final_artist = metadata.artist.clone();
        if config.use_first_artist_only {
            if let Some(first) = metadata.artist.split(|c| c == ',' || c == ';').next() {
                final_artist = first.trim().to_string();
            }
        }
        
        let display_artist = final_artist.replace(", ", &config.separator).replace("; ", &config.separator);

        // 2. Basic Text Tags
        tag.set_title(metadata.title.clone());
        tag.set_album(metadata.album.clone());
        
        // 3. Multi-Value Tags (Artists, Composer, Genre)
        Self::insert_multi_text(tag, ItemKey::TrackArtist, &display_artist);
        
        let album_artist = metadata.album_artist.as_deref().unwrap_or(&final_artist);
        let display_album_artist = album_artist.replace(", ", &config.separator).replace("; ", &config.separator);
        Self::insert_multi_text(tag, ItemKey::AlbumArtist, &display_album_artist);

        if let Some(composer) = &metadata.composer {
            let display_composer = composer.replace(", ", &config.separator).replace("; ", &config.separator);
            Self::insert_multi_text(tag, ItemKey::Composer, &display_composer);
        }

        if let Some(genre) = &metadata.genre {
            Self::insert_multi_text(tag, ItemKey::Genre, genre);
        }

        // 3. Numbers
        tag.set_track(metadata.track_number);
        tag.set_disk(metadata.disc_number);

        if let Some(total_tracks) = metadata.total_tracks {
            tag.insert_text(ItemKey::TrackTotal, total_tracks.to_string());
        }
        if let Some(total_discs) = metadata.total_discs {
            tag.insert_text(ItemKey::DiscTotal, total_discs.to_string());
        }

        // 4. Identifiers & Dates
        if let Some(date) = &metadata.date {
            tag.insert_text(ItemKey::RecordingDate, date.clone());
            let year = if date.len() >= 4 { &date[..4] } else { date };
            tag.insert_text(ItemKey::Year, year.to_string());
        }

        if let Some(isrc) = &metadata.isrc {
            tag.insert_text(ItemKey::Isrc, isrc.clone());
        }

        if let Some(upc) = &metadata.upc {
            tag.insert_text(ItemKey::Barcode, upc.clone());
            tag.insert_text(ItemKey::Unknown(PREFERRED_UPC_TAG_KEY.to_string()), upc.clone());
        }

        if let Some(label) = &metadata.label {
            tag.insert_text(ItemKey::Label, label.clone());
            tag.insert_text(ItemKey::Publisher, label.clone());
            tag.insert_text(ItemKey::Unknown("ORGANIZATION".to_string()), label.clone());
        }

        if let Some(copyright) = &metadata.copyright {
            tag.insert_text(ItemKey::CopyrightMessage, copyright.clone());
        }

        // 5. Comments & Lyrics
        let comment = if metadata.is_explicit {
            Some("Explicit".to_string())
        } else {
            metadata.spotify_url.clone()
        };

        if let Some(c) = comment {
            tag.insert_text(ItemKey::Comment, c.clone());
            tag.insert_text(ItemKey::Description, c);
        }

        if let Some(lyr) = lyrics {
             let validated = Self::validate_lyrics(path, lyr);
             
             let ext = path.extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase())
                .unwrap_or_default();

             if ext == "m4a" || ext == "mp4" {
                 let _ = crate::utils::ffmpeg::FFmpeg::embed_lyrics_to_m4a(&path.to_string_lossy(), &validated);
             } else {
                 tag.insert_text(ItemKey::Lyrics, validated);
             }
        }

        // 6. Custom Tags
        tag.insert_text(ItemKey::EncoderSoftware, "SpotiFLAC-rs (Rust Engine)".to_string());
        if let Some(sid) = &metadata.spotify_url {
            tag.insert_text(ItemKey::Unknown("SPOTIFY_URL".to_string()), sid.clone());
        }

        tagged_file.save_to_path(path, WriteOptions::default())?;
        Ok(())
    }

    /// Validates lyrics timestamps against audio duration (for LRC files).
    fn validate_lyrics(path: &Path, lyrics: &str) -> String {
        use crate::utils::ffmpeg::FFprobe;
        
        let duration = match FFprobe::get_duration(&path.to_string_lossy()) {
            Ok(d) => d,
            Err(_) => return lyrics.to_string(),
        };

        if duration <= 0.0 {
            return lyrics.to_string();
        }

        let duration_ms = (duration * 1000.0) as i64;
        let lines: Vec<&str> = lyrics.lines().collect();
        let mut valid_lines = Vec::new();

        for line in lines {
            let trimmed = line.trim();
            if trimmed.is_empty() || !trimmed.starts_with('[') {
                valid_lines.push(line);
                continue;
            }

            if let Some(close_bracket) = trimmed.find(']') {
                let timestamp_str = &trimmed[1..close_bracket];
                let ts_ms = Self::parse_lrc_timestamp(timestamp_str);
                if ts_ms >= 0 {
                    if ts_ms <= duration_ms {
                        valid_lines.push(line);
                    } else {
                        // Exceeds duration, skip this line
                        println!("⚠️ Warning: Filtering lyrics line that exceeds duration: {}", trimmed);
                    }
                } else {
                    valid_lines.push(line);
                }
            } else {
                valid_lines.push(line);
            }
        }

        valid_lines.join("\n")
    }

    fn parse_lrc_timestamp(ts: &str) -> i64 {
        // Expected format: MM:SS.CC or MM:SS
        let parts: Vec<&str> = ts.split(':').collect();
        if parts.len() < 2 {
            return -1;
        }

        let minutes: i64 = parts[0].parse().unwrap_or(0);
        let second_parts: Vec<&str> = parts[1].split('.').collect();
        
        let seconds: i64 = second_parts[0].parse().unwrap_or(0);
        let centiseconds: i64 = if second_parts.len() > 1 {
            second_parts[1].parse().unwrap_or(0)
        } else {
            0
        };

        minutes * 60 * 1000 + seconds * 1000 + centiseconds * 10
    }

    /// Extracts metadata from an existing audio file.
    pub fn extract_metadata(path: &Path) -> Result<TrackMetadata> {
        let tagged_file = lofty::read_from_path(path)?;
        let tag = tagged_file.primary_tag()
            .ok_or_else(|| anyhow!("No tags found in file"))?;

        let artist = tag.get_string(&ItemKey::TrackArtist).unwrap_or("Unknown Artist").to_string();
        let album = tag.get_string(&ItemKey::AlbumTitle).unwrap_or("Unknown Album").to_string();
        let title = tag.get_string(&ItemKey::TrackTitle).unwrap_or("Unknown Title").to_string();

        let mut metadata = TrackMetadata::new(title, artist, album);
        
        metadata.album_artist = tag.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string());
        metadata.composer = tag.get_string(&ItemKey::Composer).map(|s| s.to_string());
        metadata.genre = tag.get_string(&ItemKey::Genre).map(|s| s.to_string());
        metadata.track_number = tag.track().unwrap_or(0);
        metadata.disc_number = tag.disk().unwrap_or(0);
        metadata.date = tag.get_string(&ItemKey::RecordingDate)
            .or_else(|| tag.get_string(&ItemKey::Year))
            .map(|s| s.to_string());
        metadata.isrc = tag.get_string(&ItemKey::Isrc).map(|s| s.to_string());
        metadata.upc = tag.get_string(&ItemKey::Barcode).map(|s| s.to_string());
        metadata.label = tag.get_string(&ItemKey::Label)
            .or_else(|| tag.get_string(&ItemKey::Publisher))
            .map(|s| s.to_string());
        metadata.copyright = tag.get_string(&ItemKey::CopyrightMessage).map(|s| s.to_string());
        
        // Lyrics extraction with FFprobe fallback
        metadata.lyrics_text = tag.get_string(&ItemKey::Lyrics)
            .map(|s| s.to_string())
            .or_else(|| {
                crate::utils::ffmpeg::FFprobe::get_lyrics(path.to_str().unwrap_or_default()).ok()
            });

        Ok(metadata)
    }

    /// Extracts the cover art from an audio file.
    pub fn extract_cover(path: &Path) -> Result<Option<Vec<u8>>> {
        // 1. Try lofty first
        if let Ok(tagged_file) = lofty::read_from_path(path) {
            if let Some(tag) = tagged_file.primary_tag() {
                if let Some(pic) = tag.pictures().first() {
                    return Ok(Some(pic.data().to_vec()));
                }
            }
        }

        // 2. Fallback to FFmpeg (mirrors Go's extractCoverWithFFmpeg)
        let path_str = path.to_string_lossy();
        let ffmpeg_path = crate::utils::ffmpeg::FFmpeg::get_path()?;
        let tmp_path = format!("{}.cover.jpg", path_str);

        let mut cmd = std::process::Command::new(ffmpeg_path);
        cmd.arg("-i").arg(&*path_str)
           .arg("-an")
           .arg("-vframes").arg("1")
           .arg("-f").arg("image2")
           .arg("-update").arg("1")
           .arg("-y")
           .arg(&tmp_path);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        if let Ok(status) = cmd.status() {
            if status.success() {
                if let Ok(data) = std::fs::read(&tmp_path) {
                    let _ = std::fs::remove_file(&tmp_path);
                    return Ok(Some(data));
                }
            }
        }
        
        let _ = std::fs::remove_file(tmp_path);
        Ok(None)
    }

    /// Internal helper to insert multiple values for a single key (e.g. multi-artist).
    fn insert_multi_text(tag: &mut Tag, key: ItemKey, value: &str) {
        let values = MetadataFormatter::split_credits(value, None);
        if values.is_empty() { return; }
        
        tag.remove_key(&key);
        for val in values {
            tag.push(TagItem::new(key.clone(), ItemValue::Text(val)));
        }
    }

    /// Embeds cover art from raw bytes.
    pub fn embed_cover(path: &Path, image_data: Vec<u8>) -> Result<()> {
        let mut tagged_file = lofty::read_from_path(path)?;
        let tag = tagged_file.primary_tag_mut()
            .ok_or_else(|| anyhow!("No tags found in file to embed cover"))?;

        let mime = if image_data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            MimeType::Png
        } else {
            MimeType::Jpeg
        };

        let picture = Picture::new_unchecked(
            PictureType::CoverFront,
            Some(mime),
            None,
            image_data,
        );

        tag.push_picture(picture);
        tagged_file.save_to_path(path, WriteOptions::default())?;
        Ok(())
    }
}
