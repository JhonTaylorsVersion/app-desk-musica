<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import {
  SfSearchBar,
  SfAlbumView,
  SfTrackInfo,
  SfPlaylistView,
  SfArtistView,
} from './';
import { useMetadata } from '../composables/useMetadata';
import { useDownload } from '../composables/useDownload';
import { useHistory } from '../composables/useHistory';
import { useLyrics } from '../composables/useLyrics';
import { useCover } from '../composables/useCover';
import { useAvailability } from '../composables/useAvailability';
import { useSettings } from '../composables/useSettings';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ChevronLeft } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const {
  loading,
  metadata,
  handleFetchMetadata,
  resetMetadata,
  showAlbumDialog,
  setShowAlbumDialog,
  selectedAlbum,
  handleConfirmAlbumFetch,
  showVpnAdviceDialog,
  setShowVpnAdviceDialog,
  handleAlbumClick,
  handleArtistClick,
  loadFromCache,
} = useMetadata();

const {
  isDownloading,
  downloadProgress,
  downloadingTrack,
  bulkDownloadType,
  currentDownloadInfo,
  downloadedTracks,
  failedTracks,
  skippedTracks,
  downloadTrack,
  downloadBatch,
  downloadSelected,
  handleStopDownload,
  getFolderNameForMetadata,
} = useDownload();

const { fetchHistory, deleteFetchHistoryItem } = useHistory();

const {
  downloadingLyricsTrack,
  downloadedLyrics,
  failedLyrics,
  skippedLyrics,
  isBulkDownloadingLyrics,
  handleDownloadLyrics: apiDownloadLyrics,
  handleDownloadAllLyrics: apiDownloadAllLyrics,
} = useLyrics();

const {
  downloadingCover,
  downloadingCoverTrack,
  downloadedCovers,
  failedCovers,
  skippedCovers,
  isBulkDownloadingCovers,
  handleDownloadCover: apiDownloadCover,
  handleDownloadAllCovers: apiDownloadAllCovers,
} = useCover();

const {
  checking: checkingAvailability,
  checkingTrackId,
  availabilityMap,
  checkAvailability: apiCheckAvailability,
} = useAvailability();

const { settings } = useSettings();

const handleDownloadLyricsWrapper = (spotifyId: string, name: string, artists: string, albumName?: string, playlistName?: string, isArtistDiscography?: boolean, position?: number, albumArtist?: string, releaseDate?: string, discNumber?: number) => {
  // Map arguments correctly to useLyrics handleDownloadLyrics
  void apiDownloadLyrics(
    spotifyId, name, artists, albumName, 
    playlistName, position, albumArtist, releaseDate, discNumber, isArtistDiscography
  );
};

const handleDownloadCoverWrapper = (coverUrl: string, trackName: string, artistName: string, albumName?: string, playlistName?: string, isArtistDiscography?: boolean, position?: number, trackId?: string, albumArtist?: string, releaseDate?: string, discNumber?: number) => {
  // Map arguments correctly to useCover handleDownloadCover
  void apiDownloadCover(
    coverUrl, trackName, artistName, albumName, 
    playlistName, position, trackId, albumArtist, releaseDate, discNumber, isArtistDiscography
  );
};

const handleOpenFolder = () => {
  if (settings.value?.downloadPath) {
    void invoke('open_folder', { path: settings.value.downloadPath });
  }
};

const url = ref('');
const searchMode = ref(false);
const region = ref('US');
const selectedTracks = ref<string[]>([]);
const searchQuery = ref('');
const sortBy = ref('default');
const currentListPage = ref(1);

const handleFetch = () => {
  void handleFetchMetadata(url.value);
};

const handleFetchUrl = (resultUrl: string) => {
  url.value = resultUrl;
  void handleFetchMetadata(resultUrl);
};

const handleBack = () => {
  resetMetadata();
  url.value = '';
  selectedTracks.value = [];
  searchQuery.value = '';
  sortBy.value = 'default';
  currentListPage.value = 1;
};

const toggleTrack = (id: string) => {
  if (selectedTracks.value.includes(id)) {
    selectedTracks.value = selectedTracks.value.filter((t) => t !== id);
  } else {
    selectedTracks.value.push(id);
  }
};

const toggleSelectAll = (tracks?: any[]) => {
  const targetTracks = Array.isArray(tracks) && tracks.length > 0
    ? tracks
    : metadata.value?.track_list || [];
  const trackIds = targetTracks
    .map((t: any) => t.spotify_id || t.id)
    .filter((id: string | undefined): id is string => Boolean(id));

  if (trackIds.length === 0) return;

  const allSelected = trackIds.every((id: string) => selectedTracks.value.includes(id));
  if (allSelected) {
    selectedTracks.value = selectedTracks.value.filter((id) => !trackIds.includes(id));
  } else {
    selectedTracks.value = Array.from(new Set([...selectedTracks.value, ...trackIds]));
  }
};

