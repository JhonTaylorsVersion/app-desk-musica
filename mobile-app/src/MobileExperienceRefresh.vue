<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { PluginListenerHandle } from "@capacitor/core";

import BottomTabBar from "@/components/BottomTabBar.vue";
import { useMobileExperience } from "@/composables/useMobileExperience";
import {
  AudioOutput,
  getCurrentAudioOutput,
  getDefaultAudioOutput,
} from "@/plugins/audioOutput";
import { resolveCoverUrl } from "@/services/api";

const app = useMobileExperience();
const miniPlayerColor = ref("rgb(115, 81, 89)");
const connectedOutputName = ref<string | null>(null);
const mobileRefreshRef = ref<HTMLElement | null>(null);
const detailHeaderCompact = ref(false);
const detailTouchStartY = ref<number | null>(null);
const lastDetailScrollTop = ref(0);

const homeQuickFilters = ["Todas", "Musica", "Podcasts"];
const detailViewModes = ["artist", "album", "playlist"];

const isDetailView = () => detailViewModes.includes(app.viewMode.value);

const setDetailHeaderCompact = (isCompact: boolean) => {
  if (!isDetailView()) return;
  detailHeaderCompact.value = isCompact;
};

const handleDetailScrollIntent = (direction: "up" | "down") => {
  setDetailHeaderCompact(direction === "down");
};

const handleMobileScroll = (event: Event) => {
  if (!isDetailView()) return;

  const target = event.currentTarget as HTMLElement | null;
  const currentScrollTop = target?.scrollTop ?? 0;

  if (currentScrollTop > lastDetailScrollTop.value + 4) {
    handleDetailScrollIntent("down");
  } else if (currentScrollTop < lastDetailScrollTop.value - 4) {
    handleDetailScrollIntent("up");
  }

  if (currentScrollTop <= 2 && lastDetailScrollTop.value <= 2) {
    lastDetailScrollTop.value = currentScrollTop;
    return;
  }

  lastDetailScrollTop.value = currentScrollTop;
};

const handleMobileWheel = (event: WheelEvent) => {
  if (!isDetailView()) return;
  if (event.deltaY > 4) {
    handleDetailScrollIntent("down");
  } else if (event.deltaY < -4) {
    handleDetailScrollIntent("up");
  }
};

const handleMobileTouchStart = (event: TouchEvent) => {
  if (!isDetailView()) return;
  detailTouchStartY.value = event.touches[0]?.clientY ?? null;
};

const handleMobileTouchMove = (event: TouchEvent) => {
  if (!isDetailView() || detailTouchStartY.value === null) return;

  const currentY = event.touches[0]?.clientY;
  if (currentY === undefined) return;

  const deltaY = detailTouchStartY.value - currentY;
  if (deltaY > 8) {
    handleDetailScrollIntent("down");
    detailTouchStartY.value = currentY;
  } else if (deltaY < -8) {
    handleDetailScrollIntent("up");
    detailTouchStartY.value = currentY;
  }
};

const onSearchSubmit = async () => {
  await app.runSearch();
  app.navigateToTab("search");
};

const renameActivePlaylist = () => {
  const currentName = app.activePlaylist.value?.name ?? "";
  const nextName = window.prompt("Nuevo nombre de la playlist", currentName);
  if (nextName) {
    void app.renameCurrentPlaylist(nextName);
  }
};

const currentTrackVibe = computed(() =>
  app.currentTrack.value
    ? app.buildVibe(app.currentTrack.value)
    : "Sin reproduccion activa",
);

const currentOutput = computed(() => {
  if (app.isDesktopConnectEnabled.value) {
    const desktopSession = app.desktopConnectState.value?.desktop?.session;
    const desktopName = desktopSession?.deviceName ?? "Mi PC";

    return {
      name: desktopName,
      meta: desktopSession?.outputDeviceName
        ? `Salida: ${desktopSession.outputDeviceName}`
        : app.desktopConnectStatus.value || "Reproduccion en PC",
    };
  }

  const fallbackOutput = getDefaultAudioOutput();

  return {
    name: connectedOutputName.value ?? fallbackOutput.name,
    meta: "Reproduccion movil",
  };
});

const connectDeviceActionLabel = computed(() =>
  app.isDesktopConnectEnabled.value
    ? "Escuchar en este telefono"
    : "Escuchar en PC",
);

const canShowConnectDeviceAction = computed(
  () => app.isDesktopConnectEnabled.value || app.isDesktopConnectAvailable.value,
);

const handleVolumeInput = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  void app.changeVolume(Number(target.value));
};

const createLyricsBackground = (rgbColor: string, alpha = 0.9) => {
  const channels = rgbColor.match(/\d+/g)?.map(Number) ?? [115, 81, 89];
  const [red, green, blue] = channels;

  const soften = (value: number, lift: number) =>
    Math.max(62, Math.min(188, Math.round(value * 0.62 + lift)));

  const top = `rgba(${soften(red, 52)}, ${soften(green, 50)}, ${soften(blue, 58)}, ${alpha})`;
  const bottom = `rgba(${soften(red, 28)}, ${soften(green, 26)}, ${soften(blue, 34)}, ${Math.min(
    0.98,
    alpha + 0.06,
  )})`;
  const glow = `rgba(${soften(red, 78)}, ${soften(green, 74)}, ${soften(blue, 86)}, 0.18)`;

  return `
    radial-gradient(circle at top left, ${glow}, transparent 42%),
    linear-gradient(180deg, ${top} 0%, ${bottom} 100%)
  `;
};

const lyricsCardStyle = computed(() => ({
  background: createLyricsBackground(miniPlayerColor.value, 0.9),
}));

const lyricsModalStyle = computed(() => ({
  background: createLyricsBackground(miniPlayerColor.value, 0.96),
}));

const currentCredits = computed(() => {
  const metadata = app.currentMetadata.value;
  const track = app.currentTrack.value;
  const credits = [
    {
      title: track?.artist ?? metadata?.artist ?? null,
      subtitle: "Artista principal",
    },
    metadata?.album_artist && metadata.album_artist !== track?.artist
      ? {
          title: metadata.album_artist,
          subtitle: "Album artist",
        }
      : null,
    metadata?.composer
      ? {
          title: metadata.composer,
          subtitle: "Compositor/a",
        }
      : null,
    metadata?.lyricist
      ? {
          title: metadata.lyricist,
          subtitle: "Letrista",
        }
      : null,
  ];

  return credits.filter((item): item is { title: string; subtitle: string } =>
    Boolean(item?.title),
  );
});

const currentFacts = computed(() => {
  const metadata = app.currentMetadata.value;
  const track = app.currentTrack.value;

  return [
    metadata?.genre ? `Genero: ${metadata.genre}` : null,
    metadata?.release_date
      ? `Lanzamiento: ${metadata.release_date}`
      : metadata?.year
        ? `Ano: ${metadata.year}`
        : null,
    track?.duration_formatted ? `Duracion: ${track.duration_formatted}` : null,
    currentTrackVibe.value,
  ].filter((item): item is string => Boolean(item));
});

const currentContextBlurb = computed(() => {
  const source = app.currentSourceInfo.value;
  if (!source) return "Biblioteca";
  return `${source.sourceLabel} · ${source.sourceTargetLabel}`;
});

const libraryHighlights = computed(() => [
  { label: "playlists", value: `${app.playlists.value.length}` },
  { label: "artistas", value: `${app.artists.value.length}` },
  { label: "albumes", value: `${app.albums.value.length}` },
]);

const isLyricsExpanded = ref(false);
const isLyricsExpandedReady = ref(false);
const isInitializingLyricsExpanded = ref(false);
const lyricsExpandedRef = ref<HTMLElement | null>(null);
const lyricsExpandedLineRefs = ref<HTMLElement[]>([]);
const previewLyricsViewportRef = ref<HTMLElement | null>(null);
const previewLyricsContentRef = ref<HTMLElement | null>(null);
const previewLyricLineRefs = ref<HTMLElement[]>([]);
const previewLyricsOffset = ref(0);

type SyncedLyricLine = {
  time: number;
  text: string;
};

const parseSyncedLyrics = (rawLyrics: string | null | undefined) => {
  if (!rawLyrics?.trim()) return [] as SyncedLyricLine[];

  return rawLyrics
    .split(/\r?\n/)
    .flatMap((line) => {
      const matches = [
        ...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g),
      ];
      const text = line
        .replace(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g, "")
        .trim();

      if (!matches.length || !text) return [];

      return matches.map((match) => {
        const minutes = Number(match[1] ?? 0);
        const seconds = Number(match[2] ?? 0);
        const decimals = match[3] ?? "0";
        const milliseconds = Number(decimals.padEnd(3, "0"));

        return {
          time: minutes * 60 + seconds + milliseconds / 1000,
          text,
        } satisfies SyncedLyricLine;
      });
    })
    .sort((left, right) => left.time - right.time);
};

const syncedLyrics = computed(() =>
  parseSyncedLyrics(app.currentMetadata.value?.synced_lyrics),
);

const hasLyrics = computed(
  () =>
    syncedLyrics.value.length > 0 ||
    app.parsedLyrics.value.some((line) => line.trim().length > 0),
);

const activeLyricIndex = computed(() => {
  if (!syncedLyrics.value.length) return -1;

  for (let index = syncedLyrics.value.length - 1; index >= 0; index -= 1) {
    if (app.currentTime.value >= syncedLyrics.value[index].time) {
      return index;
    }
  }

  return 0;
});

const visibleLyricsState = computed(() => {
  if (syncedLyrics.value.length) {
    const activeIndex = Math.max(activeLyricIndex.value, 0);
    return {
      lines: syncedLyrics.value,
      activeLocalIndex: activeIndex,
    };
  }

  return {
    lines: app.parsedLyrics.value.map((text, index) => ({ time: index, text })),
    activeLocalIndex: 0,
  };
});

const expandedLyricsState = computed(() => {
  if (syncedLyrics.value.length) {
    return {
      lines: syncedLyrics.value,
      activeIndex: activeLyricIndex.value,
    };
  }

  return {
    lines: app.parsedLyrics.value.map((text, index) => ({
      time: index,
      text,
    })),
    activeIndex: visibleLyricsState.value.activeLocalIndex,
  };
});

const setExpandedLyricLineRef = (element: unknown, index: number) => {
  if (!(element instanceof HTMLElement)) return;
  lyricsExpandedLineRefs.value[index] = element;
};

const setPreviewLyricLineRef = (element: unknown, index: number) => {
  if (!(element instanceof HTMLElement)) return;
  previewLyricLineRefs.value[index] = element;
};

const syncPreviewLyricsOffset = async () => {
  await nextTick();

  const viewport = previewLyricsViewportRef.value;
  const content = previewLyricsContentRef.value;
  const activeIndex = visibleLyricsState.value.activeLocalIndex;

  if (!viewport || !content || activeIndex < 0) {
    previewLyricsOffset.value = 0;
    return;
  }

  const activeLine = previewLyricLineRefs.value[activeIndex];
  if (!activeLine) {
    previewLyricsOffset.value = 0;
    return;
  }

  const desiredTop = activeLine.offsetTop;
  const maxOffset = Math.max(0, content.scrollHeight - viewport.clientHeight);

  previewLyricsOffset.value = Math.max(0, Math.min(desiredTop, maxOffset));
};

const waitForNextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const waitForExpandedLyricsTarget = async (activeIndex: number, attempts = 4) => {
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    await nextTick();

    const container = lyricsExpandedRef.value;
    const activeLine = lyricsExpandedLineRefs.value[activeIndex];

    if (container && activeLine) {
      return { container, activeLine };
    }

    if (attempt < attempts) {
      await waitForNextFrame();
    }
  }

  return null;
};

const syncExpandedLyricsScroll = async (
  behavior: ScrollBehavior = "smooth",
) => {
  if (!isLyricsExpanded.value) return false;

  await nextTick();

  const activeIndex = expandedLyricsState.value.activeIndex;
  if (activeIndex < 0) return false;

  const target = await waitForExpandedLyricsTarget(activeIndex);
  if (!target) return false;

  const { container, activeLine } = target;

  const nextTop =
    activeLine.offsetTop -
    container.clientHeight / 2 +
    activeLine.clientHeight / 2;

  container.scrollTo({
    top: Math.max(0, nextTop),
    behavior,
  });

  return true;
};

const currentArtist = computed(
  () =>
    app.artists.value.find(
      (artist) =>
        artist.name.toLowerCase() ===
        (app.currentTrack.value?.artist ?? "").toLowerCase(),
    ) ?? null,
);

const currentArtistAlbums = computed(() =>
  app.albums.value
    .filter(
      (album) =>
        album.artist.toLowerCase() ===
        (app.currentTrack.value?.artist ?? "").toLowerCase(),
    )
    .slice(0, 6),
);

const relatedTracks = computed(() =>
  app.filteredTracks.value
    .filter(
      (track) =>
        track.id !== app.currentTrack.value?.id &&
        (track.artist === app.currentTrack.value?.artist ||
          track.album === app.currentTrack.value?.album),
    )
    .slice(0, 6),
);

const homeQuickItems = computed(() => {
  const seen = new Set<string>();
  return [
    ...app.topPicks.value.map((item) => item.track),
    ...app.recentHistory.value.map((entry) => entry.track),
    ...app.filteredTracks.value,
  ]
    .filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    })
    .slice(0, 6);
});

const homeContinueItems = computed(() => {
  const seen = new Set<string>();
  return [
    ...app.recentHistory.value.map((entry) => entry.track),
    ...app.topPicks.value.map((item) => item.track),
  ]
    .filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    })
    .slice(0, 8);
});

const homeAlbumCards = computed(() => app.homeAlbums.value.slice(0, 8));
const homeArtistCards = computed(() => app.homeArtists.value.slice(0, 6));
const homePlaylistCards = computed(() => app.playlists.value.slice(0, 4));
const createSheetMode = ref<"menu" | "playlist">("menu");
const playlistPageSearch = ref("");
const albumPageSearch = ref("");
const artistPageSearch = ref("");
const playlistSortMode = ref<"custom" | "title">("custom");

const resolveEntityCover = (entity: unknown) =>
  resolveCoverUrl(app.serverConfig.value, entity as never) || "";

const resolvePlaylistTiles = (playlist: { id: number } | null | undefined, max = 4) =>
  app.getPlaylistCoverTiles(playlist?.id ?? null, max);

const searchBrowseCards = computed(() => {
  const covers = [
    ...app.homeAlbums.value,
    ...app.homeArtists.value,
    ...app.filteredTracks.value.slice(0, 12),
  ];

  return [
    { title: "Musica", tone: "#dc148c", entity: covers[0] },
    { title: "Podcasts", tone: "#27856a", entity: covers[1] },
    { title: "Eventos en vivo", tone: "#8400e7", entity: covers[2] },
    { title: "Creado para ti", tone: "#8d67ab", entity: covers[3] },
    { title: "Nuevos lanzamientos", tone: "#608108", entity: covers[4] },
    { title: "Latina", tone: "#1e66d0", entity: covers[5] },
    { title: "Pop", tone: "#537aa1", entity: covers[6] },
    { title: "Hip hop", tone: "#ba5d07", entity: covers[7] },
    { title: "K-pop", tone: "#2d46b9", entity: covers[8] },
    { title: "Fresh Finds", tone: "#e8115b", entity: covers[9] },
    { title: "Arabes", tone: "#e13300", entity: covers[10] },
    { title: "Mixeada por ti", tone: "#9b7de2", entity: covers[11] },
  ];
});

const libraryCollectionFilters = [
  "Playlists",
  "Podcasts",
  "Albumes",
  "Artistas",
  "Descargados",
];

const libraryRows = computed(() => {
  const rows = [
    ...app.playlists.value.map((playlist) => ({
      id: `playlist-${playlist.id}`,
      title: playlist.name,
      subtitle: `Playlist • ${playlist.track_count} canciones`,
      entity: playlist,
      kind: "playlist" as const,
      action: () => app.openPlaylistView(playlist.id),
    })),
    ...app.albums.value.slice(0, 10).map((album) => ({
      id: `album-${album.id}`,
      title: album.name,
      subtitle: `Album • ${album.artist}`,
      entity: album,
      kind: "album" as const,
      action: () => app.openAlbumView(album.id),
    })),
    ...app.artists.value.slice(0, 8).map((artist) => ({
      id: `artist-${artist.id}`,
      title: artist.name,
      subtitle: `Artista • ${artist.album_count} albumes`,
      entity: artist,
      kind: "artist" as const,
      action: () => app.openArtistView(artist.id),
    })),
  ];

  return rows;
});

const playlistDurationLabel = computed(() => {
  const totalSeconds = app.activePlaylistTracks.value.reduce(
    (sum, track) => sum + (track.duration_seconds ?? 0),
    0,
  );
  if (!totalSeconds) return "0 min";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
});

const albumDurationLabel = computed(() => {
  const totalSeconds = (app.selectedAlbum.value?.tracks ?? []).reduce(
    (sum, track) => sum + (track.duration_seconds ?? 0),
    0,
  );
  if (!totalSeconds) return null;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
});

const artistDurationLabel = computed(() => {
  const totalSeconds = (app.selectedArtist.value?.tracks ?? []).reduce(
    (sum, track) => sum + (track.duration_seconds ?? 0),
    0,
  );
  if (!totalSeconds) return null;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
});

const playlistCoverTiles = computed(() =>
  resolvePlaylistTiles(app.activePlaylist.value, 4),
);

const playlistHeroCover = computed(() => playlistCoverTiles.value[0] ?? "");

const visiblePlaylistTracks = computed(() => {
  const query = playlistPageSearch.value.trim().toLowerCase();
  const source = !query
    ? app.activePlaylistTracks.value
    : app.activePlaylistTracks.value.filter((track) =>
        [track.title, track.artist, track.album]
          .join(" ")
          .toLowerCase()
          .includes(query),
      );

  if (playlistSortMode.value === "title") {
    return [...source].sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" }),
    );
  }

  return source;
});

