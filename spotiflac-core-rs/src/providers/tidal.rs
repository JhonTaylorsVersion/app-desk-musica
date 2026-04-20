use super::AudioProvider;
use crate::models::AudioQuality;
use crate::progress::{ProgressManager, ProgressReporter};
use crate::storage::MirrorManager;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use regex::Regex;
use reqwest::Client;
use serde::Deserialize;
use std::fs::File;
use std::io::Write;
use std::sync::Arc;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "PascalCase")]
struct TidalAPIResponse {
    #[serde(rename = "OriginalTrackUrl")]
    original_track_url: Option<String>,
}

#[derive(Deserialize, Debug)]
struct TidalAPIResponseV2 {
    data: TidalData,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct TidalData {
    // track_id: i64, // unused but present
    manifest: String,
}

// DASH XML Structs
#[derive(Deserialize, Debug)]
struct Mpd {
    #[serde(rename = "Period")]
    period: Period,
}

#[derive(Deserialize, Debug)]
struct Period {
    #[serde(rename = "AdaptationSet")]
    adaptation_sets: Vec<AdaptationSet>,
}

#[derive(Deserialize, Debug)]
struct AdaptationSet {
    #[serde(rename = "@mimeType")]
    _mime_type: Option<String>,
    #[serde(rename = "@codecs")]
    _codecs: Option<String>,
    #[serde(rename = "Representation")]
    representations: Vec<Representation>,
    #[serde(rename = "SegmentTemplate")]
    segment_template: Option<SegmentTemplate>,
}

#[derive(Deserialize, Debug)]
struct Representation {
    #[serde(rename = "@id")]
    _id: String,
    #[serde(rename = "@codecs")]
    _codecs: Option<String>,
    #[serde(rename = "@bandwidth")]
    bandwidth: u32,
    #[serde(rename = "SegmentTemplate")]
    segment_template: Option<SegmentTemplate>,
}

#[derive(Deserialize, Debug)]
struct SegmentTemplate {
    #[serde(rename = "@initialization")]
    initialization: String,
    #[serde(rename = "@media")]
    media: String,
    #[serde(rename = "SegmentTimeline")]
    timeline: Option<SegmentTimeline>,
}

#[derive(Deserialize, Debug)]
struct SegmentTimeline {
    #[serde(rename = "S")]
    segments: Vec<S>,
}

#[derive(Deserialize, Debug)]
struct S {
    #[serde(rename = "@d")]
    _duration: i64,
    #[serde(rename = "@r")]
    repeat: Option<i32>,
}

#[derive(Deserialize, Debug)]
struct BtsManifest {
    #[serde(rename = "mimeType")]
    _mime_type: String,
    urls: Vec<String>,
}

pub struct TidalProvider {
    client: Client,
    mirrors_manager: Arc<MirrorManager>,
}

impl TidalProvider {
    pub fn new(mirrors_manager: Arc<MirrorManager>) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .user_agent(crate::models::APP_USER_AGENT)
                .http1_only() // Force HTTP/1.1 for mirror compatibility
                .no_gzip() // Disable compression types mirrors might not handle
                .no_brotli()
                .no_deflate()
                .build()
                .unwrap(),
            mirrors_manager,
        }
    }

    async fn get_download_url_with_fallback(
        &self,
        query_id: &str,
        quality: AudioQuality,
        allow_fallback: bool,
        progress: Arc<ProgressManager>,
    ) -> Result<String> {
        let q_str = match quality {
            AudioQuality::Low => "LOW",
            AudioQuality::Lossless => "LOSSLESS",
            AudioQuality::HiRes => "HI_RES",
        };

        let mirrors = vec![
            "https://hifi-one.spotisaver.net".to_string(),
            "https://hifi-two.spotisaver.net".to_string(),
            "https://eu-central.monochrome.tf".to_string(),
            "https://us-west.monochrome.tf".to_string(),
            "https://api.monochrome.tf".to_string(),
            "https://monochrome-api.samidy.com".to_string(),
            "https://tidal.kinoplus.online".to_string(),
        ];

        let prioritized_mirrors = self.mirrors_manager.prioritize("tidal", mirrors);
        let mut last_error = anyhow!("No mirrors available");

        for mirror in prioritized_mirrors {
            let url = format!("{}/track/?id={}&quality={}", mirror, query_id, q_str);
            let ua = "Go-http-client/1.1";

            progress.log(&format!(
                "DEBUG [Tidal]: Probando Mirror -> {} [UA: {}]",
                mirror, ua
            ));

            // --- PARITY: Fresh client per mirror check (mirrors Go's tidal.go:937) ---
            let fresh_client = Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent(ua)
                .http1_only() // Keep HTTP/1.1
                .danger_accept_invalid_certs(true)
                .build()
                .unwrap_or_else(|_| self.client.clone());

            // Anti-429 delay: Increased to 2 seconds for better mirror stability
            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;

            match fresh_client
                .get(&url)
                .header("Accept", "*/*")
                .header("Connection", "keep-alive")
                .send()
                .await
            {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        let body_bytes = resp.bytes().await?;

                        // Parity log
                        progress.log(&format!("DEBUG [Tidal]: Success 200 de {}", mirror));

                        if let Ok(v2) = serde_json::from_slice::<TidalAPIResponseV2>(&body_bytes) {
                            if !v2.data.manifest.is_empty() {
                                progress.log(&format!("DEBUG [Tidal]: Manifiesto V2 obtenido"));
                                self.mirrors_manager.record_outcome("tidal", &mirror, true);
                                return Ok(format!("MANIFEST:{}", v2.data.manifest));
                            }
                        }

                        if let Ok(v1_list) =
                            serde_json::from_slice::<Vec<TidalAPIResponse>>(&body_bytes)
                        {
                            for item in v1_list {
                                if let Some(u) = item.original_track_url {
                                    progress.log(&format!("DEBUG [Tidal]: URL Directa obtenida"));
                                    self.mirrors_manager.record_outcome("tidal", &mirror, true);
                                    return Ok(u);
                                }
                            }
                        }

                        progress.log(&format!(
                            "DEBUG [Tidal]: Cuerpo de respuesta inválido o vacío."
                        ));
                        self.mirrors_manager.record_outcome("tidal", &mirror, false);
                    } else {
                        progress.log(&format!("DEBUG [Tidal]: Mirror rechazó [Code: {}]", status));
                        self.mirrors_manager.record_outcome("tidal", &mirror, false);
                        last_error = anyhow!("Mirror returned {}", status);
                    }
                }
                Err(e) => {
                    let err_msg = format!("{:?}", e);
                    progress.log(&format!(
                        "DEBUG [Tidal]: ERROR DE RED en {}: {}",
                        mirror, err_msg
                    ));
                    self.mirrors_manager.record_outcome("tidal", &mirror, false);
                    last_error = e.into();
                }
            }
        }

        // --- FALLBACK LOGIC ---
        if allow_fallback {
            match quality {
                AudioQuality::HiRes => {
                    progress.log("⚠️ Tidal HI_RES falló, intentando LOSSLESS...");
                    return Box::pin(self.get_download_url_with_fallback(
                        query_id,
                        AudioQuality::Lossless,
                        true,
                        progress,
                    ))
                    .await;
                }
                AudioQuality::Lossless => {
                    progress.log("⚠️ Tidal LOSSLESS falló, intentando LOW...");
                    return Box::pin(self.get_download_url_with_fallback(
                        query_id,
                        AudioQuality::Low,
                        false,
                        progress,
                    ))
                    .await;
                }
                _ => {}
            }
        }

        Err(last_error)
    }

    fn parse_manifest(
        &self,
        manifest_b64: &str,
    ) -> Result<(Option<String>, Option<String>, Vec<String>)> {
        let manifest_bytes = general_purpose::STANDARD.decode(manifest_b64)?;
        let manifest_str = String::from_utf8(manifest_bytes.clone())?;

        // 1. Try BTS Format (JSON)
        if manifest_str.trim().starts_with('{') {
            let bts: BtsManifest = serde_json::from_str(&manifest_str)?;
            if bts.urls.is_empty() {
                return Err(anyhow!("No URLs in BTS manifest"));
            }
            return Ok((Some(bts.urls[0].clone()), None, vec![]));
        }

        // 2. Try DASH Format (XML)
        // println!("DEBUG: Parsing DASH Manifest...");
        let mpd: Mpd = quick_xml::de::from_reader(manifest_bytes.as_slice())?;

        let mut best_rep: Option<&Representation> = None;
        let mut best_as: Option<&AdaptationSet> = None;

        for as_set in &mpd.period.adaptation_sets {
            for rep in &as_set.representations {
                if best_rep.is_none() || rep.bandwidth > best_rep.unwrap().bandwidth {
                    best_rep = Some(rep);
                    best_as = Some(as_set);
                }
            }
        }

        if let (Some(rep), Some(as_set)) = (best_rep, best_as) {
            let template = rep
                .segment_template
                .as_ref()
                .or(as_set.segment_template.as_ref());
            if let Some(t) = template {
                let init_url = t.initialization.replace("&amp;", "&");
                let media_template = t.media.replace("&amp;", "&");

                let mut segment_count = 0;
                if let Some(timeline) = &t.timeline {
                    for s in &timeline.segments {
                        segment_count += s.repeat.unwrap_or(0) + 1;
                    }
                }

                if segment_count > 0 {
                    let mut media_urls = Vec::new();
                    for i in 1..=segment_count {
                        media_urls.push(media_template.replace("$Number$", &i.to_string()));
                    }
                    return Ok((None, Some(init_url), media_urls));
                }
            }
        }

        // 3. Fallback Regex Parsing (if XML lacks timeline or fails)
        let init_re = Regex::new(r#"initialization="([^"]+)""#).unwrap();
        let media_re = Regex::new(r#"media="([^"]+)""#).unwrap();
        let s_re = Regex::new(r#"<S [^>]*r="(\d+)""#).unwrap();

        let init_url = init_re
            .captures(&manifest_str)
            .map(|c| c[1].to_string().replace("&amp;", "&"));
        let media_template = media_re
            .captures(&manifest_str)
            .map(|c| c[1].to_string().replace("&amp;", "&"));

        if let (Some(init), Some(media_tmp)) = (init_url, media_template) {
            let mut segment_count = 0;
            let s_tag_re = Regex::new(r#"<S [^>]*>"#).unwrap();
            for cap in s_tag_re.find_iter(&manifest_str) {
                let tag_str = cap.as_str();
                let repeat = s_re
                    .captures(tag_str)
                    .and_then(|c| c[1].parse::<i32>().ok())
                    .unwrap_or(0);
                segment_count += repeat + 1;
            }

            if segment_count > 0 {
                let mut media_urls = Vec::new();
                for i in 1..=segment_count {
                    media_urls.push(media_tmp.replace("$Number$", &i.to_string()));
                }
                return Ok((None, Some(init), media_urls));
            }
        }

        Err(anyhow!(
            "Failed to parse manifest (Unknown format or no segments)"
        ))
    }
}

#[async_trait]
impl AudioProvider for TidalProvider {
    fn name(&self) -> &str {
        "Tidal"
    }

    async fn get_download_url(
        &self,
        query_id: &str,
        quality: AudioQuality,
        progress: Arc<ProgressManager>,
    ) -> Result<String> {
        self.get_download_url_with_fallback(query_id, quality, true, progress)
            .await
    }

    async fn download_track(
        &self,
        url: &str,
        path: &str,
        progress: Arc<ProgressManager>,
        item_id: &str,
    ) -> Result<()> {
        let mut reporter = ProgressReporter::new(progress, item_id.to_string());

        if url.starts_with("MANIFEST:") {
            let (direct, init, media) = self.parse_manifest(&url[9..])?;

            if let Some(direct_url) = direct {
                let mut resp = self.client.get(direct_url).send().await?;
                let mut file = File::create(path)?;
                while let Some(chunk) = resp.chunk().await? {
                    reporter.update(chunk.len() as u64);
                    file.write_all(&chunk)?;
                }
                return Ok(());
            }

            if let (Some(init_url), true) = (init, !media.is_empty()) {
                let mut file = File::create(path)?;
                let mut resp = self.client.get(init_url).send().await?;
                while let Some(chunk) = resp.chunk().await? {
                    reporter.update(chunk.len() as u64);
                    file.write_all(&chunk)?;
                }

                for m_url in media {
                    let mut m_resp = self.client.get(m_url).send().await?;
                    while let Some(chunk) = m_resp.chunk().await? {
                        reporter.update(chunk.len() as u64);
                        file.write_all(&chunk)?;
                    }
                }
                return Ok(());
            }
            return Err(anyhow!("Manifest parsed but no valid download path found"));
        }

        let mut resp = self.client.get(url).send().await?;
        let mut file = File::create(path)?;
        while let Some(chunk) = resp.chunk().await? {
            reporter.update(chunk.len() as u64);
            file.write_all(&chunk)?;
        }
        Ok(())
    }
}
