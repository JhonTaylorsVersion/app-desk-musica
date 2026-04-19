use anyhow::{Result, anyhow};
use crate::models::{AppConfig, TrackMetadata, AudioQuality};
use crate::providers::{AudioProvider, tidal::TidalProvider, qobuz::QobuzProvider, amazon::AmazonProvider};
use crate::metadata::tagger::Tagger;
use crate::metadata::spotify::SpotifyMetadataClient;
use crate::metadata::lyrics::LyricsClient;
use crate::metadata::musicbrainz::MusicBrainzClient;
use crate::isrc::LinkResolver;
use crate::storage::{HistoryManager, HistoryItem, MirrorManager, ProviderPriorityManager};
use crate::utils::ffmpeg::FFmpeg;
use crate::utils::filename::FilenameBuilder;
use crate::progress::ProgressManager;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct SpotiFLACEngine {
    spotify: SpotifyMetadataClient,
    pub resolver: LinkResolver,
    tidal: TidalProvider,
    qobuz: QobuzProvider,
    amazon: AmazonProvider,
    lyrics: LyricsClient,
    mb: MusicBrainzClient,
    history: Option<HistoryManager>,
    pub mirrors: Arc<MirrorManager>,
    pub provider_priority: Arc<ProviderPriorityManager>,
    pub progress: Arc<ProgressManager>,
    pub assets: crate::utils::assets::AssetsDownloader,
}

impl SpotiFLACEngine {
    pub fn new(db_path: Option<PathBuf>) -> Self {
        let history = db_path.clone().and_then(|p| HistoryManager::new(p).ok());
        let mirror_db = db_path.clone().map(|mut p| { p.set_file_name("mirrors.db"); p });
        let mirrors = Arc::new(MirrorManager::new(mirror_db));
        
        let priority_db = db_path.clone().map(|mut p| { p.set_file_name("provider_priority.db"); p });
        let provider_priority = Arc::new(ProviderPriorityManager::new(priority_db.unwrap_or_else(|| PathBuf::from("provider_priority.db"))).expect("Failed to open priority DB"));

        let isrc_db = db_path.map(|mut p| { p.set_file_name("isrc_cache.db"); p });
        let isrc_cache = isrc_db.and_then(|p| crate::isrc::ISRCCache::new(p).ok()).map(Arc::new);
        
        Self {
            spotify: SpotifyMetadataClient::new(),
            resolver: LinkResolver::new(isrc_cache),
            tidal: TidalProvider::new(mirrors.clone()),
            qobuz: QobuzProvider::new(mirrors.clone()),
            amazon: AmazonProvider::new(),
            lyrics: LyricsClient::new(),
            mb: MusicBrainzClient::new(),
            history,
            mirrors,
            provider_priority,
            progress: Arc::new(ProgressManager::new()),
            assets: crate::utils::assets::AssetsDownloader::new(),
        }
    }

    /// Delegates to HistoryManager::add_fetch_item — used by add_fetch_history command
    pub fn add_fetch_history(&self, item: crate::storage::history::FetchHistoryItem) -> anyhow::Result<()> {
        if let Some(h) = &self.history {
            h.add_fetch_item(item)
        } else {
            Ok(())
        }
    }

    pub fn get_fetch_history(&self) -> anyhow::Result<Vec<crate::storage::history::FetchHistoryItem>> {
        if let Some(h) = &self.history {
            h.get_fetch_history()
        } else {
            Ok(vec![])
        }
    }

    pub fn clear_fetch_history_by_type(&self, item_type: &str) -> anyhow::Result<()> {
        if let Some(h) = &self.history {
            h.clear_fetch_history_by_type(item_type)
        } else {
            Ok(())
        }
    }

    pub fn delete_fetch_history_item(&self, id: &str) -> anyhow::Result<()> {
        if let Some(h) = &self.history {
            h.delete_fetch_item(id)
        } else {
            Ok(())
        }
    }

    /// Checks if a track has been downloaded before — used by check_files_existence command
    pub fn is_already_downloaded(&self, spotify_id: &str) -> Option<String> {
        self.history.as_ref()?.is_already_downloaded(spotify_id)
    }

