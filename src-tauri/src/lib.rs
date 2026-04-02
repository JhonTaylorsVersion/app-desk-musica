use base64::{engine::general_purpose, Engine as _};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::prelude::Accessor;
use lofty::read_from_path;
use lofty::tag::{ItemKey, Tag};
use serde::Serialize;

use std::sync::{Arc, Mutex};
use tauri::State;

// === NUEVAS DEPENDENCIAS PRO ===
use crossbeam_channel::{bounded, unbounded, Receiver, Sender};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

// ==========================================
// 1. ESTRUCTURAS DE METADATOS (Intactas)
// ==========================================

#[derive(Serialize, Clone)]
struct CoverArt {
    data_url: Option<String>,
    mime_type: Option<String>,
    description: Option<String>,
    picture_type: Option<String>,
}

#[derive(Serialize, Clone)]
struct AudioMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    album_artist: Option<String>,
    genre: Option<String>,
    composer: Option<String>,
    lyricist: Option<String>,
    comment: Option<String>,
    lyrics: Option<String>,
    track_number: Option<String>,
    track_total: Option<String>,
    disc_number: Option<String>,
    disc_total: Option<String>,
    year: Option<String>,
    release_date: Option<String>,

    duration_seconds: Option<u64>,
    duration_formatted: Option<String>,
    channels: Option<u8>,
    sample_rate: Option<u32>,
    bit_depth: Option<u8>,
    audio_bitrate: Option<u32>,
    overall_bitrate: Option<u32>,

    cover_art: Option<CoverArt>,
}

// ==========================================
// 2. NUEVO SISTEMA DE MENSAJES Y ESTADO
// ==========================================

// Este es el "idioma" con el que Tauri habla con el hilo de audio
pub enum AudioCommand {
    Play(String, f64), // Ruta y posición de inicio
    Pause,
    Resume,
    Stop,
    Seek(f64),         // Segundo exacto
    SetVolume(f32),    // 0.0 a 100.0
}

struct AudioPlayerState {
    // Transmisor para enviar comandos al hilo de fondo
    tx: Sender<AudioCommand>,
    // Posición actual compartida (para que la UI la lea rapidísimo sin bloquear)
    current_position_secs: Arc<Mutex<f64>>,
}

// ==========================================
// 3. FUNCIONES DE AYUDA PARA METADATOS (Intactas)
// ==========================================

fn non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim().to_string();
        if trimmed.is_empty() { None } else { Some(trimmed) }
    })
}

fn format_duration(total_seconds: u64) -> String {
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;

    if hours > 0 {
        format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
    } else {
        format!("{:02}:{:02}", minutes, seconds)
    }
}

fn build_tag_list<'a>(tagged_file: &'a lofty::file::TaggedFile) -> Vec<&'a Tag> {
    let mut tags: Vec<&Tag> = Vec::new();
    if let Some(primary) = tagged_file.primary_tag() { tags.push(primary); }
    for tag in tagged_file.tags() {
        if !tags.iter().any(|t| t.tag_type() == tag.tag_type()) { tags.push(tag); }
    }
    tags
}

fn first_text<F>(tags: &[&Tag], getter: F) -> Option<String>
where
    F: Fn(&Tag) -> Option<String>,
{
    for tag in tags {
        if let Some(value) = getter(tag) {
            if !value.trim().is_empty() { return Some(value.trim().to_string()); }
        }
    }
    None
}

fn extract_cover_art(tags: &[&Tag]) -> Option<CoverArt> {
    for tag in tags {
        if let Some(pic) = tag.get_picture_type(PictureType::CoverFront) {
            let mime = pic.mime_type().map(|m| format!("{:?}", m).to_lowercase());
            let mime_for_url = mime.clone().unwrap_or_else(|| "image/jpeg".to_string());
            let data_base64 = general_purpose::STANDARD.encode(pic.data());
            let data_url = format!("data:{};base64,{}", mime_for_url, data_base64);

            return Some(CoverArt {
                data_url: Some(data_url),
                mime_type: mime,
                description: pic.description().map(|s| s.to_string()),
                picture_type: Some("CoverFront".to_string()),
            });
        }
        if let Some(pic) = tag.pictures().first() {
            let mime = pic.mime_type().map(|m| format!("{:?}", m).to_lowercase());
            let mime_for_url = mime.clone().unwrap_or_else(|| "image/jpeg".to_string());
            let data_base64 = general_purpose::STANDARD.encode(pic.data());
            let data_url = format!("data:{};base64,{}", mime_for_url, data_base64);

            return Some(CoverArt {
                data_url: Some(data_url),
                mime_type: mime,
                description: pic.description().map(|s| s.to_string()),
                picture_type: Some(format!("{:?}", pic.pic_type())),
            });
        }
    }
    None
}