const albumHeroImage = computed(() => {
  if (!app.selectedAlbum.value) return "";
  return (
    resolveEntityCover(app.selectedAlbum.value.album) ||
    resolveEntityCover(app.selectedAlbum.value.tracks[0])
  );
});

const albumMoreFromArtist = computed(() => {
  if (!app.selectedAlbum.value) return [];
  return app.albums.value
    .filter(
      (album) =>
        album.artist === app.selectedAlbum.value?.album.artist &&
        album.id !== app.selectedAlbum.value?.album.id,
    )
    .slice(0, 6);
});

const albumSuggestedPlaylists = computed(() => app.playlists.value.slice(0, 6));

const visibleAlbumTracks = computed(() => {
  const query = albumPageSearch.value.trim().toLowerCase();
  if (!query) return app.selectedAlbum.value?.tracks ?? [];

  return (app.selectedAlbum.value?.tracks ?? []).filter((track) =>
    [track.title, track.artist, track.album]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
});

const artistHeroImage = computed(() => {
  if (!app.selectedArtist.value) return "";
  return (
    resolveEntityCover(app.selectedArtist.value.artist) ||
    resolveEntityCover(app.selectedArtist.value.albums[0]) ||
    resolveEntityCover(app.selectedArtist.value.tracks[0])
  );
});

const visibleArtistTracks = computed(() => {
  const query = artistPageSearch.value.trim().toLowerCase();
  if (!query) return app.selectedArtist.value?.tracks ?? [];

  return (app.selectedArtist.value?.tracks ?? []).filter((track) =>
    [track.title, track.artist, track.album]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
});

const artistSelectedAlbums = computed(
  () => app.selectedArtist.value?.albums.slice(0, 6) ?? [],
);

const artistRelatedArtists = computed(() => {
  if (!app.selectedArtist.value) return [];
  return app.artists.value
    .filter((artist) => artist.id !== app.selectedArtist.value?.artist.id)
    .slice(0, 6);
});

const artistAppearsInAlbums = computed(() =>
  app.homeAlbums.value
    .filter((album) => album.artist !== app.selectedArtist.value?.artist.name)
    .slice(0, 6),
);

const artistCuratedPlaylists = computed(() => app.playlists.value.slice(0, 6));

const openSelectedAlbumArtist = () => {
  const artistName = app.selectedAlbum.value?.album.artist;
  if (!artistName) return;
  const artist = app.artists.value.find((item) => item.name === artistName);
  if (artist) {
    void app.openArtistView(artist.id);
  }
};

const playTrackFromHome = (trackId: string) => {
  const index = app.filteredTracks.value.findIndex(
    (track) => track.id === trackId,
  );
  if (index < 0) return;

  void app.playCollection(
    app.filteredTracks.value,
    index,
    "library",
    "Biblioteca",
    "Biblioteca",
  );
};

const playerOverlayRef = ref<HTMLElement | null>(null);
const playerDragOffset = ref(0);
const playerDragStartY = ref<number | null>(null);
const playerIsDragging = ref(false);
const isCanvasReady = ref(false);

const shareCurrentTrack = async () => {
  if (
    !app.currentTrack.value ||
    typeof navigator === "undefined" ||
    !("share" in navigator)
  ) {
    return;
  }

  try {
    await navigator.share({
      title: app.currentTrack.value.title,
      text: `${app.currentTrack.value.title} · ${app.currentTrack.value.artist}`,
    });
  } catch {
    // Ignore canceled shares.
  }
};

const shareText = async (title: string, text: string) => {
  if (typeof navigator === "undefined" || !("share" in navigator)) return;

  try {
    await navigator.share({ title, text });
  } catch {
    // Ignore canceled shares.
  }
};

const shuffleTracks = <T,>(tracks: T[]) => {
  const next = [...tracks];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const playShuffledCollection = (
  tracks: typeof app.filteredTracks.value,
  sourceKind: "library" | "artist" | "album" | "playlist" | "search",
  sourceLabel: string,
  sourceTargetLabel: string,
) => {
  if (!tracks.length) return;
  void app.playCollection(
    shuffleTracks(tracks),
    0,
    sourceKind,
    sourceLabel,
    sourceTargetLabel,
  );
};

const openPlaylistAddFlow = () => {
  app.navigateToTab("search");
};

const handleBottomTabChange = async (
  tab: "home" | "search" | "library" | "create",
) => {
  if (tab === "create") {
    if (app.isCreatePlaylistOpen.value) {
      app.createSheetDragOffset.value = window.innerHeight;
      app.createSheetDragOffset.value = window.innerHeight;
      void app.closeCreatePlaylistSheet();
      setTimeout(() => {
        app.createSheetDragOffset.value = 0;
      }, 300);
    } else {
      app.openCreatePlaylistSheet();
    }
    return;
  }

  let needsWait = false;
  if (app.isCreatePlaylistOpen.value) {
    app.createSheetDragOffset.value = window.innerHeight;
    void app.closeCreatePlaylistSheet();
    setTimeout(() => {
      app.createSheetDragOffset.value = 0;
    }, 300);
    needsWait = true;
  }
  if (app.isSettingsOpen.value) {
    await app.closeSettingsPanel();
    needsWait = true;
  }
  
  if (needsWait) {
    await new Promise((r) => setTimeout(r, 10));
  }

  app.navigateToTab(tab);
};

const handleCreateSheetTouchStart = (event: TouchEvent) => {
  app.createSheetDragStartY.value = event.touches[0].clientY;
  app.createSheetIsDragging.value = true;
};

const handleCreateSheetTouchMove = (event: TouchEvent) => {
  if (app.createSheetDragStartY.value === null) return;
  const deltaY = event.touches[0].clientY - app.createSheetDragStartY.value;
  app.createSheetDragOffset.value = deltaY;
  if (event.cancelable) event.preventDefault();
};

const handleCreateSheetTouchEnd = () => {
  if (!app.createSheetIsDragging.value) return;
  app.createSheetIsDragging.value = false;
  
  if (Math.abs(app.createSheetDragOffset.value) > 90) {
    const direction = app.createSheetDragOffset.value > 0 ? 1 : -1;
    app.createSheetDragOffset.value = direction * window.innerHeight;
    void app.closeCreatePlaylistSheet();
    setTimeout(() => {
      app.createSheetDragOffset.value = 0;
      app.createSheetDragStartY.value = null;
    }, 300);
  } else {
    app.createSheetDragOffset.value = 0;
    app.createSheetDragStartY.value = null;
  }
};

const resetPlayerDrag = () => {
  playerDragOffset.value = 0;
  playerDragStartY.value = null;
  playerIsDragging.value = false;
};

const closeNowPlaying = () => {
  playerDragOffset.value = window.innerHeight;
  setTimeout(() => {
    void app.closeNowPlayingSheet();
    setTimeout(() => resetPlayerDrag(), 50);
  }, 280);
};

const handleCanvasReady = () => {
  isCanvasReady.value = true;
};

const refreshConnectedOutput = async () => {
  try {
    connectedOutputName.value = (await getCurrentAudioOutput()).name;
  } catch {
    connectedOutputName.value = null;
  }
};

let audioOutputListener: PluginListenerHandle | null = null;

const onPlayerTouchStart = (event: TouchEvent) => {
  if (isLyricsExpanded.value) return;
  if (playerOverlayRef.value && playerOverlayRef.value.scrollTop > 4) return;

  playerIsDragging.value = true;
  playerDragStartY.value = event.touches[0]?.clientY ?? null;
};

const onPlayerTouchMove = (event: TouchEvent) => {
  if (!playerIsDragging.value || playerDragStartY.value === null) return;

  const currentY = event.touches[0]?.clientY ?? playerDragStartY.value;
  const delta = Math.max(0, currentY - playerDragStartY.value);
  playerDragOffset.value = delta;

  if (delta > 0 && event.cancelable) {
    event.preventDefault();
  }
};

const onPlayerTouchEnd = () => {
  if (!playerIsDragging.value) return;
  playerIsDragging.value = false;

  if (playerDragOffset.value > 140) {
    playerDragOffset.value = window.innerHeight;
    setTimeout(() => {
      void app.closeNowPlayingSheet();
      setTimeout(() => resetPlayerDrag(), 50);
    }, 280);
  } else {
    resetPlayerDrag();
  }
};

const playerScreenStyle = computed(() => {
  return {
    transform: playerDragOffset.value
      ? `translateY(${playerDragOffset.value}px)`
      : "translateY(0)",
    transition: playerIsDragging.value ? "none" : "transform 280ms cubic-bezier(0.2, 0.9, 0.3, 1)",
  };
});

const playerOverlayStyle = computed(() => {
  return {
    background: `rgba(8, 8, 8, ${Math.max(0, 1 - playerDragOffset.value / window.innerHeight)})`,
    transition: playerIsDragging.value ? "none" : "background 280ms cubic-bezier(0.2, 0.9, 0.3, 1)"
  };
});

watch(() => app.isNowPlayingOpen.value, async (isOpen) => {
  if (isOpen) {
    playerDragOffset.value = window.innerHeight;
    await nextTick();
    setTimeout(() => {
      playerDragOffset.value = 0;
    }, 10);
  }
});

watch(() => app.isCreatePlaylistOpen.value, async (isOpen) => {
  if (isOpen) {
    app.createSheetDragOffset.value = window.innerHeight;
    await nextTick();
    setTimeout(() => {
      app.createSheetDragOffset.value = 0;
    }, 10);
  }
});

watch(
  () => app.viewMode.value,
  () => {
    detailHeaderCompact.value = false;
    detailTouchStartY.value = null;
    if (isDetailView()) {
      void nextTick(() => {
        mobileRefreshRef.value?.scrollTo({ top: 0, behavior: "auto" });
        lastDetailScrollTop.value = 0;
      });
      return;
    }
    lastDetailScrollTop.value = mobileRefreshRef.value?.scrollTop ?? 0;
  },
);

watch(
  () => app.currentCoverUrl.value,
  (coverUrl) => {
    if (!coverUrl || typeof window === "undefined") {
      miniPlayerColor.value = "rgb(115, 81, 89)";
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;

      const sampleSize = 24;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      context.drawImage(image, 0, 0, sampleSize, sampleSize);

      const { data } = context.getImageData(0, 0, sampleSize, sampleSize);
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;

      for (let index = 0; index < data.length; index += 4) {
        red += data[index];
        green += data[index + 1];
        blue += data[index + 2];
        count += 1;
      }

      if (!count) return;

      const normalize = (value: number) =>
        Math.max(42, Math.min(190, Math.round(value / count)));

      miniPlayerColor.value = `rgb(${normalize(red)}, ${normalize(green)}, ${normalize(blue)})`;
    };
    image.onerror = () => {
      miniPlayerColor.value = "rgb(115, 81, 89)";
    };
    image.src = coverUrl;
  },
  { immediate: true },
);

watch(
  () => app.isNowPlayingOpen.value,
  (isOpen) => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = isOpen ? "hidden" : "";
      document.documentElement.style.overflow = isOpen ? "hidden" : "";
    }

    if (!isOpen) {
      resetPlayerDrag();
    }
  },
);

watch(
  () => app.currentCanvasUrl.value,
  () => {
    isCanvasReady.value = false;
  },
  { immediate: true },
);

watch(
  () => app.isCreatePlaylistOpen.value,
  (isOpen) => {
    if (!isOpen) {
      createSheetMode.value = "menu";
    }
  },
);

watch(
  () => [
    visibleLyricsState.value.activeLocalIndex,
    visibleLyricsState.value.lines.length,
    app.currentTrack.value?.id ?? null,
  ],
  () => {
    previewLyricLineRefs.value = [];
    void syncPreviewLyricsOffset();
  },
  { immediate: true },
);

watch(
  () => isLyricsExpanded.value,
  (isExpanded) => {
    lyricsExpandedLineRefs.value = [];
    isLyricsExpandedReady.value = false;
    isInitializingLyricsExpanded.value = isExpanded;

    if (isExpanded) {
      void syncExpandedLyricsScroll("auto").then((didSync) => {
        if (!isLyricsExpanded.value) return;

        const finalizeOpen = () => {
          isLyricsExpandedReady.value = true;
          requestAnimationFrame(() => {
            isInitializingLyricsExpanded.value = false;
          });
        };

        if (didSync) {
          requestAnimationFrame(finalizeOpen);
          return;
        }

        isInitializingLyricsExpanded.value = false;
        requestAnimationFrame(() => {
          if (isLyricsExpanded.value) {
            void syncExpandedLyricsScroll("auto");
          }
          isLyricsExpandedReady.value = true;
        });
      });
      return;
    }

    isInitializingLyricsExpanded.value = false;
  },
  { flush: "post" },
);

watch(
  () => expandedLyricsState.value.activeIndex,
  (activeIndex, previousIndex) => {
    if (
      !isLyricsExpanded.value ||
      isInitializingLyricsExpanded.value ||
      activeIndex < 0 ||
      activeIndex === previousIndex
    ) {
      return;
    }

    void syncExpandedLyricsScroll(previousIndex < 0 ? "auto" : "smooth");
  },
);

onMounted(() => {
  void refreshConnectedOutput();

  void AudioOutput.addListener("audioOutputChanged", (output) => {
    connectedOutputName.value = output.name;
  }).then((listener) => {
    audioOutputListener = listener;
  }).catch(() => {
    audioOutputListener = null;
  });

  navigator.mediaDevices?.addEventListener?.(
    "devicechange",
    refreshConnectedOutput,
  );
});

onBeforeUnmount(() => {
  void audioOutputListener?.remove();
  audioOutputListener = null;
  navigator.mediaDevices?.removeEventListener?.(
    "devicechange",
    refreshConnectedOutput,
  );
  if (typeof document !== "undefined") {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }
});
</script>

<template>
  <div
    ref="mobileRefreshRef"
    class="mobile-refresh"
    @scroll.passive="handleMobileScroll"
    @wheel.passive="handleMobileWheel"
    @touchstart.passive="handleMobileTouchStart"
    @touchmove.passive="handleMobileTouchMove"
  >
    <div class="mobile-refresh__bg" />

    <header v-if="app.viewMode.value === 'home'" class="mobile-topbar">
      <div class="mobile-topbar__row">
        <div class="mobile-avatar">AD</div>
        <div class="mobile-topbar__copy">
          <p class="ui-kicker">App Desk Musica</p>
          <h1>Tu musica en movil</h1>
        </div>
        <button
          class="round-icon"
          type="button"
          @click="app.openSettingsPanel()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm8 4.3-.9-.5a7.5 7.5 0 0 0 0-1l.9-.5a.9.9 0 0 0 .4-1.2l-1.1-2a.9.9 0 0 0-1.1-.4l-1 .4a7.3 7.3 0 0 0-.9-.5l-.1-1.1a.9.9 0 0 0-.9-.8h-2.3a.9.9 0 0 0-.9.8l-.1 1.1c-.3.1-.6.3-.9.5l-1-.4a.9.9 0 0 0-1.1.4l-1.1 2a.9.9 0 0 0 .4 1.2l.9.5a7.5 7.5 0 0 0 0 1l-.9.5a.9.9 0 0 0-.4 1.2l1.1 2a.9.9 0 0 0 1.1.4l1-.4c.3.2.6.3.9.5l.1 1.1c.1.5.4.8.9.8h2.3c.5 0 .8-.3.9-.8l.1-1.1c.3-.1.6-.3.9-.5l1 .4a.9.9 0 0 0 1.1-.4l1.1-2a.9.9 0 0 0-.4-1.2Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <div class="home-actions">
        <button
          class="home-action home-action--ghost"
          type="button"
          @click="app.openSettingsPanel()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm8 4.3-.9-.5a7.5 7.5 0 0 0 0-1l.9-.5a.9.9 0 0 0 .4-1.2l-1.1-2a.9.9 0 0 0-1.1-.4l-1 .4a7.3 7.3 0 0 0-.9-.5l-.1-1.1a.9.9 0 0 0-.9-.8h-2.3a.9.9 0 0 0-.9.8l-.1 1.1c-.3.1-.6.3-.9.5l-1-.4a.9.9 0 0 0-1.1.4l-1.1 2a.9.9 0 0 0 .4 1.2l.9.5a7.5 7.5 0 0 0 0 1l-.9.5a.9.9 0 0 0-.4 1.2l1.1 2a.9.9 0 0 0 1.1.4l1-.4c.3.2.6.3.9.5l.1 1.1c.1.5.4.8.9.8h2.3c.5 0 .8-.3.9-.8l.1-1.1c.3-.1.6-.3.9-.5l1 .4a.9.9 0 0 0 1.1-.4l1.1-2a.9.9 0 0 0-.4-1.2Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
          </svg>
          <span>Servidor</span>
        </button>
        <button
          class="home-action home-action--accent"
          type="button"
          @click="app.refreshLibrary()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>{{
            app.isRefreshing.value ? "Actualizando" : "Sincronizar"
          }}</span>
        </button>
      </div>

      <div class="status-pill status-pill--compact">
        <strong>Estado</strong>
        <span v-if="app.isLoading.value">Cargando biblioteca...</span>
        <span v-else-if="app.errorMessage.value">{{
          app.errorMessage.value
        }}</span>
        <span v-else>{{ app.statusText.value }}</span>
      </div>
    </header>

    <main
      class="mobile-screen"
      :class="{
        'mobile-screen--flush': ['artist', 'album', 'playlist'].includes(
          app.viewMode.value,
        ),
      }"
    >
      <section v-if="app.viewMode.value === 'home'" class="home-shell">
        <div class="filter-row home-filter-row">
          <button
            v-for="filter in homeQuickFilters"
            :key="filter"
            class="filter-pill"
            :class="{ 'is-active': filter === 'Todas' }"
            type="button"
          >
            {{ filter }}
          </button>
        </div>

        <div class="quick-grid quick-grid--home">
          <button
            v-for="track in homeQuickItems"
            :key="track.id"
            class="quick-grid__item"
            type="button"
            @click="playTrackFromHome(track.id)"
          >
            <div class="quick-grid__cover">
              <img
                v-if="resolveCoverUrl(app.serverConfig.value, track)"
                :src="resolveCoverUrl(app.serverConfig.value, track) || ''"
                alt=""
              />
              <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
            </div>
            <span>{{ track.title }}</span>
          </button>
        </div>

        <section v-if="app.featuredTrack.value" class="home-section">
          <div class="home-section__title">Vuelve a tu musica</div>
          <button
            class="home-feature-card"
            type="button"
            @click="playTrackFromHome(app.featuredTrack.value.id)"
          >
            <div class="home-feature-card__copy">
              <p class="ui-kicker">Ahora reproduciendo</p>
              <strong>{{ app.featuredTrack.value.title }}</strong>
              <span>{{ app.featuredTrack.value.artist }}</span>
              <small>{{ currentContextBlurb }}</small>
            </div>
            <div class="home-feature-card__media">
              <img
                v-if="
                  resolveCoverUrl(
                    app.serverConfig.value,
                    app.featuredTrack.value,
                  )
                "
                :src="
                  resolveCoverUrl(
                    app.serverConfig.value,
                    app.featuredTrack.value,
                  ) || ''
                "
                alt=""
              />
              <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
            </div>
          </button>
        </section>

        <section v-if="homeContinueItems.length" class="home-section">
          <div class="home-section__title">Escuchaste recientemente</div>
          <div class="home-rail">
            <button
              v-for="track in homeContinueItems"
              :key="track.id"
              class="home-media-card"
              type="button"
              @click="playTrackFromHome(track.id)"
            >
              <div class="home-media-card__cover">
                <img
                  v-if="resolveCoverUrl(app.serverConfig.value, track)"
                  :src="resolveCoverUrl(app.serverConfig.value, track) || ''"
                  alt=""
                />
                <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
              </div>
              <strong>{{ track.title }}</strong>
              <span>{{ track.artist }}</span>
            </button>
          </div>
        </section>

        <section v-if="homeAlbumCards.length" class="home-section">
          <div class="home-section__title">Albumes destacados</div>
          <div class="home-rail">
            <button
              v-for="album in homeAlbumCards"
              :key="album.id"
              class="home-media-card"
              type="button"
              @click="app.openAlbumView(album.id)"
            >
              <div class="home-media-card__cover">
                <img
                  v-if="resolveCoverUrl(app.serverConfig.value, album)"
                  :src="resolveCoverUrl(app.serverConfig.value, album) || ''"
                  alt=""
                />
                <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
              </div>
              <strong>{{ album.name }}</strong>
              <span>{{ album.artist }}</span>
            </button>
          </div>
        </section>

        <section v-if="homeArtistCards.length" class="home-section">
          <div class="home-section__title">Artistas para ti</div>
          <div class="home-artist-rail">
            <button
              v-for="artist in homeArtistCards"
              :key="artist.id"
              class="home-artist-card"
              type="button"
              @click="app.openArtistView(artist.id)"
            >
              <div class="home-artist-card__avatar">
                <img
                  v-if="resolveCoverUrl(app.serverConfig.value, artist)"
                  :src="resolveCoverUrl(app.serverConfig.value, artist) || ''"
                  alt=""
                />
                <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
              </div>
              <div class="home-artist-card__copy">
                <span>Similares a</span>
                <strong>{{ artist.name }}</strong>
              </div>
            </button>
          </div>
        </section>

        <section v-if="homePlaylistCards.length" class="home-section">
          <div class="home-section__title">Tus playlists</div>
          <div class="home-playlist-stack">
            <button
              v-for="playlist in homePlaylistCards"
              :key="playlist.id"
              class="home-playlist-card"
              type="button"
              @click="app.openPlaylistView(playlist.id)"
            >
              <div class="playlist-inline-mosaic home-playlist-card__art">
                <template v-if="resolvePlaylistTiles(playlist).length">
                  <div
                    v-for="(cover, index) in resolvePlaylistTiles(playlist)"
                    :key="`${playlist.id}-${cover}-${index}`"
                    class="playlist-inline-mosaic__tile"
                  >
                    <img :src="cover" alt="" />
                  </div>
                </template>
                <div
                  v-else
                  class="playlist-inline-mosaic__tile playlist-inline-mosaic__tile--empty"
                ><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
              </div>
              <div class="home-playlist-card__copy">
                <strong>{{ playlist.name }}</strong>
                <span>{{ playlist.track_count }} canciones</span>
              </div>
              <div class="home-playlist-card__meta">Abrir</div>
            </button>
          </div>
        </section>
      </section>

      <section v-else-if="app.viewMode.value === 'search'" class="search-view">
        <header class="page-topbar page-topbar--search">
          <div class="page-topbar__avatar">AD</div>
          <h1>Buscar</h1>
          <button
            class="round-icon round-icon--plain"
            type="button"
            @click="app.openSettingsPanel()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 7h14v10H5zM9 7l1.5-2h3L15 7"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
              />
              <circle
                cx="12"
                cy="12"
                r="2.6"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              />
            </svg>
          </button>
        </header>

        <label class="search-hero">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle
              cx="11"
              cy="11"
              r="6.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            />
            <path
              d="M16 16 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
            />
          </svg>
          <input
            v-model="app.searchQuery.value"
            type="text"
            placeholder="¿Qué quieres escuchar?"
            @input="app.runSearch()"
          />
        </label>

        <section
          v-if="app.searchResults.value?.top_tracks.length"
          class="search-section"
        >
          <h2 class="section-title">Resultados</h2>
          <div class="search-top-list">
            <button
              v-for="track in app.searchResults.value.top_tracks.slice(0, 5)"
              :key="track.id"
              class="search-result-row"
              type="button"
              @click="
                app.playCollection(
                  app.searchResults.value?.top_tracks ?? [],
                  (app.searchResults.value?.top_tracks ?? []).findIndex(
                    (item) => item.id === track.id,
                  ),
                  'search',
                  app.searchQuery.value,
                  app.searchQuery.value,
                )
              "
            >
              <div class="search-result-row__cover">
                <img
                  v-if="resolveCoverUrl(app.serverConfig.value, track)"
                  :src="resolveCoverUrl(app.serverConfig.value, track) || ''"
                  alt=""
                />
                <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
              </div>
              <div class="search-result-row__copy">
                <strong>{{ track.title }}</strong>
                <span>{{ track.artist }} · {{ track.album }}</span>
              </div>
            </button>
          </div>
        </section>

        <section class="search-section">
          <h2 class="section-title">Explorar todo</h2>
          <div class="browse-grid">
            <button
              v-for="card in searchBrowseCards"
              :key="card.title"
              class="browse-card"
              type="button"
              :style="{ background: card.tone }"
              @click="
                app.searchQuery.value = card.title;
                app.runSearch(card.title);
              "
            >
              <strong>{{ card.title }}</strong>
              <img
                v-if="resolveEntityCover(card.entity)"
                :src="resolveEntityCover(card.entity)"
                alt=""
              />
            </button>
          </div>
        </section>
      </section>

      <section
        v-else-if="app.viewMode.value === 'artist' && app.selectedArtist.value"
        class="detail-page detail-page--artist"
        :class="{ 'detail-page--compact-header': detailHeaderCompact }"
      >
        <div class="detail-topbar">
          <button
            class="round-icon round-icon--ghost"
            type="button"
            @click="app.goBackView()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 5 8 12l7 7"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <label class="playlist-search-shell">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle
              cx="11"
              cy="11"
              r="6.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            />
            <path
              d="M16 16 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
            />
          </svg>
          <input
            v-model="artistPageSearch"
            type="text"
            placeholder="Buscar en esta pagina"
          />
        </label>

        <div class="detail-cover-frame detail-cover-frame--artist">
          <img
            v-if="artistHeroImage"
            :src="artistHeroImage"
            alt=""
            class="detail-cover-frame__image"
          />
          <div v-else class="detail-cover-frame__fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
        </div>

        <div class="detail-copy detail-copy--playlist">
          <h2>{{ app.selectedArtist.value.artist.name }}</h2>
          <div class="playlist-owner playlist-owner--header">
            <button
              class="playlist-mini-circle"
              type="button"
              @click="
                shareText(
                  app.selectedArtist.value.artist.name,
                  `${app.selectedArtist.value.artist.name} · ${app.selectedArtist.value.artist.track_count} canciones en tu biblioteca`,
                )
              "
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <span class="playlist-owner__avatar">{{
              app.selectedArtist.value.artist.name.slice(0, 2).toUpperCase()
            }}</span>
            <strong>Artista</strong>
          </div>
          <p class="detail-meta detail-meta--playlist">
            <span class="detail-meta__icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="8.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.9"
                />
                <path
                  d="M3.8 12h16.4M12 3.8c2.4 2.4 3.7 5.2 3.7 8.2S14.4 17.8 12 20.2M12 3.8C9.6 6.2 8.3 9 8.3 12s1.3 5.8 3.7 8.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            {{ app.selectedArtist.value.artist.track_count }} canciones ·
            {{ app.selectedArtist.value.albums.length }} albumes
            <template v-if="artistDurationLabel">
              · {{ artistDurationLabel }}
            </template>
          </p>
        </div>

        <div class="playlist-hero-actions">
          <button
            class="playlist-square-button"
            type="button"
            @click="
              app.playCollection(
                app.selectedArtist.value.tracks,
                0,
                'artist',
                app.selectedArtist.value.artist.name,
                app.selectedArtist.value.artist.name,
              )
            "
          >
            <img
              v-if="artistHeroImage"
              :src="artistHeroImage"
              alt=""
              class="playlist-square-button__cover"
            />
            <span v-else><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></span>
          </button>
          <button
            class="playlist-icon-action"
            type="button"
            @click="
              shareText(
                app.selectedArtist.value.artist.name,
                `${app.selectedArtist.value.artist.name} · ${app.selectedArtist.value.artist.track_count} canciones en tu biblioteca`,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 4.5v10.5M7.5 10.5 12 15l4.5-4.5M6 19.5h12"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="playlist-icon-action"
            type="button"
            @click="
              app.searchQuery.value = app.selectedArtist.value.artist.name;
              app.runSearch(app.selectedArtist.value.artist.name);
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 15 15 9M10 9h5v5"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="playlist-icon-action"
            type="button"
            @click="
              shareText(
                app.selectedArtist.value.artist.name,
                `${app.selectedArtist.value.artist.name} · ${app.selectedArtist.value.albums.length} albumes`,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="5.5" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="18.5" r="1.8" fill="currentColor" />
            </svg>
          </button>
          <button
            class="playlist-icon-action playlist-icon-action--accent"
            type="button"
            @click="
              playShuffledCollection(
                app.selectedArtist.value.tracks,
                'artist',
                app.selectedArtist.value.artist.name,
                app.selectedArtist.value.artist.name,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 7h12m0 0-3-3m3 3-3 3M20 17H8m0 0 3-3m-3 3 3 3"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="playlist-play-button"
            type="button"
            @click="
              app.playCollection(
                app.selectedArtist.value.tracks,
                0,
                'artist',
                app.selectedArtist.value.artist.name,
                app.selectedArtist.value.artist.name,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5 18 12 8 18.5z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div class="playlist-action-row">
          <button
            class="library-chip"
            type="button"
            @click="
              playShuffledCollection(
                app.selectedArtist.value.tracks,
                'artist',
                app.selectedArtist.value.artist.name,
                app.selectedArtist.value.artist.name,
              )
            "
          >
            Mixear
          </button>
          <button
            class="library-chip"
            type="button"
            @click="
              shareText(
                app.selectedArtist.value.artist.name,
                `${app.selectedArtist.value.artist.name} · ${app.selectedArtist.value.artist.track_count} canciones en tu biblioteca`,
              )
            "
          >
            Compartir
          </button>
          <button
            class="library-chip"
            type="button"
            @click="
              app.searchQuery.value = app.selectedArtist.value.artist.name;
              app.runSearch(app.selectedArtist.value.artist.name);
            "
          >
            Buscar
          </button>
        </div>

        <section class="detail-section">
          <h3 class="section-title">Canciones</h3>
          <div class="track-list-art track-list-art--songs">
            <button
              v-for="(track, index) in visibleArtistTracks"
              :key="track.id"
              class="track-list-art__row"
              type="button"
              @click="
                app.playCollection(
                  app.selectedArtist.value?.tracks ?? [],
                  (app.selectedArtist.value?.tracks ?? []).findIndex(
                    (item) => item.id === track.id,
                  ),
                  'artist',
                  app.selectedArtist.value?.artist.name ?? '',
                  app.selectedArtist.value?.artist.name ?? '',
                )
              "
            >
              <div class="track-list-art__cover">
                <img
                  v-if="resolveCoverUrl(app.serverConfig.value, track)"
                  :src="resolveCoverUrl(app.serverConfig.value, track) || ''"
                  alt=""
                />
                <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
              </div>
              <div class="track-list-art__copy">
                <strong>{{ index + 1 }}. {{ track.title }}</strong>
                <span>{{ track.album }}</span>
              </div>
              <div
                class="track-list-art__menu"
                @click.stop="
                  shareText(
                    track.title,
                    `${track.title} · ${track.artist} · ${track.album}`,
                  )
                "
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5.5" r="1.8" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                  <circle cx="12" cy="18.5" r="1.8" fill="currentColor" />
                </svg>
              </div>
            </button>
          </div>
        </section>

        <section v-if="artistSelectedAlbums.length" class="detail-section">
          <div class="section-headline">
            <h3 class="section-title">Seleccion del artista</h3>
          </div>
          <div class="album-list-vertical">
            <button
              v-for="album in artistSelectedAlbums"
              :key="album.id"
              class="album-list-vertical__row"
              type="button"
              @click="app.openAlbumView(album.id)"
            >
              <img
                v-if="resolveCoverUrl(app.serverConfig.value, album)"
                :src="resolveCoverUrl(app.serverConfig.value, album) || ''"
                alt=""
              />
              <div>
                <strong>{{ album.name }}</strong>
                <span
                  >{{ album.year || "Lanzamiento" }} ·
                  {{ album.track_count }} canciones</span
                >
              </div>
            </button>
          </div>
        </section>
      </section>

      <section
        v-else-if="app.viewMode.value === 'album' && app.selectedAlbum.value"
        class="detail-page detail-page--album"
        :class="{ 'detail-page--compact-header': detailHeaderCompact }"
      >
        <div class="detail-topbar">
          <button
            class="round-icon round-icon--ghost"
            type="button"
            @click="app.goBackView()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 5 8 12l7 7"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <label class="playlist-search-shell">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle
              cx="11"
              cy="11"
              r="6.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            />
            <path
              d="M16 16 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
            />
          </svg>
          <input
            v-model="albumPageSearch"
            type="text"
            placeholder="Buscar en esta pagina"
          />
        </label>

        <div class="detail-cover-frame">
          <img
            v-if="albumHeroImage"
            :src="albumHeroImage"
            alt=""
            class="detail-cover-frame__image"
          />
          <div v-else class="detail-cover-frame__fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
        </div>

        <div class="detail-copy detail-copy--playlist">
          <h2>{{ app.selectedAlbum.value.album.name }}</h2>
          <div class="playlist-owner playlist-owner--header">
            <button
              class="playlist-mini-circle"
              type="button"
              @click="openSelectedAlbumArtist()"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <span class="playlist-owner__avatar">{{
              app.selectedAlbum.value.album.artist.slice(0, 2).toUpperCase()
            }}</span>
            <strong>{{ app.selectedAlbum.value.album.artist }}</strong>
          </div>
          <p class="detail-meta detail-meta--playlist">
            <span class="detail-meta__icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="8.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.9"
                />
                <path
                  d="M3.8 12h16.4M12 3.8c2.4 2.4 3.7 5.2 3.7 8.2S14.4 17.8 12 20.2M12 3.8C9.6 6.2 8.3 9 8.3 12s1.3 5.8 3.7 8.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            Album · {{ app.selectedAlbum.value.album.year || "2026" }}
            <template v-if="albumDurationLabel"> · {{ albumDurationLabel }}</template>
            · {{ app.selectedAlbum.value.album.track_count }} canciones
          </p>
        </div>

        <div class="playlist-hero-actions">
          <button
            class="playlist-square-button"
            type="button"
            @click="
              app.playCollection(
                app.selectedAlbum.value.tracks,
                0,
                'album',
                app.selectedAlbum.value.album.name,
                app.selectedAlbum.value.album.name,
              )
            "
          >
            <img
              v-if="albumHeroImage"
              :src="albumHeroImage"
              alt=""
              class="playlist-square-button__cover"
            />
            <span v-else><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></span>
          </button>
          <button
            class="playlist-icon-action"
            type="button"
            @click="
              shareText(
                app.selectedAlbum.value.album.name,
                `${app.selectedAlbum.value.album.name} · ${app.selectedAlbum.value.album.artist}`,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 4.5v10.5M7.5 10.5 12 15l4.5-4.5M6 19.5h12"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="playlist-icon-action"
            type="button"
            @click="openSelectedAlbumArtist()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 15 15 9M10 9h5v5"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="playlist-icon-action"
            type="button"
            @click="
              shareText(
                app.selectedAlbum.value.album.name,
                `${app.selectedAlbum.value.album.name} · ${app.selectedAlbum.value.album.track_count} canciones`,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="5.5" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="18.5" r="1.8" fill="currentColor" />
            </svg>
          </button>
          <button
            class="playlist-icon-action playlist-icon-action--accent"
            type="button"
            @click="
              playShuffledCollection(
                app.selectedAlbum.value.tracks,
                'album',
                app.selectedAlbum.value.album.name,
                app.selectedAlbum.value.album.name,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 7h12m0 0-3-3m3 3-3 3M20 17H8m0 0 3-3m-3 3 3 3"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="playlist-play-button"
            type="button"
            @click="
              app.playCollection(
                app.selectedAlbum.value.tracks,
                0,
                'album',
                app.selectedAlbum.value.album.name,
                app.selectedAlbum.value.album.name,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5 18 12 8 18.5z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div class="playlist-action-row">
          <button
            class="library-chip"
            type="button"
            @click="openSelectedAlbumArtist()"
          >
            Artista
          </button>
          <button
            class="library-chip"
            type="button"
            @click="
              shareText(
                app.selectedAlbum.value.album.name,
                `${app.selectedAlbum.value.album.name} · ${app.selectedAlbum.value.album.artist}`,
              )
            "
          >
            Compartir
          </button>
          <button
            class="library-chip"
            type="button"
            @click="
              playShuffledCollection(
                app.selectedAlbum.value.tracks,
                'album',
                app.selectedAlbum.value.album.name,
                app.selectedAlbum.value.album.name,
              )
            "
          >
            Mixear
          </button>
        </div>

        <div class="track-list-art track-list-art--songs">
          <button
            v-for="(track, index) in visibleAlbumTracks"
            :key="track.id"
            class="track-list-art__row"
            type="button"
            @click="
              app.playCollection(
                visibleAlbumTracks,
                visibleAlbumTracks.findIndex(
                  (item) => item.id === track.id,
                ),
                'album',
                app.selectedAlbum.value?.album.name ?? '',
                app.selectedAlbum.value?.album.name ?? '',
              )
            "
          >
            <div class="track-list-art__cover">
              <img
                v-if="resolveCoverUrl(app.serverConfig.value, track)"
                :src="resolveCoverUrl(app.serverConfig.value, track) || ''"
                alt=""
              />
              <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
            </div>
            <div class="track-list-art__copy">
              <strong>{{ index + 1 }}. {{ track.title }}</strong>
              <span>{{ track.artist }}</span>
            </div>
            <div
              class="track-list-art__menu"
              @click.stop="
                shareText(
                  track.title,
                  `${track.title} · ${track.artist} · ${app.selectedAlbum.value?.album.name ?? ''}`,
                )
              "
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="5.5" r="1.8" fill="currentColor" />
                <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                <circle cx="12" cy="18.5" r="1.8" fill="currentColor" />
              </svg>
            </div>
          </button>
        </div>

        <section v-if="albumMoreFromArtist.length" class="detail-section">
          <div class="section-headline">
            <h3 class="section-title">
              Mas de {{ app.selectedAlbum.value.album.artist }}
            </h3>
          </div>
          <div class="cover-rail">
            <button
              v-for="album in albumMoreFromArtist"
              :key="album.id"
              class="cover-rail__item"
              type="button"
              @click="app.openAlbumView(album.id)"
            >
              <div class="cover-rail__art">
                <img
                  v-if="resolveCoverUrl(app.serverConfig.value, album)"
                  :src="resolveCoverUrl(app.serverConfig.value, album) || ''"
                  alt=""
                />
              </div>
              <strong>{{ album.name }}</strong>
              <span>{{ album.year || "Lanzamiento" }}</span>
            </button>
          </div>
        </section>

        <section v-if="albumSuggestedPlaylists.length" class="detail-section">
          <h3 class="section-title">Tambien podria gustarte</h3>
          <div class="cover-rail">
            <button
              v-for="playlist in albumSuggestedPlaylists"
              :key="playlist.id"
              class="cover-rail__item"
              type="button"
              @click="app.openPlaylistView(playlist.id)"
            >
              <div class="cover-rail__art">
                <img
                  v-if="resolvePlaylistTiles(playlist, 1)[0]"
                  :src="resolvePlaylistTiles(playlist, 1)[0]"
                  alt=""
                />
              </div>
              <strong>{{ playlist.name }}</strong>
              <span>Playlist recomendada</span>
            </button>
          </div>
        </section>
      </section>

      <section
        v-else-if="
          app.viewMode.value === 'playlist' && app.activePlaylist.value
        "
        class="detail-page detail-page--playlist"
        :class="{ 'detail-page--compact-header': detailHeaderCompact }"
      >
        <div class="detail-topbar">
          <button
            class="round-icon round-icon--ghost"
            type="button"
            @click="app.goBackView()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 5 8 12l7 7"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <label class="playlist-search-shell">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle
              cx="11"
              cy="11"
              r="6.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            />
            <path
              d="M16 16 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
            />
          </svg>
          <input
            v-model="playlistPageSearch"
            type="text"
            placeholder="Buscar en esta pagina"
          />
        </label>

        <div class="playlist-hero-card">
          <div class="playlist-mosaic">
            <div
              v-for="(cover, index) in playlistCoverTiles"
              :key="`${cover}-${index}`"
              class="playlist-mosaic__tile"
            >
              <img :src="cover" alt="" />
            </div>
            <div
              v-if="!playlistCoverTiles.length"
              class="playlist-mosaic__tile playlist-mosaic__tile--empty"
            ><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
          </div>
        </div>

        <div class="detail-copy detail-copy--playlist">
          <h2>{{ app.activePlaylist.value.name }}</h2>
          <div class="playlist-owner playlist-owner--header">
            <button
              class="playlist-mini-circle"
              type="button"
              @click="openPlaylistAddFlow()"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <span class="playlist-owner__avatar">JT</span>
            <strong>JhonJa Taylor's Version</strong>
          </div>
          <p class="detail-meta detail-meta--playlist">
            <span class="detail-meta__icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="8.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.9"
                />
                <path
                  d="M3.8 12h16.4M12 3.8c2.4 2.4 3.7 5.2 3.7 8.2S14.4 17.8 12 20.2M12 3.8C9.6 6.2 8.3 9 8.3 12s1.3 5.8 3.7 8.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            {{ visiblePlaylistTracks.length }} canciones · {{ playlistDurationLabel }}
          </p>
        </div>

        <div class="playlist-hero-actions">
          <button
            class="playlist-square-button"
            type="button"
            @click="
              app.playCollection(
                visiblePlaylistTracks,
                0,
                'playlist',
                app.activePlaylist.value.name,
                app.activePlaylist.value.name,
              )
            "
          >
            <img
              v-if="playlistHeroCover"
              :src="playlistHeroCover"
              alt=""
              class="playlist-square-button__cover"
            />
            <span v-else><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></span>
          </button>
          <button
            class="playlist-icon-action"
            type="button"
            @click="
              shareText(
                app.activePlaylist.value.name,
                `${app.activePlaylist.value.name} · ${app.activePlaylistTracks.value.length} canciones`,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 4.5v10.5M7.5 10.5 12 15l4.5-4.5M6 19.5h12"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="playlist-icon-action"
            type="button"
            @click="
              shareText(
                app.activePlaylist.value.name,
                `${app.activePlaylist.value.name} · ${app.activePlaylistTracks.value.length} canciones`,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 15 15 9M10 9h5v5"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="playlist-icon-action"
            type="button"
            @click="renameActivePlaylist()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="5.5" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="18.5" r="1.8" fill="currentColor" />
            </svg>
          </button>
          <button
            class="playlist-icon-action playlist-icon-action--accent"
            type="button"
            @click="
              playShuffledCollection(
                visiblePlaylistTracks,
                'playlist',
                app.activePlaylist.value.name,
                app.activePlaylist.value.name,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 7h12m0 0-3-3m3 3-3 3M20 17H8m0 0 3-3m-3 3 3 3"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            class="playlist-play-button"
            type="button"
            @click="
              app.playCollection(
                visiblePlaylistTracks,
                0,
                'playlist',
                app.activePlaylist.value.name,
                app.activePlaylist.value.name,
              )
            "
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5 18 12 8 18.5z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div class="playlist-action-row">
          <button
            class="library-chip"
            type="button"
            @click="openPlaylistAddFlow()"
          >
            + Agregar
          </button>
          <button
            class="library-chip"
            type="button"
            @click="
              playShuffledCollection(
                visiblePlaylistTracks,
                'playlist',
                app.activePlaylist.value.name,
                app.activePlaylist.value.name,
              )
            "
          >
            Mixear
          </button>
          <button
            class="library-chip"
            type="button"
            @click="renameActivePlaylist()"
          >
            Editar
          </button>
          <button
            class="library-chip library-chip--muted"
            type="button"
            @click="
              playlistSortMode =
                playlistSortMode === 'custom' ? 'title' : 'custom'
            "
          >
            Ordenar
          </button>
        </div>

        <div class="track-list-art track-list-art--songs">
          <button
            v-for="track in visiblePlaylistTracks"
            :key="track.id"
            class="track-list-art__row"
            type="button"
            @click="
              app.playCollection(
                visiblePlaylistTracks,
                visiblePlaylistTracks.findIndex(
                  (item) => item.id === track.id,
                ),
                'playlist',
                app.activePlaylist.value?.name ?? '',
                app.activePlaylist.value?.name ?? '',
              )
            "
            >
              <div class="track-list-art__cover">
                <img
                  v-if="resolveCoverUrl(app.serverConfig.value, track)"
                  :src="resolveCoverUrl(app.serverConfig.value, track) || ''"
                alt=""
              />
              <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
              </div>
              <div class="track-list-art__copy">
                <strong>{{ track.title }}</strong>
                <span>{{ track.artist }}</span>
              </div>
              <div
                class="track-list-art__menu"
                @click.stop="
                  shareText(
                    track.title,
                    `${track.title} · ${track.artist}`,
                  )
                "
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5.5" r="1.8" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                  <circle cx="12" cy="18.5" r="1.8" fill="currentColor" />
                </svg>
              </div>
          </button>
        </div>
      </section>
      <section v-else class="library-view">
        <header class="page-topbar page-topbar--library">
          <div class="page-topbar__avatar">AD</div>
          <h1>Tu biblioteca</h1>
          <div class="page-topbar__actions">
            <button
              class="round-icon round-icon--plain"
              type="button"
              @click="
                app.navigateToTab('search')
              "
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="11"
                  cy="11"
                  r="6.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                />
                <path
                  d="M16 16 20 20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <button
              class="round-icon round-icon--plain"
              type="button"
              @click="app.openCreatePlaylistSheet()"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 4v16M4 12h16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
        </header>

        <div class="library-filter-row">
          <button
            v-for="filter in libraryCollectionFilters"
            :key="filter"
            class="filter-pill"
            :class="{ 'is-active': filter === 'Playlists' }"
            type="button"
          >
            {{ filter }}
          </button>
        </div>

        <div class="library-sort-row">
          <strong>Recientes</strong>
          <button
            class="sort-grid"
            type="button"
            @click="
              app.navigateToTab('search')
            "
          ><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="24" height="24"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect></svg></button>
        </div>

        <div class="library-list">
          <button
            v-for="item in libraryRows"
            :key="item.id"
            class="library-list__row"
            type="button"
            @click="item.action()"
          >
            <div class="library-list__cover">
              <template v-if="item.kind === 'playlist'">
                <div class="playlist-inline-mosaic playlist-inline-mosaic--library">
                  <template
                    v-if="
                      resolvePlaylistTiles(item.entity as { id: number }).length
                    "
                  >
                    <div
                      v-for="(cover, index) in resolvePlaylistTiles(
                        item.entity as { id: number },
                      )"
                      :key="`${item.id}-${cover}-${index}`"
                      class="playlist-inline-mosaic__tile"
                    >
                      <img :src="cover" alt="" />
                    </div>
                  </template>
                  <div
                    v-else
                    class="playlist-inline-mosaic__tile playlist-inline-mosaic__tile--empty"
                  ><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
                </div>
              </template>
              <template v-else>
                <img
                  v-if="resolveEntityCover(item.entity)"
                  :src="resolveEntityCover(item.entity)"
                  alt=""
                />
                <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
              </template>
            </div>
            <div class="library-list__copy">
              <strong>{{ item.title }}</strong>
              <span>{{ item.subtitle }}</span>
            </div>
          </button>
        </div>

        <div class="library-actions">
          <button class="library-action-row" type="button">
            Agregar artistas
          </button>
          <button class="library-action-row" type="button">
            Agregar podcasts
          </button>
          <button class="library-action-row" type="button">
            Agregar eventos y lugares
          </button>
          <button class="library-action-row" type="button">
            Importar tu musica
          </button>
        </div>
      </section>
    </main>

    <div v-if="app.errorMessage.value" class="toast-error">
      {{ app.errorMessage.value }}
    </div>

    <div
      v-if="app.currentTrack.value"
      class="mini-player"
      :style="{ background: miniPlayerColor }"
      role="button"
      tabindex="0"
      @click="app.openNowPlayingSheet()"
    >
      <div class="mini-player__cover">
        <img
          v-if="app.currentCoverUrl.value"
          :src="app.currentCoverUrl.value"
          alt=""
        />
        <div v-else class="media-fallback">?</div>
      </div>
      <div class="mini-player__copy">
        <div class="mini-player__title-line">
          <strong>{{ app.currentTrack.value.title }}</strong>
          <span class="mini-player__artist-inline"
            >• {{ app.currentTrack.value.artist }}</span
          >
        </div>
        <span class="mini-player__device">{{ currentOutput.name }}</span>
      </div>

      <div class="mini-player__actions">
        <button
          class="mini-icon-button"
          type="button"
          @click.stop="app.openNowPlayingSheet()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect
              x="4"
              y="6"
              width="7"
              height="12"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            />
            <rect
              x="13"
              y="4"
              width="7"
              height="16"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            />
            <circle cx="16.5" cy="16.5" r="1.4" fill="currentColor" />
          </svg>
        </button>
        <button class="mini-icon-button mini-icon-button--accent" type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7 12.5 10.2 15.8 17.5 8.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          class="mini-icon-button mini-icon-button--play"
          type="button"
          @click.stop="app.togglePlayback()"
        >
          <svg
            v-if="app.isPlaying.value"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <rect x="6" y="5" width="4" height="14" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" fill="currentColor" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5 18 12 8 18.5z" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div class="mini-player__progress">
        <span :style="{ width: `${app.progressPercentage.value}%` }" />
      </div>
    </div>

    <BottomTabBar
      :active-tab="app.activeTab.value"
      :is-create-open="app.isCreatePlaylistOpen.value"
      :create-drag-offset="app.createSheetDragOffset.value"
      @change="handleBottomTabChange"
    />

    <transition name="sheet-fade">
      <div
        v-if="app.isNowPlayingOpen.value && app.currentTrack.value"
        class="player-overlay"
        ref="playerOverlayRef"
        :style="playerOverlayStyle"
        @click.self="closeNowPlaying()"
      >
        <section
          class="player-screen"
          :style="playerScreenStyle"
          @touchstart="onPlayerTouchStart"
          @touchmove="onPlayerTouchMove"
          @touchend="onPlayerTouchEnd"
          @touchcancel="onPlayerTouchEnd"
        >
          <div
            class="player-screen__hero"
            :class="{
              'player-screen__hero--canvas': !!app.currentCanvasUrl.value,
              'player-screen__hero--cover': !app.currentCanvasUrl.value,
            }"
          >
            <div class="player-screen__visual">
              <div
                v-if="app.currentCanvasUrl.value && !isCanvasReady"
                class="player-screen__canvas-placeholder"
              >
                <img
                  v-if="app.currentCoverUrl.value"
                  class="player-screen__art-bg"
                  :src="app.currentCoverUrl.value"
                  alt=""
                />
                <div
                  v-if="app.currentCoverUrl.value"
                  class="player-screen__art-card player-screen__art-card--placeholder"
                >
                  <img
                    class="player-screen__art-image"
                    :src="app.currentCoverUrl.value"
                    alt=""
                  />
                </div>
              </div>
              <video
                v-if="app.currentCanvasUrl.value"
                class="player-screen__canvas"
                :class="{ 'is-ready': isCanvasReady }"
                :src="app.currentCanvasUrl.value"
                muted
                autoplay
                loop
                playsinline
                @loadeddata="handleCanvasReady"
                @canplay="handleCanvasReady"
              />
              <div v-else class="player-screen__art player-screen__art--cover">
                <img
                  v-if="app.currentCoverUrl.value"
                  class="player-screen__art-bg"
                  :src="app.currentCoverUrl.value"
                  alt=""
                />
                <div
                  v-if="app.currentCoverUrl.value"
                  class="player-screen__art-card"
                >
                  <img
                    class="player-screen__art-image"
                    :src="app.currentCoverUrl.value"
                    alt=""
                  />
                </div>
                <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
              </div>
            </div>
            <div class="player-screen__visual-scrim" />

            <div class="player-screen__topbar">
              <button
                class="round-icon round-icon--ghost"
                type="button"
                aria-label="Cerrar reproductor"
                @click="closeNowPlaying()"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 9l6 6 6-6"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                  />
                </svg>
              </button>
              <div class="player-screen__title">
                <p class="ui-kicker">
                  Reproduciendo desde
                  {{ app.currentSourceInfo.value.sourceLabel.toLowerCase() }}
                </p>
                <strong>{{
                  app.currentSourceInfo.value.sourceTargetLabel
                }}</strong>
              </div>
              <button
                class="round-icon round-icon--ghost"
                type="button"
                aria-label="Opciones"
                @click="app.toggleQueuePanel()"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.8" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                  <circle cx="12" cy="19" r="1.8" fill="currentColor" />
                </svg>
              </button>
            </div>

            <div class="player-screen__lyric-overlay">
              <p
                v-if="
                  visibleLyricsState.lines[visibleLyricsState.activeLocalIndex]
                    ?.text
                "
                class="player-screen__lyric-current"
              >
                {{
                  visibleLyricsState.lines[visibleLyricsState.activeLocalIndex]
                    .text
                }}
              </p>
              <p
                v-if="
                  visibleLyricsState.lines[
                    visibleLyricsState.activeLocalIndex + 1
                  ]?.text
                "
                class="player-screen__lyric-next"
              >
                {{
                  visibleLyricsState.lines[
                    visibleLyricsState.activeLocalIndex + 1
                  ].text
                }}
              </p>
            </div>

            <div class="player-screen__hero-bottom">
              <div class="player-screen__track">
                <div class="player-screen__track-main">
                  <div class="player-screen__track-cover">
                    <img
                      v-if="app.currentCoverUrl.value"
                      :src="app.currentCoverUrl.value"
                      alt=""
                    />
                    <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
                  </div>
                  <div class="player-screen__track-copy">
                    <h2>{{ app.currentTrack.value.title }}</h2>
                    <p>{{ app.currentTrack.value.artist }}</p>
                  </div>
                </div>
                <button
                  class="player-screen__confirm"
                  type="button"
                  aria-label="En biblioteca"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M6 12.5l4 4L18.5 8"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.6"
                    />
                  </svg>
                </button>
              </div>

              <div
                class="player-screen__progress"
                @click="
                  app.seekTo(
                    $event.clientX,
                    $event.currentTarget as HTMLElement,
                  )
                "
              >
                <span
                  class="player-screen__progress-fill"
                  :style="{ width: `${app.progressPercentage.value}%` }"
                />
              </div>
              <div class="player-screen__times">
                <span>{{ app.formatDuration(app.currentTime.value) }}</span>
                <span>{{ app.formatDuration(app.duration.value) }}</span>
              </div>

              <div
                class="player-screen__controls player-screen__controls--main"
              >
                <button
                  class="control-circle control-circle--ghost"
                  type="button"
                  aria-label="Aleatorio"
                  @click="app.toggleShuffle()"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M4 6h2.6c1.6 0 2.4.5 3.3 1.7l6.3 8.5c.9 1.2 1.7 1.8 3.3 1.8H20"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-width="2.2"
                    />
                    <path
                      d="M4 18h2.6c1.6 0 2.4-.5 3.3-1.7l1.4-1.9"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-width="2.2"
                    />
                    <path
                      d="M14.8 9.3l1.4-1.8C17.1 6.4 17.9 6 19.4 6H20"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-width="2.2"
                    />
                    <path
                      d="M17 4l3 2-3 2"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.2"
                    />
                    <path
                      d="M17 16l3 2-3 2"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.2"
                    />
                  </svg>
                </button>
                <button
                  class="control-circle control-circle--ghost"
                  type="button"
                  aria-label="Anterior"
                  @click="app.playPrevious()"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M7 6v12"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-width="2.4"
                    />
                    <path d="M18 6l-7 6 7 6z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  class="control-circle control-circle--primary"
                  type="button"
                  aria-label="Reproducir o pausar"
                  @click="app.togglePlayback()"
                >
                  <svg
                    v-if="app.isPlaying.value"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect
                      x="7"
                      y="6"
                      width="3.5"
                      height="12"
                      rx="1"
                      fill="currentColor"
                    />
                    <rect
                      x="13.5"
                      y="6"
                      width="3.5"
                      height="12"
                      rx="1"
                      fill="currentColor"
                    />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 6.5l10 5.5-10 5.5z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  class="control-circle control-circle--ghost"
                  type="button"
                  aria-label="Siguiente"
                  @click="app.playNext()"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M17 6v12"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-width="2.4"
                    />
                    <path d="M6 6l7 6-7 6z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  v-if="canShowConnectDeviceAction"
                  class="control-circle control-circle--accent-outline"
                  type="button"
                  :aria-label="connectDeviceActionLabel"
                  @click="app.toggleDesktopConnect()"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect
                      x="4.5"
                      y="4.5"
                      width="9"
                      height="15"
                      rx="2"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    />
                    <path
                      d="M15.5 17.5a4.5 4.5 0 0 0 0-9"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-width="2"
                    />
                    <path
                      d="M18.5 16l1.8 1.8L22 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                </button>
              </div>

              <div class="player-screen__utility-row">
                <button
                  v-if="canShowConnectDeviceAction"
                  class="utility-button utility-button--device"
                  type="button"
                  :aria-label="connectDeviceActionLabel"
                  @click="app.toggleDesktopConnect()"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect
                      x="3.5"
                      y="4.5"
                      width="9"
                      height="15"
                      rx="2"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    />
                    <path
                      d="M15 17.5a4.5 4.5 0 0 0 0-9"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-width="2"
                    />
                    <path
                      d="M18 16l1.8 1.8L21.6 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                  <span>{{ currentOutput.name }}</span>
                </button>
                <div v-else class="utility-button utility-button--device">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect
                      x="3.5"
                      y="4.5"
                      width="9"
                      height="15"
                      rx="2"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    />
                    <path
                      d="M15 17.5a4.5 4.5 0 0 0 0-9"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-width="2"
                    />
                  </svg>
                  <span>{{ currentOutput.name }}</span>
                </div>
                <button
                  class="utility-button"
                  type="button"
                  aria-label="Compartir"
                  @click="shareCurrentTrack()"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="18" cy="5" r="2" fill="currentColor" />
                    <circle cx="6" cy="12" r="2" fill="currentColor" />
                    <circle cx="18" cy="19" r="2" fill="currentColor" />
                    <path
                      d="M7.8 11.1l8-4.2M7.8 12.9l8 4.2"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                    />
                  </svg>
                </button>
                <button
                  class="utility-button"
                  type="button"
                  aria-label="Cola"
                  @click="app.toggleQueuePanel()"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M8 7h11M8 12h11M8 17h11"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-width="2.4"
                    />
                    <circle cx="4.5" cy="7" r="1.2" fill="currentColor" />
                    <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
                    <circle cx="4.5" cy="17" r="1.2" fill="currentColor" />
                  </svg>
                </button>
              </div>
              <div class="player-screen__volume-row">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 9.5h3.8L13 5v14l-5.2-4.5H4z"
                    fill="none"
                    stroke="currentColor"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                  <path
                    d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="2"
                  />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  :value="app.volume.value"
                  :aria-label="`Volumen en ${currentOutput.name}`"
                  @input="handleVolumeInput"
                />
                <span>{{ Math.round(app.volume.value) }}%</span>
              </div>
            </div>
          </div>

          <article v-if="hasLyrics" class="detail-panel detail-panel--lyrics-shell">
            <button
              class="lyrics-card lyrics-card--preview"
              type="button"
              :style="lyricsCardStyle"
              @click="isLyricsExpanded = true"
            >
              <div class="lyrics-card__header">
                <div class="detail-panel__title-block">
                  <h3>Letra</h3>
                </div>
                <div class="detail-panel__actions detail-panel__actions--lyrics">
                  <button
                    class="utility-button utility-button--small"
                    type="button"
                    aria-label="Traducir letra"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 7h10M10 4v3M8 7c0 3.3 2.4 6.4 5.8 8.1M7 16h8M15 11l4-7M16.6 8h4.8M18.9 4l2.5 7"
                        fill="none"
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.8"
                      />
                    </svg>
                  </button>
                  <button
                    class="utility-button utility-button--small"
                    type="button"
                    aria-label="Compartir"
                    @click.stop="shareCurrentTrack()"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="18" cy="5" r="2" fill="currentColor" />
                      <circle cx="6" cy="12" r="2" fill="currentColor" />
                      <circle cx="18" cy="19" r="2" fill="currentColor" />
                      <path
                        d="M7.8 11.1l8-4.2M7.8 12.9l8 4.2"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                      />
                    </svg>
                  </button>
                  <button
                    class="utility-button utility-button--small"
                    type="button"
                    aria-label="Expandir letra"
                    @click.stop="isLyricsExpanded = true"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"
                        fill="none"
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div
                v-if="visibleLyricsState.lines.length"
                ref="previewLyricsViewportRef"
                class="lyrics-card__viewport"
              >
                <div
                  ref="previewLyricsContentRef"
                  class="lyrics-card__lines"
                  :style="{
                    transform: `translateY(-${previewLyricsOffset}px)`,
                  }"
                >
                  <p
                    v-for="(line, index) in visibleLyricsState.lines"
                    :key="`${line.time}-${line.text}-${index}`"
                    :ref="(element) => setPreviewLyricLineRef(element, index)"
                    :class="[
                      'lyrics-line',
                      {
                        'is-active':
                          index === visibleLyricsState.activeLocalIndex,
                      },
                    ]"
                  >
                    {{ line.text }}
                  </p>
                </div>
              </div>
            </button>
          </article>

          <article class="detail-panel">
            <div class="detail-panel__header">
              <h3>SongDNA <span class="detail-panel__beta">Beta</span></h3>
            </div>
            <div class="songdna-grid">
              <div class="songdna-person">
                <div class="songdna-person__avatar">
                  <img
                    v-if="
                      currentArtist &&
                      resolveCoverUrl(app.serverConfig.value, currentArtist)
                    "
                    :src="
                      resolveCoverUrl(app.serverConfig.value, currentArtist) ||
                      ''
                    "
                    alt=""
                  />
                  <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
                </div>
                <strong>{{
                  currentArtist?.name ?? app.currentTrack.value.artist
                }}</strong>
                <span>Artista principal</span>
              </div>
              <div class="songdna-person songdna-person--muted">
                <div
                  class="songdna-person__avatar songdna-person__avatar--placeholder"
                ><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
                <strong>{{ currentCredits.length }}</strong>
                <span>Compositor/a y mas</span>
              </div>
            </div>
            <div class="songdna-footer">
              <div>
                <strong>{{ app.currentTrack.value.title }}</strong>
                <p>{{ currentCredits.length }} contribuidores</p>
              </div>
              <button
                v-if="currentArtist"
                class="follow-chip"
                type="button"
                @click="app.openArtistView(currentArtist.id)"
              >
                Explorar
              </button>
            </div>
          </article>

          <article
            v-if="relatedTracks.length"
            class="detail-panel detail-panel--dark"
          >
            <div class="detail-panel__header">
              <h3>Videos musicales relacionados</h3>
            </div>
            <div class="related-rail">
              <button
                v-for="track in relatedTracks.slice(0, 4)"
                :key="track.id"
                class="related-card"
                type="button"
                @click="
                  app.playCollection(
                    relatedTracks,
                    relatedTracks.findIndex((item) => item.id === track.id),
                    'library',
                    'Biblioteca',
                    'Biblioteca',
                  )
                "
              >
                <div class="related-card__media">
                  <img
                    v-if="resolveCoverUrl(app.serverConfig.value, track)"
                    :src="resolveCoverUrl(app.serverConfig.value, track) || ''"
                    alt=""
                  />
                  <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
                </div>
                <strong>{{ track.title }}</strong>
                <span>{{ track.artist }}</span>
              </button>
            </div>
          </article>

          <article v-if="currentArtist" class="detail-panel detail-panel--dark">
            <div class="detail-panel__header">
              <h3>Explora {{ currentArtist.name }}</h3>
            </div>
            <div class="explore-rail">
              <button
                class="explore-card"
                type="button"
                @click="app.openArtistView(currentArtist.id)"
              >
                <div class="explore-card__media">
                  <img
                    v-if="
                      resolveCoverUrl(app.serverConfig.value, currentArtist)
                    "
                    :src="
                      resolveCoverUrl(app.serverConfig.value, currentArtist) ||
                      ''
                    "
                    alt=""
                  />
                  <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
                </div>
                <span>Canciones de {{ currentArtist.name }}</span>
              </button>
              <button
                v-for="album in currentArtistAlbums.slice(0, 2)"
                :key="album.id"
                class="explore-card"
                type="button"
                @click="app.openAlbumView(album.id)"
              >
                <div class="explore-card__media">
                  <img
                    v-if="resolveCoverUrl(app.serverConfig.value, album)"
                    :src="resolveCoverUrl(app.serverConfig.value, album) || ''"
                    alt=""
                  />
                  <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
                </div>
                <span>{{ album.name }}</span>
              </button>
            </div>
          </article>

          <article
            v-if="currentCredits.length"
            class="detail-panel detail-panel--dark"
          >
            <div class="detail-panel__header">
              <h3>Creditos</h3>
            </div>
            <div class="credits-list">
              <div
                v-for="credit in currentCredits"
                :key="`${credit.subtitle}-${credit.title}`"
                class="credits-row credits-row--spaced"
              >
                <div>
                  <strong>{{ credit.title }}</strong>
                  <span>{{ credit.subtitle }}</span>
                </div>
              </div>
            </div>
          </article>

          <article class="detail-panel detail-panel--dark">
            <div class="detail-panel__header">
              <h3>Acerca del artista</h3>
            </div>
            <div class="artist-about">
              <div class="artist-about__media">
                <img
                  v-if="
                    currentArtist &&
                    resolveCoverUrl(app.serverConfig.value, currentArtist)
                  "
                  :src="
                    resolveCoverUrl(app.serverConfig.value, currentArtist) || ''
                  "
                  alt=""
                />
                <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
              </div>
              <div class="artist-about__content">
                <p class="artist-about__rank">Artista destacado</p>
                <strong>{{
                  currentArtist?.name ?? app.currentTrack.value.artist
                }}</strong>
                <span
                  >{{ currentArtist?.track_count ?? 0 }} canciones en tu
                  biblioteca</span
                >
                <p class="artist-about__bio">
                  {{ app.currentTrack.value.artist }} aparece como parte del
                  contexto de reproduccion actual. Desde aqui puedes abrir su
                  vista, sus albumes y el resto de su catalogo.
                </p>
                <button
                  v-if="currentArtist"
                  class="follow-chip"
                  type="button"
                  @click="app.openArtistView(currentArtist.id)"
                >
                  Explorar artista
                </button>
              </div>
            </div>
          </article>

          <article class="detail-panel">
            <div class="detail-panel__header"><h3>Datos de la cancion</h3></div>
            <div class="fact-list">
              <span
                v-for="fact in currentFacts"
                :key="fact"
                class="fact-pill"
                >{{ fact }}</span
              >
            </div>
          </article>

          <article class="detail-panel">
            <div class="detail-panel__header"><h3>Agregar a playlist</h3></div>
            <div class="chip-list">
              <button
                v-for="playlist in app.playlists.value"
                :key="playlist.id"
                class="library-chip"
                type="button"
                @click="app.addCurrentTrackToPlaylist(playlist.id)"
              >
                + {{ playlist.name }}
              </button>
            </div>
          </article>

          <article v-if="app.isQueueOpen.value" class="detail-panel">
            <div class="detail-panel__header">
              <h3>Fila de reproduccion</h3>
              <button
                class="inline-link"
                type="button"
                @click="app.clearUpcomingQueue()"
              >
                Limpiar
              </button>
            </div>
            <div class="media-list">
              <button
                v-for="(entry, index) in app.queue.value"
                :key="`${entry.track.id}-${index}`"
                class="media-row queue-row"
                :class="{ 'is-current': index === app.currentQueueIndex.value }"
                type="button"
                @click="app.playQueueEntry(index)"
              >
                <div class="media-row__cover">
                  <img
                    v-if="resolveCoverUrl(app.serverConfig.value, entry.track)"
                    :src="
                      resolveCoverUrl(app.serverConfig.value, entry.track) || ''
                    "
                    alt=""
                  />
                  <div v-else class="media-fallback"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" width="100%" height="100%"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>
                </div>
                <div class="media-row__copy">
                  <strong>{{ entry.track.title }}</strong
                  ><span>{{ entry.sourceTargetLabel }}</span>
                </div>
                <div class="media-row__meta media-row__meta--actions">
                  <span>{{ entry.track.duration_formatted }}</span>
                  <div class="queue-actions">
                    <button
                      class="queue-action"
                      type="button"
                      aria-label="Mover arriba"
                      :disabled="index === 0"
                      @click.stop="app.moveQueueItem(index, -1)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 6l-5 6h10z" fill="currentColor" />
                      </svg></button
                    ><button
                      class="queue-action"
                      type="button"
                      aria-label="Mover abajo"
                      :disabled="index === app.queue.value.length - 1"
                      @click.stop="app.moveQueueItem(index, 1)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 18l5-6H7z" fill="currentColor" />
                      </svg></button
                    ><button
                      class="queue-action queue-action--danger"
                      type="button"
                      aria-label="Eliminar de la cola"
                      @click.stop="app.removeQueueItem(index)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M8 8l8 8M16 8l-8 8"
                          fill="none"
                          stroke="currentColor"
                          stroke-linecap="round"
                          stroke-width="2.2"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </button>
            </div>
          </article>
        </section>
      </div>
    </transition>

    <transition name="sheet-fade">
      <div
        v-if="isLyricsExpanded && hasLyrics"
        class="modal-backdrop lyrics-modal"
        @click.self="isLyricsExpanded = false"
      >
        <section class="modal-card modal-card--lyrics" :style="lyricsModalStyle">
          <div
            class="lyrics-modal__body"
            :class="{ 'is-ready': isLyricsExpandedReady }"
          >
          <div class="lyrics-modal__topbar">
            <button
              class="round-icon round-icon--plain lyrics-modal__collapse"
              type="button"
              aria-label="Cerrar letra"
              @click="isLyricsExpanded = false"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M5 8.5 12 15.5 19 8.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="2.2"
                />
              </svg>
            </button>
            <div class="lyrics-modal__track-meta">
              <strong>{{
                app.currentTrack.value?.title ?? "Sin reproducción"
              }}</strong>
              <span>{{
                app.currentTrack.value?.artist ?? "App Desk Música"
              }}</span>
            </div>
            <div class="lyrics-modal__topbar-spacer" />
          </div>
          <div ref="lyricsExpandedRef" class="lyrics-expanded">
            <p
              v-for="(line, index) in expandedLyricsState.lines"
              :key="`${line.time}-${line.text}-${index}`"
              :ref="(element) => setExpandedLyricLineRef(element, index)"
              class="lyrics-expanded__line"
              :class="{
                'is-active': index === expandedLyricsState.activeIndex,
              }"
            >
              {{ line.text }}
            </p>
          </div>
          <div class="lyrics-modal__footer">
            <div class="lyrics-modal__actions">
              <button
                class="utility-button lyrics-modal__action"
                type="button"
                aria-label="Traducir letra"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M5 7h10M10 4v3M8 7c0 3.3 2.4 6.4 5.8 8.1M7 16h8M15 11l4-7M16.6 8h4.8M18.9 4l2.5 7"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                </svg>
              </button>
              <button
                class="utility-button lyrics-modal__action"
                type="button"
                aria-label="Compartir"
                @click="shareCurrentTrack()"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="18" cy="5" r="2" fill="currentColor" />
                  <circle cx="6" cy="12" r="2" fill="currentColor" />
                  <circle cx="18" cy="19" r="2" fill="currentColor" />
                  <path
                    d="M7.8 11.1l8-4.2M7.8 12.9l8 4.2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                  />
                </svg>
              </button>
              <button
                class="utility-button lyrics-modal__action"
                type="button"
                aria-label="Mas opciones"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.8" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                  <circle cx="12" cy="19" r="1.8" fill="currentColor" />
                </svg>
              </button>
            </div>
            <div
              class="lyrics-modal__progress"
              @click="app.seekTo($event.clientX, $event.currentTarget as HTMLElement)"
            >
              <span
                class="lyrics-modal__progress-fill"
                :style="{ width: `${app.progressPercentage.value}%` }"
              />
            </div>
            <div class="lyrics-modal__times">
              <span>{{ app.formatDuration(app.currentTime.value) }}</span>
              <span>{{ app.formatDuration(app.duration.value) }}</span>
            </div>
            <div class="lyrics-modal__controls">
              <button
                class="lyrics-control"
                type="button"
                aria-label="Anterior"
                @click="app.playPrevious()"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M7 6v12"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="2.4"
                  />
                  <path d="M18 6l-7 6 7 6z" fill="currentColor" />
                </svg>
              </button>
              <button
                class="lyrics-control lyrics-control--primary"
                type="button"
                aria-label="Reproducir o pausar"
                @click="app.togglePlayback()"
              >
                <svg
                  v-if="app.isPlaying.value"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <rect
                    x="7"
                    y="6"
                    width="3.5"
                    height="12"
                    rx="1"
                    fill="currentColor"
                  />
                  <rect
                    x="13.5"
                    y="6"
                    width="3.5"
                    height="12"
                    rx="1"
                    fill="currentColor"
                  />
                </svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 6.5l10 5.5-10 5.5z" fill="currentColor" />
                </svg>
              </button>
              <button
                class="lyrics-control"
                type="button"
                aria-label="Siguiente"
                @click="app.playNext()"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M17 6v12"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="2.4"
                  />
                  <path d="M6 6l7 6-7 6z" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>
          </div>
        </section>
      </div>
    </transition>

    <transition name="sheet-fade">
      <div
        v-if="app.isSettingsOpen.value"
        class="modal-backdrop"
        @click.self="app.closeSettingsPanel()"
      >
        <section class="modal-card">
          <div class="block-header">
            <div>
              <p class="ui-kicker">Conexion</p>
              <h2>music-server</h2>
            </div>
          </div>
          <label class="search-block"
            ><span>URL base</span
            ><input
              v-model="app.draftServerConfig.value.baseUrl"
              type="text"
              placeholder="http://192.168.1.10:4850"
          /></label>
          <label class="search-block"
            ><span>Token bearer</span
            ><input
              v-model="app.draftServerConfig.value.token"
              type="password"
              placeholder="Opcional"
          /></label>
          <div class="modal-actions">
            <button
              class="toolbar-chip"
              type="button"
              @click="app.closeSettingsPanel()"
            >
              Cancelar</button
            ><button
              class="play-pill"
              type="button"
              @click="app.saveSettings()"
            >
              Guardar
            </button>
          </div>
        </section>
      </div>
    </transition>

    <transition name="sheet-fade">
      <div
        v-if="app.isCreatePlaylistOpen.value"
        class="modal-backdrop modal-backdrop--create"
        @click="app.closeCreatePlaylistSheet()"
        :style="app.createSheetIsDragging.value && Math.abs(app.createSheetDragOffset.value) > 0 ? { opacity: Math.max(0, 1 - Math.abs(app.createSheetDragOffset.value) / 300) } : {}"
        @touchmove.prevent
      >
        <section 
          class="create-sheet" 
          :style="{
            transform: 'translateY(' + app.createSheetDragOffset.value + 'px)',
            transition: app.createSheetIsDragging.value ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
          }"
          @touchstart="handleCreateSheetTouchStart"
          @touchmove="handleCreateSheetTouchMove"
          @touchend="handleCreateSheetTouchEnd"
          @click.stop
        >
          <template v-if="createSheetMode === 'menu'">
            <div class="create-sheet__list">
              <button
                class="create-option"
                type="button"
                @click="createSheetMode = 'playlist'"
              >
                <div class="create-option__icon"><svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" style="transform: scale(0.9);"><path d="M15 4v12.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V8h6V4h-8z"/></svg></div>
                <div class="create-option__copy">
                  <strong>Playlist</strong>
                  <span>Crea una playlist con canciones o episodios</span>
                </div>
              </button>
              <button
                class="create-option"
                type="button"
                @click="createSheetMode = 'playlist'"
              >
                <div class="create-option__icon"><svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div>
                <div class="create-option__copy">
                  <strong>Playlist colaborativa</strong>
                  <span>Crea una playlist con tus personas favoritas</span>
                </div>
              </button>
              <button
                class="create-option"
                type="button"
                @click="createSheetMode = 'playlist'"
              >
                <div class="create-option__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><line x1="4" y1="20" x2="20" y2="20"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="4" x2="20" y2="4"></line><circle cx="8" cy="4" r="2" fill="currentColor"></circle><circle cx="16" cy="12" r="2" fill="currentColor"></circle><circle cx="10" cy="20" r="2" fill="currentColor"></circle></svg></div>
                <div class="create-option__copy">
                  <strong>Playlist mixeada</strong>
                  <span>Mezcla canciones con transiciones fluidas</span>
                </div>
              </button>
              <button
                class="create-option"
                type="button"
                @click="createSheetMode = 'playlist'"
              >
                <div class="create-option__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6" stroke-dasharray="2 2"/></svg></div>
                <div class="create-option__copy">
                  <strong>Fusion</strong>
                  <span
                    >Combina los gustos de tus personas favoritas en una
                    playlist</span
                  >
                </div>
              </button>
              <button class="create-option" type="button">
                <div class="create-option__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="24" height="24"><circle cx="12" cy="12" r="9"></circle><path d="M12 12V4"></path><path d="M12 12l5.5 5.5"></path></svg></div>
                <div class="create-option__copy">
                  <strong>Jam</strong>
                  <span>Escuchen en conjunto, esten donde esten</span>
                </div>
              </button>
            </div>
          </template>

          <template v-else>
            <div class="block-header">
              <div>
                <p class="ui-kicker">Nueva playlist</p>
                <h2>Crear coleccion</h2>
              </div>
            </div>
            <label class="search-block"
              ><span>Nombre</span
              ><input
                v-model="app.newPlaylistName.value"
                type="text"
                placeholder="Mi playlist movil"
            /></label>
            <div class="modal-actions">
              <button
                class="toolbar-chip"
                type="button"
                @click="createSheetMode = 'menu'"
              >
                Atras</button
              ><button
                class="play-pill"
                type="button"
                @click="app.submitNewPlaylist()"
              >
                Crear
              </button>
            </div>
          </template>
        </section>
      </div>
    </transition>
  </div>
</template>
<style scoped>
.mobile-refresh {
  --border: rgba(255, 255, 255, 0.08);
  --text: #f7f7f7;
  --text-muted: rgba(255, 255, 255, 0.68);
  --accent: #1ed760;
  position: relative;
  min-height: 100dvh;
  overflow-x: hidden;
  padding: calc(env(safe-area-inset-top) + 16px) 16px
    calc(env(safe-area-inset-bottom) + 154px);
  color: var(--text);
  background:
    radial-gradient(
      circle at top left,
      rgba(30, 215, 96, 0.18),
      transparent 28%
    ),
    linear-gradient(180deg, #191414 0%, #121212 22%, #121212 100%);
}
.mobile-refresh__bg {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(
      circle at 20% 10%,
      rgba(30, 215, 96, 0.08),
      transparent 24%
    ),
    radial-gradient(
      circle at 80% 16%,
      rgba(255, 255, 255, 0.06),
      transparent 18%
    );
  pointer-events: none;
}
.mobile-topbar,
.mobile-screen,
.mini-player,
.player-overlay,
.modal-backdrop {
  position: relative;
  z-index: 1;
}
.mobile-topbar {
  display: grid;
  gap: 14px;
}
.home-actions {
  display: flex;
  gap: 10px;
}
.home-action {
  flex: 1;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 999px;
  font: inherit;
}
.home-action svg {
  width: 18px;
  height: 18px;
}
.home-action--ghost {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}
.home-action--accent {
  background: var(--accent);
  color: #08130b;
  font-weight: 800;
}
.status-pill--compact {
  width: 100%;
  justify-content: center;
  padding: 10px 14px;
  font-size: 0.84rem;
}
.mobile-topbar__row {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  gap: 12px;
  align-items: center;
}
.mobile-avatar,
.round-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border);
  color: var(--text);
}
.mobile-avatar {
  font-weight: 800;
}
.round-icon {
  cursor: pointer;
}
.round-icon--ghost {
  background: rgba(255, 255, 255, 0.08);
}
.mobile-topbar__copy h1,
.screen-card h2,
.block-header h3,
.detail-header h2,
.player-screen__track h2,
.modal-card h2 {
  margin: 0;
  font-size: clamp(1.5rem, 5vw, 2.2rem);
  line-height: 1.04;
}
.ui-kicker {
  margin: 0 0 6px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.toolbar-chips,
.filter-row,
.chip-list,
.modal-actions,
.queue-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.toolbar-chip,
.filter-pill,
.library-chip,
.control-chip,
.play-pill,
.follow-chip {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
}
.toolbar-chip,
.filter-pill,
.library-chip,
.control-chip {
  padding: 0.78rem 1rem;
  background: #2a2a2a;
  color: var(--text);
}
.toolbar-chip:disabled {
  opacity: 0.4;
  cursor: default;
}
.toolbar-chip--accent,
.filter-pill.is-active,
.play-pill,
.mini-player__play {
  background: var(--accent);
  color: #08130b;
  font-weight: 800;
}
.status-pill {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  color: #101010;
  font-size: 0.92rem;
  font-weight: 700;
}
.mobile-screen {
  margin-top: 18px;
}
.mobile-screen--flush {
  margin-top: 0;
}
.home-shell {
  display: grid;
  gap: 22px;
}
.home-filter-row {
  gap: 12px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 2px;
}
.quick-grid--home {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.home-section {
  display: grid;
  gap: 14px;
}
.home-section__title {
  font-size: clamp(1.35rem, 6vw, 2.1rem);
  font-weight: 800;
  line-height: 1.02;
}
.home-feature-card {
  width: 100%;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 14px;
  align-items: center;
  padding: 16px;
  border: 0;
  border-radius: 24px;
  background: rgba(28, 28, 28, 0.96);
  color: inherit;
  text-align: left;
}
.home-feature-card__copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.home-feature-card__copy strong {
  font-size: clamp(1.4rem, 6vw, 2rem);
  line-height: 1;
}
.home-feature-card__copy span,
.home-feature-card__copy small {
  color: var(--text-muted);
}
.home-feature-card__media {
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.08);
}
.home-feature-card__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.home-rail,
.home-artist-rail {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 42vw;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.home-media-card,
.home-artist-card,
.home-playlist-card {
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}
.home-media-card {
  display: grid;
  gap: 8px;
}
.home-media-card__cover {
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
}
.home-media-card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.home-media-card strong {
  font-size: 1.02rem;
  line-height: 1.15;
}
.home-media-card span {
  color: var(--text-muted);
  font-size: 0.84rem;
  line-height: 1.35;
}
.home-artist-card {
  display: grid;
  gap: 12px;
  align-items: center;
}
.home-artist-card__avatar {
  width: 64px;
  height: 64px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}
.home-artist-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.home-artist-card__copy {
  display: grid;
  gap: 4px;
}
.home-artist-card__copy span {
  color: var(--text-muted);
}
.home-artist-card__copy strong {
  font-size: clamp(1.1rem, 5vw, 1.8rem);
  line-height: 1;
}
.home-playlist-stack {
  display: grid;
  gap: 12px;
}
.home-playlist-card {
  width: 100%;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 16px;
  border-radius: 22px;
  background: rgba(28, 28, 28, 0.96);
}
.home-playlist-card__art {
  width: 58px;
  height: 58px;
}
.home-playlist-card__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.home-playlist-card__copy span,
.home-playlist-card__meta {
  color: var(--text-muted);
}
.screen-card,
.hero-panel,
.mini-panel,
.mini-player,
.modal-card,
.info-card,
.detail-panel,
.media-row,
.quick-grid__item {
  background: rgba(27, 27, 27, 0.94);
  border: 1px solid var(--border);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.24);
}
.screen-card {
  display: grid;
  gap: 18px;
  padding: 16px;
  border-radius: 28px;
}
.hero-panel {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 124px;
  gap: 14px;
  padding: 16px;
  border-radius: 28px;
  color: inherit;
  text-align: left;
}
.hero-panel__copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.hero-panel__copy p,
.detail-header p,
.media-row__copy span,
.media-row__meta,
.mini-panel__row small,
.player-screen__track p,
.info-card p,
.detail-placeholder,
.credits-row span {
  margin: 0;
  color: var(--text-muted);
}
.hero-panel__copy h2 {
  margin: 0;
  font-size: clamp(1.7rem, 5vw, 2.4rem);
  line-height: 1.02;
}
.hero-panel__stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.82);
}
.hero-panel__art,
.quick-grid__cover,
.media-row__cover,
.mini-player__cover,
.player-screen__art,
.player-screen__canvas {
  overflow: hidden;
  border-radius: 18px;
  background: linear-gradient(
    135deg,
    rgba(30, 215, 96, 0.2),
    rgba(255, 255, 255, 0.08)
  );
}
.hero-panel__art {
  width: 124px;
  height: 124px;
}
.hero-panel__art img,
.quick-grid__cover img,
.media-row__cover img,
.mini-player__cover img,
.player-screen__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.search-block {
  display: grid;
  gap: 8px;
}
.search-block span {
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.92rem;
  font-weight: 700;
}
.search-block input {
  width: 100%;
  padding: 1rem;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}
.content-block {
  display: grid;
  gap: 12px;
}
.block-header,
.detail-panel__header,
.player-screen__topbar,
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.quick-grid__item {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 18px;
  color: inherit;
  text-align: left;
}
.quick-grid__cover {
  width: 56px;
  height: 56px;
}
.quick-grid__item span,
.mini-panel__row span,
.media-row__copy strong,
.info-card strong,
.credits-row strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-list {
  display: grid;
  gap: 10px;
}
.media-row {
  width: 100%;
  display: grid;
  grid-template-columns: 56px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border-radius: 18px;
  color: inherit;
  text-align: left;
}
.media-row--compact {
  grid-template-columns: 1fr auto;
}
.media-row__cover,
.mini-player__cover {
  width: 56px;
  height: 56px;
}
.media-row__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.media-row__meta {
  display: grid;
  justify-items: end;
  gap: 6px;
  font-size: 0.84rem;
}
.media-row__meta--actions {
  min-width: 92px;
}
.dual-columns {
  display: grid;
  gap: 12px;
}
.mini-panel {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 22px;
}
.mini-panel__header {
  font-size: 1rem;
  font-weight: 800;
}
.mini-panel__row {
  display: grid;
  gap: 4px;
  padding: 10px 0;
  background: transparent;
  color: inherit;
  text-align: left;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.detail-header {
  align-items: center;
}
.play-pill {
  padding: 0.9rem 1.2rem;
}
.library-chip--muted,
.inline-link--danger,
.queue-action--danger {
  color: #ffb4b4;
}
.inline-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}
.toast-error {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(env(safe-area-inset-bottom) + 120px);
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 74, 74, 0.18);
  border: 1px solid rgba(255, 74, 74, 0.24);
  z-index: 3;
}
.mini-player {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(env(safe-area-inset-bottom) + 74px);
  display: grid;
  grid-template-columns: 56px 1fr auto;
  grid-template-areas:
    "cover copy actions"
    "progress progress progress";
  gap: 8px 12px;
  align-items: center;
  padding: 10px 12px 8px;
  border-radius: 20px;
  z-index: 4;
  border: 1px solid rgba(255, 255, 255, 0.04);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.34);
}
.mini-player__cover {
  grid-area: cover;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border-radius: 12px;
}
.mini-player__copy {
  grid-area: copy;
  display: grid;
  gap: 4px;
  min-width: 0;
}
.mini-player__title-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.mini-player__copy strong,
.mini-player__artist-inline {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-player__copy strong {
  font-size: 0.92rem;
  font-weight: 800;
}
.mini-player__artist-inline {
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.86rem;
  flex: 1 1 auto;
}
.mini-player__device {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  color: #1ed760;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mini-player__actions {
  grid-area: actions;
  display: flex;
  align-items: center;
  gap: 8px;
}
.mini-icon-button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: white;
}
.mini-icon-button svg {
  width: 21px;
  height: 21px;
}
.mini-icon-button--accent {
  background: #1ed760;
  color: #08350f;
}
.mini-icon-button--play svg {
  width: 24px;
  height: 24px;
}
.mini-player__progress {
  grid-area: progress;
  height: 4px;
  margin-top: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  overflow: hidden;
}
.mini-player__progress span,
.player-screen__progress-fill {
  display: block;
  height: 100%;
  background: rgba(255, 255, 255, 0.95);
  border-radius: inherit;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  padding: calc(env(safe-area-inset-top) + 14px) 14px
    calc(env(safe-area-inset-bottom) + 14px);
  background: rgba(4, 4, 4, 0.62);
  backdrop-filter: blur(14px);
  z-index: 105;
  overflow: auto;
}
.player-overlay {
  position: fixed;
  inset: 0;
  padding: 0;
  margin: 0;
  z-index: 105;
  overflow: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  touch-action: pan-y;
  backdrop-filter: none;
  -webkit-overflow-scrolling: touch;
}
.player-screen,
.modal-card {
  border-radius: 28px;
  padding: 16px;
}
.player-screen {
  display: grid;
  gap: 18px;
  padding: 0;
  width: 100%;
  max-width: 100%;
  min-height: 100dvh;
  background: #121212;
  overflow-x: hidden;
}
.player-screen__hero {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  border-radius: 0;
  background: #121212;
}
.player-screen__visual {
  position: absolute;
  inset: 0;
  background: #121212;
}
.player-screen__canvas-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.06), transparent 36%),
    #121212;
}
.player-screen__canvas,
.player-screen__art {
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
  border-radius: 0;
}
.player-screen__canvas {
  display: block;
  object-fit: cover !important;
  background: #0c0c0c;
  opacity: 0;
  transition: opacity 180ms ease;
}
.player-screen__canvas.is-ready {
  opacity: 1;
}
.player-screen__art--cover {
  display: grid;
  place-items: center;
  padding: calc(env(safe-area-inset-top) + 110px) 28px 330px;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.06), transparent 36%),
    linear-gradient(180deg, rgba(18, 18, 18, 0.48), rgba(18, 18, 18, 0.78));
}
.player-screen__art-bg {
  position: absolute;
  inset: -8%;
  width: 116%;
  height: 116%;
  object-fit: cover;
  filter: blur(28px) saturate(1.08);
  transform: scale(1.08);
  opacity: 0.44;
}
.player-screen__art-card {
  position: relative;
  width: min(calc(100vw - 56px), 620px);
  max-width: 100%;
  max-height: min(48dvh, 470px);
  aspect-ratio: 1 / 1;
  border-radius: 22px;
  overflow: hidden;
  box-shadow: 0 20px 56px rgba(0, 0, 0, 0.3);
}
.player-screen__art-card--placeholder {
  width: min(42vw, 180px);
  max-height: none;
  max-width: calc(100vw - 56px);
  aspect-ratio: 1 / 1;
}
.player-screen__art-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.player-screen__visual-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      180deg,
      rgba(0, 0, 0, 0.28),
      rgba(0, 0, 0, 0.08) 18%,
      rgba(0, 0, 0, 0.12) 42%,
      rgba(18, 18, 18, 0.72) 68%,
      rgba(18, 18, 18, 0.96) 82%,
      #121212 100%
    ),
    radial-gradient(
      circle at center top,
      rgba(255, 255, 255, 0.08),
      transparent 36%
    );
}
.player-screen__topbar,
.player-screen__hero-bottom,
.player-screen__lyric-overlay {
  position: relative;
  z-index: 1;
}
.player-screen__topbar {
  position: absolute;
  inset: calc(env(safe-area-inset-top) + 14px) 16px auto;
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  gap: 12px;
  align-items: start;
}
.player-screen__title {
  text-align: center;
}
.player-screen__title strong {
  display: block;
  margin-top: 3px;
  font-size: clamp(0.98rem, 4vw, 1.22rem);
  line-height: 1.1;
}
.player-screen__lyric-overlay {
  position: absolute;
  left: 26px;
  right: 26px;
  bottom: 278px;
  display: grid;
  gap: 8px;
  padding-right: 38px;
  text-shadow: 0 10px 24px rgba(0, 0, 0, 0.68);
}
.player-screen__lyric-current,
.player-screen__lyric-next {
  margin: 0;
  color: white;
  font-weight: 800;
  line-height: 1.22;
}
.player-screen__lyric-current {
  font-size: clamp(1rem, 4.8vw, 1.75rem);
}
.player-screen__lyric-next {
  font-size: clamp(0.88rem, 3.6vw, 1.08rem);
  color: rgba(255, 255, 255, 0.78);
}
.player-screen__hero-bottom {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: calc(env(safe-area-inset-bottom) + 14px);
  display: grid;
  gap: 10px;
}
.player-screen__track {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.player-screen__track-main {
  display: grid;
  grid-template-columns: 58px 1fr;
  gap: 12px;
  align-items: center;
  min-width: 0;
  flex: 1 1 auto;
}
.player-screen__track-cover {
  width: 58px;
  height: 58px;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}
.player-screen__track-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.player-screen__track-copy {
  min-width: 0;
}
.player-screen__track h2 {
  margin: 0;
  font-size: clamp(1rem, 4.8vw, 1.55rem);
  line-height: 1;
}
.player-screen__track p {
  margin: 4px 0 0;
  color: rgba(255, 255, 255, 0.82);
  font-size: clamp(0.92rem, 3.9vw, 1.08rem);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.player-screen__confirm {
  width: 52px;
  height: 52px;
  border: 0;
  border-radius: 999px;
  background: #1ed760;
  color: #06270c;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}
.player-screen__confirm svg {
  width: 28px;
  height: 28px;
}
.player-screen__progress {
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.28);
  overflow: hidden;
  cursor: pointer;
}
.player-screen__times {
  display: flex;
  justify-content: space-between;
  color: rgba(255, 255, 255, 0.84);
  font-size: 0.82rem;
}
.player-screen__controls {
  display: grid;
  grid-template-columns: 1fr 1fr 1.65fr 1fr 1fr;
  gap: 6px;
  align-items: center;
  justify-items: center;
}
.player-screen__controls--main {
  grid-template-columns: 1fr 1fr 1.65fr 1fr 1fr;
}
.control-circle {
  width: 50px;
  height: 50px;
  margin: 0 auto;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: white;
}
.control-circle svg {
  width: 26px;
  height: 26px;
}
.control-circle--primary {
  width: 78px;
  height: 78px;
  background: white;
  color: #111;
}
.control-circle--accent-outline {
  background: transparent;
  color: #1ed760;
}
.control-circle--accent-outline svg {
  width: 30px;
  height: 30px;
}
.control-chip,
.follow-chip {
  min-height: 44px;
  font-size: 0.78rem;
}
.follow-chip {
  padding: 0.82rem 1rem;
  background: rgba(255, 255, 255, 0.12);
  color: var(--text);
}
.player-screen__utility-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px 48px;
  gap: 12px;
  align-items: center;
}
.utility-button {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: white;
}
.utility-button svg,
.round-icon svg {
  width: 28px;
  height: 28px;
}
.utility-button--device {
  width: auto;
  height: auto;
  grid-auto-flow: column;
  gap: 10px;
  justify-content: start;
  color: #1ed760;
  font-size: 0.94rem;
  font-weight: 700;
}
.utility-button--device span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.utility-button--small {
  width: 42px;
  height: 42px;
  background: rgba(0, 0, 0, 0.18);
}
.utility-button--small svg {
  width: 22px;
  height: 22px;
}
.player-screen__volume-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 48px;
  gap: 10px;
  align-items: center;
  color: rgba(255, 255, 255, 0.88);
  font-size: 0.82rem;
  font-weight: 700;
}
.player-screen__volume-row svg {
  width: 24px;
  height: 24px;
}
.player-screen__volume-row input {
  width: 100%;
  accent-color: #1ed760;
}
.player-screen__volume-row span {
  text-align: right;
}
.player-screen > .detail-panel {
  margin: 0;
  background: #181818;
  border-color: rgba(255, 255, 255, 0.06);
  max-width: 100%;
  overflow: hidden;
}
.player-screen > .detail-panel:last-child {
  margin-bottom: calc(env(safe-area-inset-bottom) + 16px);
}
.detail-panel--lyrics-shell {
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}
.info-grid {
  display: grid;
  gap: 12px;
}
.info-card,
.detail-panel {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 22px;
}
.info-card h3,
.detail-panel h3 {
  margin: 0;
  font-size: 1.05rem;
}
.lyrics-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0;
  padding: 0;
  border-radius: 28px;
  height: 320px;
  overflow: hidden;
  transition: background 320ms ease;
}
.lyrics-card__header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 18px 14px 18px;
  background: transparent;
}
.lyrics-card__header h3 {
  margin: 0;
  font-size: 1.05rem;
}
.lyrics-card p {
  margin: 0;
  line-height: 1.28;
}
.lyrics-card--preview {
  width: 100%;
  border: 0;
  text-align: left;
  color: #fff;
}
.lyrics-card__viewport {
  height: 100%;
  overflow: hidden;
  padding: 8px 22px 24px;
  -webkit-mask-image: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 1) 6%,
    rgba(0, 0, 0, 1) 76%,
    rgba(0, 0, 0, 0.18) 95%,
    transparent 100%
  );
  mask-image: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 1) 6%,
    rgba(0, 0, 0, 1) 76%,
    rgba(0, 0, 0, 0.18) 95%,
    transparent 100%
  );
}
.lyrics-card__lines {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 14px;
  padding: 0;
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.lyrics-line {
  display: flex;
  align-items: flex-start;
  padding: 0.08em 0 0.14em;
  opacity: 0.62;
  color: rgba(255, 255, 255, 0.68);
  font-size: clamp(1rem, 4.3vw, 1.32rem);
  font-weight: 700;
  line-height: 1.24;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
    transition:
      opacity 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;
}
.lyrics-line.is-active {
  opacity: 1;
  color: #fff;
  font-size: clamp(1.22rem, 5.4vw, 1.78rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
  transform: none;
}
.detail-placeholder {
  padding: 12px 0;
}
.credits-list,
.fact-list {
  display: grid;
  gap: 10px;
}
.credits-row {
  display: grid;
  gap: 4px;
}
.credits-row--spaced {
  grid-template-columns: 1fr auto;
  align-items: center;
}
.fact-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.fact-pill {
  padding: 0.62rem 0.86rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.88);
  font-size: 0.84rem;
}
.detail-panel__actions {
  display: flex;
  gap: 10px;
}
.detail-panel__header--lyrics {
  align-items: center;
  padding: 2px 2px 0;
}
.detail-panel__actions--lyrics {
  padding-right: 2px;
}
.detail-panel__title-block {
  padding-left: 6px;
}
.detail-panel__beta {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 0.16rem 0.42rem;
  border-radius: 8px;
  background: #1ed760;
  color: #07220d;
  font-size: 0.72rem;
  font-weight: 800;
}
.songdna-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.songdna-person {
  display: grid;
  justify-items: center;
  gap: 8px;
  text-align: center;
}
.songdna-person--muted {
  opacity: 0.88;
}
.songdna-person__avatar {
  width: 138px;
  height: 138px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}
.songdna-person__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.songdna-person__avatar--placeholder {
  display: grid;
  place-items: center;
  font-size: 3rem;
}
.songdna-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.songdna-footer p {
  margin: 4px 0 0;
  color: var(--text-muted);
}
.detail-panel--dark {
  background: rgba(35, 35, 35, 0.96);
}
.related-rail,
.explore-rail {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(146px, 72vw);
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
}
.related-card,
.explore-card {
  width: min(72vw, 240px);
  max-width: 100%;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}
.related-card__media,
.explore-card__media {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  border-radius: 18px;
  margin-bottom: 10px;
  background: rgba(255, 255, 255, 0.08);
}
.related-card__media {
  aspect-ratio: 16 / 11;
}
.explore-card__media {
  aspect-ratio: 3 / 4;
}
.related-card__media img,
.explore-card__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.related-card span {
  color: var(--text-muted);
}
.related-card strong,
.related-card span,
.explore-card span {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist-about {
  display: grid;
  gap: 12px;
  max-width: 100%;
  min-width: 0;
}
.artist-about__media {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  border-radius: 20px;
  aspect-ratio: 16 / 10;
  background: rgba(255, 255, 255, 0.08);
}
.artist-about__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.artist-about__content {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.artist-about__content strong {
  font-size: 1.7rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist-about__rank,
.artist-about__bio {
  margin: 0;
  color: var(--text-muted);
  max-width: 100%;
}
.lyrics-modal {
  z-index: 8;
  padding: 0;
  background: #444a5c;
  backdrop-filter: none;
  overflow: hidden;
}
.modal-card--lyrics {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0;
  height: 100dvh;
  border-radius: 0;
  padding: calc(env(safe-area-inset-top) + 6px) 0
    calc(env(safe-area-inset-bottom) + 4px);
  transition: background 320ms ease;
  box-shadow: none;
  border: 0;
}
.lyrics-modal__body {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 100%;
  opacity: 0;
}
.lyrics-modal__body.is-ready {
  opacity: 1;
}
.lyrics-modal__topbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 52px;
  align-items: start;
  gap: 10px;
  padding: 10px 20px 0;
  background: transparent;
}
.lyrics-modal__collapse {
  width: 44px;
  height: 44px;
  color: rgba(255, 255, 255, 0.96);
}
.lyrics-modal__track-meta {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding-top: 4px;
  text-align: center;
}
.lyrics-modal__track-meta strong {
  font-size: 0.9rem;
  font-weight: 800;
  line-height: 1.1;
}
.lyrics-modal__track-meta span {
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.82rem;
}
.lyrics-modal__topbar-spacer {
  width: 44px;
  height: 44px;
}
.lyrics-expanded {
  display: grid;
  align-content: start;
  gap: 20px;
  padding: 30px 30px 36px;
  overflow: auto;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
  scrollbar-width: none;
}
.lyrics-expanded::-webkit-scrollbar {
  display: none;
}
.lyrics-expanded__line {
  margin: 0;
  padding: 0.08em 0 0.14em;
  color: rgba(255, 255, 255, 0.62);
  font-size: clamp(1.1rem, 6.2vw, 2rem);
  font-weight: 700;
  line-height: 1.28;
  letter-spacing: -0.035em;
  overflow-wrap: anywhere;
  word-break: break-word;
  transform: translateY(8px) scale(0.992);
  transform-origin: center left;
  transition:
    color 320ms ease,
    opacity 320ms ease,
    transform 360ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 320ms ease;
  opacity: 0.72;
  filter: blur(0.2px);
  scroll-margin-block: 42vh;
}
.lyrics-expanded__line.is-active {
  color: white;
  font-size: clamp(1.38rem, 7vw, 2.6rem);
  font-weight: 800;
  line-height: 1.22;
  opacity: 1;
  filter: none;
  transform: translateY(0) scale(1);
}
.lyrics-modal__footer {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: grid;
  gap: 10px;
  padding: 4px 26px 0;
  background: transparent;
}
.lyrics-modal__actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  justify-items: center;
}
.lyrics-modal__action {
  width: 52px;
  height: 52px;
  color: rgba(255, 255, 255, 0.98);
}
.lyrics-modal__progress {
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.28);
  overflow: hidden;
  cursor: pointer;
}
.lyrics-modal__progress-fill {
  display: block;
  height: 100%;
  background: rgba(255, 255, 255, 0.96);
  border-radius: inherit;
}
.lyrics-modal__times {
  display: flex;
  justify-content: space-between;
  color: rgba(255, 255, 255, 0.74);
  font-size: 0.82rem;
}
.lyrics-modal__controls {
  display: grid;
  grid-template-columns: 1fr 1.5fr 1fr;
  align-items: center;
  justify-items: center;
  padding-top: 6px;
}
.lyrics-control {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.96);
}
.lyrics-control svg {
  width: 30px;
  height: 30px;
}
.lyrics-control--primary {
  width: 96px;
  height: 96px;
  background: white;
  color: #101010;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.18);
}
.lyrics-control--primary svg {
  width: 40px;
  height: 40px;
}
.queue-row.is-current {
  outline: 1px solid rgba(30, 215, 96, 0.5);
}
.queue-action {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}
.queue-action svg {
  width: 16px;
  height: 16px;
}
.queue-action:disabled {
  opacity: 0.35;
}
.media-fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.5rem;
}
.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
.page-topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}
.page-topbar h1 {
  flex: 1;
  margin: 0;
  font-size: 2.2rem;
  line-height: 1;
}
.page-topbar__avatar {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-weight: 800;
}
.page-topbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.round-icon--plain {
  background: transparent;
  border: 0;
}
.search-view,
.library-view,
.detail-page {
  display: grid;
  gap: 18px;
}
.detail-page--artist,
.detail-page--album,
.detail-page--playlist {
  margin: 0;
  gap: 18px;
  position: relative;
}
.search-hero {
  display: grid;
  grid-template-columns: 28px 1fr;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 16px;
  background: #fff;
  color: #1c1c1c;
}
.search-hero svg {
  width: 28px;
  height: 28px;
}
.search-hero input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 1rem;
  font-weight: 700;
  color: #555;
}
.search-section,
.detail-section {
  display: grid;
  gap: 14px;
}
.section-title {
  margin: 0;
  font-size: 1.9rem;
  line-height: 1.02;
}
.section-subtitle {
  margin: -6px 0 0;
  color: var(--text-muted);
}
.search-top-list,
.ranked-list,
.track-stack,
.track-list-art,
.recommend-list,
.library-list,
.album-list-vertical {
  display: grid;
  gap: 10px;
}
.search-result-row,
.ranked-row,
.track-stack__row,
.track-list-art__row,
.recommend-list__row,
.library-list__row,
.album-list-vertical__row {
  width: 100%;
  min-width: 0;
  display: grid;
  align-items: center;
  color: inherit;
  text-align: left;
  background: transparent;
}
.search-result-row {
  grid-template-columns: 56px 1fr;
  gap: 12px;
}
.search-result-row__cover,
.ranked-row__cover,
.track-list-art__cover,
.recommend-list__cover,
.library-list__cover {
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
}
.search-result-row__cover img,
.ranked-row__cover img,
.track-list-art__cover img,
.recommend-list__cover img,
.library-list__cover img,
.cover-rail__art img,
.circle-rail__image img,
.album-list-vertical__row img,
.artist-highlight__thumb img,
.merch-card img,
.playlist-inline-mosaic__tile img,
.playlist-mosaic__tile img,
.info-card__image,
.artist-hero__image,
.album-hero__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.search-result-row__copy,
.ranked-row__copy,
.track-stack__copy,
.track-list-art__copy,
.recommend-list__copy,
.library-list__copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.search-result-row__copy strong,
.ranked-row__copy strong,
.track-stack__copy strong,
.track-list-art__copy strong,
.recommend-list__copy strong,
.library-list__copy strong,
.album-list-vertical__row strong,
.cover-rail__item strong,
.circle-rail__item strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-result-row__copy span,
.ranked-row__copy span,
.track-stack__copy span,
.track-list-art__copy span,
.recommend-list__copy span,
.library-list__copy span,
.album-list-vertical__row span,
.cover-rail__item span,
.circle-rail__item span {
  color: var(--text-muted);
}
.browse-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.browse-card {
  position: relative;
  min-height: 112px;
  padding: 16px;
  overflow: hidden;
  border-radius: 14px;
  color: #fff;
  text-align: left;
}
.browse-card strong {
  max-width: 58%;
  display: block;
  font-size: 1.05rem;
  line-height: 1.05;
}
.browse-card img {
  position: absolute;
  right: -12px;
  bottom: -10px;
  width: 90px;
  height: 90px;
  border-radius: 10px;
  object-fit: cover;
  transform: rotate(16deg);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.3);
}
.detail-sticky-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3;
  display: grid;
  grid-template-columns: 44px 1fr 64px;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: calc(env(safe-area-inset-top) + 10px) 16px 10px;
  background: transparent;
  transition:
    background 180ms ease,
    box-shadow 180ms ease,
    backdrop-filter 180ms ease;
}
.detail-sticky-bar strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 1.05rem;
  opacity: 0;
  transition: opacity 180ms ease;
}
.detail-sticky-bar.is-compact {
  position: sticky;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.detail-sticky-bar.is-compact strong {
  opacity: 1;
}
.detail-sticky-bar--green {
  background: linear-gradient(180deg, #184739 0%, #14392f 100%);
}
.detail-sticky-bar--album {
  background: linear-gradient(180deg, #5d7387 0%, #435566 100%);
}
.round-play {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #1ed760;
  color: #0c120d;
}
.round-play svg {
  width: 28px;
  height: 28px;
}
.artist-hero,
.album-hero {
  position: relative;
  overflow: hidden;
  margin: 0;
}
.artist-hero {
  min-height: 380px;
}
.artist-hero__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.artist-hero__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.12) 0%,
    rgba(0, 0, 0, 0.72) 100%
  );
}
.artist-hero__content {
  position: relative;
  z-index: 1;
  padding: 228px 16px 24px;
}
.artist-hero__content h2,
.album-hero__copy h2,
.playlist-hero__copy h2 {
  margin: 0;
  font-size: 3rem;
  line-height: 0.95;
}
.album-hero__copy h2,
.playlist-hero__copy h2 {
  font-size: clamp(2.1rem, 7vw, 2.8rem);
}
.artist-hero__content p,
.album-hero__copy p,
.playlist-hero__copy p {
  margin: 8px 0 0;
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.95rem;
}
.artist-actions,
.album-toolbar,
.playlist-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
}
.artist-actions {
  margin-top: -6px;
}
.artist-actions__follow,
.outline-pill {
  padding: 0.8rem 1.3rem;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  background: transparent;
  color: #fff;
  font-weight: 700;
}
.outline-pill--small {
  padding: 0.62rem 1rem;
}
.artist-actions__menu,
.artist-actions__shuffle,
.album-toolbar__icon {
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-size: 1.5rem;
}
.artist-actions__play,
.album-toolbar__play {
  width: 64px;
  height: 64px;
  margin-left: auto;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #1ed760;
  color: #0b120d;
}
.artist-actions__play svg,
.album-toolbar__play svg {
  width: 26px;
  height: 26px;
}
.artist-tabs {
  display: flex;
  gap: 26px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.artist-tabs__item {
  position: relative;
  padding: 0 0 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.05rem;
}
.artist-tabs__item.is-active {
  color: #fff;
  font-weight: 700;
}
.artist-tabs__item.is-active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -11px;
  height: 3px;
  border-radius: 999px;
  background: #1ed760;
}
.artist-highlight {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  align-items: center;
  gap: 12px;
}
.artist-highlight__thumb {
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: 999px;
}
.artist-highlight__copy {
  display: grid;
  gap: 2px;
}
.artist-highlight__copy span,
.artist-highlight__chevron {
  color: var(--text-muted);
}
.ranked-row {
  grid-template-columns: 28px 56px 1fr auto auto;
  gap: 12px;
}
.ranked-row__index,
.row-menu {
  color: rgba(255, 255, 255, 0.72);
}
.row-check {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: transparent;
  color: #1ed760;
  font-weight: 900;
}
.section-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.section-link {
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 700;
}
.album-list-vertical__row {
  grid-template-columns: 92px 1fr;
  gap: 14px;
}
.album-list-vertical__row img {
  width: 92px;
  height: 92px;
  border-radius: 10px;
}
.cover-rail,
.circle-rail {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 160px);
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.cover-rail__item,
.circle-rail__item {
  min-width: 0;
  display: grid;
  gap: 10px;
  color: inherit;
  text-align: left;
  background: transparent;
}
.cover-rail__art {
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
}
.cover-rail__art--square {
  border-radius: 16px;
}
.circle-rail__image {
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}
.info-card {
  overflow: hidden;
  border-radius: 24px;
  background: #282828;
}
.info-card__image {
  width: 100%;
  aspect-ratio: 1.25;
}
.info-card__body {
  display: grid;
  gap: 14px;
  padding: 18px;
}
.info-card__meta,
.album-count {
  margin: 0;
  color: rgba(255, 255, 255, 0.68);
}
.info-card__headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.info-card__headline strong {
  display: block;
  font-size: 2rem;
}
.info-card__headline span,
.info-card__text {
  color: rgba(255, 255, 255, 0.78);
}
.album-hero {
  display: grid;
  justify-items: center;
  gap: 18px;
  padding: 18px 16px 0;
  background: linear-gradient(
    180deg,
    #7996b1 0%,
    #2a3642 70%,
    transparent 100%
  );
}
.album-hero__cover {
  width: min(76vw, 340px);
  aspect-ratio: 1;
  border-radius: 8px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
}
.album-hero__copy {
  width: 100%;
}
.album-hero__artist {
  margin-top: 12px;
  padding: 0;
  background: transparent;
  color: #fff;
  font-weight: 700;
}
.track-stack__row {
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  padding: 4px 0;
}
.merch-card {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 14px;
  align-items: center;
}
.merch-card img {
  width: 110px;
  height: 110px;
  border-radius: 10px;
}
.detail-section--copyright {
  gap: 2px;
}
.detail-section--copyright p {
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
}
.playlist-hero {
  display: grid;
  gap: 18px;
  margin: 0;
  padding: 18px 16px 0;
  background: linear-gradient(
    180deg,
    #62758d 0%,
    #1b232b 58%,
    transparent 100%
  );
}
.playlist-mosaic {
  width: var(--detail-cover-size, min(76vw, 340px));
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  border-radius: 10px;
  transition: width 0.26s ease;
}
.playlist-inline-mosaic {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.08);
}