const handleDownloadBatch = () => {
  if (!metadata.value) return;
  const isAlbumView = currentView.value === 'album';
  void downloadSelected(
    selectedTracks.value,
    metadata.value.track_list,
    getFolderNameForMetadata(metadata.value),
    isAlbumView,
  );
};

const handleDownloadAll = () => {
  if (!metadata.value) return;
  const isAlbumView = currentView.value === 'album';
  void downloadBatch(metadata.value.track_list, getFolderNameForMetadata(metadata.value), isAlbumView);
};

const handleDownloadSingleTrack = (...args: any[]) => {
  if (args.length > 0) {
    const [
      id,
      name,
      artists,
      albumName,
      spotifyId,
      folderName,
      durationMs,
      position,
      albumArtist,
      releaseDate,
      coverUrl,
      trackNumber,
      discNumber,
      totalTracks,
      totalDiscs,
      copyright,
      publisher,
    ] = args;

    void downloadTrack({
      id,
      name,
      artists,
      album_name: albumName,
      spotify_id: spotifyId || id,
      folder_name: folderName,
      is_album_context: currentView.value === 'album',
      duration_ms: durationMs,
      position,
      album_artist: albumArtist,
      release_date: releaseDate,
      images: coverUrl,
      track_number: trackNumber,
      disc_number: discNumber,
      total_tracks: totalTracks,
      total_discs: totalDiscs,
      copyright,
      publisher,
    });
    return;
  }

  if (!metadata.value || !('track' in metadata.value)) return;
  void downloadTrack(metadata.value.track);
};

const handleHistoryRestore = (event: Event) => {
  const cachedData = (event as CustomEvent<string>).detail;
  if (typeof cachedData === 'string' && cachedData) {
    loadFromCache(cachedData);
  }
};

onMounted(() => {
  window.addEventListener('spotiflac:history-select', handleHistoryRestore);
});

onUnmounted(() => {
  window.removeEventListener('spotiflac:history-select', handleHistoryRestore);
});

watch(metadata, () => {
  selectedTracks.value = [];
  searchQuery.value = '';
  sortBy.value = 'default';
  currentListPage.value = 1;
});

const currentView = computed(() => {
  if (!metadata.value) return 'history';
  if ('track' in metadata.value) return 'track';
  if ('album_info' in metadata.value) return 'album';
  if ('playlist_info' in metadata.value) return 'playlist';
  if ('artist_info' in metadata.value) return 'artist';
  return 'history';
});

const hasMetadataResult = computed(() => currentView.value !== 'history');
</script>

