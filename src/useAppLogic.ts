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
    spotify_id?: string | null; // <-- NUEVO
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
    spotify_id?: string | null; // <-- NUEVO
  };

  type PlaylistSummary = {
    id: number;
    name: string;
    trackCount: number;
    createdAt: number;
    updatedAt: number;
    trackPaths: string[];
    spotifyUrl?: string | null;
    spotifySyncedIds?: string | null;
    lastSnapshotId?: string | null;
    isSystem: number; // 1 para playlist protegida (ej: Tus Me Gusta)
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
    isSystem?: boolean; // <--- NUEVO
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
    assetStorageMode?: "unified" | "custom";
    customCanvasPath?: string | null;
    customLyricsPath?: string | null;
    customCoversPath?: string | null;
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

  type SpotiFlacAudioQuality = "Low" | "Lossless" | "HiRes";

  type SpotiFlacAppConfig = {
    output_dir: string;
    download_quality: SpotiFlacAudioQuality;
    filename_format: string;
    embed_metadata: boolean;
    embed_cover: boolean;
    embed_genre: boolean;
    use_single_genre: boolean;
    redownload_with_suffix: boolean;
    download_artist_images: boolean;
    embed_lyrics: boolean;
    save_lrc_file: boolean;
    downloader: string;
    auto_order: string[];
    allow_resolver_fallback: boolean;
    folder_structure: string;
    separator: string;
    use_first_artist_only: boolean;
    use_album_track_number: boolean;
    position_override: number | null;
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
    | "readAudioMetadata"
    | "getFileSizeMB"
    | "findDuplicateCandidates"
    | "downloadTrack"
    | "getStreamingURLs"
    | "checkTrackAvailability"
    | "searchSpotify"
    | "searchSpotifyByType"
    | "getSpotifyMetadata"
    | "getPreviewURL"
    | "syncDownloadedPlaylist";

  let detachSpotiFlacHost: (() => void) | null = null;
  let spotiFlacDownloadSequence = 0;
  let spotiFlacDownloadsInFlight = 0;
  let spotiFlacDownloadQueueTail: Promise<void> = Promise.resolve();
  let performanceObserver: PerformanceObserver | null = null;
  let performanceLagInterval: number | null = null;

  const summarizeSpotiFlacDownloadRequest = (
    payload: Record<string, unknown>,
  ) => {
    const request =
      payload && typeof payload.request === "object"
        ? (payload.request as Record<string, unknown>)
        : payload;

    return {
      service:
        typeof request.service === "string" ? request.service : "unknown",
      spotifyId:
        typeof request.spotify_id === "string"
          ? request.spotify_id
          : typeof request.spotifyId === "string"
            ? request.spotifyId
            : null,
      track:
        typeof request.track_name === "string"
          ? request.track_name
          : typeof request.trackName === "string"
            ? request.trackName
            : null,
      artist:
        typeof request.artist_name === "string"
          ? request.artist_name
          : typeof request.artistName === "string"
            ? request.artistName
            : null,
      outputDir:
        typeof request.output_dir === "string"
          ? request.output_dir
          : typeof request.outputDir === "string"
            ? request.outputDir
            : null,
      itemId:
        typeof request.item_id === "string"
          ? request.item_id
          : typeof request.itemId === "string"
            ? request.itemId
            : null,
    };
  };

  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const asString = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

  const asBoolean = (value: unknown): boolean | null =>
    typeof value === "boolean" ? value : null;

  const PLAYLIST_SPOTIFY_URL_MEMORY_KEY =
    "app-desk-musica-spotiflac-playlist-url-memory";

  type PlaylistSpotifyUrlMemory = Record<string, string>;

  const normalizePlaylistMemoryName = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['’`´]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .toLowerCase();

  let playlistSpotifyUrlMemoryCache: PlaylistSpotifyUrlMemory | null = null;

  const loadPlaylistSpotifyUrlMemory = (): PlaylistSpotifyUrlMemory => {
    if (playlistSpotifyUrlMemoryCache) {
      return playlistSpotifyUrlMemoryCache;
    }

    if (typeof window === "undefined") {
      playlistSpotifyUrlMemoryCache = {};
      return playlistSpotifyUrlMemoryCache;
    }

    try {
      const raw = window.localStorage.getItem(PLAYLIST_SPOTIFY_URL_MEMORY_KEY);
      if (!raw) {
        playlistSpotifyUrlMemoryCache = {};
        return playlistSpotifyUrlMemoryCache;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        playlistSpotifyUrlMemoryCache = {};
        return playlistSpotifyUrlMemoryCache;
      }

      const sanitizedEntries = Object.entries(parsed).reduce<
        Array<[string, string]>
      >((entries, [key, value]) => {
        if (
          typeof key === "string" &&
          key.trim().length > 0 &&
          typeof value === "string" &&
          value.trim().length > 0
        ) {
          entries.push([key, value]);
        }
        return entries;
      }, []);

      const sanitizedMemory = Object.fromEntries(
        sanitizedEntries,
      ) as PlaylistSpotifyUrlMemory;
      playlistSpotifyUrlMemoryCache = sanitizedMemory;
      return sanitizedMemory;
    } catch (error) {
      console.warn(
        "[PlaylistDebug][urlMemory] Could not load persisted playlist URLs",
        { error },
      );
      playlistSpotifyUrlMemoryCache = {};
      return playlistSpotifyUrlMemoryCache;
    }
  };

  const persistPlaylistSpotifyUrlMemory = (
    memory: PlaylistSpotifyUrlMemory,
  ) => {
    playlistSpotifyUrlMemoryCache = memory;

    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        PLAYLIST_SPOTIFY_URL_MEMORY_KEY,
        JSON.stringify(memory),
      );
    } catch (error) {
      console.warn(
        "[PlaylistDebug][urlMemory] Could not persist playlist URLs",
        { error, entryCount: Object.keys(memory).length },
      );
    }
  };

  const rememberPlaylistSpotifyUrl = (
    playlistName: string | null | undefined,
    spotifyUrl: string | null | undefined,
    source: string,
  ) => {
    const normalizedName = normalizePlaylistMemoryName(playlistName);
    const normalizedUrl = asString(spotifyUrl);

    if (!normalizedName || !normalizedUrl) {
      console.log("[PlaylistDebug][urlMemory] Skipped remember request", {
        playlistName,
        spotifyUrl,
        source,
      });
      return;
    }

    const currentMemory = { ...loadPlaylistSpotifyUrlMemory() };
    currentMemory[normalizedName] = normalizedUrl;
    persistPlaylistSpotifyUrlMemory(currentMemory);

    console.log("[PlaylistDebug][urlMemory] Remembered playlist URL", {
      playlistName,
      normalizedName,
      spotifyUrl: normalizedUrl,
      source,
    });
  };

  const findRememberedPlaylistSpotifyUrl = (
    playlistName: string | null | undefined,
  ) => {
    const normalizedName = normalizePlaylistMemoryName(playlistName);
    if (!normalizedName) return null;

    const spotifyUrl = loadPlaylistSpotifyUrlMemory()[normalizedName] ?? null;

    console.log("[PlaylistDebug][urlMemory] Lookup playlist URL", {
      playlistName,
      normalizedName,
      found: Boolean(spotifyUrl),
      spotifyUrl,
    });

    return spotifyUrl;
  };

  const asNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  const asStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];

  const sanitizePathSegment = (value: string) =>
    value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();

  const joinPathSegments = (...segments: Array<string | null | undefined>) =>
    segments
      .filter(
        (segment): segment is string => !!segment && segment.trim().length > 0,
      )
      .map((segment, index) =>
        index === 0
          ? segment.replace(/[\\/]+$/g, "")
          : segment.replace(/^[\\/]+|[\\/]+$/g, ""),
      )
      .join("\\");

  const buildSpotifyTrackUrl = (trackId: string) =>
    `https://open.spotify.com/track/${trackId}`;

  const resolveSpotifyTrackUrl = (payload: Record<string, unknown>) => {
    const directUrl = asString(payload.url);
    if (directUrl) return directUrl;

    const spotifyTrackId =
      asString(payload.spotifyTrackId) ??
      asString(payload.spotify_id) ??
      asString(payload.spotifyId);

    return spotifyTrackId ? buildSpotifyTrackUrl(spotifyTrackId) : null;
  };

  const normalizeDownloadQuality = (value: unknown): SpotiFlacAudioQuality => {
    const raw = asString(value)?.toLowerCase();
    if (raw === "hires" || raw === "hi_res" || raw === "hi-res") {
      return "HiRes";
    }
    if (raw === "low") {
      return "Low";
    }
    return "Lossless";
  };

  const buildAutoOrder = (
    preferredDownloader: string,
    rawSettings: Record<string, unknown>,
  ) => {
    const configured = asStringArray(rawSettings.auto_order);
    if (configured.length > 0) {
      return configured;
    }

    if (preferredDownloader && preferredDownloader !== "auto") {
      return [preferredDownloader];
    }

    return ["tidal", "qobuz", "amazon"];
  };

  const loadNativeSpotiFlacSettings = async () => {
    const [hostInfo, rawSettings] = await Promise.all([
      invoke<SpotiFlacHostInfo>("get_host_info"),
      invoke<unknown>("load_settings").catch(() => null),
    ]);

    // console.log("[DEBUG][Sync] loadNativeSpotiFlacSettings resolved", {
    //   hostInfo,
    //   rawSettings,
    // });

    return {
      hostInfo,
      rawSettings: asRecord(rawSettings),
    };
  };

  const buildNativeSpotiFlacConfig = async (
    payload: Record<string, unknown>,
  ): Promise<SpotiFlacAppConfig> => {
    const request =
      payload && typeof payload.request === "object"
        ? asRecord(payload.request)
        : payload;
    const { hostInfo, rawSettings } = await loadNativeSpotiFlacSettings();

    const baseOutputDir =
      asString(request.output_dir) ??
      asString(rawSettings.output_dir) ??
      asString(rawSettings.outputDir) ??
      hostInfo.defaultDownloadPath;

    const playlistFolder = asString(request.playlist_name);
    const outputDir = playlistFolder
      ? joinPathSegments(baseOutputDir, sanitizePathSegment(playlistFolder))
      : baseOutputDir;

    const preferredDownloader =
      asString(request.service) ?? asString(rawSettings.downloader) ?? "auto";
    const config = {
      output_dir: outputDir,
      download_quality: normalizeDownloadQuality(
        request.audio_format ??
          request.download_quality ??
          rawSettings.download_quality ??
          rawSettings.downloadQuality,
      ),
      filename_format:
        asString(rawSettings.filename_format) ??
        asString(rawSettings.filenameFormat) ??
        "{track} - {title}",
      embed_metadata:
        asBoolean(rawSettings.embed_metadata) ??
        asBoolean(rawSettings.embedMetadata) ??
        true,
      embed_cover:
        asBoolean(request.embed_max_quality_cover) ??
        asBoolean(rawSettings.embed_cover) ??
        asBoolean(rawSettings.embedCover) ??
        true,
      embed_genre:
        asBoolean(rawSettings.embed_genre) ??
        asBoolean(rawSettings.embedGenre) ??
        true,
      use_single_genre:
        asBoolean(rawSettings.use_single_genre) ??
        asBoolean(rawSettings.useSingleGenre) ??
        true,
      redownload_with_suffix:
        asBoolean(request.overwrite) === true
          ? false
          : (asBoolean(rawSettings.redownload_with_suffix) ??
            asBoolean(rawSettings.redownloadWithSuffix) ??
            false),
      download_artist_images:
        asBoolean(rawSettings.download_artist_images) ??
        asBoolean(rawSettings.downloadArtistImages) ??
        false,
      embed_lyrics:
        asBoolean(request.embed_lyrics) ??
        asBoolean(rawSettings.embed_lyrics) ??
        asBoolean(rawSettings.embedLyrics) ??
        true,
      save_lrc_file:
        asBoolean(rawSettings.save_lrc_file) ??
        asBoolean(rawSettings.saveLrcFile) ??
        false,
      downloader: preferredDownloader,
      auto_order: buildAutoOrder(preferredDownloader, rawSettings),
      allow_resolver_fallback:
        asBoolean(request.allow_fallback) ??
        asBoolean(rawSettings.allow_resolver_fallback) ??
        asBoolean(rawSettings.allowResolverFallback) ??
        true,
      folder_structure: "flat",
      separator: asString(rawSettings.separator) ?? ";",
      use_first_artist_only:
        asBoolean(rawSettings.use_first_artist_only) ??
        asBoolean(rawSettings.useFirstArtistOnly) ??
        false,
      use_album_track_number:
        asBoolean(request.use_album_track_number) ??
        asBoolean(rawSettings.use_album_track_number) ??
        asBoolean(rawSettings.useAlbumTrackNumber) ??
        true,
      position_override:
        asNumber(request.position_override) ??
        asNumber(request.position) ??
        asNumber(rawSettings.position_override) ??
        asNumber(rawSettings.positionOverride) ??
        null,
    };

    // console.log("[DEBUG][Sync] buildNativeSpotiFlacConfig resolved", {
    //   request,
    //   baseOutputDir,
    //   playlistFolder,
    //   preferredDownloader,
    //   config,
    // });

    return config;
  };

  const fetchSpotifyMetadataNative = async (url: string) => {
    // console.log(
    //   `[DEBUG][Sync] fetchSpotifyMetadataNative called with URL: "${url}"`,
    // );
    try {
      const result = await invoke<any>("get_spotify_metadata", { url });
      const rawTracks = result ? result.track_list || result.tracks : null;
      // console.log(
      //   `[DEBUG][Sync] fetchSpotifyMetadataNative SUCCESS for "${url}"`,
      //   result,
      // );
      // console.log("[DEBUG][Sync] fetchSpotifyMetadataNative summary", {
      //   url,
      //   hasTrackList: Array.isArray(result?.track_list),
      //   hasTracks: Array.isArray(result?.tracks),
      //   trackCount: Array.isArray(rawTracks) ? rawTracks.length : null,
      //   keys: result && typeof result === "object" ? Object.keys(result) : [],
      // });
      return result;
    } catch (err) {
      // console.error(
      //   `[DEBUG][Sync] fetchSpotifyMetadataNative ERROR for "${url}":`,
      //   err,
      // );
      throw err;
    }
  };

  const downloadTrackNative = async (payload: Record<string, unknown>) => {
    const request =
      payload && typeof payload.request === "object"
        ? asRecord(payload.request)
        : payload;
    const url =
      asString(request.url) ??
      (asString(request.spotify_id)
        ? buildSpotifyTrackUrl(asString(request.spotify_id)!)
        : null) ??
      asString(request.spotifyUrl);

    if (!url) {
      throw new Error("No se pudo construir la URL del track para descargar.");
    }

    const config = await buildNativeSpotiFlacConfig(request);
    // console.log("[DEBUG][Sync] downloadTrackNative prepared request", {
    //   request,
    //   resolvedUrl: url,
    //   config,
    //   tidalIdOverride:
    //     asString(request.tidal_id_override) ??
    //     asString(request.tidalIdOverride) ??
    //     null,
    // });
    const downloadedPath = await invoke<string>("download_track", {
      url,
      config,
      tidalIdOverride:
        asString(request.tidal_id_override) ??
        asString(request.tidalIdOverride) ??
        null,
    });

    return {
      file: downloadedPath,
      used_service:
        config.downloader === "auto"
          ? (config.auto_order[0] ?? "auto")
          : config.downloader,
    };
  };

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
    const bridgeMessageSource = "spotiflac-host-bridge";
    let lastSpotifyUrlAttempted: string | undefined = undefined; // Fallback legacy

    const handleBridgeInvoke = async (event: MessageEvent) => {
      const payload =
        event.data && typeof event.data === "object"
          ? (event.data as Record<string, unknown>)
          : null;

      if (!payload || payload.source !== bridgeMessageSource) {
        return;
      }

      if (payload.type !== "invoke" || typeof payload.id !== "string") {
        return;
      }

      // ✅ CORRECCIÓN AQUÍ: Primero declaramos 'method' extrayéndolo del payload
      const method =
        typeof payload.method === "string"
          ? (payload.method as SpotiFlacHostInvoke)
          : null;

      // ✅ AHORA SÍ lo podemos imprimir en la consola sin errores
      // console.log(`[Bridge][Invoke] Method: ${method}`, payload);

      const replyTarget = event.source;
      if (
        !replyTarget ||
        typeof (replyTarget as WindowProxy).postMessage !== "function"
      ) {
        return;
      }

      const requestPayload =
        payload.payload && typeof payload.payload === "object"
          ? (payload.payload as Record<string, unknown>)
          : {};

      const postResponse = (response: Record<string, unknown>) => {
        (replyTarget as WindowProxy).postMessage(
          {
            source: bridgeMessageSource,
            id: payload.id,
            ...response,
          },
          "*",
        );
      };

      if (!method) {
        postResponse({
          type: "result",
          ok: false,
          error: "Método de SpotiFLAC no válido",
        });
        return;
      }

      try {
        const result = await rootWindow.__spotiflacHost?.invoke(
          method,
          requestPayload,
        );
        postResponse({
          type: "result",
          ok: true,
          result: result ?? null,
        });
      } catch (error) {
        postResponse({
          type: "result",
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    rootWindow.__spotiflacHost = {
      invoke: async (
        method: SpotiFlacHostInvoke,
        payload: Record<string, unknown> = {},
      ) => {
        switch (method) {
          case "getHostInfo":
            return await invoke<SpotiFlacHostInfo>("get_host_info");
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
            await invoke("open_folder", { path });
            return null;
          }
          case "openConfigFolder": {
            const info = await invoke<SpotiFlacHostInfo>("get_host_info");
            await invoke("open_config_folder");
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
          case "readAudioMetadata":
            return await invoke("leer_metadata", {
              path: payload.path,
              customLyricsPath:
                typeof payload.customLyricsPath === "string"
                  ? payload.customLyricsPath
                  : null,
            });
          case "getFileSizeMB":
            return await invoke<number>("spotiflac_get_file_size_mb", {
              path: payload.path,
            });
          case "findDuplicateCandidates":
            return await invoke<string[]>(
              "spotiflac_find_duplicate_candidates",
              {
                directory: payload.directory,
                baseName: payload.baseName,
                extension: payload.extension,
              },
            );
          case "downloadTrack": {
            const request =
              payload && typeof payload.request === "object"
                ? payload.request
                : payload;
            const traceId = ++spotiFlacDownloadSequence;
            const startedAt = performance.now();
            const queueDepthBeforeStart = spotiFlacDownloadsInFlight;
            spotiFlacDownloadsInFlight += 1;
            // console.log("[SpotiFLAC][download:queued]", {
            //   traceId,
            //   pending: spotiFlacDownloadsInFlight,
            //   queueDepthBeforeStart,
            //   ...summarizeSpotiFlacDownloadRequest(payload),
            // });

            const previousQueueTail = spotiFlacDownloadQueueTail;
            let releaseQueue!: () => void;
            spotiFlacDownloadQueueTail = new Promise<void>((resolve) => {
              releaseQueue = resolve;
            });

            try {
              await previousQueueTail;
              // console.log("[SpotiFLAC][download:start]", {
              //   traceId,
              //   pending: spotiFlacDownloadsInFlight,
              //   ...summarizeSpotiFlacDownloadRequest(payload),
              // });
              const response = await downloadTrackNative(asRecord(request));
              // console.log("[SpotiFLAC][download:end]", {
              //   traceId,
              //   pending: spotiFlacDownloadsInFlight,
              //   durationMs: Math.round(performance.now() - startedAt),
              //   response,
              // });
              return response;
            } catch (error) {
              // console.error("[SpotiFLAC][download:error]", {
              //   traceId,
              //   pending: spotiFlacDownloadsInFlight,
              //   durationMs: Math.round(performance.now() - startedAt),
              //   error,
              // });
              throw error;
            } finally {
              releaseQueue();
              spotiFlacDownloadsInFlight = Math.max(
                0,
                spotiFlacDownloadsInFlight - 1,
              );
              // console.log("[SpotiFLAC][download:settled]", {
              //   traceId,
              //   pending: spotiFlacDownloadsInFlight,
              // });
            }
          }
          case "getStreamingURLs":
            return await invoke("get_streaming_urls", {
              url: resolveSpotifyTrackUrl(payload),
              region:
                typeof payload.region === "string" ? payload.region : undefined,
            });
          case "checkTrackAvailability":
            return await invoke("check_track_availability", {
              url: resolveSpotifyTrackUrl(payload),
            });
          case "searchSpotify":
            return await invoke("search_spotify", {
              query: payload.query,
              limit: typeof payload.limit === "number" ? payload.limit : 10,
            });
          case "searchSpotifyByType":
            return await invoke("search_spotify_by_type", {
              query: payload.query,
              searchType: payload.searchType,
              limit: typeof payload.limit === "number" ? payload.limit : 10,
              offset: typeof payload.offset === "number" ? payload.offset : 0,
            });
          case "getPreviewURL":
            return await invoke("get_preview_url", {
              trackId:
                asString(payload.trackId) ??
                asString(payload.trackID) ??
                asString(payload.spotifyTrackId),
            });
          case "getSpotifyMetadata": {
            const url =
              typeof payload.url === "string" ? payload.url : undefined;
            //  console.log(`[DEBUG][Host][getSpotifyMetadata] URL: "${url}"`, {
            //   batch: payload.batch,
            //   delay: payload.delay,
            //   timeout: payload.timeout,
            //   separator: payload.separator,
            // });
            if (!url) {
              // console.error(
              //   "[DEBUG][Host][getSpotifyMetadata] ERROR: No URL provided",
              // );
              throw new Error("URL de Spotify requerida.");
            }
            const result = await fetchSpotifyMetadataNative(url);
            if (url.includes("/playlist/")) {
              lastSpotifyUrlAttempted = url;
              const resultRecord = asRecord(result);
              const playlistInfo = asRecord(resultRecord.playlist_info);
              const resolvedPlaylistName =
                asString(playlistInfo.name) ??
                asString(resultRecord.name) ??
                asString(payload.name);

              rememberPlaylistSpotifyUrl(
                resolvedPlaylistName,
                url,
                "getSpotifyMetadata",
              );

              console.log(
                "[PlaylistDebug][getSpotifyMetadata] Playlist metadata loaded",
                {
                  requestedUrl: url,
                  resolvedPlaylistName,
                  hasPlaylistInfo:
                    Object.keys(playlistInfo).length > 0 ||
                    Boolean(resultRecord.playlist_info),
                },
              );
            }
            // console.log(
            //   `[DEBUG][Host][getSpotifyMetadata] SUCCESS for "${url}"`,
            // );
            return result;
          }
          case "syncDownloadedPlaylist": {
            const name =
              typeof payload.name === "string" ? payload.name.trim() : "";
            const trackPaths = Array.isArray(payload.trackPaths)
              ? payload.trackPaths.filter(
                  (trackPath): trackPath is string =>
                    typeof trackPath === "string",
                )
              : [];

            if (!name) {
              throw new Error("La playlist necesita un nombre.");
            }

            if (trackPaths.length === 0) {
              throw new Error(
                "No hay canciones descargadas para crear la playlist.",
              );
            }

            const payloadSpotifyUrl = asString(payload.spotifyUrl);
            const rememberedSpotifyUrl = findRememberedPlaylistSpotifyUrl(name);
            const resolvedSpotifyUrl =
              payloadSpotifyUrl ?? rememberedSpotifyUrl ?? lastSpotifyUrlAttempted;

            console.log(
              "[PlaylistDebug][syncDownloadedPlaylist] Resolved playlist URL",
              {
                name,
                payloadSpotifyUrl,
                rememberedSpotifyUrl,
                lastSpotifyUrlAttempted,
                resolvedSpotifyUrl,
                source: payloadSpotifyUrl
                  ? "payload"
                  : rememberedSpotifyUrl
                    ? "urlMemory"
                    : lastSpotifyUrlAttempted
                      ? "lastAttemptLegacy"
                      : "none",
              },
            );

            return await syncSpotiFlacCollectionToPlaylist(name, trackPaths, {
              openAfterSync: payload.openAfterSync === true,
              spotifyUrl: resolvedSpotifyUrl,
              position:
                typeof payload.position === "number"
                  ? payload.position
                  : undefined,
              positions: Array.isArray(payload.positions)
                ? payload.positions
                : undefined,
            });
          }
          default:
            throw new Error(`Metodo de SpotiFLAC no soportado: ${method}`);
        }
      },
    };

    window.addEventListener("message", handleBridgeInvoke);

    detachSpotiFlacHost = () => {
      window.removeEventListener("message", handleBridgeInvoke);
      if (previousHost) {
        rootWindow.__spotiflacHost = previousHost;
      } else {
        delete rootWindow.__spotiflacHost;
      }
    };
  };

  const installPerformanceDiagnostics = () => {
    if (typeof PerformanceObserver !== "undefined") {
      try {
        performanceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= 120) {
              // console.warn("[Perf][longtask]", {
              //   name: entry.name,
              //   startTime: Math.round(entry.startTime),
              //   durationMs: Math.round(entry.duration),
              // });
            }
          }
        });
        performanceObserver.observe({ entryTypes: ["longtask"] });
      } catch (error) {
        // console.warn("[Perf][longtask:unsupported]", error);
      }
    }

    let expectedAt = performance.now() + 500;
    performanceLagInterval = window.setInterval(() => {
      const now = performance.now();
      const lagMs = now - expectedAt;
      if (lagMs >= 180) {
        // console.warn("[Perf][event-loop-lag]", {
        //   lagMs: Math.round(lagMs),
        //   view: currentViewMode.value,
        //   pendingDownloads: spotiFlacDownloadsInFlight,
        //   libraryTracks: playlist.value.length,
        // });
      }
      expectedAt = now + 500;
    }, 500);
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
      // console.warn("No se pudo cargar el historial de búsqueda global:", error);
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
      window.localStorage.setItem(
        LEGACY_GLOBAL_SEARCH_RECENTS_MIGRATED_KEY,
        "1",
      );
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
      // console.warn(
      //   "No se pudo guardar el historial de busqueda global:",
      //   error,
      // );
      return false;
    }
  };

  const loadAppSession = async (): Promise<AppSessionSnapshot | null> => {
    try {
      return await invoke<AppSessionSnapshot | null>("get_app_session");
    } catch (error) {
      // warn("No se pudo cargar la sesion de la app:", error);
      return null;
    }
  };

  const persistAppSession = async (session: AppSessionSnapshot) => {
    try {
      await invoke("set_app_session", { session });
    } catch (error) {
      // console.warn("No se pudo guardar la sesion de la app:", error);
    }
  };

  // Función para preguntarle a Rust qué dispositivo se está usando
  const fetchOutputDeviceInfo = async () => {
    try {
      outputDeviceInfo.value = await invoke<OutputDeviceInfo>(
        "get_output_device_info",
      );
    } catch (error) {
      // console.error("No se pudo obtener info de salida del hardware:", error);
    }
  };

  const fetchComputerName = async () => {
    try {
      desktopDeviceName.value = await invoke<string>("get_computer_name");
    } catch (error) {
      // console.warn("No se pudo obtener el nombre de la PC:", error);
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
      // console.warn("No se pudo reproducir el canvas:", error);
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
  const deletePlaylistWithFiles = ref(false);

  const trackPendingDeletion = ref<{
    track: PlaylistTrack;
    playlistId: number;
    playlistName: string;
    isPhysical: boolean;
    count?: number;
    tracks?: PlaylistTrack[];
  } | null>(null);
  const deleteTrackWithFiles = ref(false);
  const deleteSyncTracksWithFiles = ref(false);

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
    deletePlaylistWithFiles.value = false;
  };

  const closeTrackDeleteModal = () => {
    trackPendingDeletion.value = null;
    deleteTrackWithFiles.value = false;
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
      playlists.value.find(
        (item) => item.id === contextMenu.value.playlistId,
      ) ?? null
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

  const multiSelectedLibraryTracks = ref<{ path: string; index: number }[]>([]);
  const lastSelectedTrackIndex = ref<number | null>(null);

  const clearMultiSelection = () => {
    multiSelectedLibraryTracks.value = [];
    lastSelectedTrackIndex.value = null;
  };

  const handleTrackPointerDown = (
    event: MouseEvent,
    track: PlaylistTrack,
    index: number,
  ) => {
    // 1. Lógica de Selección (Multi-select)
    if (event.button === 2) {
      if (multiSelectedLibraryTracks.value.some((t) => t.index === index)) {
        return;
      }
    }

    const isShift = event.shiftKey;
    const isCtrl = event.ctrlKey || event.metaKey;

    if (isShift && lastSelectedTrackIndex.value !== null) {
      const start = Math.min(lastSelectedTrackIndex.value, index);
      const end = Math.max(lastSelectedTrackIndex.value, index);

      const newSelection = [];
      for (let i = start; i <= end; i++) {
        const t = displayedTracks.value[i];
        if (t) {
          newSelection.push({ path: t.path, index: i });
        }
      }
      multiSelectedLibraryTracks.value = newSelection;
    } else if (isCtrl) {
      const existing = multiSelectedLibraryTracks.value.findIndex(
        (t) => t.index === index,
      );
      if (existing !== -1) {
        multiSelectedLibraryTracks.value.splice(existing, 1);
      } else {
        multiSelectedLibraryTracks.value.push({
          path: track.path,
          index: index,
        });
        lastSelectedTrackIndex.value = index;
      }
    } else {
      multiSelectedLibraryTracks.value = [{ path: track.path, index: index }];
      lastSelectedTrackIndex.value = index;
    }

    selectLibraryTrack(track, index);

    // 2. Lógica de Drag and Drop
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

    window.addEventListener("mousemove", handlePendingTrackPointerMove);
    window.addEventListener("mouseup", handlePendingTrackPointerUp);
  };

  const isLibraryTrackSelected = (track: PlaylistTrack, index?: number) => {
    if (typeof index === "number") {
      return multiSelectedLibraryTracks.value.some((t) => t.index === index);
    }
    return selectedLibraryTrack.value?.path === track.path;
  };

  const addSelectionToQueue = () => {
    if (multiSelectedLibraryTracks.value.length === 0) return;

    // Obtener los tracks reales de la selección
    const tracksToQueue = multiSelectedLibraryTracks.value
      .map((s) => displayedTracks.value[s.index])
      .filter((t) => !!t) as PlaylistTrack[];

    tracksToQueue.forEach((t) => addToQueue(t));
    closeTrackContextMenu();
    clearMultiSelection();
  };

  const addSelectionToPlaylist = async (targetPlaylistId: number) => {
    const paths = multiSelectedLibraryTracks.value.map((s) => s.path);
    if (paths.length === 0) return;

    try {
      for (const path of paths) {
        await invoke("add_track_to_playlist", {
          playlistId: targetPlaylistId,
          trackPath: path,
        });
      }
      await loadPlaylists();
      closeTrackContextMenu();
      clearMultiSelection();
    } catch (err) {
      // console.error("Error al añadir selección a playlist:", err);
    }
  };

  // const removeSelectionFromPlaylist = async (deleteFiles: boolean = false) => {
  //   if (contextMenu.value.playlistId == null) return;
  //   const playlistId = contextMenu.value.playlistId;
  //
  //   // Copia de la selección porque se va a limpiar
  //   const selection = [...multiSelectedLibraryTracks.value].sort(
  //     (a, b) => b.index - a.index,
  //   );
  //
  //   try {
  //     for (const item of selection) {
  //       await invoke("remove_track_from_playlist", {
  //         playlistId,
  //         trackPath: item.path,
  //         deleteFiles,
  //       });
  //     }
  //
  //     await loadPlaylists();
  //     closeTrackContextMenu();
  //     closeTrackDeleteModal();
  //     clearMultiSelection();
  //   } catch (err) {
  //     console.error("Error al eliminar selección de playlist:", err);
  //   }
  // };

  const openLibraryTrackContextMenu = (
    event: MouseEvent,
    track: PlaylistTrack,
    index?: number,
  ) => {
    // Si el track no está en la selección múltiple, lo seleccionamos solo a él
    if (
      typeof index === "number" &&
      !multiSelectedLibraryTracks.value.some((t) => t.index === index)
    ) {
      handleTrackPointerDown(event, track, index);
    }

    const isPlaylistTrack =
      currentViewMode.value === "playlist" && activePlaylist.value;

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
  const recommendationRefreshCounter = ref(0); // Nuevo para forzar re-calculo aleatorio

  const refreshPlaylistRecommendations = () => {
    recommendationRefreshCounter.value++;
  };

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
    const isInteractiveElement =
      Boolean(interactiveContainer) || isTypingElement;

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
        currentPlaybackContext.value.label ===
          committedGlobalSearch.value.trim()
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
    if (
      filePath.value !== track.path ||
      !doesPlaybackContextMatchCurrentView()
    ) {
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

  const shouldShowLibraryIndexNumber = (
    track: PlaylistTrack,
    index?: number,
  ) => {
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

  // === NUEVOS AJUSTES DE ACTIVOS ===
  const assetStorageMode = ref<"unified" | "custom">("unified");
  const customCanvasPath = ref<string | null>(null);
  const customLyricsPath = ref<string | null>(null);
  const customCoversPath = ref<string | null>(null);

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
  const spotiFlacUrl = import.meta.env.DEV
    ? "http://localhost:5175"
    : "/spotiflac/index.html";
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
      return createPlaybackContext(
        "search",
        committedGlobalSearch.value.trim(),
      );
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
    // console.log(
    //   `[SpotifySync][Flow] goToPlaylist called for ID: ${playlistId}`,
    // );
    const targetPlaylist = playlists.value.find(
      (item) => item.id === playlistId,
    );
    if (!targetPlaylist) {
      // console.warn(
      //   `[SpotifySync][Flow] Playlist with ID ${playlistId} not found in local state.`,
      // );
      return;
    }

    navigateToView({
      mode: "playlist",
      artist: null,
      album: null,
      albumArtist: null,
      playlistId,
      search: "",
      globalQuery: globalSearch.value.trim(),
    });

    // console.log(
    // `[DEBUG][Nav] Switched to Playlist ID: ${playlistId}. activePlaylistViewId is now: ${activePlaylistViewId.value}`,
    // );

    // ======== OPTIMIZACIÓN DE SINCRONIZACIÓN ========
    // 1. Cancelamos estados de carga y procesos en vuelo INMEDIATAMENTE
    // console.log(
    //   `[DEBUG][Sync] Navigation clean-up. Reseting manualSync and currentActiveSyncId.`,
    // );
    isManualSyncing.value = null;
    currentActiveSyncId = null;

    if (syncCheckTimeout) {
      // console.log(`[DEBUG][Sync] Clearing previous pending debounce timeout.`);
      clearTimeout(syncCheckTimeout);
    }

    syncCheckTimeout = setTimeout(() => {
      void checkSpecificSpotifyPlaylist(playlistId, true);
    }, 800);
  };

  const loadPlaylists = async () => {
    try {
      playlists.value = await invoke<PlaylistSummary[]>("get_playlists");
      console.log("[PlaylistDebug][loadPlaylists] Loaded playlists", {
        count: playlists.value.length,
        names: playlists.value.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          trackCount: playlist.trackCount,
          trackPaths: playlist.trackPaths,
          spotifyUrl: playlist.spotifyUrl ?? null,
          hasSpotifyUrl: Boolean(playlist.spotifyUrl),
          spotifySyncedIds: playlist.spotifySyncedIds ?? null,
          hasSpotifySyncedIds: Boolean(playlist.spotifySyncedIds),
          syncedIdsCount: (() => {
            if (!playlist.spotifySyncedIds) return 0;
            try {
              const parsed = JSON.parse(playlist.spotifySyncedIds);
              return Array.isArray(parsed) ? parsed.length : 0;
            } catch {
              return -1;
            }
          })(),
        })),
      });
    } catch (error) {
      console.error("[PlaylistDebug][loadPlaylists] Failed to load playlists", {
        error,
      });
    }
  };

  const normalizeComparablePath = (value: string) =>
    value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

  const getCommonDirectoryFromPaths = (paths: string[]) => {
    if (!paths.length) return null;

    const splitPaths = paths.map((value) =>
      value.replace(/\\/g, "/").split("/").filter(Boolean),
    );

    const commonSegments: string[] = [];
    const shortestLength = Math.min(...splitPaths.map((parts) => parts.length));

    for (let index = 0; index < shortestLength - 1; index += 1) {
      const baseSegment = splitPaths[0][index];
      const allMatch = splitPaths.every(
        (parts) => parts[index]?.toLowerCase() === baseSegment?.toLowerCase(),
      );

      if (!allMatch) {
        break;
      }

      commonSegments.push(baseSegment);
    }

    if (!commonSegments.length) {
      return null;
    }

    return commonSegments.join("\\");
  };

  const syncSpotiFlacCollectionToPlaylist = async (
    name: string,
    trackPaths: string[],
    options: {
      openAfterSync?: boolean;
      spotifyUrl?: string; // <-- NUEVO
      position?: number;
      positions?: number[];
    } = {},
  ) => {
    const trimmedName = name.trim();
    const normalizedTrackPaths = Array.from(
      new Set(
        trackPaths
          .map((trackPath) => trackPath.trim())
          .filter((trackPath) => trackPath.length > 0),
      ),
    );

    if (!trimmedName || normalizedTrackPaths.length === 0) {
      console.warn("[PlaylistDebug][syncCollection] Ignored empty sync request", {
        name,
        trackPaths,
        options,
      });
      return null;
    }

    console.log("[PlaylistDebug][syncCollection] Starting sync", {
      name: trimmedName,
      trackCount: normalizedTrackPaths.length,
      trackPaths: normalizedTrackPaths,
      options,
    });

    await loadPlaylists();

    const normalizedName = normalizeSearchValue(trimmedName);
    const existingPlaylist =
      playlists.value.find(
        (item) => normalizeSearchValue(item.name) === normalizedName,
      ) ?? null;

    let targetPlaylistId = existingPlaylist?.id ?? null;

    console.log("[PlaylistDebug][syncCollection] Playlist lookup result", {
      requestedName: trimmedName,
      existingPlaylist,
      currentPlaylists: playlists.value.map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        trackCount: playlist.trackCount,
      })),
    });

    if (!targetPlaylistId) {
      const createdPlaylist = await invoke<PlaylistSummary>("create_playlist", {
        name: trimmedName,
      });
      targetPlaylistId = createdPlaylist.id;
      console.log("[PlaylistDebug][syncCollection] Created playlist", {
        createdPlaylist,
      });
    }

    const playlistId = targetPlaylistId;

    console.log("[PlaylistDebug][syncCollection] Spotify linkage input", {
      playlistId,
      playlistName: trimmedName,
      spotifyUrl: options.spotifyUrl ?? null,
      hasSpotifyUrl: Boolean(options.spotifyUrl),
    });

    // NUEVO: Vincular con Spotify si hay URL
    if (options.spotifyUrl) {
      rememberPlaylistSpotifyUrl(
        trimmedName,
        options.spotifyUrl,
        "syncSpotiFlacCollectionToPlaylist",
      );
      // console.log(
      //   `[SpotifySync][Link] Linking playlist ${playlistId} with URL: ${options.spotifyUrl}`,
      // );
      try {
        await invoke("set_playlist_spotify_url", {
          playlistId,
          spotifyUrl: options.spotifyUrl,
        });
        console.log("[PlaylistDebug][syncCollection] Saved spotifyUrl in DB", {
          playlistId,
          playlistName: trimmedName,
          spotifyUrl: options.spotifyUrl,
        });
        // console.log(`[SpotifySync][Link] URL saved successfully.`);

        // También obtenemos los IDs actuales para que no los marque como "nuevos" justo después de descargar
        // console.log(
        //   `[SpotifySync][Link] Fetching current Spotify IDs to initialize sync state...`,
        // );
        const remoteData = await fetchSpotifyMetadataNative(options.spotifyUrl);

        // Soporta tanto 'tracks' como 'track_list' (el formato de SpotiFLAC)
        const rawTracks = remoteData
          ? remoteData.track_list || remoteData.tracks
          : null;

        if (remoteData && Array.isArray(rawTracks)) {
          // Intentamos varios nombres de ID por si acaso
          const remoteIds = rawTracks
            .map((t: any) => t.id || t.spotify_id || t.track_id)
            .filter((id) => !!id);
          console.log(
            "[PlaylistDebug][syncCollection] Spotify metadata IDs extracted",
            {
              playlistId,
              playlistName: trimmedName,
              rawTrackCount: rawTracks.length,
              remoteIdsCount: remoteIds.length,
              sampleRemoteIds: remoteIds.slice(0, 10),
            },
          );
          // console.log(
          //   `[SpotifySync][Link] Obtained ${remoteIds.length} IDs from Spotify. Saving to DB...`,
          // );

          if (remoteIds.length === 0 && rawTracks.length > 0) {
            //  console.warn(
            //   `[SpotifySync][Link] Tracks found but NO IDs detected. First track keys:`,
            //   Object.keys(rawTracks[0]),
            // );
          }

          await invoke("set_playlist_synced_ids", {
            playlistId,
            syncedIdsJson: JSON.stringify(remoteIds),
          });
          console.log("[PlaylistDebug][syncCollection] Saved spotifySyncedIds in DB", {
            playlistId,
            playlistName: trimmedName,
            remoteIdsCount: remoteIds.length,
          });
          // console.log(
          //   `[SpotifySync][Link] Synced IDs saved successfully in DB.`,
          // );
        } else {
          console.warn(
            "[PlaylistDebug][syncCollection] Could not extract Spotify metadata IDs",
            {
              playlistId,
              playlistName: trimmedName,
              hasRemoteData: Boolean(remoteData),
              rawTracksType: Array.isArray(rawTracks)
                ? "array"
                : rawTracks === null
                  ? "null"
                  : typeof rawTracks,
              remoteDataKeys:
                remoteData && typeof remoteData === "object"
                  ? Object.keys(remoteData as Record<string, unknown>)
                  : [],
            },
          );
          // console.warn(
          //   `[SpotifySync][Link] Raw metadata structure:`,
          //   remoteData,
          // );
          // console.warn(
          //   `[SpotifySync][Link] Could not get track IDs from Spotify metadata.`,
          // );
        }
      } catch (e) {
        console.error("[PlaylistDebug][syncCollection] Spotify linkage failed", {
          playlistId,
          playlistName: trimmedName,
          spotifyUrl: options.spotifyUrl,
          error: e,
        });
        // console.error(
        //   `[SpotifySync][Link] Error during Spotify linking/sync:`,
        //   e,
        // );
      }
    } else {
      console.warn("[PlaylistDebug][syncCollection] Playlist created without spotifyUrl", {
        playlistId,
        playlistName: trimmedName,
        trackCount: normalizedTrackPaths.length,
      });
    }

    for (let i = 0; i < normalizedTrackPaths.length; i++) {
      const trackPath = normalizedTrackPaths[i];
      const targetPos = options.positions
        ? options.positions[i]
        : normalizedTrackPaths.length === 1
          ? options.position
          : undefined;

      await invoke("add_track_to_playlist", {
        playlistId,
        trackPath,
        position: targetPos !== undefined ? targetPos : null,
      });
      console.log("[PlaylistDebug][syncCollection] Added track to playlist", {
        playlistId,
        playlistName: trimmedName,
        trackPath,
        position: targetPos !== undefined ? targetPos : null,
      });
    }

    const commonDirectory = getCommonDirectoryFromPaths(normalizedTrackPaths);
    console.log("[PlaylistDebug][syncCollection] Common directory resolved", {
      playlistName: trimmedName,
      commonDirectory,
      musicDirectories: musicDirectories.value,
    });

    if (commonDirectory) {
      const normalizedCommonDirectory =
        normalizeComparablePath(commonDirectory);
      const isAlreadyTracked = musicDirectories.value.some((directory) => {
        const normalizedDirectory = normalizeComparablePath(directory);
        return (
          normalizedCommonDirectory === normalizedDirectory ||
          normalizedCommonDirectory.startsWith(`${normalizedDirectory}/`)
        );
      });

      if (!isAlreadyTracked) {
        musicDirectories.value = [...musicDirectories.value, commonDirectory];
        await persistMusicDirectories();
        await invoke("watch_directories", {
          directories: musicDirectories.value,
        });
        console.log("[PlaylistDebug][syncCollection] Added common directory to library roots", {
          playlistName: trimmedName,
          commonDirectory,
          musicDirectories: musicDirectories.value,
        });
      } else {
        console.log("[PlaylistDebug][syncCollection] Common directory already tracked", {
          playlistName: trimmedName,
          commonDirectory,
          musicDirectories: musicDirectories.value,
        });
      }
    }

    await invoke("invalidate_library_cache", {
      paths: normalizedTrackPaths,
    });

    const nextMap = { ...libraryMetadataMap.value };
    for (const trackPath of normalizedTrackPaths) {
      delete nextMap[trackPath];
    }
    libraryMetadataMap.value = nextMap;

    await syncLibrary();
    console.log("[PlaylistDebug][syncCollection] Library sync finished", {
      playlistName: trimmedName,
      libraryTrackCount: playlist.value.length,
    });

    await loadPlaylists();
    console.log("[PlaylistDebug][syncCollection] Reloaded playlists after sync", {
      playlistId,
      playlistName: trimmedName,
      playlists: playlists.value.map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        trackCount: playlist.trackCount,
        spotifyUrl: playlist.spotifyUrl ?? null,
        hasSpotifyUrl: Boolean(playlist.spotifyUrl),
        hasSpotifySyncedIds: Boolean(playlist.spotifySyncedIds),
      })),
    });

    if (options.openAfterSync) {
      goToPlaylist(playlistId);
    }

    return playlists.value.find((p) => p.id === playlistId) || null;
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
      //console.error("No se pudo crear la playlist:", error);
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

      // console.log("[playlist-dnd] addTrackToPlaylist:start", {
      //   playlistId,
      //   playlistName: targetPlaylist?.name ?? null,
      //   trackPath: track.path,
      //   trackTitle: getTrackDisplayTitle(track),
      //   alreadyIncluded,
      //   allowDuplicate: options?.allowDuplicate ?? false,
      // });

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

      // console.log("[playlist-dnd] addTrackToPlaylist:after-load", {
      //   playlistId,
      //   playlistName: updatedPlaylist?.name ?? targetPlaylist?.name ?? null,
      //   trackPath: track.path,
      //   nowIncluded,
      //   trackCount: updatedPlaylist?.trackPaths.length ?? null,
      // });

      if (targetPlaylist) {
        showPlaylistAddToast(playlistId, targetPlaylist.name, track);
      }
    } catch (error) {
      //console.error("No se pudo agregar la canción a la playlist:", error);
    }
  };

  const addContextMenuTrackToPlaylist = async (playlistId: number) => {
    const tracksToAdd =
      multiSelectedLibraryTracks.value.length > 1
        ? (multiSelectedLibraryTracks.value
            .map((s) => displayedTracks.value[s.index])
            .filter((t) => !!t) as PlaylistTrack[])
        : contextMenu.value.track
          ? [contextMenu.value.track]
          : [];

    if (tracksToAdd.length === 0) return;

    for (const track of tracksToAdd) {
      await addTrackToPlaylist(playlistId, track);
    }

    await loadPlaylists();
    closeTrackContextMenu();
    clearMultiSelection();
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
    playlist_id_param: number,
    track: PlaylistTrack,
    deleteFiles: boolean = false,
  ) => {
    try {
      await invoke("remove_track_from_playlist", {
        playlistId: playlist_id_param,
        trackPath: track.path,
        deleteFiles,
      });
      await loadPlaylists();

      if (
        currentViewMode.value === "playlist" &&
        activePlaylistViewId.value === playlist_id_param
      ) {
        selectedLibraryTrack.value = null;
      }
    } catch (error) {
      // console.error("No se pudo quitar la canción de la playlist:", error);
    }
  };

  const removeContextMenuTrackFromPlaylist = async () => {
    if (contextMenu.value.playlistId == null) return;

    const playlistId = contextMenu.value.playlistId;
    const targetPlaylist = playlists.value.find((p) => p.id === playlistId);
    const playlistName = targetPlaylist?.name || "";

    const selection =
      multiSelectedLibraryTracks.value.length > 1
        ? (multiSelectedLibraryTracks.value
            .map((s) => displayedTracks.value[s.index])
            .filter((t) => !!t) as PlaylistTrack[])
        : contextMenu.value.track
          ? [contextMenu.value.track]
          : [];

    if (selection.length === 0) return;

    let anyPhysical = false;
    const processedTracks: PlaylistTrack[] = [];

    for (let track of selection) {
      try {
        const reconciledPath = await invoke<string | null>(
          "try_reconcile_physical_path",
          {
            playlistId,
            currentPath: track.path,
          },
        );
        if (reconciledPath) {
          track = { ...track, path: reconciledPath };
        }
      } catch (e) {
        // console.warn("Error reconciliando track:", track.path);
      }

      const normalizedPath = track.path.replace(/\\/g, "/");
      const parts = normalizedPath.split("/");
      if (parts.length >= 2) {
        const parentFolder = parts[parts.length - 2].trim().toLowerCase();
        const targetName = playlistName.trim().toLowerCase();
        if (parentFolder === targetName) {
          anyPhysical = true;
        }
      }
      processedTracks.push(track);
    }

    trackPendingDeletion.value = {
      track: processedTracks[0],
      playlistId,
      playlistName: playlistName || "esta playlist",
      isPhysical: anyPhysical,
      count: processedTracks.length,
      tracks: processedTracks,
    };
    closeTrackContextMenu();
  };

  const confirmDeleteTrack = async () => {
    if (!trackPendingDeletion.value) return;

    const { playlistId, track, tracks, playlistName } =
      trackPendingDeletion.value;
    const globalDeleteRequest = deleteTrackWithFiles.value;

    const computeIsPhysical = (t: PlaylistTrack) => {
      const normalizedPath = t.path.replace(/\\/g, "/");
      const parts = normalizedPath.split("/");
      if (parts.length >= 2) {
        const parentFolder = parts[parts.length - 2].trim().toLowerCase();
        const targetName = playlistName.trim().toLowerCase();
        return parentFolder === targetName;
      }
      return false;
    };

    if (tracks && tracks.length > 0) {
      for (const t of tracks) {
        if (isLibraryTrackCurrent(t) && isPlaying.value) {
          await playNextTrack();
        }
        const actuallyPhysical = computeIsPhysical(t);
        const shouldDeleteFiles = globalDeleteRequest && actuallyPhysical;
        await removeTrackFromPlaylist(playlistId, t, shouldDeleteFiles);
      }
    } else {
      if (isLibraryTrackCurrent(track) && isPlaying.value) {
        await playNextTrack();
      }
      const actuallyPhysical = computeIsPhysical(track);
      const shouldDeleteFiles = globalDeleteRequest && actuallyPhysical;
      await removeTrackFromPlaylist(playlistId, track, shouldDeleteFiles);
    }

    await syncLibrary();
    await loadPlaylists();
    closeTrackDeleteModal();
    clearMultiSelection();
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

  const updateSidebarDropTargetFromPoint = (
    clientX: number,
    clientY: number,
  ) => {
    const target = getSidebarPlaylistDropTargetFromElement(
      document.elementFromPoint(clientX, clientY),
    );

    if (target !== sidebarDropTargetPlaylistId.value) {
      // console.log("[playlist-dnd] pointer-hover-playlist", {
      // x: clientX,
      // y: clientY,
      // hoveredPlaylistId: target,
      // draggedTrackPath: draggedTrack.value?.path ?? null,
      // });
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
      // console.warn("[playlist-dnd] resolveDraggedTrack:no-track-path", {
      // hasDraggedTrack: draggedTrack.value != null,
      // types: event?.dataTransfer ? Array.from(event.dataTransfer.types) : [],
      // });
      return null;
    }

    const resolved =
      playlist.value.find((track) => track.path === trackPath) ?? null;
    // console.log("[playlist-dnd] resolveDraggedTrack", {
    // trackPath,
    // resolved: resolved != null,
    // title: resolved ? getTrackDisplayTitle(resolved) : null,
    // });
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

  const getSidebarPlaylistDropTargetFromElement = (
    candidate: Element | null,
  ) => {
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

      // console.log("[playlist-dnd] custom-drag-start", {
      // trackPath: pendingTrackPointerDrag.track.path,
      // title: getTrackDisplayTitle(pendingTrackPointerDrag.track),
      // artist: getLibraryTrackArtist(pendingTrackPointerDrag.track),
      // x: event.clientX,
      // y: event.clientY,
      // });
    }

    const positionKey = `${event.clientX}:${event.clientY}`;
    if (positionKey !== lastLoggedDragPosition) {
      // console.log("[playlist-dnd] custom-drag-move", {
      // x: event.clientX,
      // y: event.clientY,
      // });
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

    // console.log("[playlist-dnd] custom-drag-end", {
    // x: event.clientX,
    // y: event.clientY,
    // targetPlaylistId,
    // trackPath: draggedTrack.value.path,
    // });

    shouldSuppressNextWindowClick = true;
    window.setTimeout(() => {
      shouldSuppressNextWindowClick = false;
    }, 0);

    try {
      if (targetPlaylistId == null) {
        // console.warn("[playlist-dnd] custom-drop:no-target", {
        // x: event.clientX,
        // y: event.clientY,
        // trackPath: draggedTrack.value.path,
        // });
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
    // console.log("[playlist-dnd] sidebar-item-dragenter", {
    // playlistId: item.playlistId,
    // playlistTitle: item.title,
    // x: event.clientX,
    // y: event.clientY,
    // });
    event.preventDefault();
    sidebarDropTargetPlaylistId.value = item.playlistId;
  };

  const handleSidebarItemDragOver = (
    event: DragEvent,
    item: SidebarLibraryItem,
  ) => {
    if (!isSidebarItemDropEnabled(item) || item.playlistId == null) return;
    // console.log("[playlist-dnd] sidebar-item-dragover", {
    // playlistId: item.playlistId,
    // playlistTitle: item.title,
    // x: event.clientX,
    // y: event.clientY,
    // });
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
      // console.warn("[playlist-dnd] sidebar-list-drop:no-track", {
      // x: event.clientX,
      // y: event.clientY,
      // hoveredPlaylistId: sidebarDropTargetPlaylistId.value,
      // types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
      // });
      return;
    }

    const targetPlaylistId =
      getSidebarPlaylistDropTargetFromElement(
        document.elementFromPoint(event.clientX, event.clientY),
      ) ?? sidebarDropTargetPlaylistId.value;

    // console.log("[playlist-dnd] sidebar-list-drop", {
    // x: event.clientX,
    // y: event.clientY,
    // targetPlaylistId,
    // hoveredPlaylistId: sidebarDropTargetPlaylistId.value,
    // trackPath: track.path,
    // types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
    // });

    if (targetPlaylistId == null) {
      // console.warn("[playlist-dnd] sidebar-list-drop:no-target", {
      // x: event.clientX,
      // y: event.clientY,
      // trackPath: track.path,
      // });
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

    if (
      currentTarget &&
      relatedTarget &&
      currentTarget.contains(relatedTarget)
    ) {
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

    if (
      currentTarget &&
      relatedTarget &&
      currentTarget.contains(relatedTarget)
    ) {
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
      // console.warn("[playlist-dnd] sidebar-item-drop:blocked", {
      // hasTrack: track != null,
      // playlistId: item.playlistId,
      // kind: item.kind,
      // x: event.clientX,
      // y: event.clientY,
      // types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
      // });
      return;
    }

    // console.log("[playlist-dnd] sidebar-item-drop", {
    // playlistId: item.playlistId,
    // playlistTitle: item.title,
    // trackPath: track.path,
    // x: event.clientX,
    // y: event.clientY,
    // });
    event.preventDefault();
    sidebarDropTargetPlaylistId.value = item.playlistId;

    try {
      await addTrackToPlaylist(item.playlistId, track);
    } finally {
      cleanupTrackDragState();
    }
  };

  const openRenamePlaylistModal = (playlistId: number) => {
    const targetPlaylist = playlists.value.find(
      (item) => item.id === playlistId,
    );
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
      // console.error("No se pudo renombrar la playlist:", error);
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
      await invoke("delete_playlist", {
        playlistId,
        deleteFiles: deletePlaylistWithFiles.value,
      });
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
      // console.error("No se pudo eliminar la playlist:", error);
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
        isSystem: 0,
      }
    );
  });

  const likedSongsPlaylist = computed(() => {
    return playlists.value.find((p) => p.isSystem === 1);
  });

  const isLiked = (trackPath: string) => {
    return likedSongsPlaylist.value?.trackPaths.includes(trackPath) ?? false;
  };

  const toggleTrackLike = async (track: PlaylistTrack) => {
    const p = likedSongsPlaylist.value;
    if (!p) return;

    if (isLiked(track.path)) {
      await removeTrackFromPlaylist(p.id, track, false);
    } else {
      await addTrackToPlaylist(p.id, track);
    }
  };

  // CACHÉ DE ALTO RENDIMIENTO: Mapa indexado de toda la biblioteca por ruta
  // Esto hace que las búsquedas pasen de O(N) a O(1), eliminando el lag en listas grandes.
  const libraryTrackMap = computed(() => {
    const map = new Map<string, PlaylistTrack>();
    for (const t of playlist.value) {
      map.set(t.path, t);
    }
    return map;
  });

  const activePlaylistTracks = computed(() => {
    const targetPlaylist = activePlaylist.value;
    if (!targetPlaylist) return [];

    const map = libraryTrackMap.value;
    return targetPlaylist.trackPaths
      .map((trackPath) => map.get(trackPath) ?? null)
      .filter((track): track is PlaylistTrack => track !== null);
  });

  const getPlaylistCoverTiles = (item: PlaylistSummary) => {
    const trackMap = new Map(
      playlist.value.map((track) => [track.path, track]),
    );
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
    if (!activePlaylist.value || !filePath.value || !isPlaying.value) {
      return false;
    }

    return (
      activePlaylistTracks.value.some(
        (track) => track.path === filePath.value,
      ) &&
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
      isSystem: item.isSystem === 1,
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
      normalizeSearchValue(`${item.title} ${item.subtitle}`).includes(
        normalized,
      ),
    );
  });

  const activeAlbumTracks = computed(() => {
    if (!activeAlbumView.value) return [];

    const albumArtist =
      activeAlbumArtistView.value?.trim().toLowerCase() ?? null;

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
    const activeP = activePlaylist.value;
    if (!activeP) return [];

    // Accedemos al contador para que sea reactivo al botón "Refrescar"
    void recommendationRefreshCounter.value;

    // 1. Excluir tracks que ya están en la playlist activa
    const currentPaths = new Set(activeP.trackPaths);
    const availableTracks = playlist.value.filter(
      (t) => !currentPaths.has(t.path),
    );

    const query = emptyPlaylistSearch.value.trim();
    if (query) {
      // Si hay búsqueda, devolvemos resultados de búsqueda filtrando los ya presentes
      return getTracksForSearchQuery(query)
        .filter((t) => !currentPaths.has(t.path))
        .slice(0, 10);
    }

    // 2. Recomendaciones Inteligentes (si no hay búsqueda)
    let recommendations: PlaylistTrack[] = [];

    // A. Basado en Artistas ya presentes en la playlist
    if (activeP.trackPaths.length > 0) {
      const pTracks = activePlaylistTracks.value;
      const playlistArtists = new Set(
        pTracks.map((t) => getLibraryTrackArtist(t).toLowerCase()),
      );

      recommendations = availableTracks.filter((t) =>
        playlistArtists.has(getLibraryTrackArtist(t).toLowerCase()),
      );
    }

    // B. Aleatorización para que no siempre salgan los mismos (Fallback)
    // Usamos una semilla simple basada en el tiempo o solo shuffle
    const shuffled = [...availableTracks].sort(() => Math.random() - 0.5);

    // Combinamos: primero artistas relacionados, luego aleatorios para rellenar
    const finalResults = [...new Set([...recommendations, ...shuffled])];

    return finalResults.slice(0, 10);
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
    const targetPlaylist = playlists.value.find(
      (item) => item.id === playlistId,
    );
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
    const targetPlaylist = playlists.value.find(
      (item) => item.id === playlistId,
    );
    if (!targetPlaylist) return;

    const playbackContext = createPlaybackContext(
      "playlist",
      String(playlistId),
    );
    const trackMap = new Map(
      playlist.value.map((track) => [track.path, track]),
    );

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
    else if (currentViewMode.value === "album")
      tracks = activeAlbumTracks.value;
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
      .filter((artist) =>
        normalizeSearchValue(artist.name).includes(normalized),
      )
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
      subtitle: `Canción • ${getLibraryTrackArtist(track)}`,
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
        if (album.name.trim().toLowerCase() !== normalizedAlbumName)
          return false;
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
        subtitle: `Canción • ${getLibraryTrackArtist(track)}`,
        cover: getLibraryTrackCover(track),
        kind: "song",
        entityKey: `song:${track.path.toLowerCase()}`,
      };
    }

    return {
      query,
      title: query,
      subtitle: "Búsqueda reciente",
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

  const hydrateRecentSearchItem = (
    item: RecentSearchItem,
  ): RecentSearchItem => {
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
        const nextScrollTop =
          targetTop - containerHeight / 2 + targetHeight / 2;

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
    return (
      splitArtists(getLibraryTrackArtist(track))[0] ?? "Artista desconocido"
    );
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

  let librarySyncInFlight = false;
  let librarySyncQueued = false;
  let librarySyncTimer: ReturnType<typeof window.setTimeout> | null = null;
  let libraryMetadataInFlight = false;
  const pendingLibraryMetadataPaths = new Set<string>();

  const createLibraryMetadataFromRow = (
    row: LibraryTrackMetadataLiteRow,
  ): LibraryTrackMetadata => {
    let coverUrl = null;
    if (row.cover_path) {
      coverUrl = convertFileSrc(row.cover_path);
    }

    return {
      title: row.title || "Sin título",
      artist: row.artist || "Artista desconocido",
      album: row.album || "—",
      album_artist: row.album_artist || row.artist || "Artista desconocido",
      year: row.year || null,
      duration_seconds: Number(row.duration_seconds || 0),
      duration_formatted:
        row.duration_formatted || formatTime(Number(row.duration_seconds || 0)),
      cover_art: coverUrl ? { data_url: coverUrl } : null,
      track_number: row.track_number ?? null,
    };
  };

  const createFallbackLibraryMetadata = (
    track: PlaylistTrack,
  ): LibraryTrackMetadata => ({
    title: track.fileName || "Sin título",
    artist: "Artista desconocido",
    album: "—",
    duration_seconds: 0,
    duration_formatted: "—",
    cover_art: null,
  });

  void createLibraryMetadataFromRow;
  void createFallbackLibraryMetadata;

  const runLibrarySync = async () => {
    const syncStartedAt = performance.now();
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
      console.log("[LibraryDebug][sync:start]", {
        directories: musicDirectories.value,
        currentPlaylistSize: playlist.value.length,
      });
      const tracks: PlaylistTrack[] = await invoke("scan_directories", {
        directories: musicDirectories.value,
      });

      playlist.value = tracks;
      console.log("[LibraryDebug][sync:tracks]", {
        count: tracks.length,
        sample: tracks.slice(0, 10).map((track) => track.path),
      });

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

      await preloadLibraryMetadata(tracks);

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
        isAppBooting.value &&
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
      console.log("[LibraryDebug][sync:end]", {
        tracks: tracks.length,
        durationMs: Math.round(performance.now() - syncStartedAt),
      });
    } catch (error) {
      console.error("[LibraryDebug][sync:error]", {
        durationMs: Math.round(performance.now() - syncStartedAt),
        error,
        directories: musicDirectories.value,
      });
    }
  };

  const syncLibrary = async () => {
    if (librarySyncInFlight) {
      librarySyncQueued = true;
      return;
    }

    librarySyncInFlight = true;

    try {
      do {
        librarySyncQueued = false;
        await runLibrarySync();
      } while (librarySyncQueued);

      await loadPlaylists();
    } finally {
      librarySyncInFlight = false;
    }
  };

  const scheduleLibrarySync = (delay = 2500) => {
    if (librarySyncTimer != null) {
      window.clearTimeout(librarySyncTimer);
      // console.log("[Library][sync:coalesce]", {
      // delay,
      // });
    }

    librarySyncTimer = window.setTimeout(() => {
      librarySyncTimer = null;
      // console.log("[Library][sync:scheduled]", {
      // delay,
      // });
      void syncLibrary();
    }, delay);
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
      await invoke("watch_directories", {
        directories: musicDirectories.value,
      });
    } catch (error) {
      // console.error("Error al seleccionar carpeta:", error);
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
      await invoke("watch_directories", {
        directories: musicDirectories.value,
      });
    } catch (error) {
      // console.error("Error al quitar carpeta:", error);
    }
  };

  const selectCustomCanvasPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Seleccionar Carpeta para Canvas",
    });
    if (selected) {
      customCanvasPath.value = selected as string;
    }
  };

  const selectCustomLyricsPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Seleccionar Carpeta para Letras (.lrc)",
    });
    if (selected) {
      customLyricsPath.value = selected as string;
    }
  };

  const selectCustomCoversPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Seleccionar Carpeta para Carátulas",
    });
    if (selected) {
      customCoversPath.value = selected as string;
    }
  };

  const clearMusicDirectories = async () => {
    musicDirectories.value = [];

    try {
      await persistMusicDirectories();
      await syncLibrary();
      await invoke("watch_directories", {
        directories: musicDirectories.value,
      });
    } catch (error) {
      // console.error("Error al limpiar carpetas:", error);
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
    const fallbackRawFileName = rawFileName.value
      ? stripInternalSpotiFlacDuplicateSuffix(
          rawFileName.value.replace(
            new RegExp(`\\.${fileExtension.value}$`, "i"),
            "",
          ),
        )
      : "";

    return (
      activeMetadata?.title?.trim() ||
      fallbackTitle ||
      fallbackRawFileName ||
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
        playlists.value.find((item) => item.id === playlistId)?.name ??
        "Playlist"
      );
    }

    return currentPlaybackSourceLabel.value;
  });

  const canNavigateFromPlaybackSourceLabel = computed(() => {
    if (!filePath.value) return false;

    switch (currentPlaybackContext.value.kind) {
      case "album":
        return Boolean(
          displayAlbum.value && displayAlbum.value !== "Álbum desconocido",
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

    return (
      activeMetadata?.album?.trim() || fallbackAlbum || "Álbum desconocido"
    );
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

  const shuffleArray = <T>(items: T[]) => {
    const shuffled = [...items];

    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  };

  const restoreQueueOriginalOrder = () => {
    const trackMap = new Map(
      queue.value.map((track) => [track.queueId, track]),
    );

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
    if (currentSource.value !== "queue" || currentQueueIndex.value !== 0)
      return;
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

  const stripInternalSpotiFlacDuplicateSuffix = (value: string) => {
    const cleaned = value
      .replace(/__sfdup_[a-z0-9_-]+$/i, "")
      .replace(/[\s._-]+$/g, "")
      .trim();

    return cleaned || value;
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

    return (
      stripInternalSpotiFlacDuplicateSuffix(nameWithoutExtension) ||
      "Sin nombre"
    );
  };

  const normalizeTrackSearch = (text: string) => {
    if (!text) return "";
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Quitar tildes
      .replace(/[^a-z0-9]/g, "") // Solo alfanumérico
      .trim();
  };

  const getTrackFingerprint = (title: string, artist: string) => {
    const artistStr = Array.isArray(artist) ? artist.join(", ") : artist;
    return `${normalizeTrackSearch(formatMetadataListValue(title))}_${normalizeTrackSearch(formatMetadataListValue(artistStr))}`;
  };

  const pendingSpotifySyncs = ref<
    {
      playlistId: number;
      playlistName: string;
      newTracks: any[];
      removedTracks: any[];
      spotifyUrl?: string | null;
      remoteIds?: string[];
      remoteInstanceKeys?: string[];
      remoteSnapshotId?: string | null;
      isDeepMode?: boolean;
      isScanning?: boolean;
      isForcedFromUpToDate?: boolean;
    }[]
  >([]);

  const selectedRemovedTracks = ref<string[]>([]); // Rutas seleccionadas para borrar
  const selectedNewTracks = ref<string[]>([]); // IDs de Spotify seleccionados para descargar
  const selectedRemovedTracksSet = computed(
    () => new Set(selectedRemovedTracks.value),
  );
  const selectedNewTracksSet = computed(() => new Set(selectedNewTracks.value));
  const isBulkSelectingNewTracks = ref(false);
  const isBulkSelectingRemovedTracks = ref(false);
  const sessionDismissedNuevas = ref<Record<number, string>>({}); // PlaylistId -> Hash de tracks nuevas descartadas
  const sessionDismissedBajas = ref<Record<number, string>>({}); // PlaylistId -> Hash de tracks eliminadas descartadas
  const spotifySyncLastChecked = ref<Record<number, number>>({}); // PlaylistId -> Timestamp de último chequeo exitoso
  let syncCheckTimeout: any = null; // Timer para el debounce de navegación
  let currentActiveSyncId: number | null = null; // ID ÚNICO para cancelar procesos en vuelo instantáneamente

  const isSyncDownloading = ref(false); // Indica si hay una descarga masiva en curso en el modal
  const isSyncSuccess = ref<number | null>(null); // Indica el ID de la playlist que acaba de sincronizarse con éxito
  const isManualSyncing = ref<number | null>(null); // ID de la playlist que se está sincronizando manualmente
  const isSpotifyOrdering = ref<number | null>(null); // ID de la playlist que se está reordenando manualmente

  // Obtiene el estado de sincronización de la playlist activa actualmente
  const activePlaylistSync = computed(() => {
    if (!activePlaylist.value) return null;
    return (
      pendingSpotifySyncs.value.find(
        (s) => s.playlistId === activePlaylist.value!.id,
      ) || null
    );
  });

  const activePendingSpotifySync = computed(
    () => pendingSpotifySyncs.value[0] || null,
  );

  const activePendingNewTrackIds = computed(
    () =>
      activePendingSpotifySync.value?.newTracks.map((track) => track.id) || [],
  );

  const activePendingRemovedTrackPaths = computed(
    () =>
      activePendingSpotifySync.value?.removedTracks.map(
        (track) => track.path,
      ) || [],
  );
  const syncNewTracksListRef = ref<HTMLElement | null>(null);
  const syncRemovedTracksListRef = ref<HTMLElement | null>(null);
  const syncNewTracksScrollTop = ref(0);
  const syncRemovedTracksScrollTop = ref(0);
  const syncNewTracksViewportHeight = ref(520);
  const syncRemovedTracksViewportHeight = ref(520);
  const SYNC_TRACK_LIST_OVERSCAN = 8;
  const SYNC_NEW_TRACK_ROW_HEIGHT = 72;
  const SYNC_REMOVED_TRACK_ROW_HEIGHT = 72;

  const updateSyncVirtualListMetrics = (
    listRef: typeof syncNewTracksListRef,
    scrollTopRef: typeof syncNewTracksScrollTop,
    viewportHeightRef: typeof syncNewTracksViewportHeight,
    element?: HTMLElement | null,
  ) => {
    const target = element || listRef.value;
    if (!target) return;
    scrollTopRef.value = target.scrollTop;
    viewportHeightRef.value = target.clientHeight || 520;
  };

  const onSyncNewTracksScroll = (event: Event) => {
    updateSyncVirtualListMetrics(
      syncNewTracksListRef,
      syncNewTracksScrollTop,
      syncNewTracksViewportHeight,
      event.target as HTMLElement,
    );
  };

  const onSyncRemovedTracksScroll = (event: Event) => {
    updateSyncVirtualListMetrics(
      syncRemovedTracksListRef,
      syncRemovedTracksScrollTop,
      syncRemovedTracksViewportHeight,
      event.target as HTMLElement,
    );
  };

  const buildVirtualTrackWindow = <T>(
    tracks: T[],
    scrollTop: number,
    viewportHeight: number,
    rowHeight: number,
  ) => {
    const safeViewportHeight = Math.max(viewportHeight, rowHeight);
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / rowHeight) - SYNC_TRACK_LIST_OVERSCAN,
    );
    const visibleCount =
      Math.ceil(safeViewportHeight / rowHeight) + SYNC_TRACK_LIST_OVERSCAN * 2;
    const endIndex = Math.min(tracks.length, startIndex + visibleCount);

    return {
      items: tracks.slice(startIndex, endIndex).map((track, localIndex) => ({
        track,
        index: startIndex + localIndex,
      })),
      topPadding: startIndex * rowHeight,
      bottomPadding: Math.max(0, (tracks.length - endIndex) * rowHeight),
    };
  };

  const virtualNewTracksWindow = computed(() =>
    buildVirtualTrackWindow(
      activePendingSpotifySync.value?.newTracks || [],
      syncNewTracksScrollTop.value,
      syncNewTracksViewportHeight.value,
      SYNC_NEW_TRACK_ROW_HEIGHT,
    ),
  );

  const virtualRemovedTracksWindow = computed(() =>
    buildVirtualTrackWindow(
      activePendingSpotifySync.value?.removedTracks || [],
      syncRemovedTracksScrollTop.value,
      syncRemovedTracksViewportHeight.value,
      SYNC_REMOVED_TRACK_ROW_HEIGHT,
    ),
  );

  const toggleRemovedTrackSelection = (path: string) => {
    if (selectedRemovedTracksSet.value.has(path)) {
      selectedRemovedTracks.value = selectedRemovedTracks.value.filter(
        (p) => p !== path,
      );
    } else {
      selectedRemovedTracks.value.push(path);
    }
  };

  const toggleNewTrackSelection = (trackId: string) => {
    if (selectedNewTracksSet.value.has(trackId)) {
      selectedNewTracks.value = selectedNewTracks.value.filter(
        (id) => id !== trackId,
      );
    } else {
      selectedNewTracks.value.push(trackId);
    }
  };

  const setAllNewTracksSelection = async (
    trackIds: string[],
    select: boolean,
  ) => {
    if (isBulkSelectingNewTracks.value) return;

    const nextSelection = select ? trackIds : [];
    const currentSelection = selectedNewTracks.value;
    const isSameSelection =
      currentSelection.length === nextSelection.length &&
      currentSelection.every(
        (trackId, index) => trackId === nextSelection[index],
      );

    if (isSameSelection) return;

    isBulkSelectingNewTracks.value = true;
    try {
      await nextTick();
      await waitForNextPaint();

      if (select) {
        selectedNewTracks.value = [...trackIds];
      } else {
        selectedNewTracks.value = [];
      }

      await nextTick();
      await waitForNextPaint();
    } finally {
      isBulkSelectingNewTracks.value = false;
    }
  };

  const setAllRemovedTracksSelection = async (
    paths: string[],
    select: boolean,
  ) => {
    if (isBulkSelectingRemovedTracks.value) return;

    const nextSelection = select ? paths : [];
    const currentSelection = selectedRemovedTracks.value;
    const isSameSelection =
      currentSelection.length === nextSelection.length &&
      currentSelection.every((path, index) => path === nextSelection[index]);

    if (isSameSelection) return;

    isBulkSelectingRemovedTracks.value = true;
    try {
      await nextTick();
      await waitForNextPaint();

      if (select) {
        selectedRemovedTracks.value = [...paths];
      } else {
        selectedRemovedTracks.value = [];
      }

      await nextTick();
      await waitForNextPaint();
    } finally {
      isBulkSelectingRemovedTracks.value = false;
    }
  };

  const isNewTrackSelected = (trackId: string) =>
    selectedNewTracksSet.value.has(trackId);

  const isRemovedTrackSelected = (path: string) =>
    selectedRemovedTracksSet.value.has(path);

  const areAllNewTracksSelected = (trackIds: string[]) =>
    trackIds.length > 0 &&
    trackIds.every((trackId) => selectedNewTracksSet.value.has(trackId));

  const areAllRemovedTracksSelected = (paths: string[]) =>
    paths.length > 0 &&
    paths.every((path) => selectedRemovedTracksSet.value.has(path));

  const reorderPlaylistToRemoteOrder = async (
    playlistId: number,
    playlistName: string,
    currentTrackPaths: string[],
    rawTracks: any[],
    localTracksWithMeta: { path: string; meta: any }[],
  ) => {
    if (currentTrackPaths.length <= 1 || rawTracks.length === 0) {
      // console.log("[SpotifyOrder] Reorder skipped: insufficient data.", {
      // playlistId,
      // playlistName,
      // localCount: currentTrackPaths.length,
      // remoteCount: rawTracks.length,
      // });
      return false;
    }

    const localTrackByPath = new Map(
      localTracksWithMeta.map((track) => [track.path, track]),
    );
    const queuedLocalPathsBySpotifyId = new Map<string, string[]>();
    const queuedLocalPathsByFingerprint = new Map<string, string[]>();
    for (const localTrack of localTracksWithMeta) {
      const spotifyId = localTrack.meta.spotify_id;
      const fingerprint = getTrackFingerprint(
        localTrack.meta.title || "",
        localTrack.meta.artist || "",
      );
      if (spotifyId) {
        const queue = queuedLocalPathsBySpotifyId.get(spotifyId) || [];
        queue.push(localTrack.path);
        queuedLocalPathsBySpotifyId.set(spotifyId, queue);
      }
      if (fingerprint) {
        const queue = queuedLocalPathsByFingerprint.get(fingerprint) || [];
        queue.push(localTrack.path);
        queuedLocalPathsByFingerprint.set(fingerprint, queue);
      }
    }

    const remoteOrderedPaths: string[] = [];
    const matchedRemoteDebug: Array<{
      index: number;
      spotifyId: string | null;
      title: string;
      artist: string;
      localPath: string | null;
      matchType: "spotify_id" | "fingerprint" | "unmatched";
    }> = [];
    for (const remoteTrack of rawTracks) {
      const spotifyId =
        remoteTrack.id || remoteTrack.spotify_id || remoteTrack.track_id;
      const remoteFingerprint = getTrackFingerprint(
        remoteTrack.name || remoteTrack.track_name || remoteTrack.title || "",
        remoteTrack.artists || remoteTrack.artist_name || "",
      );
      let nextPath: string | undefined;
      let matchType: "spotify_id" | "fingerprint" | "unmatched" = "unmatched";
      if (spotifyId) {
        const queue = queuedLocalPathsBySpotifyId.get(spotifyId);
        nextPath = queue?.shift();
        if (nextPath) matchType = "spotify_id";
      }
      if (!nextPath && remoteFingerprint) {
        const queue = queuedLocalPathsByFingerprint.get(remoteFingerprint);
        nextPath = queue?.shift();
        if (nextPath) matchType = "fingerprint";
      }
      matchedRemoteDebug.push({
        index: matchedRemoteDebug.length,
        spotifyId: spotifyId || null,
        title:
          remoteTrack.name ||
          remoteTrack.track_name ||
          remoteTrack.title ||
          "Unknown Title",
        artist:
          remoteTrack.artists || remoteTrack.artist_name || "Unknown Artist",
        localPath: nextPath || null,
        matchType,
      });
      if (nextPath) {
        remoteOrderedPaths.push(nextPath);
      }
    }

    const currentOrderDebug = currentTrackPaths.map((path, index) => {
      const meta = localTrackByPath.get(path)?.meta;
      return {
        index,
        spotifyId: meta?.spotify_id || null,
        title: meta?.title || path.split(/[\\/]/).pop() || path,
        artist: meta?.artist || null,
        path,
      };
    });

    const officialOrderDebug = rawTracks.map((track: any, index: number) => ({
      index,
      spotifyId: track.id || track.spotify_id || track.track_id || null,
      title: track.name || track.track_name || track.title || "Unknown Title",
      artist: track.artists || track.artist_name || "Unknown Artist",
    }));

    console.groupCollapsed(
      `[SpotifyOrder] Playlist "${playlistName}" (#${playlistId}) comparison`,
    );
    // console.log("Current local order:", currentOrderDebug);
    // console.log("Official Spotify order:", officialOrderDebug);
    // console.log("Remote-to-local matches:", matchedRemoteDebug);
    // console.log(
    // "Matched local paths in Spotify order:",
    // remoteOrderedPaths.map((path, index) => {
    // const meta = localTrackByPath.get(path)?.meta;
    // return {
    // index,
    // spotifyId: meta?.spotify_id || null,
    // title: meta?.title || path.split(/[\\/]/).pop() || path,
    // artist: meta?.artist || null,
    // path,
    // };
    // }),
    // );
    console.groupEnd();

    if (remoteOrderedPaths.length === 0) {
      // console.warn(
      // "[SpotifyOrder] Reorder failed: no local tracks matched Spotify by ID or fingerprint.",
      // {
      // playlistId,
      // playlistName,
      // },
      // );
      return false;
    }

    const remoteOrderedSet = new Set(remoteOrderedPaths);
    const trailingPaths = currentTrackPaths.filter(
      (path) => !remoteOrderedSet.has(path),
    );
    const desiredTrackPaths = [...remoteOrderedPaths, ...trailingPaths];

    const sameOrder =
      desiredTrackPaths.length === currentTrackPaths.length &&
      desiredTrackPaths.every(
        (path, index) => path === currentTrackPaths[index],
      );

    if (sameOrder) {
      // console.log("[SpotifyOrder] Playlist already matches Spotify order.", {
      // playlistId,
      // playlistName,
      // });
      return false;
    }

    // console.log("[SpotifyOrder] Applying reordered track paths.", {
    // playlistId,
    // playlistName,
    // desiredTrackPaths,
    // trailingPaths,
    // });

    await invoke("reorder_playlist_tracks", {
      playlistId,
      orderedTrackPaths: desiredTrackPaths,
    });

    const playlistEntry = playlists.value.find(
      (item) => item.id === playlistId,
    );
    if (playlistEntry) {
      playlistEntry.trackPaths = [...desiredTrackPaths];
    }

    // console.log("[SpotifyOrder] Playlist reorder applied successfully.", {
    // playlistId,
    // playlistName,
    // finalOrder: desiredTrackPaths,
    // });

    return true;
  };

  watch(
    () => activePendingSpotifySync.value?.playlistId ?? null,
    async () => {
      syncNewTracksScrollTop.value = 0;
      syncRemovedTracksScrollTop.value = 0;
      await nextTick();
      updateSyncVirtualListMetrics(
        syncNewTracksListRef,
        syncNewTracksScrollTop,
        syncNewTracksViewportHeight,
      );
      updateSyncVirtualListMetrics(
        syncRemovedTracksListRef,
        syncRemovedTracksScrollTop,
        syncRemovedTracksViewportHeight,
      );
    },
  );

  let isSpotifyCheckInFlight = false;

  const checkSpotifyPlaylistsForUpdates = async () => {
    if (isSpotifyCheckInFlight) return;
    const syncedPlaylists = playlists.value.filter((p) => !!p.spotifyUrl);
    if (syncedPlaylists.length === 0) return;

    isSpotifyCheckInFlight = true;
    // console.log(
    //   `[DEBUG][Sync] Global mass check START for ${syncedPlaylists.length} playlists.`,
    // );

    for (const p of syncedPlaylists) {
      // Si el usuario está sincronizando algo manualmente, pausamos el loop global para dar prioridad
      if (isManualSyncing.value !== null) {
        // console.log(
        //   `[DEBUG][Sync] Global loop paused: manual sync in progress.`,
        // );
        break;
      }

      // OPTIMIZACIÓN: Dejamos un respiro de 200ms entre cada playlist para no saturar el canal de Tauri
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Si el usuario navegó a otra playlist, abortamos el loop global para no causar lag
      // El loop se retomará en el próximo ciclo automático.
      await checkSpecificSpotifyPlaylist(p.id, false);
    }
    isSpotifyCheckInFlight = false;
    // console.log(`[DEBUG][Sync] Global mass check FINISHED.`);
  };

  const checkSpecificSpotifyPlaylist = async (
    playlistId: number,
    forceState = false,
    ignoreHistory = false,
    wasUpToDate = false,
  ): Promise<boolean> => {
    const p = playlists.value.find((item) => item.id === playlistId);
    if (!p || !p.spotifyUrl) return false;

    // Token de sesión local para este cierre (clousure) específico
    const thisSessionToken = playlistId;
    if (forceState) currentActiveSyncId = thisSessionToken;

    // ESTRATEGIA DE THROTTLING INTELIGENTE:
    const now = Date.now();
    const lastCheck = spotifySyncLastChecked.value[playlistId] || 0;
    const throttleTime = forceState ? 1000 * 30 : 1000 * 60 * 10;

    if (now - lastCheck < throttleTime) {
      if (!forceState) return true;
    }

    if (pendingSpotifySyncs.value.some((s) => s.playlistId === playlistId)) {
      if (!forceState) return true;
      // Para evitar que el modal se cierre al re-escanear, solo marcamos como escaneando
      const existing = pendingSpotifySyncs.value.find(
        (s) => s.playlistId === playlistId,
      );
      if (existing) existing.isScanning = true;
    }

    try {
      // console.log(
      // `[DEBUG][Sync] Fetching metadata for playlist "${p.name}" (ID: ${playlistId}) from URL: "${p.spotifyUrl}"`,
      // );
      const remoteData = await fetchSpotifyMetadataNative(p.spotifyUrl);
      // console.log(
      // `[DEBUG][Sync] Metadata received for "${p.name}":`,
      // remoteData,
      // );

      // PAUSA TÁCTICA Y VALIDACIÓN DE MUERTE INTEGRAL
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (forceState && currentActiveSyncId !== thisSessionToken) return false;
      if (!forceState && activePlaylistViewId.value !== playlistId)
        return false;

      const rawTracks = remoteData
        ? remoteData.track_list || remoteData.tracks
        : null;
      // console.log(
      // `[DEBUG][Sync] Tracks Info: Received=${rawTracks?.length || 0}, Total in Spotify=${remoteData.playlist_info?.tracks?.total}`,
      // );
      if (!Array.isArray(rawTracks)) {
        // console.warn(
        // "[DEBUG][Sync] Playlist metadata did not contain a track array",
        // {
        // playlistId,
        // playlistName: p.name,
        // spotifyUrl: p.spotifyUrl,
        // remoteData,
        // },
        // );
        return false;
      }

      const getTrackId = (t: any) => t.id || t.spotify_id || t.track_id;
      const getTrackInstanceKey = (t: any, index: number) => {
        const tid = getTrackId(t);
        const addedAt = t.added_at;
        return addedAt ? `${tid}_${addedAt}` : `${tid}_legacy_${index}`;
      };

      const remoteInstanceKeys = rawTracks
        .map((t: any, i: number) => getTrackInstanceKey(t, i))
        .filter((k: string) => !!k);
      const remoteIds = rawTracks.map(getTrackId).filter((id) => !!id);

      const localTracksWithMeta = p.trackPaths
        .map((path) => ({ path, meta: libraryMetadataMap.value[path] }))
        .filter((x): x is { path: string; meta: any } => !!x.meta);

      if (forceState && currentActiveSyncId !== thisSessionToken) return false;

      const remoteSnapshotId = remoteData.playlist_info?.snapshot_id;
      const localSnapshotId = p.lastSnapshotId;

      const localTrackIds = localTracksWithMeta
        .map((x) => x.meta.spotify_id)
        .filter((id): id is string => id != null);
      let syncState: {
        synced?: string[];
        ignoredRemovals?: string[];
        lastSnapshotId?: string | null;
      } = { synced: [], ignoredRemovals: [] };
      try {
        const parsed = JSON.parse(p.spotifySyncedIds || "{}");
        if (Array.isArray(parsed)) {
          syncState.synced = parsed;
        } else {
          syncState = { ...syncState, ...parsed };
        }
      } catch (e) {}

      if (!localSnapshotId && syncState.lastSnapshotId) {
        p.lastSnapshotId = syncState.lastSnapshotId;
      }

      // console.log("[DEBUG][Sync] Playlist sync comparison snapshot", {
      //   playlistId,
      //   playlistName: p.name,
      //   spotifyUrl: p.spotifyUrl,
      //   rawTrackCount: rawTracks.length,
      //   remoteIdsCount: remoteIds.length,
      //   localTrackPathsCount: p.trackPaths.length,
      //   localTracksWithMetaCount: localTracksWithMeta.length,
      //   localTrackIdsCount: localTrackIds.length,
      //   syncedKeysCount: (syncState.synced || []).length,
      //   ignoredRemovalsCount: (syncState.ignoredRemovals || []).length,
      //   lastSnapshotId: localSnapshotId || syncState.lastSnapshotId,
      //   remoteSnapshotId: remoteSnapshotId,
      // });

      const syncedKeys = syncState.synced || [];
      const ignoredRemovals = syncState.ignoredRemovals || [];

      // BOOTSTRAP: Si es la primera vez que sincronizamos (no hay snapshot previo), marcamos todo como visto
      const isFirstSync =
        !localSnapshotId &&
        !syncState.lastSnapshotId &&
        syncedKeys.length === 0;
      if (isFirstSync) {
        // console.log(
        //   `[DEBUG][Sync] BOOTSTRAP for "${p.name}". Marking all ${remoteInstanceKeys.length} items as seen.`,
        // );
        await acknowledgeSpotifySync(p.id, {
          synced: remoteInstanceKeys,
          ignoredRemovals: [],
          lastSnapshotId: remoteSnapshotId,
        });
        p.lastSnapshotId = remoteSnapshotId;
        spotifySyncLastChecked.value[playlistId] = Date.now();
        return true;
      }

      const localIdSet = new Set(localTrackIds);
      const localFingerprintSet = new Set(
        localTracksWithMeta.map((x) =>
          getTrackFingerprint(x.meta.title, x.meta.artist),
        ),
      );
      const syncedKeySet = new Set(syncedKeys);
      const newTracks = rawTracks
        .map((t: any, i: number) => ({ track: t, remotePosition: i }))
        .filter(({ track: t, remotePosition: i }) => {
          const tid = getTrackId(t);
          const key = getTrackInstanceKey(t, i);
          const fingerprint = getTrackFingerprint(
            t.name || t.track_name || t.title || "",
            t.artists || t.artist_name || "",
          );

          // Es nueva solo si:
          // 1. No la tenemos por ID
          // 2. No la tenemos por "huella digital" (Título + Artista)
          // 3. Y (es modo Deep o no la hemos sincronizado antes en esta sesión)
          return (
            tid &&
            !localIdSet.has(tid) &&
            !localFingerprintSet.has(fingerprint) &&
            (ignoreHistory || !syncedKeySet.has(key))
          );
        })
        .map(({ track: t, remotePosition }) => ({
          id: getTrackId(t),
          remotePosition,
          title: t.name || t.track_name || t.title || "Unknown Title",
          artists: t.artists || t.artist_name || "Unknown Artist",
          album: t.album_name || t.album || "Unknown Album",
          cover:
            t.images ||
            (t.album_images && t.album_images.length > 0
              ? t.album_images[0].url
              : null),
          added_at: t.added_at || null,
          release_date: t.release_date || null,
          isrc: t.isrc || (t.external_ids ? t.external_ids.isrc : null),
          url:
            t.external_urls ||
            t.track_url ||
            t.url ||
            `https://open.spotify.com/track/${getTrackId(t)}`,
        }));

      const remoteIdSet = new Set(remoteIds);
      const ignoredRemovalsSet = new Set(ignoredRemovals);
      const removedTracks = localTracksWithMeta
        .filter(
          (x) =>
            x.meta.spotify_id &&
            !remoteIdSet.has(x.meta.spotify_id) &&
            !ignoredRemovalsSet.has(x.meta.spotify_id),
        )
        .map((x) => ({
          id: x.meta.spotify_id || "",
          title: x.meta.title || "Unknown Title",
          artists: x.meta.artist || "Unknown Artist",
          path: x.path,
          cover: x.meta.cover_art?.data_url || null,
        }));

      // console.log("[DEBUG][Sync] Playlist diff computed", {
      //   playlistId,
      //   playlistName: p.name,
      //   newTracksCount: newTracks.length,
      //   removedTracksCount: removedTracks.length,
      //   sampleNewTracks: newTracks.slice(0, 3),
      //   sampleRemovedTracks: removedTracks.slice(0, 3),
      // });

      const isUpToDate =
        remoteSnapshotId === localSnapshotId ||
        (remoteInstanceKeys.length === syncedKeys.length &&
          remoteInstanceKeys.every((key) => syncedKeySet.has(key)));

      if (newTracks.length === 0 && removedTracks.length === 0) {
        if (!isUpToDate) {
          if (forceState && currentActiveSyncId !== thisSessionToken)
            return false;
          await acknowledgeSpotifySync(p.id, {
            ...syncState,
            synced: remoteInstanceKeys,
            lastSnapshotId: remoteSnapshotId,
          });
        }
        spotifySyncLastChecked.value[playlistId] = Date.now();
        return true;
      }

      if (forceState && currentActiveSyncId !== thisSessionToken) return false;

      const syncObj = {
        playlistId: p.id,
        playlistName: p.name,
        newTracks,
        removedTracks,
        remoteInstanceKeys,
        remoteSnapshotId,
        isDeepMode: ignoreHistory,
        isScanning: false,
        isForcedFromUpToDate: wasUpToDate,
      };
      const alreadyExistsIndex = pendingSpotifySyncs.value.findIndex(
        (s) => s.playlistId === p.id,
      );

      if (alreadyExistsIndex === -1) {
        pendingSpotifySyncs.value = [...pendingSpotifySyncs.value, syncObj];
        selectedRemovedTracks.value = removedTracks.map((t) => t.path);
        selectedNewTracks.value = newTracks.map((t) => t.id);
      } else {
        const newList = [...pendingSpotifySyncs.value];
        newList[alreadyExistsIndex] = syncObj;
        pendingSpotifySyncs.value = newList;
        selectedNewTracks.value = newTracks.map((t) => t.id);
      }
      spotifySyncLastChecked.value[playlistId] = Date.now();
      return true;
    } catch (e) {
      // console.error(`[SpotifySync] Error checking ${p.name}:`, e);
      // console.error(
      // "[DEBUG][Sync] Error context for checkSpecificSpotifyPlaylist",
      // {
      // playlistId,
      // playlistName: p.name,
      // spotifyUrl: p.spotifyUrl,
      // forceState,
      // currentActiveSyncId,
      // activePlaylistViewId: activePlaylistViewId.value,
      // spotifySyncedIds: p.spotifySyncedIds,
      // localTrackPathsCount: p.trackPaths.length,
      // },
      // );
      return false;
    } finally {
      if (forceState && currentActiveSyncId === thisSessionToken)
        currentActiveSyncId = null;
    }
  };

  const acknowledgeSpotifySync = async (playlistId: number, state: any) => {
    // console.log(
    // `[SpotifySync][DB] Attempting to save sync state for playlist ${playlistId}...`,
    // );
    try {
      await invoke("set_playlist_synced_ids", {
        playlistId,
        syncedIdsJson: JSON.stringify(state),
      });
      // console.log(`[SpotifySync][DB] Save successful.`);

      // Actualizamos localmente para no esperar a recargar todo
      const p = playlists.value.find((item) => item.id === playlistId);
      if (p) p.spotifySyncedIds = JSON.stringify(state);
    } catch (e) {
      // console.error(`[SpotifySync][DB] ERROR saving to database:`, e);
    }
  };

  const applySpotifySync = async (
    sync: (typeof pendingSpotifySyncs.value)[0],
  ) => {
    const playlistId = sync.playlistId;
    const playlistName = sync.playlistName;

    // 1. Quitar de la lista de pendientes inmediatamente
    pendingSpotifySyncs.value = pendingSpotifySyncs.value.filter(
      (s) => s.playlistId !== playlistId,
    );

    // NUEVO: Procesar eliminaciones primero
    if (selectedRemovedTracks.value.length > 0) {
      // console.log(
      // `[SpotifySync] Removing ${selectedRemovedTracks.value.length} tracks from playlist "${playlistName}"...`,
      // );
      for (const path of selectedRemovedTracks.value) {
        try {
          await invoke("remove_track_from_playlist", {
            playlistId: playlistId,
            trackPath: path,
            deleteFiles: false,
          });
        } catch (e) {
          // console.error(`[SpotifySync] Error removing ${path}`, e);
        }
      }
      // Limpiamos selección
      selectedRemovedTracks.value = [];
    }

    // console.log(
    // `[SpotifySync] Downloading ${sync.newTracks.length} tracks for "${playlistName}"...`,
    // );

    // Obtenemos todos los IDs actuales de Spotify para marcarlos como "vistos" solo al final si todo va bien
    let successIds: string[] = [];
    try {
      const p = playlists.value.find((item) => item.id === playlistId);
      if (p && p.spotifyUrl) {
        // No marcamos como visto aquí todavía para permitir re-intentos si falla la descarga
        // console.log("[SpotifySync] Mass sync prepared.");
      }
    } catch (e) {
      // console.warn(
      // "[SpotifySync] Non-critical error during sync preparation",
      // e,
      // );
    }

    const mainMusicDir = musicDirectories.value[0] || "";

    for (const track of sync.newTracks) {
      try {
        // Petición completa con metadatos y flags de incrustación (según DownloadRequest en Go)
        const request = {
          item_id: `${track.id}_${Date.now()}`,
          spotify_id: track.id,
          track_name: track.title,
          artist_name: track.artists,
          album_name: track.album,
          cover_url: track.cover,
          release_date: track.release_date,
          output_dir: mainMusicDir, // Pasamos la raíz, el bridge unirá con playlist_name solo si se le pasa
          playlist_name: sync.playlistName,
          service: "auto",
          allow_fallback: true,
          audio_format: "LOSSLESS",
          embed_lyrics: true,
          embed_max_quality_cover: true,
          overwrite: true,
        };

        // console.log("[DEBUG][Sync] applySpotifySync track request", {
        //   playlistId,
        //   playlistName,
        //   track,
        //   request,
        // });

        const result = await downloadTrackNative(request);

        if (result && result.file) {
          // console.log(
          // `[DIAGNOSTICO] Download SUCCESS using service: ${result.used_service || "unknown"}`,
          // );
          (track as any).downloadedPath = result.file;
          successIds.push(track.id);

          await invoke("add_track_to_playlist", {
            playlistId: sync.playlistId,
            trackPath: result.file,
            position:
              typeof track.remotePosition === "number"
                ? track.remotePosition
                : null,
          });

          // Forzar escaneo de metadatos para que el caché se actualice inmediatamente
          try {
            await invoke("get_library_metadata_batch", {
              paths: [result.file],
            });
          } catch (e) {
            // console.warn(
            // "[SpotifySync] Error indexing metadata for",
            // result.file,
            // e,
            // );
          }
        } else {
          // console.error(
          // `[SpotifySync] Download failed for ${track.title}:`,
          // result,
          // );
        }
      } catch (e) {
        // console.error(
        // `[SpotifySync] Error during download of "${track.title}":`,
        // e,
        // );
      }
    }

    // Al finalizar el bucle, marcamos como sincronizados los IDs remotos si hubo éxito parcial o total
    if (sync.remoteInstanceKeys && sync.remoteInstanceKeys.length > 0) {
      await acknowledgeSpotifySync(playlistId, {
        synced: sync.remoteInstanceKeys,
        lastSnapshotId: (sync as any).remoteSnapshotId,
      });
    }

    // 1. Sincronización oficial de la biblioteca
    await syncLibrary();

    // 2. Recargar estructura de la playlist para el fondo
    await loadPlaylists();

    // 3. Verificación reactiva
    let integrityVerified = false;
    let attempts = 0;
    const downloadedPaths = (sync.newTracks as any[])
      .filter((t) => t.downloadedPath)
      .map((t) => t.downloadedPath);

    if (downloadedPaths.length > 0) {
      while (!integrityVerified && attempts < 20) {
        const existingPaths = new Set(playlist.value.map((p) => p.path));
        integrityVerified = downloadedPaths.every(
          (path) => path && existingPaths.has(path),
        );
        if (!integrityVerified) {
          await new Promise((r) => setTimeout(r, 100));
          attempts++;
        }
      }
    }

    // 3. Render final
    await nextTick();
    await waitForNextPaint();
  };

  const discardSpotifySync = (playlistId: number, syncObj: any) => {
    // ESTO ES UN DESCARTAR REAL: Silenciamos por el resto de la sesión para este hash exacto
    const newHash = (syncObj.newTracks || [])
      .map((t: any) => t.id)
      .sort()
      .join(",");
    const removedHash = (syncObj.removedTracks || [])
      .map((t: any) => t.path)
      .sort()
      .join(",");

    if (newHash) sessionDismissedNuevas.value[playlistId] = newHash;
    if (removedHash) sessionDismissedBajas.value[playlistId] = removedHash;

    pendingSpotifySyncs.value = pendingSpotifySyncs.value.filter(
      (s) => s.playlistId !== playlistId,
    );
  };

  const closeSyncModalSoft = (playlistId: number) => {
    // ESTO ES UN CERRAR SUAVE: No guardamos el hash, solo lo quitamos de la vista actual
    // Al volver a entrar a la playlist o realizar un nuevo escaneo, el modal volverá a saltar
    pendingSpotifySyncs.value = pendingSpotifySyncs.value.filter(
      (s) => s.playlistId !== playlistId,
    );
  };

  const manualForceSync = async (
    playlistId: number,
    ignoreHistory = false,
    wasUpToDate = false,
  ) => {
    // console.log(
    //   `[DEBUG][Sync] USER CLICKED Sync Button for ID: ${playlistId}. Setting state...`,
    // );
    // Acción manual del usuario: Reseteamos descartes temporales para que el modal se vea sí o sí
    isManualSyncing.value = playlistId;
    isSyncSuccess.value = null;

    delete sessionDismissedNuevas.value[playlistId];
    delete sessionDismissedBajas.value[playlistId];
    try {
      const success = await checkSpecificSpotifyPlaylist(
        playlistId,
        true,
        ignoreHistory,
        wasUpToDate,
      );

      // console.log(
      //   `[DEBUG][Sync] manualForceSync: Internal check finished for ID: ${playlistId}. Success=${success}`,
      // );

      // VERIFICACIÓN DE CANCELACIÓN ABSOLUTA:
      if (!success || activePlaylistViewId.value !== playlistId) {
        // console.warn(
        //   `[DEBUG][Sync] manualForceSync ABORT: User navigated away or process was cancelled. (Success=${success}, CurrentView=${activePlaylistViewId.value})`,
        // );
        return;
      }

      // console.log(
      //   `[DEBUG][Sync] Current view still matches. Proceding to show results.`,
      // );

      const syncResult = pendingSpotifySyncs.value.find(
        (s) => s.playlistId === playlistId,
      );
      const hasChanges =
        syncResult &&
        (syncResult.newTracks.length > 0 ||
          syncResult.removedTracks.length > 0);

      if (!hasChanges) {
        isSyncSuccess.value = playlistId;
        setTimeout(() => {
          if (isSyncSuccess.value === playlistId) {
            isSyncSuccess.value = null;
          }
        }, 3000);
      }
    } finally {
      isManualSyncing.value = null;
    }
  };

  const orderPlaylistFromSpotify = async (playlistId: number) => {
    const p = playlists.value.find((item) => item.id === playlistId);
    if (!p?.spotifyUrl || isSpotifyOrdering.value === playlistId) return false;

    isSpotifyOrdering.value = playlistId;
    try {
      // console.log("[SpotifyOrder] Manual reorder requested.", {
      // playlistId,
      // playlistName: p.name,
      // spotifyUrl: p.spotifyUrl,
      // localTrackCount: p.trackPaths.length,
      // });

      const remoteData = await fetchSpotifyMetadataNative(p.spotifyUrl);
      const rawTracks = remoteData
        ? remoteData.track_list || remoteData.tracks
        : null;
      if (!Array.isArray(rawTracks)) {
        // console.warn(
        // "[SpotifySync] Could not fetch tracks for manual reorder.",
        // {
        // playlistId,
        // playlistName: p.name,
        // remoteData,
        // },
        // );
        return false;
      }

      // console.log("[SpotifyOrder] Spotify metadata fetched for reorder.", {
      // playlistId,
      // playlistName: p.name,
      // remoteTrackCount: rawTracks.length,
      // snapshotId: remoteData?.playlist_info?.snapshot_id || null,
      // });

      const localTracksWithMeta = p.trackPaths
        .map((path) => ({ path, meta: libraryMetadataMap.value[path] }))
        .filter((x): x is { path: string; meta: any } => !!x.meta);

      // console.log("[SpotifyOrder] Local metadata prepared for reorder.", {
      // playlistId,
      // playlistName: p.name,
      // localTracksWithMetadata: localTracksWithMeta.length,
      // localTracksWithoutMetadata:
      // p.trackPaths.length - localTracksWithMeta.length,
      // });

      const didReorder = await reorderPlaylistToRemoteOrder(
        playlistId,
        p.name,
        p.trackPaths,
        rawTracks,
        localTracksWithMeta,
      );

      if (didReorder) {
        await loadPlaylists();
        if (activePlaylist.value?.id === playlistId) {
          await syncLibrary();
        }
        // console.log("[SpotifyOrder] Manual reorder finished successfully.", {
        // playlistId,
        // playlistName: p.name,
        // });
      } else {
        // console.log("[SpotifyOrder] Manual reorder finished with no changes.", {
        // playlistId,
        // playlistName: p.name,
        // });
      }

      return didReorder;
    } catch (error) {
      // console.error("[SpotifyOrder] Manual reorder failed.", {
      // playlistId,
      // playlistName: p.name,
      // error,
      // reason:
      // error instanceof Error
      // ? error.message
      // : typeof error === "string"
      // ? error
      // : "Unknown error",
      // });
      return false;
    } finally {
      isSpotifyOrdering.value = null;
    }
  };

  const applyNewTracksSync = async (
    playlistId: number,
    tracks: any[],
    remoteIds: string[],
  ) => {
    const p = playlists.value.find((item) => item.id === playlistId);
    if (!p) return;

    isSyncDownloading.value = true;
    tracks.forEach((t: any) => {
      if (selectedNewTracksSet.value.has(t.id) && t.status !== "done") {
        t.status = "waiting";
      }
    });
    const mainMusicDir = musicDirectories.value[0] || "";
    // console.log("[DIAGNOSTICO] applyNewTracksSync: Start", {
    // playlistId,
    // tracksCount: tracks.length,
    // mainMusicDir,
    // });

    for (const track of tracks) {
      if (track.status === "done") continue;
      if (!selectedNewTracksSet.value.has(track.id)) continue;

      try {
        track.status = "downloading";
        const request = {
          item_id: `${track.id}_${Date.now()}`,
          spotify_id: track.id,
          track_name: track.title,
          artist_name: track.artists,
          album_name: track.album,
          cover_url: track.cover,
          release_date: track.release_date,
          output_dir: mainMusicDir,
          playlist_name: p.name,
          service: "auto",
          allow_fallback: true,
          audio_format: "LOSSLESS",
          embed_lyrics: true,
          embed_max_quality_cover: true,
          overwrite: true,
        };

        // console.log(
        //   `[DIAGNOSTICO] Request for "${track.title}":`,
        //   JSON.stringify(request, null, 2),
        // );
        // console.log("[DEBUG][Sync] applyNewTracksSync track request", {
        //   playlistId,
        //   playlistName: p.name,
        //   track,
        //   request,
        // });

        const result = await downloadTrackNative(request);

        // console.log(
        // `[DIAGNOSTICO] Result for "${track.title}":`,
        // JSON.stringify(result, null, 2),
        // );

        if (result && result.file) {
          // console.log(
          // `[DIAGNOSTICO] Download SUCCESS using service: ${result.used_service || "unknown"}`,
          // );
          await invoke("add_track_to_playlist", {
            playlistId: playlistId,
            trackPath: result.file,
            position:
              typeof track.remotePosition === "number"
                ? track.remotePosition
                : null,
          });

          try {
            await invoke("get_library_metadata_batch", {
              paths: [result.file],
            });
          } catch (e) {}

          track.downloadedPath = result.file;
          track.status = "finishing";
        } else {
          // console.error(
          // `[DIAGNOSTICO] Download FAIL for "${track.title}". Full error result:`,
          // result,
          // );
          track.status = "error";
        }
      } catch (e) {
        // console.error(
        // `[DIAGNOSTICO] CRITICAL EXCEPTION downloading ${track.title}:`,
        // e,
        // );
        track.status = "error";
      }
    }

    // 1. Sincronización oficial de la biblioteca (Metadatos)
    await syncLibrary();

    // 2. Recargar estructura de la playlist (Paths) para que el fondo se actualice YA
    await loadPlaylists();

    // 3. VERIFICACIÓN DE INTEGRIDAD RECTIVA:
    // No confiamos en el tiempo, comprobamos que los archivos estén realmente en memoria
    let integrityVerified = false;
    let attempts = 0;
    while (!integrityVerified && attempts < 20) {
      const pendingPaths = tracks
        .filter((t) => t.status === "finishing")
        .map((t) => t.downloadedPath);

      if (pendingPaths.length === 0) {
        integrityVerified = true;
        break;
      }

      // Verificamos si todos los paths descargados ya existen en playlist.value
      const existingPaths = new Set(playlist.value.map((p) => p.path));
      integrityVerified = pendingPaths.every(
        (path) => path && existingPaths.has(path),
      );

      if (!integrityVerified) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }
    }

    // 3. Esperar al siguiente ciclo de pintura del navegador para asegurar el renderizado del cover
    await nextTick();
    await waitForNextPaint();

    tracks.forEach((t) => {
      if (t.status === "finishing") t.status = "done";
    });

    const successfulDownloads = tracks.filter(
      (t) => t.status === "done",
    ).length;
    const failedDownloads = tracks.filter((t) => t.status === "error").length;

    isSyncDownloading.value = false;

    // console.log(
    // `[DIAGNOSTICO] Sync finished. Success: ${successfulDownloads}, Failed: ${failedDownloads}, Integrity Verified: ${integrityVerified}`,
    // );

    // Si todo salió bien (al menos intentamos todo), mostramos éxito un momento
    if (failedDownloads === 0) {
      isSyncSuccess.value = playlistId;
    } else {
      // console.warn(
      // `[DIAGNOSTICO] Sync had errors, NOT showing success checkmark.`,
      // );
    }

    // Esperamos 1.5 segundos para que el usuario vea el éxito
    setTimeout(async () => {
      // Al terminar, primero actualizamos el sync de esta playlist en el modal
      const syncIdx = pendingSpotifySyncs.value.findIndex(
        (s) => s.playlistId === playlistId,
      );
      if (syncIdx !== -1) {
        // Quitamos las nuevas que ya bajamos correctamente
        pendingSpotifySyncs.value[syncIdx].newTracks =
          pendingSpotifySyncs.value[syncIdx].newTracks.filter(
            (t) => t.status !== "done",
          );

        // Si ya no queda nada que hacer (ni altas ni bajas), quitamos el modal definitivamente
        if (
          pendingSpotifySyncs.value[syncIdx].newTracks.length === 0 &&
          pendingSpotifySyncs.value[syncIdx].removedTracks.length === 0
        ) {
          await acknowledgeSpotifySync(playlistId, { synced: remoteIds });
          pendingSpotifySyncs.value = pendingSpotifySyncs.value.filter(
            (s) => s.playlistId !== playlistId,
          );
        }
      }

      // SOLO AL FINAL, y tras un brevísimo respiro para que vue procese el cierre, reseteamos el éxito
      await nextTick();
      isSyncSuccess.value = null;
    }, 1500);
  };

  const applyRemovedTracksSync = async (
    playlistId: number,
    trackPaths: string[],
    remoteIds: string[],
  ) => {
    const p = playlists.value.find((item) => item.id === playlistId);
    if (!p) return;

    const globalDeleteRequest = deleteSyncTracksWithFiles.value;
    const playlistName = p.name;

    // console.log(
    // `[SpotifySync] Removing ${trackPaths.length} tracks from "${p.name}"... (Physical: ${globalDeleteRequest})`,
    // );

    for (const path of trackPaths) {
      try {
        let currentPath = path;

        // NIVEL 2: RECONCILIACIÓN INTELIGENTE (BÚSQUEDA EN DISCO)
        try {
          const reconciledPath = await invoke<string | null>(
            "try_reconcile_physical_path",
            {
              playlistId,
              currentPath,
            },
          );
          if (reconciledPath) {
            currentPath = reconciledPath;
          }
        } catch (e) {
          // console.warn("[SpotifySync] Error reconciling track:", currentPath);
        }

        // Si la canción borrada es la que está sonando, saltamos a la siguiente
        if (filePath.value === currentPath && isPlaying.value) {
          await playNextTrack();
        }

        // NIVEL 1: CHEQUEO DE PERTENENCIA FÍSICA (FOLDER NAME)
        let actuallyPhysical = false;
        const normalizedPath = currentPath.replace(/\\/g, "/");
        const parts = normalizedPath.split("/");
        if (parts.length >= 2) {
          const parentFolder = parts[parts.length - 2].trim().toLowerCase();
          const targetName = playlistName.trim().toLowerCase();
          if (parentFolder === targetName) {
            actuallyPhysical = true;
          }
        }

        // EJECUCIÓN DEL BORRADO CON LA LÓGICA INTELIGENTE APLICADA
        const shouldDeleteFiles = globalDeleteRequest && actuallyPhysical;

        await invoke("remove_track_from_playlist", {
          playlistId: playlistId,
          trackPath: currentPath,
          deleteFiles: shouldDeleteFiles,
        });
      } catch (e) {
        // console.error(`[SpotifySync] Error removing ${path}`, e);
      }
    }

    // Sincronización inmediata para que los cambios se vean al cerrar el modal
    await syncLibrary();

    // Al terminar, activamos el estado de éxito para el feedback visual
    isSyncSuccess.value = playlistId;

    // Esperamos 1.5 segundos para que el usuario vea el éxito
    setTimeout(async () => {
      const syncIdx = pendingSpotifySyncs.value.findIndex(
        (s) => s.playlistId === playlistId,
      );
      if (syncIdx !== -1) {
        // Quitamos las borradas de la lista
        pendingSpotifySyncs.value[syncIdx].removedTracks = [];

        // Si ya no queda nada que hacer, quitamos el modal definitivamente
        if (pendingSpotifySyncs.value[syncIdx].newTracks.length === 0) {
          // Recuperamos el estado actual para no borrar los ignorados
          let syncState: any = { synced: [], ignoredRemovals: [] };
          try {
            const parsed = JSON.parse(p.spotifySyncedIds || "{}");
            syncState = Array.isArray(parsed)
              ? { synced: parsed, ignoredRemovals: [] }
              : parsed;
          } catch (e) {}

          await acknowledgeSpotifySync(playlistId, {
            ...syncState,
            synced: remoteIds,
          });
          pendingSpotifySyncs.value = pendingSpotifySyncs.value.filter(
            (s) => s.playlistId !== playlistId,
          );
        }
      }

      await nextTick();
      isSyncSuccess.value = null;
      deleteSyncTracksWithFiles.value = false;
      await loadPlaylists();
    }, 1500);
  };

  const ignoreNewTracksSync = async (playlistId: number, _tracks: any[]) => {
    try {
      const p = playlists.value.find((item) => item.id === playlistId);
      if (!p) return;

      const syncObj = pendingSpotifySyncs.value.find(
        (s) => s.playlistId === playlistId,
      );
      if (!syncObj) return;

      // Leemos el estado actual
      let syncState: {
        synced?: string[];
        ignoredRemovals?: string[];
        lastSnapshotId?: string | null;
      } = { synced: [], ignoredRemovals: [] };
      try {
        const parsed = JSON.parse(p.spotifySyncedIds || "{}");
        if (Array.isArray(parsed)) {
          syncState.synced = parsed;
        } else {
          syncState = { ...syncState, ...parsed };
        }
      } catch (e) {}

      // Marcamos TODOS los tracks remotos actuales como "vistos" (usando sus claves únicas de instancia)
      // y guardamos el snapshot actual de Spotify
      await acknowledgeSpotifySync(playlistId, {
        synced: syncObj.remoteInstanceKeys || [],
        ignoredRemovals: syncState.ignoredRemovals || [],
        lastSnapshotId: syncObj.remoteSnapshotId,
      });
      await loadPlaylists();

      // Actualizamos UI reactivamente
      const syncIdx = pendingSpotifySyncs.value.findIndex(
        (s) => s.playlistId === playlistId,
      );
      if (syncIdx !== -1) {
        pendingSpotifySyncs.value[syncIdx].newTracks = [];
        if (pendingSpotifySyncs.value[syncIdx].removedTracks.length === 0) {
          pendingSpotifySyncs.value = pendingSpotifySyncs.value.filter(
            (s) => s.playlistId !== playlistId,
          );
        }
      }
    } catch (e) {
      // console.error("[SpotifySync] Error ignoring new tracks", e);
    }
  };

  const ignoreRemovedTracksSync = async (
    playlistId: number,
    trackPaths: string[],
  ) => {
    try {
      const p = playlists.value.find((item) => item.id === playlistId);
      if (!p) return;

      const syncObj = pendingSpotifySyncs.value.find(
        (s) => s.playlistId === playlistId,
      );

      // Leemos el estado actual
      let syncState: {
        synced?: string[];
        ignoredRemovals?: string[];
        lastSnapshotId?: string | null;
      } = { synced: [], ignoredRemovals: [] };
      try {
        const parsed = JSON.parse(p.spotifySyncedIds || "{}");
        if (Array.isArray(parsed)) {
          syncState.synced = parsed;
        } else {
          syncState = { ...syncState, ...parsed };
        }
      } catch (e) {}

      // Obtenemos los spotify_ids de esos paths
      const metadata = await invoke<any[]>("get_library_metadata_batch", {
        paths: trackPaths,
      });
      const ignoredIds = metadata.map((m) => m.spotify_id).filter((id) => !!id);

      // Los añadimos a la lista de "ignorados para borrado"
      const updatedIgnored = [
        ...new Set([...(syncState.ignoredRemovals || []), ...ignoredIds]),
      ];

      await acknowledgeSpotifySync(playlistId, {
        ...syncState,
        ignoredRemovals: updatedIgnored,
        lastSnapshotId: syncObj?.remoteSnapshotId || syncState.lastSnapshotId,
      });
      await loadPlaylists();

      // Actualizamos UI reactivamente
      const syncIdx = pendingSpotifySyncs.value.findIndex(
        (s) => s.playlistId === playlistId,
      );
      if (syncIdx !== -1) {
        pendingSpotifySyncs.value[syncIdx].removedTracks =
          pendingSpotifySyncs.value[syncIdx].removedTracks.filter(
            (t) => !trackPaths.includes(t.path),
          );
        if (
          pendingSpotifySyncs.value[syncIdx].newTracks.length === 0 &&
          pendingSpotifySyncs.value[syncIdx].removedTracks.length === 0
        ) {
          pendingSpotifySyncs.value = pendingSpotifySyncs.value.filter(
            (s) => s.playlistId !== playlistId,
          );
        }
      }
    } catch (e) {
      // console.error("[SpotifySync] Error ignoring removed tracks", e);
    }
  };

  const ignoreSpotifySync = async (playlistId: number, remoteIds: string[]) => {
    // Marcamos el estado actual como "visto completo" en la DB
    try {
      await acknowledgeSpotifySync(playlistId, {
        synced: remoteIds,
        ignoredRemovals: [],
      });
      pendingSpotifySyncs.value = pendingSpotifySyncs.value.filter(
        (s) => s.playlistId !== playlistId,
      );
    } catch (e) {
      // console.error("[SpotifySync] Error ignoring sync", e);
    }
  };

  const getLibraryTrackMetadata = (track: PlaylistTrack) => {
    return libraryMetadataMap.value[track.path] ?? null;
  };

  const getLibraryTrackArtist = (track: PlaylistTrack) => {
    const artist = getLibraryTrackMetadata(track)?.artist;
    return formatMetadataListValue(artist) || "Artista desconocido";
  };

  const getLibraryTrackAlbum = (track: PlaylistTrack) => {
    const album = getLibraryTrackMetadata(track)?.album;
    return formatMetadataListValue(album) || "—";
  };

  const formatMetadataListValue = (value?: string | null) => {
    if (!value) return "";

    return value
      .replace(/semicolon/gi, "; ")
      .replace(/comma/gi, ", ")
      .replace(/\s*;\s*/g, "; ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s{2,}/g, " ")
      .trim();
  };

  const getLibraryTrackDuration = (track: PlaylistTrack) => {
    return getLibraryTrackMetadata(track)?.duration_formatted || "—";
  };

  const getLibraryTrackCover = (track: PlaylistTrack) => {
    return getLibraryTrackMetadata(track)?.cover_art?.data_url || null;
  };

  const preloadLibraryMetadata = async (tracks: PlaylistTrack[]) => {
    if (!tracks.length) {
      pendingLibraryMetadataPaths.clear();
      libraryMetadataMap.value = {};
      return;
    }

    const trackMap = new Map(tracks.map((track) => [track.path, track]));
    void trackMap;
    for (const track of tracks) {
      if (!libraryMetadataMap.value[track.path]) {
        pendingLibraryMetadataPaths.add(track.path);
      }
    }

    if (libraryMetadataInFlight || pendingLibraryMetadataPaths.size === 0) {
      return;
    }

    libraryMetadataInFlight = true;
    loadingLibraryMetadata.value = true;

    let metadataStartedAt = 0;
    try {
      while (pendingLibraryMetadataPaths.size > 0) {
        metadataStartedAt = performance.now();
        const pathsToLoad = Array.from(pendingLibraryMetadataPaths);
        pendingLibraryMetadataPaths.clear();

        // console.log("[Library][metadata:start]", {
        // tracks: tracks.length,
        // requested: pathsToLoad.length,
        // });
        const rows = await invoke<LibraryTrackMetadataLiteRow[]>(
          "get_library_metadata_batch",
          {
            paths: pathsToLoad,
          },
        );

        const nextMap: Record<string, LibraryTrackMetadata> = {
          ...libraryMetadataMap.value,
        };

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
            album_artist:
              row.album_artist || row.artist || "Artista desconocido",
            year: row.year || null,
            duration_seconds: Number(row.duration_seconds || 0),
            duration_formatted:
              row.duration_formatted ||
              formatTime(Number(row.duration_seconds || 0)),

            // Asignamos la URL nativa súper rápida en lugar de anularla a null
            cover_art: coverUrl ? { data_url: coverUrl } : null,

            track_number: row.track_number ?? null,
            spotify_id: row.spotify_id ?? null, // <-- NUEVO
          };
        }

        libraryMetadataMap.value = nextMap;
        // console.log("[Library][metadata:end]", {
        // tracks: tracks.length,
        // rows: rows.length,
        // durationMs: Math.round(performance.now() - metadataStartedAt),
        // });
      }
    } catch (error) {
      // console.error(
      // "Error cargando metadata de biblioteca desde SQLite:",
      // error,
      // );
      // console.error("[Library][metadata:error]", {
      // tracks: tracks.length,
      // durationMs: Math.round(performance.now() - metadataStartedAt),
      // error,
      // });

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
      libraryMetadataInFlight = false;
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
      // console.error("Error al sincronizar posición:", error);
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
      // console.error("Error al limpiar la pista actual:", error);
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

    const baseName = stripInternalSpotiFlacDuplicateSuffix(
      track.fileName.replace(new RegExp(`\\.${track.extension}$`, "i"), ""),
    );

    resetCanvas();

    // RESOLUCIÓN DE CANVAS (UNIFICADO VS PERSONALIZADO)
    let videoPath = "";
    if (assetStorageMode.value === "unified" && track.path) {
      // En la misma carpeta que la canción
      const trackDir = track.path.substring(
        0,
        track.path.lastIndexOf("\\") + 1,
      );
      videoPath = `${trackDir}${baseName}.mp4`;
    } else if (customCanvasPath.value) {
      // En la carpeta personalizada
      videoPath = `${customCanvasPath.value}\\${baseName}.mp4`;
    } else {
      // Fallback antiguo
      videoPath = `C:\\Users\\jhonj\\Videos\\CANVAS SPOT\\${baseName}.mp4`;
    }

    canvasUrl.value = convertFileSrc(videoPath);

    try {
      metadata.value = await invoke<AudioMetadata>("leer_metadata", {
        path: track.path,
        customLyricsPath:
          assetStorageMode.value === "custom" ? customLyricsPath.value : null,
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
      // console.error("Error al leer metadata:", error);
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
      // console.error("Error al reproducir en Rust:", error);
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
      // console.error("Error al cambiar estado de reproducción:", error);
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
      // console.error("Error al intentar saltar en el audio:", error);
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
    queueConsumedHistory: queueConsumedHistory.value.map(
      buildSessionQueueTrack,
    ),
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
    assetStorageMode: assetStorageMode.value,
    customCanvasPath: customCanvasPath.value,
    customLyricsPath: customLyricsPath.value,
    customCoversPath: customCoversPath.value,
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
        const realIndex = playlist.value.findIndex(
          (item) => item.path === path,
        );

        if (realIndex >= 0 && queue.value.length === 0) {
          await loadTrack({
            source: "library",
            index: realIndex,
            autoplay,
            startAt,
          });
          return;
        }

        replaceQueueWithTrack(
          track,
          createPlaybackContext("library", "Biblioteca"),
        );
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
        if (
          typeof enabled === "boolean" &&
          enabled !== isShuffleEnabled.value
        ) {
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
      // console.warn("No se pudieron leer comandos Desktop Connect:", error);
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
      // console.warn("No se pudo cargar Desktop Connect:", error);
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
    if (!track) return "Móvil";
    return getTrackDisplayTitle(track);
  });

  const connectPlaybackDeviceLabel = computed(() =>
    isMobileConnectActive.value
      ? "Teléfono"
      : (outputDeviceInfo.value?.device_name ?? desktopDeviceName.value),
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
      replaceQueueWithTrack(
        track,
        createPlaybackContext("library", "Biblioteca"),
      );
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

      if (session.assetStorageMode)
        assetStorageMode.value = session.assetStorageMode;
      if (session.customCanvasPath)
        customCanvasPath.value = session.customCanvasPath;
      if (session.customLyricsPath)
        customLyricsPath.value = session.customLyricsPath;
      if (session.customCoversPath)
        customCoversPath.value = session.customCoversPath;

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
      queueOriginalOrderIds.value = (
        session.queueOriginalOrderIds ?? []
      ).filter((queueId) => validQueueIds.has(queueId));

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
      // console.log("[playlist-dnd] suppressed-post-drag-click");
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
    const startBoot = performance.now();
    // console.log("[Boot] onMounted started");

    installSpotiFlacHost();
    installPerformanceDiagnostics();
    // installPerformanceDiagnostics();
    updateSpotiFlacConnectivityStatus();
    await nextTick();
    await waitForNextPaint();

    // console.log("[Boot] Basic setup took:", performance.now() - startBoot);

    try {
      const startListeners = performance.now();
      unlistenFsChanges = await listen("library-updated", () => {
        scheduleLibrarySync();
      });

      // ======== NUEVO ========
      // Escuchamos el evento desde Rust cuando el dispositivo cambia automáticamente
      unlistenDeviceChanged = await listen("audio-device-changed", () => {
        // console.log("🔄 Dispositivo de audio cambiado. Actualizando UI...");
        void fetchOutputDeviceInfo();
      });
      // =======================
      // console.log(
      //   "[Boot] Listeners took:",
      //   performance.now() - startListeners,
      // );

      const startHardware = performance.now();
      await fetchComputerName();
      await fetchOutputDeviceInfo();
      // console.log(
      //   "[Boot] Hardware info took:",
      //   performance.now() - startHardware,
      // );

      const startPlaylists = performance.now();
      await loadPlaylists();
      // console.log(
      //   "[Boot] Playlists took:",
      //   performance.now() - startPlaylists,
      // );

      const startSession = performance.now();
      const savedAppSession = await loadAppSession();
      hasPendingAppSessionRestore = Boolean(
        savedAppSession?.currentTrackPath || savedAppSession?.queue?.length,
      );
      recentGlobalSearches.value = normalizeRecentGlobalSearches(
        await loadRecentGlobalSearches(),
      );
      // console.log(
      //   "[Boot] Session load took:",
      //   performance.now() - startSession,
      // );

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
        const startDirs = performance.now();
        const savedDirectories = await invoke<string[]>(
          "get_music_directories",
        );

        musicDirectories.value = savedDirectories;
        console.log("[LibraryDebug][boot:directories]", {
          savedDirectories,
        });
        // console.log(
        //   "[Boot] Directories load took:",
        //   performance.now() - startDirs,
        // );

        if (musicDirectories.value.length > 0) {
          const startLibrary = performance.now();
          // console.log("[Boot] Starting library sync...");
          await syncLibrary();
          // console.log(
          //   "[Boot] Library sync took:",
          //   performance.now() - startLibrary,
          // );

          // ======== NUEVO ========
          void checkSpotifyPlaylistsForUpdates();
          // Revisar cada 15 minutos mientras la app está abierta
          setInterval(
            () => {
              void checkSpotifyPlaylistsForUpdates();
            },
            15 * 60 * 1000,
          );
          // =======================
          await invoke("watch_directories", {
            directories: musicDirectories.value,
          });
        }
      } catch (error) {
        // console.error("Error al cargar rutas guardadas:", error);
      }

      const startRestore = performance.now();
      await restoreAppSession(savedAppSession);
      hasPendingAppSessionRestore = false;
      // console.log(
      //   "[Boot] Restore session took:",
      //   performance.now() - startRestore,
      // );

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
      // console.log(
      //   "[Boot] Total onMounted time:",
      //   performance.now() - startBoot,
      // );
    }
  });

  onBeforeUnmount(() => {
    void persistAppSessionNow();
    stopProgress();
    // invoke("stop_audio_backend").catch(console.error);
    pendingTrackPointerDrag = null;
    removePendingTrackPointerListeners();
    cleanupTrackDragState();
    if (playlistAddToastTimeoutId != null) {
      window.clearTimeout(playlistAddToastTimeoutId);
      playlistAddToastTimeoutId = null;
    }
    if (librarySyncTimer != null) {
      window.clearTimeout(librarySyncTimer);
      librarySyncTimer = null;
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
    if (performanceObserver) {
      performanceObserver.disconnect();
      performanceObserver = null;
    }
    if (performanceLagInterval != null) {
      window.clearInterval(performanceLagInterval);
      performanceLagInterval = null;
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
    trackPendingDeletion,
    deleteTrackWithFiles,
    deleteSyncTracksWithFiles,
    confirmDeleteTrack,
    closeTrackDeleteModal,
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
    deletePlaylistWithFiles,
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
    formatMetadataListValue,
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
    assetStorageMode,
    customCanvasPath,
    customLyricsPath,
    customCoversPath,
    selectCustomCanvasPath,
    selectCustomLyricsPath,
    selectCustomCoversPath,
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
    checkSpecificSpotifyPlaylist,
    manualForceSync,
    orderPlaylistFromSpotify,
    isManualSyncing,
    isSpotifyOrdering,
    isSyncDownloading,
    isSyncSuccess,
    activePlaylistSync,
    activePendingSpotifySync,
    activePendingNewTrackIds,
    activePendingRemovedTrackPaths,
    syncNewTracksListRef,
    syncRemovedTracksListRef,
    onSyncNewTracksScroll,
    onSyncRemovedTracksScroll,
    virtualNewTracksWindow,
    virtualRemovedTracksWindow,
    pendingSpotifySyncs,
    selectedRemovedTracks,
    selectedNewTracks,
    isBulkSelectingNewTracks,
    isBulkSelectingRemovedTracks,
    isRemovedTrackSelected,
    isNewTrackSelected,
    areAllNewTracksSelected,
    areAllRemovedTracksSelected,
    toggleRemovedTrackSelection,
    toggleNewTrackSelection,
    setAllNewTracksSelection,
    setAllRemovedTracksSelection,
    applySpotifySync,
    applyNewTracksSync,
    applyRemovedTracksSync,
    ignoreNewTracksSync,
    ignoreRemovedTracksSync,
    sessionDismissedNuevas,
    sessionDismissedBajas,
    discardSpotifySync,
    closeSyncModalSoft,
    ignoreSpotifySync,
    multiSelectedLibraryTracks,
    addSelectionToQueue,
    addSelectionToPlaylist,
    openLibraryTrackContextMenu,
    likedSongsPlaylist,
    isLiked,
    toggleTrackLike,
    refreshPlaylistRecommendations,
  };
}