.playlist-inline-mosaic--library {
  border-radius: 8px;
}

.playlist-inline-mosaic__tile {
  aspect-ratio: 1;
  background: rgba(255, 255, 255, 0.08);
}

.playlist-inline-mosaic__tile--empty {
  grid-column: 1 / -1;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 1.2rem;
  color: rgba(255, 255, 255, 0.74);
}
.playlist-mosaic__tile {
  aspect-ratio: 1;
  background: rgba(255, 255, 255, 0.08);
}
.playlist-mosaic__tile--empty {
  display: grid;
  place-items: center;
  font-size: 2rem;
}
.playlist-owner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.playlist-owner__avatar {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 0.8rem;
  font-weight: 800;
}
.playlist-action-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
}
.track-list-art__row,
.recommend-list__row,
.library-list__row {
  grid-template-columns: 56px 1fr auto;
  gap: 12px;
}
.recommend-list__plus {
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.55rem;
}
.refresh-pill {
  width: fit-content;
  justify-self: center;
  padding: 0.95rem 1.8rem;
  border-radius: 999px;
  background: #fff;
  color: #0c0c0c;
  font-weight: 800;
}
.library-filter-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
}
.library-sort-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.library-sort-row strong {
  font-size: 1.1rem;
}
.sort-grid {
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font-size: 1.3rem;
}
.library-actions {
  display: grid;
  gap: 12px;
  padding-top: 8px;
}
.library-action-row {
  width: 100%;
  padding: 1rem 1.1rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.86);
  text-align: left;
}
.modal-backdrop--create {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  padding: 0 12px calc(82px + env(safe-area-inset-bottom, 0px)) 12px;
  backdrop-filter: none !important;
  background: rgba(0, 0, 0, 0.5);
}
.create-sheet {
  position: relative;
  width: 100%;
  padding: 20px;
  border-radius: 24px;
  background: #282828;
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.6);
}
.create-sheet__list {
  display: grid;
  gap: 18px;
}
.create-option {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 16px;
  align-items: center;
  color: inherit;
  text-align: left;
  background: transparent;
}
.create-option__icon {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 2rem;
}
.create-option__copy {
  display: grid;
  gap: 4px;
}
.create-option__copy span {
  color: var(--text-muted);
}
.create-sheet__close {
  position: absolute;
  right: 18px;
  bottom: -84px;
  width: 68px;
  height: 68px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #fff;
  color: #121212;
  font-size: 2rem;
  font-weight: 700;
}
.player-screen,
.player-screen__hero-bottom,
.player-screen__content,
.player-screen__detail-stack,
.artist-about,
.explore-card,
.related-card {
  max-width: 100%;
  overflow-x: hidden;
}

