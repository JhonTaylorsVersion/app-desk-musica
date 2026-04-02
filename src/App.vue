<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

type CoverArt = {
  data_url?: string | null;
  mime_type?: string | null;
  description?: string | null;
  picture_type?: string | null;
};

type AudioMetadata = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  album_artist?: string | null;
  genre?: string | null;
  composer?: string | null;
  lyricist?: string | null;
  comment?: string | null;
  lyrics?: string | null;
  track_number?: string | null;
  track_total?: string | null;
  disc_number?: string | null;
  disc_total?: string | null;
  year?: string | null;
  release_date?: string | null;

  duration_seconds?: number | null;
  duration_formatted?: string | null;
  channels?: number | null;
  sample_rate?: number | null;
  bit_depth?: number | null;
  audio_bitrate?: number | null;
  overall_bitrate?: number | null;

  cover_art?: CoverArt | null;
};

type PlaylistTrack = {
  path: string;
  fileName: string;
  extension: string;
};

const playlist = ref<PlaylistTrack[]>([]);
const currentIndex = ref(-1);

const filePath = ref<string | null>(null);
const fileExtension = ref("");
const isPlaying = ref(false);
const isMuted = ref(false);
const isLooping = ref(false);
const audioError = ref("");
const isStopped = ref(false);

const currentTime = ref(0);
const duration = ref(0);
const volume = ref(80);
const playbackRate = ref(1);

const rawFileName = ref("");
const metadata = ref<AudioMetadata | null>(null);

const isDraggingSeek = ref(false);
const seekPreviewTime = ref(0);
const isSeekInFlight = ref(false);
let seekRequestId = 0;

let progressInterval: number | null = null;

const hasTrack = computed(
  () => currentIndex.value >= 0 && currentIndex.value < playlist.value.length,
);

const displayTitle = computed(() => {
  return metadata.value?.title?.trim() || rawFileName.value || "Sin título";
});

const displayArtist = computed(() => {
  return metadata.value?.artist?.trim() || "Artista desconocido";
});

const displayAlbum = computed(() => {
  return metadata.value?.album?.trim() || "Álbum desconocido";
});

const coverUrl = computed(() => {
  return metadata.value?.cover_art?.data_url || null;
});

const trackLabel = computed(() => {
  const n = metadata.value?.track_number?.trim();
  const total = metadata.value?.track_total?.trim();
  if (n && total) return `${n}/${total}`;
  return n || total || "—";
});

const discLabel = computed(() => {
  const n = metadata.value?.disc_number?.trim();
  const total = metadata.value?.disc_total?.trim();
  if (n && total) return `${n}/${total}`;
  return n || total || "—";
});

const visibleCurrentTime = computed(() => {
  return isDraggingSeek.value ? seekPreviewTime.value : currentTime.value;
});

const progressPercentage = computed(() => {
  const total = duration.value || metadata.value?.duration_seconds || 1;
  if (total <= 0) return 0;
  return (visibleCurrentTime.value / total) * 100;
});

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";

  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const stopProgress = () => {
  if (progressInterval !== null) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
};

const syncPositionFromBackend = async () => {
  if (!hasTrack.value || !filePath.value) return;
  if (isDraggingSeek.value || isSeekInFlight.value) return;

  try {
    const pos = await invoke<number>("get_audio_position");
    const max = duration.value || metadata.value?.duration_seconds || 0;

    if (max > 0) {
      // 1. Actualizamos el reloj visual
      currentTime.value = Math.min(Math.max(pos, 0), max);

      // 2. Detectamos si la canción terminó
      // Le damos un pequeño margen de 0.5 segundos para no cortar el final abruptamente
      if (currentTime.value >= max - 0.5 && isPlaying.value) {
        isPlaying.value = false;
        currentTime.value = max;
        stopProgress();

        if (isLooping.value) {
          void loadTrack(currentIndex.value, true, 0);
        } else {
          void playNextTrack(true);
        }
      }
    }
  } catch (error) {
    console.error("Error al sincronizar posición:", error);
  }
};

const startProgress = () => {
  stopProgress();

  progressInterval = window.setInterval(() => {
    if (!isPlaying.value) return;
    void syncPositionFromBackend();
  }, 250);
};

