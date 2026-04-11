import { backend } from "../models";
import { emitCompatEvent } from "../../runtime/runtime";

type AnyRecord = Record<string, any>;

const DEFAULT_DOWNLOAD_PATH = "C:\\Music\\SpotiFLAC";
const SETTINGS_KEY = "spotiflac-settings";
const SPOTFETCH_API_URL = "https://sp.afkarxyz.qzz.io/api";
const FETCH_HISTORY_KEY = "spotiflac-fetch-history";
const DOWNLOAD_HISTORY_KEY = "spotiflac-download-history";
const DOWNLOAD_QUEUE_KEY = "spotiflac-download-queue";
const DOWNLOAD_PROGRESS_KEY = "spotiflac-download-progress";

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

  try {
    return await host.invoke(method, payload) as T;
  } catch (err) {
    throw err;
  }
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

async function getConfigFilePath(): Promise<string> {
  const info = await getHostInfo();
  return `${String(info.configPath).replace(/[\\/]+$/, "")}\\config.json`;
}

type DownloadQueueItem = {
  id: string;
  spotify_id: string;
  track_name: string;
  artist_name: string;
  album_name: string;
  file_path?: string;
  error_message?: string;
  status: "queued" | "downloading" | "completed" | "failed" | "skipped";
  progress: number;
  speed: number;
  created_at: number;
  updated_at: number;
};

type DownloadProgressState = {
  is_downloading: boolean;
  mb_downloaded: number;
  speed_mbps: number;
  session_start_time: number;
};

function getQueueItems(): DownloadQueueItem[] {
  return readStorageArray<DownloadQueueItem>(DOWNLOAD_QUEUE_KEY);
}

function setQueueItems(items: DownloadQueueItem[]): void {
  writeStorageArray(DOWNLOAD_QUEUE_KEY, items);
}

function getProgressState(): DownloadProgressState {
  try {
    const raw = localStorage.getItem(DOWNLOAD_PROGRESS_KEY);
    if (!raw) {
      return {
        is_downloading: false,
        mb_downloaded: 0,
        speed_mbps: 0,
        session_start_time: 0,
      };
    }
    return JSON.parse(raw) as DownloadProgressState;
  } catch {
    return {
      is_downloading: false,
      mb_downloaded: 0,
      speed_mbps: 0,
      session_start_time: 0,
    };
  }
}

function setProgressState(progress: DownloadProgressState): void {
  localStorage.setItem(DOWNLOAD_PROGRESS_KEY, JSON.stringify(progress));
}

function updateQueueItem(id: string, patch: Partial<DownloadQueueItem>): void {
  const items = getQueueItems().map((item) =>
    item.id === id ? { ...item, ...patch, updated_at: Math.floor(Date.now() / 1000) } : item,
  );
  setQueueItems(items);
}

function appendDownloadHistory(item: backend.HistoryItem): void {
  const items = readStorageArray<backend.HistoryItem>(DOWNLOAD_HISTORY_KEY)
    .filter((entry) => !(entry.spotify_id === item.spotify_id && entry.path === item.path));

  const nextItem = new backend.HistoryItem({
    ...item,
    id: item.id || crypto.randomUUID(),
    timestamp: item.timestamp || Math.floor(Date.now() / 1000),
  });

  writeStorageArray(DOWNLOAD_HISTORY_KEY, [nextItem, ...items].slice(0, 500));
}

function normalizeAmazonMusicURL(rawUrl: string): string {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  return value.replace(/\?.*$/, "");
}

function normalizeDeezerTrackURL(rawUrl: string): string {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  return value.replace(/\/?$/, "");
}

async function fetchSongLinkLinksByURL(rawUrl: string, region = ""): Promise<any> {
  const apiUrl = new URL("https://api.song.link/v1-alpha.1/links");
  apiUrl.searchParams.set("url", rawUrl);
  if (region) {
    apiUrl.searchParams.set("userCountry", region);
  }

  const response = await fetch(apiUrl.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new Error(`song.link returned HTTP ${response.status}`);
  }

  return response.json();
}