:global(html),
:global(body) {
  height: 100%;
  overscroll-behavior-y: auto;
  background: #0f1218;
}

.mobile-refresh {
  height: 100dvh;
  min-height: 100dvh;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: auto;
  -webkit-overflow-scrolling: touch;
}

.mobile-screen {
  overflow: visible;
  max-width: 100%;
}

.detail-page {
  --detail-cover-size: min(82vw, 348px, 38dvh);
  display: grid;
  gap: 16px;
  width: 100%;
  max-width: 100%;
  padding: 8px 4px
    calc(env(safe-area-inset-bottom) + 126px);
  overscroll-behavior: auto;
  overflow-x: clip;
}

.detail-page--compact-header {
  --detail-cover-size: min(72vw, 320px, 32dvh);
}

.detail-page--playlist {
  gap: 16px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 92px);
}

.detail-topbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 44px;
}

.playlist-search-shell {
  display: grid;
  grid-template-columns: 24px 1fr;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 100%;
  max-height: 0;
  min-height: 0;
  margin-block: -16px;
  padding: 0 13px;
  border-radius: 12px;
  background: rgba(132, 156, 196, 0.26);
  color: rgba(255, 255, 255, 0.9);
  box-sizing: border-box;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transform: translateY(-8px);
  transition:
    max-height 0.24s ease,
    min-height 0.24s ease,
    margin 0.24s ease,
    opacity 0.18s ease,
    padding 0.24s ease,
    transform 0.24s ease;
}