const resetVisualState = () => {
  currentTime.value = 0;
  duration.value = 0;
  isPlaying.value = false;
  audioError.value = "";
  isDraggingSeek.value = false;
  seekPreviewTime.value = 0;
  isSeekInFlight.value = false;
  stopProgress();
};

const setTrackState = (track: PlaylistTrack) => {
  filePath.value = track.path;
  fileExtension.value = track.extension;
  rawFileName.value = track.fileName;
};

const loadTrack = async (index: number, autoplay = true, startAt = 0) => {
  if (index < 0 || index >= playlist.value.length) return;

  const track = playlist.value[index];
  currentIndex.value = index;
  setTrackState(track);

  resetVisualState();
  metadata.value = null;
  isStopped.value = false;

  try {
    metadata.value = await invoke<AudioMetadata>("leer_metadata", {
      path: track.path,
    });
    duration.value = Number(metadata.value?.duration_seconds || 0);
  } catch (error) {
    console.error("Error al leer metadata:", error);
  }

  currentTime.value = Math.max(
    0,
    Math.min(startAt, duration.value || startAt || 0),
  );

  if (!autoplay) return;

  try {
    audioError.value = "";
    await invoke("play_audio_file_at", {
      path: track.path,
      position: currentTime.value,
    });

    await invoke("set_audio_volume", {
      volume: isMuted.value ? 0 : volume.value,
    });

    isPlaying.value = true;
    startProgress();
  } catch (error) {
    console.error("Error al reproducir en Rust:", error);
    isPlaying.value = false;
    audioError.value = "El motor nativo no pudo reproducir este archivo.";
  }
};

const seleccionarArchivo = async () => {
  try {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        {
          name: "Audio",
          extensions: ["mp3", "flac", "wav", "ogg", "m4a", "aac"],
        },
      ],
    });

    if (!selected) return;

    const selectedPaths = Array.isArray(selected) ? selected : [selected];
    if (!selectedPaths.length) return;

    await invoke("stop_audio_backend");

    playlist.value = selectedPaths.map((path) => {
      const fileName = path.split(/[/\\]/).pop() || "Archivo de audio";
      const extension = fileName.includes(".")
        ? fileName.split(".").pop()?.toLowerCase() || ""
        : "";

      return {
        path,
        fileName,
        extension,
      };
    });

    await loadTrack(0, true, 0);
  } catch (error) {
    console.error("Error al seleccionar archivo:", error);
  }
};

const togglePlay = async () => {
  if (!hasTrack.value || !filePath.value) return;

  try {
    audioError.value = "";

    if (isPlaying.value) {
      await invoke("pause_audio");
      isPlaying.value = false;
      stopProgress();
      return;
    }

    if (isStopped.value || currentTime.value >= (duration.value || 0)) {
      await loadTrack(currentIndex.value, true, 0);
      return;
    }

    await invoke("resume_audio");
    isPlaying.value = true;
    startProgress();
  } catch (error) {
    console.error("Error al cambiar estado de reproducción:", error);
  }
};

const stopAudio = async () => {
  if (!filePath.value) return;

  try {
    await invoke("stop_audio_backend");
    isPlaying.value = false;
    isStopped.value = true;
    currentTime.value = 0;
    stopProgress();
  } catch (error) {
    console.error("Error al detener audio:", error);
  }
};

const seekTo = async (newTime: number) => {
  if (!filePath.value || isSeekInFlight.value) return;

  const max = duration.value || metadata.value?.duration_seconds || 0;
  const safeTime = Math.min(Math.max(newTime, 0), max);
  const requestId = ++seekRequestId;

  isSeekInFlight.value = true;

  try {
    await invoke("seek_audio", { position: safeTime });

    if (requestId !== seekRequestId) return;

    currentTime.value = safeTime;

    if (isPlaying.value) {
      startProgress();
    }
  } catch (error) {
    console.error("Error al intentar saltar en el audio:", error);
  } finally {
    if (requestId === seekRequestId) {
      isSeekInFlight.value = false;
    }
  }
};

const onSeekStart = () => {
  if (!filePath.value) return;
  isDraggingSeek.value = true;
  stopProgress();
};

const onSeekInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const value = Number(target.value);

  if (!isDraggingSeek.value) {
    isDraggingSeek.value = true;
    stopProgress();
  }

  seekPreviewTime.value = value;
};

const onSeekCommit = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const value = Number(target.value);

  isDraggingSeek.value = false;
  seekPreviewTime.value = value;

  await seekTo(value);
};

const playPreviousTrack = async () => {
  if (!hasTrack.value) return;

  if (currentTime.value > 10) {
    await loadTrack(currentIndex.value, true, 0);
    return;
  }

  if (currentIndex.value > 0) {
    await loadTrack(currentIndex.value - 1, true, 0);
    return;
  }

  await loadTrack(currentIndex.value, true, 0);
};

const playNextTrack = async (fromAutoEnd = false) => {
  if (!hasTrack.value) return;

  const nextIndex = currentIndex.value + 1;

  if (nextIndex < playlist.value.length) {
    await loadTrack(nextIndex, true, 0);
    return;
  }

  if (isLooping.value || fromAutoEnd) {
    await loadTrack(currentIndex.value, true, 0);
    return;
  }

  isPlaying.value = false;
  isStopped.value = true;
  currentTime.value = 0;
  stopProgress();
};

const onVolumeChange = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const nextVolume = Number(target.value);

  volume.value = nextVolume;

  if (nextVolume === 0) {
    isMuted.value = true;
  } else if (isMuted.value) {
    isMuted.value = false;
  }

  await invoke("set_audio_volume", { volume: nextVolume });
};

const toggleMute = async () => {
  isMuted.value = !isMuted.value;

  if (isMuted.value) {
    await invoke("set_audio_volume", { volume: 0 });
  } else {
    await invoke("set_audio_volume", { volume: volume.value });
  }
};

const onPlaybackRateChange = (e: Event) => {
  const target = e.target as HTMLSelectElement;
  playbackRate.value = Number(target.value);
};

const toggleLoop = () => {
  isLooping.value = !isLooping.value;
};

onBeforeUnmount(() => {
  stopProgress();
  invoke("stop_audio_backend").catch(console.error);
});
</script>

