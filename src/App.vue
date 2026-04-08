<script setup lang="ts">
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

type PlaybackContextKind = "library" | "queue" | "album" | "artist" | "search";

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
  currentViewSnapshot: ViewSnapshot;
};

type OutputDeviceInfo = {
  device_name: string;
  sample_rate: number;
  channels: number;
  sample_format: string;
};

const outputDeviceInfo = ref<OutputDeviceInfo | null>(null);
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

type PlaybackSource = "library" | "queue";

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

const selectedLibraryTrackPath = ref<string | null>(null);

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  track: null as PlaylistTrack | null,
  source: "library" as PlaybackSource,
  queueIndex: null as number | null,
});

const contextMenuStyle = computed(() => {
  const menuWidth = 280;
  const menuHeight = 320;
  const margin = 12;

  const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin);
  const maxTop = Math.max(margin, window.innerHeight - menuHeight - margin);

  return {
    left: `${Math.min(contextMenu.value.x, maxLeft)}px`,
    top: `${Math.min(contextMenu.value.y, maxTop)}px`,
  };
});

const selectLibraryTrack = (track: PlaylistTrack) => {
  selectedLibraryTrackPath.value = track.path;
};

const openTrackContextMenu = (
  e: MouseEvent,
  track: PlaylistTrack,
  source: PlaybackSource = "library",
  queueIndex: number | null = null,
) => {
  e.preventDefault();
  e.stopPropagation();

  selectedLibraryTrackPath.value = track.path;

  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    track,
    source,
    queueIndex,
  };
};

const closeTrackContextMenu = () => {
  contextMenu.value.visible = false;
  contextMenu.value.track = null;
  contextMenu.value.queueIndex = null;
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

  await playTrackFromLibrary(contextMenu.value.track);
  closeTrackContextMenu();
};

const removeContextMenuTrackFromQueue = () => {
  if (contextMenu.value.queueIndex == null) return;
  removeFromQueue(contextMenu.value.queueIndex);
  closeTrackContextMenu();
};

const contextMenuTargetsCurrentTrack = computed(() => {
  const track = contextMenu.value.track;
  if (!track || !filePath.value) return false;

  if (contextMenu.value.source === "queue") {
    return (
      contextMenu.value.queueIndex != null &&
      isQueueTrackActive(track, contextMenu.value.queueIndex)
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

const isLibraryTrackSelected = (track: PlaylistTrack) => {
  return selectedLibraryTrackPath.value === track.path;
};

const playlist = ref<PlaylistTrack[]>([]);
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

const globalSearchInputRef = ref<HTMLInputElement | null>(null);
const librarySearchInputRef = ref<HTMLInputElement | null>(null);
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

  const isTypingElement =
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target?.isContentEditable;

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

  // Espacio => play / pause
  // Solo si NO está escribiendo en un campo
  const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";

  if (isSpace && !isTypingElement) {
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

  if (currentViewMode.value === "artist") {
    return (
      currentPlaybackContext.value.kind === "artist" &&
      currentPlaybackContext.value.label === activeArtistView.value
    );
  }

  return currentPlaybackContext.value.kind === "library";
};

const isLibraryTrackCurrent = (track: PlaylistTrack) => {
  return filePath.value === track.path && doesPlaybackContextMatchCurrentView();
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
type ViewMode = "library" | "artist" | "album" | "search";
type ViewSnapshot = {
  mode: ViewMode;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  search: string;
  globalQuery: string;
};

const currentViewMode = ref<ViewMode>("library");
const activeArtistView = ref<string | null>(null);
const activeAlbumView = ref<string | null>(null);
const activeAlbumArtistView = ref<string | null>(null);
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
  search: librarySearch.value,
  globalQuery: committedGlobalSearch.value,
});

const isSameViewSnapshot = (a: ViewSnapshot, b: ViewSnapshot) => {
  return (
    a.mode === b.mode &&
    a.artist === b.artist &&
    a.album === b.album &&
    a.albumArtist === b.albumArtist &&
    a.search === b.search &&
    a.globalQuery === b.globalQuery
  );
};

const applyViewSnapshot = (snapshot: ViewSnapshot) => {
  currentViewMode.value = snapshot.mode;
  activeArtistView.value = snapshot.artist;
  activeAlbumView.value = snapshot.album;
  activeAlbumArtistView.value = snapshot.albumArtist;
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
    search: "",
    globalQuery: "",
  });
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
    search: "",
    globalQuery: globalSearch.value.trim(),
  });
};

// ====== NUEVO: Función para dividir artistas por punto y coma ======
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

  return "Buscar en toda la biblioteca...";
});

const globalSearchPlaceholder = computed(() => {
  return "¿Qué quieres reproducir?";
});

