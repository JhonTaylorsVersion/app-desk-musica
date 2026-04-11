import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  nextTick,
} from "vue";

import { invoke, convertFileSrc } from "@tauri-apps/api/core";

import { open } from "@tauri-apps/plugin-dialog";

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export function useAppLogic() {
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

  
  
  type PlaybackContextKind =
    | "library"
    | "queue"
    | "album"
    | "artist"
    | "playlist"
    | "search";

  
  
  type PlaybackContext = {
    kind: PlaybackContextKind;
    label: string;
  };

  
  
  type QueueTrack = PlaylistTrack & {
    queueId: number;
    playbackContext: PlaybackContext;
  };

  
  
  type LibraryTrackMetadata = {
    title: string;
    artist: string;
    album: string;
    album_artist?: string | null;
    year?: string | null;
    duration_seconds: number;
    duration_formatted: string;
    cover_art?: CoverArt | null;
    track_number?: number | null;
  };

  
  
  type LibraryTrackMetadataLiteRow = {
    path: string;
    title: string;
    artist: string;
    album: string;
    album_artist?: string | null;
    year?: string | null;
    duration_seconds: number;
    duration_formatted: string;
    cover_path?: string | null;
    track_number?: number | null;
  };

  
  
  type PlaylistSummary = {
    id: number;
    name: string;
    trackCount: number;
    createdAt: number;
    updatedAt: number;
    trackPaths: string[];
  };

  
  
  type SidebarLibraryItem = {
    key: string;
    kind: "playlist" | "album" | "artist";
    title: string;
    subtitle: string;
    cover: string | null;
    coverTiles: (string | null)[];
    playlistId: number | null;
    onClick: () => void;
    isActive: boolean;
  };

  
  
  type SidebarLibraryFilter = "all" | "playlists" | "albums" | "artists";

  
  
  type SearchArtistResult = {
    name: string;
    cover: string | null;
    tracks: PlaylistTrack[];
  };

  
  
  type SearchAlbumResult = {
    name: string;
    artist: string;
    cover: string | null;
    tracks: PlaylistTrack[];
  };

  
  
  type SearchTopResult =
    | {
        kind: "song";
        title: string;
        subtitle: string;
        cover: string | null;
        action: () => void | Promise<void>;
        playAction: () => void | Promise<void>;
      }
    | {
        kind: "album";
        title: string;
        subtitle: string;
        cover: string | null;
        action: () => void | Promise<void>;
        playAction: () => void | Promise<void>;
      }
    | {
        kind: "artist";
        title: string;
        subtitle: string;
        cover: string | null;
        action: () => void | Promise<void>;
        playAction: () => void | Promise<void>;
      };

  
  
  type RecentSearchItem = {
    query: string;
    title: string;
    subtitle: string;
    cover: string | null;
    kind: "song" | "album" | "artist";
    entityKey?: string;
    trackPath?: string;
    artistName?: string;
  };

  
  
  type SessionQueueTrack = {
    path: string;
    queueId: number;
    playbackContext: PlaybackContext;
  };

  
  
  type SessionShuffleHistoryEntry = {
    source: PlaybackSource;
    index: number;
  };

  
  
  type AppSessionSnapshot = {
    currentTrackPath: string | null;
    currentSource: PlaybackSource;
    currentQueueTrackId: number | null;
    currentPlaybackContext: PlaybackContext | null;
    currentTime: number;
    volume: number;
    isMuted: boolean;
    lastVolumeBeforeMute: number;
    loopMode: LoopMode;
    isShuffleEnabled: boolean;
    wasPlaying: boolean;
    queue: SessionQueueTrack[];
    queueOriginalOrderIds: number[];
    queueConsumedHistory: SessionQueueTrack[];
    shuffleHistory: SessionShuffleHistoryEntry[];
    nextQueueId: number;
    librarySearch: string;
    globalSearch: string;
    queueSearch: string;
    isQueuePanelOpen: boolean;
    isRoutesManagerOpen: boolean;
    deviceName?: string | null;
    outputDeviceName?: string | null;
    currentViewSnapshot: ViewSnapshot;
  };

  type ConnectCommandRecord = {
    id: number;
    command: string;
    payload: Record<string, unknown> | null;
    createdAt: number;
  };

  type DeviceSessionRecord = {
    device: "desktop" | "mobile";
    session: AppSessionSnapshot;
    updatedAt: number;
  };

  type ConnectStateRecord = {
    activeDevice?: "desktop" | "mobile" | null;
    desktop?: DeviceSessionRecord | null;
    mobile?: DeviceSessionRecord | null;
  };

  
  
  type OutputDeviceInfo = {
    device_name: string;
    sample_rate: number;
    channels: number;
    sample_format: string;
  };

  type SpotiFlacHostInfo = {
    defaultDownloadPath: string;
    configPath: string;
  };

  type SpotiFlacHostInvoke =
    | "getHostInfo"
    | "selectFolder"
    | "openFolder"
    | "openConfigFolder"
    | "writeTextFile"
    | "readTextFile"
    | "writeBinaryFile"
    | "fileExists"
    | "downloadTrack"
    | "getStreamingURLs"
    | "checkTrackAvailability"
    | "searchSpotify"
    | "searchSpotifyByType";

  let detachSpotiFlacHost: (() => void) | null = null;

  const installSpotiFlacHost = () => {
    const rootWindow = window as Window & {
      __spotiflacHost?: {
        invoke: (
          method: SpotiFlacHostInvoke,
          payload?: Record<string, unknown>,
        ) => Promise<unknown>;
      };
    };

    const previousHost = rootWindow.__spotiflacHost;

    rootWindow.__spotiflacHost = {
      invoke: async (
        method: SpotiFlacHostInvoke,
        payload: Record<string, unknown> = {},
      ) => {
        switch (method) {
          case "getHostInfo":
            return await invoke<SpotiFlacHostInfo>("spotiflac_get_host_info");
          case "selectFolder": {
            const selected = await open({
              directory: true,
              multiple: false,
              defaultPath:
                typeof payload.defaultPath === "string"
                  ? payload.defaultPath
                  : undefined,
            });

            if (Array.isArray(selected)) {
              return selected[0] ?? null;
            }

            return selected ?? null;
          }
          case "openFolder": {
            const path =
              typeof payload.path === "string" ? payload.path.trim() : "";
            if (!path) return null;
            await invoke("spotiflac_open_folder", { path });
            return null;
          }
          case "openConfigFolder": {
            const info = await invoke<SpotiFlacHostInfo>(
              "spotiflac_get_host_info",
            );
            await invoke("spotiflac_open_folder", { path: info.configPath });
            return info.configPath;
          }
          case "writeTextFile": {
            await invoke("spotiflac_write_text_file", {
              path: payload.path,
              contents: payload.contents,
            });
            return null;
          }
          case "readTextFile":
            return await invoke<string>("spotiflac_read_text_file", {
              path: payload.path,
            });
          case "writeBinaryFile": {
            await invoke("spotiflac_write_binary_file", {
              path: payload.path,
              base64Data: payload.base64Data,
            });
            return null;
          }
          case "fileExists":
            return await invoke<boolean>("spotiflac_file_exists", {
              path: payload.path,
            });
          case "downloadTrack":
            return await invoke("spotiflac_download_track", {
              request:
                payload && typeof payload.request === "object"
                  ? payload.request
                  : payload,
            });
          case "getStreamingURLs":
            return await invoke("spotiflac_get_streaming_urls", {
              spotifyTrackId: payload.spotifyTrackId,
              region:
                typeof payload.region === "string" ? payload.region : undefined,
            });
          case "checkTrackAvailability":
            return await invoke("spotiflac_check_track_availability", {
              spotifyTrackId: payload.spotifyTrackId,
            });
          case "searchSpotify":
            return await invoke("spotiflac_search_spotify", {
              query: payload.query,
              limit:
                typeof payload.limit === "number" ? payload.limit : undefined,
            });
          case "searchSpotifyByType":
            return await invoke("spotiflac_search_spotify_by_type", {
              query: payload.query,
              searchType: payload.searchType,
              limit:
                typeof payload.limit === "number" ? payload.limit : undefined,
              offset:
                typeof payload.offset === "number" ? payload.offset : undefined,
            });
          default:
            throw new Error(`Metodo de SpotiFLAC no soportado: ${method}`);
        }
      },
    };

    detachSpotiFlacHost = () => {
      if (previousHost) {
        rootWindow.__spotiflacHost = previousHost;
      } else {
        delete rootWindow.__spotiflacHost;
      }
    };
  };

  
  
  const outputDeviceInfo = ref<OutputDeviceInfo | null>(null);
  const desktopDeviceName = ref("Mi PC");
  const isAppBooting = ref(false);

  const waitForNextPaint = () =>
    new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

  
  const LEGACY_GLOBAL_SEARCH_RECENTS_KEY =
    "app-desk-musica-global-search-recents";

  
  const LEGACY_GLOBAL_SEARCH_RECENTS_MIGRATED_KEY =
    "app-desk-musica-global-search-recents-migrated";

  
  
  const isRecentSearchItem = (item: unknown): item is RecentSearchItem => {
    const hasOptionalString = (value: unknown) =>
      value === undefined || value === null || typeof value === "string";
  
    if (!item || typeof item !== "object") return false;
  
    const candidate = item as Record<string, unknown>;
  
    return (
      "query" in candidate &&
      "title" in candidate &&
      "subtitle" in candidate &&
      "kind" in candidate &&
      typeof candidate.query === "string" &&
      typeof candidate.title === "string" &&
      typeof candidate.subtitle === "string" &&
      typeof candidate.kind === "string" &&
      hasOptionalString(candidate.entityKey) &&
      hasOptionalString(candidate.trackPath) &&
      hasOptionalString(candidate.artistName)
    );
  };

  
  
  const loadRecentGlobalSearches = async (): Promise<RecentSearchItem[]> => {
    try {
      const items = await invoke<unknown[]>("get_recent_global_searches");
      if (!Array.isArray(items)) return [];
      return items.filter(isRecentSearchItem);
    } catch (error) {
      console.warn("No se pudo cargar el historial de busqueda global:", error);
      return [];
    }
  };

  
  
  const loadLegacyRecentGlobalSearches = (): RecentSearchItem[] => {
    if (typeof window === "undefined") return [];
  
    try {
      const raw = window.localStorage.getItem(LEGACY_GLOBAL_SEARCH_RECENTS_KEY);
      if (!raw) return [];
  
      const items = JSON.parse(raw);
      if (!Array.isArray(items)) return [];
  
      return items.filter(isRecentSearchItem).slice(0, 6);
    } catch {
      return [];
    }
  };

  
  
  const hasMigratedLegacyRecentGlobalSearches = () => {
    if (typeof window === "undefined") return false;
    return (
      window.localStorage.getItem(LEGACY_GLOBAL_SEARCH_RECENTS_MIGRATED_KEY) ===
      "1"
    );
  };

  
  
  const markLegacyRecentGlobalSearchesMigrated = () => {
    if (typeof window === "undefined") return;
  
    try {
      window.localStorage.setItem(LEGACY_GLOBAL_SEARCH_RECENTS_MIGRATED_KEY, "1");
      window.localStorage.removeItem(LEGACY_GLOBAL_SEARCH_RECENTS_KEY);
    } catch {
      // Ignoramos errores de storage para no bloquear el arranque.
    }
  };

  
  
  const persistRecentGlobalSearches = async (items: RecentSearchItem[]) => {
    try {
      await invoke("set_recent_global_searches", {
        items: items.slice(0, 6),
      });
      return true;
    } catch (error) {
      console.warn("No se pudo guardar el historial de busqueda global:", error);
      return false;
    }
  };

  
  
  const loadAppSession = async (): Promise<AppSessionSnapshot | null> => {
    try {
      return await invoke<AppSessionSnapshot | null>("get_app_session");
    } catch (error) {
      console.warn("No se pudo cargar la sesion de la app:", error);
      return null;
    }
  };

  
  
  const persistAppSession = async (session: AppSessionSnapshot) => {
    try {
      await invoke("set_app_session", { session });
    } catch (error) {
      console.warn("No se pudo guardar la sesion de la app:", error);
    }
  };

  
  
  // Función para preguntarle a Rust qué dispositivo se está usando
  const fetchOutputDeviceInfo = async () => {
    try {
      outputDeviceInfo.value = await invoke<OutputDeviceInfo>(
        "get_output_device_info",
      );
    } catch (error) {
      console.error("No se pudo obtener info de salida del hardware:", error);
    }
  };

  const fetchComputerName = async () => {
    try {
      desktopDeviceName.value = await invoke<string>("get_computer_name");
    } catch (error) {
      console.warn("No se pudo obtener el nombre de la PC:", error);
    }
  };

  
  
  const canvasVideoRef = ref<HTMLVideoElement | null>(null);

  
  
  // 1. Crea una variable reactiva para el Canvas
  const canvasUrl = ref<string | null>(null);

  
  
  // 2. Crea una función para manejar el error si el video no existe
  const handleCanvasError = () => {
    pauseCanvas();
    canvasUrl.value = null; // Si falla, lo anulamos y Vue mostrará la carátula normal
  };

  
  
  const libraryMetadataMap = ref<Record<string, LibraryTrackMetadata>>({});

  
  const loadingLibraryMetadata = ref(false);

  
  
  type ParsedLyric = {
    time: number;
    text: string;
  };

  
  
  type PlaybackSource = "library" | "queue" | "playlist";

  
  
  const createPlaybackContext = (
    kind: PlaybackContextKind,
    label: string,
  ): PlaybackContext => ({
    kind,
    label,
  });

  
  
  const clonePlaybackContext = (
    context: PlaybackContext | null | undefined,
  ): PlaybackContext | null => {
    if (!context) return null;
    return createPlaybackContext(context.kind, context.label);
  };

  
  
  const progressBarRef = ref<HTMLInputElement | null>(null);

  
  const showProgressTooltip = ref(false);

  
  const hoverPreviewTime = ref(0);

  
  const hoverTooltipLeft = ref(0);

  
  
  const onProgressHover = (e: MouseEvent) => {
    const target = progressBarRef.value;
    if (!target) return;
  
    const rect = target.getBoundingClientRect();
    const max =
      Number(target.max) ||
      duration.value ||
      metadata.value?.duration_seconds ||
      0;
  
    if (max <= 0) return;
  
    const offsetX = e.clientX - rect.left;
    const ratio = Math.min(Math.max(offsetX / rect.width, 0), 1);
    const previewTime = ratio * max;
  
    hoverPreviewTime.value = previewTime;
    hoverTooltipLeft.value = offsetX;
    showProgressTooltip.value = true;
  };

  
  
  const pauseCanvas = () => {
    const video = canvasVideoRef.value;
    if (!video) return;
  
    video.pause();
  };

  
  
  const getAlbumArtistForTrack = (track: PlaylistTrack) => {
    const metadata = getLibraryTrackMetadata(track);
    return (
      metadata?.album_artist || metadata?.artist || getPrimaryTrackArtist(track)
    );
  };

  
  
  const getAlbumViewKey = (album: string | null, artist?: string | null) => {
    const normalizedAlbum = album?.trim();
    if (!normalizedAlbum) return "";
  
    const normalizedArtist = artist?.trim();
    return normalizedArtist
      ? `${normalizedAlbum.toLowerCase()}::${normalizedArtist.toLowerCase()}`
      : normalizedAlbum.toLowerCase();
  };

  
  
  const activeAlbumViewKey = computed(() =>
    getAlbumViewKey(activeAlbumView.value, activeAlbumArtistView.value),
  );

  
  
  const isActiveAlbumPlaying = computed(() => {
    if (!activeAlbumTracks.value.length || !filePath.value) return false;
    if (
      currentPlaybackContext.value.kind !== "album" ||
      currentPlaybackContext.value.label !== activeAlbumViewKey.value
    ) {
      return false;
    }
  
    const currentTrackIsFromThisAlbum = activeAlbumTracks.value.some(
      (track) => track.path === filePath.value,
    );
  
    return currentTrackIsFromThisAlbum && isPlaying.value;
  });

  
  
  const playCanvas = async () => {
    const video = canvasVideoRef.value;
    if (!video || !canvasUrl.value) return;
  
    try {
      await video.play();
    } catch (error) {
      console.warn("No se pudo reproducir el canvas:", error);
    }
  };

  
  
  const resetCanvas = () => {
    const video = canvasVideoRef.value;
    if (!video) return;
  
    video.pause();
    video.currentTime = 0;
  };

  
  
  const syncCanvasWithPlayback = async () => {
    const video = canvasVideoRef.value;
  
    if (!video || !canvasUrl.value) return;
  
    if (isPlaying.value) {
      await playCanvas();
    } else {
      pauseCanvas();
    }
  };

  
  
  const onProgressLeave = () => {
    showProgressTooltip.value = false;
  };

  
  
  const onProgressEnter = (e: MouseEvent) => {
    onProgressHover(e);
  };

  
  
  const selectedLibraryTrack = ref<{
    path: string;
    playlistId: number | null;
    occurrenceIndex: number | null;
  } | null>(null);

  
  
  const contextMenu = ref({
    visible: false,
    x: 0,
    y: 0,
    track: null as PlaylistTrack | null,
    source: "library" as PlaybackSource,
    queueIndex: null as number | null,
    playlistId: null as number | null,
    trackIndex: null as number | null,
  });

  
  
  const playlistContextMenu = ref({
    visible: false,
    x: 0,
    y: 0,
    playlistId: null as number | null,
  });

  
  
  const isRenamePlaylistModalVisible = ref(false);

  
  const renamePlaylistName = ref("");

  
  const renamePlaylistTargetId = ref<number | null>(null);

  
  const playlistPendingDeletionId = ref<number | null>(null);

  
  const isContextMenuPlaylistPickerVisible = ref(false);

  
  const contextMenuPlaylistSearch = ref("");

  
  
  const contextMenuStyle = computed(() => {
    const menuWidth = 280;
    const menuHeight = 420;
    const margin = 12;
  
    const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - menuHeight - margin);
  
    return {
      left: `${Math.min(contextMenu.value.x, maxLeft)}px`,
      top: `${Math.min(contextMenu.value.y, maxTop)}px`,
    };
  });

  
  
  const contextMenuPlaylistPickerStyle = computed(() => {
    const menuWidth = 320;
    const menuHeight = 420;
    const margin = 12;
    const anchorLeft = Math.min(
      contextMenu.value.x,
      window.innerWidth - 280 - margin,
    );
    const preferredLeft = anchorLeft + 296;
    const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - menuHeight - margin);
  
    return {
      left: `${Math.min(preferredLeft, maxLeft)}px`,
      top: `${Math.min(contextMenu.value.y, maxTop)}px`,
    };
  });

  
  
  const playlistContextMenuStyle = computed(() => {
    const menuWidth = 280;
    const menuHeight = 220;
    const margin = 12;
  
    const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - menuHeight - margin);
  
    return {
      left: `${Math.min(playlistContextMenu.value.x, maxLeft)}px`,
      top: `${Math.min(playlistContextMenu.value.y, maxTop)}px`,
    };
  });

  
  
  const selectLibraryTrack = (track: PlaylistTrack, index?: number) => {
    if (
      currentViewMode.value === "playlist" &&
      activePlaylist.value &&
      typeof index === "number" &&
      displayedTracks.value[index]
    ) {
      selectedLibraryTrack.value = {
        path: track.path,
        playlistId: activePlaylist.value.id,
        occurrenceIndex: getTrackOccurrenceIndex(
          displayedTracks.value,
          index,
          track.path,
        ),
      };
      return;
    }
  
    selectedLibraryTrack.value = {
      path: track.path,
      playlistId: null,
      occurrenceIndex: null,
    };
  };

  
  
  const openTrackContextMenu = (
    e: MouseEvent,
    track: PlaylistTrack,
    source: PlaybackSource = "library",
    queueIndex: number | null = null,
    playlistId: number | null = null,
    trackIndex?: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    closePlaylistContextMenu();
  
    openTrackContextMenuAt(
      e.clientX,
      e.clientY,
      track,
      source,
      queueIndex,
      playlistId,
      trackIndex,
    );
  };

  
  
  const openTrackContextMenuAt = (
    x: number,
    y: number,
    track: PlaylistTrack,
    source: PlaybackSource = "library",
    queueIndex: number | null = null,
    playlistId: number | null = null,
    trackIndex?: number,
  ) => {
    closePlaylistContextMenu();
    isContextMenuPlaylistPickerVisible.value = false;
    contextMenuPlaylistSearch.value = "";
    selectLibraryTrack(track, trackIndex);
  
    contextMenu.value = {
      visible: true,
      x,
      y,
      track,
      source,
      queueIndex,
      playlistId,
      trackIndex: typeof trackIndex === "number" ? trackIndex : null,
    };
  };

  
  
  const closeTrackContextMenu = () => {
    contextMenu.value.visible = false;
    contextMenu.value.track = null;
    contextMenu.value.queueIndex = null;
    contextMenu.value.playlistId = null;
    contextMenu.value.trackIndex = null;
    isContextMenuPlaylistPickerVisible.value = false;
    contextMenuPlaylistSearch.value = "";
  };

  
  
  const openPlaylistContextMenu = (e: MouseEvent, playlistId: number) => {
    e.preventDefault();
    e.stopPropagation();
    openPlaylistContextMenuAt(e.clientX, e.clientY, playlistId);
  };

  
  
  const openPlaylistContextMenuAt = (
    x: number,
    y: number,
    playlistId: number,
  ) => {
    closeTrackContextMenu();
  
    playlistContextMenu.value = {
      visible: true,
      x,
      y,
      playlistId,
    };
  };

  
  
  const openPlaylistContextMenuFromButton = (
    event: MouseEvent,
    playlistId: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
  
    openPlaylistContextMenuAt(
      rect ? rect.left : event.clientX,
      rect ? rect.bottom + 8 : event.clientY,
      playlistId,
    );
  };

  
  
  const closePlaylistContextMenu = () => {
    playlistContextMenu.value.visible = false;
    playlistContextMenu.value.playlistId = null;
  };

  
  
  const closePlaylistRenameModal = () => {
    isRenamePlaylistModalVisible.value = false;
    renamePlaylistName.value = "";
    renamePlaylistTargetId.value = null;
  };

  
  
  const closePlaylistDeleteModal = () => {
    playlistPendingDeletionId.value = null;
  };

  
  
  const addContextMenuTrackToQueue = () => {
    if (!contextMenu.value.track) return;
    addToQueue(contextMenu.value.track);
    closeTrackContextMenu();
  };

  
  
  const playContextMenuTrack = async () => {
    if (!contextMenu.value.track) return;
  
    if (
      contextMenu.value.source === "queue" &&
      contextMenu.value.queueIndex != null
    ) {
      await playTrackFromQueue(contextMenu.value.queueIndex);
      closeTrackContextMenu();
      return;
    }
  
    await playTrackFromLibrary(
      contextMenu.value.track,
      contextMenu.value.trackIndex ?? undefined,
    );
    closeTrackContextMenu();
  };

  
  
  const removeContextMenuTrackFromQueue = () => {
    if (contextMenu.value.queueIndex == null) return;
    removeFromQueue(contextMenu.value.queueIndex);
    closeTrackContextMenu();
  };

  
  
  const contextMenuActivePlaylist = computed(() => {
    if (contextMenu.value.playlistId == null) return null;
    return (
      playlists.value.find((item) => item.id === contextMenu.value.playlistId) ??
      null
    );
  });

  
  
  const contextMenuTargetsCurrentTrack = computed(() => {
    const track = contextMenu.value.track;
    if (!track || !filePath.value) return false;
  
    if (contextMenu.value.source === "queue") {
      return (
        contextMenu.value.queueIndex != null &&
        isQueueTrackActive(track, contextMenu.value.queueIndex)
      );
    }
  
    if (contextMenu.value.source === "playlist") {
      return isLibraryTrackCurrent(
        track,
        contextMenu.value.trackIndex ?? undefined,
      );
    }
  
    return filePath.value === track.path;
  });

  
  
  const contextMenuCanRemoveFromQueue = computed(() => {
    return (
      contextMenu.value.source === "queue" &&
      contextMenu.value.queueIndex != null &&
      !contextMenuTargetsCurrentTrack.value
    );
  });

  
  
  const contextMenuCanRemoveFromPlaylist = computed(() => {
    return (
      contextMenu.value.source === "playlist" &&
      contextMenu.value.playlistId != null &&
      contextMenu.value.track != null
    );
  });

  
  
  const contextMenuPlaylistActions = computed(() => {
    const targetTrack = contextMenu.value.track;
    if (!targetTrack) return [];
  
    return playlists.value.map((item) => ({
      id: item.id,
      name: item.name,
      alreadyIncluded: item.trackPaths.includes(targetTrack.path),
    }));
  });

  
  
  const filteredContextMenuPlaylistActions = computed(() => {
    const normalized = normalizeSearchValue(contextMenuPlaylistSearch.value);
    if (!normalized) return contextMenuPlaylistActions.value;
  
    return contextMenuPlaylistActions.value.filter((item) =>
      normalizeSearchValue(item.name).includes(normalized),
    );
  });

  
  
  const toggleContextMenuTrackPlayback = async () => {
    if (contextMenuTargetsCurrentTrack.value) {
      await togglePlay();
      closeTrackContextMenu();
      return;
    }
  
    await playContextMenuTrack();
  };

  
  
  const goToContextMenuArtist = () => {
    if (!contextMenu.value.track) return;
    const artist = splitArtists(
      getLibraryTrackArtist(contextMenu.value.track),
    )[0];
    if (!artist) return;
    goToArtist(artist);
    closeTrackContextMenu();
  };

  
  
  const goToContextMenuAlbum = () => {
    if (!contextMenu.value.track) return;
    const album = getLibraryTrackAlbum(contextMenu.value.track);
    if (!album || album === "—") return;
    goToAlbum(album, getAlbumArtistForTrack(contextMenu.value.track));
    closeTrackContextMenu();
  };

  
  
  const isLibraryTrackSelected = (track: PlaylistTrack, index?: number) => {
    if (
      !selectedLibraryTrack.value ||
      selectedLibraryTrack.value.path !== track.path
    ) {
      return false;
    }
  
    if (
      currentViewMode.value === "playlist" &&
      activePlaylist.value &&
      typeof index === "number" &&
      displayedTracks.value[index]
    ) {
      return (
        selectedLibraryTrack.value.playlistId === activePlaylist.value.id &&
        selectedLibraryTrack.value.occurrenceIndex ===
          getTrackOccurrenceIndex(displayedTracks.value, index, track.path)
      );
    }
  
    return true;
  };

  
  
  const handleLibraryTrackPrimaryAction = (
    _event: MouseEvent,
    track: PlaylistTrack,
    index?: number,
  ) => {
    selectLibraryTrack(track, index);
  };

  
  
  const openLibraryTrackMenu = (
    event: MouseEvent,
    track: PlaylistTrack,
    index?: number,
  ) => {
    const isPlaylistTrack =
      currentViewMode.value === "playlist" && activePlaylist.value;
  
    selectLibraryTrack(track, index);
  
    openTrackContextMenu(
      event,
      track,
      isPlaylistTrack ? "playlist" : "library",
      null,
      isPlaylistTrack ? activePlaylist.value!.id : null,
      index,
    );
  };

  
  
  const playlist = ref<PlaylistTrack[]>([]);

  
  const playlists = ref<PlaylistSummary[]>([]);

  
  const queue = ref<QueueTrack[]>([]);

  
  const queueOriginalOrderIds = ref<number[]>([]);

  
  const queueConsumedHistory = ref<QueueTrack[]>([]);

  
  const currentQueueTrackId = ref<number | null>(null);

  
  const nextQueueId = ref(1);

  
  
  const currentIndex = ref(-1);

  
  const currentQueueIndex = ref(-1);

  
  const currentSource = ref<PlaybackSource>("library");

  
  const currentPlaybackContext = ref<PlaybackContext>(
    createPlaybackContext("library", "Biblioteca"),
  );

  
  
  const hoveredLibraryTrackPath = ref<string | null>(null);

  
  const hoveredQueueTrackId = ref<number | null>(null);

  
  const sidebarLibraryFilter = ref<SidebarLibraryFilter>("all");

  
  const sidebarLibrarySearch = ref("");

  
  const isSidebarSearchVisible = ref(false);

  
  const isLibrarySidebarCollapsed = ref(false);

  
  const isPlaylistCreatorVisible = ref(false);

  
  const newPlaylistName = ref("");

  
  const draggedTrack = ref<PlaylistTrack | null>(null);

  
  const sidebarDropTargetPlaylistId = ref<number | null>(null);

  
  let activeDragPreviewEl: HTMLElement | null = null;

  
  const playlistAddToast = ref<{
    playlistId: number;
    playlistName: string;
    trackTitle: string;
    artist: string;
    cover: string | null;
  } | null>(null);

  
  const duplicatePlaylistModal = ref<{
    playlistId: number;
    playlistName: string;
    track: PlaylistTrack;
  } | null>(null);

  
  let playlistAddToastTimeoutId: number | null = null;

  
  let lastLoggedDragPosition = "";

  
  let pendingTrackPointerDrag: {
    track: PlaylistTrack;
    startX: number;
    startY: number;
  } | null = null;

  
  let shouldSuppressNextWindowClick = false;

  
  
  const globalSearchInputRef = ref<HTMLInputElement | null>(null);

  
  const librarySearchInputRef = ref<HTMLInputElement | null>(null);

  
  const sidebarSearchInputRef = ref<HTMLInputElement | null>(null);

  
  const newPlaylistInputRef = ref<HTMLInputElement | null>(null);

  
  const contextMenuPlaylistSearchInputRef = ref<HTMLInputElement | null>(null);

  
  const emptyPlaylistSearchInputRef = ref<HTMLInputElement | null>(null);

  
  const globalSearchShellRef = ref<HTMLElement | null>(null);

  
  const isGlobalSearchPopoverOpen = ref(false);

  
  const isGlobalSearchLoading = ref(false);

  
  const committedGlobalSearch = ref("");

  
  const recentGlobalSearches = ref<RecentSearchItem[]>([]);

  
  let globalSearchLoadingFrame = 0;

  
  let isRestoringAppSession = false;

  
  let hasPendingAppSessionRestore = false;

  
  let sessionPersistTimeout: number | null = null;

  
  let sessionProgressInterval: number | null = null;

  let connectCommandPollInterval: number | null = null;

  const connectState = ref<ConnectStateRecord | null>(null);

  
  const emptyPlaylistSearch = ref("");

  
  const isEmptyPlaylistDiscoveryVisible = ref(true);

  
  
  const focusGlobalSearch = async () => {
    openGlobalSearchPopover();
    await nextTick();
    globalSearchInputRef.value?.focus();
    globalSearchInputRef.value?.select();
  };

  
  
  const focusContextSearch = async () => {
    await nextTick();
    librarySearchInputRef.value?.focus();
    librarySearchInputRef.value?.select();
  };

  
  
  const openGlobalSearchPopover = () => {
    isGlobalSearchPopoverOpen.value = true;
  };

  
  
  const closeGlobalSearchPopover = () => {
    isGlobalSearchPopoverOpen.value = false;
  };

  
  
  const onGlobalKeydown = async (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase();
    const interactiveContainer = target?.closest(
      'input, textarea, select, button, a, summary, [role="button"], [role="menuitem"]',
    );
  
    const isTypingElement =
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      target?.isContentEditable;
    const isInteractiveElement = Boolean(interactiveContainer) || isTypingElement;
  
    // Ctrl/Cmd + F => enfocar búsqueda
    const isGlobalSearchShortcut =
      (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l";
  
    if (isGlobalSearchShortcut) {
      e.preventDefault();
      await focusGlobalSearch();
      return;
    }
  
    const isContextSearchShortcut =
      (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f";
  
    if (isContextSearchShortcut) {
      e.preventDefault();
      await focusContextSearch();
      return;
    }
  
    if (e.key === "Escape") {
      closeTrackContextMenu();
      closePlaylistContextMenu();
      closePlaylistRenameModal();
      closePlaylistDeleteModal();
      closeDuplicatePlaylistModal();
    }
  
    // Espacio => play / pause
    // Solo si NO está interactuando con un control de la UI
    const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";
  
    if (isSpace && !isInteractiveElement) {
      e.preventDefault(); // evita scroll de la ventana
      await togglePlay();
    }
  };

  
  
  const isLibraryTrackHovered = (track: PlaylistTrack) => {
    return hoveredLibraryTrackPath.value === track.path;
  };

  
  
  const doesPlaybackContextMatchCurrentView = () => {
    if (isSearchViewActive.value) {
      return (
        currentPlaybackContext.value.kind === "search" &&
        currentPlaybackContext.value.label === committedGlobalSearch.value.trim()
      );
    }
  
    if (currentViewMode.value === "album") {
      return (
        currentPlaybackContext.value.kind === "album" &&
        currentPlaybackContext.value.label === activeAlbumViewKey.value
      );
    }
  
    if (currentViewMode.value === "playlist" && activePlaylist.value) {
      return (
        currentPlaybackContext.value.kind === "playlist" &&
        currentPlaybackContext.value.label === String(activePlaylist.value.id)
      );
    }
  
    if (currentViewMode.value === "artist") {
      return (
        currentPlaybackContext.value.kind === "artist" &&
        currentPlaybackContext.value.label === activeArtistView.value
      );
    }
  
    return currentPlaybackContext.value.kind === "library";
  };

  
  
  const getTrackOccurrenceIndex = (
    tracks: PlaylistTrack[],
    index: number,
    trackPath: string,
  ) => {
    let occurrence = 0;
  
    for (let cursor = 0; cursor <= index; cursor += 1) {
      if (tracks[cursor]?.path === trackPath) {
        occurrence += 1;
      }
    }
  
    return occurrence - 1;
  };

  
  
  const findTrackIndexByOccurrence = (
    tracks: PlaylistTrack[],
    trackPath: string,
    occurrenceIndex: number,
  ) => {
    let occurrence = 0;
  
    for (let index = 0; index < tracks.length; index += 1) {
      if (tracks[index]?.path !== trackPath) continue;
      if (occurrence === occurrenceIndex) return index;
      occurrence += 1;
    }
  
    return -1;
  };

  
  
  const getCurrentPlaylistOccurrenceIndex = () => {
    if (
      currentViewMode.value !== "playlist" ||
      !activePlaylist.value ||
      currentPlaybackContext.value.kind !== "playlist" ||
      currentPlaybackContext.value.label !== String(activePlaylist.value.id) ||
      currentQueueTrackId.value == null
    ) {
      return null;
    }
  
    const playbackSequence = [
      ...queueConsumedHistory.value,
      ...queue.value,
    ].filter(
      (item) =>
        item.playbackContext.kind === "playlist" &&
        item.playbackContext.label === String(activePlaylist.value?.id),
    );
  
    const currentSequenceIndex = playbackSequence.findIndex(
      (item) => item.queueId === currentQueueTrackId.value,
    );
    if (currentSequenceIndex < 0) return null;
  
    return getTrackOccurrenceIndex(
      playbackSequence,
      currentSequenceIndex,
      playbackSequence[currentSequenceIndex].path,
    );
  };

  
  
  const isLibraryTrackCurrent = (track: PlaylistTrack, index?: number) => {
    if (filePath.value !== track.path || !doesPlaybackContextMatchCurrentView()) {
      return false;
    }
  
    if (
      currentViewMode.value === "playlist" &&
      typeof index === "number" &&
      displayedTracks.value[index]
    ) {
      const currentOccurrenceIndex = getCurrentPlaylistOccurrenceIndex();
      if (currentOccurrenceIndex == null) return false;
  
      return (
        getTrackOccurrenceIndex(displayedTracks.value, index, track.path) ===
        currentOccurrenceIndex
      );
    }
  
    return true;
  };

  
  
  const shouldShowLibraryEqualizer = (track: PlaylistTrack, index?: number) => {
    return (
      isLibraryTrackCurrent(track, index) &&
      isPlaying.value &&
      !isLibraryTrackHovered(track)
    );
  };

  
  
  const shouldShowLibraryPauseIcon = (track: PlaylistTrack, index?: number) => {
    return (
      isLibraryTrackCurrent(track, index) &&
      isPlaying.value &&
      isLibraryTrackHovered(track)
    );
  };

  
  
  const shouldShowLibraryPlayIcon = (track: PlaylistTrack, index?: number) => {
    if (!isLibraryTrackHovered(track)) return false;
  
    // Hover sobre la actual en pausa => play
    if (isLibraryTrackCurrent(track, index) && !isPlaying.value) return true;
  
    // Hover sobre una que no es la actual => play
    if (!isLibraryTrackCurrent(track, index)) return true;
  
    return false;
  };

  
  
  const shouldShowLibraryIndexNumber = (track: PlaylistTrack, index?: number) => {
    // Activa reproduciendo sin hover => equalizer
    if (shouldShowLibraryEqualizer(track, index)) return false;
  
    // Hover sobre cualquier fila => icono
    if (
      shouldShowLibraryPlayIcon(track, index) ||
      shouldShowLibraryPauseIcon(track, index)
    ) {
      return false;
    }
  
    return true;
  };

  
  
  const isBackendTrackReady = ref(false);

  
  const filePath = ref<string | null>(null);

  
  const fileExtension = ref("");

  
  const isPlaying = ref(false);

  
  const isMuted = ref(false);

  
  type LoopMode = "off" | "all" | "one";

  
  type ShuffleHistoryEntry = {
    source: PlaybackSource;
    index: number;
  };

  
  
  const loopMode = ref<LoopMode>("off");

  
  const loopTooltip = computed(() => {
    if (loopMode.value === "off") return "Habilitar repetir";
    if (loopMode.value === "all") return "Repetir una canción";
    return "Desactivar repetir";
  });

  
  const isShuffleEnabled = ref(false);

  
  const shuffleTooltip = computed(() => {
    return isShuffleEnabled.value
      ? "Desactivar modo aleatorio"
      : "Habilitar modo aleatorio";
  });

  
  const shuffleHistory = ref<ShuffleHistoryEntry[]>([]);

  
  const audioError = ref("");

  
  const isStopped = ref(false);

  
  
  const currentTime = ref(0);

  
  const duration = ref(0);

  
  const volume = ref(10);

  
  const lastVolumeBeforeMute = ref(10);

  
  
  const rawFileName = ref("");

  
  const metadata = ref<AudioMetadata | null>(null);

  
  const metadataTrackPath = ref<string | null>(null);

  
  
  const isDraggingSeek = ref(false);

  
  const seekPreviewTime = ref(0);

  
  const isSeekInFlight = ref(false);

  
  let seekRequestId = 0;

  
  
  let progressInterval: number | null = null;

  
  
  const musicDirectories = ref<string[]>([]);

  
  let unlistenFsChanges: UnlistenFn | null = null;

  
  
  // ====== BIBLIOTECA / BÚSQUEDA / PANEL ======
  const librarySearch = ref("");

  
  const globalSearch = ref("");

  
  const queueSearch = ref("");

  
  const isQueuePanelOpen = ref(false);

  
  const isRoutesManagerOpen = ref(false);

  
  
  // ====== NAVEGACIÓN ARTISTA / ÁLBUM ======
  type ViewMode =
    | "library"
    | "artist"
    | "album"
    | "playlist"
    | "search"
    | "spotiflac";

  
  type ViewSnapshot = {
    mode: ViewMode;
    artist: string | null;
    album: string | null;
    albumArtist: string | null;
    playlistId: number | null;
    search: string;
    globalQuery: string;
  };

  
  
  const currentViewMode = ref<ViewMode>("library");
  const spotiFlacUrl = "/spotiflac/index.html";
  const isSpotiFlacChecking = ref(false);
  const isSpotiFlacReady = ref(true);
  const spotiFlacStatusMessage = ref("SpotiFLAC esta listo.");
  const isSpotiFlacOffline = ref(false);

  
  const activeArtistView = ref<string | null>(null);

  
  const activeAlbumView = ref<string | null>(null);

  
  const activeAlbumArtistView = ref<string | null>(null);

  
  const activePlaylistViewId = ref<number | null>(null);

  
  const viewBackHistory = ref<ViewSnapshot[]>([]);

  
  const viewForwardHistory = ref<ViewSnapshot[]>([]);

  
  
  const getTrackSearchBase = (track: PlaylistTrack) => {
    const metadata = getLibraryTrackMetadata(track);
  
    return [
      track.fileName,
      track.extension,
      track.path,
      metadata?.title,
      metadata?.artist,
      metadata?.album,
      metadata?.album_artist,
      metadata?.year,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  };

  
  
  const getCurrentViewSnapshot = (): ViewSnapshot => ({
    mode: currentViewMode.value,
    artist: activeArtistView.value,
    album: activeAlbumView.value,
    albumArtist: activeAlbumArtistView.value,
    playlistId: activePlaylistViewId.value,
    search: librarySearch.value,
    globalQuery: committedGlobalSearch.value,
  });

  
  
  const isSameViewSnapshot = (a: ViewSnapshot, b: ViewSnapshot) => {
    return (
      a.mode === b.mode &&
      a.artist === b.artist &&
      a.album === b.album &&
      a.albumArtist === b.albumArtist &&
      a.playlistId === b.playlistId &&
      a.search === b.search &&
      a.globalQuery === b.globalQuery
    );
  };

  
  
  const applyViewSnapshot = (snapshot: ViewSnapshot) => {
    currentViewMode.value = snapshot.mode;
    activeArtistView.value = snapshot.artist;
    activeAlbumView.value = snapshot.album;
    activeAlbumArtistView.value = snapshot.albumArtist;
    activePlaylistViewId.value = snapshot.playlistId;
    librarySearch.value = snapshot.search;
    committedGlobalSearch.value = snapshot.globalQuery;
    globalSearch.value = snapshot.globalQuery;
  };

  
  
  const navigateToView = (
    nextSnapshot: ViewSnapshot,
    options?: {
      recordHistory?: boolean;
      clearForwardHistory?: boolean;
    },
  ) => {
    const { recordHistory = true, clearForwardHistory = true } = options ?? {};
    const currentSnapshot = getCurrentViewSnapshot();
  
    if (isSameViewSnapshot(currentSnapshot, nextSnapshot)) {
      return;
    }
  
    if (recordHistory) {
      viewBackHistory.value.push(currentSnapshot);
    }
  
    if (clearForwardHistory) {
      viewForwardHistory.value = [];
    }
  
    applyViewSnapshot(nextSnapshot);
  };

  
  
  const goBackView = () => {
    const previousSnapshot = viewBackHistory.value.pop();
    if (!previousSnapshot) return;
  
    viewForwardHistory.value.push(getCurrentViewSnapshot());
    applyViewSnapshot(previousSnapshot);
  };

  
  
  const goForwardView = () => {
    const nextSnapshot = viewForwardHistory.value.pop();
    if (!nextSnapshot) return;
  
    viewBackHistory.value.push(getCurrentViewSnapshot());
    applyViewSnapshot(nextSnapshot);
  };

  
  
  const goHomeView = () => {
    navigateToView({
      mode: "library",
      artist: null,
      album: null,
      albumArtist: null,
      playlistId: null,
      search: "",
      globalQuery: "",
    });
  };

  const updateSpotiFlacConnectivityStatus = () => {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    isSpotiFlacOffline.value = isOffline;

    if (isOffline) {
      isSpotiFlacReady.value = false;
      spotiFlacStatusMessage.value =
        "Necesitas internet para usar esta funcion de SpotiFLAC.";
      return;
    }

    isSpotiFlacReady.value = true;
    spotiFlacStatusMessage.value = "SpotiFLAC esta listo.";
  };

  const openSpotiFlacView = () => {
    updateSpotiFlacConnectivityStatus();
    navigateToView({
      mode: "spotiflac",
      artist: null,
      album: null,
      albumArtist: null,
      playlistId: null,
      search: "",
      globalQuery: "",
    });
  };

  const checkSpotiFlacPanel = async () => {
    isSpotiFlacChecking.value = true;
    updateSpotiFlacConnectivityStatus();

    window.setTimeout(() => {
      isSpotiFlacChecking.value = false;
    }, 250);
  };

  const reloadSpotiFlacFrame = () => {
    const frame = document.querySelector<HTMLIFrameElement>(".spotiflac-embed");
    if (frame) {
      frame.contentWindow?.location.reload();
      return;
    }

    void checkSpotiFlacPanel();
  };

  
  
  const canGoBackView = computed(() => viewBackHistory.value.length > 0);

  
  const canGoForwardView = computed(() => viewForwardHistory.value.length > 0);

  
  
  const getLibraryPlaybackContext = (): PlaybackContext => {
    if (isSearchViewActive.value) {
      return createPlaybackContext("search", committedGlobalSearch.value.trim());
    }
  
    if (normalizedGlobalSearch.value && isGlobalSearchPopoverOpen.value) {
      return createPlaybackContext("search", globalSearch.value.trim());
    }
  
    if (currentViewMode.value === "album" && activeAlbumView.value) {
      return createPlaybackContext("album", activeAlbumViewKey.value);
    }
  
    if (
      currentViewMode.value === "playlist" &&
      activePlaylistViewId.value != null
    ) {
      const activePlaylist = playlists.value.find(
        (item) => item.id === activePlaylistViewId.value,
      );
      if (activePlaylist) {
        return createPlaybackContext("playlist", String(activePlaylist.id));
      }
    }
  
    if (currentViewMode.value === "artist" && activeArtistView.value) {
      return createPlaybackContext("artist", activeArtistView.value);
    }
  
    return createPlaybackContext("library", "Biblioteca");
  };

  
  
  const getQueuePlaybackContext = (): PlaybackContext => {
    return createPlaybackContext("queue", "Fila de reproducción");
  };

  
  
  // Ir a la vista de Artista
  const goToArtist = (artist: string) => {
    if (!artist || artist === "Artista desconocido") return;
    navigateToView({
      mode: "artist",
      artist,
      album: null,
      albumArtist: null,
      playlistId: null,
      search: "",
      globalQuery: globalSearch.value.trim(),
    });
  };

  
  
  // Ir a la vista de Álbum
  const goToAlbum = (album: string, artist?: string | null) => {
    if (!album || album === "—") return;
    navigateToView({
      mode: "album",
      artist: artist ?? activeArtistView.value,
      album,
      albumArtist: artist ?? activeArtistView.value,
      playlistId: null,
      search: "",
      globalQuery: globalSearch.value.trim(),
    });
  };

  
  
  // ====== NUEVO: Función para dividir artistas por punto y coma ======
  const goToPlaylist = (playlistId: number) => {
    const targetPlaylist = playlists.value.find((item) => item.id === playlistId);
    if (!targetPlaylist) return;
  
    navigateToView({
      mode: "playlist",
      artist: null,
      album: null,
      albumArtist: null,
      playlistId,
      search: "",
      globalQuery: globalSearch.value.trim(),
    });
  };

  
  
  const loadPlaylists = async () => {
    try {
      playlists.value = await invoke<PlaylistSummary[]>("get_playlists");
    } catch (error) {
      console.error("No se pudieron cargar las playlists:", error);
    }
  };

  
  
  const toggleSidebarLibraryFilter = (
    filter: Exclude<SidebarLibraryFilter, "all">,
  ) => {
    sidebarLibraryFilter.value =
      sidebarLibraryFilter.value === filter ? "all" : filter;
  };

  
  
  const toggleSidebarSearch = async () => {
    isSidebarSearchVisible.value = !isSidebarSearchVisible.value;
    if (isSidebarSearchVisible.value) {
      await nextTick();
      sidebarSearchInputRef.value?.focus();
      return;
    }
  
    sidebarLibrarySearch.value = "";
  };

  
  
  const toggleLibrarySidebar = () => {
    isLibrarySidebarCollapsed.value = !isLibrarySidebarCollapsed.value;
  
    if (isLibrarySidebarCollapsed.value) {
      isSidebarSearchVisible.value = false;
      isPlaylistCreatorVisible.value = false;
      sidebarLibrarySearch.value = "";
      return;
    }
  };

  
  
  const showPlaylistCreator = async () => {
    if (isLibrarySidebarCollapsed.value) {
      isLibrarySidebarCollapsed.value = false;
    }
    isPlaylistCreatorVisible.value = true;
    await nextTick();
    newPlaylistInputRef.value?.focus();
  };

  
  
  const cancelPlaylistCreator = () => {
    isPlaylistCreatorVisible.value = false;
    newPlaylistName.value = "";
  };

  
  
  const submitPlaylistCreation = async () => {
    const trimmed = newPlaylistName.value.trim();
    if (!trimmed) return;
  
    try {
      const created = await invoke<PlaylistSummary>("create_playlist", {
        name: trimmed,
      });
      await loadPlaylists();
      cancelPlaylistCreator();
      goToPlaylist(created.id);
    } catch (error) {
      console.error("No se pudo crear la playlist:", error);
    }
  };

  
  
  const closeDuplicatePlaylistModal = () => {
    duplicatePlaylistModal.value = null;
  };

  
  
  const showPlaylistAddToast = (
    playlistId: number,
    playlistName: string,
    track: PlaylistTrack,
  ) => {
    if (playlistAddToastTimeoutId != null) {
      window.clearTimeout(playlistAddToastTimeoutId);
    }
  
    playlistAddToast.value = {
      playlistId,
      playlistName,
      trackTitle: getTrackDisplayTitle(track),
      artist: getLibraryTrackArtist(track),
      cover: getLibraryTrackCover(track),
    };
  
    playlistAddToastTimeoutId = window.setTimeout(() => {
      playlistAddToast.value = null;
      playlistAddToastTimeoutId = null;
    }, 2600);
  };

  
  
  const addTrackToPlaylist = async (
    playlistId: number,
    track: PlaylistTrack,
    options?: {
      allowDuplicate?: boolean;
      skipDuplicatePrompt?: boolean;
    },
  ) => {
    try {
      const targetPlaylist = playlists.value.find(
        (item) => item.id === playlistId,
      );
      const alreadyIncluded =
        targetPlaylist?.trackPaths.includes(track.path) ?? false;
  
      if (
        alreadyIncluded &&
        !options?.allowDuplicate &&
        !options?.skipDuplicatePrompt
      ) {
        duplicatePlaylistModal.value = {
          playlistId,
          playlistName: targetPlaylist?.name ?? "esta playlist",
          track,
        };
        return;
      }
  
      console.log("[playlist-dnd] addTrackToPlaylist:start", {
        playlistId,
        playlistName: targetPlaylist?.name ?? null,
        trackPath: track.path,
        trackTitle: getTrackDisplayTitle(track),
        alreadyIncluded,
        allowDuplicate: options?.allowDuplicate ?? false,
      });
  
      await invoke("add_track_to_playlist", {
        playlistId,
        trackPath: track.path,
        allowDuplicate: options?.allowDuplicate ?? false,
      });
      await loadPlaylists();
  
      const updatedPlaylist = playlists.value.find(
        (item) => item.id === playlistId,
      );
      const nowIncluded =
        updatedPlaylist?.trackPaths.includes(track.path) ?? false;
  
      console.log("[playlist-dnd] addTrackToPlaylist:after-load", {
        playlistId,
        playlistName: updatedPlaylist?.name ?? targetPlaylist?.name ?? null,
        trackPath: track.path,
        nowIncluded,
        trackCount: updatedPlaylist?.trackPaths.length ?? null,
      });
  
      if (targetPlaylist) {
        showPlaylistAddToast(playlistId, targetPlaylist.name, track);
      }
    } catch (error) {
      console.error("No se pudo agregar la canción a la playlist:", error);
    }
  };

  
  
  const addContextMenuTrackToPlaylist = async (playlistId: number) => {
    if (!contextMenu.value.track) return;
    await addTrackToPlaylist(playlistId, contextMenu.value.track);
    closeTrackContextMenu();
  };

  
  
  const confirmDuplicatePlaylistAdd = async () => {
    if (!duplicatePlaylistModal.value) return;
  
    const { playlistId, track } = duplicatePlaylistModal.value;
    closeDuplicatePlaylistModal();
    await addTrackToPlaylist(playlistId, track, {
      allowDuplicate: true,
      skipDuplicatePrompt: true,
    });
  };

  
  
  const toggleContextMenuPlaylistPicker = async () => {
    if (contextMenuPlaylistActions.value.length === 0) return;
    isContextMenuPlaylistPickerVisible.value =
      !isContextMenuPlaylistPickerVisible.value;
    if (!isContextMenuPlaylistPickerVisible.value) {
      contextMenuPlaylistSearch.value = "";
      return;
    }
  
    await nextTick();
    contextMenuPlaylistSearchInputRef.value?.focus();
  };

  
  
  const openContextMenuPlaylistCreator = async () => {
    closeTrackContextMenu();
    await showPlaylistCreator();
  };

  
  
  const openEmptyPlaylistDiscovery = async () => {
    isEmptyPlaylistDiscoveryVisible.value = true;
    await nextTick();
    emptyPlaylistSearchInputRef.value?.focus();
    emptyPlaylistSearchInputRef.value?.select();
  };

  
  
  const closeEmptyPlaylistDiscovery = () => {
    isEmptyPlaylistDiscoveryVisible.value = false;
    emptyPlaylistSearch.value = "";
  };

  
  
  const addTrackToActivePlaylist = async (track: PlaylistTrack) => {
    if (!activePlaylist.value) return;
    await addTrackToPlaylist(activePlaylist.value.id, track);
  };

  
  
  const removeTrackFromPlaylist = async (
    playlistId: number,
    track: PlaylistTrack,
  ) => {
    try {
      await invoke("remove_track_from_playlist", {
        playlistId,
        trackPath: track.path,
      });
      await loadPlaylists();
  
      if (
        currentViewMode.value === "playlist" &&
        activePlaylistViewId.value === playlistId
      ) {
        selectedLibraryTrack.value = null;
      }
    } catch (error) {
      console.error("No se pudo quitar la canción de la playlist:", error);
    }
  };

  
  
  const removeContextMenuTrackFromPlaylist = async () => {
    if (!contextMenu.value.track || contextMenu.value.playlistId == null) return;
    await removeTrackFromPlaylist(
      contextMenu.value.playlistId,
      contextMenu.value.track,
    );
    closeTrackContextMenu();
  };

  
  
  const cleanupTrackDragState = () => {
    draggedTrack.value = null;
    sidebarDropTargetPlaylistId.value = null;
    document.body.classList.remove("is-track-dragging");
  
    if (activeDragPreviewEl) {
      activeDragPreviewEl.remove();
      activeDragPreviewEl = null;
    }
  };

  
  
  const moveTrackDragPreview = (clientX: number, clientY: number) => {
    if (!activeDragPreviewEl || clientX <= 0 || clientY <= 0) return;
  
    activeDragPreviewEl.style.opacity = "1";
    activeDragPreviewEl.style.transform = `translate(${clientX + 18}px, ${clientY + 18}px)`;
  };

  
  
  const updateSidebarDropTargetFromPoint = (clientX: number, clientY: number) => {
    const target = getSidebarPlaylistDropTargetFromElement(
      document.elementFromPoint(clientX, clientY),
    );
  
    if (target !== sidebarDropTargetPlaylistId.value) {
      console.log("[playlist-dnd] pointer-hover-playlist", {
        x: clientX,
        y: clientY,
        hoveredPlaylistId: target,
        draggedTrackPath: draggedTrack.value?.path ?? null,
      });
    }
  
    sidebarDropTargetPlaylistId.value = target;
    return target;
  };

  
  
  const resolveDraggedTrack = (event?: DragEvent | null) => {
    if (draggedTrack.value) return draggedTrack.value;
  
    const trackPath =
      event?.dataTransfer?.getData("application/x-playlist-track") ||
      event?.dataTransfer?.getData("text/plain") ||
      "";
  
    if (!trackPath) {
      console.warn("[playlist-dnd] resolveDraggedTrack:no-track-path", {
        hasDraggedTrack: draggedTrack.value != null,
        types: event?.dataTransfer ? Array.from(event.dataTransfer.types) : [],
      });
      return null;
    }
  
    const resolved =
      playlist.value.find((track) => track.path === trackPath) ?? null;
    console.log("[playlist-dnd] resolveDraggedTrack", {
      trackPath,
      resolved: resolved != null,
      title: resolved ? getTrackDisplayTitle(resolved) : null,
    });
    return resolved;
  };

  
  
  const createTrackDragPreview = (track: PlaylistTrack) => {
    const preview = document.createElement("div");
    preview.className = "track-drag-preview";
    Object.assign(preview.style, {
      position: "fixed",
      top: "0",
      left: "0",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      minWidth: "220px",
      maxWidth: "320px",
      padding: "8px 12px 8px 8px",
      borderRadius: "12px",
      background: "rgba(42, 42, 42, 0.94)",
      boxShadow:
        "0 16px 34px rgba(0, 0, 0, 0.38), inset 0 0 0 1px rgba(255, 255, 255, 0.1)",
      color: "#ffffff",
      pointerEvents: "none",
      zIndex: "9999",
      opacity: "0",
      transform: "translate(-9999px, -9999px)",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);
  
    const coverWrap = document.createElement("div");
    coverWrap.className = "track-drag-preview-cover";
    Object.assign(coverWrap.style, {
      width: "42px",
      height: "42px",
      borderRadius: "10px",
      overflow: "hidden",
      flex: "0 0 42px",
      background: "rgba(255, 255, 255, 0.08)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    } satisfies Partial<CSSStyleDeclaration>);
  
    const cover = getLibraryTrackCover(track);
    if (cover) {
      const image = document.createElement("img");
      image.src = cover;
      image.alt = "";
      Object.assign(image.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      } satisfies Partial<CSSStyleDeclaration>);
      coverWrap.appendChild(image);
    } else {
      coverWrap.classList.add("is-placeholder");
      Object.assign(coverWrap.style, {
        background: "linear-gradient(135deg, #5b21b6, #99f6e4)",
        fontSize: "18px",
        color: "rgba(255, 255, 255, 0.92)",
      } satisfies Partial<CSSStyleDeclaration>);
      coverWrap.textContent = "♪";
    }
  
    const textWrap = document.createElement("div");
    textWrap.className = "track-drag-preview-copy";
    Object.assign(textWrap.style, {
      minWidth: "0",
      display: "flex",
      flexDirection: "column",
      gap: "2px",
    } satisfies Partial<CSSStyleDeclaration>);
  
    const title = document.createElement("div");
    title.className = "track-drag-preview-title";
    title.textContent = getTrackDisplayTitle(track);
    Object.assign(title.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "14px",
      fontWeight: "700",
      color: "#ffffff",
    } satisfies Partial<CSSStyleDeclaration>);
  
    const subtitle = document.createElement("div");
    subtitle.className = "track-drag-preview-subtitle";
    subtitle.textContent = getLibraryTrackArtist(track);
    Object.assign(subtitle.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "13px",
      color: "rgba(255, 255, 255, 0.72)",
    } satisfies Partial<CSSStyleDeclaration>);
  
    textWrap.append(title, subtitle);
    preview.append(coverWrap, textWrap);
    document.body.appendChild(preview);
    activeDragPreviewEl = preview;
    return preview;
  };

  
  
  const getSidebarPlaylistDropTargetFromElement = (candidate: Element | null) => {
    const target = candidate?.closest(
      "[data-sidebar-drop-playlist-id]",
    ) as HTMLElement | null;
    if (!target) return null;
  
    const rawId = target.dataset.sidebarDropPlaylistId;
    if (!rawId) return null;
  
    const playlistId = Number(rawId);
    return Number.isFinite(playlistId) ? playlistId : null;
  };

  
  
  const isSidebarItemPlaylistDropTarget = (item: SidebarLibraryItem) => {
    return item.kind === "playlist" && item.playlistId != null;
  };

  
  
  const isSidebarItemDropEnabled = (item: SidebarLibraryItem) => {
    return draggedTrack.value != null && isSidebarItemPlaylistDropTarget(item);
  };

  
  
  const isSidebarItemDropActive = (item: SidebarLibraryItem) => {
    return (
      isSidebarItemDropEnabled(item) &&
      sidebarDropTargetPlaylistId.value != null &&
      sidebarDropTargetPlaylistId.value === item.playlistId
    );
  };

  
  
  const removePendingTrackPointerListeners = () => {
    window.removeEventListener("mousemove", handlePendingTrackPointerMove);
    window.removeEventListener("mouseup", handlePendingTrackPointerUp);
  };

  
  
  const handleTrackPointerDown = (event: MouseEvent, track: PlaylistTrack) => {
    if (event.button !== 0) return;
  
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "button, input, textarea, select, a, .interactive-index, .track-actions",
      )
    ) {
      return;
    }
  
    removePendingTrackPointerListeners();
    pendingTrackPointerDrag = {
      track,
      startX: event.clientX,
      startY: event.clientY,
    };
  
    console.log("[playlist-dnd] pointerdown", {
      trackPath: track.path,
      title: getTrackDisplayTitle(track),
      x: event.clientX,
      y: event.clientY,
    });
  
    window.addEventListener("mousemove", handlePendingTrackPointerMove);
    window.addEventListener("mouseup", handlePendingTrackPointerUp);
  };

  
  
  function handlePendingTrackPointerMove(event: MouseEvent) {
    if (!pendingTrackPointerDrag) return;
  
    const deltaX = event.clientX - pendingTrackPointerDrag.startX;
    const deltaY = event.clientY - pendingTrackPointerDrag.startY;
    const distance = Math.hypot(deltaX, deltaY);
  
    if (!draggedTrack.value && distance < 8) {
      return;
    }
  
    if (!draggedTrack.value) {
      draggedTrack.value = pendingTrackPointerDrag.track;
      sidebarDropTargetPlaylistId.value = null;
      document.body.classList.add("is-track-dragging");
      lastLoggedDragPosition = "";
      createTrackDragPreview(pendingTrackPointerDrag.track);
  
      console.log("[playlist-dnd] custom-drag-start", {
        trackPath: pendingTrackPointerDrag.track.path,
        title: getTrackDisplayTitle(pendingTrackPointerDrag.track),
        artist: getLibraryTrackArtist(pendingTrackPointerDrag.track),
        x: event.clientX,
        y: event.clientY,
      });
    }
  
    const positionKey = `${event.clientX}:${event.clientY}`;
    if (positionKey !== lastLoggedDragPosition) {
      console.log("[playlist-dnd] custom-drag-move", {
        x: event.clientX,
        y: event.clientY,
      });
      lastLoggedDragPosition = positionKey;
    }
  
    moveTrackDragPreview(event.clientX, event.clientY);
    updateSidebarDropTargetFromPoint(event.clientX, event.clientY);
    event.preventDefault();
  }

  
  
  async function handlePendingTrackPointerUp(event: MouseEvent) {
    const pendingDrag = pendingTrackPointerDrag;
    pendingTrackPointerDrag = null;
    removePendingTrackPointerListeners();
  
    if (!draggedTrack.value || !pendingDrag) {
      return;
    }
  
    const targetPlaylistId = updateSidebarDropTargetFromPoint(
      event.clientX,
      event.clientY,
    );
  
    console.log("[playlist-dnd] custom-drag-end", {
      x: event.clientX,
      y: event.clientY,
      targetPlaylistId,
      trackPath: draggedTrack.value.path,
    });
  
    shouldSuppressNextWindowClick = true;
    window.setTimeout(() => {
      shouldSuppressNextWindowClick = false;
    }, 0);
  
    try {
      if (targetPlaylistId == null) {
        console.warn("[playlist-dnd] custom-drop:no-target", {
          x: event.clientX,
          y: event.clientY,
          trackPath: draggedTrack.value.path,
        });
        return;
      }
  
      await addTrackToPlaylist(targetPlaylistId, draggedTrack.value);
    } finally {
      cleanupTrackDragState();
    }
  }

  
  
  const handleSidebarItemDragEnter = (
    event: DragEvent,
    item: SidebarLibraryItem,
  ) => {
    if (!isSidebarItemDropEnabled(item) || item.playlistId == null) return;
    console.log("[playlist-dnd] sidebar-item-dragenter", {
      playlistId: item.playlistId,
      playlistTitle: item.title,
      x: event.clientX,
      y: event.clientY,
    });
    event.preventDefault();
    sidebarDropTargetPlaylistId.value = item.playlistId;
  };

  
  
  const handleSidebarItemDragOver = (
    event: DragEvent,
    item: SidebarLibraryItem,
  ) => {
    if (!isSidebarItemDropEnabled(item) || item.playlistId == null) return;
    console.log("[playlist-dnd] sidebar-item-dragover", {
      playlistId: item.playlistId,
      playlistTitle: item.title,
      x: event.clientX,
      y: event.clientY,
    });
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    sidebarDropTargetPlaylistId.value = item.playlistId;
  };

  
  
  const handleSidebarListDragOver = (event: DragEvent) => {
    if (!draggedTrack.value) return;
  
    const target = getSidebarPlaylistDropTargetFromElement(
      document.elementFromPoint(event.clientX, event.clientY),
    );
  
    if (target == null) {
      sidebarDropTargetPlaylistId.value = null;
      return;
    }
  
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    sidebarDropTargetPlaylistId.value = target;
  };

  
  
  const handleSidebarListDrop = async (event: DragEvent) => {
    const track = resolveDraggedTrack(event);
    if (!track) {
      console.warn("[playlist-dnd] sidebar-list-drop:no-track", {
        x: event.clientX,
        y: event.clientY,
        hoveredPlaylistId: sidebarDropTargetPlaylistId.value,
        types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
      });
      return;
    }
  
    const targetPlaylistId =
      getSidebarPlaylistDropTargetFromElement(
        document.elementFromPoint(event.clientX, event.clientY),
      ) ?? sidebarDropTargetPlaylistId.value;
  
    console.log("[playlist-dnd] sidebar-list-drop", {
      x: event.clientX,
      y: event.clientY,
      targetPlaylistId,
      hoveredPlaylistId: sidebarDropTargetPlaylistId.value,
      trackPath: track.path,
      types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
    });
  
    if (targetPlaylistId == null) {
      console.warn("[playlist-dnd] sidebar-list-drop:no-target", {
        x: event.clientX,
        y: event.clientY,
        trackPath: track.path,
      });
      cleanupTrackDragState();
      return;
    }
  
    event.preventDefault();
  
    try {
      await addTrackToPlaylist(targetPlaylistId, track);
    } finally {
      cleanupTrackDragState();
    }
  };

  
  
  const handleSidebarListDragLeave = (event: DragEvent) => {
    const currentTarget = event.currentTarget as Node | null;
    const relatedTarget = event.relatedTarget as Node | null;
  
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
  
    sidebarDropTargetPlaylistId.value = null;
  };

  
  
  const handleSidebarItemDragLeave = (
    event: DragEvent,
    item: SidebarLibraryItem,
  ) => {
    const currentTarget = event.currentTarget as Node | null;
    const relatedTarget = event.relatedTarget as Node | null;
  
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
  
    if (
      item.playlistId != null &&
      sidebarDropTargetPlaylistId.value === item.playlistId
    ) {
      sidebarDropTargetPlaylistId.value = null;
    }
  };

  
  
  const handleSidebarItemDrop = async (
    event: DragEvent,
    item: SidebarLibraryItem,
  ) => {
    const track = resolveDraggedTrack(event);
    if (!track || item.playlistId == null || item.kind !== "playlist") {
      console.warn("[playlist-dnd] sidebar-item-drop:blocked", {
        hasTrack: track != null,
        playlistId: item.playlistId,
        kind: item.kind,
        x: event.clientX,
        y: event.clientY,
        types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
      });
      return;
    }
  
    console.log("[playlist-dnd] sidebar-item-drop", {
      playlistId: item.playlistId,
      playlistTitle: item.title,
      trackPath: track.path,
      x: event.clientX,
      y: event.clientY,
    });
    event.preventDefault();
    sidebarDropTargetPlaylistId.value = item.playlistId;
  
    try {
      await addTrackToPlaylist(item.playlistId, track);
    } finally {
      cleanupTrackDragState();
    }
  };

  
  
  const openRenamePlaylistModal = (playlistId: number) => {
    const targetPlaylist = playlists.value.find((item) => item.id === playlistId);
    if (!targetPlaylist) return;
  
    renamePlaylistTargetId.value = playlistId;
    renamePlaylistName.value = targetPlaylist.name;
    isRenamePlaylistModalVisible.value = true;
    closePlaylistContextMenu();
  };

  
  
  const submitPlaylistRename = async () => {
    const playlistId = renamePlaylistTargetId.value;
    const trimmed = renamePlaylistName.value.trim();
  
    if (playlistId == null || !trimmed) return;
  
    try {
      await invoke("rename_playlist", {
        playlistId,
        name: trimmed,
      });
      await loadPlaylists();
      closePlaylistRenameModal();
    } catch (error) {
      console.error("No se pudo renombrar la playlist:", error);
    }
  };

  
  
  const requestDeletePlaylist = (playlistId: number) => {
    playlistPendingDeletionId.value = playlistId;
    closePlaylistContextMenu();
  };

  
  
  const playlistPendingDeletion = computed(() => {
    if (playlistPendingDeletionId.value == null) return null;
    return (
      playlists.value.find(
        (item) => item.id === playlistPendingDeletionId.value,
      ) ?? null
    );
  });

  
  
  const confirmDeletePlaylist = async () => {
    const playlistId = playlistPendingDeletionId.value;
    if (playlistId == null) return;
  
    try {
      await invoke("delete_playlist", { playlistId });
      closePlaylistDeleteModal();
      await loadPlaylists();
  
      if (activePlaylistViewId.value === playlistId) {
        navigateToView({
          mode: "library",
          artist: null,
          album: null,
          albumArtist: null,
          playlistId: null,
          search: "",
          globalQuery: globalSearch.value.trim(),
        });
      }
    } catch (error) {
      console.error("No se pudo eliminar la playlist:", error);
    }
  };

  
  
  const playPlaylistFromContextMenu = async () => {
    const playlistId = activePlaylistContextMenuTarget.value?.id;
    if (playlistId == null) return;
    await playPlaylistById(playlistId);
    closePlaylistContextMenu();
  };

  
  
  const addPlaylistToQueueFromContextMenu = () => {
    const playlistId = activePlaylistContextMenuTarget.value?.id;
    if (playlistId == null) return;
    addPlaylistToQueue(playlistId);
    closePlaylistContextMenu();
  };

  
  
  const splitArtists = (artistString: string) => {
    if (!artistString) return ["Artista desconocido"]; // Ahora separa por coma (,) O punto y coma (;)
    return artistString
      .split(/[,;]/)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
  };

  
  
  const artistIndex = computed<SearchArtistResult[]>(() => {
    const map = new Map<string, SearchArtistResult>();
  
    playlist.value.forEach((track) => {
      splitArtists(getLibraryTrackArtist(track)).forEach((artist) => {
        if (!artist || artist === "Artista desconocido") return;
  
        const existing = map.get(artist);
        if (existing) {
          existing.tracks.push(track);
          if (!existing.cover) {
            existing.cover = getLibraryTrackCover(track);
          }
          return;
        }
  
        map.set(artist, {
          name: artist,
          cover: getLibraryTrackCover(track),
          tracks: [track],
        });
      });
    });
  
    return Array.from(map.values()).sort(
      (a, b) => b.tracks.length - a.tracks.length,
    );
  });

  
  
  const albumIndex = computed<SearchAlbumResult[]>(() => {
    const map = new Map<string, SearchAlbumResult>();
  
    playlist.value.forEach((track) => {
      const album = getLibraryTrackAlbum(track);
      if (!album || album === "—") return;
  
      const artist =
        getLibraryTrackMetadata(track)?.album_artist ||
        getLibraryTrackArtist(track);
      const key = `${album}::${artist}`;
      const existing = map.get(key);
  
      if (existing) {
        existing.tracks.push(track);
        if (!existing.cover) {
          existing.cover = getLibraryTrackCover(track);
        }
        return;
      }
  
      map.set(key, {
        name: album,
        artist,
        cover: getLibraryTrackCover(track),
        tracks: [track],
      });
    });
  
    return Array.from(map.values()).sort(
      (a, b) => b.tracks.length - a.tracks.length,
    );
  });

  
  
  // ====== MODIFICADO: Computado de Canciones del artista actual ======
  const activeArtistTracks = computed(() => {
    if (!activeArtistView.value) return [];
    return playlist.value.filter((t) => {
      // Obtenemos los artistas de la pista y los dividimos en un arreglo
      const trackArtists = splitArtists(getLibraryTrackArtist(t));
      // Retornamos true si el artista que estamos viendo ESTÁ INCLUIDO en ese arreglo
      return trackArtists.includes(activeArtistView.value!);
    });
  });

  
  
  // Computado: Álbumes únicos del artista actual con su carátula
  const activeArtistAlbums = computed(() => {
    const albumsMap = new Map<string, string | null>();
    activeArtistTracks.value.forEach((t) => {
      const al = getLibraryTrackAlbum(t);
      if (al && al !== "—" && !albumsMap.has(al)) {
        albumsMap.set(al, getLibraryTrackCover(t));
      }
    });
    return Array.from(albumsMap.entries()).map(([name, cover]) => ({
      name,
      cover,
    }));
  });

  
  
  // Computado: Canciones del álbum actual
  const activePlaylist = computed(() => {
    if (activePlaylistViewId.value == null) return null;
    return (
      playlists.value.find((item) => item.id === activePlaylistViewId.value) ??
      null
    );
  });

  
  
  const activePlaylistSafe = computed<PlaylistSummary>(() => {
    return (
      activePlaylist.value ?? {
        id: 0,
        name: "",
        trackCount: 0,
        createdAt: 0,
        updatedAt: 0,
        trackPaths: [],
      }
    );
  });

  
  
  const activePlaylistTracks = computed(() => {
    const targetPlaylist = activePlaylist.value;
    if (!targetPlaylist) return [];
  
    const trackMap = new Map(playlist.value.map((track) => [track.path, track]));
    return targetPlaylist.trackPaths
      .map((trackPath) => trackMap.get(trackPath) ?? null)
      .filter((track): track is PlaylistTrack => track !== null);
  });

  
  
  const getPlaylistCoverTiles = (item: PlaylistSummary) => {
    const trackMap = new Map(playlist.value.map((track) => [track.path, track]));
    return item.trackPaths.slice(0, 4).map((trackPath) => {
      const track = trackMap.get(trackPath);
      return track ? getLibraryTrackCover(track) : null;
    });
  };

  
  
  const getPlaylistCover = (item: PlaylistSummary) => {
    return getPlaylistCoverTiles(item)[0] ?? null;
  };

  
  
  const activePlaylistCoverTiles = computed(() => {
    if (!activePlaylist.value) return [];
    return getPlaylistCoverTiles(activePlaylist.value);
  });

  
  
  const activePlaylistDurationFormatted = computed(() => {
    const totalSeconds = activePlaylistTracks.value.reduce((acc, track) => {
      return acc + (getLibraryTrackMetadata(track)?.duration_seconds || 0);
    }, 0);
  
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
  
    if (hours > 0) {
      return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
    }
  
    if (minutes > 0) return `${minutes} min`;
    return "0 min";
  });

  
  
  const isActivePlaylistPlaying = computed(() => {
    if (!activePlaylist.value || !filePath.value) return false;
  
    return (
      activePlaylistTracks.value.some((track) => track.path === filePath.value) &&
      currentPlaybackContext.value.kind === "playlist" &&
      currentPlaybackContext.value.label === String(activePlaylist.value.id)
    );
  });

  
  
  const activePlaylistContextMenuTarget = computed(() => {
    const playlistId = playlistContextMenu.value.playlistId;
    if (playlistId == null) return null;
    return playlists.value.find((item) => item.id === playlistId) ?? null;
  });

  
  
  const normalizedSidebarLibrarySearch = computed(() =>
    normalizeSearchValue(sidebarLibrarySearch.value),
  );

  
  
  const sidebarLibraryItems = computed<SidebarLibraryItem[]>(() => {
    const playlistItems = playlists.value.map((item) => ({
      key: `playlist-${item.id}`,
      kind: "playlist" as const,
      title: item.name,
      subtitle:
        item.trackCount === 1
          ? "Playlist • 1 canción"
          : `Playlist • ${item.trackCount} canciones`,
      cover: getPlaylistCover(item),
      coverTiles: getPlaylistCoverTiles(item),
      playlistId: item.id,
      onClick: () => goToPlaylist(item.id),
      isActive:
        currentViewMode.value === "playlist" &&
        activePlaylistViewId.value === item.id,
    }));
  
    const albumItems = albumIndex.value.map((item) => ({
      key: `album-${item.name}-${item.artist}`,
      kind: "album" as const,
      title: item.name,
      subtitle: `Álbum • ${item.artist}`,
      cover: item.cover,
      coverTiles: item.cover ? [item.cover] : [],
      playlistId: null,
      onClick: () => goToAlbum(item.name, item.artist),
      isActive:
        currentViewMode.value === "album" &&
        activeAlbumView.value === item.name &&
        activeAlbumArtistView.value === item.artist,
    }));
  
    const artistItems = artistIndex.value.map((item) => ({
      key: `artist-${item.name}`,
      kind: "artist" as const,
      title: item.name,
      subtitle: "Artista",
      cover: item.cover,
      coverTiles: item.cover ? [item.cover] : [],
      playlistId: null,
      onClick: () => goToArtist(item.name),
      isActive:
        currentViewMode.value === "artist" &&
        activeArtistView.value === item.name,
    }));
  
    if (sidebarLibraryFilter.value === "playlists") return playlistItems;
    if (sidebarLibraryFilter.value === "albums") return albumItems;
    if (sidebarLibraryFilter.value === "artists") return artistItems;
  
    return [...playlistItems, ...albumItems, ...artistItems];
  });

  
  
  const visibleSidebarLibraryItems = computed(() => {
    const normalized = normalizedSidebarLibrarySearch.value;
    if (!normalized) return sidebarLibraryItems.value;
  
    return sidebarLibraryItems.value.filter((item) =>
      normalizeSearchValue(`${item.title} ${item.subtitle}`).includes(normalized),
    );
  });

  
  
  const activeAlbumTracks = computed(() => {
    if (!activeAlbumView.value) return [];
  
    const albumArtist = activeAlbumArtistView.value?.trim().toLowerCase() ?? null;
  
    // 1. Filtramos las canciones que pertenecen a este álbum
    const tracks = playlist.value.filter((t) => {
      if (getLibraryTrackAlbum(t) !== activeAlbumView.value) return false;
      if (!albumArtist) return true;
      return getAlbumArtistForTrack(t).trim().toLowerCase() === albumArtist;
    });
  
    // 2. Ordenamos por el número de pista
    return tracks.sort((a, b) => {
      const metaA = getLibraryTrackMetadata(a);
      const metaB = getLibraryTrackMetadata(b);
  
      // Si alguna canción no tiene metadata o track_number, la mandamos al final (9999)
      const numA = metaA?.track_number ?? 9999;
      const numB = metaB?.track_number ?? 9999;
  
      return numA - numB;
    });
  });

  
  
  // ====== METADATA PARA LA VISTA DE ÁLBUM TIPO SPOTIFY ======
  const activeAlbumCover = computed(() => {
    if (!activeAlbumTracks.value.length) return null;
    return getLibraryTrackCover(activeAlbumTracks.value[0]);
  });

  
  
  const activeAlbumArtist = computed(() => {
    if (!activeAlbumTracks.value.length) return "Artista desconocido";
    const meta = getLibraryTrackMetadata(activeAlbumTracks.value[0]);
    // Ahora usamos el nuevo campo que viene de Rust
    return meta?.album_artist || meta?.artist || "Artista desconocido";
  });

  
  
  const activeAlbumYear = computed(() => {
    if (!activeAlbumTracks.value.length) return "2026";
    const meta = getLibraryTrackMetadata(activeAlbumTracks.value[0]);
    return meta?.year || "2026";
  });

  
  
  const activeAlbumDurationFormatted = computed(() => {
    const totalSeconds = activeAlbumTracks.value.reduce((acc, track) => {
      return acc + (getLibraryTrackMetadata(track)?.duration_seconds || 0);
    }, 0);
  
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
  
    if (hours > 0) {
      return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
    }
  
    return `${minutes} min`;
  });

  
  
  const isActivePlaylistEmpty = computed(() => {
    return (
      currentViewMode.value === "playlist" &&
      activePlaylist.value != null &&
      activePlaylist.value.trackCount === 0
    );
  });

  
  
  const emptyPlaylistSearchResults = computed(() => {
    if (!activePlaylist.value) return [];
  
    const query = emptyPlaylistSearch.value.trim();
    const trackCandidates = query
      ? getTracksForSearchQuery(query)
      : [...playlist.value].sort((a, b) =>
          getTrackDisplayTitle(a).localeCompare(getTrackDisplayTitle(b)),
        );
  
    return trackCandidates.slice(0, 8);
  });

  
  
  // Función para reproducir el álbum completo desde la primera canción
  const playAlbum = async () => {
    if (!activeAlbumTracks.value.length) return;
  
    const currentTrackIsFromThisAlbum = activeAlbumTracks.value.some(
      (track) => track.path === filePath.value,
    );
  
    if (currentTrackIsFromThisAlbum && isActiveAlbumPlaying.value) {
      await togglePlay();
      return;
    }
  
    await playTrackFromLibrary(activeAlbumTracks.value[0]);
  };

  
  
  const playTrackCollection = async (
    tracks: PlaylistTrack[],
    playbackContext: PlaybackContext,
  ) => {
    if (!tracks.length) return;
  
    const currentTrackBelongsToCollection = tracks.some(
      (track) => track.path === filePath.value,
    );
  
    if (
      currentTrackBelongsToCollection &&
      currentPlaybackContext.value.kind === playbackContext.kind &&
      currentPlaybackContext.value.label === playbackContext.label
    ) {
      await togglePlay();
      return;
    }
  
    const queueTracks = tracks.map((track) =>
      createQueueTrack(track, playbackContext),
    );
  
    queue.value = queueTracks;
    queueOriginalOrderIds.value = queueTracks.map((track) => track.queueId);
    queueConsumedHistory.value = [];
    currentSource.value = "queue";
    currentPlaybackContext.value =
      clonePlaybackContext(playbackContext) ?? getQueuePlaybackContext();
    currentQueueTrackId.value = queueTracks[0]?.queueId ?? null;
    currentQueueIndex.value = 0;
  
    await loadTrack({
      source: "queue",
      index: 0,
      autoplay: true,
      startAt: 0,
    });
  };

  
  
  const playTrackCollectionFromIndex = async (
    tracks: PlaylistTrack[],
    playbackContext: PlaybackContext,
    startIndex: number,
  ) => {
    if (!tracks.length || startIndex < 0 || startIndex >= tracks.length) return;
  
    const queueTracks = tracks.map((track) =>
      createQueueTrack(track, playbackContext),
    );
  
    queue.value = queueTracks;
    queueOriginalOrderIds.value = queueTracks.map((track) => track.queueId);
    queueConsumedHistory.value = [];
    currentSource.value = "queue";
    currentPlaybackContext.value =
      clonePlaybackContext(playbackContext) ?? getQueuePlaybackContext();
    currentQueueTrackId.value = queueTracks[startIndex]?.queueId ?? null;
    currentQueueIndex.value = startIndex;
  
    await loadTrack({
      source: "queue",
      index: startIndex,
      autoplay: true,
      startAt: 0,
    });
  };

  
  
  const playArtist = async (artistName: string) => {
    const artist = findArtistByName(artistName);
    if (!artist || !artist.tracks.length) return;
  
    await playTrackCollection(
      artist.tracks,
      createPlaybackContext("artist", artist.name),
    );
  };

  
  
  const playAlbumResult = async (
    albumName: string,
    artistName?: string | null,
  ) => {
    const album = findAlbumByIdentity(albumName, artistName);
    if (!album || !album.tracks.length) return;
  
    await playTrackCollection(
      album.tracks,
      createPlaybackContext("album", getAlbumViewKey(album.name, album.artist)),
    );
  };

  
  
  const playPlaylistById = async (playlistId: number) => {
    const targetPlaylist = playlists.value.find((item) => item.id === playlistId);
    if (!targetPlaylist) return;
  
    const tracks =
      activePlaylistViewId.value === playlistId
        ? activePlaylistTracks.value
        : targetPlaylist.trackPaths
            .map((trackPath) =>
              playlist.value.find((track) => track.path === trackPath),
            )
            .filter((track): track is PlaylistTrack => track != null);
  
    if (!tracks.length) return;
  
    await playTrackCollection(
      tracks,
      createPlaybackContext("playlist", String(targetPlaylist.id)),
    );
  };

  
  
  const addPlaylistToQueue = (playlistId: number) => {
    const targetPlaylist = playlists.value.find((item) => item.id === playlistId);
    if (!targetPlaylist) return;
  
    const playbackContext = createPlaybackContext("playlist", String(playlistId));
    const trackMap = new Map(playlist.value.map((track) => [track.path, track]));
  
    ensureCurrentTrackIsFirstInQueue();
  
    targetPlaylist.trackPaths.forEach((trackPath) => {
      const track = trackMap.get(trackPath);
      if (!track) return;
  
      if (
        track.path === filePath.value &&
        queue.value.some((item) => item.path === track.path)
      ) {
        return;
      }
  
      const queueTrack = createQueueTrack(track, playbackContext);
      addQueueTrackToState(queueTrack);
    });
  
    if (isShuffleEnabled.value) {
      shuffleQueueOrder();
    }
  
    isQueuePanelOpen.value = true;
  };

  
  
  const toggleOrPlaySearchTrack = async (track: PlaylistTrack) => {
    if (filePath.value === track.path) {
      await togglePlay();
      return;
    }
  
    await playTrackFromLibrary(track);
  };

  
  
  const playQuickSearchArtist = async (artist: SearchArtistResult) => {
    rememberRecentGlobalSearchItem(
      createRecentArtistSearchItem(globalSearch.value.trim(), artist),
    );
    await playArtist(artist.name);
  };

  
  
  const playQuickSearchAlbum = async (album: SearchAlbumResult) => {
    rememberRecentGlobalSearchItem(
      createRecentAlbumSearchItem(globalSearch.value.trim(), album),
    );
    await playAlbumResult(album.name, album.artist);
  };

  
  
  const playRecentSearchItem = async (item: RecentSearchItem) => {
    if (item.kind === "song") {
      await playRecentSearchTrack(item);
      return;
    }
  
    if (item.kind === "album") {
      rememberRecentGlobalSearchItem(item);
      await playAlbumResult(item.title, getRecentSearchArtistName(item));
      return;
    }
  
    if (item.kind === "artist") {
      rememberRecentGlobalSearchItem(item);
      await playArtist(item.title);
    }
  };

  
  
  const isSearchTrackPlaying = (track: PlaylistTrack) => {
    return filePath.value === track.path && isPlaying.value;
  };

  
  
  const isSearchAlbumPlaying = (
    albumName: string,
    artistName?: string | null,
  ) => {
    return (
      isPlaying.value &&
      currentPlaybackContext.value.kind === "album" &&
      currentPlaybackContext.value.label ===
        getAlbumViewKey(albumName, artistName)
    );
  };

  
  
  const isSearchArtistPlaying = (artistName: string) => {
    return (
      isPlaying.value &&
      currentPlaybackContext.value.kind === "artist" &&
      currentPlaybackContext.value.label === artistName
    );
  };

  
  
  const isRecentSearchItemPlaying = (item: RecentSearchItem) => {
    if (item.kind === "song") {
      const track = findTrackByRecentSearchItem(item);
      return track ? isSearchTrackPlaying(track) : false;
    }
  
    if (item.kind === "album") {
      return isSearchAlbumPlaying(item.title, getRecentSearchArtistName(item));
    }
  
    if (item.kind === "artist") {
      return isSearchArtistPlaying(item.title);
    }
  
    return false;
  };

  
  
  // ESTE ES EL COMPUTADO MÁGICO: Reemplazará a `filteredPlaylist` en tu v-for del template
  const displayedTracks = computed(() => {
    let tracks = [];
    if (currentViewMode.value === "artist") tracks = activeArtistTracks.value;
    else if (currentViewMode.value === "album") tracks = activeAlbumTracks.value;
    else if (currentViewMode.value === "playlist")
      tracks = activePlaylistTracks.value;
    else tracks = filteredPlaylist.value;
  
    // Aplicar búsqueda incluso dentro de la vista de artista o álbum
    if (normalizedLibrarySearch.value) {
      return tracks.filter((track) => {
        const base = normalizeSearchValue(
          `${track.fileName} ${track.extension} ${track.path}`,
        );
        return base.includes(normalizedLibrarySearch.value);
      });
    }
    return tracks;
  });

  
  
  const librarySearchPlaceholder = computed(() => {
    if (currentViewMode.value === "artist" && activeArtistView.value) {
      return `Buscar en las canciones de ${activeArtistView.value}...`;
    }
  
    if (currentViewMode.value === "album" && activeAlbumView.value) {
      return `Buscar en el álbum ${activeAlbumView.value}...`;
    }
  
    if (currentViewMode.value === "playlist" && activePlaylist.value) {
      return `Buscar en la playlist ${activePlaylist.value.name}...`;
    }
  
    return "Buscar en toda la biblioteca...";
  });

  
  
  const globalSearchPlaceholder = computed(() => {
    return "¿Qué quieres reproducir?";
  });

  
  
  const currentViewTitle = computed(() => {
    if (isSearchViewActive.value) {
      return `Resultados para "${committedGlobalSearch.value.trim()}"`;
    }

    if (currentViewMode.value === "spotiflac") {
      return "SpotiFLAC";
    }
  
    if (currentViewMode.value === "artist") {
      return `Artista: ${activeArtistView.value ?? ""}`;
    }
  
    if (currentViewMode.value === "album") {
      return activeAlbumView.value ?? "Álbum";
    }
  
    if (currentViewMode.value === "playlist") {
      return activePlaylist.value?.name ?? "Playlist";
    }
  
    return "Biblioteca";
  });

  
  
  const shouldShowCurrentViewEmpty = computed(() => {
    if (currentViewMode.value === "playlist") return false;
  
    if (playlist.value.length === 0) return true;
  
    return false;
  });

  
  
  const currentViewEmptyTitle = computed(() => {
    if (playlist.value.length === 0) {
      return "No hay canciones cargadas";
    }
  
    if (currentViewMode.value === "playlist") {
      return "Esta playlist todavía está vacía";
    }
  
    return "No hay elementos";
  });

  
  
  const currentViewEmptySubtitle = computed(() => {
    if (playlist.value.length === 0) {
      return "Añade una o varias carpetas de música para construir tu biblioteca.";
    }
  
    if (currentViewMode.value === "playlist") {
      return "Usa el menú contextual de una canción para añadirla a esta playlist.";
    }
  
    return "Todavía no hay contenido para mostrar en esta vista.";
  });

  
  
  const commitGlobalSearch = (query = globalSearch.value) => {
    const trimmed = query.trim();
    if (!trimmed) return;
  
    committedGlobalSearch.value = trimmed;
    globalSearch.value = trimmed;
    rememberRecentGlobalSearch(trimmed);
    closeGlobalSearchPopover();
  
    navigateToView({
      mode: "search",
      artist: null,
      album: null,
      albumArtist: null,
      playlistId: null,
      search: "",
      globalQuery: trimmed,
    });
  };

  
  
  const applyQuickSearchSuggestion = (query: string) => {
    globalSearch.value = query;
    commitGlobalSearch(query);
  };

  
  
  const onGlobalSearchFocus = () => {
    openGlobalSearchPopover();
  };

  
  
  const onGlobalSearchKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitGlobalSearch();
      return;
    }
  
    if (e.key === "Escape") {
      closeGlobalSearchPopover();
      globalSearchInputRef.value?.blur();
    }
  };

  
  
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

  
  
  const activePlaybackIndex = computed(() => {
    return currentSource.value === "queue"
      ? currentQueueIndex.value
      : currentIndex.value;
  });

  
  
  const normalizeSearchValue = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['’`´]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .toLowerCase();

  
  
  const normalizedLibrarySearch = computed(() =>
    normalizeSearchValue(librarySearch.value),
  );

  
  
  const normalizedGlobalSearch = computed(() =>
    normalizeSearchValue(globalSearch.value),
  );

  
  
  const getSearchMatchScore = (
    query: string,
    candidate: string | null | undefined,
    exactBonus = 100,
  ) => {
    const normalizedQuery = normalizeSearchValue(query);
    const normalizedCandidate = normalizeSearchValue(candidate);
  
    if (!normalizedQuery || !normalizedCandidate) return -1;
    if (normalizedCandidate === normalizedQuery) return exactBonus;
    if (normalizedCandidate.startsWith(normalizedQuery)) return exactBonus - 20;
    if (normalizedCandidate.includes(normalizedQuery)) return exactBonus - 40;
    return -1;
  };

  
  
  const getTracksForSearchQuery = (query: string) => {
    const normalized = normalizeSearchValue(query);
    if (!normalized) return [];
  
    return [...playlist.value]
      .filter((track) =>
        normalizeSearchValue(getTrackSearchBase(track)).includes(normalized),
      )
      .sort((a, b) => {
        const metaA = getLibraryTrackMetadata(a);
        const metaB = getLibraryTrackMetadata(b);
  
        const scoreA = Math.max(
          getSearchMatchScore(query, getTrackDisplayTitle(a), 90),
          getSearchMatchScore(query, metaA?.artist, 50),
          getSearchMatchScore(query, metaA?.album, 40),
        );
        const scoreB = Math.max(
          getSearchMatchScore(query, getTrackDisplayTitle(b), 90),
          getSearchMatchScore(query, metaB?.artist, 50),
          getSearchMatchScore(query, metaB?.album, 40),
        );
  
        if (scoreA !== scoreB) return scoreB - scoreA;
        return getTrackDisplayTitle(a).localeCompare(getTrackDisplayTitle(b));
      });
  };

  
  
  const getArtistsForSearchQuery = (query: string) => {
    const normalized = normalizeSearchValue(query);
    if (!normalized) return [];
  
    return [...artistIndex.value]
      .filter((artist) => normalizeSearchValue(artist.name).includes(normalized))
      .sort((a, b) => {
        const scoreA = getSearchMatchScore(query, a.name, 80);
        const scoreB = getSearchMatchScore(query, b.name, 80);
  
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.name.localeCompare(b.name);
      });
  };

  
  
  const getAlbumsForSearchQuery = (query: string) => {
    const normalized = normalizeSearchValue(query);
    if (!normalized) return [];
  
    return [...albumIndex.value]
      .filter((album) => {
        const base = normalizeSearchValue(`${album.name} ${album.artist}`);
        return base.includes(normalized);
      })
      .sort((a, b) => {
        const scoreA = Math.max(
          getSearchMatchScore(query, a.name, 100),
          getSearchMatchScore(query, a.artist, 55),
        );
        const scoreB = Math.max(
          getSearchMatchScore(query, b.name, 100),
          getSearchMatchScore(query, b.artist, 55),
        );
  
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.name.localeCompare(b.name);
      });
  };

  
  
  const buildRecentTrackSearchItem = (
    query: string,
    track: PlaylistTrack,
  ): RecentSearchItem => {
    return createRecentTrackSearchItem(query, track);
  
    return {
      query,
      title: getTrackDisplayTitle(track),
      subtitle: `Cancion â€¢ ${getLibraryTrackArtist(track)}`,
      cover: getLibraryTrackCover(track),
      kind: "song",
    };
  };

  
  
  const createRecentTrackSearchItem = (
    query: string,
    track: PlaylistTrack,
  ): RecentSearchItem => {
    return {
      query,
      title: getTrackDisplayTitle(track),
      subtitle: `Cancion - ${getLibraryTrackArtist(track)}`,
      cover: getLibraryTrackCover(track),
      kind: "song",
      entityKey: `song:${track.path.toLowerCase()}`,
      trackPath: track.path,
    };
  };

  
  
  const createRecentAlbumSearchItem = (
    query: string,
    album: SearchAlbumResult,
  ): RecentSearchItem => {
    return {
      query,
      title: album.name,
      subtitle: `Album - ${album.artist}`,
      cover: album.cover,
      kind: "album",
      entityKey: `album:${album.artist.toLowerCase()}::${album.name.toLowerCase()}`,
      artistName: album.artist,
    };
  };

  
  
  const createRecentArtistSearchItem = (
    query: string,
    artist: SearchArtistResult,
  ): RecentSearchItem => {
    return {
      query,
      title: artist.name,
      subtitle: `Artista - ${artist.tracks.length} canciones`,
      cover: artist.cover,
      kind: "artist",
      entityKey: `artist:${artist.name.toLowerCase()}`,
      artistName: artist.name,
    };
  };

  
  
  const findArtistByName = (artistName: string | null | undefined) => {
    const normalizedArtistName = artistName?.trim().toLowerCase();
    if (!normalizedArtistName) return null;
  
    return (
      artistIndex.value.find(
        (artist) => artist.name.trim().toLowerCase() === normalizedArtistName,
      ) ?? null
    );
  };

  
  
  const findAlbumByIdentity = (
    albumName: string | null | undefined,
    artistName?: string | null,
  ) => {
    const normalizedAlbumName = albumName?.trim().toLowerCase();
    if (!normalizedAlbumName) return null;
  
    const normalizedArtistName = artistName?.trim().toLowerCase() ?? null;
  
    return (
      albumIndex.value.find((album) => {
        if (album.name.trim().toLowerCase() !== normalizedAlbumName) return false;
        if (!normalizedArtistName) return true;
        return album.artist.trim().toLowerCase() === normalizedArtistName;
      }) ?? null
    );
  };

  
  
  const buildRecentSearchItem = (
    query: string,
    selectedTrack?: PlaylistTrack,
  ): RecentSearchItem => {
    if (selectedTrack) {
      return buildRecentTrackSearchItem(query, selectedTrack);
    }
  
    const album = getAlbumsForSearchQuery(query)[0];
    if (album) {
      return createRecentAlbumSearchItem(query, album);
    }
  
    const artist = getArtistsForSearchQuery(query)[0];
    if (artist) {
      return createRecentArtistSearchItem(query, artist);
    }
  
    const track = getTracksForSearchQuery(query)[0];
    if (track) {
      return buildRecentTrackSearchItem(query, track);
  
      return {
        query,
        title: getTrackDisplayTitle(track),
        subtitle: `Cancion • ${getLibraryTrackArtist(track)}`,
        cover: getLibraryTrackCover(track),
        kind: "song",
        entityKey: `song:${track.path.toLowerCase()}`,
      };
    }
  
    return {
      query,
      title: query,
      subtitle: "Busqueda reciente",
      cover: null,
      kind: "song",
      entityKey: `query:${query.toLowerCase()}`,
    };
  };

  
  
  const getExplicitRecentSearchEntityKey = (item: RecentSearchItem) => {
    const entityKey = item.entityKey?.trim();
    return entityKey ? entityKey : null;
  };

  
  
  const getRecentSearchEntityKey = (item: RecentSearchItem) => {
    return (
      getExplicitRecentSearchEntityKey(item) ??
      `query:${item.query.toLowerCase()}`
    );
  };

  
  
  const getRecentSearchArtistName = (item: RecentSearchItem) => {
    if (item.artistName?.trim()) return item.artistName;
  
    if (item.kind === "album" && item.entityKey?.startsWith("album:")) {
      const albumKey = item.entityKey.slice(6);
      const separatorIndex = albumKey.indexOf("::");
      if (separatorIndex > -1) {
        return albumKey.slice(0, separatorIndex);
      }
    }
  
    if (item.kind === "artist" && item.entityKey?.startsWith("artist:")) {
      return item.entityKey.slice(7);
    }
  
    return null;
  };

  
  
  const hydrateRecentSearchItem = (item: RecentSearchItem): RecentSearchItem => {
    if (item.kind === "song") {
      const resolvedTrack = findTrackByRecentSearchItem(item);
      if (resolvedTrack) {
        return createRecentTrackSearchItem(item.query, resolvedTrack);
      }
  
      if (item.trackPath?.trim()) {
        return {
          ...item,
          entityKey:
            getExplicitRecentSearchEntityKey(item) ??
            `song:${item.trackPath.trim().toLowerCase()}`,
        };
      }
    }
  
    if (item.kind === "album") {
      const artistName = getRecentSearchArtistName(item);
      const resolvedAlbum = findAlbumByIdentity(item.title, artistName);
      if (resolvedAlbum) {
        return createRecentAlbumSearchItem(item.query, resolvedAlbum);
      }
  
      return {
        ...item,
        artistName: artistName ?? undefined,
        entityKey:
          getExplicitRecentSearchEntityKey(item) ??
          `album:${(artistName ?? "").trim().toLowerCase()}::${item.title
            .trim()
            .toLowerCase()}`,
      };
    }
  
    if (item.kind === "artist") {
      const resolvedArtist = findArtistByName(item.title);
      if (resolvedArtist) {
        return createRecentArtistSearchItem(item.query, resolvedArtist);
      }
  
      return {
        ...item,
        entityKey:
          getExplicitRecentSearchEntityKey(item) ??
          `artist:${item.title.trim().toLowerCase()}`,
      };
    }
  
    return {
      ...item,
      entityKey:
        getExplicitRecentSearchEntityKey(item) ??
        `query:${item.query.trim().toLowerCase()}`,
    };
  };

  
  
  const findTrackByRecentSearchItem = (item: RecentSearchItem) => {
    const normalizedTrackPath = item.trackPath?.toLowerCase();
    if (normalizedTrackPath) {
      const trackByPath = playlist.value.find(
        (track) => track.path.toLowerCase() === normalizedTrackPath,
      );
      if (trackByPath) return trackByPath;
    }
  
    if (item.entityKey?.startsWith("song:")) {
      const entityPath = item.entityKey.slice(5);
      const trackByEntityKey = playlist.value.find(
        (track) => track.path.toLowerCase() === entityPath,
      );
      if (trackByEntityKey) return trackByEntityKey;
    }
  
    return getTracksForSearchQuery(item.query)[0];
  };

  
  
  const normalizeRecentGlobalSearches = (items: RecentSearchItem[]) => {
    const normalizedItems: RecentSearchItem[] = [];
    const seen = new Set<string>();
  
    for (const item of items) {
      const normalizedItem = hydrateRecentSearchItem(item);
  
      const entityKey = getRecentSearchEntityKey(normalizedItem);
      if (seen.has(entityKey)) continue;
  
      seen.add(entityKey);
      normalizedItems.push(normalizedItem);
  
      if (normalizedItems.length >= 6) break;
    }
  
    return normalizedItems;
  };

  
  
  const clearGlobalSearchState = () => {
    globalSearch.value = "";
    committedGlobalSearch.value = "";
  };

  
  
  const removeRecentGlobalSearch = (item: RecentSearchItem) => {
    const entityKey = getRecentSearchEntityKey(item);
    const nextItems = recentGlobalSearches.value.filter(
      (existingItem) => getRecentSearchEntityKey(existingItem) !== entityKey,
    );
    recentGlobalSearches.value = nextItems;
    void persistRecentGlobalSearches(nextItems);
  };

  
  
  const scrollLibraryTrackIntoView = async (trackPath: string) => {
    await nextTick();
  
    const trackRows = Array.from(
      document.querySelectorAll<HTMLElement>(".track-row[data-track-path]"),
    );
    const targetRow = trackRows.find(
      (row) => row.dataset.trackPath === trackPath,
    );
  
    if (targetRow) {
      const scrollContainer =
        targetRow.closest<HTMLElement>(".tracks-list") ??
        albumScrollContainerRef.value;
  
      if (scrollContainer) {
        const targetTop = targetRow.offsetTop;
        const targetHeight = targetRow.offsetHeight;
        const containerHeight = scrollContainer.clientHeight;
        const nextScrollTop = targetTop - containerHeight / 2 + targetHeight / 2;
  
        scrollContainer.scrollTo({
          top: Math.max(0, nextScrollTop),
          behavior: "smooth",
        });
        return;
      }
  
      targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  
  
  const getPrimaryTrackArtist = (track: PlaylistTrack) => {
    return splitArtists(getLibraryTrackArtist(track))[0] ?? "Artista desconocido";
  };

  
  
  const openTrackAlbumView = async (track: PlaylistTrack) => {
    const album = getLibraryTrackAlbum(track);
    const primaryArtist = getPrimaryTrackArtist(track);
  
    closeGlobalSearchPopover();
    clearGlobalSearchState();
  
    const hasAlbum = Boolean(album?.trim()) && !/^\?+$/.test(album ?? "");
  
    if (hasAlbum) {
      navigateToView({
        mode: "album",
        artist: primaryArtist,
        album,
        albumArtist: getAlbumArtistForTrack(track),
        playlistId: null,
        search: "",
        globalQuery: "",
      });
    } else {
      navigateToView({
        mode: "library",
        artist: null,
        album: null,
        albumArtist: null,
        playlistId: null,
        search: "",
        globalQuery: "",
      });
    }
  
    selectLibraryTrack(track);
    await scrollLibraryTrackIntoView(track.path);
  };

  
  
  const goToRecentTrackLocation = async (item: RecentSearchItem) => {
    const track = findTrackByRecentSearchItem(item);
    if (!track) {
      await handleRecentGlobalSearchClick(item);
      return;
    }
  
    rememberRecentGlobalSearch(item.query, track);
    await openTrackAlbumView(track);
  };

  
  
  const goToRecentSearchArtist = (artist: string) => {
    if (!artist) return;
    closeGlobalSearchPopover();
    clearGlobalSearchState();
    goToArtist(artist);
  };

  
  
  const goToRecentSearchAlbum = (album: string, artist?: string | null) => {
    if (!album || album === "—") return;
    closeGlobalSearchPopover();
    clearGlobalSearchState();
    navigateToView({
      mode: "album",
      artist: artist ?? null,
      album,
      albumArtist: artist ?? null,
      playlistId: null,
      search: "",
      globalQuery: "",
    });
  };

  
  
  const getRecentSearchTrackArtists = (item: RecentSearchItem) => {
    const track = findTrackByRecentSearchItem(item);
    if (!track) return [];
    return [getPrimaryTrackArtist(track)];
  };

  
  
  const openRecentGlobalSearchContextMenu = (
    e: MouseEvent,
    item: RecentSearchItem,
  ) => {
    if (item.kind !== "song") return;
  
    const track = findTrackByRecentSearchItem(item);
    if (!track) return;
  
    openTrackContextMenu(e, track);
  };

  
  
  const playRecentSearchTrack = async (item: RecentSearchItem) => {
    const track = findTrackByRecentSearchItem(item);
    if (!track) {
      await handleRecentGlobalSearchClick(item);
      return;
    }
  
    rememberRecentGlobalSearch(item.query, track);
    await toggleOrPlaySearchTrack(track);
  };

  
  
  const rememberRecentGlobalSearch = (
    query: string,
    selectedTrack?: PlaylistTrack,
  ) => {
    const normalized = query.trim();
    if (!normalized) return;
    const nextItem = buildRecentSearchItem(normalized, selectedTrack);
  
    const nextItems = normalizeRecentGlobalSearches([
      nextItem,
      ...recentGlobalSearches.value,
    ]);
  
    recentGlobalSearches.value = nextItems;
    void persistRecentGlobalSearches(nextItems);
  };

  
  
  const rememberRecentGlobalSearchItem = (item: RecentSearchItem) => {
    const normalizedQuery = item.query.trim();
    if (!normalizedQuery) return;
  
    const nextItems = normalizeRecentGlobalSearches([
      {
        ...item,
        query: normalizedQuery,
      },
      ...recentGlobalSearches.value,
    ]);
  
    recentGlobalSearches.value = nextItems;
    void persistRecentGlobalSearches(nextItems);
  };

  
  
  const handleRecentGlobalSearchClick = async (item: RecentSearchItem) => {
    if (item.kind === "song") {
      const track = findTrackByRecentSearchItem(item);
      if (track) {
        rememberRecentGlobalSearch(item.query, track);
        await openTrackAlbumView(track);
        return;
      }
    }
  
    if (item.kind === "album") {
      rememberRecentGlobalSearchItem(item);
      goToRecentSearchAlbum(item.title, getRecentSearchArtistName(item));
      return;
    }
  
    if (item.kind === "artist") {
      rememberRecentGlobalSearchItem(item);
      goToRecentSearchArtist(item.title);
      return;
    }
  
    applyQuickSearchSuggestion(item.query);
  };

  
  
  const quickSearchTracks = computed(() =>
    getTracksForSearchQuery(globalSearch.value).slice(0, 5),
  );

  
  
  const handleQuickSearchTrackClick = async (track: PlaylistTrack) => {
    rememberRecentGlobalSearch(globalSearch.value.trim(), track);
    await openTrackAlbumView(track);
  };

  
  
  const playQuickSearchTrack = async (track: PlaylistTrack) => {
    rememberRecentGlobalSearch(globalSearch.value.trim(), track);
    await toggleOrPlaySearchTrack(track);
  };

  
  
  const quickSearchArtists = computed(() =>
    getArtistsForSearchQuery(globalSearch.value).slice(0, 6),
  );

  
  
  const quickSearchPrimaryArtist = computed(
    () => quickSearchArtists.value[0] ?? null,
  );

  
  
  const handleQuickSearchArtistClick = (artist: SearchArtistResult) => {
    rememberRecentGlobalSearchItem(
      createRecentArtistSearchItem(globalSearch.value.trim(), artist),
    );
    closeGlobalSearchPopover();
    clearGlobalSearchState();
    goToArtist(artist.name);
  };

  
  
  const quickSearchAlbums = computed(() =>
    getAlbumsForSearchQuery(globalSearch.value).slice(0, 6),
  );

  
  
  const handleQuickSearchAlbumClick = (album: SearchAlbumResult) => {
    rememberRecentGlobalSearchItem(
      createRecentAlbumSearchItem(globalSearch.value.trim(), album),
    );
    goToRecentSearchAlbum(album.name, album.artist);
  };

  
  
  const quickSearchSuggestions = computed(() => {
    const normalized = normalizedGlobalSearch.value;
    if (!normalized) return [];
  
    const options = new Set<string>();
  
    playlist.value.forEach((track) => {
      [
        getTrackDisplayTitle(track),
        getLibraryTrackArtist(track),
        getLibraryTrackAlbum(track),
      ].forEach((value) => {
        if (!value || value === "—") return;
        const lower = value.toLowerCase();
        if (lower.includes(normalized)) {
          options.add(value);
        }
      });
    });
  
    return Array.from(options).slice(0, 4);
  });

  
  
  const committedSearchTracks = computed(() =>
    getTracksForSearchQuery(committedGlobalSearch.value),
  );

  
  
  const committedSearchArtists = computed(() =>
    getArtistsForSearchQuery(committedGlobalSearch.value),
  );

  
  
  const committedSearchAlbums = computed(() =>
    getAlbumsForSearchQuery(committedGlobalSearch.value),
  );

  
  
  const committedSearchTopResult = computed<SearchTopResult | null>(() => {
    const query = committedGlobalSearch.value.trim();
    if (!query) return null;
  
    const topAlbum = committedSearchAlbums.value[0] ?? null;
    const topTrack = committedSearchTracks.value[0] ?? null;
    const topArtist = committedSearchArtists.value[0] ?? null;
  
    const albumScore = topAlbum
      ? Math.max(
          getSearchMatchScore(query, topAlbum.name, 100),
          getSearchMatchScore(query, topAlbum.artist, 55),
        )
      : -1;
    const trackScore = topTrack
      ? Math.max(
          getSearchMatchScore(query, getTrackDisplayTitle(topTrack), 90),
          getSearchMatchScore(query, getLibraryTrackArtist(topTrack), 50),
          getSearchMatchScore(query, getLibraryTrackAlbum(topTrack), 40),
        )
      : -1;
    const artistScore = topArtist
      ? getSearchMatchScore(query, topArtist.name, 80)
      : -1;
  
    if (albumScore >= trackScore && albumScore >= artistScore && topAlbum) {
      return {
        kind: "album",
        title: topAlbum.name,
        subtitle: `Álbum • ${topAlbum.artist}`,
        cover: topAlbum.cover,
        action: () => goToRecentSearchAlbum(topAlbum.name, topAlbum.artist),
        playAction: () => {
          rememberRecentGlobalSearchItem(
            createRecentAlbumSearchItem(query, topAlbum),
          );
          return playAlbumResult(topAlbum.name, topAlbum.artist);
        },
      };
    }
  
    if (trackScore >= artistScore && topTrack) {
      return {
        kind: "song",
        title: getTrackDisplayTitle(topTrack),
        subtitle: `Canción • ${getLibraryTrackArtist(topTrack)}`,
        cover: getLibraryTrackCover(topTrack),
        action: () => playTrackFromLibrary(topTrack),
        playAction: () => {
          rememberRecentGlobalSearch(query, topTrack);
          return toggleOrPlaySearchTrack(topTrack);
        },
      };
    }
  
    if (topArtist) {
      return {
        kind: "artist",
        title: topArtist.name,
        subtitle: "Artista",
        cover: topArtist.cover,
        action: () => goToArtist(topArtist.name),
        playAction: () => {
          rememberRecentGlobalSearchItem(
            createRecentArtistSearchItem(query, topArtist),
          );
          return playArtist(topArtist.name);
        },
      };
    }
  
    return null;
  });

  
  
  const isSearchViewActive = computed(() => currentViewMode.value === "search");

  
  
  const hasQuickSearchResults = computed(() => {
    return (
      quickSearchSuggestions.value.length > 0 ||
      quickSearchTracks.value.length > 0 ||
      quickSearchArtists.value.length > 0 ||
      quickSearchAlbums.value.length > 0
    );
  });

  
  
  const isGlobalSearchPopoverVisible = computed(() => {
    return isGlobalSearchPopoverOpen.value;
  });

  
  
  watch(globalSearch, async (value) => {
    window.cancelAnimationFrame(globalSearchLoadingFrame);
  
    if (!value.trim()) {
      isGlobalSearchLoading.value = false;
      return;
    }
  
    isGlobalSearchLoading.value = true;
    openGlobalSearchPopover();
  
    await nextTick();
    globalSearchLoadingFrame = window.requestAnimationFrame(() => {
      isGlobalSearchLoading.value = false;
    });
  });

  
  
  watch(
    () => activePlaylistViewId.value,
    () => {
      emptyPlaylistSearch.value = "";
      isEmptyPlaylistDiscoveryVisible.value = true;
    },
  );

  
  
  const filteredPlaylist = computed(() => {
    if (!normalizedLibrarySearch.value) return playlist.value;
  
    return playlist.value.filter((track) => {
      return getTrackSearchBase(track).includes(normalizedLibrarySearch.value);
    });
  });

  
  
  const normalizedQueueSearch = computed(() =>
    queueSearch.value.trim().toLowerCase(),
  );

  
  
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

  
  
  const preventScroll = (e: Event) => {
    e.preventDefault();
  };

  
  
  watch(
    () => contextMenu.value.visible,
    (visible) => {
      if (visible) {
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        window.addEventListener("wheel", preventScroll, { passive: false });
        window.addEventListener("touchmove", preventScroll, { passive: false });
      } else {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
        window.removeEventListener("wheel", preventScroll);
        window.removeEventListener("touchmove", preventScroll);
      }
    },
  );

  
  
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
      queue.value = [];
      queueOriginalOrderIds.value = [];
      queueConsumedHistory.value = [];
      currentQueueTrackId.value = null;
      libraryMetadataMap.value = {};
      await clearCurrentTrackState();
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
  
      queue.value = queue.value.filter((track) => validPaths.has(track.path));
      queueOriginalOrderIds.value = queueOriginalOrderIds.value.filter(
        (queueId) => queue.value.some((track) => track.queueId === queueId),
      );
      queueConsumedHistory.value = queueConsumedHistory.value.filter((track) =>
        validPaths.has(track.path),
      );
  
      if (isShuffleEnabled.value) {
        syncCurrentQueueIndexFromTrackId();
      } else {
        restoreQueueOriginalOrder();
      }
  
      if (filePath.value && !validPaths.has(filePath.value)) {
        await clearCurrentTrackState();
      }
  
      void preloadLibraryMetadata(tracks);
  
      const normalizedRecents = normalizeRecentGlobalSearches(
        recentGlobalSearches.value,
      );
      if (
        normalizedRecents.length !== recentGlobalSearches.value.length ||
        normalizedRecents.some(
          (item, index) =>
            item.entityKey !== recentGlobalSearches.value[index]?.entityKey,
        )
      ) {
        recentGlobalSearches.value = normalizedRecents;
        void persistRecentGlobalSearches(normalizedRecents);
      }
  
      if (
        !hasPendingAppSessionRestore &&
        !isPlaying.value &&
        playlist.value.length > 0 &&
        currentIndex.value === -1 &&
        currentQueueIndex.value === -1
      ) {
        replaceQueueWithTrack(playlist.value[0]);
        await loadTrack({
          source: "queue",
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
  
      await persistMusicDirectories();
  
      await syncLibrary();
      await invoke("watch_directories", { directories: musicDirectories.value });
    } catch (error) {
      console.error("Error al seleccionar carpeta:", error);
    }
  };

  
  
  const persistMusicDirectories = async () => {
    await invoke("set_music_directories", {
      directories: musicDirectories.value,
    });
  };

  
  
  const removeMusicDirectory = async (pathToRemove: string) => {
    musicDirectories.value = musicDirectories.value.filter(
      (path) => path !== pathToRemove,
    );
  
    try {
      await persistMusicDirectories();
      await syncLibrary();
      await invoke("watch_directories", { directories: musicDirectories.value });
    } catch (error) {
      console.error("Error al quitar carpeta:", error);
    }
  };

  
  
  const clearMusicDirectories = async () => {
    musicDirectories.value = [];
  
    try {
      await persistMusicDirectories();
      await syncLibrary();
      await invoke("watch_directories", { directories: musicDirectories.value });
    } catch (error) {
      console.error("Error al limpiar carpetas:", error);
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
    const activeMetadata =
      metadataTrackPath.value === filePath.value ? metadata.value : null;
    const currentTrack = playlist.value.find(
      (track) => track.path === filePath.value,
    );
    const fallbackTitle = currentTrack
      ? getTrackDisplayTitle(currentTrack)
      : null;
  
    return (
      activeMetadata?.title?.trim() ||
      fallbackTitle ||
      rawFileName.value ||
      "Sin título"
    );
  });

  
  
  const displayArtist = computed(() => {
    const activeMetadata =
      metadataTrackPath.value === filePath.value ? metadata.value : null;
    const currentTrack = playlist.value.find(
      (track) => track.path === filePath.value,
    );
    const fallbackArtist = currentTrack
      ? getLibraryTrackArtist(currentTrack)
      : null;
  
    return (
      activeMetadata?.artist?.trim() || fallbackArtist || "Artista desconocido"
    );
  });

  
  
  const currentPlaybackSourceLabel = computed(() => {
    return currentPlaybackContext.value.label;
  });

  
  
  const currentPlaybackSourceTargetLabel = computed(() => {
    if (currentPlaybackContext.value.kind === "album") {
      return displayAlbum.value;
    }
  
    if (currentPlaybackContext.value.kind === "playlist") {
      const playlistId = Number(currentPlaybackContext.value.label);
      return (
        playlists.value.find((item) => item.id === playlistId)?.name ?? "Playlist"
      );
    }
  
    return currentPlaybackSourceLabel.value;
  });

  
  
  const canNavigateFromPlaybackSourceLabel = computed(() => {
    if (!filePath.value) return false;
  
    switch (currentPlaybackContext.value.kind) {
      case "album":
        return Boolean(
          displayAlbum.value && displayAlbum.value !== "Ãlbum desconocido",
        );
      case "artist":
        return Boolean(
          displayArtist.value && displayArtist.value !== "Artista desconocido",
        );
      case "playlist":
        return Boolean(currentPlaybackSourceTargetLabel.value);
      case "library":
      case "queue":
      case "search":
        return true;
      default:
        return false;
    }
  });

  
  
  const playbackSourceBadgeAriaLabel = computed(() => {
    const target = currentPlaybackSourceTargetLabel.value;
    return canNavigateFromPlaybackSourceLabel.value ? `Ir a ${target}` : target;
  });

  
  
  const navigateFromPlaybackSourceLabel = () => {
    if (!canNavigateFromPlaybackSourceLabel.value) return;
  
    switch (currentPlaybackContext.value.kind) {
      case "artist":
        goToArtist(displayArtist.value);
        return;
      case "album": {
        const currentTrack = playlist.value.find(
          (track) => track.path === filePath.value,
        );
        const album = displayAlbum.value;
        const albumArtist = currentTrack
          ? getAlbumArtistForTrack(currentTrack)
          : metadata.value?.album_artist?.trim() ||
            metadata.value?.artist?.trim() ||
            displayArtist.value;
  
        goToAlbum(album, albumArtist);
        return;
      }
      case "playlist":
        goToPlaylist(Number(currentPlaybackContext.value.label));
        return;
      case "search":
        if (currentPlaybackContext.value.label.trim()) {
          commitGlobalSearch(currentPlaybackContext.value.label);
        }
        return;
      case "queue":
        isQueuePanelOpen.value = true;
        return;
      case "library":
        goHomeView();
        return;
    }
  };

  
  
  const displayAlbum = computed(() => {
    const activeMetadata =
      metadataTrackPath.value === filePath.value ? metadata.value : null;
    const currentTrack = playlist.value.find(
      (track) => track.path === filePath.value,
    );
    const fallbackAlbum = currentTrack
      ? getLibraryTrackAlbum(currentTrack)
      : null;
  
    return activeMetadata?.album?.trim() || fallbackAlbum || "Álbum desconocido";
  });

  
  
  const coverUrl = computed(() => {
    const activeMetadata =
      metadataTrackPath.value === filePath.value ? metadata.value : null;
    const currentTrack = playlist.value.find(
      (track) => track.path === filePath.value,
    );
    const fallbackCover = currentTrack
      ? getLibraryTrackCover(currentTrack)
      : null;
  
    return activeMetadata?.cover_art?.data_url || fallbackCover || null;
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

  
  
  const syncCurrentQueueIndexFromTrackId = () => {
    if (currentSource.value !== "queue") return;
    if (currentQueueTrackId.value == null) {
      currentQueueIndex.value = -1;
      return;
    }
  
    currentQueueIndex.value = queue.value.findIndex(
      (track) => track.queueId === currentQueueTrackId.value,
    );
  };

  
  
  const shuffleArray = <T,>(items: T[]) => {
    const shuffled = [...items];
  
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  
    return shuffled;
  };

  
  
  const restoreQueueOriginalOrder = () => {
    const trackMap = new Map(queue.value.map((track) => [track.queueId, track]));
  
    queue.value = queueOriginalOrderIds.value
      .map((queueId) => trackMap.get(queueId) ?? null)
      .filter((track): track is QueueTrack => track !== null);
  
    syncCurrentQueueIndexFromTrackId();
  };

  
  
  const shuffleQueueOrder = () => {
    if (
      currentSource.value === "queue" &&
      currentQueueTrackId.value != null &&
      queue.value.length > 1
    ) {
      const currentTrack = queue.value.find(
        (track) => track.queueId === currentQueueTrackId.value,
      );
  
      if (currentTrack) {
        const remainingTracks = queue.value.filter(
          (track) => track.queueId !== currentQueueTrackId.value,
        );
  
        queue.value = [currentTrack, ...shuffleArray(remainingTracks)];
        syncCurrentQueueIndexFromTrackId();
        return;
      }
    }
  
    queue.value = shuffleArray(queue.value);
    syncCurrentQueueIndexFromTrackId();
  };

  
  
  const getTrackPlaybackContext = (
    track: PlaylistTrack | QueueTrack,
  ): PlaybackContext | null => {
    return "playbackContext" in track
      ? clonePlaybackContext(track.playbackContext)
      : null;
  };

  
  
  const createQueueTrack = (
    track: PlaylistTrack | QueueTrack,
    playbackContext = getTrackPlaybackContext(track) ??
      getLibraryPlaybackContext(),
  ): QueueTrack => ({
    ...track,
    queueId: nextQueueId.value++,
    playbackContext:
      clonePlaybackContext(playbackContext) ?? getQueuePlaybackContext(),
  });

  
  
  const addQueueTrackToState = (
    queueTrack: QueueTrack,
    insertAtStart = false,
  ) => {
    if (insertAtStart) {
      queue.value.unshift(queueTrack);
      queueOriginalOrderIds.value.unshift(queueTrack.queueId);
      return;
    }
  
    queue.value.push(queueTrack);
    queueOriginalOrderIds.value.push(queueTrack.queueId);
  };

  
  
  const ensureCurrentTrackIsFirstInQueue = () => {
    if (!filePath.value) return;
  
    const existingQueueIndex = queue.value.findIndex(
      (track) => track.path === filePath.value,
    );
  
    if (existingQueueIndex >= 0) {
      const [existingTrack] = queue.value.splice(existingQueueIndex, 1);
      queue.value.unshift(existingTrack);
      queueOriginalOrderIds.value = [
        existingTrack.queueId,
        ...queueOriginalOrderIds.value.filter(
          (queueId) => queueId !== existingTrack.queueId,
        ),
      ];
      currentSource.value = "queue";
      currentQueueTrackId.value = existingTrack.queueId;
      currentQueueIndex.value = 0;
      return;
    }
  
    const currentTrack = playlist.value.find(
      (track) => track.path === filePath.value,
    );
    if (!currentTrack) return;
  
    const queueTrack = createQueueTrack(
      currentTrack,
      currentPlaybackContext.value,
    );
    addQueueTrackToState(queueTrack, true);
    currentSource.value = "queue";
    currentPlaybackContext.value =
      clonePlaybackContext(queueTrack.playbackContext) ??
      getQueuePlaybackContext();
    currentQueueTrackId.value = queueTrack.queueId;
    currentQueueIndex.value = 0;
  };

  
  
  const replaceQueueWithTrack = (
    track: PlaylistTrack,
    playbackContext = getLibraryPlaybackContext(),
  ) => {
    const queueTrack = createQueueTrack(track, playbackContext);
    queue.value = [queueTrack];
    queueOriginalOrderIds.value = [queueTrack.queueId];
    queueConsumedHistory.value = [];
    currentSource.value = "queue";
    currentPlaybackContext.value =
      clonePlaybackContext(queueTrack.playbackContext) ??
      getQueuePlaybackContext();
    currentQueueTrackId.value = queueTrack.queueId;
    currentQueueIndex.value = 0;
  };

  
  
  const restorePreviousQueueTrack = () => {
    const previousTrack = queueConsumedHistory.value.pop();
    if (!previousTrack) return false;
  
    queue.value.unshift(previousTrack);
    queueOriginalOrderIds.value = [
      previousTrack.queueId,
      ...queueOriginalOrderIds.value.filter(
        (queueId) => queueId !== previousTrack.queueId,
      ),
    ];
    currentSource.value = "queue";
    currentPlaybackContext.value =
      clonePlaybackContext(previousTrack.playbackContext) ??
      getQueuePlaybackContext();
    currentQueueTrackId.value = previousTrack.queueId;
    currentQueueIndex.value = 0;
    return true;
  };

  
  
  const consumeCurrentQueueTrack = () => {
    if (currentSource.value !== "queue" || currentQueueIndex.value !== 0) return;
    if (queue.value.length <= 1) return;
  
    const [currentTrack] = queue.value.splice(0, 1);
    queueConsumedHistory.value.push(currentTrack);
    queueOriginalOrderIds.value = queueOriginalOrderIds.value.filter(
      (queueId) => queueId !== currentTrack.queueId,
    );
    currentQueueTrackId.value = queue.value[0]?.queueId ?? null;
    currentQueueIndex.value = queue.value.length > 0 ? 0 : -1;
  };

  
  
  const getPlaybackListBySource = (source: PlaybackSource) => {
    return source === "queue" ? queue.value : playlist.value;
  };

  
  
  const getRandomTrackIndex = (
    listLength: number,
    currentPlaybackIndex: number,
  ): number => {
    if (listLength <= 1) return 0;
  
    let nextIndex = currentPlaybackIndex;
  
    while (nextIndex === currentPlaybackIndex) {
      nextIndex = Math.floor(Math.random() * listLength);
    }
  
    return nextIndex;
  };

  
  
  const rememberShuffleTrack = () => {
    if (!filePath.value || activePlaybackIndex.value < 0) return;
  
    shuffleHistory.value.push({
      source: currentSource.value,
      index: activePlaybackIndex.value,
    });
  };

  
  
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

  
  
  const getTrackDisplayTitle = (track: PlaylistTrack) => {
    const metadataTitle = getLibraryTrackMetadata(track)?.title?.trim();
  
    if (metadataTitle) {
      return metadataTitle;
    }
  
    const nameWithoutExtension = track.fileName.replace(
      new RegExp(`\\.${track.extension}$`, "i"),
      "",
    );
  
    return nameWithoutExtension || "Sin nombre";
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
    if (!tracks.length) {
      libraryMetadataMap.value = {};
      return;
    }
  
    loadingLibraryMetadata.value = true;
  
    try {
      const rows = await invoke<LibraryTrackMetadataLiteRow[]>(
        "get_library_metadata_batch",
        {
          paths: tracks.map((track) => track.path),
        },
      );
  
      const nextMap: Record<string, LibraryTrackMetadata> = {};
  
      for (const row of rows) {
        // --- MAGIA AQUÍ: Convertimos la ruta local del disco duro a una URL web de Tauri ---
        let coverUrl = null;
        if (row.cover_path) {
          coverUrl = convertFileSrc(row.cover_path);
        }
        // -----------------------------------------------------------------------------------
  
        nextMap[row.path] = {
          title: row.title || "Sin título",
          artist: row.artist || "Artista desconocido",
          album: row.album || "—",
          album_artist: row.album_artist || row.artist || "Artista desconocido",
          year: row.year || null,
          duration_seconds: Number(row.duration_seconds || 0),
          duration_formatted:
            row.duration_formatted ||
            formatTime(Number(row.duration_seconds || 0)),
  
          // Asignamos la URL nativa súper rápida en lugar de anularla a null
          cover_art: coverUrl ? { data_url: coverUrl } : null,
  
          track_number: row.track_number ?? null,
        };
      }
  
      libraryMetadataMap.value = nextMap;
    } catch (error) {
      console.error("Error cargando metadata de biblioteca desde SQLite:", error);
  
      const fallbackMap: Record<string, LibraryTrackMetadata> = {};
  
      for (const track of tracks) {
        fallbackMap[track.path] = {
          title: track.fileName || "Sin título",
          artist: "Artista desconocido",
          album: "—",
          duration_seconds: 0,
          duration_formatted: "—",
          cover_art: null,
        };
      }
  
      libraryMetadataMap.value = fallbackMap;
    } finally {
      loadingLibraryMetadata.value = false;
    }
  };

  
  
  const isLibraryTrackActive = (track: PlaylistTrack, index?: number) => {
    return isLibraryTrackCurrent(track, index);
  };

  
  
  const isQueueTrackActive = (track: PlaylistTrack, realIndex: number) => {
    return (
      currentSource.value === "queue" &&
      filePath.value === track.path &&
      currentQueueIndex.value === realIndex
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
  
          if (loopMode.value === "one") {
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
    isBackendTrackReady.value = false;
    stopProgress();
  };

  
  
  const clearCurrentTrackState = async () => {
    try {
      await invoke("stop_audio_backend");
    } catch (error) {
      console.error("Error al limpiar la pista actual:", error);
    }
  
    resetVisualState();
    resetCanvas();
    canvasUrl.value = null;
    metadata.value = null;
    metadataTrackPath.value = null;
    filePath.value = null;
    fileExtension.value = "";
    rawFileName.value = "";
    currentIndex.value = -1;
    currentQueueIndex.value = -1;
    currentQueueTrackId.value = null;
    currentSource.value = "library";
    currentPlaybackContext.value = getLibraryPlaybackContext();
    queueConsumedHistory.value = [];
    shuffleHistory.value = [];
    isStopped.value = true;
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
      currentQueueTrackId.value = (track as QueueTrack).queueId;
      currentPlaybackContext.value =
        clonePlaybackContext((track as QueueTrack).playbackContext) ??
        getQueuePlaybackContext();
    } else {
      currentIndex.value = index;
      currentQueueTrackId.value = null;
      currentPlaybackContext.value = getLibraryPlaybackContext();
    }
  
    setTrackState(track);
    resetVisualState();
    metadata.value = null;
    metadataTrackPath.value = null;
    isStopped.value = false;
  
    const baseName = track.fileName.replace(
      new RegExp(`\\.${track.extension}$`, "i"),
      "",
    );
  
    resetCanvas();
    const videoPath = `C:\\Users\\jhonj\\Videos\\CANVAS SPOT\\${baseName}.mp4`;
    canvasUrl.value = convertFileSrc(videoPath);
  
    try {
      metadata.value = await invoke<AudioMetadata>("leer_metadata", {
        path: track.path,
      });
      metadataTrackPath.value = track.path;
  
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
  
    if (!autoplay) {
      isBackendTrackReady.value = false;
      return;
    }
  
    try {
      audioError.value = "";
  
      await fetchOutputDeviceInfo();
  
      await invoke("play_audio_file_at", {
        path: track.path,
        position: currentTime.value,
      });
  
      await invoke("set_audio_volume", {
        volume: isMuted.value ? 0 : volume.value,
      });
  
      isBackendTrackReady.value = true;
      isPlaying.value = true;
      startProgress();
  
      await nextTick();
      await syncCanvasWithPlayback();
    } catch (error) {
      console.error("Error al reproducir en Rust:", error);
      isBackendTrackReady.value = false;
      isPlaying.value = false;
      audioError.value = "El motor nativo no pudo reproducir este archivo.";
    }
  };

  
  
  watch([isPlaying, canvasUrl], async () => {
    await nextTick();
    await syncCanvasWithPlayback();
  });

  
  
  watch(isPlaying, () => {
    syncSessionProgressPersistence();
    schedulePersistAppSession();
  });

  
  
  watch(
    [
      queue,
      queueOriginalOrderIds,
      queueConsumedHistory,
      shuffleHistory,
      filePath,
      currentSource,
      currentQueueTrackId,
      currentPlaybackContext,
      volume,
      isMuted,
      lastVolumeBeforeMute,
      loopMode,
      isShuffleEnabled,
      librarySearch,
      globalSearch,
      queueSearch,
      currentViewMode,
      activeArtistView,
      activeAlbumView,
      activeAlbumArtistView,
      viewBackHistory,
      viewForwardHistory,
      isQueuePanelOpen,
      isRoutesManagerOpen,
    ],
    () => {
      schedulePersistAppSession();
    },
    { deep: true },
  );

  
  
  const playTrackFromLibrary = async (track: PlaylistTrack, index?: number) => {
    const playbackContext = getLibraryPlaybackContext();
    if (playbackContext.kind === "search") {
      rememberRecentGlobalSearch(playbackContext.label, track);
    }
  
    if (
      playbackContext.kind === "playlist" &&
      activePlaylist.value &&
      typeof index === "number" &&
      displayedTracks.value[index]
    ) {
      const occurrenceIndex = getTrackOccurrenceIndex(
        displayedTracks.value,
        index,
        track.path,
      );
      const realPlaylistIndex = findTrackIndexByOccurrence(
        activePlaylistTracks.value,
        track.path,
        occurrenceIndex,
      );
  
      if (realPlaylistIndex >= 0) {
        await playTrackCollectionFromIndex(
          activePlaylistTracks.value,
          playbackContext,
          realPlaylistIndex,
        );
        return;
      }
    }
  
    const existingQueueIndex = queue.value.findIndex(
      (item) => item.path === track.path,
    );
  
    if (existingQueueIndex >= 0) {
      queue.value[existingQueueIndex].playbackContext = playbackContext;
      await playTrackFromQueue(existingQueueIndex);
      return;
    }
  
    const shouldResetQueueToThisTrack =
      queue.value.length > 0 ||
      normalizedGlobalSearch.value.length > 0 ||
      normalizedLibrarySearch.value.length > 0 ||
      currentViewMode.value !== "library";
  
    if (shouldResetQueueToThisTrack) {
      replaceQueueWithTrack(track, playbackContext);
      await loadTrack({
        source: "queue",
        index: 0,
        autoplay: true,
        startAt: 0,
      });
      return;
    }
  
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

  
  
  const toggleLibraryTrackPlayback = async (
    track: PlaylistTrack,
    index?: number,
  ) => {
    if (isLibraryTrackCurrent(track, index)) {
      await togglePlay();
      return;
    }
  
    const realIndex = playlist.value.findIndex(
      (item) => item.path === track.path,
    );
    if (realIndex === -1) return;
  
    await playTrackFromLibrary(playlist.value[realIndex], index);
  };

  
  
  const playTrackFromQueue = async (queueIndex: number) => {
    if (queueIndex < 0 || queueIndex >= queue.value.length) return;
    const discardedTrackIds = queue.value
      .slice(0, queueIndex)
      .map((track) => track.queueId);
  
    // Quitar todas las canciones anteriores a la seleccionada
    if (queueIndex > 0) {
      queue.value.splice(0, queueIndex);
      queueOriginalOrderIds.value = queueOriginalOrderIds.value.filter(
        (queueId) => !discardedTrackIds.includes(queueId),
      );
    }
  
    // Ahora la canción seleccionada quedó en la posición 0
    await loadTrack({
      source: "queue",
      index: 0,
      autoplay: true,
      startAt: 0,
    });
  };

  
  
  const filteredQueueWithIndex = computed(() => {
    return queue.value
      .map((track, index) => ({ track, realIndex: index }))
      .filter(({ track }) => {
        if (!normalizedQueueSearch.value) return true;
  
        const base =
          `${track.fileName} ${track.extension} ${track.path}`.toLowerCase();
  
        return base.includes(normalizedQueueSearch.value);
      });
  });

  
  
  const addToQueue = (track: PlaylistTrack) => {
    ensureCurrentTrackIsFirstInQueue();
  
    if (
      track.path === filePath.value &&
      queue.value.some((item) => item.path === track.path)
    ) {
      isQueuePanelOpen.value = true;
      return;
    }
  
    const queueTrack = createQueueTrack(track, getLibraryPlaybackContext());
    addQueueTrackToState(queueTrack);
  
    if (isShuffleEnabled.value) {
      shuffleQueueOrder();
    }
  
    isQueuePanelOpen.value = true;
  };

  
  
  const addAllFilteredToQueue = () => {
    ensureCurrentTrackIsFirstInQueue();
  
    const playbackContext = getLibraryPlaybackContext();
  
    displayedTracks.value.forEach((track) => {
      if (
        track.path === filePath.value &&
        queue.value.some((item) => item.path === track.path)
      ) {
        return;
      }
  
      const queueTrack = createQueueTrack(track, playbackContext);
      addQueueTrackToState(queueTrack);
    });
  
    if (isShuffleEnabled.value) {
      shuffleQueueOrder();
    }
  
    isQueuePanelOpen.value = true;
  };

  
  
  const removeFromQueue = (queueIndex: number) => {
    if (queueIndex < 0 || queueIndex >= queue.value.length) return;
  
    const removingCurrent =
      currentSource.value === "queue" && currentQueueIndex.value === queueIndex;
    const removedTrack = queue.value[queueIndex];
  
    queue.value.splice(queueIndex, 1);
    queueOriginalOrderIds.value = queueOriginalOrderIds.value.filter(
      (queueId) => queueId !== removedTrack.queueId,
    );
  
    if (currentSource.value === "queue") {
      if (removingCurrent) {
        if (queue.value.length === 0) {
          currentQueueIndex.value = -1;
          currentQueueTrackId.value = null;
        } else if (queueIndex >= queue.value.length) {
          currentQueueIndex.value = queue.value.length - 1;
          currentQueueTrackId.value =
            queue.value[currentQueueIndex.value]?.queueId ?? null;
        }
      } else if (currentQueueIndex.value > queueIndex) {
        currentQueueIndex.value -= 1;
      }
    }
  };

  
  
  const clearQueue = () => {
    queue.value = [];
    queueOriginalOrderIds.value = [];
    queueConsumedHistory.value = [];
    if (currentSource.value === "queue") {
      currentQueueIndex.value = -1;
      currentQueueTrackId.value = null;
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
        pauseCanvas();
        return;
      }
  
      if (
        !isBackendTrackReady.value ||
        isStopped.value ||
        currentTime.value >= (duration.value || 0)
      ) {
        await fetchOutputDeviceInfo();
  
        await invoke("play_audio_file_at", {
          path: filePath.value,
          position: currentTime.value > 0 ? currentTime.value : 0,
        });
  
        await invoke("set_audio_volume", {
          volume: isMuted.value ? 0 : volume.value,
        });
  
        isBackendTrackReady.value = true;
        isPlaying.value = true;
        isStopped.value = false;
        startProgress();
        await nextTick();
        await syncCanvasWithPlayback();
        return;
      }
  
      await invoke("resume_audio");
      isPlaying.value = true;
      startProgress();
      await playCanvas();
    } catch (error) {
      console.error("Error al cambiar estado de reproducción:", error);
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
      schedulePersistAppSession();
  
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

  
  
  const volumeIconMode = computed(() => {
    if (isMuted.value || volume.value === 0) return "muted";
    if (volume.value <= 35) return "low";
    if (volume.value <= 75) return "medium";
    return "high";
  });

  
  
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
  
    if (
      isShuffleEnabled.value &&
      currentSource.value !== "queue" &&
      shuffleHistory.value.length > 0
    ) {
      while (shuffleHistory.value.length > 0) {
        const previousEntry = shuffleHistory.value.pop()!;
        const list = getPlaybackListBySource(previousEntry.source);
  
        if (previousEntry.index >= 0 && previousEntry.index < list.length) {
          await loadTrack({
            source: previousEntry.source,
            index: previousEntry.index,
            autoplay: true,
            startAt: 0,
          });
          return;
        }
      }
    }
  
    if (currentSource.value === "queue") {
      if (restorePreviousQueueTrack()) {
        await loadTrack({
          source: "queue",
          index: 0,
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
  
    if (isShuffleEnabled.value) {
      if (currentSource.value === "queue") {
        consumeCurrentQueueTrack();
        const nextQueueIndex = 0;
  
        if (nextQueueIndex < queue.value.length) {
          await loadTrack({
            source: "queue",
            index: nextQueueIndex,
            autoplay: true,
            startAt: 0,
          });
          return;
        }
  
        if (loopMode.value === "all" && queue.value.length > 0) {
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
  
      const targetSource: PlaybackSource =
        currentSource.value === "queue" || queue.value.length === 0
          ? currentSource.value
          : "queue";
      const list = getPlaybackListBySource(targetSource);
  
      if (list.length === 0) return;
  
      if (list.length === 1) {
        if (
          fromAutoEnd &&
          loopMode.value === "off" &&
          currentSource.value === targetSource &&
          activePlaybackIndex.value === 0
        ) {
          isPlaying.value = false;
          isStopped.value = true;
          currentTime.value = 0;
          stopProgress();
          return;
        }
  
        if (!fromAutoEnd || loopMode.value === "all") {
          rememberShuffleTrack();
          await loadTrack({
            source: targetSource,
            index: 0,
            autoplay: true,
            startAt: 0,
          });
        }
        return;
      }
  
      rememberShuffleTrack();
      await loadTrack({
        source: targetSource,
        index: getRandomTrackIndex(
          list.length,
          currentSource.value === targetSource ? activePlaybackIndex.value : -1,
        ),
        autoplay: true,
        startAt: 0,
      });
      return;
    }
  
    if (currentSource.value === "queue") {
      consumeCurrentQueueTrack();
      const nextQueueIndex = 0;
  
      if (nextQueueIndex < queue.value.length) {
        await loadTrack({
          source: "queue",
          index: nextQueueIndex,
          autoplay: true,
          startAt: 0,
        });
        return;
      }
  
      if (loopMode.value === "all") {
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
  
    if (loopMode.value === "all" && playlist.value.length > 0) {
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
  
    if (nextVolume > 0) {
      lastVolumeBeforeMute.value = nextVolume;
    }
  
    if (nextVolume === 0) {
      isMuted.value = true;
    } else if (isMuted.value) {
      isMuted.value = false;
    }
  
    await invoke("set_audio_volume", { volume: nextVolume });
  };

  
  
  const toggleMute = async () => {
    if (isMuted.value || volume.value === 0) {
      const restoredVolume =
        lastVolumeBeforeMute.value > 0 ? lastVolumeBeforeMute.value : 10;
  
      isMuted.value = false;
      volume.value = restoredVolume;
      await invoke("set_audio_volume", { volume: restoredVolume });
      return;
    }
  
    lastVolumeBeforeMute.value = volume.value;
    isMuted.value = true;
    await invoke("set_audio_volume", { volume: 0 });
  };

  
  
  const toggleLoop = () => {
    if (loopMode.value === "off") {
      loopMode.value = "all";
    } else if (loopMode.value === "all") {
      loopMode.value = "one";
    } else {
      loopMode.value = "off";
    }
  };

  
  
  const toggleShuffle = () => {
    isShuffleEnabled.value = !isShuffleEnabled.value;
    shuffleHistory.value = [];
  
    if (isShuffleEnabled.value) {
      shuffleQueueOrder();
      return;
    }
  
    restoreQueueOriginalOrder();
  };

  
  
  const buildSessionQueueTrack = (track: QueueTrack): SessionQueueTrack => ({
    path: track.path,
    queueId: track.queueId,
    playbackContext:
      clonePlaybackContext(track.playbackContext) ?? getQueuePlaybackContext(),
  });

  
  
  const buildAppSessionSnapshot = (): AppSessionSnapshot => ({
    currentTrackPath: filePath.value,
    currentSource: currentSource.value,
    currentQueueTrackId: currentQueueTrackId.value,
    currentPlaybackContext: clonePlaybackContext(currentPlaybackContext.value),
    currentTime: currentTime.value,
    volume: volume.value,
    isMuted: isMuted.value,
    lastVolumeBeforeMute: lastVolumeBeforeMute.value,
    loopMode: loopMode.value,
    isShuffleEnabled: isShuffleEnabled.value,
    wasPlaying: isPlaying.value,
    queue: queue.value.map(buildSessionQueueTrack),
    queueOriginalOrderIds: [...queueOriginalOrderIds.value],
    queueConsumedHistory: queueConsumedHistory.value.map(buildSessionQueueTrack),
    shuffleHistory: shuffleHistory.value.map((entry) => ({ ...entry })),
    nextQueueId: nextQueueId.value,
    librarySearch: librarySearch.value,
    globalSearch: globalSearch.value,
    queueSearch: queueSearch.value,
    isQueuePanelOpen: isQueuePanelOpen.value,
    isRoutesManagerOpen: isRoutesManagerOpen.value,
    deviceName: desktopDeviceName.value,
    outputDeviceName: outputDeviceInfo.value?.device_name ?? "Este PC",
    currentViewSnapshot: getCurrentViewSnapshot(),
  });

  
  
  const clearSessionPersistTimeout = () => {
    if (sessionPersistTimeout != null) {
      window.clearTimeout(sessionPersistTimeout);
      sessionPersistTimeout = null;
    }
  };

  
  
  const persistAppSessionNow = async () => {
    if (isRestoringAppSession) return;
    clearSessionPersistTimeout();
    await persistAppSession(buildAppSessionSnapshot());
  };

  
  
  const schedulePersistAppSession = (delay = 250) => {
    if (isRestoringAppSession) return;
    clearSessionPersistTimeout();
    sessionPersistTimeout = window.setTimeout(() => {
      sessionPersistTimeout = null;
      void persistAppSessionNow();
    }, delay);
  };

  
  
  const syncSessionProgressPersistence = () => {
    if (sessionProgressInterval != null) {
      window.clearInterval(sessionProgressInterval);
      sessionProgressInterval = null;
    }
  
    if (isPlaying.value) {
      sessionProgressInterval = window.setInterval(() => {
        void persistAppSessionNow();
      }, 4000);
    }
  };

  const getPayloadNumber = (
    payload: Record<string, unknown> | null,
    key: string,
  ) => {
    const value = payload?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  const getPayloadString = (
    payload: Record<string, unknown> | null,
    key: string,
  ) => {
    const value = payload?.[key];
    return typeof value === "string" ? value : null;
  };

  const setVolumeFromConnect = async (nextVolume: number) => {
    const safeVolume = Math.min(Math.max(nextVolume, 0), 100);
    volume.value = safeVolume;

    if (safeVolume > 0) {
      lastVolumeBeforeMute.value = safeVolume;
      isMuted.value = false;
    } else {
      isMuted.value = true;
    }

    await invoke("set_audio_volume", { volume: safeVolume });
  };

  const applyConnectCommand = async (record: ConnectCommandRecord) => {
    const payload = record.payload;

    switch (record.command) {
      case "play_path": {
        const path = getPayloadString(payload, "path");
        if (!path) return;

        const track = playlist.value.find((item) => item.path === path);
        if (!track) return;

        const startAt = getPayloadNumber(payload, "startAt") ?? 0;
        const autoplay = payload?.autoplay !== false;
        const realIndex = playlist.value.findIndex((item) => item.path === path);

        if (realIndex >= 0 && queue.value.length === 0) {
          await loadTrack({
            source: "library",
            index: realIndex,
            autoplay,
            startAt,
          });
          return;
        }

        replaceQueueWithTrack(track, createPlaybackContext("library", "Biblioteca"));
        await loadTrack({
          source: "queue",
          index: 0,
          autoplay,
          startAt,
        });
        return;
      }
      case "toggle_playback":
        await togglePlay();
        return;
      case "pause":
        if (isPlaying.value) await togglePlay();
        return;
      case "resume":
        if (!isPlaying.value) await togglePlay();
        return;
      case "next":
        await playNextTrack();
        return;
      case "previous":
        await playPreviousTrack();
        return;
      case "seek_to": {
        const seconds = getPayloadNumber(payload, "seconds");
        if (seconds != null) await seekTo(seconds);
        return;
      }
      case "set_volume": {
        const nextVolume = getPayloadNumber(payload, "volume");
        if (nextVolume != null) await setVolumeFromConnect(nextVolume);
        return;
      }
      case "set_shuffle": {
        const enabled = payload?.enabled;
        if (typeof enabled === "boolean" && enabled !== isShuffleEnabled.value) {
          toggleShuffle();
        }
        return;
      }
      case "set_loop": {
        const mode = getPayloadString(payload, "mode");
        if (mode === "off" || mode === "all" || mode === "one") {
          loopMode.value = mode;
        }
        return;
      }
    }
  };

  const pollConnectCommands = async () => {
    try {
      const commands = await invoke<ConnectCommandRecord[]>(
        "consume_connect_commands",
      );

      for (const command of commands) {
        await applyConnectCommand(command);
      }

      await refreshConnectState();
    } catch (error) {
      console.warn("No se pudieron leer comandos Desktop Connect:", error);
    }
  };

  const startConnectCommandPolling = () => {
    if (connectCommandPollInterval != null) return;
    connectCommandPollInterval = window.setInterval(() => {
      void pollConnectCommands();
    }, 1000);
    void pollConnectCommands();
  };

  const stopConnectCommandPolling = () => {
    if (connectCommandPollInterval == null) return;
    window.clearInterval(connectCommandPollInterval);
    connectCommandPollInterval = null;
  };

  const refreshConnectState = async () => {
    try {
      connectState.value = await invoke<ConnectStateRecord>(
        "get_desktop_connect_state",
      );
    } catch (error) {
      console.warn("No se pudo cargar Desktop Connect:", error);
    }
  };

  const activeConnectDevice = computed(
    () => connectState.value?.activeDevice ?? "desktop",
  );

  const isMobileConnectActive = computed(
    () => activeConnectDevice.value === "mobile",
  );

  const mobileConnectSession = computed(
    () => connectState.value?.mobile?.session ?? null,
  );

  const mobileConnectTrack = computed(() => {
    const path = mobileConnectSession.value?.currentTrackPath;
    if (!path) return null;
    return playlist.value.find((track) => track.path === path) ?? null;
  });

  const mobileConnectTitle = computed(() => {
    const track = mobileConnectTrack.value;
    if (!track) return "Movil";
    return getTrackDisplayTitle(track);
  });

  const connectPlaybackDeviceLabel = computed(() =>
    isMobileConnectActive.value
      ? "Telefono"
      : outputDeviceInfo.value?.device_name ?? desktopDeviceName.value,
  );

  const listenOnDesktop = async () => {
    const session = isMobileConnectActive.value
      ? mobileConnectSession.value
      : buildAppSessionSnapshot();
    const path = session?.currentTrackPath;

    await invoke("set_desktop_connect_active_device", { device: "desktop" });

    if (!path) {
      await refreshConnectState();
      return;
    }

    const track = playlist.value.find((item) => item.path === path);
    if (!track) {
      await refreshConnectState();
      return;
    }

    const realIndex = playlist.value.findIndex((item) => item.path === path);
    const startAt = Number.isFinite(session.currentTime)
      ? session.currentTime
      : 0;

    if (realIndex >= 0) {
      await loadTrack({
        source: "library",
        index: realIndex,
        autoplay: session.wasPlaying,
        startAt,
      });
    } else {
      replaceQueueWithTrack(track, createPlaybackContext("library", "Biblioteca"));
      await loadTrack({
        source: "queue",
        index: 0,
        autoplay: session.wasPlaying,
        startAt,
      });
    }

    await persistAppSessionNow();
    await refreshConnectState();
  };

  const listenOnMobile = async () => {
    await persistAppSessionNow();
    if (isPlaying.value) {
      await invoke("pause_audio");
      isPlaying.value = false;
      stopProgress();
      pauseCanvas();
    }
    await invoke("set_desktop_connect_active_device", { device: "mobile" });
    await refreshConnectState();
  };

  
  
  const restoreAppSession = async (session: AppSessionSnapshot | null) => {
    if (!session) return;
  
    isRestoringAppSession = true;
  
    try {
      volume.value = Number.isFinite(session.volume) ? session.volume : 10;
      isMuted.value = Boolean(session.isMuted);
      lastVolumeBeforeMute.value = Number.isFinite(session.lastVolumeBeforeMute)
        ? session.lastVolumeBeforeMute
        : volume.value;
      loopMode.value = ["off", "all", "one"].includes(session.loopMode)
        ? session.loopMode
        : "off";
      isShuffleEnabled.value = Boolean(session.isShuffleEnabled);
      isQueuePanelOpen.value = Boolean(session.isQueuePanelOpen);
      isRoutesManagerOpen.value = Boolean(session.isRoutesManagerOpen);
      queueSearch.value = session.queueSearch ?? "";
  
      applyViewSnapshot({
        mode: "library",
        artist: null,
        album: null,
        albumArtist: null,
        playlistId: null,
        search: "",
        globalQuery: "",
      });
      librarySearch.value = "";
      globalSearch.value = "";
  
      const playlistMap = new Map(
        playlist.value.map((track) => [track.path, track]),
      );
  
      const restoreSessionQueueTrack = (
        item: SessionQueueTrack,
      ): QueueTrack | null => {
        const track = playlistMap.get(item.path);
        if (!track) return null;
  
        return {
          ...track,
          queueId: item.queueId,
          playbackContext:
            clonePlaybackContext(item.playbackContext) ??
            getQueuePlaybackContext(),
        };
      };
  
      queue.value = (session.queue ?? [])
        .map((item) => restoreSessionQueueTrack(item))
        .filter((item): item is QueueTrack => item !== null);
  
      queueConsumedHistory.value = (session.queueConsumedHistory ?? [])
        .map((item) => restoreSessionQueueTrack(item))
        .filter((item): item is QueueTrack => item !== null);
  
      const validQueueIds = new Set(queue.value.map((track) => track.queueId));
      queueOriginalOrderIds.value = (session.queueOriginalOrderIds ?? []).filter(
        (queueId) => validQueueIds.has(queueId),
      );
  
      const maxRestoredQueueId = Math.max(
        0,
        ...queue.value.map((track) => track.queueId),
        ...queueConsumedHistory.value.map((track) => track.queueId),
        ...(session.queueOriginalOrderIds ?? []),
        session.nextQueueId ?? 0,
      );
      nextQueueId.value = Math.max(1, maxRestoredQueueId + 1);
  
      shuffleHistory.value = (session.shuffleHistory ?? []).filter((entry) => {
        const list =
          entry.source === "queue"
            ? queue.value
            : entry.source === "library"
              ? playlist.value
              : [];
        return entry.index >= 0 && entry.index < list.length;
      });
  
      currentSource.value =
        session.currentSource === "queue" ? "queue" : "library";
      currentQueueTrackId.value = session.currentQueueTrackId ?? null;
      currentPlaybackContext.value =
        clonePlaybackContext(session.currentPlaybackContext) ??
        getLibraryPlaybackContext();
  
      syncCurrentQueueIndexFromTrackId();
  
      const sessionTrackPath = session.currentTrackPath?.trim() ?? "";
      const sessionStartAt = Math.max(0, session.currentTime ?? 0);
      let didRestoreTrack = false;
  
      if (sessionTrackPath) {
        if (
          currentSource.value === "queue" &&
          currentQueueTrackId.value != null
        ) {
          const queueIndex = queue.value.findIndex(
            (track) => track.queueId === currentQueueTrackId.value,
          );
  
          if (queueIndex >= 0) {
            await loadTrack({
              source: "queue",
              index: queueIndex,
              autoplay: false,
              startAt: sessionStartAt,
            });
            didRestoreTrack = true;
          }
        }
  
        if (!didRestoreTrack) {
          const libraryIndex = playlist.value.findIndex(
            (track) => track.path === sessionTrackPath,
          );
  
          if (libraryIndex >= 0) {
            await loadTrack({
              source: "library",
              index: libraryIndex,
              autoplay: false,
              startAt: sessionStartAt,
            });
            didRestoreTrack = true;
          }
        }
      }
  
      if (didRestoreTrack) {
        await invoke("set_audio_volume", {
          volume: isMuted.value ? 0 : volume.value,
        });
        isPlaying.value = false;
        isStopped.value = false;
      }
    } finally {
      isRestoringAppSession = false;
      syncSessionProgressPersistence();
      schedulePersistAppSession();
    }
  };

  
  
  const onBeforeWindowUnload = () => {
    void persistAppSessionNow();
  };

  
  
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      void persistAppSessionNow();
    }
  };

  
  
  const onGlobalWindowClick = (e: MouseEvent) => {
    if (shouldSuppressNextWindowClick) {
      e.preventDefault();
      e.stopPropagation();
      shouldSuppressNextWindowClick = false;
      console.log("[playlist-dnd] suppressed-post-drag-click");
      return;
    }
  
    closeTrackContextMenu();
    closePlaylistContextMenu();
  
    const target = e.target as HTMLElement;
  
    if (
      globalSearchShellRef.value &&
      !globalSearchShellRef.value.contains(target)
    ) {
      closeGlobalSearchPopover();
    }
  
    // Si el click NO está dentro de una fila → deseleccionar
    if (!target.closest(".spotify-row") && !target.closest(".queue-row")) {
      selectedLibraryTrack.value = null;
    }
  };

  
  
  const albumScrollContainerRef = ref<HTMLElement | null>(null);

  
  const albumHeroRef = ref<HTMLElement | null>(null);

  
  const compactAlbumBarVisible = ref(false);

  
  
  const albumColor = ref("rgba(40,40,40,0.96)");

  
  
  const darkenColor = (rgba: string, factor = 0.6) => {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return rgba;
  
    const r = Math.floor(Number(match[1]) * factor);
    const g = Math.floor(Number(match[2]) * factor);
    const b = Math.floor(Number(match[3]) * factor);
  
    return `rgba(${r}, ${g}, ${b}, 0.95)`;
  };

  
  
  const compactAlbumBarStyle = computed(() => {
    const base = albumColor.value;
    const dark = darkenColor(base, 0.55);
  
    return {
      background: `
        linear-gradient(
          180deg,
          ${base} 0%,
          ${base} 55%,
          ${dark} 100%
        )
      `,
      backdropFilter: "blur(30px) saturate(180%)",
      WebkitBackdropFilter: "blur(30px) saturate(180%)",
    };
  });

  
  
  const getAverageColor = (imgUrl: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
  
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
  
      canvas.width = img.width;
      canvas.height = img.height;
  
      ctx.drawImage(img, 0, 0);
  
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
  
      let r = 0,
        g = 0,
        b = 0;
      let count = 0;
  
      for (let i = 0; i < data.length; i += 40) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
  
      r = Math.floor(r / count);
      g = Math.floor(g / count);
      b = Math.floor(b / count);
  
      albumColor.value = `rgba(${r}, ${g}, ${b}, 0.95)`;
    };
  
    img.src = imgUrl;
  };

  
  
  watch(activeAlbumCover, (cover) => {
    if (cover) {
      getAverageColor(cover);
    }
  });

  
  
  const updateAlbumCompactBar = () => {
    if (currentViewMode.value !== "album") {
      compactAlbumBarVisible.value = false;
      return;
    }
  
    const container = albumScrollContainerRef.value;
    const hero = albumHeroRef.value;
  
    if (!container || !hero) {
      compactAlbumBarVisible.value = false;
      return;
    }
  
    const triggerPoint = hero.offsetHeight - 90;
    compactAlbumBarVisible.value = container.scrollTop > triggerPoint;
  };

  
  
  watch(currentViewMode, async (newMode, oldMode) => {
    if (newMode === "spotiflac") {
      void checkSpotiFlacPanel();
    }

    await nextTick();
    if (newMode === "album" && oldMode !== "album") {
      const container = albumScrollContainerRef.value;
      if (container) {
        container.scrollTop = 0;
      }
    }
    updateAlbumCompactBar();
  });

  
  
  watch(activeAlbumView, async () => {
    await nextTick();
    const container = albumScrollContainerRef.value;
    if (container) {
      container.scrollTop = 0;
    }
    compactAlbumBarVisible.value = false;
    updateAlbumCompactBar();
  });

  
  
  watch(playlists, () => {
    if (
      currentViewMode.value === "playlist" &&
      activePlaylistViewId.value != null &&
      !playlists.value.some((item) => item.id === activePlaylistViewId.value)
    ) {
      goHomeView();
    }
  });

  
  
  // Crea una variable para guardar el evento (ponla cerca de tus otros unlistenFsChanges)
  let unlistenDeviceChanged: UnlistenFn | null = null;

  
  
  onMounted(async () => {
    installSpotiFlacHost();
    updateSpotiFlacConnectivityStatus();
    await nextTick();
    await waitForNextPaint();
    try {

    unlistenFsChanges = await listen("library-updated", () => {
      console.log("Detectado cambio en la carpeta, actualizando canciones...");
      void syncLibrary();
    });
  
    // ======== NUEVO ========
    // Escuchamos el evento desde Rust cuando el dispositivo cambia automáticamente
    unlistenDeviceChanged = await listen("audio-device-changed", () => {
      console.log("🔄 Dispositivo de audio cambiado. Actualizando UI...");
      void fetchOutputDeviceInfo();
    });
    // =======================
  
    await fetchComputerName();
    await fetchOutputDeviceInfo();
    await loadPlaylists();
    const savedAppSession = await loadAppSession();
    hasPendingAppSessionRestore = Boolean(
      savedAppSession?.currentTrackPath || savedAppSession?.queue?.length,
    );
    recentGlobalSearches.value = normalizeRecentGlobalSearches(
      await loadRecentGlobalSearches(),
    );
    if (
      recentGlobalSearches.value.length === 0 &&
      !hasMigratedLegacyRecentGlobalSearches()
    ) {
      const legacyRecents = normalizeRecentGlobalSearches(
        loadLegacyRecentGlobalSearches(),
      );
      if (legacyRecents.length > 0) {
        recentGlobalSearches.value = legacyRecents;
        void persistRecentGlobalSearches(legacyRecents).then((didPersist) => {
          if (didPersist) {
            markLegacyRecentGlobalSearchesMigrated();
          }
        });
      } else {
        markLegacyRecentGlobalSearchesMigrated();
      }
    }
  
    try {
      const savedDirectories = await invoke<string[]>("get_music_directories");
  
      musicDirectories.value = savedDirectories;
  
      if (musicDirectories.value.length > 0) {
        await syncLibrary();
        await invoke("watch_directories", {
          directories: musicDirectories.value,
        });
      }
    } catch (error) {
      console.error("Error al cargar rutas guardadas:", error);
    }
  
    await restoreAppSession(savedAppSession);
    hasPendingAppSessionRestore = false;
    await refreshConnectState();
    startConnectCommandPolling();
  
    window.addEventListener("keydown", onGlobalKeydown);
    window.addEventListener("click", onGlobalWindowClick);
    window.addEventListener("beforeunload", onBeforeWindowUnload);
    window.addEventListener("online", updateSpotiFlacConnectivityStatus);
    window.addEventListener("offline", updateSpotiFlacConnectivityStatus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    } finally {
      isAppBooting.value = false;
      window.dispatchEvent(new Event("app-ready"));
    }
  });

  
  
  onBeforeUnmount(() => {
    void persistAppSessionNow();
    stopProgress();
    invoke("stop_audio_backend").catch(console.error);
    pendingTrackPointerDrag = null;
    removePendingTrackPointerListeners();
    cleanupTrackDragState();
    if (playlistAddToastTimeoutId != null) {
      window.clearTimeout(playlistAddToastTimeoutId);
      playlistAddToastTimeoutId = null;
    }
    window.cancelAnimationFrame(globalSearchLoadingFrame);
    clearSessionPersistTimeout();
    stopConnectCommandPolling();
    if (sessionProgressInterval != null) {
      window.clearInterval(sessionProgressInterval);
      sessionProgressInterval = null;
    }
  
    window.removeEventListener("keydown", onGlobalKeydown);
    window.removeEventListener("click", onGlobalWindowClick);
    window.removeEventListener("beforeunload", onBeforeWindowUnload);
    window.removeEventListener("online", updateSpotiFlacConnectivityStatus);
    window.removeEventListener("offline", updateSpotiFlacConnectivityStatus);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("wheel", preventScroll);
    window.removeEventListener("touchmove", preventScroll);
  
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  
    if (unlistenFsChanges) {
      unlistenFsChanges();
      unlistenFsChanges = null;
    }
  
    // ======== NUEVO ========
    // Limpiamos el listener al cerrar
    if (unlistenDeviceChanged) {
      unlistenDeviceChanged();
      unlistenDeviceChanged = null;
    }
    // =======================

    if (detachSpotiFlacHost) {
      detachSpotiFlacHost();
      detachSpotiFlacHost = null;
    }
  });

  return {
    isAppBooting,
    outputDeviceInfo,
    LEGACY_GLOBAL_SEARCH_RECENTS_KEY,
    LEGACY_GLOBAL_SEARCH_RECENTS_MIGRATED_KEY,
    isRecentSearchItem,
    loadRecentGlobalSearches,
    loadLegacyRecentGlobalSearches,
    hasMigratedLegacyRecentGlobalSearches,
    markLegacyRecentGlobalSearchesMigrated,
    persistRecentGlobalSearches,
    loadAppSession,
    persistAppSession,
    fetchOutputDeviceInfo,
    canvasVideoRef,
    canvasUrl,
    handleCanvasError,
    libraryMetadataMap,
    loadingLibraryMetadata,
    createPlaybackContext,
    clonePlaybackContext,
    progressBarRef,
    showProgressTooltip,
    hoverPreviewTime,
    hoverTooltipLeft,
    onProgressHover,
    pauseCanvas,
    getAlbumArtistForTrack,
    getAlbumViewKey,
    activeAlbumViewKey,
    isActiveAlbumPlaying,
    playCanvas,
    resetCanvas,
    syncCanvasWithPlayback,
    onProgressLeave,
    onProgressEnter,
    selectedLibraryTrack,
    contextMenu,
    playlistContextMenu,
    isRenamePlaylistModalVisible,
    renamePlaylistName,
    renamePlaylistTargetId,
    playlistPendingDeletionId,
    isContextMenuPlaylistPickerVisible,
    contextMenuPlaylistSearch,
    contextMenuStyle,
    contextMenuPlaylistPickerStyle,
    playlistContextMenuStyle,
    selectLibraryTrack,
    openTrackContextMenu,
    openTrackContextMenuAt,
    closeTrackContextMenu,
    openPlaylistContextMenu,
    openPlaylistContextMenuAt,
    openPlaylistContextMenuFromButton,
    closePlaylistContextMenu,
    closePlaylistRenameModal,
    closePlaylistDeleteModal,
    addContextMenuTrackToQueue,
    playContextMenuTrack,
    removeContextMenuTrackFromQueue,
    contextMenuActivePlaylist,
    contextMenuTargetsCurrentTrack,
    contextMenuCanRemoveFromQueue,
    contextMenuCanRemoveFromPlaylist,
    contextMenuPlaylistActions,
    filteredContextMenuPlaylistActions,
    toggleContextMenuTrackPlayback,
    goToContextMenuArtist,
    goToContextMenuAlbum,
    isLibraryTrackSelected,
    handleLibraryTrackPrimaryAction,
    openLibraryTrackMenu,
    playlist,
    playlists,
    queue,
    queueOriginalOrderIds,
    queueConsumedHistory,
    currentQueueTrackId,
    nextQueueId,
    currentIndex,
    currentQueueIndex,
    currentSource,
    currentPlaybackContext,
    hoveredLibraryTrackPath,
    hoveredQueueTrackId,
    sidebarLibraryFilter,
    sidebarLibrarySearch,
    isSidebarSearchVisible,
    isLibrarySidebarCollapsed,
    isPlaylistCreatorVisible,
    newPlaylistName,
    draggedTrack,
    sidebarDropTargetPlaylistId,
    activeDragPreviewEl,
    playlistAddToast,
    duplicatePlaylistModal,
    playlistAddToastTimeoutId,
    lastLoggedDragPosition,
    pendingTrackPointerDrag,
    shouldSuppressNextWindowClick,
    globalSearchInputRef,
    librarySearchInputRef,
    sidebarSearchInputRef,
    newPlaylistInputRef,
    contextMenuPlaylistSearchInputRef,
    emptyPlaylistSearchInputRef,
    globalSearchShellRef,
    isGlobalSearchPopoverOpen,
    isGlobalSearchLoading,
    committedGlobalSearch,
    recentGlobalSearches,
    connectState,
    activeConnectDevice,
    isMobileConnectActive,
    mobileConnectSession,
    mobileConnectTrack,
    mobileConnectTitle,
    connectPlaybackDeviceLabel,
    refreshConnectState,
    listenOnDesktop,
    listenOnMobile,
    globalSearchLoadingFrame,
    isRestoringAppSession,
    hasPendingAppSessionRestore,
    sessionPersistTimeout,
    sessionProgressInterval,
    emptyPlaylistSearch,
    isEmptyPlaylistDiscoveryVisible,
    focusGlobalSearch,
    focusContextSearch,
    openGlobalSearchPopover,
    closeGlobalSearchPopover,
    onGlobalKeydown,
    isLibraryTrackHovered,
    doesPlaybackContextMatchCurrentView,
    getTrackOccurrenceIndex,
    findTrackIndexByOccurrence,
    getCurrentPlaylistOccurrenceIndex,
    isLibraryTrackCurrent,
    shouldShowLibraryEqualizer,
    shouldShowLibraryPauseIcon,
    shouldShowLibraryPlayIcon,
    shouldShowLibraryIndexNumber,
    isBackendTrackReady,
    filePath,
    fileExtension,
    isPlaying,
    isMuted,
    loopMode,
    loopTooltip,
    isShuffleEnabled,
    shuffleTooltip,
    shuffleHistory,
    audioError,
    isStopped,
    currentTime,
    duration,
    volume,
    lastVolumeBeforeMute,
    rawFileName,
    metadata,
    metadataTrackPath,
    isDraggingSeek,
    seekPreviewTime,
    isSeekInFlight,
    seekRequestId,
    progressInterval,
    musicDirectories,
    unlistenFsChanges,
    librarySearch,
    globalSearch,
    queueSearch,
    isQueuePanelOpen,
    isRoutesManagerOpen,
    currentViewMode,
    spotiFlacUrl,
    isSpotiFlacChecking,
    isSpotiFlacReady,
    isSpotiFlacOffline,
    spotiFlacStatusMessage,
    activeArtistView,
    activeAlbumView,
    activeAlbumArtistView,
    activePlaylistViewId,
    viewBackHistory,
    viewForwardHistory,
    getTrackSearchBase,
    getCurrentViewSnapshot,
    isSameViewSnapshot,
    applyViewSnapshot,
    navigateToView,
    goBackView,
    goForwardView,
    goHomeView,
    openSpotiFlacView,
    reloadSpotiFlacFrame,
    canGoBackView,
    canGoForwardView,
    getLibraryPlaybackContext,
    getQueuePlaybackContext,
    goToArtist,
    goToAlbum,
    goToPlaylist,
    loadPlaylists,
    toggleSidebarLibraryFilter,
    toggleSidebarSearch,
    toggleLibrarySidebar,
    showPlaylistCreator,
    cancelPlaylistCreator,
    submitPlaylistCreation,
    closeDuplicatePlaylistModal,
    showPlaylistAddToast,
    addTrackToPlaylist,
    addContextMenuTrackToPlaylist,
    confirmDuplicatePlaylistAdd,
    toggleContextMenuPlaylistPicker,
    openContextMenuPlaylistCreator,
    openEmptyPlaylistDiscovery,
    closeEmptyPlaylistDiscovery,
    addTrackToActivePlaylist,
    removeTrackFromPlaylist,
    removeContextMenuTrackFromPlaylist,
    cleanupTrackDragState,
    moveTrackDragPreview,
    updateSidebarDropTargetFromPoint,
    resolveDraggedTrack,
    createTrackDragPreview,
    getSidebarPlaylistDropTargetFromElement,
    isSidebarItemPlaylistDropTarget,
    isSidebarItemDropEnabled,
    isSidebarItemDropActive,
    removePendingTrackPointerListeners,
    handleTrackPointerDown,
    handlePendingTrackPointerMove,
    handlePendingTrackPointerUp,
    handleSidebarItemDragEnter,
    handleSidebarItemDragOver,
    handleSidebarListDragOver,
    handleSidebarListDrop,
    handleSidebarListDragLeave,
    handleSidebarItemDragLeave,
    handleSidebarItemDrop,
    openRenamePlaylistModal,
    submitPlaylistRename,
    requestDeletePlaylist,
    playlistPendingDeletion,
    confirmDeletePlaylist,
    playPlaylistFromContextMenu,
    addPlaylistToQueueFromContextMenu,
    splitArtists,
    artistIndex,
    albumIndex,
    activeArtistTracks,
    activeArtistAlbums,
    activePlaylist,
    activePlaylistSafe,
    activePlaylistTracks,
    getPlaylistCoverTiles,
    getPlaylistCover,
    activePlaylistCoverTiles,
    activePlaylistDurationFormatted,
    isActivePlaylistPlaying,
    activePlaylistContextMenuTarget,
    normalizedSidebarLibrarySearch,
    sidebarLibraryItems,
    visibleSidebarLibraryItems,
    activeAlbumTracks,
    activeAlbumCover,
    activeAlbumArtist,
    activeAlbumYear,
    activeAlbumDurationFormatted,
    isActivePlaylistEmpty,
    emptyPlaylistSearchResults,
    playAlbum,
    playTrackCollection,
    playTrackCollectionFromIndex,
    playArtist,
    playAlbumResult,
    playPlaylistById,
    addPlaylistToQueue,
    toggleOrPlaySearchTrack,
    playQuickSearchArtist,
    playQuickSearchAlbum,
    playRecentSearchItem,
    isSearchTrackPlaying,
    isSearchAlbumPlaying,
    isSearchArtistPlaying,
    isRecentSearchItemPlaying,
    displayedTracks,
    librarySearchPlaceholder,
    globalSearchPlaceholder,
    currentViewTitle,
    shouldShowCurrentViewEmpty,
    currentViewEmptyTitle,
    currentViewEmptySubtitle,
    commitGlobalSearch,
    applyQuickSearchSuggestion,
    onGlobalSearchFocus,
    onGlobalSearchKeydown,
    isLyricsMode,
    parsedLyrics,
    lyricsContainerRef,
    isUserScrolling,
    activeLyricsTab,
    hasSynced,
    hasStatic,
    hasBothLyrics,
    currentLyricsView,
    activePlaybackIndex,
    normalizeSearchValue,
    normalizedLibrarySearch,
    normalizedGlobalSearch,
    getSearchMatchScore,
    getTracksForSearchQuery,
    getArtistsForSearchQuery,
    getAlbumsForSearchQuery,
    buildRecentTrackSearchItem,
    createRecentTrackSearchItem,
    createRecentAlbumSearchItem,
    createRecentArtistSearchItem,
    findArtistByName,
    findAlbumByIdentity,
    buildRecentSearchItem,
    getExplicitRecentSearchEntityKey,
    getRecentSearchEntityKey,
    getRecentSearchArtistName,
    hydrateRecentSearchItem,
    findTrackByRecentSearchItem,
    normalizeRecentGlobalSearches,
    clearGlobalSearchState,
    removeRecentGlobalSearch,
    scrollLibraryTrackIntoView,
    getPrimaryTrackArtist,
    openTrackAlbumView,
    goToRecentTrackLocation,
    goToRecentSearchArtist,
    goToRecentSearchAlbum,
    getRecentSearchTrackArtists,
    openRecentGlobalSearchContextMenu,
    playRecentSearchTrack,
    rememberRecentGlobalSearch,
    rememberRecentGlobalSearchItem,
    handleRecentGlobalSearchClick,
    quickSearchTracks,
    handleQuickSearchTrackClick,
    playQuickSearchTrack,
    quickSearchArtists,
    quickSearchPrimaryArtist,
    handleQuickSearchArtistClick,
    quickSearchAlbums,
    handleQuickSearchAlbumClick,
    quickSearchSuggestions,
    committedSearchTracks,
    committedSearchArtists,
    committedSearchAlbums,
    committedSearchTopResult,
    isSearchViewActive,
    hasQuickSearchResults,
    isGlobalSearchPopoverVisible,
    filteredPlaylist,
    normalizedQueueSearch,
    onUserInteraction,
    syncLyricsView,
    preventScroll,
    seekAndSync,
    parseLrc,
    syncLibrary,
    añadirRutaMusica,
    persistMusicDirectories,
    removeMusicDirectory,
    clearMusicDirectories,
    activeLyricIndex,
    toggleLyricsMode,
    displayTitle,
    displayArtist,
    currentPlaybackSourceLabel,
    currentPlaybackSourceTargetLabel,
    canNavigateFromPlaybackSourceLabel,
    playbackSourceBadgeAriaLabel,
    navigateFromPlaybackSourceLabel,
    displayAlbum,
    coverUrl,
    trackLabel,
    discLabel,
    visibleCurrentTime,
    syncCurrentQueueIndexFromTrackId,
    shuffleArray,
    restoreQueueOriginalOrder,
    shuffleQueueOrder,
    getTrackPlaybackContext,
    createQueueTrack,
    addQueueTrackToState,
    ensureCurrentTrackIsFirstInQueue,
    replaceQueueWithTrack,
    restorePreviousQueueTrack,
    consumeCurrentQueueTrack,
    getPlaybackListBySource,
    getRandomTrackIndex,
    rememberShuffleTrack,
    progressPercentage,
    formatTime,
    getTrackDisplayTitle,
    getLibraryTrackMetadata,
    getLibraryTrackArtist,
    getLibraryTrackAlbum,
    getLibraryTrackDuration,
    getLibraryTrackCover,
    preloadLibraryMetadata,
    isLibraryTrackActive,
    isQueueTrackActive,
    stopProgress,
    syncPositionFromBackend,
    startProgress,
    resetVisualState,
    clearCurrentTrackState,
    setTrackState,
    loadTrack,
    playTrackFromLibrary,
    toggleLibraryTrackPlayback,
    playTrackFromQueue,
    filteredQueueWithIndex,
    addToQueue,
    addAllFilteredToQueue,
    removeFromQueue,
    clearQueue,
    togglePlay,
    seekTo,
    onSeekStart,
    onSeekInput,
    onSeekCommit,
    volumeIconMode,
    playPreviousTrack,
    playNextTrack,
    onVolumeChange,
    toggleMute,
    toggleLoop,
    toggleShuffle,
    buildSessionQueueTrack,
    buildAppSessionSnapshot,
    clearSessionPersistTimeout,
    persistAppSessionNow,
    schedulePersistAppSession,
    syncSessionProgressPersistence,
    restoreAppSession,
    onBeforeWindowUnload,
    onVisibilityChange,
    onGlobalWindowClick,
    albumScrollContainerRef,
    albumHeroRef,
    compactAlbumBarVisible,
    albumColor,
    darkenColor,
    compactAlbumBarStyle,
    getAverageColor,
    updateAlbumCompactBar,
    unlistenDeviceChanged,
  };
}