async function getDeezerISRC(deezerUrl: string): Promise<string> {
  const match = deezerUrl.match(/track\/(\d+)/i);
  if (!match) {
    throw new Error("Invalid Deezer URL");
  }

  const response = await fetch(`https://api.deezer.com/track/${match[1]}`);
  if (!response.ok) {
    throw new Error(`Deezer API returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const isrc = String(payload?.isrc || "").trim().toUpperCase();
  if (!isrc) {
    throw new Error("ISRC not found in Deezer response");
  }

  return isrc;
}

async function lookupSpotifyISRC(spotifyTrackID: string): Promise<string> {
  const response = await fetch(`https://open.spotify.com/embed/track/${spotifyTrackID}`);
  if (!response.ok) {
    throw new Error(`Spotify embed returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(/\b([A-Z]{2}[A-Z0-9]{3}\d{7})\b/);
  if (!match) {
    throw new Error("ISRC not found");
  }

  return match[1].toUpperCase();
}

async function checkQobuzAvailability(isrc: string): Promise<boolean> {
  const response = await fetch(
    `https://www.qobuz.com/api.json/0.2/track/search?query=${encodeURIComponent(isrc)}&limit=1&app_id=798273057`,
  );
  if (!response.ok) {
    return false;
  }

  const payload = await response.json();
  return Number(payload?.tracks?.total || 0) > 0;
}

async function resolveSpotifyTrackLinks(spotifyTrackID: string, region = ""): Promise<{
  tidal_url: string;
  amazon_url: string;
  deezer_url: string;
  isrc: string;
}> {
  const rawUrl = `https://open.spotify.com/track/${spotifyTrackID}`;
  const payload = await fetchSongLinkLinksByURL(rawUrl, region);
  const linksByPlatform = payload?.linksByPlatform || {};
  let deezerUrl = String(linksByPlatform?.deezer?.url || "").trim();
  const tidalUrl = String(linksByPlatform?.tidal?.url || "").trim();
  const amazonUrl = String(linksByPlatform?.amazonMusic?.url || linksByPlatform?.amazon?.url || "").trim();

  let isrc = "";
  try {
    isrc = await lookupSpotifyISRC(spotifyTrackID);
  } catch {}

  if (deezerUrl && !isrc) {
    try {
      isrc = await getDeezerISRC(deezerUrl);
    } catch {}
  }

  deezerUrl = normalizeDeezerTrackURL(deezerUrl);

  return {
    tidal_url: tidalUrl,
    amazon_url: normalizeAmazonMusicURL(amazonUrl),
    deezer_url: deezerUrl,
    isrc,
  };
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

export async function SearchSpotify(req: AnyRecord): Promise<backend.SearchResponse> {
  try {
    const result = await invokeHost<AnyRecord>("searchSpotify", {
      query: req?.query ?? "",
      limit: req?.limit ?? 50,
    });

    const searchResponse = new backend.SearchResponse();
    searchResponse.tracks = Array.isArray(result?.tracks) ? result.tracks : [];
    searchResponse.albums = Array.isArray(result?.albums) ? result.albums : [];
    searchResponse.artists = Array.isArray(result?.artists) ? result.artists : [];
    searchResponse.playlists = Array.isArray(result?.playlists) ? result.playlists : [];
    return searchResponse;
  } catch (error) {
    return new backend.SearchResponse({
      tracks: [],
      albums: [],
      artists: [],
      playlists: [],
    });
  }
}

export async function SearchSpotifyByType(req: AnyRecord): Promise<backend.SearchResult[]> {
  try {
    const result = await invokeHost<AnyRecord[]>("searchSpotifyByType", {
      query: req?.query ?? "",
      searchType: req?.search_type ?? "",
      limit: req?.limit ?? 50,
      offset: req?.offset ?? 0,
    });

    return Array.isArray(result) ? result : [];
  } catch (error) {
    return [];
  }
}

export async function DownloadTrack(request: AnyRecord): Promise<AnyRecord> {
  const itemID = String(request?.item_id || "");
  const startedAt = Math.floor(Date.now() / 1000);

  if (itemID) {
    updateQueueItem(itemID, {
      status: "downloading",
      error_message: "",
      progress: 0,
      speed: 0,
    });
  }

  setProgressState({
    ...getProgressState(),
    is_downloading: true,
    speed_mbps: 0,
    session_start_time: getProgressState().session_start_time || startedAt,
  });

  try {
    const response = await invokeHost<AnyRecord>("downloadTrack", { request });
    const succeeded = Boolean(response?.success);
    const downloadedPath = String(response?.file || "");
    const alreadyExists = Boolean(response?.already_exists);
    const source = String(request?.service || request?.source || "auto");

    if (itemID) {
      updateQueueItem(itemID, {
        status: succeeded ? (alreadyExists ? "skipped" : "completed") : "failed",
        error_message: succeeded ? "" : String(response?.error || response?.message || "Download failed"),
        file_path: downloadedPath,
        progress: succeeded ? 100 : 0,
        speed: 0,
      });
    }

    if (succeeded && downloadedPath) {
      appendDownloadHistory(new backend.HistoryItem({
        spotify_id: String(request?.spotify_id || ""),
        title: String(request?.track_name || ""),
        artists: String(request?.artist_name || ""),
        album: String(request?.album_name || ""),
        duration_str: String(request?.duration || ""),
        cover_url: String(request?.cover_url || ""),
        quality: String(request?.audio_quality || request?.quality || ""),
        format: String(request?.audio_format || "flac").toUpperCase(),
        path: downloadedPath,
        source,
      }));
    }

    setProgressState({
      ...getProgressState(),
      is_downloading: false,
      speed_mbps: 0,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (itemID) {
      updateQueueItem(itemID, {
        status: "failed",
        error_message: message,
        progress: 0,
        speed: 0,
      });
    }

    setProgressState({
      ...getProgressState(),
      is_downloading: false,
      speed_mbps: 0,
    });

    return {
      success: false,
      error: message,
      item_id: itemID,
    };
  }
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

export async function CheckTrackAvailability(spotifyTrackID: string): Promise<string> {
  const availability = await invokeHost<AnyRecord>("checkTrackAvailability", {
    spotifyTrackId: spotifyTrackID,
  });
  return JSON.stringify(availability);
}

export async function GetStreamingURLs(spotifyTrackID: string, region = ""): Promise<string> {
  const links = await invokeHost<AnyRecord>("getStreamingURLs", {
    spotifyTrackId: spotifyTrackID,
    region,
  });
  return JSON.stringify(links);
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
  return getProgressState();
}

export async function GetDownloadQueue(): Promise<backend.DownloadQueueInfo> {
  const queue = getQueueItems();
  const progress = getProgressState();
  return new backend.DownloadQueueInfo({
    queue,
    queued_count: queue.filter((item) => item.status === "queued").length,
    completed_count: queue.filter((item) => item.status === "completed").length,
    failed_count: queue.filter((item) => item.status === "failed").length,
    skipped_count: queue.filter((item) => item.status === "skipped").length,
    total_downloaded: progress.mb_downloaded || 0,
    current_speed: progress.speed_mbps || 0,
    session_start_time: progress.session_start_time || 0,
    is_downloading: progress.is_downloading,
  });
}

export async function ClearCompletedDownloads(): Promise<void> {
  const queue = getQueueItems().filter((item) => !["completed", "failed", "skipped"].includes(item.status));
  setQueueItems(queue);
}

export async function ClearAllDownloads(): Promise<void> {
  setQueueItems([]);
  setProgressState({
    is_downloading: false,
    mb_downloaded: 0,
    speed_mbps: 0,
    session_start_time: 0,
  });
}

export async function AddToDownloadQueue(spotifyID = "", trackName = "", artistName = "", albumName = ""): Promise<string> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const queue = getQueueItems();
  queue.unshift({
    id,
    spotify_id: spotifyID,
    track_name: trackName,
    artist_name: artistName,
    album_name: albumName,
    status: "queued",
    progress: 0,
    speed: 0,
    created_at: now,
    updated_at: now,
  });
  setQueueItems(queue);

  const progress = getProgressState();
  if (!progress.session_start_time) {
    setProgressState({
      ...progress,
      session_start_time: now,
    });
  }

  return id;
}

export async function MarkDownloadItemFailed(itemID: string, errorMsg = "Download failed"): Promise<void> {
  updateQueueItem(itemID, {
    status: "failed",
    error_message: errorMsg,
    progress: 0,
    speed: 0,
  });
}

export async function CancelAllQueuedItems(): Promise<void> {
  const queue = getQueueItems().map((item) =>
    item.status === "queued" || item.status === "downloading"
      ? { ...item, status: "failed" as const, error_message: item.error_message || "Cancelled", progress: 0, speed: 0 }
      : item,
  );
  setQueueItems(queue);
  setProgressState({
    ...getProgressState(),
    is_downloading: false,
    speed_mbps: 0,
  });
}

export async function ExportFailedDownloads(): Promise<string> {
  const failedItems = getQueueItems().filter((item) => item.status === "failed");
  if (failedItems.length === 0) {
    return "No failed downloads to export.";
  }

  const lines = [
    `Failed Downloads Report - ${new Date().toISOString()}`,
    "--------------------------------------------------",
    "",
    ...failedItems.flatMap((item, index) => [
      `${index + 1}. ${item.track_name} - ${item.artist_name}${item.album_name ? ` (${item.album_name})` : ""}`,
      `   Error: ${item.error_message || "Unknown error"}`,
      item.spotify_id ? `   URL: https://open.spotify.com/track/${item.spotify_id}` : "",
      "",
    ]),
  ].filter(Boolean);

  const hostInfo = await getHostInfo();
  const outputPath = `${hostInfo.configPath}\\SpotiFLAC_Failed_${Date.now()}.txt`;
  await invokeHost("writeTextFile", {
    path: outputPath,
    contents: lines.join("\n"),
  });

  return `Successfully exported failed downloads to ${outputPath}`;
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

export async function CheckFilesExistence(_outputDir = "", _rootDir = "", tracks: AnyRecord[] = []): Promise<AnyRecord[]> {
  const results: AnyRecord[] = [];

  for (const track of tracks) {
    const filePath = `${String(_outputDir).replace(/[\\/]+$/, "")}\\${replaceTemplate(
      track.filename_format || "{title} - {artist}",
      {
        title: track.track_name,
        artist: track.artist_name,
        album: track.album_name,
        album_artist: track.album_artist || track.artist_name,
        track: track.track_number ? String(track.track_number).padStart(2, "0") : String(track.position || "").padStart(2, "0"),
        disc: track.disc_number ? String(track.disc_number).padStart(2, "0") : "",
        year: typeof track.release_date === "string" ? track.release_date.slice(0, 4) : "",
        date: track.release_date || "",
      },
    )}.${String(track.audio_format || "flac").toLowerCase()}`;

    const exists = await invokeHost<boolean>("fileExists", { path: filePath });
    results.push({
      spotify_id: track.spotify_id,
      exists,
      file_path: exists ? filePath : "",
      track_name: track.track_name,
      artist_name: track.artist_name,
    });
  }

  return results;
}

export async function SkipDownloadItem(itemID: string, filePath = ""): Promise<void> {
  updateQueueItem(itemID, {
    status: "skipped",
    file_path: filePath,
    progress: 0,
    speed: 0,
  });
}

export async function GetPreviewURL(trackID: string): Promise<string> {
  const response = await fetch(`https://open.spotify.com/embed/track/${trackID}`);
  if (!response.ok) {
    throw new Error(`Spotify embed returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(/https:\/\/p\.scdn\.co\/mp3-preview\/[a-zA-Z0-9]+/);
  if (!match) {
    throw new Error("Preview URL not found");
  }

  return match[0];
}

export async function GetConfigPath(): Promise<string> {
  const info = await getHostInfo();
  return info.configPath;
}

export async function SaveSettings(settings: AnyRecord): Promise<void> {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  try {
    const configPath = await getConfigFilePath();
    await invokeHost("writeTextFile", {
      path: configPath,
      contents: JSON.stringify(settings, null, 2),
    });
  } catch {}
}

export async function LoadSettings(): Promise<AnyRecord> {
  let settings = { ...getStoredSettings() };

  try {
    const configPath = await getConfigFilePath();
    const exists = await invokeHost<boolean>("fileExists", { path: configPath });
    if (exists) {
      const contents = await invokeHost<string>("readTextFile", { path: configPath });
      const parsed = JSON.parse(contents);
      settings = { ...GetDefaults(), ...parsed, ...settings };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
  } catch {}

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