const currentViewTitle = computed(() => {
  if (isSearchViewActive.value) {
    return `Resultados para "${committedGlobalSearch.value.trim()}"`;
  }

  if (currentViewMode.value === "artist") {
    return `Artista: ${activeArtistView.value ?? ""}`;
  }

  if (currentViewMode.value === "album") {
    return activeAlbumView.value ?? "Álbum";
  }

  return "Biblioteca";
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
      search: "",
      globalQuery: "",
    });
  } else {
    navigateToView({
      mode: "library",
      artist: null,
      album: null,
      albumArtist: null,
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

const isLibraryTrackActive = (track: PlaylistTrack) => {
  return isLibraryTrackCurrent(track);
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

const playTrackFromLibrary = async (track: PlaylistTrack) => {
  const playbackContext = getLibraryPlaybackContext();
  if (playbackContext.kind === "search") {
    rememberRecentGlobalSearch(playbackContext.label, track);
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

const toggleLibraryTrackPlayback = async (track: PlaylistTrack) => {
  if (isLibraryTrackCurrent(track)) {
    await togglePlay();
    return;
  }

  const realIndex = playlist.value.findIndex(
    (item) => item.path === track.path,
  );
  if (realIndex === -1) return;

  await playTrackFromLibrary(playlist.value[realIndex]);
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
  closeTrackContextMenu();

  const target = e.target as HTMLElement;

  if (
    globalSearchShellRef.value &&
    !globalSearchShellRef.value.contains(target)
  ) {
    closeGlobalSearchPopover();
  }

  // Si el click NO está dentro de una fila → deseleccionar
  if (!target.closest(".spotify-row") && !target.closest(".queue-row")) {
    selectedLibraryTrackPath.value = null;
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

// Crea una variable para guardar el evento (ponla cerca de tus otros unlistenFsChanges)
let unlistenDeviceChanged: UnlistenFn | null = null;

onMounted(async () => {
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

  await fetchOutputDeviceInfo();
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

  window.addEventListener("keydown", onGlobalKeydown);
  window.addEventListener("click", onGlobalWindowClick);
  window.addEventListener("beforeunload", onBeforeWindowUnload);
  document.addEventListener("visibilitychange", onVisibilityChange);
});

onBeforeUnmount(() => {
  void persistAppSessionNow();
  stopProgress();
  invoke("stop_audio_backend").catch(console.error);
  window.cancelAnimationFrame(globalSearchLoadingFrame);
  clearSessionPersistTimeout();
  if (sessionProgressInterval != null) {
    window.clearInterval(sessionProgressInterval);
    sessionProgressInterval = null;
  }

  window.removeEventListener("keydown", onGlobalKeydown);
  window.removeEventListener("click", onGlobalWindowClick);
  window.removeEventListener("beforeunload", onBeforeWindowUnload);
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
        <div class="topbar-nav">
          <button
            class="view-nav-btn topbar-nav-btn"
            type="button"
            :disabled="!canGoBackView"
            @click="goBackView"
            aria-label="Volver"
            title="Volver"
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M15 6L9 12L15 18"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <button
            class="view-nav-btn topbar-nav-btn"
            type="button"
            :disabled="!canGoForwardView"
            @click="goForwardView"
            aria-label="Avanzar"
            title="Avanzar"
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M9 6L15 12L9 18"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <div ref="globalSearchShellRef" class="topbar-search-shell">
          <button
            class="view-home-btn topbar-home-btn"
            type="button"
            @click="goHomeView"
            aria-label="Inicio"
            title="Inicio"
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M4 10.5L12 4L20 10.5V19A1 1 0 0 1 19 20H14V14H10V20H5A1 1 0 0 1 4 19V10.5Z"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <div class="topbar-search">
            <svg
              class="topbar-search-icon"
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="11"
                cy="11"
                r="6.5"
                stroke="currentColor"
                stroke-width="2"
              />
              <path
                d="M16 16L20 20"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>

            <input
              ref="globalSearchInputRef"
              v-model="globalSearch"
              type="text"
              class="topbar-search-input"
              :placeholder="globalSearchPlaceholder"
              @focus="onGlobalSearchFocus"
              @click="openGlobalSearchPopover"
              @keydown="onGlobalSearchKeydown"
            />

            <div v-if="!globalSearch" class="topbar-search-shortcuts">
              <span class="topbar-shortcut-key">Ctrl</span>
              <span class="topbar-shortcut-key">L</span>
            </div>

            <button
              v-if="globalSearch"
              class="topbar-icon-btn"
              type="button"
              aria-label="Limpiar búsqueda global"
              title="Limpiar búsqueda global"
              @click="globalSearch = ''"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6L18 18"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
                <path
                  d="M18 6L6 18"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>

            <div class="topbar-search-divider"></div>

            <button
              class="topbar-icon-btn"
              type="button"
              aria-label="Abrir rutas"
              title="Abrir rutas"
              @click="isRoutesManagerOpen = true"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                ></path>
              </svg>
            </button>

            <div
              v-if="isGlobalSearchPopoverVisible"
              class="global-search-popover-wrap"
            >
              <div class="global-search-popover glass-panel-inner">
                <template v-if="!globalSearch.trim()">
                  <div class="global-search-section-title">
                    Búsquedas recientes
                  </div>

                  <div
                    v-for="item in recentGlobalSearches"
                    :key="`${item.query}-${item.title}`"
                    class="global-search-recent-item"
                    @click="handleRecentGlobalSearchClick(item)"
                    @contextmenu.prevent="
                      openRecentGlobalSearchContextMenu($event, item)
                    "
                  >
                    <button
                      class="global-search-recent-cover"
                      type="button"
                      :title="`Reproducir ${item.kind}`"
                      @click.stop="playRecentSearchItem(item)"
                    >
                      <img
                        v-if="item.cover"
                        :src="item.cover!"
                        alt=""
                        class="global-search-thumb"
                      />
                      <div v-else class="global-search-thumb placeholder">
                        &#9835;
                      </div>
                      <span class="global-search-play-overlay">
                        <svg
                          v-if="isRecentSearchItemPlaying(item)"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <rect x="6" y="5" width="4" height="14"></rect>
                          <rect x="14" y="5" width="4" height="14"></rect>
                        </svg>
                        <svg
                          v-else
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <polygon points="7,5 19,12 7,19"></polygon>
                        </svg>
                      </span>
                    </button>

                    <div class="global-search-meta recent-search-meta">
                      <button
                        class="global-search-item-title recent-search-link"
                        type="button"
                        @click="
                          item.kind === 'song'
                            ? goToRecentTrackLocation(item)
                            : item.kind === 'album'
                              ? goToRecentSearchAlbum(
                                  item.title,
                                  getRecentSearchArtistName(item),
                                )
                              : goToRecentSearchArtist(item.title)
                        "
                      >
                        {{ item.title }}
                      </button>
                      <div
                        v-if="item.kind === 'song'"
                        class="global-search-item-subtitle recent-search-subtitle"
                      >
                        <span class="recent-search-type">Cancion</span>
                        <span class="recent-search-separator">&bull;</span>
                        <button
                          class="recent-search-inline-link"
                          type="button"
                          @click.stop="
                            goToRecentSearchArtist(
                              getRecentSearchTrackArtists(item)[0] ?? '',
                            )
                          "
                        >
                          {{
                            getRecentSearchTrackArtists(item)[0] ??
                            "Artista desconocido"
                          }}
                        </button>
                      </div>
                      <div
                        v-else
                        class="global-search-item-subtitle recent-search-subtitle"
                      >
                        {{ item.subtitle }}
                      </div>
                    </div>
                    <button
                      class="recent-search-remove-btn"
                      type="button"
                      aria-label="Quitar de búsquedas recientes"
                      title="Quitar de búsquedas recientes"
                      @click.stop="removeRecentGlobalSearch(item)"
                    >
                      ×
                    </button>
                  </div>

                  <div
                    v-if="recentGlobalSearches.length === 0"
                    class="global-search-empty-state"
                  >
                    Tus búsquedas recientes aparecerán aquí.
                  </div>
                </template>

                <template v-else-if="isGlobalSearchLoading">
                  <div class="global-search-skeleton-list">
                    <div
                      v-for="i in 6"
                      :key="`search-skeleton-${i}`"
                      class="global-search-skeleton-item"
                    >
                      <div class="global-search-skeleton-thumb"></div>
                      <div class="global-search-skeleton-copy">
                        <div class="global-search-skeleton-line large"></div>
                        <div class="global-search-skeleton-line small"></div>
                      </div>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <div class="global-search-popover-topbar compact">
                    <div class="global-search-nav">
                      <button
                        class="global-search-nav-btn"
                        type="button"
                        aria-label="Navegar arriba"
                      >
                        ↑
                      </button>
                      <button
                        class="global-search-nav-btn"
                        type="button"
                        aria-label="Navegar abajo"
                      >
                        ↓
                      </button>
                      <span class="global-search-nav-label">Navegar</span>
                    </div>

                    <div class="global-search-actions">
                      <div class="global-search-kbd-hint">
                        <span class="topbar-shortcut-key">↵</span>
                        <span>Ingresar búsqueda</span>
                      </div>

                      <button
                        class="small-action-btn global-search-submit-btn"
                        type="button"
                        @click="commitGlobalSearch()"
                      >
                        Buscar
                      </button>
                    </div>
                  </div>

                  <div
                    v-if="quickSearchSuggestions.length > 0"
                    class="global-search-suggestions"
                  >
                    <button
                      v-for="suggestion in quickSearchSuggestions"
                      :key="suggestion"
                      class="global-search-suggestion-item"
                      type="button"
                      @click="applyQuickSearchSuggestion(suggestion)"
                    >
                      <span class="global-search-suggestion-icon">⌕</span>
                      <span class="global-search-suggestion-copy">{{
                        suggestion
                      }}</span>
                    </button>
                  </div>

                  <div
                    v-if="quickSearchPrimaryArtist"
                    class="global-search-track-list"
                  >
                    <div
                      :key="`quick-artist-priority-${quickSearchPrimaryArtist.name}`"
                      class="global-search-track-item"
                      @click="
                        handleQuickSearchArtistClick(quickSearchPrimaryArtist)
                      "
                    >
                      <button
                        class="global-search-recent-cover"
                        type="button"
                        title="Abrir artista"
                        @click.stop="
                          handleQuickSearchArtistClick(quickSearchPrimaryArtist)
                        "
                      >
                        <img
                          v-if="quickSearchPrimaryArtist.cover"
                          :src="quickSearchPrimaryArtist.cover ?? undefined"
                          alt=""
                          class="global-search-thumb"
                        />
                        <div v-else class="global-search-thumb placeholder">
                          &#9835;
                        </div>
                        <span
                          class="global-search-play-overlay"
                          @click.stop="
                            playQuickSearchArtist(quickSearchPrimaryArtist)
                          "
                        >
                          <svg
                            v-if="
                              isSearchArtistPlaying(
                                quickSearchPrimaryArtist.name,
                              )
                            "
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <rect x="6" y="5" width="4" height="14"></rect>
                            <rect x="14" y="5" width="4" height="14"></rect>
                          </svg>
                          <svg
                            v-else
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <polygon points="7,5 19,12 7,19"></polygon>
                          </svg>
                        </span>
                      </button>

                      <div class="global-search-meta">
                        <button
                          class="global-search-item-title recent-search-link"
                          type="button"
                          @click.stop="
                            handleQuickSearchArtistClick(
                              quickSearchPrimaryArtist,
                            )
                          "
                        >
                          {{ quickSearchPrimaryArtist.name }}
                        </button>
                        <div
                          class="global-search-item-subtitle recent-search-subtitle"
                        >
                          <span class="recent-search-type">Artista</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="quickSearchAlbums.length > 0"
                    class="global-search-track-list"
                  >
                    <div
                      v-for="album in quickSearchAlbums.slice(0, 3)"
                      :key="`quick-album-${album.name}-${album.artist}`"
                      class="global-search-track-item"
                      @click="handleQuickSearchAlbumClick(album)"
                    >
                      <button
                        class="global-search-recent-cover"
                        type="button"
                        title="Abrir album"
                        @click.stop="handleQuickSearchAlbumClick(album)"
                      >
                        <img
                          v-if="album.cover"
                          :src="album.cover"
                          alt=""
                          class="global-search-thumb"
                        />
                        <div v-else class="global-search-thumb placeholder">
                          &#9835;
                        </div>
                        <span
                          class="global-search-play-overlay"
                          @click.stop="playQuickSearchAlbum(album)"
                        >
                          <svg
                            v-if="
                              isSearchAlbumPlaying(album.name, album.artist)
                            "
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <rect x="6" y="5" width="4" height="14"></rect>
                            <rect x="14" y="5" width="4" height="14"></rect>
                          </svg>
                          <svg
                            v-else
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <polygon points="7,5 19,12 7,19"></polygon>
                          </svg>
                        </span>
                      </button>

                      <div class="global-search-meta">
                        <button
                          class="global-search-item-title recent-search-link"
                          type="button"
                          @click.stop="handleQuickSearchAlbumClick(album)"
                        >
                          {{ album.name }}
                        </button>
                        <div
                          class="global-search-item-subtitle recent-search-subtitle"
                        >
                          <span class="recent-search-type">Album</span>
                          <span class="recent-search-separator">&bull;</span>
                          <button
                            class="recent-search-inline-link"
                            type="button"
                            @click.stop="goToArtist(album.artist)"
                          >
                            {{ album.artist }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="false && quickSearchPrimaryArtist"
                    class="global-search-track-list"
                  >
                    <div
                      :key="`quick-artist-${quickSearchPrimaryArtist.name}`"
                      class="global-search-track-item"
                      @click="
                        handleQuickSearchArtistClick(quickSearchPrimaryArtist)
                      "
                    >
                      <button
                        class="global-search-recent-cover"
                        type="button"
                        title="Abrir artista"
                        @click.stop="
                          handleQuickSearchArtistClick(quickSearchPrimaryArtist)
                        "
                      >
                        <img
                          v-if="quickSearchPrimaryArtist.cover"
                          :src="quickSearchPrimaryArtist.cover ?? undefined"
                          alt=""
                          class="global-search-thumb"
                        />
                        <div v-else class="global-search-thumb placeholder">
                          &#9835;
                        </div>
                      </button>

                      <div class="global-search-meta">
                        <button
                          class="global-search-item-title recent-search-link"
                          type="button"
                          @click.stop="
                            handleQuickSearchArtistClick(
                              quickSearchPrimaryArtist,
                            )
                          "
                        >
                          {{ quickSearchPrimaryArtist.name }}
                        </button>
                        <div
                          class="global-search-item-subtitle recent-search-subtitle"
                        >
                          <span class="recent-search-type">Artista</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="quickSearchTracks.length > 0"
                    class="global-search-track-list"
                  >
                    <div
                      v-for="track in quickSearchTracks"
                      :key="`quick-${track.path}`"
                      class="global-search-track-item"
                      @click="handleQuickSearchTrackClick(track)"
                    >
                      <button
                        class="global-search-recent-cover"
                        type="button"
                        title="Reproducir cancion"
                        @click.stop="playQuickSearchTrack(track)"
                      >
                        <img
                          v-if="getLibraryTrackCover(track)"
                          :src="getLibraryTrackCover(track)!"
                          alt=""
                          class="global-search-thumb"
                        />
                        <div v-else class="global-search-thumb placeholder">
                          &#9835;
                        </div>
                        <span class="global-search-play-overlay">
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <polygon points="7,5 19,12 7,19"></polygon>
                          </svg>
                        </span>
                      </button>

                      <div class="global-search-meta">
                        <button
                          class="global-search-item-title recent-search-link"
                          type="button"
                          @click.stop="handleQuickSearchTrackClick(track)"
                        >
                          {{ getTrackDisplayTitle(track) }}
                        </button>
                        <div
                          class="global-search-item-subtitle recent-search-subtitle"
                        >
                          <span class="recent-search-type">Cancion</span>
                          <span class="recent-search-separator">&bull;</span>
                          <button
                            class="recent-search-inline-link"
                            type="button"
                            @click.stop="
                              goToArtist(getPrimaryTrackArtist(track))
                            "
                          >
                            {{ getPrimaryTrackArtist(track) }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="!hasQuickSearchResults"
                    class="global-search-empty-state"
                  >
                    No encontré coincidencias rápidas para "{{
                      globalSearch.trim()
                    }}".
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="isGlobalSearchPopoverVisible && false"
        class="global-search-popover-wrap"
      >
        <div class="global-search-popover glass-panel-inner">
          <template v-if="!globalSearch.trim()">
            <div class="global-search-section-title">Búsquedas recientes</div>

            <button
              v-for="item in recentGlobalSearches"
              :key="`${item.query}-${item.title}`"
              class="global-search-recent-item"
              type="button"
              @click="handleRecentGlobalSearchClick(item)"
            >
              <img
                v-if="item.cover"
                :src="item.cover!"
                alt=""
                class="global-search-thumb"
              />
              <div v-else class="global-search-thumb placeholder">♪</div>

              <div class="global-search-meta">
                <div class="global-search-item-title">{{ item.title }}</div>
                <div class="global-search-item-subtitle">
                  {{ item.subtitle }}
                </div>
              </div>
            </button>

            <div
              v-if="recentGlobalSearches.length === 0"
              class="global-search-empty-state"
            >
              Tus búsquedas recientes aparecerán aquí.
            </div>
          </template>

          <template v-else-if="isGlobalSearchLoading">
            <div class="global-search-skeleton-list">
              <div
                v-for="i in 6"
                :key="`search-skeleton-${i}`"
                class="global-search-skeleton-item"
              >
                <div class="global-search-skeleton-thumb"></div>
                <div class="global-search-skeleton-copy">
                  <div class="global-search-skeleton-line large"></div>
                  <div class="global-search-skeleton-line small"></div>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="global-search-popover-topbar">
              <div class="global-search-kbd-hint">
                <span class="topbar-shortcut-key">↵</span>
                <span>Ingresar búsqueda</span>
              </div>

              <button
                class="small-action-btn global-search-submit-btn"
                type="button"
                @click="commitGlobalSearch()"
              >
                Buscar
              </button>
            </div>

            <div
              v-if="quickSearchSuggestions.length > 0"
              class="global-search-suggestions"
            >
              <button
                v-for="suggestion in quickSearchSuggestions"
                :key="suggestion"
                class="global-search-suggestion-item"
                type="button"
                @click="applyQuickSearchSuggestion(suggestion)"
              >
                <span class="global-search-suggestion-icon">⌕</span>
                <span class="global-search-suggestion-copy">{{
                  suggestion
                }}</span>
              </button>
            </div>

            <div
              v-if="quickSearchTracks.length > 0"
              class="global-search-track-list"
            >
              <button
                v-for="track in quickSearchTracks"
                :key="`quick-${track.path}`"
                class="global-search-track-item"
                type="button"
                @click="
                  closeGlobalSearchPopover();
                  playTrackFromLibrary(track);
                "
              >
                <img
                  v-if="getLibraryTrackCover(track)"
                  :src="getLibraryTrackCover(track)!"
                  alt=""
                  class="global-search-thumb"
                />
                <div v-else class="global-search-thumb placeholder">♪</div>

                <div class="global-search-meta">
                  <div class="global-search-item-title">
                    {{ getTrackDisplayTitle(track) }}
                  </div>
                  <div class="global-search-item-subtitle">
                    Canción • {{ getLibraryTrackArtist(track) }}
                  </div>
                </div>
              </button>
            </div>

            <div
              v-if="!hasQuickSearchResults"
              class="global-search-empty-state"
            >
              No encontré coincidencias rápidas para "{{
                globalSearch.trim()
              }}".
            </div>
          </template>
        </div>
      </div>

      <div
        v-if="isRoutesManagerOpen"
        class="routes-modal-backdrop"
        @click.self="isRoutesManagerOpen = false"
      >
        <div class="routes-modal glass-panel">
          <div class="routes-modal-header">
            <div>
              <div class="panel-title">Rutas de musica</div>
              <div class="panel-subtitle">
                {{ musicDirectories.length }} ruta(s) configurada(s)
              </div>
            </div>

            <button
              class="glass-button secondary-button routes-close-btn"
              type="button"
              @click="isRoutesManagerOpen = false"
            >
              Cerrar
            </button>
          </div>

          <div class="routes-modal-actions">
            <button
              class="glass-button"
              type="button"
              @click="añadirRutaMusica"
            >
              Anadir ruta
            </button>

            <button
              class="glass-button secondary-button danger-soft"
              type="button"
              :disabled="musicDirectories.length === 0"
              @click="clearMusicDirectories"
            >
              Quitar todas
            </button>
          </div>

          <div v-if="musicDirectories.length > 0" class="routes-list">
            <div
              v-for="path in musicDirectories"
              :key="path"
              class="routes-list-item glass-panel-inner"
            >
              <div class="routes-list-copy">
                <div class="routes-list-label">Ruta guardada</div>
                <div class="routes-list-path">{{ path }}</div>
              </div>

              <button
                class="small-action-btn danger"
                type="button"
                @click="removeMusicDirectory(path)"
              >
                Quitar
              </button>
            </div>
          </div>

          <div v-else class="routes-empty glass-panel-inner">
            <div class="routes-empty-title">Aun no tienes rutas guardadas</div>
            <div class="routes-empty-copy">
              Usa "Anadir ruta" para registrar una o varias carpetas de musica.
            </div>
          </div>
        </div>
      </div>

      <div class="main-view-area">
        <div v-if="!isLyricsMode" class="main-layout">
          <div class="library-panel glass-panel-inner">
            <template v-if="isSearchViewActive">
              <div class="search-results-view">
                <div class="search-results-hero">
                  <div class="search-results-heading">
                    Resultados para "{{ committedGlobalSearch }}"
                  </div>
                  <div class="panel-title-subtitle">
                    {{ committedSearchTracks.length }} canciones,
                    {{ committedSearchArtists.length }} artistas y
                    {{ committedSearchAlbums.length }} álbumes
                  </div>
                </div>

                <div
                  v-if="committedSearchTopResult"
                  class="search-results-main-grid"
                >
                  <div class="search-top-result">
                    <div class="search-section-title">Resultado principal</div>
                    <button
                      class="search-top-card glass-panel-inner"
                      :class="{
                        'search-top-card-artist':
                          committedSearchTopResult.kind === 'artist',
                      }"
                      type="button"
                      @click="committedSearchTopResult.action()"
                    >
                      <div
                        class="search-top-card-media"
                        :class="{
                          'search-top-card-media-artist':
                            committedSearchTopResult.kind === 'artist',
                        }"
                      >
                        <img
                          v-if="committedSearchTopResult.cover"
                          :src="committedSearchTopResult.cover"
                          alt=""
                          class="search-top-card-cover"
                          :class="{
                            'search-top-card-cover-artist':
                              committedSearchTopResult.kind === 'artist',
                          }"
                        />
                        <div v-else class="search-top-card-cover placeholder">
                          ♪
                        </div>

                        <span
                          class="search-top-card-play-overlay"
                          @click.stop="committedSearchTopResult.playAction()"
                        >
                          <svg
                            v-if="
                              (committedSearchTopResult.kind === 'song' &&
                                committedSearchTracks[0] &&
                                isSearchTrackPlaying(
                                  committedSearchTracks[0],
                                )) ||
                              (committedSearchTopResult.kind === 'album' &&
                                isSearchAlbumPlaying(
                                  committedSearchTopResult.title,
                                  committedSearchAlbums[0]?.artist,
                                )) ||
                              (committedSearchTopResult.kind === 'artist' &&
                                isSearchArtistPlaying(
                                  committedSearchTopResult.title,
                                ))
                            "
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <rect x="6" y="5" width="4" height="14"></rect>
                            <rect x="14" y="5" width="4" height="14"></rect>
                          </svg>
                          <svg
                            v-else
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <polygon points="7,5 19,12 7,19"></polygon>
                          </svg>
                        </span>
                      </div>

                      <div class="search-top-card-copy">
                        <div class="search-top-card-title">
                          {{ committedSearchTopResult.title }}
                        </div>
                        <div class="search-top-card-subtitle">
                          {{ committedSearchTopResult.subtitle }}
                        </div>
                      </div>
                    </button>
                  </div>

                  <div class="search-songs-section">
                    <div class="search-section-title">Canciones</div>

                    <button
                      v-for="track in committedSearchTracks.slice(0, 4)"
                      :key="`search-view-${track.path}`"
                      class="search-song-row"
                      type="button"
                      @click="playTrackFromLibrary(track)"
                    >
                      <div class="search-song-main">
                        <div class="search-song-cover-wrap">
                          <img
                            v-if="getLibraryTrackCover(track)"
                            :src="getLibraryTrackCover(track)!"
                            alt=""
                            class="search-song-cover"
                          />
                          <div v-else class="search-song-cover placeholder">
                            ♪
                          </div>
                          <span
                            class="search-card-play-overlay"
                            @click.stop="playTrackFromLibrary(track)"
                          >
                            <svg
                              v-if="isSearchTrackPlaying(track)"
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <rect x="6" y="5" width="4" height="14"></rect>
                              <rect x="14" y="5" width="4" height="14"></rect>
                            </svg>
                            <svg
                              v-else
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <polygon points="7,5 19,12 7,19"></polygon>
                            </svg>
                          </span>
                        </div>

                        <div class="search-song-copy">
                          <div class="search-song-title">
                            {{ getTrackDisplayTitle(track) }}
                          </div>
                          <div class="search-song-subtitle">
                            {{ getLibraryTrackArtist(track) }}
                          </div>
                        </div>
                      </div>

                      <div class="search-song-duration">
                        {{ getLibraryTrackDuration(track) }}
                      </div>
                    </button>
                  </div>
                </div>

                <div
                  v-if="committedSearchArtists.length > 0"
                  class="search-results-section"
                >
                  <div class="search-section-title">Artistas</div>
                  <div class="search-circle-grid">
                    <button
                      v-for="artist in committedSearchArtists.slice(0, 6)"
                      :key="`artist-${artist.name}`"
                      class="search-circle-card"
                      type="button"
                      @click="goToArtist(artist.name)"
                    >
                      <div class="search-card-media">
                        <img
                          v-if="artist.cover"
                          :src="artist.cover"
                          alt=""
                          class="search-circle-cover"
                        />
                        <div v-else class="search-circle-cover placeholder">
                          ♪
                        </div>
                        <span
                          class="search-card-play-overlay search-card-play-overlay-circle"
                          @click.stop="playArtist(artist.name)"
                        >
                          <svg
                            v-if="isSearchArtistPlaying(artist.name)"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <rect x="6" y="5" width="4" height="14"></rect>
                            <rect x="14" y="5" width="4" height="14"></rect>
                          </svg>
                          <svg
                            v-else
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <polygon points="7,5 19,12 7,19"></polygon>
                          </svg>
                        </span>
                      </div>
                      <div class="search-circle-title">{{ artist.name }}</div>
                      <div class="search-circle-subtitle">Artista</div>
                    </button>
                  </div>
                </div>

                <div
                  v-if="committedSearchAlbums.length > 0"
                  class="search-results-section"
                >
                  <div class="search-section-title">Álbumes</div>
                  <div class="search-album-grid">
                    <button
                      v-for="album in committedSearchAlbums.slice(0, 6)"
                      :key="`album-${album.name}-${album.artist}`"
                      class="search-album-card"
                      type="button"
                      @click="goToAlbum(album.name, album.artist)"
                    >
                      <div class="search-card-media">
                        <img
                          v-if="album.cover"
                          :src="album.cover"
                          alt=""
                          class="search-album-cover"
                        />
                        <div v-else class="search-album-cover placeholder">
                          ♪
                        </div>
                        <span
                          class="search-card-play-overlay"
                          @click.stop="
                            playAlbumResult(album.name, album.artist)
                          "
                        >
                          <svg
                            v-if="
                              isSearchAlbumPlaying(album.name, album.artist)
                            "
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <rect x="6" y="5" width="4" height="14"></rect>
                            <rect x="14" y="5" width="4" height="14"></rect>
                          </svg>
                          <svg
                            v-else
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <polygon points="7,5 19,12 7,19"></polygon>
                          </svg>
                        </span>
                      </div>
                      <div class="search-album-title">{{ album.name }}</div>
                      <div class="search-album-subtitle">
                        {{ album.artist }}
                      </div>
                    </button>
                  </div>
                </div>

                <div
                  v-if="
                    !committedSearchTopResult &&
                    committedSearchArtists.length === 0 &&
                    committedSearchAlbums.length === 0
                  "
                  class="global-search-empty-state search-view-empty"
                >
                  No encontré resultados para "{{ committedGlobalSearch }}".
                </div>
              </div>
            </template>

            <template v-else>
              <div class="panel-header">
                <div class="library-header-group">
                  <div>
                    <div class="panel-title">{{ currentViewTitle }}</div>
                    <div class="panel-title-subtitle">
                      {{ displayedTracks.length }} canciones
                    </div>
                  </div>
                </div>

                <div class="library-header-actions">
                  <button
                    class="small-action-btn"
                    type="button"
                    @click="addAllFilteredToQueue"
                    :disabled="displayedTracks.length === 0"
                  >
                    Añadir visibles a la fila
                  </button>
                </div>
              </div>

              <div class="search-row" v-if="currentViewMode !== 'album'">
                <div class="search-input-wrapper">
                  <input
                    ref="librarySearchInputRef"
                    v-model="librarySearch"
                    type="text"
                    class="search-input"
                    :placeholder="librarySearchPlaceholder"
                  />

                  <button
                    v-if="librarySearch"
                    class="search-clear-btn"
                    @click="librarySearch = ''"
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div v-if="playlist.length === 0" class="library-empty">
                <div class="empty-title small-title">
                  No hay canciones cargadas
                </div>
                <div class="empty-subtitle">
                  Añade una o varias carpetas de música para construir tu
                  biblioteca.
                </div>
              </div>

              <div
                v-else
                ref="albumScrollContainerRef"
                class="tracks-list spotify-list"
                :class="{
                  'album-sticky-active':
                    currentViewMode === 'album' && compactAlbumBarVisible,
                }"
                @scroll="updateAlbumCompactBar"
              >
                <div
                  v-if="currentViewMode === 'album'"
                  ref="albumHeroRef"
                  class="spotify-album-hero"
                >
                  <div class="sah-content">
                    <img
                      v-if="activeAlbumCover"
                      :src="activeAlbumCover"
                      class="sah-cover glass-shadow"
                      alt="Album Cover"
                    />
                    <div v-else class="sah-cover-placeholder glass-shadow">
                      ♪
                    </div>

                    <div class="sah-info">
                      <span class="sah-type">EP</span>
                      <h1 class="sah-title">{{ activeAlbumView }}</h1>
                      <div class="sah-meta">
                        <img
                          v-if="activeAlbumCover"
                          :src="activeAlbumCover"
                          class="sah-artist-avatar"
                          alt="Artist"
                        />
                        <span
                          v-for="(artist, i) in splitArtists(activeAlbumArtist)"
                          :key="artist"
                        >
                          <span
                            class="sah-artist hoverable-link"
                            @click="goToArtist(artist)"
                            >{{ artist }}</span
                          >
                          <span
                            v-if="
                              i < splitArtists(activeAlbumArtist).length - 1
                            "
                            >,
                          </span>
                        </span>

                        <span class="sah-bullet">•</span>
                        <span>{{ activeAlbumYear }}</span>
                        <span class="sah-bullet">•</span>
                        <span
                          >{{ activeAlbumTracks.length }} canciones,
                          <span class="sah-duration">{{
                            activeAlbumDurationFormatted
                          }}</span></span
                        >
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  v-if="currentViewMode === 'album'"
                  class="spotify-album-actions"
                >
                  <button class="sah-play-btn glass-shadow" @click="playAlbum">
                    <svg
                      v-if="isActiveAlbumPlaying"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <rect x="6" y="4" width="4" height="16"></rect>
                      <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>

                    <svg
                      v-else
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                  </button>
                  <button class="sah-icon-btn">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                      ></path>
                    </svg>
                  </button>
                  <button class="sah-icon-btn">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle cx="12" cy="12" r="1"></circle>
                      <circle cx="19" cy="12" r="1"></circle>
                      <circle cx="5" cy="12" r="1"></circle>
                    </svg>
                  </button>
                </div>

                <div
                  v-if="currentViewMode === 'album'"
                  class="search-row album-search-row"
                >
                  <div class="search-input-wrapper">
                    <input
                      ref="librarySearchInputRef"
                      v-model="librarySearch"
                      type="text"
                      class="search-input"
                      :placeholder="librarySearchPlaceholder"
                    />

                    <button
                      v-if="librarySearch"
                      class="search-clear-btn"
                      @click="librarySearch = ''"
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div
                  v-if="
                    currentViewMode === 'artist' &&
                    activeArtistAlbums.length > 0
                  "
                  class="artist-albums-grid"
                >
                  <h3 class="section-subtitle">Álbumes</h3>
                  <div class="albums-grid">
                    <div
                      v-for="album in activeArtistAlbums"
                      :key="album.name"
                      class="album-card glass-panel-inner"
                      @click="goToAlbum(album.name, activeArtistView)"
                    >
                      <img v-if="album.cover" :src="album.cover" alt="cover" />
                      <div v-else class="album-cover-placeholder">♪</div>
                      <div class="album-name">{{ album.name }}</div>
                    </div>
                  </div>
                  <h3 class="section-subtitle">Canciones</h3>
                </div>

                <div
                  v-if="currentViewMode === 'album'"
                  class="album-compact-sticky-bar"
                  :class="{ visible: compactAlbumBarVisible }"
                  :style="compactAlbumBarStyle"
                >
                  <button class="album-compact-play-btn" @click="playAlbum">
                    <svg
                      v-if="isActiveAlbumPlaying"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <rect x="6" y="4" width="4" height="16"></rect>
                      <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>

                    <svg
                      v-else
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                  </button>

                  <div class="album-compact-meta">
                    <div class="album-compact-title">{{ activeAlbumView }}</div>
                  </div>
                </div>

                <div
                  class="library-table-head"
                  :class="{
                    'album-view-grid': currentViewMode === 'album',
                    'with-compact-album-bar':
                      currentViewMode === 'album' && compactAlbumBarVisible,
                  }"
                >
                  <div class="col-index">#</div>
                  <div class="col-title">Título</div>
                  <div class="col-album" v-if="currentViewMode !== 'album'">
                    Álbum
                  </div>
                  <div class="col-added">Agregado</div>
                  <div class="col-time">⏱</div>
                </div>

                <div
                  v-for="(track, index) in displayedTracks"
                  :key="track.path"
                  class="track-row spotify-row"
                  :class="{
                    active: isLibraryTrackActive(track),
                    selected: isLibraryTrackSelected(track),
                    hovered: isLibraryTrackHovered(track),
                    playing: isLibraryTrackCurrent(track) && isPlaying,
                    paused: isLibraryTrackCurrent(track) && !isPlaying,
                    'album-view-grid': currentViewMode === 'album',
                  }"
                  :data-track-path="track.path"
                  @mouseenter="hoveredLibraryTrackPath = track.path"
                  @mouseleave="hoveredLibraryTrackPath = null"
                  @click.stop="selectLibraryTrack(track)"
                  @contextmenu="openTrackContextMenu($event, track)"
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
                      {{
                        currentViewMode === "album"
                          ? (getLibraryTrackMetadata(track)?.track_number ??
                            index + 1)
                          : index + 1
                      }}
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
                    @click.stop="selectLibraryTrack(track)"
                  >
                    <div class="row-cover" v-if="currentViewMode !== 'album'">
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
                        <span
                          v-for="(artist, i) in splitArtists(
                            getLibraryTrackArtist(track),
                          )"
                          :key="artist"
                        >
                          <span
                            class="hoverable-link"
                            @click.stop="goToArtist(artist)"
                            >{{ artist }}</span
                          >
                          <span
                            v-if="
                              i <
                              splitArtists(getLibraryTrackArtist(track))
                                .length -
                                1
                            "
                            >,
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    class="col-album row-album hoverable-link"
                    v-if="currentViewMode !== 'album'"
                    @click.stop="
                      goToAlbum(
                        getLibraryTrackAlbum(track),
                        getAlbumArtistForTrack(track),
                      )
                    "
                  >
                    {{ getLibraryTrackAlbum(track) }}
                  </div>

                  <div class="col-added row-added">Local</div>

                  <div class="col-time row-time-actions">
                    <span class="row-duration">{{
                      getLibraryTrackDuration(track)
                    }}</span>
                    <button
                      class="library-row-menu-btn"
                      type="button"
                      aria-label="Más opciones"
                      @click.stop="openTrackContextMenu($event, track)"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <circle cx="5" cy="12" r="1.8"></circle>
                        <circle cx="12" cy="12" r="1.8"></circle>
                        <circle cx="19" cy="12" r="1.8"></circle>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div class="right-sidebar">
            <div
              v-if="isQueuePanelOpen"
              class="queue-panel glass-panel-inner"
              style="height: 100%"
            >
              <div class="panel-header">
                <div>
                  <div class="panel-title">Fila de reproducción</div>
                  <div class="panel-subtitle">
                    {{ queue.length }} elemento(s)
                  </div>
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

              <div v-if="queue.length === 0" class="queue-empty">
                <div class="empty-icon small">🧾</div>
                <div class="empty-title small-title">La fila está vacía</div>
                <div class="empty-subtitle">
                  Añade canciones desde la biblioteca para verlas aquí.
                </div>
              </div>

              <div v-else class="queue-list">
                <div
                  v-for="item in filteredQueueWithIndex"
                  :key="`${item.track.path}-${item.realIndex}`"
                  class="queue-row"
                  :class="{
                    active: isQueueTrackActive(item.track, item.realIndex),
                    hovered: hoveredQueueTrackId === item.track.queueId,
                  }"
                  @mouseenter="hoveredQueueTrackId = item.track.queueId"
                  @mouseleave="hoveredQueueTrackId = null"
                  @contextmenu="
                    openTrackContextMenu(
                      $event,
                      item.track,
                      'queue',
                      item.realIndex,
                    )
                  "
                >
                  <div class="queue-row-card">
                    <div
                      class="track-main-info"
                      @click="playTrackFromQueue(item.realIndex)"
                    >
                      <div class="queue-item-cover row-cover">
                        <img
                          v-if="getLibraryTrackCover(item.track)"
                          :src="getLibraryTrackCover(item.track)!"
                          alt="cover"
                        />
                        <div v-else class="row-cover-placeholder">♪</div>
                      </div>

                      <div class="queue-item-meta">
                        <div class="track-name">
                          {{ getTrackDisplayTitle(item.track) }}
                        </div>
                        <div class="track-path">
                          <span
                            v-for="(artist, i) in splitArtists(
                              getLibraryTrackArtist(item.track),
                            )"
                            :key="artist"
                          >
                            <span
                              class="hoverable-link queue-artist-link"
                              :title="artist"
                              @click.stop="goToArtist(artist)"
                              >{{ artist }}</span
                            >
                            <span
                              v-if="
                                i <
                                splitArtists(getLibraryTrackArtist(item.track))
                                  .length -
                                  1
                              "
                              >,
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div class="track-actions">
                      <button
                        class="row-btn queue-hover-btn"
                        type="button"
                        @click.stop="playTrackFromQueue(item.realIndex)"
                        aria-label="Reproducir"
                      >
                        ▶
                      </button>
                      <button
                        class="row-btn queue-hover-btn queue-dots-btn"
                        type="button"
                        @click.stop="
                          openTrackContextMenu(
                            $event,
                            item.track,
                            'queue',
                            item.realIndex,
                          )
                        "
                        aria-label="Más opciones"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-else
              class="player-and-meta"
              :class="{ 'has-canvas-bg': canvasUrl }"
            >
              <div class="player-panel">
                <button
                  class="playing-source-badge glass-panel-inner"
                  :class="{ 'floating-source-badge': canvasUrl }"
                  :aria-label="playbackSourceBadgeAriaLabel"
                  :disabled="!canNavigateFromPlaybackSourceLabel"
                  type="button"
                  @click="navigateFromPlaybackSourceLabel"
                >
                  <span>
                    <strong>{{ currentPlaybackSourceTargetLabel }}</strong>
                  </span>
                </button>

                <video
                  v-if="canvasUrl"
                  ref="canvasVideoRef"
                  :src="canvasUrl"
                  autoplay
                  loop
                  muted
                  playsinline
                  class="canvas-background"
                  @error="handleCanvasError"
                ></video>

                <div class="cover-container" v-if="!canvasUrl">
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

                <div
                  class="panel-content-overlay"
                  :class="{ 'glass-overlay': canvasUrl }"
                >
                  <div class="song-main">
                    <div class="song-title">{{ displayTitle }}</div>
                    <div class="song-subtitle">
                      {{ displayArtist }} &bull; {{ displayAlbum }}
                    </div>
                  </div>

                  <div v-if="audioError" class="error-box glass-panel-inner">
                    {{ audioError }}
                  </div>

                  <div v-if="filePath" class="meta-card glass-panel-inner">
                    <div class="meta-card-title">Propiedades del Archivo</div>
                    <div class="meta-grid">
                      <div class="meta-item">
                        <span class="meta-label">Título</span>
                        <span class="meta-value">{{
                          metadata?.title || "—"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Artista</span>
                        <span class="meta-value">{{
                          metadata?.artist || "—"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Álbum</span>
                        <span class="meta-value">{{
                          metadata?.album || "—"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Artista del álbum</span>
                        <span class="meta-value">{{
                          metadata?.album_artist || "—"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Género</span>
                        <span class="meta-value">{{
                          metadata?.genre || "—"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Compositor</span>
                        <span class="meta-value">{{
                          metadata?.composer || "—"
                        }}</span>
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
                        <span class="meta-value">{{
                          metadata?.year || "—"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Duración</span>
                        <span class="meta-value">{{
                          metadata?.duration_formatted || formatTime(duration)
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Bitrate</span>
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
                      <div class="meta-item">
                        <span class="meta-label">Sample rate</span>
                        <span class="meta-value">{{
                          metadata?.sample_rate
                            ? `${metadata.sample_rate} Hz`
                            : "—"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Bit depth</span>
                        <span class="meta-value">{{
                          metadata?.bit_depth
                            ? `${metadata.bit_depth} bits`
                            : "—"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Canales</span>
                        <span class="meta-value">{{
                          metadata?.channels || "—"
                        }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

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
              <path
                d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
              ></path>
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
      <div v-if="filePath" class="spotify-bottom-player glass-panel-inner">
        <div class="sbp-left">
          <img v-if="coverUrl" :src="coverUrl" class="sbp-cover" />
          <div v-else class="sbp-cover-placeholder">♪</div>
          <div class="sbp-info">
            <div class="sbp-title">{{ displayTitle }}</div>
            <div class="sbp-artist">
              <span
                v-for="(artist, i) in splitArtists(displayArtist)"
                :key="artist"
              >
                <span class="hoverable-link" @click.stop="goToArtist(artist)">{{
                  artist
                }}</span>
                <span v-if="i < splitArtists(displayArtist).length - 1"
                  >,
                </span>
              </span>
            </div>
          </div>
        </div>

        <div class="sbp-center">
          <div class="transport">
            <button
              class="control-btn small text-btn shuffle-btn"
              :class="{ active: isShuffleEnabled }"
              type="button"
              @click="toggleShuffle"
              :title="shuffleTooltip"
              :aria-label="shuffleTooltip"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                :stroke="isShuffleEnabled ? '#1ed760' : 'currentColor'"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M16 3h5v5" />
                <path d="M4 20L21 3" />
                <path d="M21 16v5h-5" />
                <path d="M15 15l6 6" />
                <path d="M4 4l5 5" />
              </svg>
            </button>

            <button
              class="control-btn icon-btn"
              type="button"
              @click="playPreviousTrack"
              title="Anterior"
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
              >
                <polygon points="11 19 2 12 11 5 11 19"></polygon>
                <polygon points="22 19 13 12 22 5 22 19"></polygon>
              </svg>
            </button>

            <button
              class="control-btn play-main sbp-play-btn glass-shadow"
              type="button"
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

            <button
              class="control-btn icon-btn"
              type="button"
              @click="playNextTrack()"
              title="Siguiente"
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
              >
                <polygon points="13 19 22 12 13 5 13 19"></polygon>
                <polygon points="2 19 11 12 2 5 2 19"></polygon>
              </svg>
            </button>

            <button
              class="control-btn small text-btn loop-btn"
              :class="{ active: loopMode !== 'off' }"
              type="button"
              @click="toggleLoop"
              :title="loopTooltip"
              :aria-label="loopTooltip"
            >
              <svg
                v-if="loopMode === 'off'"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path d="M17 1l4 4-4 4"></path>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <path d="M7 23l-4-4 4-4"></path>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
              </svg>

              <svg
                v-else-if="loopMode === 'all'"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1ed760"
                stroke-width="1.8"
              >
                <path d="M17 1l4 4-4 4"></path>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <path d="M7 23l-4-4 4-4"></path>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
              </svg>

              <svg
                v-else
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1ed760"
                stroke-width="1.8"
              >
                <path d="M17 1l4 4-4 4"></path>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <path d="M7 23l-4-4 4-4"></path>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                <text
                  x="12"
                  y="16"
                  text-anchor="middle"
                  font-size="10"
                  fill="#1ed760"
                  font-weight="700"
                >
                  1
                </text>
              </svg>
            </button>
          </div>

          <div class="sbp-progress">
            <span class="sbp-time">{{ formatTime(visibleCurrentTime) }}</span>

            <div class="progress-slider-wrap">
              <div
                v-if="showProgressTooltip"
                class="progress-tooltip"
                :style="{ left: `${hoverTooltipLeft}px` }"
              >
                {{ formatTime(hoverPreviewTime) }}
              </div>

              <input
                ref="progressBarRef"
                class="progress-slider"
                type="range"
                min="0"
                :max="duration || metadata?.duration_seconds || 0"
                :value="visibleCurrentTime"
                step="0.1"
                @mouseenter="onProgressEnter"
                @mousemove="onProgressHover"
                @mouseleave="onProgressLeave"
                @mousedown="onSeekStart"
                @touchstart="onSeekStart"
                @input="onSeekInput"
                @change="onSeekCommit"
                :style="{ backgroundSize: `${progressPercentage}% 100%` }"
              />
            </div>

            <span class="sbp-time">{{
              formatTime(duration || metadata?.duration_seconds || 0)
            }}</span>
          </div>
        </div>

        <div class="sbp-right">
          <div class="sbp-tools-row">
            <button
              class="control-btn small text-btn mic-btn"
              :class="{ active: isLyricsMode || hasSynced || hasStatic }"
              type="button"
              @click="toggleLyricsMode"
              title="Letras"
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3z"
                />
                <path d="M19 11a7 7 0 0 1-14 0" />
                <path d="M12 18v3" />
                <path d="M9 21h6" />
              </svg>
            </button>

            <button
              class="control-btn small text-btn icon-btn-muted"
              :class="{ active: isQueuePanelOpen }"
              type="button"
              @click="isQueuePanelOpen = !isQueuePanelOpen"
              :title="isQueuePanelOpen ? 'Ocultar fila' : 'Mostrar fila'"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="5" y1="7" x2="19" y2="7"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <line x1="5" y1="17" x2="19" y2="17"></line>
              </svg>
            </button>

            <div class="sbp-volume-container">
              <button
                class="control-btn small icon-btn-muted volume-icon-btn"
                type="button"
                @click="toggleMute"
                title="Volumen"
              >
                <svg
                  v-if="volumeIconMode === 'muted'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"></polygon>
                  <line x1="16" y1="9" x2="21" y2="14"></line>
                  <line x1="21" y1="9" x2="16" y2="14"></line>
                </svg>

                <svg
                  v-else-if="volumeIconMode === 'low'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"></polygon>
                  <path d="M16 10.2a2.7 2.7 0 0 1 0 3.6"></path>
                </svg>

                <svg
                  v-else-if="volumeIconMode === 'medium'"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"></polygon>
                  <path d="M16 10.2a2.7 2.7 0 0 1 0 3.6"></path>
                  <path d="M18.4 8.4a5.4 5.4 0 0 1 0 7.2"></path>
                </svg>

                <svg
                  v-else
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"></polygon>
                  <path d="M16 10.2a2.7 2.7 0 0 1 0 3.6"></path>
                  <path d="M18.4 8.4a5.4 5.4 0 0 1 0 7.2"></path>
                  <path d="M20.8 6.4a8.2 8.2 0 0 1 0 11.2"></path>
                </svg>
              </button>

              <input
                class="volume-slider progress-slider"
                type="range"
                min="0"
                max="100"
                :value="volume"
                @input="onVolumeChange"
                :style="{ backgroundSize: `${volume}% 100%` }"
              />
            </div>
          </div>

          <div v-if="outputDeviceInfo" class="sbp-device">
            <div class="sbp-device-label">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path
                  d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"
                ></path>
              </svg>
              <span>Reproduciendo a través de</span>
            </div>

            <div class="sbp-device-name">
              {{ outputDeviceInfo.device_name }}
            </div>

            <div class="sbp-device-meta">
              {{ (outputDeviceInfo.sample_rate / 1000).toFixed(1) }} kHz /
              {{ outputDeviceInfo.sample_format }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div
    v-if="contextMenu.visible"
    class="track-context-menu"
    :style="contextMenuStyle"
    @click.stop
  >
    <button
      class="context-menu-item"
      type="button"
      @click="toggleContextMenuTrackPlayback"
    >
      {{
        contextMenuTargetsCurrentTrack
          ? isPlaying
            ? "Pausar"
            : "Reanudar"
          : "Reproducir"
      }}
    </button>
    <button
      class="context-menu-item"
      type="button"
      @click="addContextMenuTrackToQueue"
    >
      Agregar a la fila de reproducción
    </button>
    <div
      v-if="contextMenuCanRemoveFromQueue"
      class="context-menu-separator"
    ></div>
    <button
      v-if="contextMenuCanRemoveFromQueue"
      class="context-menu-item"
      type="button"
      @click="removeContextMenuTrackFromQueue"
    >
      Quitar de la fila
    </button>
    <div class="context-menu-separator"></div>
    <button
      class="context-menu-item"
      type="button"
      @click="goToContextMenuArtist"
    >
      Ir al artista
    </button>
    <button
      class="context-menu-item"
      type="button"
      @click="goToContextMenuAlbum"
    >
      Ir al álbum
    </button>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.app {
  position: relative;
  min-height: 100vh;
  width: 100vw; /* Asegura que tome todo el ancho */
  background-color: #0f1115;
  color: #ffffff;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
    sans-serif;

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
  max-width: 100%; /* Ignoramos el límite de 1600px para que se estire a los lados */
  height: 100vh; /* Exactamente lo que pediste: ocupa el 98% del alto de la pantalla */

  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow: hidden;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 10px 2px 5px;
}

.topbar-nav {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.topbar-nav-btn {
  width: 34px;
  height: 34px;
  color: rgba(255, 255, 255, 0.82);
}

.topbar-search-shell {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  position: relative;
}

.topbar-home-btn {
  width: 56px;
  height: 56px;
  background: rgba(255, 255, 255, 0.08);
}

.topbar-search {
  width: min(640px, 100%);
  min-width: 0;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px 0 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    0 16px 38px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.02);
  position: relative;
  z-index: 42;
}

.topbar-search-icon {
  color: rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
}

.topbar-search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
}

.topbar-search-input::placeholder {
  color: rgba(255, 255, 255, 0.42);
}

.topbar-search-shortcuts {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.topbar-shortcut-key {
  min-width: 34px;
  height: 30px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.topbar-search-divider {
  width: 1px;
  height: 26px;
  background: rgba(255, 255, 255, 0.14);
  flex-shrink: 0;
}

.topbar-icon-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.topbar-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  transform: scale(1.04);
}

.global-search-popover-wrap {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: auto;
  width: 100%;
  transform: none;
  z-index: 35;
  display: flex;
  justify-content: flex-start;
  pointer-events: none;
}

.global-search-popover {
  width: 100%;
  min-height: 120px;
  max-height: 66vh;
  overflow-y: auto;
  padding: 14px 14px 12px;
  border-radius: 18px;
  background: rgba(34, 34, 36, 0.98);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.46);
  pointer-events: auto;
}

.global-search-section-title,
.search-section-title {
  font-size: 17px;
  font-weight: 800;
  color: #ffffff;
  margin-bottom: 14px;
}

.global-search-recent-item,
.global-search-track-item,
.global-search-suggestion-item,
.search-song-row,
.search-circle-card,
.search-album-card,
.search-top-card {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.global-search-recent-item,
.global-search-track-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 14px;
  transition:
    background 0.18s ease,
    transform 0.18s ease;
}

.global-search-recent-item:hover,
.global-search-track-item:hover,
.global-search-suggestion-item:hover,
.search-song-row:hover,
.search-circle-card:hover,
.search-album-card:hover,
.search-top-card:hover {
  background: rgba(255, 255, 255, 0.09);
}

.global-search-recent-item:hover {
  transform: translateY(-1px);
}

.global-search-recent-cover {
  position: relative;
  border: none;
  padding: 0;
  background: transparent;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
}

.global-search-recent-cover:focus-visible,
.recent-search-link:focus-visible,
.recent-search-inline-link:focus-visible,
.recent-search-remove-btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.4);
  outline-offset: 2px;
}

.global-search-thumb {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
}

.global-search-play-overlay {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.38);
  opacity: 0;
  transition: opacity 0.18s ease;
  pointer-events: none;
}

.global-search-recent-item:hover .global-search-play-overlay,
.global-search-recent-item:focus-within .global-search-play-overlay,
.global-search-track-item:hover .global-search-play-overlay,
.global-search-track-item:focus-within .global-search-play-overlay {
  opacity: 1;
}

.placeholder {
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.35);
}

.global-search-meta {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}

.recent-search-meta {
  padding-right: 10px;
}

.global-search-item-title {
  font-size: 16px;
  font-weight: 800;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-search-link,
.recent-search-inline-link,
.recent-search-remove-btn {
  border: none;
  background: transparent;
  padding: 0;
  color: inherit;
  cursor: pointer;
  text-decoration: none;
}

.recent-search-link {
  text-align: left;
}

.global-search-item-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-search-subtitle {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
}

.recent-search-type,
.recent-search-separator {
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.recent-search-inline-link {
  color: rgba(255, 255, 255, 0.68);
  min-width: 0;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.18s ease;
}

.recent-search-link:hover,
.recent-search-inline-link:hover {
  color: #ffffff;
  text-decoration: underline;
}

.recent-search-remove-btn {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 24px;
  line-height: 1;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    background 0.18s ease,
    color 0.18s ease;
}

.global-search-recent-item:hover .recent-search-remove-btn,
.global-search-recent-item:focus-within .recent-search-remove-btn {
  opacity: 1;
  pointer-events: auto;
}

.recent-search-remove-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.global-search-empty-state {
  padding: 18px 8px 8px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 14px;
}

.global-search-skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.global-search-skeleton-item {
  display: flex;
  align-items: center;
  gap: 18px;
}

.global-search-skeleton-thumb,
.global-search-skeleton-line {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.06) 0%,
    rgba(255, 255, 255, 0.14) 50%,
    rgba(255, 255, 255, 0.06) 100%
  );
  background-size: 220% 100%;
  animation: searchSkeletonPulse 1.1s linear infinite;
}

.global-search-skeleton-thumb {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  flex-shrink: 0;
}

.global-search-skeleton-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.global-search-skeleton-line {
  height: 14px;
  border-radius: 999px;
}

.global-search-skeleton-line.large {
  width: min(420px, 88%);
}

.global-search-skeleton-line.small {
  width: min(220px, 52%);
}

@keyframes searchSkeletonPulse {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.global-search-popover-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.global-search-popover-topbar.compact {
  gap: 16px;
}

.global-search-nav,
.global-search-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.global-search-nav {
  min-width: 0;
}

.global-search-nav-btn {
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.78);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  font-size: 18px;
  line-height: 1;
}

.global-search-nav-label {
  color: rgba(255, 255, 255, 0.58);
  font-size: 13px;
  font-weight: 700;
}

.global-search-kbd-hint {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 13px;
}

.global-search-submit-btn {
  flex-shrink: 0;
}

.global-search-suggestions,
.global-search-track-list {
  display: flex;
  flex-direction: column;
}

.global-search-suggestion-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 8px;
  border-radius: 14px;
  transition: background 0.18s ease;
  text-align: left;
}

.global-search-suggestion-icon {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.72);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 21px;
  flex-shrink: 0;
}

.global-search-suggestion-copy {
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.routes-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(4, 8, 14, 0.62);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.routes-modal {
  width: min(820px, 100%);
  max-height: min(78vh, 760px);
  padding: 22px;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.routes-modal-header,
.routes-modal-actions,
.routes-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.routes-modal-actions {
  flex-wrap: wrap;
}

.routes-close-btn {
  min-height: 38px;
  padding: 0 16px;
}

.routes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding-right: 4px;
}

.routes-list-item {
  padding: 16px 18px;
  align-items: flex-start;
}

.routes-list-copy {
  min-width: 0;
  flex: 1;
}

.routes-list-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 8px;
}

.routes-list-path {
  font-size: 14px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.92);
  word-break: break-word;
}

.routes-empty {
  padding: 24px;
  text-align: center;
}

.routes-empty-title {
  font-size: 16px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.95);
}

.routes-empty-copy {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.62);
}

.danger-soft {
  color: #ffd6d6;
  background: rgba(168, 51, 51, 0.22);
}

.danger-soft:hover {
  background: rgba(168, 51, 51, 0.32);
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

/* ============================
   CONFIGURACIÓN GENERAL VISTAS
   ============================ */
.main-view-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.main-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 20px;
  align-items: stretch;
  overflow: hidden;
}

.right-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.player-and-meta {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  margin-right: -4.5px;
}

/* Aseguramos que el panel completo sea el contenedor relativo para el fondo absoluto */
.player-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  text-align: center;
  flex-shrink: 0;
  width: 100%;
  border-radius: 16px;
  overflow: hidden; /* Para que el video no se salga de los bordes curvos */
  min-height: 100%; /* Para que ocupe todo el alto disponible */
}

/* El Canvas ocupa todo el fondo del panel */
.canvas-background {
  position: relative;
  width: 100%;
  height: 75vh; /* Define qué tan alto es el video inicialmente */
  object-fit: cover;
  border-radius: 16px;
  z-index: 0;
}
/* Contenedor principal para la metadata (Estado normal sin video) */
.panel-content-overlay {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 0; /* Sin padding cuando es la carátula normal */
}

/* ========================================================
   ESTILOS ESPECÍFICOS CUANDO HAY VIDEO (Canvas Spotify) 
   ======================================================== */
.panel-content-overlay.glass-overlay {
  position: relative; /* Vuelve a ser relativo para hacer scroll con toda la página */
  z-index: 1;
  width: 100%;

  /* ESTA ES LA CLAVE: Hala el contenedor hacia arriba montándolo sobre el video */
  margin-top: -38vh;

  /* Eliminamos los límites de altura y scroll interno */
  max-height: none;
  overflow-y: visible;

  /* Padding alto para que el texto empiece después del difuminado */
  padding: 120px 24px 24px 24px;

  /* Degradado: Completamente sólido en la metadata, difuminado donde está el título */
  background: linear-gradient(
    to top,
    rgba(15, 17, 21, 1) 0%,
    /* Fondo oscuro sólido abajo */ rgba(15, 17, 21, 1) 65%,
    /* Se mantiene sólido para tapar lo que sobra del video */
    rgba(15, 17, 21, 0.5) 85%,
    /* Se difumina suavemente */ transparent 100%
      /* Transparente en la parte más alta */
  );

  border-bottom-left-radius: 16px;
  border-bottom-right-radius: 16px;
}

/* Scrollbar sutil solo para este panel cuando tiene video */
.panel-content-overlay.glass-overlay::-webkit-scrollbar {
  width: 6px;
}
.panel-content-overlay.glass-overlay::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
}
.panel-content-overlay.glass-overlay::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* ============================ */

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
  /* Añadimos una transición suave para que el cambio de cuadrado a rectángulo se vea elegante */
  transition:
    max-width 0.4s cubic-bezier(0.25, 1, 0.5, 1),
    aspect-ratio 0.4s cubic-bezier(0.25, 1, 0.5, 1);
}

/* Cuando hay Canvas, cambiamos el formato a vertical (9:16) */
.cover-container.is-canvas {
  aspect-ratio: 9 / 16;
  max-width: 260px; /* Lo hacemos un poco más angosto para que el alto no desborde la pantalla */
}

/* OPCIONAL: Si tus videos no son perfectamente 9:16 y no quieres que se recorte NI UN PÍXEL, usa contain solo para el video */
video.cover-image {
  object-fit: cover; /* Cambia a "contain" si notas algún recorte indeseado */
  background-color: #000; /* Fondo negro por si usas contain */
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
  align-self: flex-start;
  width: auto;
  max-width: calc(100% - 32px);
  padding: 10px 14px;
  text-align: left;
  z-index: 2;
  font-size: 15px;
  border: none;
  color: inherit;
  cursor: pointer;
  transition:
    color 0.2s ease,
    transform 0.18s ease,
    background 0.2s ease;
}

.playing-source-badge:hover:not(:disabled) {
  color: #1ed760;
  transform: translateY(-1px);
}

.playing-source-badge:disabled {
  cursor: default;
}

.playing-source-badge:focus-visible {
  outline: 2px solid rgba(30, 215, 96, 0.8);
  outline-offset: 2px;
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

.icon-btn-muted {
  font-size: 16px;
  opacity: 0.7;
}

.icon-btn-muted:hover {
  opacity: 1;
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

.library-header-group {
  display: flex;
  align-items: center;
  min-width: 0;
}

.library-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.search-results-view {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 4px 12px 0;
  display: flex;
  flex-direction: column;
  gap: 36px;
}

.search-results-hero {
  display: none;
}

.search-results-heading {
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -0.04em;
  color: #ffffff;
}

.search-results-main-grid {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 28px;
  align-items: start;
}

.search-top-result,
.search-songs-section,
.search-results-section {
  min-width: 0;
}

.search-top-card {
  width: 100%;
  padding: 18px;
  border-radius: 22px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 0;
}

.search-top-card-artist {
  flex-direction: row;
  align-items: center;
  gap: 16px;
}

.search-top-card-media {
  position: relative;
  width: 100%;
}

.search-top-card-media-artist {
  width: 78px;
  min-width: 78px;
}

.search-top-card-cover {
  width: 100%;
  aspect-ratio: 1.18;
  border-radius: 14px;
  object-fit: cover;
  margin-bottom: 14px;
}

.search-top-card-cover-artist {
  aspect-ratio: 1;
  width: 78px;
  border-radius: 50%;
  margin-bottom: 0;
}

.search-top-card-copy {
  min-width: 0;
}

.search-top-card-title {
  font-size: 24px;
  font-weight: 900;
  line-height: 1.08;
  color: #ffffff;
}

.search-top-card-subtitle {
  margin-top: 10px;
  font-size: 15px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.62);
}

.search-top-card-artist .search-top-card-subtitle {
  margin-top: 6px;
}

.search-top-card-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 78px;
  height: 78px;
  border-radius: 50%;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(4px);
  opacity: 0;
  transition: opacity 0.18s ease;
  pointer-events: auto;
  cursor: pointer;
}

.search-card-media,
.search-song-cover-wrap {
  position: relative;
}

.search-card-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(5px);
  opacity: 0;
  transition: opacity 0.18s ease;
  cursor: pointer;
}

.search-card-play-overlay-circle {
  border-radius: 999px;
}

.search-song-row:hover .search-card-play-overlay,
.search-song-row:focus-within .search-card-play-overlay,
.search-circle-card:hover .search-card-play-overlay,
.search-circle-card:focus-within .search-card-play-overlay,
.search-album-card:hover .search-card-play-overlay,
.search-album-card:focus-within .search-card-play-overlay,
.search-top-card:hover .search-top-card-play-overlay,
.search-top-card:focus-within .search-top-card-play-overlay {
  opacity: 1;
}

.search-songs-section {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.search-song-row {
  width: 100%;
  padding: 10px 12px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  text-align: left;
  transition:
    background 0.18s ease,
    transform 0.18s ease;
}

.search-song-row:hover {
  transform: translateX(2px);
}

.search-song-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.search-song-cover-wrap {
  flex-shrink: 0;
}

.search-song-cover {
  width: 62px;
  height: 62px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
}

.search-song-copy {
  min-width: 0;
}

.search-song-title {
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-song-subtitle,
.search-circle-subtitle,
.search-album-subtitle {
  margin-top: 4px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.58);
}

.search-song-duration {
  flex-shrink: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.58);
  font-variant-numeric: tabular-nums;
}

.search-results-section {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.search-circle-grid,
.search-album-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 20px;
}

.search-circle-card,
.search-album-card {
  width: 100%;
  padding: 10px 4px;
  border-radius: 18px;
  text-align: left;
  transition:
    background 0.18s ease,
    transform 0.18s ease;
}

.search-circle-card:hover,
.search-album-card:hover {
  transform: translateY(-2px);
}

.search-circle-cover {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 999px;
  object-fit: cover;
}

.search-album-cover {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 18px;
  object-fit: cover;
}

.search-circle-title,
.search-album-title {
  margin-top: 14px;
  font-size: 16px;
  font-weight: 800;
  color: #ffffff;
}

.search-view-empty {
  padding-top: 12px;
}

.view-nav-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}

.view-nav-btn,
.view-home-btn {
  border: none;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease,
    opacity 0.18s ease,
    color 0.18s ease;
}

.view-nav-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: transparent;
}

.view-home-btn {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.24),
    0 0 0 1px rgba(255, 255, 255, 0.05);
}

.view-nav-btn svg {
  width: 22px;
  height: 22px;
}

.view-home-btn svg {
  width: 24px;
  height: 24px;
}

.view-nav-btn:hover:not(:disabled),
.view-home-btn:hover:not(:disabled) {
  transform: scale(1.05);
}

.view-nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.view-home-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
}

.view-nav-btn:disabled,
.view-home-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
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

/* SCROLLBARS LIMPIOS */
.tracks-list::-webkit-scrollbar,
.queue-list::-webkit-scrollbar,
.synced-lyrics-container::-webkit-scrollbar,
.static-lyrics-container::-webkit-scrollbar,
.player-and-meta::-webkit-scrollbar,
.search-results-view::-webkit-scrollbar {
  width: 8px;
}

.tracks-list::-webkit-scrollbar-thumb,
.queue-list::-webkit-scrollbar-thumb,
.synced-lyrics-container::-webkit-scrollbar-thumb,
.static-lyrics-container::-webkit-scrollbar-thumb,
.player-and-meta::-webkit-scrollbar-thumb,
.search-results-view::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 999px;
}

.tracks-list:hover::-webkit-scrollbar-thumb,
.queue-list:hover::-webkit-scrollbar-thumb,
.synced-lyrics-container:hover::-webkit-scrollbar-thumb,
.static-lyrics-container:hover::-webkit-scrollbar-thumb,
.player-and-meta:hover::-webkit-scrollbar-thumb,
.search-results-view:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.14);
}