.detail-page--compact-header .playlist-search-shell {
  max-height: 44px;
  min-height: 44px;
  margin-block: 0;
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.playlist-search-shell svg {
  width: 21px;
  height: 21px;
}

.playlist-search-shell input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #fff;
  font-size: 0.92rem;
  font-weight: 700;
}

.playlist-search-shell input::placeholder {
  color: rgba(255, 255, 255, 0.78);
}

.playlist-hero-card {
  display: grid;
  justify-items: center;
}

.detail-cover-frame {
  width: var(--detail-cover-size);
  aspect-ratio: 1;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 22px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.05));
  box-shadow: 0 22px 48px rgba(0, 0, 0, 0.28);
  transition: width 0.26s ease, border-radius 0.26s ease;
}

.detail-cover-frame--artist {
  border-radius: 999px;
}

.detail-cover-frame__image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.detail-cover-frame__fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 3rem;
  color: rgba(255, 255, 255, 0.72);
}

.detail-copy {
  display: grid;
  gap: 8px;
}

.detail-copy--artist {
  text-align: left;
}

.detail-copy--playlist {
  gap: 10px;
}

.detail-kicker {
  margin: 0;
  color: rgba(255, 255, 255, 0.58);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.detail-copy h2 {
  margin: 0;
  font-size: clamp(1.9rem, 7vw, 3rem);
  line-height: 0.95;
  letter-spacing: -0.04em;
}

.detail-meta {
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 1rem;
}

.detail-meta--playlist {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-meta__icon {
  width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  opacity: 0.85;
}

.detail-link-button {
  width: fit-content;
  padding: 0;
  background: transparent;
  color: #fff;
  font-weight: 700;
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.detail-icon-button {
  min-width: 48px;
  min-height: 48px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.detail-icon-button--label {
  padding: 0 18px;
  font-weight: 700;
}

.detail-play-button {
  margin-left: auto;
  width: 68px;
  height: 68px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #1ed760;
  color: #08120c;
  box-shadow: 0 16px 30px rgba(30, 215, 96, 0.3);
}

.detail-play-button svg {
  width: 28px;
  height: 28px;
}

.detail-section {
  display: grid;
  gap: 12px;
  padding: 4px 1px;
}

.section-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 1.1rem;
}

.ranked-list,
.track-stack,
.track-list-art,
.album-list-vertical {
  display: grid;
  gap: 6px;
}

.ranked-row,
.track-stack__row,
.track-list-art__row,
.album-list-vertical__row {
  width: 100%;
  min-width: 0;
  border-radius: 18px;
  background: transparent;
  color: inherit;
  text-align: left;
}

.ranked-row {
  display: grid;
  grid-template-columns: 24px 52px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 4px;
}

.ranked-row__index,
.track-stack__index,
.ranked-row__duration,
.track-stack__meta,
.track-list-art__meta {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.88rem;
}

.track-stack__row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 6px;
  border-radius: 16px;
}

.track-stack__copy,
.track-list-art__copy,
.ranked-row__copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.track-stack__copy strong,
.track-list-art__copy strong,
.ranked-row__copy strong,
.album-list-vertical__row strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-stack__copy span,
.track-list-art__copy span,
.ranked-row__copy span,
.album-list-vertical__row span {
  color: rgba(255, 255, 255, 0.62);
}

.track-list-art__row {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 6px;
  border-radius: 16px;
}

.track-list-art__cover {
  width: 54px;
  height: 54px;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
}

.track-list-art__cover img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.track-list-art--songs {
  gap: 10px;
}

.track-list-art--songs .track-list-art__row {
  grid-template-columns: 68px minmax(0, 1fr) 24px;
  gap: 11px;
  padding: 0;
  border-radius: 0;
}

.track-list-art--songs .track-list-art__cover {
  width: 68px;
  height: 68px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.06);
}

.track-list-art--songs .track-list-art__copy {
  gap: 6px;
}

.track-list-art--songs .track-list-art__copy strong {
  font-size: 0.96rem;
  line-height: 1.1;
}

.track-list-art--songs .track-list-art__copy span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.74);
  font-size: 0.8rem;
}

