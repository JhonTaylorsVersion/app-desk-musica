import { computed, ref, watch } from "vue";
import { AudioOutput } from "@/plugins/audioOutput";

import {
  addTrackToPlaylist,
  createPlaylist,
  defaultServerConfig,
  deletePlaylist,
  fetchAlbumDetail,
  fetchAlbums,
  fetchArtistDetail,
  fetchArtists,
  fetchLibrary,
  fetchPlaylists,
  fetchDesktopConnectState,
  fetchRecentSearches,
  fetchTrackDetail,
  fetchTrackMetadata,
  saveDeviceConnectSession,
  removeTrackFromPlaylist,
  renamePlaylist,
  resolveCanvasUrl,
  resolveCoverUrl,
  resolveStreamUrl,
  saveRecentSearches,
  searchLibrary,
  sendDesktopConnectCommand,
  setActiveConnectDevice,
  triggerRescan,
  type AlbumDetailResponse,
  type AlbumSummary,
  type ArtistDetailResponse,
  type ArtistSummary,
  type LibraryResponse,
  type MobileTrack,
  type PlaylistRecord,
  type RecentSearchRecord,
  type SearchResponse,
  type ServerConfig,
  type DesktopSessionSnapshot,
  type ConnectStateRecord,
  type TrackDetail,
  type TrackMetadata,
} from "@/services/api";

type TabKey = "home" | "search" | "library";
type ViewKey = "home" | "search" | "library" | "artist" | "album" | "playlist";
type QueueEntry = {
  track: MobileTrack;
  sourceKind: "library" | "artist" | "album" | "playlist" | "search";
  sourceLabel: string;
  sourceTargetLabel: string;
};
type PlaybackHistoryEntry = QueueEntry & {
  playedAt: string;
};
type LoopMode = "off" | "all" | "one";
type ViewSnapshot = {
  activeTab: TabKey;
  viewMode: ViewKey;
  selectedArtistId: string | null;
  selectedAlbumId: string | null;
  selectedPlaylistId: number | null;
  searchQuery: string;
  libraryFilter: string;
  isSettingsOpen: boolean;
  isNowPlayingOpen: boolean;
  isCreatePlaylistOpen: boolean;
  isQueueOpen: boolean;
};
type SessionSnapshot = {
  currentTrackId: string | null;
  queue: Array<{
    trackId: string;
    sourceKind: QueueEntry["sourceKind"];
    sourceLabel: string;
    sourceTargetLabel: string;
  }>;
  currentQueueIndex: number;
  currentTime: number;
  isPlaying: boolean;
  loopMode: LoopMode;
  isShuffleEnabled: boolean;
  activeTab: TabKey;
  viewMode: ViewKey;
  selectedArtistId: string | null;
  selectedAlbumId: string | null;
  selectedPlaylistId: number | null;
  searchQuery: string;
  libraryFilter: string;
};

const STORAGE_KEY = "app-desk-musica-mobile-config";
const SESSION_STORAGE_KEY = "app-desk-musica-mobile-session";
const PLAYBACK_HISTORY_STORAGE_KEY = "app-desk-musica-mobile-playback-history";
const DESKTOP_CONNECT_STORAGE_KEY = "app-desk-musica-mobile-desktop-connect";
const CONNECT_DEVICE_STALE_MS = 12_000;

const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds <= 0) return "--:--";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
};

const buildVibe = (track: MobileTrack | null) => {
  if (!track) return "Calidad original";

  return [
    track.quality === "original" ? "Calidad original" : track.quality,
    track.sample_rate ? `${(track.sample_rate / 1000).toFixed(1)} kHz` : null,
    track.bit_depth ? `${track.bit_depth}-bit` : null,
    track.channels ? `${track.channels} ch` : null,
    track.format.toUpperCase(),
  ]
    .filter(Boolean)
    .join(" · ");
};