.tracks-list:hover::-webkit-scrollbar-thumb:hover,
.queue-list:hover::-webkit-scrollbar-thumb:hover,
.synced-lyrics-container:hover::-webkit-scrollbar-thumb:hover,
.static-lyrics-container:hover::-webkit-scrollbar-thumb:hover,
.player-and-meta:hover::-webkit-scrollbar-thumb:hover,
.search-results-view:hover::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
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

.queue-panel .panel-header {
  display: none;
}

.queue-panel .queue-list {
  padding-top: 4px;
}

.queue-panel .queue-row {
  display: block;
  margin-bottom: 6px;
  padding: 0;
  background: transparent;
  border: none;
  position: relative;
}

.queue-panel .queue-row:hover,
.queue-panel .queue-row.active {
  background: transparent;
  border: none;
}

.queue-panel .queue-row::before {
  display: block;
  margin-bottom: 8px;
  font-size: 20px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.96);
}

.queue-panel .queue-row:first-child::before {
  content: "Estas reproduciendo";
}

.queue-panel .queue-row:nth-child(2)::before {
  content: "Siguiente";
  margin-top: 8px;
}

.queue-panel .queue-row-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  background: transparent;
  transition: background 0.18s ease;
}

.queue-panel .track-main-info {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0;
  min-height: 72px;
  padding-right: 44px;
}

