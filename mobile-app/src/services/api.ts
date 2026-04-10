export type MobileTrack = {
  id: string;
  file_path: string;
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  format: string;
  duration_seconds: number | null;
  duration_formatted: string | null;
  sample_rate: number | null;
  bit_depth: number | null;
  channels: number | null;
  has_cover_art: boolean;
  quality: string;
};

export type TrackDetail = {
  track: MobileTrack;
  file_path: string;
  file_size: number;
  modified_at: number | null;
  stream_url: string;
  cover_url: string | null;
  canvas_url: string | null;
  metadata_url: string;
  stream_ready: boolean;
  cover_ready: boolean;
  canvas_ready: boolean;
  access_mode: string;
};

export type TrackMetadata = {
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  genre: string | null;
  composer: string | null;
  lyricist: string | null;
  comment: string | null;
  lyrics: string | null;
  synced_lyrics: string | null;
  track_number: string | null;
  track_total: string | null;
  disc_number: string | null;
  disc_total: string | null;
  year: string | null;
  release_date: string | null;
  duration_seconds: number | null;
  duration_formatted: string | null;
  channels: number | null;
  sample_rate: number | null;
  bit_depth: number | null;
  audio_bitrate: number | null;
  overall_bitrate: number | null;
  has_cover_art: boolean;
};

export type ArtistSummary = {
  id: string;
  name: string;
  album_count: number;
  track_count: number;
  cover_track_id: string | null;
};

export type AlbumSummary = {
  id: string;
  name: string;
  artist: string;
  year: string | null;
  track_count: number;
  cover_track_id: string | null;
};

export type PlaylistRecord = {
  id: number;
  name: string;
  track_count: number;
  created_at: number;
  updated_at: number;
  track_paths: string[];
};

export type RecentSearchRecord = {
  query: string;
  title: string;
  subtitle: string;
  cover: string | null;
  kind: string;
  entity_key: string;
  artist_name: string | null;
  track_path: string | null;
};

export type LibraryResponse = {
  items: MobileTrack[];
  total: number;
  source: string;
  roots: string[];
  scanned_at_unix: number;
};

export type SearchResponse = {
  query: string;
  top_tracks: MobileTrack[];
  artists: ArtistSummary[];
  albums: AlbumSummary[];
};

export type ArtistDetailResponse = {
  artist: ArtistSummary;
  tracks: MobileTrack[];
  albums: AlbumSummary[];
};

export type AlbumDetailResponse = {
  album: AlbumSummary;
  tracks: MobileTrack[];
};

export type ServerConfig = {
  baseUrl: string;
  token: string;
};

export type DesktopPlaybackContext = {
  kind: string;
  label: string;
};

export type DesktopSessionSnapshot = {
  currentTrackPath: string | null;
  currentSource: string;
  currentQueueTrackId: number | null;
  currentPlaybackContext: DesktopPlaybackContext | null;
  currentTime: number;
  volume: number;
  isMuted: boolean;
  lastVolumeBeforeMute: number;
  loopMode: "off" | "all" | "one" | string;
  isShuffleEnabled: boolean;
  wasPlaying: boolean;
  queue: Array<{
    path: string;
    queueId: number;
    playbackContext: DesktopPlaybackContext;
  }>;
  librarySearch: string;
  globalSearch: string;
  queueSearch: string;
  deviceName?: string | null;
  outputDeviceName?: string | null;
};

export type DesktopSessionRecord = {
  session: DesktopSessionSnapshot | null;
  updated_at: number | null;
};

export type DeviceSessionRecord = {
  device: "desktop" | "mobile";
  session: DesktopSessionSnapshot;
  updated_at: number;
};

export type ConnectStateRecord = {
  active_device: "desktop" | "mobile" | null;
  desktop: DeviceSessionRecord | null;
  mobile: DeviceSessionRecord | null;
};

export type ConnectCommandRecord = {
  id: number;
  command: string;
  payload: unknown;
  created_at: number;
};

