<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  nextTick,
} from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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
  synced_lyrics?: string | null;
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

type LibraryTrackMetadata = {
  title: string;
  artist: string;
  album: string;
  duration_seconds: number;
  duration_formatted: string;
  cover_art: CoverArt | null;
};

const libraryMetadataMap = ref<Record<string, LibraryTrackMetadata>>({});
const loadingLibraryMetadata = ref(false);

type ParsedLyric = {
  time: number;
  text: string;
};

type PlaybackSource = "library" | "queue";

const playlist = ref<PlaylistTrack[]>([]);
const queue = ref<PlaylistTrack[]>([]);

const currentIndex = ref(-1);
const currentQueueIndex = ref(-1);
const currentSource = ref<PlaybackSource>("library");

const hoveredLibraryTrackPath = ref<string | null>(null);

const isLibraryTrackHovered = (track: PlaylistTrack) => {
  return hoveredLibraryTrackPath.value === track.path;
};

const isLibraryTrackCurrent = (track: PlaylistTrack) => {
  return currentSource.value === "library" && filePath.value === track.path;
};

const shouldShowLibraryEqualizer = (track: PlaylistTrack) => {
  return (
    isLibraryTrackCurrent(track) &&
    isPlaying.value &&
    !isLibraryTrackHovered(track)
  );
};

const shouldShowLibraryPauseIcon = (track: PlaylistTrack) => {
  return (
    isLibraryTrackCurrent(track) &&
    isPlaying.value &&
    isLibraryTrackHovered(track)
  );
};

const shouldShowLibraryPlayIcon = (track: PlaylistTrack) => {
  if (!isLibraryTrackHovered(track)) return false;

  // Hover sobre la actual en pausa => play
  if (isLibraryTrackCurrent(track) && !isPlaying.value) return true;

  // Hover sobre una que no es la actual => play
  if (!isLibraryTrackCurrent(track)) return true;

  return false;
};

const shouldShowLibraryIndexNumber = (track: PlaylistTrack) => {
  // Activa reproduciendo sin hover => equalizer
  if (shouldShowLibraryEqualizer(track)) return false;

  // Hover sobre cualquier fila => icono
  if (shouldShowLibraryPlayIcon(track) || shouldShowLibraryPauseIcon(track)) {
    return false;
  }

  return true;
};

const filePath = ref<string | null>(null);
const fileExtension = ref("");
const isPlaying = ref(false);
const isMuted = ref(false);
const isLooping = ref(false);
const audioError = ref("");
const isStopped = ref(false);

const currentTime = ref(0);
const duration = ref(0);
const volume = ref(10);
const playbackRate = ref(1);

const rawFileName = ref("");
const metadata = ref<AudioMetadata | null>(null);

const isDraggingSeek = ref(false);
const seekPreviewTime = ref(0);
const isSeekInFlight = ref(false);
let seekRequestId = 0;

let progressInterval: number | null = null;

const musicDirectories = ref<string[]>([]);
let unlistenFsChanges: UnlistenFn | null = null;

// ====== BIBLIOTECA / BÚSQUEDA / PANEL ======
const librarySearch = ref("");
const queueSearch = ref("");
const isQueuePanelOpen = ref(true);

// ====== ESTADO Y LÓGICA PARA LETRAS ======
const isLyricsMode = ref(false);
const parsedLyrics = ref<ParsedLyric[]>([]);
const lyricsContainerRef = ref<HTMLElement | null>(null);
const isUserScrolling = ref(false);
const activeLyricsTab = ref<"synced" | "static">("synced");

const hasSynced = computed(() => parsedLyrics.value.length > 0);

const hasStatic = computed(() => {
  if (!metadata.value?.lyrics) return false;

  if (
    !metadata.value?.synced_lyrics &&
    /\[\d{2}:\d{2}\.\d{2,3}\]/.test(metadata.value.lyrics)
  ) {
    return false;
  }

  return metadata.value.lyrics.trim().length > 0;
});

const hasBothLyrics = computed(() => hasSynced.value && hasStatic.value);

const currentLyricsView = computed(() => {
  if (hasBothLyrics.value) return activeLyricsTab.value;
  if (hasSynced.value) return "synced";
  if (hasStatic.value) return "static";
  return "none";
});

watch(currentLyricsView, async (newView) => {
  if (newView === "synced" && !isUserScrolling.value) {
    await nextTick();
    syncLyricsView();
  }
});

const activePlaybackList = computed(() => {
  return currentSource.value === "queue" ? queue.value : playlist.value;
});

const activePlaybackIndex = computed(() => {
  return currentSource.value === "queue"
    ? currentQueueIndex.value
    : currentIndex.value;
});

const hasTrack = computed(() => {
  const idx = activePlaybackIndex.value;
  const list = activePlaybackList.value;
  return idx >= 0 && idx < list.length;
});

const normalizedLibrarySearch = computed(() =>
  librarySearch.value.trim().toLowerCase(),
);

const filteredPlaylist = computed(() => {
  if (!normalizedLibrarySearch.value) return playlist.value;

  return playlist.value.filter((track) => {
    const base =
      `${track.fileName} ${track.extension} ${track.path}`.toLowerCase();
    return base.includes(normalizedLibrarySearch.value);
  });
});

const normalizedQueueSearch = computed(() =>
  queueSearch.value.trim().toLowerCase(),
);

const filteredQueue = computed(() => {
  if (!normalizedQueueSearch.value) return queue.value;

  return queue.value.filter((track) => {
    const base =
      `${track.fileName} ${track.extension} ${track.path}`.toLowerCase();
    return base.includes(normalizedQueueSearch.value);
  });
});

const onUserInteraction = () => {
  if (currentLyricsView.value === "synced" && parsedLyrics.value.length > 0) {
    isUserScrolling.value = true;
  }
};