.queue-panel .queue-item-cover {
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  border-radius: 10px;
  position: relative;
  overflow: hidden;
}

.queue-panel .queue-item-cover img,
.queue-panel .queue-item-cover .row-cover-placeholder {
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.queue-panel .queue-item-meta {
  min-width: 0;
}

.queue-panel .track-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  gap: 6px;
}

.queue-panel .queue-row:first-child .track-name {
  color: #1ed760;
  font-size: 16px;
}

.queue-panel .queue-row:first-child .track-path {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.68);
}

.queue-panel .queue-row:not(:first-child) .queue-item-cover {
  width: 56px;
  height: 56px;
  flex-basis: 56px;
}

.queue-panel .queue-row:not(:first-child) .track-name {
  font-size: 15px;
}

.queue-panel .queue-row:not(:first-child) .track-path {
  font-size: 13px;
}

.queue-panel .queue-row.hovered {
  background: transparent;
}

.queue-panel .queue-row.hovered .queue-row-card {
  background: rgba(255, 255, 255, 0.08);
}

.queue-panel .queue-row.hovered .track-actions {
  opacity: 1;
  pointer-events: auto;
}

.queue-panel .queue-row.hovered .queue-item-cover img,
.queue-panel .queue-row.hovered .queue-item-cover .row-cover-placeholder {
  filter: brightness(0.45);
}