.track-list-art--songs .track-list-art__copy span::before {
  content: "↓";
  width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: #1ed760;
  color: #08120c;
  font-size: 0.66rem;
  font-weight: 900;
}

.track-list-art__menu {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  align-self: center;
  background: transparent;
  color: rgba(255, 255, 255, 0.68);
  font-size: 1rem;
  line-height: 1;
  padding: 0;
}

.track-list-art__menu svg,
.playlist-mini-circle svg,
.playlist-icon-action svg,
.detail-meta__icon svg {
  width: 100%;
  height: 100%;
  display: block;
}

.playlist-owner {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.playlist-owner--header {
  gap: 8px;
}

.playlist-owner__avatar {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  font-size: 0.74rem;
  font-weight: 700;
}

.playlist-mini-circle {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  padding: 5px;
}

.playlist-hero-actions {
  display: grid;
  grid-template-columns: 46px 38px 38px 38px 38px 64px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.playlist-square-button,
.playlist-icon-action,
.playlist-play-button {
  border-radius: 999px;
}

.playlist-square-button {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.playlist-square-button__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.playlist-icon-action {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  background: transparent;
  color: rgba(255, 255, 255, 0.86);
  padding: 7px;
}

.playlist-icon-action--accent {
  color: #1ed760;
}

.playlist-play-button {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  margin-left: auto;
  background: #1ed760;
  color: #08120c;
  box-shadow: 0 16px 30px rgba(30, 215, 96, 0.3);
}

.playlist-play-button svg {
  width: 26px;
  height: 26px;
}

.playlist-action-row {
  display: flex;
  gap: 14px;
  flex-wrap: nowrap;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 4px 6px 0;
  margin-top: 2px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  box-sizing: border-box;
}

.playlist-action-row::-webkit-scrollbar {
  display: none;
}

.playlist-action-row .library-chip {
  flex: 0 0 auto;
  min-height: 52px;
  padding: 0 20px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 0.94rem;
  font-weight: 700;
  white-space: nowrap;
  border-radius: 999px;
}

.cover-rail {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 140px;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.cover-rail__item {
  display: grid;
  gap: 10px;
  color: inherit;
  text-align: left;
  background: transparent;
}

.cover-rail__art {
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
}

.cover-rail__art img,
.album-list-vertical__row img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.album-list-vertical__row {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 10px 4px;
  border-radius: 16px;
}

.album-list-vertical__row img {
  width: 68px;
  height: 68px;
  border-radius: 16px;
}

.library-chip--muted {
  background: rgba(255, 255, 255, 0.04);
}
@media (min-width: 540px) {
  .dual-columns,
  .info-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .artist-about {
    grid-template-columns: 1.1fr 1fr;
    align-items: stretch;
  }
}
</style>