export function useMobileExperience() {
  const activeTab = ref<TabKey>("home");
  const viewMode = ref<ViewKey>("home");
  const searchQuery = ref("");
  const libraryFilter = ref("");
  const isLoading = ref(false);
  const isRefreshing = ref(false);
  const errorMessage = ref("");
  const isSettingsOpen = ref(false);
  const isNowPlayingOpen = ref(false);
  const isQueueOpen = ref(false);
  const isLyricsMode = ref(false);
  const isCreatePlaylistOpen = ref(false);
  const isDesktopConnectEnabled = ref(loadDesktopConnectPreference());
  const desktopConnectUpdatedAt = ref<number | null>(null);
  const desktopConnectStatus = ref("Este telefono");
  const desktopConnectState = ref<ConnectStateRecord | null>(null);
  const newPlaylistName = ref("");

  const createSheetDragOffset = ref(0);
  const createSheetDragStartY = ref<number | null>(null);
  const createSheetIsDragging = ref(false);

  const serverConfig = ref<ServerConfig>(loadServerConfig());
  const draftServerConfig = ref<ServerConfig>({ ...serverConfig.value });

  const library = ref<LibraryResponse | null>(null);
  const artists = ref<ArtistSummary[]>([]);
  const albums = ref<AlbumSummary[]>([]);
  const playlists = ref<PlaylistRecord[]>([]);
  const recents = ref<RecentSearchRecord[]>([]);
  const searchResults = ref<SearchResponse | null>(null);
  const selectedArtist = ref<ArtistDetailResponse | null>(null);
  const selectedAlbum = ref<AlbumDetailResponse | null>(null);
  const selectedPlaylistId = ref<number | null>(null);

  const currentTrack = ref<MobileTrack | null>(null);
  const currentDetail = ref<TrackDetail | null>(null);
  const currentMetadata = ref<TrackMetadata | null>(null);
  const currentCoverUrl = ref<string | null>(null);
  const currentCanvasUrl = ref<string | null>(null);
  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(100);
  const isPlaying = ref(false);
  const currentQueueIndex = ref(-1);
  const queue = ref<QueueEntry[]>([]);
  const queueOriginalOrder = ref<QueueEntry[]>([]);
  const isShuffleEnabled = ref(false);
  const loopMode = ref<LoopMode>("off");
  const viewBackHistory = ref<ViewSnapshot[]>([]);
  const viewForwardHistory = ref<ViewSnapshot[]>([]);
  const playbackHistory = ref<PlaybackHistoryEntry[]>([]);
  let isHandlingBrowserBack = false;
  let hasBrowserHistorySync = false;
  let desktopConnectPollId: number | null = null;
  let connectSessionPersistTimeout: number | null = null;
  let mobileConnectHeartbeatId: number | null = null;

  const audio = new Audio();
  audio.preload = "metadata";

  const filteredTracks = computed(() => {
    const items = library.value?.items ?? [];
    const normalized = libraryFilter.value.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((track) =>
      [track.title, track.artist, track.album, track.album_artist]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  });

  const activePlaylist = computed(
    () =>
      playlists.value.find(
        (playlist) => playlist.id === selectedPlaylistId.value,
      ) ?? null,
  );

  const activePlaylistTracks = computed(() => {
    if (!activePlaylist.value || !library.value) return [];
    return activePlaylist.value.track_paths
      .map((trackPath) =>
        library.value?.items.find((track) => track.file_path === trackPath),
      )
      .filter((track): track is MobileTrack => Boolean(track));
  });

  const getPlaylistTracks = (
    playlistOrId: PlaylistRecord | number | null | undefined,
  ) => {
    if (!library.value || playlistOrId == null) return [] as MobileTrack[];

    const playlist =
      typeof playlistOrId === "number"
        ? (playlists.value.find((item) => item.id === playlistOrId) ?? null)
        : playlistOrId;

    if (!playlist) return [] as MobileTrack[];

    return playlist.track_paths
      .map((trackPath) =>
        library.value?.items.find((track) => track.file_path === trackPath),
      )
      .filter((track): track is MobileTrack => Boolean(track));
  };

  const getPlaylistCoverTiles = (
    playlistOrId: PlaylistRecord | number | null | undefined,
    max = 4,
  ) =>
    getPlaylistTracks(playlistOrId)
      .map((track) => resolveCoverUrl(serverConfig.value, track))
      .filter((cover): cover is string => Boolean(cover))
      .slice(0, Math.max(0, max));

  const featuredTrack = computed(
    () => filteredTracks.value[0] ?? library.value?.items[0] ?? null,
  );

  const topPicks = computed(() =>
    filteredTracks.value.slice(0, 8).map((track, index) => ({
      track,
      eyebrow: index === 0 ? "Tu mezcla principal" : "Recomendado para móvil",
      meta: buildVibe(track),
    })),
  );

  const currentSourceInfo = computed(() => {
    const source = queue.value[currentQueueIndex.value];
    return (
      source ?? {
        track: currentTrack.value,
        sourceKind: "library" as const,
        sourceLabel: "Biblioteca",
        sourceTargetLabel: "Biblioteca",
      }
    );
  });

  const parsedLyrics = computed(() => {
    const synced = currentMetadata.value?.synced_lyrics?.trim();
    if (synced) return synced.split(/\r?\n/).filter(Boolean);
    const lyrics = currentMetadata.value?.lyrics?.trim();
    return lyrics ? lyrics.split(/\r?\n/).filter(Boolean) : [];
  });

  const progressPercentage = computed(() =>
    duration.value
      ? Math.min((currentTime.value / duration.value) * 100, 100)
      : 0,
  );

  const homeArtists = computed(() => artists.value.slice(0, 8));
  const homeAlbums = computed(() => albums.value.slice(0, 8));
  const recentHistory = computed(() => playbackHistory.value.slice(0, 8));
  const isDeviceSessionFresh = (updatedAt: number | null | undefined) =>
    typeof updatedAt === "number" &&
    Date.now() - updatedAt * 1000 < CONNECT_DEVICE_STALE_MS;
  const isDesktopConnectAvailable = computed(() =>
    isDeviceSessionFresh(desktopConnectState.value?.desktop?.updated_at),
  );

  const statusText = computed(() =>
    library.value
      ? `${library.value.total} canciones · ${artists.value.length} artistas · ${albums.value.length} álbumes`
      : "Conecta tu servidor remoto",
  );
  const loopLabel = computed(() =>
    loopMode.value === "off"
      ? "Loop off"
      : loopMode.value === "all"
        ? "Loop all"
        : "Loop one",
  );
  const shuffleLabel = computed(() =>
    isShuffleEnabled.value ? "Shuffle on" : "Shuffle off",
  );

  audio.addEventListener("play", () => {
    if (isDesktopConnectEnabled.value) return;
    isPlaying.value = true;
  });
  audio.addEventListener("pause", () => {
    if (isDesktopConnectEnabled.value) return;
    isPlaying.value = false;
  });
  audio.addEventListener("timeupdate", () => {
    if (isDesktopConnectEnabled.value) return;
    currentTime.value = audio.currentTime;
  });
  audio.addEventListener("loadedmetadata", () => {
    duration.value = Number.isFinite(audio.duration) ? audio.duration : 0;
  });
  audio.addEventListener("ended", () => {
    if (isDesktopConnectEnabled.value) return;
    isPlaying.value = false;
    void playNext();
  });

  watch(
    serverConfig,
    (nextConfig) => {
      saveServerConfig(nextConfig);
    },
    { deep: true },
  );
  watch(isDesktopConnectEnabled, (enabled) => {
    saveDesktopConnectPreference(enabled);
    syncHardwareVolumeButtonMode();
    startDesktopConnectPolling();
    if (enabled) void syncDesktopConnectState();
    else desktopConnectStatus.value = "Este telefono";
  });
  watch(
    [
      activeTab,
      viewMode,
      selectedArtist,
      selectedAlbum,
      selectedPlaylistId,
      searchQuery,
      libraryFilter,
      currentTrack,
      currentQueueIndex,
      queue,
      currentTime,
      isPlaying,
      loopMode,
      isShuffleEnabled,
    ],
    () => {
      persistSession();
      scheduleMobileConnectSessionPersist();
    },
    { deep: true },
  );
  watch(
    playbackHistory,
    (history) => {
      persistPlaybackHistory(history);
    },
    { deep: true },
  );

  const sendDesktopCommand = async (
    command: string,
    payload: Record<string, unknown> = {},
    shouldSync = true,
  ) => {
    await sendDesktopConnectCommand(serverConfig.value, command, payload);
    if (shouldSync) await syncDesktopConnectState();
  };

  const sendDesktopCommandFast = (
    command: string,
    payload: Record<string, unknown> = {},
  ) => {
    void sendDesktopConnectCommand(serverConfig.value, command, payload).catch(
      (error) => {
        desktopConnectStatus.value =
          error instanceof Error
            ? error.message
            : "No se pudo enviar el comando";
      },
    );
  };

  const buildMobileConnectSession = (): DesktopSessionSnapshot => ({
    currentTrackPath: currentTrack.value?.file_path ?? null,
    currentSource: currentSourceInfo.value.sourceKind,
    currentQueueTrackId:
      currentQueueIndex.value >= 0 ? currentQueueIndex.value + 1 : null,
    currentPlaybackContext: {
      kind: currentSourceInfo.value.sourceKind,
      label: currentSourceInfo.value.sourceTargetLabel,
    },
    currentTime: currentTime.value,
    volume: volume.value,
    isMuted: false,
    lastVolumeBeforeMute: volume.value,
    loopMode: loopMode.value,
    isShuffleEnabled: isShuffleEnabled.value,
    wasPlaying: isPlaying.value,
    queue: queue.value.map((entry, index) => ({
      path: entry.track.file_path,
      queueId: index + 1,
      playbackContext: {
        kind: entry.sourceKind,
        label: entry.sourceTargetLabel,
      },
    })),
    librarySearch: libraryFilter.value,
    globalSearch: searchQuery.value,
    queueSearch: "",
    deviceName: "Este telefono",
  });

  const persistMobileConnectSession = async (makeActive = false) => {
    try {
      await saveDeviceConnectSession(
        serverConfig.value,
        "mobile",
        buildMobileConnectSession(),
        makeActive,
      );
    } catch (error) {
      // console.warn("No se pudo guardar la sesion movil Connect:", error);
    }
  };

  const startMobileConnectHeartbeat = () => {
    if (mobileConnectHeartbeatId != null || typeof window === "undefined")
      return;
    mobileConnectHeartbeatId = window.setInterval(() => {
      void persistMobileConnectSession(false);
    }, 3000);
    void persistMobileConnectSession(false);
  };

  const scheduleMobileConnectSessionPersist = () => {
    if (isDesktopConnectEnabled.value || typeof window === "undefined") return;
    if (connectSessionPersistTimeout != null) {
      window.clearTimeout(connectSessionPersistTimeout);
    }
    connectSessionPersistTimeout = window.setTimeout(() => {
      connectSessionPersistTimeout = null;
      void persistMobileConnectSession(isPlaying.value);
    }, 350);
  };

  const mapDesktopQueueEntry = (
    trackMap: Map<string, MobileTrack>,
    entry: DesktopSessionSnapshot["queue"][number],
  ): QueueEntry | null => {
    const track = trackMap.get(entry.path);
    if (!track) return null;

    return {
      track,
      sourceKind: normalizeSourceKind(entry.playbackContext?.kind),
      sourceLabel: entry.playbackContext?.label || "Desktop",
      sourceTargetLabel: entry.playbackContext?.label || "Desktop",
    };
  };

  const stopLocalAudioForRemotePlayback = () => {
    if (!audio.paused) {
      audio.pause();
    }
    audio.removeAttribute("src");
    audio.load();
  };

  const applyDesktopSession = async (
    session: DesktopSessionSnapshot | null,
  ) => {
    if (!session || !library.value) {
      desktopConnectStatus.value = "Desktop sin sesion";
      return;
    }

    const trackMap = new Map(
      library.value.items.map((track) => [track.file_path, track]),
    );
    const track = session.currentTrackPath
      ? (trackMap.get(session.currentTrackPath) ?? null)
      : null;

    stopLocalAudioForRemotePlayback();

    const previousPath = currentTrack.value?.file_path ?? null;
    const nextPath = track?.file_path ?? null;
    const isSameTrack = previousPath === nextPath;

    currentTrack.value = track;
    if (track && !isSameTrack) {
      currentDetail.value = await fetchTrackDetail(
        serverConfig.value,
        track.id,
      );
      currentMetadata.value = await fetchTrackMetadata(
        serverConfig.value,
        track.id,
      );
      currentCoverUrl.value = resolveCoverUrl(
        serverConfig.value,
        currentDetail.value,
      );
      currentCanvasUrl.value = resolveCanvasUrl(
        serverConfig.value,
        currentDetail.value,
      );
    } else if (track) {
      currentCoverUrl.value =
        currentCoverUrl.value ?? resolveCoverUrl(serverConfig.value, track);
    } else {
      currentDetail.value = null;
      currentMetadata.value = null;
      currentCoverUrl.value = null;
      currentCanvasUrl.value = null;
    }
    currentTime.value = Number.isFinite(session.currentTime)
      ? session.currentTime
      : 0;
    duration.value = track?.duration_seconds ?? 0;
    isPlaying.value = Boolean(session.wasPlaying);
    volume.value = Number.isFinite(session.volume) ? session.volume : 100;
    loopMode.value =
      session.loopMode === "all" || session.loopMode === "one"
        ? session.loopMode
        : "off";
    isShuffleEnabled.value = Boolean(session.isShuffleEnabled);

    const mappedQueue = session.queue
      .map((entry) => mapDesktopQueueEntry(trackMap, entry))
      .filter((entry): entry is QueueEntry => Boolean(entry));

    if (mappedQueue.length) {
      queue.value = mappedQueue;
      currentQueueIndex.value = track
        ? mappedQueue.findIndex(
            (entry) => entry.track.file_path === track.file_path,
          )
        : -1;
    } else if (track) {
      queue.value = [
        {
          track,
          sourceKind: normalizeSourceKind(session.currentPlaybackContext?.kind),
          sourceLabel: session.currentPlaybackContext?.label || "Desktop",
          sourceTargetLabel: session.currentPlaybackContext?.label || "Desktop",
        },
      ];
      currentQueueIndex.value = 0;
    }

    desktopConnectStatus.value = track
      ? `${session.deviceName || "Mi PC"}: ${track.title}`
      : `${session.deviceName || "Mi PC"} conectado`;
  };

  const syncDesktopConnectState = async () => {
    try {
      const wasUsingDesktop = isDesktopConnectEnabled.value;
      const state = await fetchDesktopConnectState(serverConfig.value);
      const desktopFresh = isDeviceSessionFresh(state.desktop?.updated_at);
      desktopConnectState.value = state;
      isDesktopConnectEnabled.value =
        state.active_device === "desktop" && desktopFresh;

      const activeSession =
        state.active_device === "desktop" && desktopFresh
          ? (state.desktop?.session ?? null)
          : null;
      desktopConnectUpdatedAt.value =
        state.active_device === "desktop" && desktopFresh
          ? (state.desktop?.updated_at ?? null)
          : null;

      if (activeSession) {
        await applyDesktopSession(activeSession);
      } else if (state.active_device === "mobile") {
        if (
          wasUsingDesktop &&
          state.desktop?.session?.currentTrackPath &&
          library.value
        ) {
          const desktopSession = state.desktop.session;
          const track = library.value.items.find(
            (item) => item.file_path === desktopSession.currentTrackPath,
          );
          if (track) {
            const tracks = library.value.items;
            await playCollection(
              tracks,
              Math.max(
                tracks.findIndex((item) => item.file_path === track.file_path),
                0,
              ),
              "library",
              "Biblioteca",
              "Biblioteca",
              Boolean(desktopSession.wasPlaying),
            );
            if (desktopSession.currentTime) {
              audio.currentTime = desktopSession.currentTime;
              currentTime.value = desktopSession.currentTime;
            }
            await persistMobileConnectSession(true);
          }
        }
        desktopConnectStatus.value = "Este telefono";
      } else if (state.active_device === "desktop" && !desktopFresh) {
        desktopConnectStatus.value = "PC no disponible";
      }
    } catch (error) {
      desktopConnectStatus.value =
        error instanceof Error
          ? error.message
          : "No se pudo conectar con desktop";
    }
  };

  const startDesktopConnectPolling = () => {
    if (desktopConnectPollId != null || typeof window === "undefined") return;
    desktopConnectPollId = window.setInterval(() => {
      void syncDesktopConnectState();
    }, 2000);
  };

  const stopDesktopConnectPolling = () => {
    if (desktopConnectPollId == null || typeof window === "undefined") return;
    window.clearInterval(desktopConnectPollId);
    desktopConnectPollId = null;
  };

  const toggleDesktopConnect = () => {
    const shouldUseDesktop = !isDesktopConnectEnabled.value;

    if (shouldUseDesktop) {
      if (!isDesktopConnectAvailable.value) {
        desktopConnectStatus.value = "PC no disponible";
        return;
      }

      void (async () => {
        const mobileSession = buildMobileConnectSession();
        const shouldResume = isPlaying.value;
        const startAt = currentTime.value;

        await persistMobileConnectSession(true);
        isDesktopConnectEnabled.value = true;
        stopLocalAudioForRemotePlayback();
        isPlaying.value = shouldResume;

        await setActiveConnectDevice(serverConfig.value, "desktop");
        if (mobileSession.currentTrackPath) {
          await sendDesktopCommand(
            "play_path",
            {
              path: mobileSession.currentTrackPath,
              startAt,
              autoplay: shouldResume,
            },
            false,
          );
        } else if (shouldResume) {
          await sendDesktopCommand("resume", {}, false);
        }

        desktopConnectStatus.value = "Cambiando a PC";
      })().catch((error) => {
        isDesktopConnectEnabled.value = false;
        desktopConnectStatus.value =
          error instanceof Error ? error.message : "No se pudo cambiar a PC";
      });
      return;
    }

    void setActiveConnectDevice(serverConfig.value, "mobile")
      .then(async () => {
        await sendDesktopCommand("pause", {}, false);
        const desktopSession =
          desktopConnectState.value?.desktop?.session ?? null;
        const path = desktopSession?.currentTrackPath;
        const track = path
          ? (library.value?.items.find((item) => item.file_path === path) ??
            null)
          : null;

        isDesktopConnectEnabled.value = false;

        if (track) {
          const tracks = queue.value.length
            ? queue.value.map((entry) => entry.track)
            : (library.value?.items ?? [track]);
          const startIndex = Math.max(
            tracks.findIndex((item) => item.file_path === track.file_path),
            0,
          );
          await playCollection(
            tracks,
            startIndex,
            "library",
            "Biblioteca",
            "Biblioteca",
            Boolean(desktopSession?.wasPlaying),
          );
          if (desktopSession?.currentTime) {
            audio.currentTime = desktopSession.currentTime;
            currentTime.value = desktopSession.currentTime;
          }
        }

        await persistMobileConnectSession(true);
        await syncDesktopConnectState();
      })
      .catch((error) => {
        desktopConnectStatus.value =
          error instanceof Error ? error.message : "No se pudo cambiar a movil";
      });
  };

  const changeVolume = async (nextVolume: number) => {
    const safeVolume = Math.min(Math.max(nextVolume, 0), 100);
    volume.value = safeVolume;

    if (isDesktopConnectEnabled.value) {
      sendDesktopCommandFast("set_volume", { volume: safeVolume });
      return;
    }

    audio.volume = safeVolume / 100;
    await persistMobileConnectSession(true);
  };

  const handleHardwareVolumeButton = (event: Event) => {
    const detail = (event as CustomEvent<{ direction?: string }>).detail;
    const step = detail?.direction === "down" ? -5 : 5;
    void changeVolume(volume.value + step);
  };

  const syncHardwareVolumeButtonMode = () => {
    void AudioOutput.setVolumeButtonMode({
      remote: isDesktopConnectEnabled.value,
    }).catch(() => {});
  };

  const bootstrap = async () => {
    isLoading.value = true;
    errorMessage.value = "";
    try {
      const [libraryData, artistData, albumData, playlistData, recentData] =
        await Promise.all([
          fetchLibrary(serverConfig.value),
          fetchArtists(serverConfig.value),
          fetchAlbums(serverConfig.value),
          fetchPlaylists(serverConfig.value),
          fetchRecentSearches(serverConfig.value),
        ]);
      library.value = libraryData;
      artists.value = artistData;
      albums.value = albumData;
      playlists.value = playlistData;
      recents.value = recentData;
      playbackHistory.value = restorePlaybackHistory(libraryData);

      if (!currentTrack.value && libraryData.items.length > 0) {
        await playCollection(
          libraryData.items,
          0,
          "library",
          "Biblioteca",
          "Biblioteca",
          false,
        );
      }
      await restoreSession();
      startDesktopConnectPolling();
      startMobileConnectHeartbeat();
      await syncDesktopConnectState();
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : "No se pudo conectar con music-server";
    } finally {
      isLoading.value = false;
    }
  };

  const refreshLibrary = async () => {
    isRefreshing.value = true;
    try {
      await triggerRescan(serverConfig.value);
      await bootstrap();
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la biblioteca";
    } finally {
      isRefreshing.value = false;
    }
  };

  const openTrack = async (
    track: MobileTrack,
    autoplay = true,
    context?: QueueEntry,
    shouldRecordHistory = true,
  ) => {
    currentTrack.value = track;
    currentDetail.value = await fetchTrackDetail(serverConfig.value, track.id);
    currentMetadata.value = await fetchTrackMetadata(
      serverConfig.value,
      track.id,
    );
    currentCoverUrl.value = resolveCoverUrl(
      serverConfig.value,
      currentDetail.value,
    );
    currentCanvasUrl.value = resolveCanvasUrl(
      serverConfig.value,
      currentDetail.value,
    );
    currentTime.value = 0;
    audio.src = resolveStreamUrl(serverConfig.value, currentDetail.value);
    audio.load();

    if (context) {
      currentQueueIndex.value = queue.value.findIndex(
        (entry) => entry.track.id === context.track.id,
      );
    }

    if (shouldRecordHistory) {
      recordPlaybackHistory(
        context ?? {
          track,
          sourceKind: "library",
          sourceLabel: "Biblioteca",
          sourceTargetLabel: "Biblioteca",
        },
      );
    }

    if (autoplay) {
      audio.volume = Math.min(Math.max(volume.value / 100, 0), 1);
      await audio.play();
      if (!isDesktopConnectEnabled.value) {
        await persistMobileConnectSession(true);
      }
    }
  };

  const playCollection = async (
    tracks: MobileTrack[],
    startIndex: number,
    sourceKind: QueueEntry["sourceKind"],
    sourceLabel: string,
    sourceTargetLabel: string,
    autoplay = true,
  ) => {
    if (!tracks.length) return;
    const safeStartIndex = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    const nextQueue = tracks.map((track) => ({
      track,
      sourceKind,
      sourceLabel,
      sourceTargetLabel,
    }));
    queueOriginalOrder.value = [...nextQueue];
    queue.value = isShuffleEnabled.value
      ? shuffleQueue(nextQueue, safeStartIndex)
      : nextQueue;
    currentQueueIndex.value = isShuffleEnabled.value ? 0 : safeStartIndex;
    const currentEntry = queue.value[currentQueueIndex.value];
    if (!currentEntry) return;
    if (isDesktopConnectEnabled.value) {
      sendDesktopCommandFast("play_path", {
        path: currentEntry.track.file_path,
        startAt: 0,
      });
      return;
    }
    await openTrack(currentEntry.track, autoplay, currentEntry);
  };

  const playNext = async () => {
    if (isDesktopConnectEnabled.value) {
      sendDesktopCommandFast("next");
      return;
    }

    if (loopMode.value === "one" && currentQueueIndex.value >= 0) {
      const currentEntry = queue.value[currentQueueIndex.value];
      if (currentEntry) {
        audio.currentTime = 0;
        await openTrack(currentEntry.track, true, currentEntry);
      }
      return;
    }
    const nextIndex = currentQueueIndex.value + 1;
    if (nextIndex >= queue.value.length) {
      if (loopMode.value === "all" && queue.value.length > 0) {
        currentQueueIndex.value = 0;
        await openTrack(queue.value[0].track, true, queue.value[0]);
      }
      return;
    }
    currentQueueIndex.value = nextIndex;
    await openTrack(queue.value[nextIndex].track, true, queue.value[nextIndex]);
  };

  const playPrevious = async () => {
    if (isDesktopConnectEnabled.value) {
      sendDesktopCommandFast("previous");
      return;
    }

    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const prevIndex = currentQueueIndex.value - 1;
    if (prevIndex < 0) return;
    currentQueueIndex.value = prevIndex;
    await openTrack(queue.value[prevIndex].track, true, queue.value[prevIndex]);
  };

  const playQueueEntry = async (index: number, autoplay = true) => {
    const entry = queue.value[index];
    if (!entry) return;
    currentQueueIndex.value = index;
    if (isDesktopConnectEnabled.value) {
      sendDesktopCommandFast("play_path", {
        path: entry.track.file_path,
        startAt: 0,
      });
      return;
    }
    await openTrack(entry.track, autoplay, entry);
  };

  const togglePlayback = async () => {
    if (isDesktopConnectEnabled.value) {
      isPlaying.value = !isPlaying.value;
      sendDesktopCommandFast("toggle_playback");
      return;
    }

    if (!audio.src && featuredTrack.value) {
      await playCollection(
        filteredTracks.value,
        0,
        "library",
        "Biblioteca",
        "Biblioteca",
        true,
      );
      return;
    }
    if (audio.paused) {
      await audio.play();
      await persistMobileConnectSession(true);
      return;
    }
    audio.pause();
    await persistMobileConnectSession(true);
  };

  const seekTo = (clientX: number, element: HTMLElement) => {
    if (!duration.value) return;
    const rect = element.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const nextTime = duration.value * ratio;
    if (isDesktopConnectEnabled.value) {
      currentTime.value = nextTime;
      sendDesktopCommandFast("seek_to", { seconds: nextTime });
      return;
    }
    audio.currentTime = nextTime;
  };

  const runSearch = async (query = searchQuery.value) => {
    const normalized = query.trim();
    if (!normalized) {
      searchResults.value = null;
      return;
    }
    searchResults.value = await searchLibrary(serverConfig.value, normalized);
  };

  const rememberSearch = async (record: RecentSearchRecord) => {
    const nextItems = [
      record,
      ...recents.value.filter((item) => item.entity_key !== record.entity_key),
    ].slice(0, 6);
    recents.value = nextItems;
    await saveRecentSearches(serverConfig.value, nextItems);
  };

  const openNavigationState = (mutator: () => void) => {
    pushCurrentViewToHistory();
    mutator();
    viewForwardHistory.value = [];
  };

  const navigateToTab = (tab: TabKey) => {
    if (activeTab.value === tab && viewMode.value === tab) return;
    openNavigationState(() => {
      activeTab.value = tab;
      viewMode.value = tab;
    });
  };

  const openSettingsPanel = () => {
    if (isSettingsOpen.value) return;
    openNavigationState(() => {
      isSettingsOpen.value = true;
    });
  };

  const closeSettingsPanel = async () => {
    if (!isSettingsOpen.value) return;
    if (viewBackHistory.value.length) {
      await goBackView();
      return;
    }
    isSettingsOpen.value = false;
  };

  const openCreatePlaylistSheet = () => {
    if (isCreatePlaylistOpen.value) return;
    openNavigationState(() => {
      isCreatePlaylistOpen.value = true;
    });
  };

  const closeCreatePlaylistSheet = async () => {
    if (!isCreatePlaylistOpen.value) return;
    if (viewBackHistory.value.length) {
      await goBackView();
      return;
    }
    isCreatePlaylistOpen.value = false;
  };

  const openNowPlayingSheet = () => {
    if (isNowPlayingOpen.value) return;
    openNavigationState(() => {
      isNowPlayingOpen.value = true;
    });
  };

  const closeNowPlayingSheet = async () => {
    if (!isNowPlayingOpen.value) return;
    if (viewBackHistory.value.length) {
      await goBackView();
      return;
    }
    isNowPlayingOpen.value = false;
    isQueueOpen.value = false;
  };

  const toggleQueuePanel = () => {
    if (isQueueOpen.value) {
      if (viewBackHistory.value.length) {
        void goBackView();
      } else {
        isQueueOpen.value = false;
      }
      return;
    }

    openNavigationState(() => {
      isQueueOpen.value = true;
      isNowPlayingOpen.value = true;
    });
  };

  const openArtistView = async (artistId: string) => {
    pushCurrentViewToHistory();
    selectedArtist.value = await fetchArtistDetail(
      serverConfig.value,
      artistId,
    );
    viewMode.value = "artist";
    activeTab.value = "library";
    viewForwardHistory.value = [];
  };

  const openAlbumView = async (albumId: string) => {
    pushCurrentViewToHistory();
    selectedAlbum.value = await fetchAlbumDetail(serverConfig.value, albumId);
    viewMode.value = "album";
    activeTab.value = "library";
    viewForwardHistory.value = [];
  };

  const openPlaylistView = (playlistId: number) => {
    pushCurrentViewToHistory();
    selectedPlaylistId.value = playlistId;
    viewMode.value = "playlist";
    activeTab.value = "library";
    viewForwardHistory.value = [];
  };

  const navigateFromPlaybackSource = async () => {
    const source = currentSourceInfo.value;
    if (!source) return;

    if (source.sourceKind === "artist") {
      const artist = artists.value.find(
        (item) => item.name === source.sourceTargetLabel,
      );
      if (artist) await openArtistView(artist.id);
      return;
    }
    if (source.sourceKind === "album") {
      const album = albums.value.find(
        (item) =>
          item.name === currentTrack.value?.album &&
          item.artist === currentTrack.value?.album_artist,
      );
      if (album) await openAlbumView(album.id);
      return;
    }
    if (source.sourceKind === "playlist") {
      const playlist = playlists.value.find(
        (item) => item.name === source.sourceTargetLabel,
      );
      if (playlist) openPlaylistView(playlist.id);
      return;
    }
    if (source.sourceKind === "search") {
      navigateToTab("search");
      return;
    }
    navigateToTab("library");
  };

  const saveSettings = async () => {
    serverConfig.value = {
      baseUrl:
        draftServerConfig.value.baseUrl.trim() || defaultServerConfig().baseUrl,
      token: draftServerConfig.value.token.trim(),
    };
    if (viewBackHistory.value.length) {
      await goBackView();
    } else {
      isSettingsOpen.value = false;
    }
    await bootstrap();
  };

  const submitNewPlaylist = async () => {
    if (!newPlaylistName.value.trim()) return;
    await createPlaylist(serverConfig.value, newPlaylistName.value.trim());
    newPlaylistName.value = "";
    if (viewBackHistory.value.length) {
      await goBackView();
    } else {
      isCreatePlaylistOpen.value = false;
    }
    playlists.value = await fetchPlaylists(serverConfig.value);
  };

  const addCurrentTrackToPlaylist = async (playlistId: number) => {
    if (!currentDetail.value) return;
    await addTrackToPlaylist(
      serverConfig.value,
      playlistId,
      currentDetail.value.file_path,
    );
    playlists.value = await fetchPlaylists(serverConfig.value);
  };

  const removeTrackFromCurrentPlaylist = async (track: MobileTrack) => {
    if (!activePlaylist.value) return;
    await removeTrackFromPlaylist(
      serverConfig.value,
      activePlaylist.value.id,
      track.file_path,
    );
    playlists.value = await fetchPlaylists(serverConfig.value);
  };

  const renameCurrentPlaylist = async (name: string) => {
    if (!activePlaylist.value || !name.trim()) return;
    await renamePlaylist(
      serverConfig.value,
      activePlaylist.value.id,
      name.trim(),
    );
    playlists.value = await fetchPlaylists(serverConfig.value);
  };

  const deleteCurrentPlaylist = async () => {
    if (!activePlaylist.value) return;
    const id = activePlaylist.value.id;
    await deletePlaylist(serverConfig.value, id);
    playlists.value = await fetchPlaylists(serverConfig.value);
    selectedPlaylistId.value = null;
    viewMode.value = "library";
    activeTab.value = "library";
  };

  const moveQueueItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (
      index < 0 ||
      nextIndex < 0 ||
      index >= queue.value.length ||
      nextIndex >= queue.value.length
    ) {
      return;
    }

    const nextQueue = [...queue.value];
    [nextQueue[index], nextQueue[nextIndex]] = [
      nextQueue[nextIndex],
      nextQueue[index],
    ];
    queue.value = nextQueue;

    if (!isShuffleEnabled.value) {
      queueOriginalOrder.value = [...nextQueue];
    }

    if (currentQueueIndex.value === index) {
      currentQueueIndex.value = nextIndex;
      return;
    }

    if (currentQueueIndex.value === nextIndex) {
      currentQueueIndex.value = index;
    }
  };

  const removeQueueItem = async (index: number) => {
    if (index < 0 || index >= queue.value.length) return;

    const removedEntry = queue.value[index];
    const nextQueue = queue.value.filter((_, itemIndex) => itemIndex !== index);
    const wasPlaying = isPlaying.value;
    queue.value = nextQueue;

    if (isShuffleEnabled.value) {
      queueOriginalOrder.value = queueOriginalOrder.value.filter(
        (entry) => entry.track.id !== removedEntry.track.id,
      );
    } else {
      queueOriginalOrder.value = [...nextQueue];
    }

    if (!nextQueue.length) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      currentTrack.value = null;
      currentDetail.value = null;
      currentMetadata.value = null;
      currentCoverUrl.value = null;
      currentCanvasUrl.value = null;
      currentTime.value = 0;
      duration.value = 0;
      currentQueueIndex.value = -1;
      isPlaying.value = false;
      return;
    }

    if (index < currentQueueIndex.value) {
      currentQueueIndex.value -= 1;
      return;
    }

    if (index > currentQueueIndex.value) {
      return;
    }

    const fallbackIndex = Math.min(index, nextQueue.length - 1);
    currentQueueIndex.value = fallbackIndex;
    await openTrack(
      nextQueue[fallbackIndex].track,
      wasPlaying,
      nextQueue[fallbackIndex],
      false,
    );
  };

  const clearUpcomingQueue = () => {
    if (!queue.value.length) return;
    if (currentQueueIndex.value < 0) {
      queue.value = [];
      queueOriginalOrder.value = [];
      return;
    }

    const trimmedQueue = queue.value.slice(0, currentQueueIndex.value + 1);
    queue.value = trimmedQueue;

    if (isShuffleEnabled.value) {
      const keepIds = new Set(trimmedQueue.map((entry) => entry.track.id));
      queueOriginalOrder.value = queueOriginalOrder.value.filter((entry) =>
        keepIds.has(entry.track.id),
      );
    } else {
      queueOriginalOrder.value = [...trimmedQueue];
    }
  };

  const toggleShuffle = () => {
    if (isDesktopConnectEnabled.value) {
      isShuffleEnabled.value = !isShuffleEnabled.value;
      sendDesktopCommandFast("set_shuffle", {
        enabled: isShuffleEnabled.value,
      });
      return;
    }

    isShuffleEnabled.value = !isShuffleEnabled.value;
    if (!queue.value.length) return;

    if (isShuffleEnabled.value) {
      queueOriginalOrder.value = [...queue.value];
      queue.value = shuffleQueue(queue.value, currentQueueIndex.value);
      currentQueueIndex.value = 0;
      return;
    }

    const currentId = queue.value[currentQueueIndex.value]?.track.id ?? null;
    queue.value = [...queueOriginalOrder.value];
    currentQueueIndex.value = currentId
      ? queue.value.findIndex((entry) => entry.track.id === currentId)
      : currentQueueIndex.value;
  };

  const toggleLoop = () => {
    if (isDesktopConnectEnabled.value) {
      const nextMode =
        loopMode.value === "off"
          ? "all"
          : loopMode.value === "all"
            ? "one"
            : "off";
      loopMode.value = nextMode;
      sendDesktopCommandFast("set_loop", { mode: nextMode });
      return;
    }

    loopMode.value =
      loopMode.value === "off"
        ? "all"
        : loopMode.value === "all"
          ? "one"
          : "off";
  };

  const performGoBackView = async () => {
    const previous = viewBackHistory.value.pop();
    if (!previous) return;
    viewForwardHistory.value.push(currentViewSnapshot());
    await applyViewSnapshot(previous);
  };

  const goBackView = async () => {
    if (
      typeof window !== "undefined" &&
      !isHandlingBrowserBack &&
      hasBrowserHistorySync &&
      viewBackHistory.value.length
    ) {
      window.history.back();
      return;
    }

    await performGoBackView();
  };

  const goForwardView = async () => {
    const next = viewForwardHistory.value.pop();
    if (!next) return;
    viewBackHistory.value.push(currentViewSnapshot());
    await applyViewSnapshot(next);
  };

  const currentViewSnapshot = (): ViewSnapshot =>
    currentViewSnapshotFromState(
      activeTab.value,
      viewMode.value,
      selectedArtist.value?.artist.id ?? null,
      selectedAlbum.value?.album.id ?? null,
      selectedPlaylistId.value,
      searchQuery.value,
      libraryFilter.value,
      isSettingsOpen.value,
      isNowPlayingOpen.value,
      isCreatePlaylistOpen.value,
      isQueueOpen.value,
    );

  const recordPlaybackHistory = (entry: QueueEntry) => {
    const historyEntry: PlaybackHistoryEntry = {
      ...entry,
      playedAt: new Date().toISOString(),
    };

    playbackHistory.value = [
      historyEntry,
      ...playbackHistory.value.filter(
        (item) => item.track.id !== entry.track.id,
      ),
    ].slice(0, 20);
  };

  const pushCurrentViewToHistory = () => {
    viewBackHistory.value.push(currentViewSnapshot());
    if (viewBackHistory.value.length > 30) {
      viewBackHistory.value.shift();
    }

    if (typeof window !== "undefined" && hasBrowserHistorySync) {
      window.history.pushState(
        { codexMobileViewDepth: viewBackHistory.value.length },
        "",
      );
    }
  };

  const applyViewSnapshot = async (snapshot: ViewSnapshot) => {
    activeTab.value = snapshot.activeTab;
    viewMode.value = snapshot.viewMode;
    searchQuery.value = snapshot.searchQuery;
    libraryFilter.value = snapshot.libraryFilter;
    selectedPlaylistId.value = snapshot.selectedPlaylistId;
    isSettingsOpen.value = snapshot.isSettingsOpen;
    isNowPlayingOpen.value = snapshot.isNowPlayingOpen;
    isCreatePlaylistOpen.value = snapshot.isCreatePlaylistOpen;
    isQueueOpen.value = snapshot.isQueueOpen;

    if (snapshot.selectedArtistId) {
      selectedArtist.value = await fetchArtistDetail(
        serverConfig.value,
        snapshot.selectedArtistId,
      );
    } else {
      selectedArtist.value = null;
    }

    if (snapshot.selectedAlbumId) {
      selectedAlbum.value = await fetchAlbumDetail(
        serverConfig.value,
        snapshot.selectedAlbumId,
      );
    } else {
      selectedAlbum.value = null;
    }

    if (snapshot.viewMode === "search" && snapshot.searchQuery.trim()) {
      await runSearch(snapshot.searchQuery);
    }
  };

  const persistSession = () => {
    if (typeof window === "undefined") return;

    const snapshot: SessionSnapshot = {
      currentTrackId: currentTrack.value?.id ?? null,
      queue: queue.value.map((entry) => ({
        trackId: entry.track.id,
        sourceKind: entry.sourceKind,
        sourceLabel: entry.sourceLabel,
        sourceTargetLabel: entry.sourceTargetLabel,
      })),
      currentQueueIndex: currentQueueIndex.value,
      currentTime: currentTime.value,
      isPlaying: isPlaying.value,
      loopMode: loopMode.value,
      isShuffleEnabled: isShuffleEnabled.value,
      ...currentViewSnapshot(),
    };

    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  };

  const restoreSession = async () => {
    if (typeof window === "undefined" || !library.value) return;

    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;

      const snapshot = JSON.parse(raw) as Partial<SessionSnapshot>;
      const trackMap = new Map(
        library.value.items.map((track) => [track.id, track]),
      );
      const restoredQueue = (snapshot.queue ?? [])
        .map((entry) => {
          const track = trackMap.get(entry.trackId);
          if (!track) return null;
          return {
            track,
            sourceKind: entry.sourceKind ?? "library",
            sourceLabel: entry.sourceLabel ?? "Biblioteca",
            sourceTargetLabel: entry.sourceTargetLabel ?? "Biblioteca",
          } satisfies QueueEntry;
        })
        .filter((entry): entry is QueueEntry => Boolean(entry));

      if (restoredQueue.length) {
        queue.value = restoredQueue;
        queueOriginalOrder.value = [...restoredQueue];
        currentQueueIndex.value = Math.min(
          Math.max(snapshot.currentQueueIndex ?? 0, 0),
          restoredQueue.length - 1,
        );
      }

      loopMode.value = snapshot.loopMode ?? "off";
      isShuffleEnabled.value = snapshot.isShuffleEnabled ?? false;

      await applyViewSnapshot({
        activeTab: snapshot.activeTab ?? "home",
        viewMode: snapshot.viewMode ?? "home",
        selectedArtistId: snapshot.selectedArtistId ?? null,
        selectedAlbumId: snapshot.selectedAlbumId ?? null,
        selectedPlaylistId: snapshot.selectedPlaylistId ?? null,
        searchQuery: snapshot.searchQuery ?? "",
        libraryFilter: snapshot.libraryFilter ?? "",
        isSettingsOpen: false,
        isNowPlayingOpen: false,
        isCreatePlaylistOpen: false,
        isQueueOpen: false,
      });

      const currentEntry =
        restoredQueue[currentQueueIndex.value] ??
        (snapshot.currentTrackId
          ? restoredQueue.find(
              (entry) => entry.track.id === snapshot.currentTrackId,
            )
          : null);

      if (currentEntry) {
        await openTrack(currentEntry.track, false, currentEntry, false);
        if (
          snapshot.currentTime &&
          Number.isFinite(snapshot.currentTime) &&
          snapshot.currentTime > 0
        ) {
          audio.currentTime = snapshot.currentTime;
          currentTime.value = snapshot.currentTime;
        }
        if (snapshot.isPlaying) {
          try {
            await audio.play();
          } catch {
            isPlaying.value = false;
          }
        }
      }
    } catch {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  };

  if (typeof window !== "undefined" && !hasBrowserHistorySync) {
    hasBrowserHistorySync = true;
    window.history.replaceState({ codexMobileViewDepth: 0 }, "");
    window.addEventListener("popstate", () => {
      if (!viewBackHistory.value.length) return;

      isHandlingBrowserBack = true;
      void performGoBackView().finally(() => {
        isHandlingBrowserBack = false;
      });
    });
  }

  if (typeof window !== "undefined") {
    window.addEventListener("hardwareVolumeButton", handleHardwareVolumeButton);
    syncHardwareVolumeButtonMode();
    startMobileConnectHeartbeat();
  }

  void bootstrap();

  return {
    activeTab,
    viewMode,
    searchQuery,
    libraryFilter,
    isLoading,
    isRefreshing,
    errorMessage,
    isSettingsOpen,
    isNowPlayingOpen,
    isQueueOpen,
    isLyricsMode,
    isCreatePlaylistOpen,
    isDesktopConnectEnabled,
    isDesktopConnectAvailable,
    desktopConnectStatus,
    desktopConnectUpdatedAt,
    desktopConnectState,
    newPlaylistName,
    createSheetDragOffset,
    createSheetDragStartY,
    createSheetIsDragging,
    serverConfig,
    draftServerConfig,
    library,
    artists,
    albums,
    playlists,
    recents,
    searchResults,
    selectedArtist,
    selectedAlbum,
    selectedPlaylistId,
    activePlaylist,
    activePlaylistTracks,
    getPlaylistCoverTiles,
    currentTrack,
    currentDetail,
    currentMetadata,
    currentCoverUrl,
    currentCanvasUrl,
    currentTime,
    duration,
    volume,
    isPlaying,
    currentQueueIndex,
    queue,
    isShuffleEnabled,
    loopMode,
    loopLabel,
    shuffleLabel,
    viewBackHistory,
    viewForwardHistory,
    featuredTrack,
    topPicks,
    homeArtists,
    homeAlbums,
    filteredTracks,
    currentSourceInfo,
    parsedLyrics,
    progressPercentage,
    statusText,
    bootstrap,
    refreshLibrary,
    openTrack,
    playCollection,
    playNext,
    playPrevious,
    toggleShuffle,
    toggleLoop,
    togglePlayback,
    seekTo,
    runSearch,
    rememberSearch,
    navigateToTab,
    openArtistView,
    openAlbumView,
    openPlaylistView,
    navigateFromPlaybackSource,
    openSettingsPanel,
    closeSettingsPanel,
    openCreatePlaylistSheet,
    closeCreatePlaylistSheet,
    openNowPlayingSheet,
    closeNowPlayingSheet,
    toggleQueuePanel,
    goBackView,
    goForwardView,
    saveSettings,
    submitNewPlaylist,
    addCurrentTrackToPlaylist,
    removeTrackFromCurrentPlaylist,
    renameCurrentPlaylist,
    deleteCurrentPlaylist,
    formatDuration,
    buildVibe,
    playbackHistory,
    recentHistory,
    playQueueEntry,
    moveQueueItem,
    removeQueueItem,
    clearUpcomingQueue,
    toggleDesktopConnect,
    syncDesktopConnectState,
    changeVolume,
  };
}