.queue-panel .queue-row.hovered .queue-item-cover::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-40%, -50%);
  width: 0;
  height: 0;
  border-top: 11px solid transparent;
  border-bottom: 11px solid transparent;
  border-left: 17px solid #ffffff;
  pointer-events: none;
}

.queue-panel .queue-hover-btn {
  width: 34px;
  height: 34px;
  min-width: 34px;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0;
  position: relative;
}

.queue-panel .queue-hover-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.queue-panel .queue-dots-btn {
  font-size: 0;
}

.queue-panel .track-actions .queue-hover-btn:first-child::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-35%, -50%);
  width: 0;
  height: 0;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-left: 10px solid currentColor;
}

.queue-panel .track-actions .queue-hover-btn:first-child {
  display: none;
}

.queue-panel .queue-dots-btn::before {
  content: "•••";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 15px;
  line-height: 1;
  color: currentColor;
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
  width: 100%;
  padding: 20px;
  flex-shrink: 0;
  align-self: stretch;
  text-align: left;
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
  text-align: left;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
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

@media (max-width: 520px) {
  .meta-grid {
    grid-template-columns: 1fr;
  }
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

/* ============================
   REPRODUCTOR GLOBAL TIPO SPOTIFY
   ============================ */
.spotify-bottom-player {
  display: grid;
  grid-template-columns: 280px 1fr 280px;
  align-items: center;
  padding: 12px 18px 10px;
  gap: 18px;
  flex-shrink: 0;
}

.sbp-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.sbp-cover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.sbp-cover-placeholder {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}

.sbp-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.sbp-title {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sbp-artist {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sbp-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}

.transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  width: 100%;
}

.sbp-play-btn {
  width: 46px;
  height: 46px;
}

.sbp-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.sbp-time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: center;
}

.sbp-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 10px;
  min-width: 0;
}