#[tauri::command]
fn leer_metadata(path: String) -> Result<AudioMetadata, String> {
    let tagged_file = read_from_path(path).map_err(|e| e.to_string())?;
    let tags = build_tag_list(&tagged_file);

    let properties = tagged_file.properties();
    let duration = properties.duration();
    let duration_seconds = duration.as_secs();

    let metadata = AudioMetadata {
        title: first_text(&tags, |tag| tag.title().map(|s| s.to_string())),
        artist: first_text(&tags, |tag| tag.artist().map(|s| s.to_string())),
        album: first_text(&tags, |tag| tag.album().map(|s| s.to_string())),
        genre: first_text(&tags, |tag| tag.genre().map(|s| s.to_string())),
        album_artist: non_empty(first_text(&tags, |tag| tag.get_string(ItemKey::AlbumArtist).map(|s| s.to_string()))),
        composer: non_empty(first_text(&tags, |tag| tag.get_string(ItemKey::Composer).map(|s| s.to_string()))),
        lyricist: non_empty(first_text(&tags, |tag| tag.get_string(ItemKey::Lyricist).map(|s| s.to_string()))),
        comment: non_empty(first_text(&tags, |tag| tag.get_string(ItemKey::Comment).map(|s| s.to_string()))),
        lyrics: non_empty(first_text(&tags, |tag| tag.get_string(ItemKey::Lyrics).or_else(|| tag.get_string(ItemKey::UnsyncLyrics)).map(|s| s.to_string()))),
        track_number: non_empty(first_text(&tags, |tag| tag.get_string(ItemKey::TrackNumber).map(|s| s.to_string()))),
        track_total: non_empty(first_text(&tags, |tag| tag.get_string(ItemKey::TrackTotal).map(|s| s.to_string()))),
        disc_number: non_empty(first_text(&tags, |tag| tag.get_string(ItemKey::DiscNumber).map(|s| s.to_string()))),
        disc_total: non_empty(first_text(&tags, |tag| tag.get_string(ItemKey::DiscTotal).map(|s| s.to_string()))),
        year: non_empty(first_text(&tags, |tag| tag.get_string(ItemKey::Year).map(|s| s.to_string()))),
        release_date: non_empty(first_text(&tags, |tag| tag.get_string(ItemKey::ReleaseDate).map(|s| s.to_string()))),
        duration_seconds: Some(duration_seconds),
        duration_formatted: Some(format_duration(duration_seconds)),
        channels: properties.channels(),
        sample_rate: properties.sample_rate(),
        bit_depth: properties.bit_depth(),
        audio_bitrate: properties.audio_bitrate(),
        overall_bitrate: properties.overall_bitrate(),
        cover_art: extract_cover_art(&tags),
    };
    Ok(metadata)
}

// ==========================================
// 4. NUEVOS COMANDOS DE TAURI (Súper rápidos)
// ==========================================

#[tauri::command]
fn play_audio_file(path: String, state: State<'_, AudioPlayerState>) -> Result<(), String> {
    state.tx.send(AudioCommand::Play(path, 0.0)).map_err(|_| "Error de comunicación con el hilo de audio".into())
}

#[tauri::command]
fn play_audio_file_at(path: String, position: f64, state: State<'_, AudioPlayerState>) -> Result<(), String> {
    state.tx.send(AudioCommand::Play(path, position)).map_err(|_| "Error de comunicación".into())
}