    /// Returns full download history — used by get_download_history command
    pub fn get_download_history(&self) -> anyhow::Result<Vec<crate::storage::history::HistoryItem>> {
        if let Some(h) = &self.history {
            h.get_download_history()
        } else {
            Ok(vec![])
        }
    }

    pub fn clear_download_history(&self) -> anyhow::Result<()> {
        if let Some(h) = &self.history {
            h.clear_download_history()
        } else {
            Ok(())
        }
    }

    pub fn delete_download_history_item(&self, id: &str) -> anyhow::Result<()> {
        if let Some(h) = &self.history {
            h.delete_download_item(id)
        } else {
            Ok(())
        }
    }

    pub async fn get_streaming_urls(&self, spotify_id: &str, region: Option<&str>) -> Result<crate::models::SongLinkData> {
        let spotify_url = format!("https://open.spotify.com/track/{}", spotify_id);
        let data = self.resolver.songlink.resolve_from_spotify(&spotify_url, region).await?;
        Ok(crate::models::SongLinkData {
            isrc: data.isrc,
            tidal_url: data.tidal_url,
            amazon_url: data.amazon_url,
            deezer_url: data.deezer_url,
        })
    }

    pub async fn check_track_availability(&self, spotify_id: &str) -> Result<crate::models::TrackAvailability> {
        let spotify_url = format!("https://open.spotify.com/track/{}", spotify_id);
        let links = self.resolver.resolve_links(&spotify_url, Some(self.progress.clone())).await?;
        
        let mut availability = crate::models::TrackAvailability {
            spotify_id: spotify_id.to_string(),
            tidal: links.tidal_url.is_some(),
            amazon: links.amazon_url.is_some(),
            qobuz: false, // Default
            deezer: false, // Default (SongLink check below)
            tidal_url: links.tidal_url,
            amazon_url: links.amazon_url,
            qobuz_url: None,
            deezer_url: None,
        };

        // Get Deezer/Qobuz from SongLink direct call to get all platforms
        if let Ok(data) = self.resolver.songlink.resolve_from_spotify(&spotify_url, None).await {
            availability.deezer = data.deezer_url.is_some();
            availability.deezer_url = data.deezer_url;
            
            // If ISRC was missing in links, use from here
            let isrc = if links.isrc == "UNKNOWN" { 
                data.isrc.unwrap_or_else(|| "UNKNOWN".to_string()) 
            } else { 
                links.isrc 
            };

            // Qobuz search by ISRC
            if isrc != "UNKNOWN" {
                if let Ok(qobuz_id) = self.qobuz.search_qobuz_id_from_isrc_for_availability(&isrc, self.progress.clone()).await {
                    availability.qobuz = true;
                    availability.qobuz_url = Some(format!("https://www.qobuz.com/track/{}", qobuz_id));
                }
            }
        }

        Ok(availability)
    }