const syncLyricsView = async () => {
  isUserScrolling.value = false;

  if (activeLyricIndex.value !== -1 && lyricsContainerRef.value) {
    await nextTick();
    const activeEl = lyricsContainerRef.value.querySelector(
      `.lyric-line[data-index="${activeLyricIndex.value}"]`,
    );
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
};

const seekAndSync = async (time: number) => {
  isUserScrolling.value = false;
  await seekTo(time);
};

const parseLrc = (lrcContent: string): ParsedLyric[] => {
  const lines = lrcContent.split("\n");
  const result: ParsedLyric[] = [];
  const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  for (const line of lines) {
    const match = timeReg.exec(line);
    if (match) {
      const mins = parseInt(match[1]);
      const secs = parseInt(match[2]);
      const ms =
        match[3].length === 2 ? parseInt(match[3]) * 10 : parseInt(match[3]);
      const time = mins * 60 + secs + ms / 1000;
      const text = line.replace(timeReg, "").trim();

      if (text) {
        result.push({ time, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
};

const syncLibrary = async () => {
  if (musicDirectories.value.length === 0) {
    playlist.value = [];
    return;
  }

  try {
    const tracks: PlaylistTrack[] = await invoke("scan_directories", {
      directories: musicDirectories.value,
    });

    playlist.value = tracks;

    // limpiar metadata de archivos que ya no existen
    const validPaths = new Set(tracks.map((t) => t.path));
    libraryMetadataMap.value = Object.fromEntries(
      Object.entries(libraryMetadataMap.value).filter(([path]) =>
        validPaths.has(path),
      ),
    );

    void preloadLibraryMetadata(tracks);

    if (
      !isPlaying.value &&
      playlist.value.length > 0 &&
      currentIndex.value === -1 &&
      currentQueueIndex.value === -1
    ) {
      await loadTrack({
        source: "library",
        index: 0,
        autoplay: false,
        startAt: 0,
      });
    }
  } catch (error) {
    console.error("Error al sincronizar la biblioteca:", error);
  }
};

const añadirRutaMusica = async () => {
  try {
    const selected = await open({
      multiple: true,
      directory: true,
    });

    if (!selected) return;

    const selectedPaths = Array.isArray(selected) ? selected : [selected];
    if (!selectedPaths.length) return;

    selectedPaths.forEach((path) => {
      if (!musicDirectories.value.includes(path)) {
        musicDirectories.value.push(path);
      }
    });

    await syncLibrary();
    await invoke("watch_directories", { directories: musicDirectories.value });
  } catch (error) {
    console.error("Error al seleccionar carpeta:", error);
  }
};

const activeLyricIndex = computed(() => {
  if (!parsedLyrics.value.length) return -1;

  const time = visibleCurrentTime.value;
  for (let i = parsedLyrics.value.length - 1; i >= 0; i--) {
    if (time >= parsedLyrics.value[i].time - 0.3) {
      return i;
    }
  }

  return -1;
});

watch(activeLyricIndex, async (newIdx) => {
  if (
    newIdx !== -1 &&
    isLyricsMode.value &&
    currentLyricsView.value === "synced" &&
    lyricsContainerRef.value &&
    !isUserScrolling.value
  ) {
    await nextTick();
    const activeEl = lyricsContainerRef.value.querySelector(
      `.lyric-line[data-index="${newIdx}"]`,
    );
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
});

const toggleLyricsMode = async () => {
  isLyricsMode.value = !isLyricsMode.value;
  isUserScrolling.value = false;

  if (isLyricsMode.value) {
    if (hasBothLyrics.value) {
      activeLyricsTab.value = "synced";
    }

    if (
      currentLyricsView.value === "synced" &&
      activeLyricIndex.value !== -1 &&
      lyricsContainerRef.value
    ) {
      await nextTick();
      setTimeout(() => {
        const activeEl = lyricsContainerRef.value?.querySelector(
          `.lyric-line[data-index="${activeLyricIndex.value}"]`,
        );
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: "auto", block: "center" });
        }
      }, 50);
    }
  }
};

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

const currentQueueTrackPath = computed(() => {
  if (
    currentQueueIndex.value < 0 ||
    currentQueueIndex.value >= queue.value.length
  ) {
    return null;
  }
  return queue.value[currentQueueIndex.value]?.path ?? null;
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

const getTrackDisplayTitle = (track: PlaylistTrack) => {
  return track.fileName || "Sin nombre";
};

const getLibraryTrackMetadata = (track: PlaylistTrack) => {
  return libraryMetadataMap.value[track.path] ?? null;
};

const getLibraryTrackArtist = (track: PlaylistTrack) => {
  return getLibraryTrackMetadata(track)?.artist || "Artista desconocido";
};

const getLibraryTrackAlbum = (track: PlaylistTrack) => {
  return getLibraryTrackMetadata(track)?.album || "—";
};

const getLibraryTrackDuration = (track: PlaylistTrack) => {
  return getLibraryTrackMetadata(track)?.duration_formatted || "—";
};

const getLibraryTrackCover = (track: PlaylistTrack) => {
  return getLibraryTrackMetadata(track)?.cover_art?.data_url || null;
};

const preloadLibraryMetadata = async (tracks: PlaylistTrack[]) => {
  if (!tracks.length) return;

  loadingLibraryMetadata.value = true;

  try {
    const batchSize = 8;

    for (let i = 0; i < tracks.length; i += batchSize) {
      const batch = tracks.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (track) => {
          if (libraryMetadataMap.value[track.path]) return;

          try {
            const data = await invoke<AudioMetadata>("leer_metadata", {
              path: track.path,
            });

            libraryMetadataMap.value = {
              ...libraryMetadataMap.value,
              [track.path]: {
                title: data?.title?.trim() || track.fileName || "Sin título",
                artist: data?.artist?.trim() || "Artista desconocido",
                album: data?.album?.trim() || "—",
                duration_seconds: Number(data?.duration_seconds || 0),
                duration_formatted:
                  data?.duration_formatted ||
                  formatTime(Number(data?.duration_seconds || 0)),
                cover_art: data?.cover_art || null,
              },
            };
          } catch (error) {
            console.error(
              `Error cargando metadata de ${track.fileName}:`,
              error,
            );

            libraryMetadataMap.value = {
              ...libraryMetadataMap.value,
              [track.path]: {
                title: track.fileName || "Sin título",
                artist: "Artista desconocido",
                album: "—",
                duration_seconds: 0,
                duration_formatted: "—",
                cover_art: null,
              },
            };
          }
        }),
      );
    }
  } finally {
    loadingLibraryMetadata.value = false;
  }
};

const isLibraryTrackActive = (track: PlaylistTrack) => {
  return currentSource.value === "library" && filePath.value === track.path;
};

const isQueueTrackActive = (track: PlaylistTrack, realIndex: number) => {
  return (
    currentSource.value === "queue" &&
    filePath.value === track.path &&
    currentQueueIndex.value === realIndex
  );
};

const getRealQueueIndex = (track: PlaylistTrack) => {
  return queue.value.findIndex(
    (item, index) => item.path === track.path && index >= 0,
  );
};

const stopProgress = () => {
  if (progressInterval !== null) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
};

const syncPositionFromBackend = async () => {
  if (!filePath.value) return;
  if (isDraggingSeek.value || isSeekInFlight.value) return;

  try {
    const pos = await invoke<number>("get_audio_position");
    const max = duration.value || metadata.value?.duration_seconds || 0;

    if (max > 0) {
      currentTime.value = Math.min(Math.max(pos, 0), max);

      if (currentTime.value >= max - 0.5 && isPlaying.value) {
        isPlaying.value = false;
        currentTime.value = max;
        stopProgress();

        if (isLooping.value) {
          await loadTrack({
            source: currentSource.value,
            index: activePlaybackIndex.value,
            autoplay: true,
            startAt: 0,
          });
        } else {
          await playNextTrack(true);
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
  }, 100);
};

const resetVisualState = () => {
  currentTime.value = 0;
  duration.value = 0;
  isPlaying.value = false;
  audioError.value = "";
  isDraggingSeek.value = false;
  seekPreviewTime.value = 0;
  isSeekInFlight.value = false;
  parsedLyrics.value = [];
  isUserScrolling.value = false;
  stopProgress();
};

const setTrackState = (track: PlaylistTrack) => {
  filePath.value = track.path;
  fileExtension.value = track.extension;
  rawFileName.value = track.fileName;
};

const loadTrack = async ({
  source,
  index,
  autoplay = true,
  startAt = 0,
}: {
  source: PlaybackSource;
  index: number;
  autoplay?: boolean;
  startAt?: number;
}) => {
  const list = source === "queue" ? queue.value : playlist.value;
  if (index < 0 || index >= list.length) return;

  const track = list[index];

  currentSource.value = source;
  if (source === "queue") {
    currentQueueIndex.value = index;
  } else {
    currentIndex.value = index;
  }

  setTrackState(track);
  resetVisualState();
  metadata.value = null;
  isStopped.value = false;

  try {
    metadata.value = await invoke<AudioMetadata>("leer_metadata", {
      path: track.path,
    });

    duration.value = Number(metadata.value?.duration_seconds || 0);

    if (metadata.value?.synced_lyrics) {
      parsedLyrics.value = parseLrc(metadata.value.synced_lyrics);
    } else if (
      metadata.value?.lyrics &&
      /\[\d{2}:\d{2}\.\d{2,3}\]/.test(metadata.value.lyrics)
    ) {
      parsedLyrics.value = parseLrc(metadata.value.lyrics);
    }
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

const playTrackFromLibrary = async (track: PlaylistTrack) => {
  const realIndex = playlist.value.findIndex(
    (item) => item.path === track.path,
  );
  if (realIndex === -1) return;

  await loadTrack({
    source: "library",
    index: realIndex,
    autoplay: true,
    startAt: 0,
  });
};

const toggleLibraryTrackPlayback = async (track: PlaylistTrack) => {
  const realIndex = playlist.value.findIndex(
    (item) => item.path === track.path,
  );
  if (realIndex === -1) return;

  const isCurrentLibraryTrack =
    currentSource.value === "library" && filePath.value === track.path;

  if (isCurrentLibraryTrack) {
    await togglePlay();
    return;
  }

  await loadTrack({
    source: "library",
    index: realIndex,
    autoplay: true,
    startAt: 0,
  });
};

const playTrackFromQueue = async (queueIndex: number) => {
  if (queueIndex < 0 || queueIndex >= queue.value.length) return;

  await loadTrack({
    source: "queue",
    index: queueIndex,
    autoplay: true,
    startAt: 0,
  });
};

const addToQueue = (track: PlaylistTrack) => {
  queue.value.push({ ...track });
  isQueuePanelOpen.value = true;
};

const addAllFilteredToQueue = () => {
  filteredPlaylist.value.forEach((track) => {
    queue.value.push({ ...track });
  });
  isQueuePanelOpen.value = true;
};

const removeFromQueue = (queueIndex: number) => {
  if (queueIndex < 0 || queueIndex >= queue.value.length) return;

  const removingCurrent =
    currentSource.value === "queue" && currentQueueIndex.value === queueIndex;

  queue.value.splice(queueIndex, 1);

  if (currentSource.value === "queue") {
    if (removingCurrent) {
      if (queue.value.length === 0) {
        currentQueueIndex.value = -1;
      } else if (queueIndex >= queue.value.length) {
        currentQueueIndex.value = queue.value.length - 1;
      }
    } else if (currentQueueIndex.value > queueIndex) {
      currentQueueIndex.value -= 1;
    }
  }
};

const clearQueue = () => {
  queue.value = [];
  if (currentSource.value === "queue") {
    currentQueueIndex.value = -1;
  }
};

const togglePlay = async () => {
  if (!filePath.value) return;

  try {
    audioError.value = "";

    if (isPlaying.value) {
      await invoke("pause_audio");
      isPlaying.value = false;
      stopProgress();
      return;
    }

    if (isStopped.value || currentTime.value >= (duration.value || 0)) {
      if (currentSource.value === "queue" && currentQueueIndex.value >= 0) {
        await loadTrack({
          source: "queue",
          index: currentQueueIndex.value,
          autoplay: true,
          startAt: 0,
        });
      } else if (currentIndex.value >= 0) {
        await loadTrack({
          source: "library",
          index: currentIndex.value,
          autoplay: true,
          startAt: 0,
        });
      }
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
  if (!filePath.value) return;

  if (currentTime.value > 10) {
    await loadTrack({
      source: currentSource.value,
      index: activePlaybackIndex.value,
      autoplay: true,
      startAt: 0,
    });
    return;
  }

  if (currentSource.value === "queue") {
    if (currentQueueIndex.value > 0) {
      await loadTrack({
        source: "queue",
        index: currentQueueIndex.value - 1,
        autoplay: true,
        startAt: 0,
      });
      return;
    }

    await loadTrack({
      source: "queue",
      index: Math.max(currentQueueIndex.value, 0),
      autoplay: true,
      startAt: 0,
    });
    return;
  }

  if (currentIndex.value > 0) {
    await loadTrack({
      source: "library",
      index: currentIndex.value - 1,
      autoplay: true,
      startAt: 0,
    });
    return;
  }

  await loadTrack({
    source: "library",
    index: Math.max(currentIndex.value, 0),
    autoplay: true,
    startAt: 0,
  });
};

const playNextTrack = async (fromAutoEnd = false) => {
  if (!filePath.value) return;

  if (currentSource.value === "queue") {
    const nextQueueIndex = currentQueueIndex.value + 1;

    if (nextQueueIndex < queue.value.length) {
      await loadTrack({
        source: "queue",
        index: nextQueueIndex,
        autoplay: true,
        startAt: 0,
      });
      return;
    }

    if (isLooping.value) {
      await loadTrack({
        source: "queue",
        index: 0,
        autoplay: true,
        startAt: 0,
      });
      return;
    }

    if (fromAutoEnd) {
      isPlaying.value = false;
      isStopped.value = true;
      currentTime.value = 0;
      stopProgress();
      return;
    }
  }

  if (queue.value.length > 0 && currentSource.value !== "queue") {
    await loadTrack({
      source: "queue",
      index: 0,
      autoplay: true,
      startAt: 0,
    });
    return;
  }

  const nextLibraryIndex = currentIndex.value + 1;

  if (nextLibraryIndex < playlist.value.length) {
    await loadTrack({
      source: "library",
      index: nextLibraryIndex,
      autoplay: true,
      startAt: 0,
    });
    return;
  }

  if (isLooping.value && playlist.value.length > 0) {
    await loadTrack({
      source: "library",
      index: 0,
      autoplay: true,
      startAt: 0,
    });
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

onMounted(async () => {
  unlistenFsChanges = await listen("library-updated", () => {
    console.log("Detectado cambio en la carpeta, actualizando canciones...");
    void syncLibrary();
  });
});

onBeforeUnmount(() => {
  stopProgress();
  invoke("stop_audio_backend").catch(console.error);

  if (unlistenFsChanges) {
    unlistenFsChanges();
    unlistenFsChanges = null;
  }
});
</script>

<template>
  <div class="app">
    <div class="dynamic-bg" v-if="coverUrl">
      <img :src="coverUrl" alt="" />
    </div>

    <div
      class="player-shell glass-panel"
      :class="{ 'full-lyrics-shell': isLyricsMode }"
    >
      <div class="topbar">
        <div>
          <div class="eyebrow">APP DESK MÚSICA</div>
          <h1>Reproductor local</h1>
        </div>

        <div class="topbar-actions">
          <button
            class="file-picker glass-button"
            type="button"
            @click="añadirRutaMusica"
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
              <path
                d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              ></path>
            </svg>
            Añadir Ruta(s)
          </button>

          <button
            class="glass-button secondary-button"
            type="button"
            @click="isQueuePanelOpen = !isQueuePanelOpen"
          >
            {{ isQueuePanelOpen ? "Ocultar fila" : "Mostrar fila" }}
          </button>
        </div>
      </div>

      <div v-if="!isLyricsMode" class="main-layout">
        <!-- IZQUIERDA: REPRODUCTOR -->
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

          <div class="playing-source-badge glass-panel-inner">
            <span>
              Reproduciendo desde:
              <strong>{{
                currentSource === "queue"
                  ? "Fila de reproducción"
                  : "Biblioteca"
              }}</strong>
            </span>
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
                class="control-btn small text-btn mic-btn"
                :class="{ active: hasSynced || hasStatic }"
                type="button"
                @click="toggleLyricsMode"
                title="Modo Letras"
              >
                🎤
              </button>

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

        <!-- CENTRO: BIBLIOTECA -->
        <div class="library-panel glass-panel-inner">
          <div class="panel-header">
            <div>
              <div class="panel-title">Biblioteca</div>
              <div class="panel-subtitle">
                {{ filteredPlaylist.length }} de {{ playlist.length }} canciones
              </div>
            </div>

            <button
              class="small-action-btn"
              type="button"
              @click="addAllFilteredToQueue"
              :disabled="filteredPlaylist.length === 0"
            >
              Añadir visibles a la fila
            </button>
          </div>

          <div class="search-row">
            <input
              v-model="librarySearch"
              type="text"
              class="search-input"
              placeholder="Buscar en toda la biblioteca..."
            />
          </div>

          <div v-if="playlist.length === 0" class="library-empty">
            <div class="empty-icon small">🎼</div>
            <div class="empty-title small-title">No hay canciones cargadas</div>
            <div class="empty-subtitle">
              Añade una o varias carpetas de música para construir tu
              biblioteca.
            </div>
          </div>

          <div v-else class="tracks-list spotify-list">
            <div class="library-table-head">
              <div class="col-index">#</div>
              <div class="col-title">Título</div>
              <div class="col-album">Álbum</div>
              <div class="col-added">Agregado</div>
              <div class="col-time">⏱</div>
            </div>

            <div
              v-for="(track, index) in filteredPlaylist"
              :key="track.path"
              class="track-row spotify-row"
              :class="{
                active: isLibraryTrackActive(track),
                hovered: isLibraryTrackHovered(track),
                playing: isLibraryTrackCurrent(track) && isPlaying,
                paused: isLibraryTrackCurrent(track) && !isPlaying,
              }"
              @mouseenter="hoveredLibraryTrackPath = track.path"
              @mouseleave="hoveredLibraryTrackPath = null"
              @dblclick="playTrackFromLibrary(track)"
            >
              <div
                class="col-index row-index interactive-index"
                @click.stop="toggleLibraryTrackPlayback(track)"
              >
                <span
                  v-if="shouldShowLibraryIndexNumber(track)"
                  class="row-index-number"
                >
                  {{ index + 1 }}
                </span>

                <span
                  v-else-if="shouldShowLibraryPlayIcon(track)"
                  class="row-index-icon"
                  aria-label="Reproducir"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <polygon points="7,5 19,12 7,19"></polygon>
                  </svg>
                </span>

                <span
                  v-else-if="shouldShowLibraryPauseIcon(track)"
                  class="row-index-icon"
                  aria-label="Pausar"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="6" y="5" width="4" height="14"></rect>
                    <rect x="14" y="5" width="4" height="14"></rect>
                  </svg>
                </span>

                <span
                  v-else-if="shouldShowLibraryEqualizer(track)"
                  class="row-equalizer"
                  aria-label="Reproduciendo"
                >
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>

              <div
                class="col-title row-title-wrap"
                @click="playTrackFromLibrary(track)"
              >
                <div class="row-cover">
                  <img
                    v-if="getLibraryTrackCover(track)"
                    :src="getLibraryTrackCover(track)!"
                    alt="cover"
                  />
                  <div v-else class="row-cover-placeholder">♪</div>
                </div>

                <div class="row-title-meta">
                  <div class="track-name spotify-track-name">
                    {{ getTrackDisplayTitle(track) }}
                  </div>
                  <div class="track-path spotify-track-subtitle">
                    {{ track.extension.toUpperCase() }} •
                    {{ getLibraryTrackArtist(track) }}
                  </div>
                </div>
              </div>

              <div class="col-album row-album">
                {{ getLibraryTrackAlbum(track) }}
              </div>

              <div class="col-added row-added">Local</div>

              <div class="col-time row-time-actions">
                <span class="row-duration">{{
                  getLibraryTrackDuration(track)
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- DERECHA: FILA + METADATA -->
        <div v-if="isQueuePanelOpen" class="right-panel">
          <div class="queue-panel glass-panel-inner">
            <div class="panel-header">
              <div>
                <div class="panel-title">Fila de reproducción</div>
                <div class="panel-subtitle">{{ queue.length }} elemento(s)</div>
              </div>

              <button
                class="small-action-btn danger"
                type="button"
                @click="clearQueue"
                :disabled="queue.length === 0"
              >
                Limpiar
              </button>
            </div>

            <div class="search-row">
              <input
                v-model="queueSearch"
                type="text"
                class="search-input"
                placeholder="Buscar en la fila..."
              />
            </div>

            <div v-if="queue.length === 0" class="queue-empty">
              <div class="empty-icon small">🧾</div>
              <div class="empty-title small-title">La fila está vacía</div>
              <div class="empty-subtitle">
                Añade canciones desde la biblioteca para verlas aquí.
              </div>
            </div>

            <div v-else class="queue-list">
              <div
                v-for="track in filteredQueue"
                :key="`${track.path}-${getRealQueueIndex(track)}`"
                class="queue-row"
                :class="{
                  active: isQueueTrackActive(track, getRealQueueIndex(track)),
                }"
              >
                <div
                  class="track-main-info"
                  @click="playTrackFromQueue(getRealQueueIndex(track))"
                >
                  <div class="track-name">
                    {{ getTrackDisplayTitle(track) }}
                  </div>
                  <div class="track-path">
                    {{ track.extension.toUpperCase() }}
                  </div>
                </div>

                <div class="track-actions">
                  <button
                    class="row-btn"
                    type="button"
                    @click.stop="playTrackFromQueue(getRealQueueIndex(track))"
                  >
                    ▶
                  </button>
                  <button
                    class="row-btn remove"
                    type="button"
                    @click.stop="removeFromQueue(getRealQueueIndex(track))"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="filePath" class="meta-card glass-panel-inner">
            <div class="meta-card-title">Propiedades del Archivo</div>

            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">Título</span
                ><span class="meta-value">{{ metadata?.title || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Artista</span
                ><span class="meta-value">{{ metadata?.artist || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Álbum</span
                ><span class="meta-value">{{ metadata?.album || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Artista del álbum</span
                ><span class="meta-value">{{
                  metadata?.album_artist || "—"
                }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Género</span
                ><span class="meta-value">{{ metadata?.genre || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Compositor</span
                ><span class="meta-value">{{ metadata?.composer || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Track</span
                ><span class="meta-value">{{ trackLabel }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Disco</span
                ><span class="meta-value">{{ discLabel }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Año</span
                ><span class="meta-value">{{ metadata?.year || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Duración</span
                ><span class="meta-value">{{
                  metadata?.duration_formatted || formatTime(duration)
                }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Bitrate</span
                ><span class="meta-value">{{
                  metadata?.audio_bitrate
                    ? `${metadata.audio_bitrate} kbps`
                    : "—"
                }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Formato</span
                ><span class="meta-value uppercase">{{
                  fileExtension || "—"
                }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Sample rate</span
                ><span class="meta-value">{{
                  metadata?.sample_rate ? `${metadata.sample_rate} Hz` : "—"
                }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Bit depth</span
                ><span class="meta-value">{{
                  metadata?.bit_depth ? `${metadata.bit_depth} bits` : "—"
                }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Canales</span
                ><span class="meta-value">{{ metadata?.channels || "—" }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="collapsed-side">
          <div v-if="filePath" class="meta-card glass-panel-inner">
            <div class="meta-card-title">Propiedades del Archivo</div>

            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">Título</span
                ><span class="meta-value">{{ metadata?.title || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Artista</span
                ><span class="meta-value">{{ metadata?.artist || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Álbum</span
                ><span class="meta-value">{{ metadata?.album || "—" }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Duración</span
                ><span class="meta-value">{{
                  metadata?.duration_formatted || formatTime(duration)
                }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Formato</span
                ><span class="meta-value uppercase">{{
                  fileExtension || "—"
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- MODO LETRAS -->
      <div
        v-else-if="filePath && isLyricsMode"
        class="lyrics-layout"
        style="position: relative"
      >
        <div v-if="hasBothLyrics" class="lyrics-tabs-container">
          <div class="lyrics-tabs glass-panel-inner">
            <button
              class="tab-btn"
              :class="{ active: activeLyricsTab === 'synced' }"
              @click="activeLyricsTab = 'synced'"
            >
              Letra Sincronizada
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeLyricsTab === 'static' }"
              @click="activeLyricsTab = 'static'"
            >
              Letra Embebida
            </button>
          </div>
        </div>

        <button
          v-if="isUserScrolling && currentLyricsView === 'synced'"
          class="sync-fab glass-button glass-shadow"
          @click="syncLyricsView"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
            <path d="M21 3v5h-5"></path>
          </svg>
          Sincronizar
        </button>

        <div
          v-show="currentLyricsView === 'synced'"
          class="synced-lyrics-container"
          ref="lyricsContainerRef"
          @wheel="onUserInteraction"
          @touchmove="onUserInteraction"
          @mousedown="onUserInteraction"
        >
          <div
            v-for="(line, index) in parsedLyrics"
            :key="index"
            :data-index="index"
            class="lyric-line"
            :class="{
              active: activeLyricIndex === index,
              passed: activeLyricIndex > index,
            }"
            @click="seekAndSync(line.time)"
          >
            {{ line.text }}
          </div>
        </div>

        <div
          v-show="currentLyricsView === 'static'"
          class="static-lyrics-container"
        >
          <pre class="static-lyrics-text">{{ metadata?.lyrics }}</pre>
        </div>

        <div
          v-show="currentLyricsView === 'none'"
          class="synced-lyrics-container"
        >
          <div class="no-lyrics-msg">
            <div class="sad-mic">🎤</div>
            No hay letra sincronizada ni embebida para esta canción.
          </div>
        </div>

        <div class="bottom-mini-player glass-panel-inner">
          <div class="mini-info">
            <img v-if="coverUrl" :src="coverUrl" class="mini-cover" />
            <div v-else class="mini-cover-placeholder">♪</div>
            <div class="mini-text">
              <div class="song-title mini-title">{{ displayTitle }}</div>
              <div class="song-subtitle mini-subtitle">{{ displayArtist }}</div>
            </div>
          </div>

          <div class="mini-center">
            <div class="transport mini-transport">
              <button class="control-btn icon-btn" @click="playPreviousTrack">
                <svg
                  width="20"
                  height="20"
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
                class="control-btn play-main mini-play"
                @click="togglePlay"
              >
                <svg
                  v-if="isPlaying"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                <svg
                  v-else
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
              <button class="control-btn icon-btn" @click="playNextTrack()">
                <svg
                  width="20"
                  height="20"
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
            </div>

            <div class="mini-progress">
              <span class="mini-time">{{
                formatTime(visibleCurrentTime)
              }}</span>
              <input
                class="progress-slider"
                type="range"
                min="0"
                :max="duration || 0"
                :value="visibleCurrentTime"
                step="0.1"
                @mousedown="onSeekStart"
                @touchstart="onSeekStart"
                @input="onSeekInput"
                @change="onSeekCommit"
                :style="{ backgroundSize: `${progressPercentage}% 100%` }"
              />
              <span class="mini-time">{{ formatTime(duration) }}</span>
            </div>
          </div>

          <div class="mini-actions">
            <button
              class="control-btn small text-btn mic-btn is-active"
              @click="toggleLyricsMode"
              title="Volver a vista normal"
            >
              🎤
            </button>
            <button
              class="control-btn small icon-btn-muted"
              @click="toggleMute"
            >
              <span v-if="isMuted">🔇</span><span v-else>🔊</span>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="empty-state glass-panel-inner">
        <div class="empty-icon">🎧</div>
        <div class="empty-title">Tu música, a tu manera</div>
        <div class="empty-subtitle">
          Añade una o varias carpetas para ver toda tu biblioteca, buscar y
          crear tu fila de reproducción.
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
  padding: 24px;
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
  max-width: 1600px;
  height: 88vh;
  border-radius: 24px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: hidden;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
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
  transition: all 0.25s ease;
  backdrop-filter: blur(10px);
}

.glass-button:hover {
  background: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}

.secondary-button {
  background: rgba(255, 255, 255, 0.05);
}

.main-layout {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr) 360px;
  gap: 20px;
  align-items: stretch;
  overflow: hidden;
}

.left-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  text-align: center;
  min-height: 0;
}

.library-panel,
.queue-panel,
.meta-card,
.collapsed-side {
  min-height: 0;
}

.right-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.collapsed-side {
  display: flex;
  flex-direction: column;
}

.cover-container {
  width: 100%;
  max-width: 320px;
  aspect-ratio: 1 / 1;
  position: relative;
}

.cover-image,
.cover-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 14px;
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

.playing-source-badge {
  width: 100%;
  padding: 10px 14px;
  text-align: center;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
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
  transition: all 0.2s ease;
}

.play-main:hover {
  transform: scale(1.04);
  background: #f0f0f0;
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
  border-radius: 999px;
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
  transform: scale(1.15);
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
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.4));
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

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-title {
  font-size: 16px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.95);
}

.panel-subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 4px;
}

.small-action-btn {
  border: none;
  outline: none;
  border-radius: 10px;
  padding: 9px 12px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  transition: background 0.2s ease;
}

.small-action-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}

.small-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.small-action-btn.danger {
  background: rgba(239, 68, 68, 0.15);
}

.small-action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.22);
}

.search-row {
  margin-bottom: 14px;
}

.search-input {
  width: 100%;
  height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.06);
  color: white;
  padding: 0 14px;
  outline: none;
  font-size: 14px;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.library-panel,
.queue-panel {
  padding: 18px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.queue-panel {
  flex: 1 1 55%;
  min-height: 0;
}

.tracks-list,
.queue-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.tracks-list::-webkit-scrollbar,
.queue-list::-webkit-scrollbar,
.synced-lyrics-container::-webkit-scrollbar,
.static-lyrics-container::-webkit-scrollbar {
  width: 8px;
}

.tracks-list::-webkit-scrollbar-thumb,
.queue-list::-webkit-scrollbar-thumb,
.synced-lyrics-container::-webkit-scrollbar-thumb,
.static-lyrics-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.14);
  border-radius: 999px;
}

.track-row,
.queue-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: 14px;
  margin-bottom: 10px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.track-row:hover,
.queue-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.track-row.active,
.queue-row.active {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
}

.track-main-info {
  min-width: 0;
  cursor: pointer;
}

.track-name {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-path {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.52);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-btn {
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  min-width: 42px;
}

.row-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}

.row-btn.remove {
  background: rgba(239, 68, 68, 0.14);
}

.row-btn.remove:hover {
  background: rgba(239, 68, 68, 0.22);
}

.library-empty,
.queue-empty {
  flex: 1;
  min-height: 220px;
  border-radius: 16px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 18px;
  flex-direction: column;
}

.meta-card {
  padding: 20px;
  min-height: 0;
  overflow-y: auto;
}

.meta-card {
  flex: 1 1 45%;
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
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
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

.empty-icon.small {
  font-size: 40px;
  margin-bottom: 10px;
}

.empty-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
}

.empty-title.small-title {
  font-size: 16px;
}

.empty-subtitle {
  color: rgba(255, 255, 255, 0.5);
  font-size: 15px;
  line-height: 1.5;
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

.mic-btn {
  font-size: 18px;
  opacity: 0.4;
  transition: all 0.3s ease;
}

.mic-btn.active {
  opacity: 1;
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8));
}

.mic-btn.is-active {
  opacity: 1;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 4px;
}

.full-lyrics-shell {
  height: 90vh;
  display: flex;
  flex-direction: column;
}

.lyrics-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: hidden;
}

.lyrics-tabs-container {
  display: flex;
  justify-content: center;
  margin-top: 10px;
  margin-bottom: -10px;
  z-index: 5;
}

.lyrics-tabs {
  display: flex;
  padding: 6px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.2);
  gap: 4px;
}

.tab-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  padding: 8px 24px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.tab-btn:hover {
  color: rgba(255, 255, 255, 0.8);
}

.tab-btn.active {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.synced-lyrics-container {
  flex: 1;
  overflow-y: auto;
  padding: 40px 20px 100px 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  text-align: center;
  scroll-behavior: smooth;
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 15%,
    black 85%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 15%,
    black 85%,
    transparent 100%
  );
}

.static-lyrics-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 5%,
    black 95%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 5%,
    black 95%,
    transparent 100%
  );
}

.static-lyrics-text {
  font-family: inherit;
  font-size: 18px;
  line-height: 2;
  color: rgba(255, 255, 255, 0.7);
  white-space: pre-wrap;
  text-align: center;
  max-width: 800px;
  margin: auto;
  padding: 40px 0;
}

.lyric-line {
  font-size: 28px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.25);
  transition: all 0.4s ease;
  transform-origin: center;
  cursor: pointer;
}

.lyric-line:hover {
  color: rgba(255, 255, 255, 0.5);
}

.lyric-line.passed {
  color: rgba(255, 255, 255, 0.6);
}

.lyric-line.active {
  color: #ffffff;
  font-size: 34px;
  transform: scale(1.05);
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.4);
}

.no-lyrics-msg {
  margin: auto;
  font-size: 20px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
}

.sad-mic {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.bottom-mini-player {
  display: grid;
  grid-template-columns: 250px 1fr 100px;
  align-items: center;
  padding: 12px 24px;
  border-radius: 16px;
  gap: 20px;
}

.mini-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.mini-cover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
}

.mini-cover-placeholder {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.mini-title {
  font-size: 16px;
  margin-bottom: 2px;
}

.mini-subtitle {
  font-size: 13px;
}

.mini-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.mini-transport {
  gap: 16px;
}

.mini-play {
  width: 44px;
  height: 44px;
}

.mini-progress {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 500px;
  gap: 12px;
}

.mini-time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-variant-numeric: tabular-nums;
}

.mini-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.sync-fab {
  position: absolute;
  bottom: 120px;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: fit-content;
  z-index: 10;
  padding: 10px 20px;
  border-radius: 30px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  letter-spacing: 0.5px;
  animation: fadeInFab 0.3s ease;
}

@keyframes fadeInFab {
  from {
    opacity: 0;
    transform: translateY(15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1400px) {
  .main-layout {
    grid-template-columns: 330px minmax(0, 1fr) 320px;
  }
}

@media (max-width: 1180px) {
  .main-layout {
    grid-template-columns: 1fr;
  }

  .left-panel {
    max-width: 460px;
    margin: 0 auto;
  }

  .library-panel,
  .queue-panel,
  .meta-card {
    min-height: 320px;
  }
}

@media (max-width: 900px) {
  .app {
    padding: 14px;
  }

  .player-shell {
    padding: 16px;
    height: auto;
    min-height: auto;
  }

  .bottom-mini-player {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    text-align: center;
  }

  .mini-info {
    justify-content: center;
  }

  .mini-actions {
    position: static;
    justify-content: center;
  }

  .lyric-line {
    font-size: 20px;
  }

  .lyric-line.active {
    font-size: 24px;
  }
}

.spotify-list {
  padding-top: 0;
  position: relative;
}

.library-table-head {
  position: sticky;
  top: 0;
  z-index: 20;

  display: grid;
  grid-template-columns: 44px minmax(0, 1.8fr) minmax(120px, 1fr) 160px 90px;
  align-items: center;
  gap: 16px;

  padding: 12px 12px 14px;
  margin-bottom: 10px; /* 👈 separación con la primera fila */

  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.65);
  font-size: 13px;
  font-weight: 600;

  background: rgba(20, 24, 32, 0.92);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
.spotify-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1.8fr) minmax(120px, 1fr) 160px 90px;
  gap: 16px;
  align-items: center;
  min-height: 72px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 10px;
  background: transparent;
  border: none;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.18s ease;
}

.spotify-row:hover {
  background: rgba(255, 255, 255, 0.08);
}

.spotify-row.active {
  background: rgba(255, 255, 255, 0.09);
}

.spotify-row.playing .spotify-track-name,
.spotify-row.paused .spotify-track-name {
  color: #1ed760;
}

.spotify-row.playing .row-index-number,
.spotify-row.paused .row-index-number {
  color: #1ed760;
}

.col-index,
.col-title,
.col-album,
.col-added,
.col-time {
  min-width: 0;
}

.row-index {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.85);
  font-variant-numeric: tabular-nums;
}

.interactive-index {
  height: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
}

.row-index-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.78);
  transition: color 0.2s ease;
}

.row-index-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  line-height: 1;
}

.spotify-row.playing .row-equalizer {
  color: #1ed760;
}

.row-equalizer {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
}

.row-equalizer span {
  width: 3px;
  border-radius: 999px;
  background: currentColor;
  animation: libraryEqualizer 0.9s ease-in-out infinite;
  transform-origin: bottom;
}

.row-equalizer span:nth-child(1) {
  height: 8px;
  animation-delay: 0s;
}

.row-equalizer span:nth-child(2) {
  height: 14px;
  animation-delay: 0.15s;
}

.row-equalizer span:nth-child(3) {
  height: 10px;
  animation-delay: 0.3s;
}

.row-equalizer span:nth-child(4) {
  height: 16px;
  animation-delay: 0.45s;
}

@keyframes libraryEqualizer {
  0%,
  100% {
    transform: scaleY(0.45);
    opacity: 0.7;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}

.row-title-wrap {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  cursor: pointer;
}

.row-cover {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}

.row-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.row-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: rgba(255, 255, 255, 0.6);
}

.row-title-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.spotify-track-name {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s ease;
}

.spotify-track-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-album,
.row-added {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-time-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.row-duration {
  min-width: 44px;
  text-align: right;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
  font-variant-numeric: tabular-nums;
}

.spotify-inline-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: white;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.spotify-inline-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  transform: scale(1.05);
}
@media (max-width: 1200px) {
  .library-table-head,
  .spotify-row {
    grid-template-columns: 40px minmax(0, 1.8fr) minmax(0, 1fr) 90px;
  }

  .col-added,
  .row-added {
    display: none;
  }
}

@media (max-width: 900px) {
  .library-table-head,
  .spotify-row {
    grid-template-columns: 36px minmax(0, 1fr) 80px;
    gap: 12px;
  }

  .col-album,
  .row-album {
    display: none;
  }

  .row-cover {
    width: 42px;
    height: 42px;
    flex-basis: 42px;
  }

  .spotify-track-name {
    font-size: 14px;
  }

  .spotify-track-subtitle {
    font-size: 12px;
  }
}
@media (max-width: 1200px) {
  .library-table-head,
  .spotify-row {
    grid-template-columns: 40px minmax(0, 1.8fr) minmax(0, 1fr) 90px;
  }

  .col-added,
  .row-added {
    display: none;
  }
}
@media (max-width: 900px) {
  .library-table-head,
  .spotify-row {
    grid-template-columns: 36px minmax(0, 1fr) 80px;
    gap: 12px;
  }

  .col-album,
  .row-album {
    display: none;
  }

  .row-cover {
    width: 42px;
    height: 42px;
    flex-basis: 42px;
  }

  .spotify-track-name {
    font-size: 14px;
  }

  .spotify-track-subtitle {
    font-size: 12px;
  }
}
</style>