.sbp-tools-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  width: 100%;
}

.sbp-volume-container {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 152px;
  flex-shrink: 0;
}

.volume-slider {
  width: 100%;
  min-width: 96px;
  flex: 1;
}

.sbp-device {
  width: 100%;
  max-width: 280px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
  gap: 2px;
}

.sbp-device-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.74);
  letter-spacing: 0.02em;
}

.sbp-device-name {
  font-size: 12px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.25;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sbp-device-meta {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.56);
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
    grid-template-columns: minmax(0, 1fr) 340px;
  }
}

@media (max-width: 1180px) {
  .main-layout {
    grid-template-columns: 1fr;
  }

  .player-panel {
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

  .routes-modal-backdrop {
    padding: 14px;
  }

  .routes-modal {
    max-height: 86vh;
    padding: 18px;
  }

  .routes-modal-header,
  .routes-modal-actions,
  .routes-list-item {
    flex-direction: column;
    align-items: stretch;
  }

  .player-shell {
    padding: 16px;
    height: auto;
    min-height: auto;
  }

  .topbar {
    align-items: stretch;
    flex-direction: column;
  }

  .topbar-search-shell {
    width: 100%;
    justify-content: stretch;
  }

  .topbar-home-btn {
    width: 48px;
    height: 48px;
  }

  .topbar-search {
    height: 48px;
    width: 100%;
  }

  .topbar-search-shortcuts {
    display: none;
  }

  .global-search-popover {
    width: 100%;
    max-height: 58vh;
    padding: 16px;
  }

  .global-search-popover-wrap {
    top: calc(100% + 8px);
    left: 0;
    width: 100%;
    transform: none;
  }

  .global-search-popover-topbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .global-search-actions {
    width: 100%;
    justify-content: space-between;
  }

  .spotify-bottom-player {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    text-align: center;
    padding: 16px;
  }

  .sbp-left {
    justify-content: center;
  }

  .sbp-right {
    align-items: center;
    justify-content: center;
  }

  .sbp-tools-row {
    justify-content: center;
    flex-wrap: wrap;
  }

  .sbp-device {
    align-items: center;
    text-align: center;
  }

  .search-results-main-grid {
    grid-template-columns: 1fr;
  }

  .search-results-heading {
    font-size: 24px;
  }

  .search-circle-grid,
  .search-album-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
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
  margin-bottom: 10px;

  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;

  color: rgba(255, 255, 255, 0.65);
  font-size: 13px;
  font-weight: 600;

  background: rgba(20, 24, 32, 0.92);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.library-table-head.with-compact-album-bar {
  top: 76px;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

@media (max-width: 900px) {
  .album-compact-sticky-bar.visible {
    max-height: 68px;
    min-height: 68px;
    padding: 10px 12px;
  }

  .library-table-head.with-compact-album-bar {
    top: 68px;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

  .album-compact-play-btn {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
  }

  .album-compact-title {
    font-size: 14px;
  }
}

.library-table-head .col-time {
  display: flex;
  justify-content: flex-end;
  padding-right: 12px; /* ajusta: 8px, 12px, 16px */
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

.floating-source-badge {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 4;
  width: auto;
  max-width: calc(100% - 32px);
  padding: 10px 14px;
  text-align: left;

  background: rgba(15, 17, 21, 0.18); /* 👈 más transparente */
  backdrop-filter: blur(18px); /* 👈 más blur */
  -webkit-backdrop-filter: blur(18px);

  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
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
  text-decoration: none;
  transition:
    color 0.2s ease,
    text-decoration-color 0.2s ease;
}

.row-title-wrap:hover .spotify-track-name {
  text-decoration: underline;
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

.library-row-menu-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    background 0.18s ease,
    color 0.18s ease;
}

.spotify-row.hovered .library-row-menu-btn,
.spotify-row.active .library-row-menu-btn {
  opacity: 1;
  pointer-events: auto;
}

.library-row-menu-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.queue-artist-link {
  text-decoration: none;
}

.queue-artist-link:hover {
  text-decoration: underline;
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

.progress-slider-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

.progress-tooltip {
  position: absolute;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(15, 17, 21, 0.92);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  z-index: 30;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}

.progress-tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 5px;
  border-style: solid;
  border-color: rgba(15, 17, 21, 0.92) transparent transparent transparent;
}
.spotify-row.selected {
  background: rgba(255, 255, 255, 0.12);
}

.track-context-menu {
  position: fixed;
  z-index: 9999;
  width: 280px;
  max-width: calc(100vw - 24px);
  padding: 8px;
  border-radius: 14px;
  background: rgba(20, 24, 32, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
}

.context-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  color: #ffffff;
  text-align: left;
  padding: 12px 14px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.18s ease;
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.context-menu-separator {
  height: 1px;
  margin: 8px 6px;
  background: rgba(255, 255, 255, 0.1);
}

.search-input-wrapper {
  position: relative;
  width: 100%;
}

.search-input {
  padding-right: 36px; /* espacio para la X */
}

.search-clear-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);

  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;

  font-size: 14px;
  font-weight: 700;

  width: 24px;
  height: 24px;
  border-radius: 50%;

  display: flex;
  align-items: center;
  justify-content: center;

  transition: all 0.2s ease;
}

.search-clear-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

/* ====== ESTILOS DE NAVEGACIÓN ARTISTA/ÁLBUM ====== */
.hoverable-link {
  cursor: pointer;
  transition:
    color 0.2s ease,
    text-decoration 0.2s ease;
  pointer-events: auto; /* Asegura que detecte el click */
}

.hoverable-link:hover {
  color: #1ed760;
  text-decoration: underline;
}

.artist-albums-grid {
  padding: 0 0 16px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 16px;
  flex-shrink: 0;
}

.section-subtitle {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 12px;
  margin-top: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.albums-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.album-card {
  padding: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition:
    transform 0.2s ease,
    background 0.2s ease;
  background: rgba(255, 255, 255, 0.03);
}

.album-card:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-4px);
}

.album-card img,
.album-cover-placeholder {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  object-fit: cover;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
}

.album-cover-placeholder {
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: rgba(255, 255, 255, 0.2);
}

.album-name {
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(255, 255, 255, 0.9);
}
/* ====== VISTA DE ÁLBUM (ESTILO LIQUID GLASS) ====== */
.spotify-album-hero {
  position: relative;
  padding: 12px 20px 20px;
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  margin: 0 -18px 0 -18px;
}

.sah-content {
  display: flex;
  align-items: flex-end;
  gap: 24px;
  margin-top: 0;
}

.sah-cover {
  width: 232px;
  height: 232px;
  border-radius: 12px; /* Ligeramente más curvo para hacer match con tu app */
  object-fit: cover;
}

.sah-cover-placeholder {
  width: 232px;
  height: 232px;
  border-radius: 12px;
  /* Mismo fondo placeholder que usas en el reproductor principal */
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.05) 0%,
    rgba(255, 255, 255, 0.01) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 80px;
  color: rgba(255, 255, 255, 0.2);
}

.sah-info {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-width: 0;
}

.sah-type {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.5); /* Tono apagado de tu UI */
  margin-bottom: 8px;
}

.sah-title {
  font-size: clamp(44px, 4.4vw, 64px);
  font-weight: 900;
  line-height: 1.2;
  margin: 0 0 12px 0;
  padding-block: 0.08em;
  letter-spacing: -1.5px;
  color: #fff;
  white-space: nowrap;
  overflow: visible;
  text-wrap: nowrap;
}

.sah-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}