    pub async fn download_track(&self, url: &str, config: &AppConfig, tidal_id_override: Option<String>) -> Result<PathBuf> {
        self.progress.log("- [Paso 1/6] Verificando binarios FFmpeg...");
        crate::utils::ffmpeg_downloader::FFmpegDownloader::ensure_binaries().await?;

        self.progress.log(&format!("- [Paso 2/6] Obteniendo metadatos de Spotify para: {} - {}", url, tidal_id_override.as_deref().unwrap_or("")));
        let (mut metadata, _first_artist_id, _plays) = self.spotify.fetch_track_info_enriched(url).await?;
        self.progress.log(&format!("  ✓ Metadatos obtenidos: {} - {}", metadata.artist, metadata.title));
        
        // Add to progress queue
        self.progress.add_to_queue(
            metadata.id.clone(),
            metadata.title.clone(),
            metadata.artist.clone(),
            metadata.album.clone(),
            metadata.id.clone()
        );
        
        self.progress.log("- [Paso 3/6] Resolviendo ISRC y enlaces externos...");
        let resolved = self.resolver.resolve_links(url, Some(self.progress.clone())).await?;
        metadata.isrc = Some(resolved.isrc.clone());
        let isrc = &resolved.isrc;
        self.progress.log(&format!("  ✓ ISRC: {}", isrc));
        if let Some(t_id) = &resolved.tidal_id { self.progress.log(&format!("  ✓ Tidal ID: {}", t_id)); }
        
        if resolved.tidal_url.is_none() && resolved.amazon_url.is_none() {
             self.progress.log("  ⚠️ No se encontraron enlaces directos en Tidal o Amazon. Intentando búsqueda secundaria...");
        }

        if let Some(h) = &self.history {
             if let Some(path) = h.is_already_downloaded(&metadata.id) {
                 if std::path::Path::new(&path).exists() {
                     self.progress.log(&format!("ℹ️ Pista ya descargada anteriormente en: {} (Encontrada en disco)", path));
                     self.progress.skip_item(&metadata.id, path.clone());
                     return Ok(std::path::PathBuf::from(path));
                 } else {
                     self.progress.log(&format!("ℹ️ Historial indica descarga previa en {}, pero el archivo no existe. Procediendo a descargar...", path));
                     // Optional: remove from history or just let it overwrite later
                 }
             }
        }

        self.progress.log(&format!("DEBUG: ISRC Resolvido -> {}", isrc));

        // 3. PRIORITIZE PROVIDERS based on mode & order
        self.progress.log("- [Paso 4/6] Seleccionando proveedor...");
        
        let prioritized = if config.downloader != "auto" {
            // Force specific provider
            match config.downloader.as_str() {
                "tidal" => vec!["Tidal".to_string()],
                "qobuz" => vec!["Qobuz".to_string()],
                "amazon" => vec!["Amazon".to_string()],
                _ => vec!["Tidal".to_string()], // Fallback
            }
        } else {
            // Use user-defined auto order
            let mut base_list = Vec::new();
            for p in &config.auto_order {
                match p.as_str() {
                    "tidal" => base_list.push("Tidal".to_string()),
                    "qobuz" => base_list.push("Qobuz".to_string()),
                    "amazon" => base_list.push("Amazon".to_string()),
                    _ => {}
                }
            }
            // Fallback if list is empty
            if base_list.is_empty() {
                base_list = vec!["Tidal".to_string(), "Qobuz".to_string(), "Amazon".to_string()];
            }
            
            // Apply Smart Priority engine on top of user's base list
            self.provider_priority.prioritize_providers("spotify", base_list)
        };

        let mut last_error = anyhow!("Todos los proveedores fallaron");

        for provider_name in prioritized {
            self.progress.log(&format!("  🔍 Intentando descargar desde {}...", provider_name));
            
            let result = match provider_name.as_str() {
                "Tidal" => {
                    let query_id = tidal_id_override.clone()
                        .or(resolved.tidal_id.clone())
                        .unwrap_or_else(|| isrc.clone());
                    
                    match self.tidal.get_download_url(&query_id, config.download_quality.clone(), self.progress.clone()).await {
                        Ok(dl_info) => self.perform_download_sequence(&dl_info, &query_id, &metadata, config, &self.tidal).await,
                        Err(e) => Err(e),
                    }
                },
                "Qobuz" => {
                    match self.qobuz.get_download_url(isrc, config.download_quality.clone(), self.progress.clone()).await {
                        Ok(dl_info) => self.perform_download_sequence(&dl_info, isrc, &metadata, config, &self.qobuz).await,
                        Err(e) => Err(e),
                    }
                },
                "Amazon" => {
                    // Only try Amazon if we have a resolved Amazon URL/ASIN
                    if let Some(query) = &resolved.amazon_url {
                        match self.amazon.get_download_url(query, config.download_quality.clone(), self.progress.clone()).await {
                            Ok(dl_info) => self.perform_download_sequence(&dl_info, query, &metadata, config, &self.amazon).await,
                            Err(e) => Err(e),
                        }
                    } else {
                        Err(anyhow!("No se encontró ASIN de Amazon para ISRC {} (Prueba el pivot de Deezer)", isrc))
                    }
                },
                _ => Err(anyhow!("Proveedor desconocido")),
            };

            match result {
                Ok(path) => {
                    let _ = self.provider_priority.record_outcome("spotify", &provider_name, true);
                    return Ok(path);
                },
                Err(e) => {
                    let _ = self.provider_priority.record_outcome("spotify", &provider_name, false);
                    self.progress.log(&format!("  ⚠️ {} falló: {}", provider_name, e));
                    last_error = e;
                    continue; // Skip to next provider
                }
            }
        }

        self.progress.fail_item(&metadata.id, last_error.to_string());
        Err(last_error)
    }

