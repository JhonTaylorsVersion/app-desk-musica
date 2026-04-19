import { onUnmounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { logger } from "../utils/logger";
import { toastWithSound as toast } from "../utils/toast-with-sound";
import { useHistory } from "./useHistory";

export type SpotifyMetadataResponse = any;

export function useMetadata() {
  const { addFetchHistoryItem } = useHistory();
  const loading = ref(false);
  const metadata = ref<SpotifyMetadataResponse | null>(null);
  const showVpnAdviceDialog = ref(false);
  const fetchFailureReason = ref("");
  const showAlbumDialog = ref(false);
  const selectedAlbum = ref<{
    id: string;
    name: string;
    external_urls: string;
  } | null>(null);
  const pendingArtistName = ref<string | null>(null);
  const loadingToastId = ref<string | number | null>(null);
  const fetchedCount = ref(0);
  const currentName = ref("");
  let unlistenMetadataStream: null | (() => void) = null;

  const dismissLoadingToast = () => {
    if (loadingToastId.value != null) {
      toast.dismiss(loadingToastId.value);
      loadingToastId.value = null;
    }
  };

  const updateLoadingToast = (message: string, description?: string) => {
    const text = message.toLowerCase();

    if (loadingToastId.value == null) {
      loadingToastId.value = toast.silentInfo(text, {
        duration: Infinity,
        description,
      });
      return;
    }

    toast.silentInfo(text, {
      id: loadingToastId.value,
      duration: Infinity,
      description,
    });
  };

  // Listen for metadata stream events from Rust
  void listen("metadata-stream", (event: any) => {
    const data = event.payload;
    if (!data) return;

    if (Array.isArray(data)) {
      fetchedCount.value += data.length;

      if (currentName.value) {
        updateLoadingToast(
          `fetching tracks for ${currentName.value.toLowerCase()}...`,
          `${fetchedCount.value.toLocaleString()} tracks fetched`,
        );
      }

      if (metadata.value && "track_list" in metadata.value) {
        metadata.value.track_list = [...metadata.value.track_list, ...data];
      }
    } else {
      const name =
        data.artist_info?.name ||
        data.album_info?.name ||
        data.playlist_info?.name ||
        data.playlist_info?.owner?.name ||
        "";

      if (name) {
        currentName.value = name;
        updateLoadingToast(
          `fetching tracks for ${name.toLowerCase()}...`,
          `${fetchedCount.value.toLocaleString()} tracks fetched`,
        );
      }

      metadata.value = data;
    }
  }).then((unlisten) => {
    unlistenMetadataStream = unlisten;
  });

  onUnmounted(() => {
    dismissLoadingToast();
    if (unlistenMetadataStream) {
      unlistenMetadataStream();
      unlistenMetadataStream = null;
    }
  });

  const getUrlType = (url: string): string => {
    if (url.includes("/track/")) return "track";
    if (url.includes("/album/")) return "album";
    if (url.includes("/playlist/")) return "playlist";
    if (url.includes("/artist/")) return "artist";
    return "unknown";
  };

  const fetchMetadata = async (url: string) => {
    logger.info(`fetching metadata... ${url}`);
    if (!url.trim()) {
      toast.error("Please enter a Spotify URL");
      return;
    }

    let urlToFetch = url.trim();
    const urlType = getUrlType(urlToFetch);

    if (urlType === "artist" && !urlToFetch.includes("/discography")) {
      urlToFetch = urlToFetch.replace(/\/$/, "") + "/discography/all";
    }

    loading.value = true;
    metadata.value = null;
    showVpnAdviceDialog.value = false;
    fetchFailureReason.value = "";
    fetchedCount.value = 0;
    currentName.value = "";
    updateLoadingToast(
      "fetching metadata...",
      "please wait while we retrieve the information",
    );

    try {
      // First call initiates the fetch.
      // Small objects return immediately, large ones (artist/playlist) stream via events.
      const data = await invoke<SpotifyMetadataResponse>(
        "get_spotify_metadata",
        {
          url: urlToFetch,
        },
      );

      if (data) {
        metadata.value = data;
        dismissLoadingToast();
        toast.success("Metadata fetched successfully");

        // Add to history in Rust
        const historyItem = {
          id: crypto.randomUUID(),
          url: urlToFetch,
          type: urlType,
          item_type: urlType,
          name:
            data.track?.name ||
            data.album_info?.name ||
            data.playlist_info?.name ||
            data.artist_info?.name ||
            "Unknown",
          info:
            data.track?.artists ||
            (data.playlist_info
              ? `${data.playlist_info?.tracks?.total || data.track_list?.length || 0} tracks`
              : data.artist_info
                ? `${data.artist_info?.total_albums || data.album_list?.length || 0} albums`
                : `${data.track_list?.length || 0} tracks`),
          image:
            data.track?.images ||
            data.album_info?.images ||
            data.playlist_info?.cover ||
            data.artist_info?.images ||
            "",
          data: JSON.stringify(data),
          timestamp: Math.floor(Date.now() / 1000),
        };

        await invoke("add_fetch_history", {
          historyItem,
        });
        addFetchHistoryItem(historyItem);
      }
    } catch (err: any) {
      console.error("Fetch failed:", err);
      fetchFailureReason.value = err.toString();
      dismissLoadingToast();
      toast.error(err.toString());
      showVpnAdviceDialog.value = true;
    } finally {
      dismissLoadingToast();
      loading.value = false;
    }
  };

  const loadFromCache = (cachedData: string) => {
    try {
      const data = JSON.parse(cachedData);
      metadata.value = data;
      toast.success("Loaded from cache");
    } catch (err) {
      console.error("Failed to load from cache:", err);
      toast.error("Failed to load from cache");
    }
  };

  const handleAlbumClick = (album: {
    id: string;
    name: string;
    external_urls: string;
  }) => {
    selectedAlbum.value = album;
    showAlbumDialog.value = true;
  };

  const handleConfirmAlbumFetch = async () => {
    if (!selectedAlbum.value) return;
    const albumUrl = selectedAlbum.value.external_urls;
    showAlbumDialog.value = false;
    await fetchMetadata(albumUrl);
    selectedAlbum.value = null;
    return albumUrl;
  };

  const handleArtistClick = async (artist: {
    id: string;
    name: string;
    external_urls: string;
  }) => {
    const resolvedArtistUrl = artist.external_urls?.trim();
    if (!resolvedArtistUrl) {
      toast.error(`Artist not found: ${artist.name}`);
      return "";
    }
    const artistUrl = resolvedArtistUrl.includes("/discography")
      ? resolvedArtistUrl
      : resolvedArtistUrl.replace(/\/$/, "") + "/discography/all";
    pendingArtistName.value = artist.name;
    await fetchMetadata(artistUrl);
    return resolvedArtistUrl;
  };

  return {
    loading,
    metadata,
    showVpnAdviceDialog,
    setShowVpnAdviceDialog: (value: boolean) => {
      showVpnAdviceDialog.value = value;
    },
    fetchFailureReason,
    showAlbumDialog,
    setShowAlbumDialog: (value: boolean) => {
      showAlbumDialog.value = value;
    },
    selectedAlbum,
    pendingArtistName,
    fetchMetadata,
    handleFetchMetadata: fetchMetadata,
    handleAlbumClick,
    handleConfirmAlbumFetch,
    handleArtistClick,
    loadFromCache,
    resetMetadata: () => {
      metadata.value = null;
    },
  };
}