.sah-artist-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.sah-bullet {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

.sah-duration {
  color: rgba(255, 255, 255, 0.5);
  font-weight: 400;
}

/* Acciones debajo de la cabecera */
.spotify-album-actions {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 18px 20px 24px;
  margin: 0 -18px;
}

.album-search-row {
  margin: 0 0 14px;
  padding: 0 2px;
}

.sah-play-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  /* Blanco puro invertido, igual a tu .play-main */
  background: #ffffff;
  color: #000000;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sah-play-btn:hover {
  transform: scale(1.04);
  background: #f0f0f0;
}

.sah-play-btn:active {
  transform: scale(0.95);
}

.sah-icon-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.sah-icon-btn:hover {
  color: #ffffff;
  transform: scale(
    1.1
  ); /* Efecto de escala que ya usas en tus botones icon-btn */
}

@media (max-width: 900px) {
  .panel-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .library-header-group {
    width: 100%;
  }

  .library-header-actions {
    width: 100%;
    justify-content: stretch;
  }

  .library-header-actions .small-action-btn {
    width: 100%;
  }

  .view-nav-toolbar {
    padding: 6px 8px;
    gap: 8px;
  }

  .view-nav-btn {
    width: 34px;
    height: 34px;
  }

  .view-home-btn {
    width: 44px;
    height: 44px;
  }

  .sah-content {
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-top: 0;
  }

  .sah-cover,
  .sah-cover-placeholder {
    width: 200px;
    height: 200px;
  }

  .sah-title {
    font-size: 40px;
  }

  .sah-meta {
    justify-content: center;
    flex-wrap: wrap;
  }
}

