import { backend } from "../models";
import { emitCompatEvent } from "../../runtime/runtime";

type AnyRecord = Record<string, any>;

const DEFAULT_DOWNLOAD_PATH = "C:\\Music\\SpotiFLAC";
const SETTINGS_KEY = "spotiflac-settings";
const SPOTFETCH_API_URL = "https://sp.afkarxyz.qzz.io/api";
const FETCH_HISTORY_KEY = "spotiflac-fetch-history";
const DOWNLOAD_HISTORY_KEY = "spotiflac-download-history";

type SpotiFlacHostInfo = {
  defaultDownloadPath: string;
  configPath: string;
};

type SpotiFlacHost = {
  invoke: (method: string, payload?: AnyRecord) => Promise<any>;
};

function getStoredSettings(): AnyRecord {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return GetDefaults();
  }

  try {
    return { ...GetDefaults(), ...JSON.parse(raw) };
  } catch {
    return GetDefaults();
  }
}

function getHost(): SpotiFlacHost | null {
  const currentWindow = window as Window & {
    __spotiflacHost?: SpotiFlacHost;
    parent: Window & { __spotiflacHost?: SpotiFlacHost };
  };

  if (currentWindow.__spotiflacHost) {
    return currentWindow.__spotiflacHost;
  }

  try {
    if (currentWindow.parent && currentWindow.parent !== currentWindow && currentWindow.parent.__spotiflacHost) {
      return currentWindow.parent.__spotiflacHost;
    }
  } catch {}

  return null;
}

async function invokeHost<T>(method: string, payload?: AnyRecord): Promise<T> {
  const host = getHost();
  if (!host) {
    throw new Error("SpotiFLAC host bridge is not available");
  }

  return host.invoke(method, payload) as Promise<T>;
}

function readStorageArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeStorageArray<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