const DEFAULT_SERVER_URL = "http://127.0.0.1:4850";

const buildHeaders = (token: string, includeJson = false) => {
  const headers = new Headers();

  if (token.trim()) {
    headers.set("Authorization", `Bearer ${token.trim()}`);
  }

  if (includeJson) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
};

const buildUrl = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

async function requestJson<T>(
  config: ServerConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(buildUrl(config.baseUrl, path), {
    ...init,
    headers: init?.headers ?? buildHeaders(config.token),
  });

  if (!response.ok) {
    throw new Error(`No se pudo cargar ${path} (${response.status})`);
  }

  return (await response.json()) as T;
}

export const defaultServerConfig = (): ServerConfig => ({
  baseUrl: DEFAULT_SERVER_URL,
  token: "",
});

export function fetchLibrary(config: ServerConfig) {
  return requestJson<LibraryResponse>(config, "/api/v1/library/tracks");
}

export function fetchTrackDetail(config: ServerConfig, trackId: string) {
  return requestJson<TrackDetail>(config, `/api/v1/library/tracks/${trackId}`);
}

export function fetchTrackMetadata(config: ServerConfig, trackId: string) {
  return requestJson<TrackMetadata>(
    config,
    `/api/v1/library/tracks/${trackId}/metadata`,
  );
}

export function triggerRescan(config: ServerConfig) {
  return requestJson<LibraryResponse>(config, "/api/v1/library/rescan", {
    method: "POST",
    headers: buildHeaders(config.token),
  });
}

export function fetchArtists(config: ServerConfig) {
  return requestJson<ArtistSummary[]>(config, "/api/v1/artists");
}

export function fetchArtistDetail(config: ServerConfig, artistId: string) {
  return requestJson<ArtistDetailResponse>(config, `/api/v1/artists/${artistId}`);
}

export function fetchAlbums(config: ServerConfig) {
  return requestJson<AlbumSummary[]>(config, "/api/v1/albums");
}

export function fetchAlbumDetail(config: ServerConfig, albumId: string) {
  return requestJson<AlbumDetailResponse>(config, `/api/v1/albums/${albumId}`);
}

export function searchLibrary(config: ServerConfig, query: string) {
  return requestJson<SearchResponse>(
    config,
    `/api/v1/search?q=${encodeURIComponent(query)}`,
  );
}

export function fetchPlaylists(config: ServerConfig) {
  return requestJson<PlaylistRecord[]>(config, "/api/v1/playlists");
}

export function createPlaylist(config: ServerConfig, name: string) {
  return requestJson<PlaylistRecord>(config, "/api/v1/playlists", {
    method: "POST",
    headers: buildHeaders(config.token, true),
    body: JSON.stringify({ name }),
  });
}

export async function renamePlaylist(
  config: ServerConfig,
  playlistId: number,
  name: string,
) {
  const response = await fetch(
    buildUrl(config.baseUrl, `/api/v1/playlists/${playlistId}`),
    {
      method: "PATCH",
      headers: buildHeaders(config.token, true),
      body: JSON.stringify({ name }),
    },
  );
  if (!response.ok) throw new Error(`No se pudo renombrar la playlist (${response.status})`);
}

export async function deletePlaylist(config: ServerConfig, playlistId: number) {
  const response = await fetch(
    buildUrl(config.baseUrl, `/api/v1/playlists/${playlistId}`),
    {
      method: "DELETE",
      headers: buildHeaders(config.token),
    },
  );
  if (!response.ok) throw new Error(`No se pudo eliminar la playlist (${response.status})`);
}

export async function addTrackToPlaylist(
  config: ServerConfig,
  playlistId: number,
  trackPath: string,
  allowDuplicate = false,
) {
  const response = await fetch(
    buildUrl(config.baseUrl, `/api/v1/playlists/${playlistId}/tracks`),
    {
      method: "POST",
      headers: buildHeaders(config.token, true),
      body: JSON.stringify({ track_path: trackPath, allow_duplicate: allowDuplicate }),
    },
  );
  if (!response.ok) throw new Error(`No se pudo agregar a playlist (${response.status})`);
}