function currentViewSnapshotFromState(
  activeTab: TabKey,
  viewMode: ViewKey,
  selectedArtistId: string | null,
  selectedAlbumId: string | null,
  selectedPlaylistId: number | null,
  searchQuery: string,
  libraryFilter: string,
  isSettingsOpen: boolean,
  isNowPlayingOpen: boolean,
  isCreatePlaylistOpen: boolean,
  isQueueOpen: boolean,
): ViewSnapshot {
  return {
    activeTab,
    viewMode,
    selectedArtistId,
    selectedAlbumId,
    selectedPlaylistId,
    searchQuery,
    libraryFilter,
    isSettingsOpen,
    isNowPlayingOpen,
    isCreatePlaylistOpen,
    isQueueOpen,
  };
}

function shuffleQueue(queue: QueueEntry[], currentIndex: number) {
  if (!queue.length) return [];
  const safeCurrentIndex =
    currentIndex >= 0 && currentIndex < queue.length ? currentIndex : 0;
  const current = queue[safeCurrentIndex];
  const rest = queue.filter((_, index) => index !== safeCurrentIndex);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[swapIndex]] = [rest[swapIndex], rest[i]];
  }
  return current ? [current, ...rest] : rest;
}

function persistPlaybackHistory(history: PlaybackHistoryEntry[]) {
  if (typeof window === "undefined") return;
  const payload = history.map((entry) => ({
    trackId: entry.track.id,
    sourceKind: entry.sourceKind,
    sourceLabel: entry.sourceLabel,
    sourceTargetLabel: entry.sourceTargetLabel,
    playedAt: entry.playedAt,
  }));
  window.localStorage.setItem(
    PLAYBACK_HISTORY_STORAGE_KEY,
    JSON.stringify(payload),
  );
}