#[tauri::command]
fn pause_audio(state: State<'_, AudioPlayerState>) {
    let _ = state.tx.send(AudioCommand::Pause);
}

#[tauri::command]
fn resume_audio(state: State<'_, AudioPlayerState>) {
    let _ = state.tx.send(AudioCommand::Resume);
}

#[tauri::command]
fn stop_audio_backend(state: State<'_, AudioPlayerState>) {
    let _ = state.tx.send(AudioCommand::Stop);
    if let Ok(mut pos) = state.current_position_secs.lock() { *pos = 0.0; }
}

#[tauri::command]
fn seek_audio(position: f64, state: State<'_, AudioPlayerState>) -> Result<(), String> {
    state.tx.send(AudioCommand::Seek(position)).map_err(|_| "Error al hacer seek".into())
}

#[tauri::command]
fn get_audio_position(state: State<'_, AudioPlayerState>) -> f64 {
    *state.current_position_secs.lock().unwrap_or_else(|e| e.into_inner())
}

#[tauri::command]
fn set_audio_volume(volume: f32, state: State<'_, AudioPlayerState>) {
    let _ = state.tx.send(AudioCommand::SetVolume(volume));
}

// ==========================================
// 5. MOTOR DE AUDIO (SYMPHONIA + CPAL)
// ==========================================