export async function removeTrackFromPlaylist(
  config: ServerConfig,
  playlistId: number,
  trackPath: string,
) {
  const response = await fetch(
    buildUrl(config.baseUrl, `/api/v1/playlists/${playlistId}/tracks`),
    {
      method: "DELETE",
      headers: buildHeaders(config.token, true),
      body: JSON.stringify({ track_path: trackPath }),
    },
  );
  if (!response.ok) throw new Error(`No se pudo quitar de playlist (${response.status})`);
}

export function fetchRecentSearches(config: ServerConfig) {
  return requestJson<RecentSearchRecord[]>(config, "/api/v1/recent-searches");
}

export function fetchDesktopConnectState(config: ServerConfig) {
  return requestJson<ConnectStateRecord>(config, "/api/v1/connect/state");
}

export async function saveDeviceConnectSession(
  config: ServerConfig,
  device: "desktop" | "mobile",
  session: DesktopSessionSnapshot,
  makeActive = false,
) {
  const response = await fetch(
    buildUrl(config.baseUrl, `/api/v1/connect/devices/${device}/session`),
    {
      method: "PUT",
      headers: buildHeaders(config.token, true),
      body: JSON.stringify({ session, make_active: makeActive }),
    },
  );

  if (!response.ok) {
    throw new Error(`No se pudo guardar sesion Connect (${response.status})`);
  }
}

export async function setActiveConnectDevice(
  config: ServerConfig,
  device: "desktop" | "mobile",
) {
  const response = await fetch(buildUrl(config.baseUrl, "/api/v1/connect/active-device"), {
    method: "PUT",
    headers: buildHeaders(config.token, true),
    body: JSON.stringify({ device }),
  });

  if (!response.ok) {
    throw new Error(`No se pudo cambiar dispositivo activo (${response.status})`);
  }
}

export function sendDesktopConnectCommand(
  config: ServerConfig,
  command: string,
  payload: Record<string, unknown> = {},
) {
  return requestJson<ConnectCommandRecord>(config, "/api/v1/connect/commands", {
    method: "POST",
    headers: buildHeaders(config.token, true),
    body: JSON.stringify({ command, payload }),
  });
}

export async function saveRecentSearches(
  config: ServerConfig,
  items: RecentSearchRecord[],
) {
  const response = await fetch(buildUrl(config.baseUrl, "/api/v1/recent-searches"), {
    method: "PUT",
    headers: buildHeaders(config.token, true),
    body: JSON.stringify(items),
  });

  if (!response.ok) {
    throw new Error(`No se pudieron guardar búsquedas recientes (${response.status})`);
  }
}

export const resolveStreamUrl = (config: ServerConfig, detail: TrackDetail) =>
  buildUrl(config.baseUrl, detail.stream_url);

export const resolveCanvasUrl = (config: ServerConfig, detail: TrackDetail) =>
  detail.canvas_url ? buildUrl(config.baseUrl, detail.canvas_url) : null;

export const resolveCoverUrl = (
  config: ServerConfig,
  detailOrTrack:
    | Pick<TrackDetail, "cover_url">
    | Pick<MobileTrack, "id" | "has_cover_art">
    | Pick<ArtistSummary, "cover_track_id">
    | Pick<AlbumSummary, "cover_track_id">,
) => {
  if ("cover_url" in detailOrTrack) {
    return detailOrTrack.cover_url
      ? buildUrl(config.baseUrl, detailOrTrack.cover_url)
      : null;
  }

  if ("cover_track_id" in detailOrTrack) {
    return detailOrTrack.cover_track_id
      ? buildUrl(config.baseUrl, `/api/v1/library/tracks/${detailOrTrack.cover_track_id}/cover`)
      : null;
  }

  return detailOrTrack.has_cover_art
    ? buildUrl(config.baseUrl, `/api/v1/library/tracks/${detailOrTrack.id}/cover`)
    : null;
};