function restorePlaybackHistory(
  library: LibraryResponse | null,
): PlaybackHistoryEntry[] {
  if (typeof window === "undefined" || !library) return [];

  try {
    const raw = window.localStorage.getItem(PLAYBACK_HISTORY_STORAGE_KEY);
    if (!raw) return [];

    const trackMap = new Map(library.items.map((track) => [track.id, track]));
    const parsed = JSON.parse(raw) as Array<{
      trackId: string;
      sourceKind?: QueueEntry["sourceKind"];
      sourceLabel?: string;
      sourceTargetLabel?: string;
      playedAt?: string;
    }>;

    return parsed
      .map((entry) => {
        const track = trackMap.get(entry.trackId);
        if (!track) return null;
        return {
          track,
          sourceKind: entry.sourceKind ?? "library",
          sourceLabel: entry.sourceLabel ?? "Biblioteca",
          sourceTargetLabel: entry.sourceTargetLabel ?? "Biblioteca",
          playedAt: entry.playedAt ?? new Date().toISOString(),
        } satisfies PlaybackHistoryEntry;
      })
      .filter((entry): entry is PlaybackHistoryEntry => Boolean(entry))
      .slice(0, 20);
  } catch {
    return [];
  }
}

function normalizeSourceKind(
  value: string | null | undefined,
): QueueEntry["sourceKind"] {
  if (
    value === "artist" ||
    value === "album" ||
    value === "playlist" ||
    value === "search"
  ) {
    return value;
  }
  return "library";
}

function loadDesktopConnectPreference() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DESKTOP_CONNECT_STORAGE_KEY) === "1";
}

function saveDesktopConnectPreference(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DESKTOP_CONNECT_STORAGE_KEY, enabled ? "1" : "0");
}

function loadServerConfig(): ServerConfig {
  if (typeof window === "undefined") return defaultServerConfig();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultServerConfig();
    const parsed = JSON.parse(raw) as Partial<ServerConfig>;
    return {
      baseUrl:
        typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()
          ? parsed.baseUrl
          : defaultServerConfig().baseUrl,
      token: typeof parsed.token === "string" ? parsed.token : "",
    };
  } catch {
    return defaultServerConfig();
  }
}

function saveServerConfig(config: ServerConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