<template>
  <div class="app">
    <div class="dynamic-bg" v-if="coverUrl">
      <img :src="coverUrl" alt="" />
    </div>

    <div class="player-shell glass-panel">
      <div class="topbar">
        <div>
          <div class="eyebrow">APP DESK MÚSICA</div>
          <h1>Reproductor local</h1>
        </div>

        <button
          class="file-picker glass-button"
          type="button"
          @click="seleccionarArchivo"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="margin-right: 8px"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Seleccionar canción
        </button>
      </div>

      <div v-if="filePath" class="player-layout">
        <div class="left-panel">
          <div class="cover-container">
            <template v-if="coverUrl">
              <img
                :src="coverUrl"
                alt="Carátula"
                class="cover-image glass-shadow"
              />
            </template>
            <template v-else>
              <div class="cover-placeholder glass-shadow">♪</div>
            </template>
          </div>

          <div class="song-main">
            <div class="song-title">{{ displayTitle }}</div>
            <div class="song-subtitle">
              {{ displayArtist }} &bull; {{ displayAlbum }}
            </div>
          </div>

          <div class="progress-card glass-panel-inner">
            <input
              class="progress-slider"
              type="range"
              min="0"
              :max="duration || metadata?.duration_seconds || 0"
              :value="visibleCurrentTime"
              step="0.1"
              @mousedown="onSeekStart"
              @touchstart="onSeekStart"
              @input="onSeekInput"
              @change="onSeekCommit"
              :style="{ backgroundSize: `${progressPercentage}% 100%` }"
            />
            <div class="time-row">
              <span>{{ formatTime(visibleCurrentTime) }}</span>
              <span>{{
                formatTime(duration || metadata?.duration_seconds || 0)
              }}</span>
            </div>
          </div>

          <div class="transport">
            <button
              class="control-btn icon-btn"
              type="button"
              @click="playPreviousTrack"
              title="Anterior"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polygon points="11 19 2 12 11 5 11 19"></polygon>
                <polygon points="22 19 13 12 22 5 22 19"></polygon>
              </svg>
            </button>

            <button
              class="control-btn play-main glass-shadow"
              type="button"
              @click="togglePlay"
            >
              <svg
                v-if="isPlaying"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
              <svg
                v-else
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>

            <button
              class="control-btn icon-btn"
              type="button"
              @click="playNextTrack()"
              title="Siguiente"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polygon points="13 19 22 12 13 5 13 19"></polygon>
                <polygon points="2 19 11 12 2 5 2 19"></polygon>
              </svg>
            </button>

            <button
              class="control-btn icon-btn"
              type="button"
              @click="stopAudio"
              title="Detener"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
            </button>
          </div>

          <div class="extra-controls glass-panel-inner">
            <div class="volume-block">
              <button
                class="control-btn small icon-btn-muted"
                type="button"
                @click="toggleMute"
              >
                <span v-if="isMuted">🔇</span>
                <span v-else>🔊</span>
              </button>

              <input
                class="volume-slider"
                type="range"
                min="0"
                max="100"
                :value="volume"
                @input="onVolumeChange"
                :style="{ backgroundSize: `${volume}% 100%` }"
              />

              <span class="mini-value">{{ volume }}%</span>
            </div>

            <div class="right-extras">
              <button
                class="control-btn small text-btn"
                :class="{ active: isLooping }"
                type="button"
                @click="toggleLoop"
              >
                🔁
              </button>

              <select
                class="rate-select"
                :value="playbackRate"
                @change="onPlaybackRateChange"
              >
                <option :value="0.5">0.5x</option>
                <option :value="0.75">0.75x</option>
                <option :value="1">1x</option>
                <option :value="1.25">1.25x</option>
                <option :value="1.5">1.5x</option>
                <option :value="2">2x</option>
              </select>
            </div>
          </div>

          <div v-if="audioError" class="error-box glass-panel-inner">
            {{ audioError }}
          </div>
        </div>

        <div class="right-panel">
          <div class="meta-card glass-panel-inner">
            <div class="meta-card-title">Propiedades del Archivo</div>

            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">Título</span>
                <span class="meta-value">{{ metadata?.title || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Artista</span>
                <span class="meta-value">{{ metadata?.artist || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Álbum</span>
                <span class="meta-value">{{ metadata?.album || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Artista del álbum</span>
                <span class="meta-value">{{
                  metadata?.album_artist || "—"
                }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Género</span>
                <span class="meta-value">{{ metadata?.genre || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Compositor</span>
                <span class="meta-value">{{ metadata?.composer || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Track</span>
                <span class="meta-value">{{ trackLabel }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Disco</span>
                <span class="meta-value">{{ discLabel }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Año</span>
                <span class="meta-value">{{ metadata?.year || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Duración</span>
                <span class="meta-value">{{
                  metadata?.duration_formatted || formatTime(duration)
                }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Bitrate de Audio</span>
                <span class="meta-value">{{
                  metadata?.audio_bitrate
                    ? `${metadata.audio_bitrate} kbps`
                    : "—"
                }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Formato</span>
                <span class="meta-value uppercase">{{
                  fileExtension || "—"
                }}</span>
              </div>
            </div>
          </div>

          <div class="meta-card glass-panel-inner lyrics-card">
            <div class="meta-card-title">Letra de la canción</div>
            <pre class="lyrics-block">{{
              metadata?.lyrics ||
              "No se encontraron letras embebidas en este archivo."
            }}</pre>
          </div>
        </div>
      </div>

      <div v-else class="empty-state glass-panel-inner">
        <div class="empty-icon">🎧</div>
        <div class="empty-title">Tu música, a tu manera</div>
        <div class="empty-subtitle">
          Selecciona un archivo MP3, FLAC, WAV, OGG, M4A o AAC para empezar
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.app {
  position: relative;
  min-height: 100vh;
  background-color: #0f1115;
  color: #ffffff;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
    sans-serif;
  padding: 32px;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.dynamic-bg {
  position: absolute;
  top: -10%;
  left: -10%;
  width: 120%;
  height: 120%;
  z-index: 0;
  filter: blur(100px) saturate(200%);
  opacity: 0.45;
  pointer-events: none;
  animation: pulseBg 10s infinite alternate ease-in-out;
}

.dynamic-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@keyframes pulseBg {
  0% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.05);
  }
}

.glass-panel {
  background: rgba(20, 24, 32, 0.65);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}

.glass-panel-inner {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
}

.player-shell {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1100px;
  border-radius: 24px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.topbar h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.5px;
}

.glass-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 20px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  backdrop-filter: blur(10px);
}

.glass-button:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

.player-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 32px;
  align-items: start;
}

.left-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
  text-align: center;
}

.right-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cover-container {
  width: 100%;
  max-width: 320px;
  aspect-ratio: 1 / 1;
  position: relative;
  margin-bottom: 8px;
}

.cover-image,
.cover-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  object-fit: cover;
}

.cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 80px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.05) 0%,
    rgba(255, 255, 255, 0.01) 100%
  );
  color: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.glass-shadow {
  box-shadow:
    0 20px 40px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.05);
}

.song-main {
  width: 100%;
}

.song-title {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.2;
  margin-bottom: 6px;
  letter-spacing: -0.5px;
}

.song-subtitle {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
}

.transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  width: 100%;
}

.control-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  color: #ffffff;
  transform: scale(1.1);
}

.play-main {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #ffffff;
  color: #000000;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.play-main:hover {
  transform: scale(1.05);
  background: #f0f0f0;
  box-shadow: 0 10px 25px rgba(255, 255, 255, 0.2);
}

.play-main:active {
  transform: scale(0.95);
}

.progress-card {
  width: 100%;
  padding: 16px 20px;
}

.time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  background: rgba(255, 255, 255, 0.2);
  background-image: linear-gradient(#ffffff, #ffffff);
  background-size: 0% 100%;
  background-repeat: no-repeat;
  border-radius: 2px;
  height: 4px;
  outline: none;
  margin: 0;
  cursor: pointer;
  transition: height 0.2s ease;
}

input[type="range"]:hover {
  height: 6px;
}

input[type="range"]::-webkit-slider-runnable-track {
  width: 100%;
  height: 100%;
  cursor: pointer;
  background: transparent;
  border: none;
}

input[type="range"]::-webkit-slider-thumb {
  height: 12px;
  width: 12px;
  border-radius: 50%;
  background: #ffffff;
  cursor: pointer;
  -webkit-appearance: none;
  margin-top: -3px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
  opacity: 0;
  transition:
    opacity 0.2s ease,
    transform 0.1s ease;
}

input[type="range"]:hover::-webkit-slider-thumb {
  opacity: 1;
  transform: scale(1.2);
}

.extra-controls {
  width: 100%;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.volume-block {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.icon-btn-muted {
  font-size: 16px;
  opacity: 0.7;
}

.icon-btn-muted:hover {
  opacity: 1;
}

.mini-value {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  width: 32px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.right-extras {
  display: flex;
  align-items: center;
  gap: 12px;
}

.text-btn {
  font-size: 16px;
  opacity: 0.5;
}

.text-btn.active {
  opacity: 1;
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.5));
}

.rate-select {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
  outline: none;
  cursor: pointer;
  backdrop-filter: blur(5px);
}

.rate-select option {
  background: #1a1e24;
  color: white;
}

.meta-card {
  padding: 24px;
}

.meta-card-title {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 12px;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.meta-value {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
  word-break: break-word;
}

.uppercase {
  text-transform: uppercase;
}

.lyrics-card {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.lyrics-block {
  margin: 0;
  flex: 1;
  max-height: 300px;
  overflow-y: auto;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.8);
  white-space: pre-wrap;
  padding-right: 12px;
}

.lyrics-block::-webkit-scrollbar {
  width: 6px;
}
.lyrics-block::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 3px;
}
.lyrics-block::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}
.lyrics-block::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.empty-state {
  min-height: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.01);
}

.empty-icon {
  font-size: 72px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
}

.empty-subtitle {
  color: rgba(255, 255, 255, 0.5);
  font-size: 15px;
}

.error-box {
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  width: 100%;
}

@media (max-width: 900px) {
  .player-layout {
    grid-template-columns: 1fr;
  }

  .left-panel {
    max-width: 400px;
    margin: 0 auto;
  }

  .app {
    padding: 16px;
  }
}
</style>