    async fn perform_download_sequence(&self, dl_info: &str, _file_id: &str, metadata: &TrackMetadata, config: &AppConfig, provider: &dyn AudioProvider) -> Result<PathBuf> {
        let mut final_metadata = metadata.clone();
        
        // --- MUSICBRAINZ ENRICHMENT ---
        if config.embed_genre {
            if let Some(isrc) = &final_metadata.isrc {
                self.progress.log(&format!("- [EXTRA] Buscando género en MusicBrainz para ISRC {}...", isrc));
                if let Ok(genre) = self.mb.fetch_genre(isrc, config.use_single_genre).await {
                    self.progress.log(&format!("  ✓ Género encontrado: {}", genre));
                    final_metadata.genre = Some(genre);
                }
            }
        }
        
        // --- PATH GENERATION ---
        let final_ext = match config.download_quality {
            AudioQuality::Low => "mp3",
            _ => "flac",
        };

        let effective_track_number = if config.use_album_track_number {
            final_metadata.track_number
        } else {
            config.position_override.unwrap_or(final_metadata.track_number)
        };

        let target_path = FilenameBuilder::build_full_path(
            config,
            &final_metadata.title,
            &final_metadata.artist,
            &final_metadata.album,
            final_metadata.album_artist.as_deref(),
            final_metadata.date.as_deref(),
            final_metadata.isrc.as_deref(),
            effective_track_number,
            final_metadata.disc_number,
            final_ext,
        );
        
        // Final suffix logic (duplicates)
        let final_path = FilenameBuilder::resolve_path(&target_path, config.redownload_with_suffix);
        let final_dir = final_path.parent().unwrap_or(Path::new("."));

        self.progress.log(&format!("  ✓ Destino: {}", final_path.to_string_lossy()));

        // --- DUPLICATE CHECK (Enhanced Scan) ---
        if !config.redownload_with_suffix {
            if let Some(existing_file) = crate::utils::scanner::AudioScanner::find_audio_file(&PathBuf::from(&config.output_dir), &final_metadata.title, &final_metadata.artist) {
                self.progress.log(&format!("✓ El archivo ya existe (Fuzzy Match): {:?}", existing_file));
                self.progress.skip_item(&metadata.id, existing_file.to_string_lossy().to_string());
                return Ok(existing_file);
            }
        }

        self.progress.start_item(&metadata.id);

        // --- DIRECTORY CREATION PARITY ---
        if let Err(e) = tokio::fs::create_dir_all(final_dir).await {
            self.progress.log(&format!("  ⚠️ Error creating output directory: {}", e));
            return Err(anyhow!("Failed to create directory {:?}: {}", final_dir, e));
        }

        // Use Spotify ID for temp filename to avoid illegal characters in URL-based file_id
        let temp_filename = format!("{}.tmp", metadata.id);
        let temp_path = final_dir.join(&temp_filename);

        self.progress.log("- [Paso 5/6] Iniciando descarga...");
        provider.download_track(dl_info, temp_path.to_str().unwrap(), self.progress.clone(), &metadata.id).await?;
        self.progress.log("  ✓ Descarga finalizada.");

        let mut decryption_key = None;
        if dl_info.starts_with("DECRYPT:") {
            let parts: Vec<&str> = dl_info[8..].split(":::").collect();
            if parts.len() > 1 {
                decryption_key = Some(parts[1].to_string());
            }
        }

        // --- CONVERSION ---
        self.progress.log("- [Paso 6/6] Realizando conversión y post-procesamiento...");
        
        if temp_path.extension().and_then(|s| s.to_str()) == Some(final_ext) && decryption_key.is_none() {
            self.progress.log("  ✓ Formato coincide, omitiendo conversión...");
            std::fs::rename(&temp_path, &final_path)?;
        } else if let Some(key) = decryption_key {
            self.progress.log("  🔄 Decodificando con llave DRM...");
            FFmpeg::convert_with_key(temp_path.to_str().unwrap(), final_path.to_str().unwrap(), &key).await?;
        } else {
            self.progress.log(&format!("  🔄 Convirtiendo a {} vía FFmpeg...", final_ext));
            FFmpeg::convert(temp_path.to_str().unwrap(), final_path.to_str().unwrap(), config.download_quality.clone()).await?;
        }
        self.progress.log("  ✓ Conversión finalizada.");
        
        // --- VALIDATION ---
        self.progress.log("  🔍 Validando integridad del archivo...");
        if let Err(e) = crate::utils::validation::DownloadValidator::validate_duration(final_path.to_str().unwrap(), final_metadata.duration_ms) {
            let _ = std::fs::remove_file(&final_path);
            let _ = std::fs::remove_file(&temp_path);
            return Err(anyhow!("Validation failed: {}", e));
        }
        self.progress.log("  ✓ Validación de duración exitosa.");

        let _ = std::fs::remove_file(&temp_path);

        // --- ARTIST ASSETS ---
        if config.download_artist_images {
            let _ = self.assets.download_artist_assets(final_dir, &final_metadata.artist, final_metadata.artist_avatar_url.as_deref(), final_metadata.artist_header_url.as_deref(), final_metadata.artist_gallery_urls.as_deref()).await;
        }

        // --- LYRICS ---
        let mut lyrics_content = None;
        if config.embed_lyrics {
            if let Ok(lyrics_resp) = self.lyrics.fetch_lyrics_all_sources(&final_metadata.title, &final_metadata.artist, Some(&final_metadata.album), Some(final_metadata.duration_ms / 1000)).await {
                let lrc = self.lyrics.convert_to_lrc(&lyrics_resp, &final_metadata.title, &final_metadata.artist);
                
                if config.save_lrc_file {
                    let lrc_path = final_path.with_extension("lrc");
                    let _ = std::fs::write(lrc_path, &lrc);
                }
                lyrics_content = Some(lrc);
            }
        }

        self.progress.log("  🏷️ Incrustando metadatos y letras...");
        Tagger::embed_metadata(&final_path, &final_metadata, lyrics_content.as_deref(), config)?;
        
        if config.embed_cover {
             if let Some(cover_url) = &final_metadata.cover_url {
                 let client = reqwest::Client::new();
                 if let Ok(resp) = client.get(cover_url).send().await {
                     if let Ok(bytes) = resp.bytes().await {
                         let _ = Tagger::embed_cover(&final_path, bytes.to_vec());
                     }
                 }
             }
        }

        // --- SAVE TO HISTORY ---
        if let Some(h) = &self.history {
            let item = HistoryItem {
                id: String::new(),
                spotify_id: final_metadata.id.clone(),
                title: final_metadata.title.clone(),
                artists: final_metadata.artist.clone(),
                album: final_metadata.album.clone(),
                duration_str: crate::utils::metadata_formatter::MetadataFormatter::format_duration(final_metadata.duration_ms / 1000),
                cover_url: final_metadata.cover_url.clone().unwrap_or_default(),
                quality: format!("{:?}", config.download_quality),
                format: final_path.extension().and_then(|s| s.to_str()).unwrap_or("flac").to_uppercase(),
                path: final_path.to_string_lossy().to_string(),
                source: provider.name().to_string(),
                timestamp: 0,
            };
            let _ = h.add_download_item(item);
        }

        if let Ok(meta) = std::fs::metadata(&final_path) {
            self.progress.complete_item(&metadata.id, final_path.to_string_lossy().to_string(), meta.len() as f64 / (1024.0 * 1024.0));
        }

        self.progress.log(&format!("✅ ÉXITO: Archivo listo en {:?}", final_path));
        self.progress.log("===============================================");

        Ok(final_path)
    }
}