fn start_audio_thread(rx: Receiver<AudioCommand>, position_state: Arc<Mutex<f64>>) {
    std::thread::spawn(move || {
        // Inicializar CPAL (Tarjeta de sonido)
        let host = cpal::default_host();
        let device = host.default_output_device().expect("No se encontró dispositivo de salida de audio");
        let config = device.default_output_config().expect("No se pudo obtener la config de audio");
        
        let sample_rate = config.sample_rate().0;

        // BÚFER REDUCIDO: 8192 muestras. Esto evita cuelgues y mantiene una latencia 
        // de apenas ~90ms, haciendo que el seek sea casi instantáneo.
        let (sample_tx, sample_rx) = bounded::<f32>(8192); 
        
        let err_fn = |err| eprintln!("Un error ocurrió en el hilo de reproducción CPAL: {}", err);

        // Construir y arrancar el stream de salida de la tarjeta de sonido
        let stream = match config.sample_format() {
            SampleFormat::F32 => device.build_output_stream(
                &config.into(),
                move |data: &mut [f32], _| {
                    for sample in data.iter_mut() {
                        *sample = sample_rx.try_recv().unwrap_or(0.0);
                    }
                },
                err_fn,
                None,
            ).unwrap(),
            // Soporte genérico para otros formatos si F32 no es el default
            _ => device.build_output_stream(
                &config.into(),
                move |data: &mut [i16], _| {
                    for sample in data.iter_mut() {
                        let f32_sample = sample_rx.try_recv().unwrap_or(0.0);
                        *sample = cpal::Sample::from_sample(f32_sample);
                    }
                },
                err_fn,
                None,
            ).unwrap(),
        };

        stream.play().unwrap();

        // Variables de estado del decodificador
        let mut format: Option<Box<dyn FormatReader>> = None;
        let mut decoder: Option<Box<dyn symphonia::core::codecs::Decoder>> = None;
        let mut track_id = 0;
        let mut sample_buf: Option<SampleBuffer<f32>> = None;
        
        let mut is_playing = false;
        let mut volume = 1.0f32;

        // Bucle infinito que procesa comandos y decodifica
        loop {
            // 1. Revisar si hay nuevos comandos de Tauri
            let command_result = if is_playing { rx.try_recv() } else { rx.recv().map_err(|_| crossbeam_channel::TryRecvError::Disconnected) };

            if let Ok(command) = command_result {
                match command {
                    AudioCommand::Play(path, pos) => {
                        let src = std::fs::File::open(&path).expect("No se pudo abrir el archivo");
                        let mss = MediaSourceStream::new(Box::new(src), Default::default());
                        
                        let hint = Hint::new();
                        let probed = symphonia::default::get_probe()
                            .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
                            .expect("Formato de audio no soportado");

                        let mut new_format = probed.format;
                        let track = new_format.tracks().iter().find(|t| t.codec_params.codec != CODEC_TYPE_NULL).expect("No se encontró pista de audio");
                        track_id = track.id;

                        let new_decoder = symphonia::default::get_codecs()
    .make(&track.codec_params, &DecoderOptions::default())
    .expect("Codec no soportado");

                        // Si hay posición inicial, hacer Seek instantáneo
                        if pos > 0.0 {
                            let seek_time = SeekTo::Time { time: std::time::Duration::from_secs_f64(pos).into(), track_id: Some(track_id) };
                            let _ = new_format.seek(SeekMode::Accurate, seek_time);
                        }

                        format = Some(new_format);
                        decoder = Some(new_decoder);
                        is_playing = true;
                    },
                    AudioCommand::Pause => is_playing = false,
                    AudioCommand::Resume => if format.is_some() { is_playing = true; },
                    AudioCommand::Stop => {
                        is_playing = false;
                        format = None;
                        decoder = None;
                    },
                    AudioCommand::SetVolume(v) => volume = v.clamp(0.0, 100.0) / 100.0,
                    AudioCommand::Seek(pos) => {
                        if let Some(fmt) = format.as_mut() {
                            let seek_time = SeekTo::Time { time: std::time::Duration::from_secs_f64(pos).into(), track_id: Some(track_id) };
                            if let Ok(res) = fmt.seek(SeekMode::Accurate, seek_time) {
                                // Actualizar el reloj de la UI instantáneamente
                                if let Ok(mut state_pos) = position_state.lock() {
                                    *state_pos = res.actual_ts as f64 / sample_rate as f64; // Cálculo aproximado
                                }
                            }
                        }
                    }
                }
            }

            // 2. Si está reproduciendo, decodificar el siguiente paquete y enviarlo a CPAL
            if is_playing {
                if let (Some(fmt), Some(dec)) = (format.as_mut(), decoder.as_mut()) {
                    match fmt.next_packet() {
                        Ok(packet) => {
                            match dec.decode(&packet) {
                                Ok(decoded) => {
                                    if sample_buf.is_none() {
                                        sample_buf = Some(SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec()));
                                    }
                                    
                                    if let Some(buf) = sample_buf.as_mut() {
                                        buf.copy_interleaved_ref(decoded);
                                        
                                        // Enviar cada sample a CPAL con el volumen aplicado
                                        for &sample in buf.samples() {
                                            let _ = sample_tx.send(sample * volume);
                                        }

                                        // Actualizar el tiempo para la UI en Vue
                                        let current_ts = packet.ts();
                                        if let Ok(mut state_pos) = position_state.lock() {
                                            let tb = fmt.tracks().iter().find(|t| t.id == track_id).unwrap().codec_params.time_base.unwrap();
                                            let time = tb.calc_time(current_ts);
                                            *state_pos = time.seconds as f64 + time.frac;
                                        }
                                    }
                                }
                                Err(SymphoniaError::DecodeError(e)) => eprintln!("Error decodificando: {}", e),
                                Err(_) => { is_playing = false; }
                            }
                        }
                        Err(SymphoniaError::IoError(_)) => {
                            // Fin del archivo
                            is_playing = false;
                        }
                        Err(e) => {
                            eprintln!("Error leyendo paquete: {}", e);
                            is_playing = false;
                        }
                    }
                }
            }
        }
    });
}

// ==========================================
// 6. INICIALIZACIÓN DE TAURI
// ==========================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (tx, rx) = unbounded::<AudioCommand>();
    let position_state = Arc::new(Mutex::new(0.0));

    // Arrancar el motor de audio en segundo plano
    start_audio_thread(rx, Arc::clone(&position_state));

    let player_state = AudioPlayerState {
        tx,
        current_position_secs: position_state,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(player_state)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            leer_metadata,
            play_audio_file,
            play_audio_file_at,
            pause_audio,
            resume_audio,
            stop_audio_backend,
            seek_audio,
            get_audio_position,
            set_audio_volume
        ])
        .run(tauri::generate_context!())
        .expect("Error al iniciar la aplicación Tauri");
}