function sanitizeFilename(value: string): string {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFirstArtistName(artistString: string): string {
  const raw = String(artistString || "").trim();
  if (!raw) return "";
  const delimiters = [", ", " & ", " feat. ", " ft. ", " featuring "];

  const lower = raw.toLowerCase();
  for (const delimiter of delimiters) {
    const index = lower.indexOf(delimiter);
    if (index !== -1) {
      return raw.slice(0, index).trim();
    }
  }

  return raw;
}

function replaceTemplate(template: string, values: Record<string, string | number | undefined | null>): string {
  let result = template || "{title}";

  for (const [key, value] of Object.entries(values)) {
    const replacement = value == null ? "" : String(value);
    result = result.replaceAll(`{${key}}`, replacement);
  }

  return sanitizeFilename(result);
}

function trackNumberPrefix(includeTrackNumber: boolean, position: number): string {
  if (!includeTrackNumber || !position || position <= 0) return "";
  return `${String(position).padStart(2, "0")}. `;
}

function buildLyricsFilePath(req: AnyRecord): string {
  const filenameFormat = typeof req.filename_format === "string" && req.filename_format.trim()
    ? req.filename_format
    : "{title}";
  const baseName = replaceTemplate(filenameFormat, {
    title: req.track_name,
    artist: req.artist_name,
    album: req.album_name,
    album_artist: req.album_artist || req.artist_name,
    track: req.position ? String(req.position).padStart(2, "0") : "",
    disc: req.disc_number ? String(req.disc_number).padStart(2, "0") : "",
    year: typeof req.release_date === "string" ? req.release_date.slice(0, 4) : "",
    date: req.release_date || "",
  });
  const prefix = trackNumberPrefix(Boolean(req.track_number), Number(req.position || 0));
  const filename = sanitizeFilename(`${prefix}${baseName}`) || "lyrics";
  return `${String(req.output_dir || "").replace(/[\\/]+$/, "")}\\${filename}.lrc`;
}

function buildImageFilePath(req: AnyRecord, suffix = ""): string {
  const filenameFormat = typeof req.filename_format === "string" && req.filename_format.trim()
    ? req.filename_format
    : "{title}";
  const baseName = replaceTemplate(filenameFormat, {
    title: req.track_name || req.artist_name || "image",
    artist: req.artist_name || "",
    album: req.album_name || "",
    album_artist: req.album_artist || req.artist_name || "",
    track: req.position ? String(req.position).padStart(2, "0") : "",
    disc: req.disc_number ? String(req.disc_number).padStart(2, "0") : "",
    year: typeof req.release_date === "string" ? req.release_date.slice(0, 4) : "",
    date: req.release_date || "",
  });
  const prefix = trackNumberPrefix(Boolean(req.track_number), Number(req.position || 0));
  const filename = sanitizeFilename(`${prefix}${baseName}${suffix}`) || "cover";
  return `${String(req.output_dir || "").replace(/[\\/]+$/, "")}\\${filename}.jpg`;
}

function linesToLrc(lines: Array<{ startTimeMs?: string; words?: string }>): string {
  return lines
    .map((line) => {
      const text = String(line.words || "").trim();
      if (!text) return "";

      const ms = Number(line.startTimeMs || 0);
      const totalSeconds = Math.max(0, Math.floor(ms / 1000));
      const centiseconds = Math.max(0, Math.floor((ms % 1000) / 10));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}]${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

async function fetchLyricsFromLrclib(trackName: string, artistName: string, albumName = ""): Promise<string> {
  const exactUrl = new URL("https://lrclib.net/api/get");
  exactUrl.searchParams.set("artist_name", artistName);
  exactUrl.searchParams.set("track_name", trackName);
  if (albumName) {
    exactUrl.searchParams.set("album_name", albumName);
  }

  const exactResponse = await fetch(exactUrl.toString(), {
    headers: { accept: "application/json" },
  });

  if (exactResponse.ok) {
    const payload = await exactResponse.json();
    const synced = String(payload?.syncedLyrics || "").trim();
    const plain = String(payload?.plainLyrics || "").trim();
    if (synced) return synced;
    if (plain) return plain;
  }

  const searchUrl = new URL("https://lrclib.net/api/search");
  searchUrl.searchParams.set("artist_name", artistName);
  searchUrl.searchParams.set("track_name", trackName);
  const searchResponse = await fetch(searchUrl.toString(), {
    headers: { accept: "application/json" },
  });

  if (!searchResponse.ok) {
    throw new Error(`LRCLIB returned HTTP ${searchResponse.status}`);
  }

  const items = await searchResponse.json();
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No lyrics found");
  }

  const best = items.find((item) => item?.syncedLyrics) ?? items.find((item) => item?.plainLyrics) ?? items[0];
  const synced = String(best?.syncedLyrics || "").trim();
  const plain = String(best?.plainLyrics || "").trim();
  if (synced) return synced;
  if (plain) return plain;
  throw new Error("No lyrics found");
}

async function saveRemoteBinary(url: string, destinationPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  await invokeHost("writeBinaryFile", {
    path: destinationPath,
    base64Data: btoa(binary),
  });
}

async function getHostInfo(): Promise<SpotiFlacHostInfo> {
  return invokeHost<SpotiFlacHostInfo>("getHostInfo");
}

function parseSpotifyUrl(url: string): { type: string; id: string } | null {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;

  const uriMatch = trimmed.match(/^spotify:(track|album|playlist|artist):([A-Za-z0-9]+)$/i);
  if (uriMatch) {
    return { type: uriMatch[1].toLowerCase(), id: uriMatch[2] };
  }

  try {
    const parsed = new URL(trimmed);
    const parts = parsed.pathname.split("/").filter(Boolean);
    for (let index = 0; index < parts.length - 1; index += 1) {
      const type = parts[index].toLowerCase();
      if (["track", "album", "playlist", "artist"].includes(type)) {
        return { type, id: parts[index + 1] };
      }
    }
  } catch {}

  return null;
}

function durationToMs(duration: unknown): number {
  if (typeof duration === "number") return duration;
  if (typeof duration !== "string") return 0;

  const parts = duration.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return ((parts[0] * 60 * 60) + (parts[1] * 60) + parts[2]) * 1000;
  return 0;
}

async function fetchSpotFetchData(url: string): Promise<any> {
  const entity = parseSpotifyUrl(url);
  if (!entity) {
    throw new Error("Invalid Spotify URL");
  }

  const settings = getStoredSettings();
  const apiBaseUrl = String(settings.spotFetchAPIUrl || SPOTFETCH_API_URL).replace(/\/+$/, "");
  const response = await fetch(`${apiBaseUrl}/${entity.type}/${entity.id}`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`SpotFetch API returned HTTP ${response.status}`);
  }

  return response.json();
}

function normalizeSpotFetchPayload(url: string, data: any): any {
  const entity = parseSpotifyUrl(url);
  if (!entity) return data;

  if (entity.type === "track" && data?.track) return data;
  if (entity.type === "album" && data?.album_info) return data;
  if (entity.type === "playlist" && data?.playlist_info) return data;
  if (entity.type === "artist" && data?.artist_info) return data;

  if (entity.type === "track") {
    const cover = data?.cover?.small || data?.cover?.medium || data?.cover?.large || data?.cover || "";
    return {
      track: {
        spotify_id: data?.id || entity.id,
        artists: data?.artists || data?.artist || "",
        name: data?.name || data?.title || "Cancion de Spotify",
        album_name: data?.album?.name || data?.album || "",
        album_artist: data?.album?.artists || data?.artists || "",
        duration_ms: durationToMs(data?.duration),
        images: cover,
        release_date: data?.album?.released || data?.releaseDate || data?.released || "",
        track_number: data?.track || data?.track_number || 0,
        total_tracks: data?.album?.tracks || data?.total_tracks || 0,
        disc_number: data?.disc || data?.disc_number || 0,
        total_discs: data?.discs || data?.total_discs || 0,
        external_urls: `https://open.spotify.com/track/${data?.id || entity.id}`,
        copyright: data?.copyright || "",
        publisher: data?.album?.label || data?.label || "",
        plays: data?.plays || "",
        preview_url: data?.preview_url || "",
        is_explicit: Boolean(data?.is_explicit),
      },
    };
  }

  if (entity.type === "album") {
    const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
    return {
      album_info: {
        total_tracks: data?.count || tracks.length || 0,
        name: data?.name || "Album de Spotify",
        release_date: data?.releaseDate || data?.released || "",
        artists: data?.artists || "",
        images: data?.cover || "",
        artist_id: "",
        artist_url: "",
      },
      track_list: tracks.map((track: any, index: number) => ({
        spotify_id: track?.id || "",
        artists: track?.artists || data?.artists || "",
        name: track?.name || track?.title || `Track ${index + 1}`,
        album_name: data?.name || "",
        album_artist: data?.artists || "",
        duration_ms: durationToMs(track?.duration),
        images: data?.cover || "",
        release_date: data?.releaseDate || "",
        track_number: index + 1,
        total_tracks: data?.count || tracks.length,
        disc_number: track?.disc_number || 0,
        total_discs: data?.discs?.totalCount || 0,
        external_urls: `https://open.spotify.com/track/${track?.id || ""}`,
        album_id: data?.id || entity.id,
        album_url: `https://open.spotify.com/album/${data?.id || entity.id}`,
        plays: track?.plays || "",
        is_explicit: Boolean(track?.is_explicit),
      })),
    };
  }

  if (entity.type === "playlist") {
    const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
    return {
      playlist_info: {
        tracks: { total: data?.count || tracks.length || 0 },
        followers: { total: data?.followers || 0 },
        owner: {
          display_name: data?.owner?.name || data?.owner || "",
          name: data?.name || "Playlist de Spotify",
          images: data?.owner?.avatar || "",
        },
        cover: data?.cover || "",
        description: data?.description || "",
      },
      track_list: tracks.map((track: any) => ({
        spotify_id: track?.id || "",
        artists: track?.artist || track?.artists || "",
        name: track?.title || track?.name || "",
        album_name: track?.album || "",
        album_artist: track?.albumArtist || "",
        duration_ms: durationToMs(track?.duration),
        images: track?.cover || "",
        release_date: "",
        track_number: 0,
        total_tracks: 0,
        disc_number: track?.disc_number || 0,
        total_discs: 0,
        external_urls: `https://open.spotify.com/track/${track?.id || ""}`,
        album_id: track?.albumId || "",
        album_url: track?.albumId ? `https://open.spotify.com/album/${track.albumId}` : "",
        plays: track?.plays || "",
        status: track?.status || "",
        is_explicit: Boolean(track?.is_explicit),
      })),
    };
  }

  if (entity.type === "artist") {
    const albums = data?.discography?.all || data?.albums || [];
    return {
      artist_info: {
        name: data?.name || data?.profile?.name || "Artista de Spotify",
        followers: data?.stats?.followers || 0,
        genres: data?.genres || [],
        images: data?.avatar || "",
        header: data?.header || "",
        gallery: data?.gallery || [],
        external_urls: `https://open.spotify.com/artist/${data?.id || entity.id}`,
        discography_type: "all",
        total_albums: data?.discography?.total || albums.length || 0,
        biography: data?.profile?.biography || "",
        verified: Boolean(data?.profile?.verified),
        listeners: data?.stats?.listeners || 0,
        rank: data?.stats?.rank || 0,
      },
      album_list: albums.map((album: any) => ({
        id: album?.id || "",
        name: album?.name || "",
        album_type: album?.type || "album",
        release_date: album?.date || "",
        total_tracks: album?.total_tracks || album?.totalTracks || 0,
        artists: data?.name || "",
        images: album?.cover || "",
        external_urls: `https://open.spotify.com/album/${album?.id || ""}`,
      })),
      track_list: [],
    };
  }

  return data;
}

function placeholderMetadata(url: string): string {
  const entity = parseSpotifyUrl(url);

  if (!entity) {
    return JSON.stringify({
      error: "Pega un enlace de Spotify para preparar la migracion de metadata.",
    });
  }

  const commonImage = "";
  const external_urls = `https://open.spotify.com/${entity.type}/${entity.id}`;

  if (entity.type === "album") {
    return JSON.stringify({
      album_info: {
        spotify_id: entity.id,
        name: "Album de Spotify",
        artists: "SpotiFLAC",
        images: commonImage,
        total_tracks: 0,
        release_date: "",
        external_urls,
      },
      track_list: [],
    });
  }

  if (entity.type === "playlist") {
    return JSON.stringify({
      playlist_info: {
        spotify_id: entity.id,
        owner: { name: "Playlist de Spotify", images: commonImage },
        tracks: { total: 0 },
        cover: commonImage,
        external_urls,
      },
      track_list: [],
    });
  }

  if (entity.type === "artist") {
    return JSON.stringify({
      artist_info: {
        spotify_id: entity.id,
        name: "Artista de Spotify",
        images: commonImage,
        total_albums: 0,
        external_urls,
      },
      album_list: [],
      track_list: [],
    });
  }

  return JSON.stringify({
    track: {
      spotify_id: entity.id,
      name: "Cancion de Spotify",
      artists: "SpotiFLAC",
      album_name: "Metadata pendiente de migrar",
      album_artist: "SpotiFLAC",
      images: commonImage,
      duration_ms: 0,
      release_date: "",
      external_urls,
    },
  });
}

function okResponse(extra: AnyRecord = {}): AnyRecord {
  return { success: true, error: "", ...extra };
}

function emptyQueue(): backend.DownloadQueueInfo {
  return new backend.DownloadQueueInfo({
    queue: [],
    queued_count: 0,
    completed_count: 0,
    failed_count: 0,
    skipped_count: 0,
    total_downloaded: 0,
    current_speed: 0,
    session_start_time: 0,
  });
}

export async function GetSpotifyMetadata(req: AnyRecord): Promise<string> {
  const url = req?.url ?? "";

  try {
    const data = normalizeSpotFetchPayload(url, await fetchSpotFetchData(url));
    emitCompatEvent("metadata-stream", data);
    return JSON.stringify(data);
  } catch (error) {
    console.warn("SpotFetch metadata failed, using placeholder metadata.", error);
    return placeholderMetadata(url);
  }
}

export async function SearchSpotify(): Promise<backend.SearchResponse> {
  return new backend.SearchResponse({
    tracks: [],
    albums: [],
    artists: [],
    playlists: [],
  });
}

export async function SearchSpotifyByType(): Promise<backend.SearchResult[]> {
  return [];
}

export async function DownloadTrack(): Promise<AnyRecord> {
  return okResponse({ skipped: true, message: "Descarga pendiente de migrar a Tauri." });
}

export async function DownloadLyrics(request: AnyRecord): Promise<AnyRecord> {
  if (!request?.track_name || !request?.artist_name || !request?.output_dir) {
    return { success: false, error: "Missing lyrics download parameters" };
  }

  const filePath = buildLyricsFilePath(request);
  const alreadyExists = await invokeHost<boolean>("fileExists", { path: filePath });
  if (alreadyExists) {
    return okResponse({ file: filePath, already_exists: true, message: "Lyrics file already exists" });
  }

  const lyrics = await fetchLyricsFromLrclib(
    String(request.track_name),
    String(request.artist_name),
    String(request.album_name || ""),
  );

  await invokeHost("writeTextFile", {
    path: filePath,
    contents: lyrics,
  });

  return okResponse({ file: filePath, message: "Lyrics downloaded successfully" });
}

export async function DownloadCover(request: AnyRecord): Promise<AnyRecord> {
  if (!request?.cover_url || !request?.output_dir) {
    return { success: false, error: "Missing cover download parameters" };
  }

  const filePath = buildImageFilePath(request);
  const alreadyExists = await invokeHost<boolean>("fileExists", { path: filePath });
  if (alreadyExists) {
    return okResponse({ file: filePath, already_exists: true, message: "Cover file already exists" });
  }

  await saveRemoteBinary(String(request.cover_url), filePath);
  return okResponse({ file: filePath, message: "Cover downloaded successfully" });
}

export async function DownloadHeader(request: AnyRecord): Promise<AnyRecord> {
  if (!request?.header_url || !request?.artist_name || !request?.output_dir) {
    return { success: false, error: "Missing header download parameters" };
  }

  const filePath = `${String(request.output_dir).replace(/[\\/]+$/, "")}\\${sanitizeFilename(String(request.artist_name))}_Header.jpg`;
  const alreadyExists = await invokeHost<boolean>("fileExists", { path: filePath });
  if (alreadyExists) {
    return okResponse({ file: filePath, already_exists: true, message: "Header file already exists" });
  }

  await saveRemoteBinary(String(request.header_url), filePath);
  return okResponse({ file: filePath, message: "Header downloaded successfully" });
}

export async function DownloadGalleryImage(request: AnyRecord): Promise<AnyRecord> {
  if (!request?.image_url || !request?.artist_name || !request?.output_dir) {
    return { success: false, error: "Missing gallery image download parameters" };
  }

  const imageIndex = Number(request.image_index || 0) + 1;
  const filePath = `${String(request.output_dir).replace(/[\\/]+$/, "")}\\${sanitizeFilename(String(request.artist_name))}_Gallery_${imageIndex}.jpg`;
  const alreadyExists = await invokeHost<boolean>("fileExists", { path: filePath });
  if (alreadyExists) {
    return okResponse({ file: filePath, already_exists: true, message: "Gallery image already exists" });
  }

  await saveRemoteBinary(String(request.image_url), filePath);
  return okResponse({ file: filePath, message: "Gallery image downloaded successfully" });
}

export async function DownloadAvatar(request: AnyRecord): Promise<AnyRecord> {
  if (!request?.avatar_url || !request?.artist_name || !request?.output_dir) {
    return { success: false, error: "Missing avatar download parameters" };
  }

  const filePath = `${String(request.output_dir).replace(/[\\/]+$/, "")}\\${sanitizeFilename(String(request.artist_name))}_Avatar.jpg`;
  const alreadyExists = await invokeHost<boolean>("fileExists", { path: filePath });
  if (alreadyExists) {
    return okResponse({ file: filePath, already_exists: true, message: "Avatar file already exists" });
  }

  await saveRemoteBinary(String(request.avatar_url), filePath);
  return okResponse({ file: filePath, message: "Avatar downloaded successfully" });
}

export async function CheckAPIStatus(): Promise<boolean> {
  return true;
}

export async function CheckTrackAvailability(): Promise<string> {
  return JSON.stringify({ available: false, message: "Pendiente de migrar." });
}

export async function GetStreamingURLs(): Promise<string> {
  return JSON.stringify([]);
}

export async function OpenFolder(path = ""): Promise<void> {
  const settings = getStoredSettings();
  const target = String(path || settings.downloadPath || DEFAULT_DOWNLOAD_PATH);
  await invokeHost("openFolder", { path: target });
}

export async function OpenConfigFolder(): Promise<void> {
  await invokeHost("openConfigFolder");
}

export async function SelectFolder(defaultPath = DEFAULT_DOWNLOAD_PATH): Promise<string> {
  return await invokeHost<string>("selectFolder", { defaultPath });
}

export async function SelectFile(): Promise<string> {
  return "";
}

export function GetDefaults(): AnyRecord {
  return {
    downloadPath: DEFAULT_DOWNLOAD_PATH,
    downloader: "auto",
    linkResolver: "songlink",
    allowResolverFallback: true,
    theme: "yellow",
    themeMode: "auto",
    fontFamily: "google-sans",
    folderPreset: "none",
    folderTemplate: "",
    filenamePreset: "title-artist",
    filenameTemplate: "{title} - {artist}",
    trackNumber: false,
    sfxEnabled: true,
    embedLyrics: false,
    embedMaxQualityCover: false,
    tidalQuality: "LOSSLESS",
    qobuzQuality: "6",
    amazonQuality: "original",
    autoOrder: "tidal-qobuz-amazon",
    autoQuality: "16",
    allowFallback: true,
    useSpotFetchAPI: true,
    spotFetchAPIUrl: SPOTFETCH_API_URL,
    createPlaylistFolder: true,
    createM3u8File: false,
    useFirstArtistOnly: false,
    useSingleGenre: false,
    embedGenre: true,
    separator: "semicolon",
    saveLyrics: true,
    saveCover: true,
    operatingSystem: "Windows",
  };
}

export async function GetDownloadProgress(): Promise<backend.ProgressInfo> {
  return { is_downloading: false, mb_downloaded: 0, speed_mbps: 0 };
}

export async function GetDownloadQueue(): Promise<backend.DownloadQueueInfo> {
  return emptyQueue();
}

export async function ClearCompletedDownloads(): Promise<void> {}

export async function ClearAllDownloads(): Promise<void> {}

export async function AddToDownloadQueue(): Promise<string> {
  return crypto.randomUUID();
}

export async function MarkDownloadItemFailed(): Promise<void> {}

export async function CancelAllQueuedItems(): Promise<void> {}

export async function ExportFailedDownloads(): Promise<string> {
  return "";
}

export async function GetDownloadHistory(): Promise<backend.HistoryItem[]> {
  return readStorageArray<backend.HistoryItem>(DOWNLOAD_HISTORY_KEY);
}

export async function ClearDownloadHistory(): Promise<void> {
  writeStorageArray(DOWNLOAD_HISTORY_KEY, []);
}

export async function DeleteDownloadHistoryItem(id: string): Promise<void> {
  const items = readStorageArray<backend.HistoryItem>(DOWNLOAD_HISTORY_KEY)
    .filter((item) => item.id !== id);
  writeStorageArray(DOWNLOAD_HISTORY_KEY, items);
}

export async function GetFetchHistory(): Promise<backend.FetchHistoryItem[]> {
  return readStorageArray<backend.FetchHistoryItem>(FETCH_HISTORY_KEY);
}

export async function AddFetchHistory(item: backend.FetchHistoryItem): Promise<void> {
  const items = readStorageArray<backend.FetchHistoryItem>(FETCH_HISTORY_KEY)
    .filter((entry) => !(entry.url === item.url && entry.type === item.type));
  const nextItem = {
    ...item,
    id: item.id || crypto.randomUUID(),
    timestamp: item.timestamp || Math.floor(Date.now() / 1000),
  };
  writeStorageArray(FETCH_HISTORY_KEY, [nextItem, ...items].slice(0, 200));
}

export async function ClearFetchHistory(): Promise<void> {
  writeStorageArray(FETCH_HISTORY_KEY, []);
}

export async function DeleteFetchHistoryItem(id: string): Promise<void> {
  const items = readStorageArray<backend.FetchHistoryItem>(FETCH_HISTORY_KEY)
    .filter((item) => item.id !== id);
  writeStorageArray(FETCH_HISTORY_KEY, items);
}

export async function ClearFetchHistoryByType(itemType: string): Promise<void> {
  if (!itemType || itemType === "all") {
    writeStorageArray(FETCH_HISTORY_KEY, []);
    return;
  }

  const normalizedType = itemType.toLowerCase();
  const items = readStorageArray<backend.FetchHistoryItem>(FETCH_HISTORY_KEY)
    .filter((item) => String(item.type || "").toLowerCase() !== normalizedType);
  writeStorageArray(FETCH_HISTORY_KEY, items);
}

export async function SaveSpectrumImage(): Promise<string> {
  return "";
}

export async function IsFFmpegInstalled(): Promise<boolean> {
  return true;
}

export async function IsFFprobeInstalled(): Promise<boolean> {
  return true;
}

export async function CheckFFmpegInstalled(): Promise<boolean> {
  return true;
}

export async function DownloadFFmpeg(): Promise<AnyRecord> {
  return okResponse();
}

export function GetBrewPath(): string {
  return "";
}

export async function IsBrewFFmpegInstalled(): Promise<boolean> {
  return false;
}

export async function InstallFFmpegWithBrew(): Promise<AnyRecord> {
  return okResponse();
}

export async function ConvertAudio(): Promise<backend.ConvertAudioResult[]> {
  return [];
}

export async function ResampleAudio(): Promise<backend.ResampleResult[]> {
  return [];
}

export async function SelectAudioFiles(): Promise<string[]> {
  return [];
}

export async function GetFlacInfoBatch(): Promise<backend.FlacInfo[]> {
  return [];
}

export async function GetFileSizes(files: string[] = []): Promise<Record<string, number>> {
  return Object.fromEntries(files.map((file) => [file, 0]));
}

export async function ListDirectoryFiles(): Promise<backend.FileInfo[]> {
  return [];
}

export async function ListAudioFilesInDir(): Promise<backend.FileInfo[]> {
  return [];
}

export async function ReadFileMetadata(): Promise<backend.AudioMetadata> {
  return {};
}

export async function PreviewRenameFiles(): Promise<backend.RenamePreview[]> {
  return [];
}

export async function RenameFilesByMetadata(): Promise<backend.RenameResult[]> {
  return [];
}

export async function ReadTextFile(): Promise<string> {
  return "";
}

export async function ReadFileAsBase64(): Promise<string> {
  return "";
}

export async function DecodeAudioForAnalysis(): Promise<backend.AnalysisDecodeResponse> {
  return { channels: [], sampleRate: 0, duration: 0 };
}

export async function RenameFileTo(): Promise<void> {}

export async function SelectImageVideo(): Promise<string[]> {
  return [];
}

export async function ReadImageAsBase64(): Promise<string> {
  return "";
}

export async function CheckFilesExistence(): Promise<AnyRecord[]> {
  return [];
}

export async function SkipDownloadItem(): Promise<void> {}

export async function GetPreviewURL(): Promise<string> {
  return "";
}

export async function GetConfigPath(): Promise<string> {
  const info = await getHostInfo();
  return info.configPath;
}

export async function SaveSettings(settings: AnyRecord): Promise<void> {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function LoadSettings(): Promise<AnyRecord> {
  const settings = { ...getStoredSettings() };

  if (!settings.downloadPath) {
    try {
      const info = await getHostInfo();
      settings.downloadPath = info.defaultDownloadPath || DEFAULT_DOWNLOAD_PATH;
    } catch {
      settings.downloadPath = DEFAULT_DOWNLOAD_PATH;
    }
  }

  return settings;
}

export async function CreateM3U8File(): Promise<void> {}

const appApi = {
  AddFetchHistory,
  AddToDownloadQueue,
  CancelAllQueuedItems,
  CheckAPIStatus,
  CheckFFmpegInstalled,
  CheckFilesExistence,
  CheckTrackAvailability,
  ClearAllDownloads,
  ClearCompletedDownloads,
  ClearDownloadHistory,
  ClearFetchHistory,
  ClearFetchHistoryByType,
  ConvertAudio,
  CreateM3U8File,
  DecodeAudioForAnalysis,
  DeleteDownloadHistoryItem,
  DeleteFetchHistoryItem,
  DownloadAvatar,
  DownloadCover,
  DownloadFFmpeg,
  DownloadGalleryImage,
  DownloadHeader,
  DownloadLyrics,
  DownloadTrack,
  ExportFailedDownloads,
  GetBrewPath,
  GetConfigPath,
  GetDefaults,
  GetDownloadHistory,
  GetDownloadProgress,
  GetDownloadQueue,
  GetFetchHistory,
  GetFileSizes,
  GetFlacInfoBatch,
  GetPreviewURL,
  GetSpotifyMetadata,
  GetStreamingURLs,
  InstallFFmpegWithBrew,
  IsBrewFFmpegInstalled,
  IsFFmpegInstalled,
  IsFFprobeInstalled,
  ListAudioFilesInDir,
  ListDirectoryFiles,
  LoadSettings,
  MarkDownloadItemFailed,
  OpenConfigFolder,
  OpenFolder,
  PreviewRenameFiles,
  ReadFileAsBase64,
  ReadFileMetadata,
  ReadImageAsBase64,
  ReadTextFile,
  RenameFileTo,
  RenameFilesByMetadata,
  ResampleAudio,
  SaveSettings,
  SaveSpectrumImage,
  SearchSpotify,
  SearchSpotifyByType,
  SelectAudioFiles,
  SelectFile,
  SelectFolder,
  SelectImageVideo,
  SkipDownloadItem,
};

(window as any).go = {
  ...((window as any).go ?? {}),
  main: {
    ...((window as any).go?.main ?? {}),
    App: appApi,
  },
};