<template>
  <div class="space-y-6">
    <div class="flex gap-4 items-center">
      <Button
        v-if="!searchMode && currentView !== 'history'"
        variant="ghost"
        size="icon"
        class="h-10 w-10 shrink-0"
        @click="handleBack"
      >
        <ChevronLeft class="h-6 w-6" />
      </Button>

      <SfSearchBar
        v-model:url="url"
        v-model:search-mode="searchMode"
        v-model:region="region"
        :loading="loading"
        :history="fetchHistory"
        :has-result="hasMetadataResult"
        @fetch="handleFetch"
        @fetch-url="handleFetchUrl"
        @history-select="item => handleFetchUrl(item.url)"
        @history-remove="id => deleteFetchHistoryItem(id)"
      />
    </div>

    <div v-if="!searchMode">
      <div v-if="loading && !metadata" class="flex items-center justify-center py-8">
        <Spinner />
        <span class="ml-2 text-muted-foreground">Fetching...</span>
      </div>

      <template v-else>
        <SfTrackInfo
          v-if="currentView === 'track'"
          :track="metadata.track"
          :is-downloading="isDownloading"
          :downloading-track="downloadingTrack"
          :is-downloaded="downloadedTracks.has(metadata.track.spotify_id)"
          :is-failed="failedTracks.has(metadata.track.spotify_id)"
          :is-skipped="skippedTracks.has(metadata.track.spotify_id)"
          
          :downloading-lyrics-track="downloadingLyricsTrack"
          :downloaded-lyrics="downloadedLyrics.has(metadata.track.spotify_id)"
          :failed-lyrics="failedLyrics.has(metadata.track.spotify_id)"
          :skipped-lyrics="skippedLyrics.has(metadata.track.spotify_id)"
          
          :checking-availability="checkingAvailability"
          :checking-track-id="checkingTrackId"
          :availability="availabilityMap.get(metadata.track.spotify_id)"
          
          :downloading-cover="downloadingCover"
          :downloaded-cover="downloadedCovers.has(metadata.track.spotify_id)"
          :failed-cover="failedCovers.has(metadata.track.spotify_id)"
          :skipped-cover="skippedCovers?.has(metadata.track.spotify_id)"
          
          @download="handleDownloadSingleTrack"
          @download-lyrics="handleDownloadLyricsWrapper"
          @check-availability="apiCheckAvailability"
          @download-cover="handleDownloadCoverWrapper"
          @open-folder="handleOpenFolder"
          @album-click="handleAlbumClick"
          @artist-click="artist => void handleArtistClick(artist)"
          @back="handleBack"
        />

        <SfAlbumView
          v-else-if="currentView === 'album'"
          :album-info="metadata.album_info"
          :track-list="metadata.track_list"
          :show-back="true"
          :is-downloading="isDownloading"
          :download-progress="downloadProgress"
          :downloading-track="downloadingTrack"
          :bulk-download-type="bulkDownloadType"
          :current-download-info="currentDownloadInfo"
          :search-query="searchQuery"
          :sort-by="sortBy"
          :current-page="currentListPage"
          :selected-tracks="selectedTracks"
          :downloaded-tracks="downloadedTracks"
          
          :downloaded-lyrics="downloadedLyrics"
          :failed-lyrics="failedLyrics"
          :skipped-lyrics="skippedLyrics"
          :downloading-lyrics-track="downloadingLyricsTrack"
          :is-bulk-downloading-lyrics="isBulkDownloadingLyrics"
          
          :downloaded-covers="downloadedCovers"
          :failed-covers="failedCovers"
          :skipped-covers="skippedCovers"
          :downloading-cover-track="downloadingCoverTrack"
          :is-bulk-downloading-covers="isBulkDownloadingCovers"
          
          :availability-map="availabilityMap"
          :checking-availability="checkingAvailability"
          :checking-track-id="checkingTrackId"
          
          @download-all="handleDownloadAll"
          @download-selected="handleDownloadBatch"
          @stop-download="handleStopDownload"
          @download-track="handleDownloadSingleTrack"
          @download-all-lyrics="() => apiDownloadAllLyrics(metadata.track_list, metadata.album_info.name, false, true)"
          @download-all-covers="() => apiDownloadAllCovers(metadata.track_list, metadata.album_info.name, true)"
          @download-lyrics="handleDownloadLyricsWrapper"
          @download-cover="handleDownloadCoverWrapper"
          @check-availability="apiCheckAvailability"
          @open-folder="handleOpenFolder"
          
          @toggle-track="toggleTrack"
          @toggle-select-all="toggleSelectAll"
          @search-change="searchQuery = $event"
          @sort-change="sortBy = $event"
          @page-change="currentListPage = $event"
          @artist-click="(artist: { id: string; name: string; external_urls: string }) => void handleArtistClick(artist)"
          @track-click="(track: { external_urls?: string }) => track.external_urls && handleFetchUrl(track.external_urls)"
          @back="handleBack"
        />

        <SfPlaylistView
          v-else-if="currentView === 'playlist'"
          :playlist-info="metadata.playlist_info"
          :track-list="metadata.track_list"
          :is-downloading="isDownloading"
          :download-progress="downloadProgress"
          :downloading-track="downloadingTrack"
          :bulk-download-type="bulkDownloadType"
          :current-download-info="currentDownloadInfo"
          :search-query="searchQuery"
          :sort-by="sortBy"
          :current-page="currentListPage"
          :downloaded-tracks="downloadedTracks"
          :selected-tracks="selectedTracks"
          
          :downloaded-lyrics="downloadedLyrics"
          :failed-lyrics="failedLyrics"
          :skipped-lyrics="skippedLyrics"
          :downloading-lyrics-track="downloadingLyricsTrack"
          :is-bulk-downloading-lyrics="isBulkDownloadingLyrics"
          
          :downloaded-covers="downloadedCovers"
          :failed-covers="failedCovers"
          :skipped-covers="skippedCovers"
          :downloading-cover-track="downloadingCoverTrack"
          :is-bulk-downloading-covers="isBulkDownloadingCovers"
          
          :availability-map="availabilityMap"
          :checking-availability="checkingAvailability"
          :checking-track-id="checkingTrackId"
          
          @download-all="handleDownloadAll"
          @download-selected="handleDownloadBatch"
          @stop-download="handleStopDownload"
          @download-all-lyrics="() => apiDownloadAllLyrics(metadata.track_list, metadata.playlist_info.name, false, false)"
          @download-all-covers="() => apiDownloadAllCovers(metadata.track_list, metadata.playlist_info.name, false)"
          @download-track="handleDownloadSingleTrack"
          @download-lyrics="handleDownloadLyricsWrapper"
          @download-cover="handleDownloadCoverWrapper"
          @check-availability="apiCheckAvailability"
          @open-folder="handleOpenFolder"
          
          @toggle-track="toggleTrack"
          @toggle-select-all="toggleSelectAll"
          @search-change="searchQuery = $event"
          @sort-change="sortBy = $event"
          @page-change="currentListPage = $event"
          @artist-click="(artist: { id: string; name: string; external_urls: string }) => void handleArtistClick(artist)"
          @track-click="(track: { external_urls?: string }) => track.external_urls && handleFetchUrl(track.external_urls)"
        />

        <SfArtistView
          v-else-if="currentView === 'artist'"
          :artist-info="metadata.artist_info"
          :album-list="metadata.album_list"
          :track-list="metadata.track_list"
          :is-downloading="isDownloading"
          :download-progress="downloadProgress"
          :bulk-download-type="bulkDownloadType"
          :current-download-info="currentDownloadInfo"
          :search-query="searchQuery"
          :sort-by="sortBy"
          :current-page="currentListPage"
          :selected-tracks="selectedTracks"
          :downloaded-tracks="downloadedTracks"
          :failed-tracks="failedTracks"
          :skipped-tracks="skippedTracks"
          :downloading-track="downloadingTrack"
          
          :downloaded-lyrics="downloadedLyrics"
          :failed-lyrics="failedLyrics"
          :skipped-lyrics="skippedLyrics"
          :downloading-lyrics-track="downloadingLyricsTrack"
          :is-bulk-downloading-lyrics="isBulkDownloadingLyrics"
          
          :downloaded-covers="downloadedCovers"
          :failed-covers="failedCovers"
          :skipped-covers="skippedCovers"
          :downloading-cover-track="downloadingCoverTrack"
          :is-bulk-downloading-covers="isBulkDownloadingCovers"
          
          :availability-map="availabilityMap"
          :checking-availability="checkingAvailability"
          :checking-track-id="checkingTrackId"
          
          @download-all="handleDownloadAll"
          @download-selected="handleDownloadBatch"
          @stop-download="handleStopDownload"
          @download-all-lyrics="() => apiDownloadAllLyrics(metadata.track_list, metadata.artist_info.name, true, false)"
          @download-all-covers="() => apiDownloadAllCovers(metadata.track_list, metadata.artist_info.name, false)"
          @download-track="handleDownloadSingleTrack"
          @download-lyrics="handleDownloadLyricsWrapper"
          @download-cover="handleDownloadCoverWrapper"
          @check-availability="apiCheckAvailability"
          @open-folder="handleOpenFolder"
          
          @toggle-track="toggleTrack"
          @toggle-select-all="toggleSelectAll"
          @search-change="searchQuery = $event"
          @sort-change="sortBy = $event"
          @page-change="currentListPage = $event"
          @album-click="handleAlbumClick"
          @artist-click="(artist: { id: string; name: string; external_urls: string }) => void handleArtistClick(artist)"
          @track-click="(track: { external_urls?: string }) => track.external_urls && handleFetchUrl(track.external_urls)"
          @back="handleBack"
        />
      </template>
    </div>

    <Dialog :open="showAlbumDialog" @update:open="setShowAlbumDialog">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Fetch Album</DialogTitle>
          <DialogDescription>
            Do you want to fetch metadata for this album?
          </DialogDescription>
        </DialogHeader>
        <div v-if="selectedAlbum" class="py-2">
          <p class="font-medium bg-muted/50 rounded-md px-3 py-2">{{ selectedAlbum.name }}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="setShowAlbumDialog(false)">
            Cancel
          </Button>
          <Button @click="() => void handleConfirmAlbumFetch()">
            Fetch Album
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="showVpnAdviceDialog" @update:open="setShowVpnAdviceDialog">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Fetch Failed</DialogTitle>
          <DialogDescription class="space-y-3">
            <span class="block">
              Metadata fetch failed. Try using a high-quality VPN such as
              Surfshark, ExpressVPN, Proton VPN, or a similar service.
            </span>
            <span class="block">
              Choose a location that is not blocked by Spotify or the related
              service, such as the USA, UK, Germany, Netherlands, or Singapore.
            </span>
            <span class="block">
              If you are already using a VPN, try switching to another server
              and fetch again.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button @click="setShowVpnAdviceDialog(false)">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