.spotify-row,
.row-index,
.row-title-wrap,
.row-title-meta,
.spotify-track-name,
.spotify-track-subtitle,
.row-album,
.row-added,
.row-time-actions,
.row-duration,
.row-cover,
.row-cover-placeholder {
  user-select: none;
  -webkit-user-select: none;
}

.album-compact-sticky-bar {
  position: sticky;
  top: 0;
  z-index: 32;

  display: flex;
  align-items: center;
  gap: 14px;

  margin: 0;
  padding: 0 12px;

  min-height: 0;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;

  background: rgba(20, 24, 32, 0.92);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 0;
  border-bottom: 0 solid rgba(255, 255, 255, 0.08);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;

  transform: translateY(-12px);
  transition:
    max-height 0.28s ease,
    opacity 0.22s ease,
    transform 0.28s ease,
    padding 0.28s ease,
    border-bottom-width 0.28s ease;
}

.album-compact-sticky-bar.visible {
  max-height: 76px;
  min-height: 76px;
  padding: 12px 12px;
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.album-compact-play-btn {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;

  border: none;
  border-radius: 50%; /* igual que el original */

  background: #ffffff; /* base del original */
  color: #000000;

  display: flex; /* igual que original */
  align-items: center;
  justify-content: center;

  cursor: pointer;

  /* mantienes el shadow de la compacta */
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.28),
    0 0 0 1px rgba(255, 255, 255, 0.06);

  transition:
    transform 0.18s ease,
    filter 0.18s ease;
}

.album-compact-play-btn:hover {
  transform: scale(1.04);
  filter: brightness(1.03);
}

.album-compact-play-btn:active {
  transform: scale(0.96);
}

.album-compact-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.album-compact-title {
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-compact-subtitle {
  margin-top: 3px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.library-table-head.with-compact-album-bar {
  top: 76px;
}

@media (max-width: 900px) {
  .album-compact-sticky-bar.visible {
    max-height: 68px;
    min-height: 68px;
    padding: 10px 18px;
  }

  .library-table-head.with-compact-album-bar {
    top: 68px;
  }

  .album-compact-play-btn {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
  }

  .album-compact-title {
    font-size: 14px;
  }
}

.mic-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 0;
  opacity: 0.72;
  color: rgba(255, 255, 255, 0.72);
  transition:
    opacity 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease,
    filter 0.2s ease;
}

.mic-btn svg {
  display: block;
}

.mic-btn:hover {
  opacity: 1;
  color: #ffffff;
  transform: scale(1.06);
}

.mic-btn.active {
  opacity: 1;
  color: #ffffff;
  filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.22));
}

.volume-icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  color: rgba(255, 255, 255, 0.78);
  transition:
    color 0.2s ease,
    opacity 0.2s ease,
    transform 0.2s ease;
}

.volume-icon-btn svg {
  display: block;
}

.volume-icon-btn:hover {
  color: #ffffff;
  transform: scale(1.05);
}
</style>
