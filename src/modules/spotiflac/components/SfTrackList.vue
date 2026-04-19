<template>
  <div class="sf-tracklist">
    <div class="sf-table-wrap">
      <div class="sf-overflow">
        <table class="sf-table">
          <thead>
            <tr class="sf-thead-row">
              <th v-if="showCheckboxes" class="sf-th sf-th--check">
                <input type="checkbox" :checked="allSelected" @change="$emit('toggleSelectAll', filteredTracks)" />
              </th>
              <th class="sf-th sf-th--num">#</th>
              <th class="sf-th">Title</th>
              <th v-if="!hideAlbumColumn" class="sf-th sf-th--album">Album</th>
              <th class="sf-th sf-th--dur">Duration</th>
              <th class="sf-th sf-th--plays">Plays</th>
              <th class="sf-th sf-th--actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(track, index) in paginatedTracks" :key="index" class="sf-tbody-row">
              <!-- Checkbox -->
              <td v-if="showCheckboxes" class="sf-td">
                <input v-if="track.spotify_id" type="checkbox"
                  :checked="selectedTracks.includes(track.spotify_id)"
                  @change="$emit('toggleTrack', track.spotify_id!)" />
              </td>

              <!-- # -->
              <td class="sf-td sf-td--num">
                <div class="sf-num-cell">
                  <span>{{ startIndex + index + 1 }}</span>
                  <span v-if="track.status === 'UP'" class="sf-status-up">▲</span>
                  <span v-else-if="track.status === 'DOWN'" class="sf-status-down">▼</span>
                  <span v-else-if="track.status === 'NEW'" class="sf-status-new">●</span>
                </div>
              </td>

              <!-- Title -->
              <td class="sf-td">
                <div class="sf-title-cell">
                  <img v-if="track.images" :src="track.images" :alt="track.name" class="sf-thumb" />
                  <div class="sf-title-info">
                    <div class="sf-title-row">
                      <span v-if="onTrackClick" class="sf-clickable-name" @click="$emit('trackClick', track)">{{ track.name }}</span>
                      <span v-else class="sf-name">{{ track.name }}</span>
                      <span v-if="track.is_explicit" class="sf-explicit" title="Explicit">E</span>
                      <component :is="getTrackStatusIcon(track.spotify_id)" />
                    </div>
                    <span class="sf-artist-cell">
                      <template v-for="(artist, i) in getClickableArtists(track)" :key="`${artist.id || artist.name}-${i}`">
                        <span v-if="onArtistClick && artist.external_urls" class="sf-clickable" @click="$emit('artistClick', artist)">{{ artist.name }}</span>
                        <span v-else>{{ artist.name }}</span>
                        <span v-if="i < getClickableArtists(track).length - 1">, </span>
                      </template>
                    </span>
                  </div>
                </div>
              </td>

              <!-- Album -->
              <td v-if="!hideAlbumColumn" class="sf-td sf-td--album">
                <span v-if="onAlbumClick && track.album_id && track.album_url"
                  class="sf-clickable"
                  @click="$emit('albumClick', { id: track.album_id!, name: track.album_name, external_urls: track.album_url! })">
                  {{ track.album_name }}
                </span>
                <span v-else>{{ track.album_name }}</span>
              </td>

              <!-- Duration -->
              <td class="sf-td sf-td--dur">{{ formatDuration(track.duration_ms) }}</td>

              <!-- Plays -->
              <td class="sf-td sf-td--plays">{{ track.plays ? formatPlays(track.plays) : '' }}</td>

              <!-- Actions -->
              <td class="sf-td sf-td--actions">
                <div class="sf-actions">
                  <!-- Download -->
                  <button v-if="track.spotify_id" class="sf-icon-btn" :title="getDownloadTitle(track.spotify_id)"
                    :disabled="isDownloading || downloadingTrack === track.spotify_id"
                    @click="$emit('downloadTrack', track.spotify_id!, track.name, track.artists, track.album_name, track.spotify_id, folderName, track.duration_ms, startIndex + index + 1, track.album_artist, track.release_date, track.images, track.track_number, track.disc_number, track.total_tracks, track.total_discs, track.copyright, track.publisher)">
                    <span v-if="downloadingTrack === track.spotify_id" class="sf-spinner" />
                    <svg v-else-if="skippedTracks.has(track.spotify_id)" class="h-4 w-4 text-yellow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 18 15 15"/><line x1="12" y1="12" x2="12" y2="18"/></svg>
                    <svg v-else-if="downloadedTracks.has(track.spotify_id)" class="h-4 w-4 text-green" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <svg v-else-if="failedTracks.has(track.spotify_id)" class="h-4 w-4 text-red" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    <svg v-else class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>

                  <!-- Preview -->
                  <button v-if="track.spotify_id" class="sf-icon-btn sf-icon-btn--outline" title="Play Preview"
                    :disabled="loadingPreview === track.spotify_id"
                    @click="playPreview(track.spotify_id!, track.name)">
                    <span v-if="loadingPreview === track.spotify_id" class="sf-spinner" />
                    <svg v-else-if="playingTrack === track.spotify_id" class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    <svg v-else class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>

                  <!-- Lyrics -->
                  <button v-if="track.spotify_id" class="sf-icon-btn sf-icon-btn--outline" title="Download Separate Lyric"
                    :disabled="downloadingLyricsTrack === track.spotify_id"
                    @click="$emit('downloadLyrics', track.spotify_id!, track.name, track.artists, track.album_name, folderName, isArtistDiscography, startIndex + index + 1, track.album_artist, track.release_date, track.disc_number)">
                    <span v-if="downloadingLyricsTrack === track.spotify_id" class="sf-spinner" />
                    <svg v-else-if="skippedLyrics?.has(track.spotify_id)" class="h-4 w-4 text-yellow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 18 15 15"/><line x1="12" y1="12" x2="12" y2="18"/></svg>
                    <svg v-else-if="downloadedLyrics?.has(track.spotify_id)" class="h-4 w-4 text-green" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <svg v-else-if="failedLyrics?.has(track.spotify_id)" class="h-4 w-4 text-red" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    <svg v-else class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  </button>

                  <!-- Cover -->
                  <button v-if="track.images" class="sf-icon-btn sf-icon-btn--outline" title="Download Separate Cover"
                    :disabled="downloadingCoverTrack === (track.spotify_id || `${track.name}-${track.artists}`)"
                    @click="$emit('downloadCover', track.images, track.name, track.artists, track.album_name, folderName, isArtistDiscography, startIndex + index + 1, track.spotify_id || `${track.name}-${track.artists}`, track.album_artist, track.release_date, track.disc_number)">
                    <span v-if="downloadingCoverTrack === (track.spotify_id || `${track.name}-${track.artists}`)" class="sf-spinner" />
                    <svg v-else class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </button>

                  <!-- Availability -->
                  <div class="sf-availability-wrap relative group/avail">
                    <button v-if="track.spotify_id" class="sf-icon-btn sf-icon-btn--outline" 
                      :disabled="checkingAvailability && checkingTrackId === track.spotify_id"
                      @click="$emit('checkAvailability', track.spotify_id!)">
                      <span v-if="checkingAvailability && checkingTrackId === track.spotify_id" class="sf-spinner" />
                      <template v-else-if="availabilityMap?.has(track.spotify_id!)">
                        <CheckCircle v-if="hasAvailabilityLinks(availabilityMap.get(track.spotify_id!)!)" class="h-4 w-4 text-green" />
                        <XCircle v-else class="h-4 w-4 text-red" />
                      </template>
                      <Globe v-else class="h-4 w-4" />
                    </button>
                    
                    <!-- Simple Tooltip for Table -->
                    <div v-if="availabilityMap?.has(track.spotify_id!)" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-card border rounded-lg shadow-xl opacity-0 group-hover/avail:opacity-100 pointer-events-none group-hover/avail:pointer-events-auto transition-opacity z-50 min-w-[200px]">
                      <SfAvailabilityLinks :availability="availabilityMap.get(track.spotify_id!)!" />
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="sf-pagination">
      <button class="sf-page-btn" :disabled="currentPage === 1" @click="$emit('pageChange', currentPage - 1)">← Prev</button>
      <template v-for="(page, i) in paginationPages" :key="i">
        <span v-if="page === 'ellipsis'" class="sf-ellipsis">…</span>
        <button v-else class="sf-page-btn" :class="{ 'sf-page-btn--active': currentPage === page }" @click="$emit('pageChange', page as number)">{{ page }}</button>
      </template>
      <button class="sf-page-btn" :disabled="currentPage === totalPages" @click="$emit('pageChange', currentPage + 1)">Next →</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SfAvailabilityLinks from './SfAvailabilityLinks.vue';
import { hasAvailabilityLinks } from '../utils/artist-links';
import { 
  Download, FolderOpen, CheckCircle, XCircle, 
  FileText, FileCheck, Globe, ImageDown, Play, Pause 
} from "lucide-vue-next";
import { usePreview } from '../composables/usePreview';
import { buildClickableArtists, type ClickableArtist } from '../utils/artist-links';
import type { TrackMetadata, TrackAvailability } from '../types/api';

const props = withDefaults(defineProps<{
  tracks: TrackMetadata[];
  searchQuery?: string;
  sortBy?: string;
  selectedTracks?: string[];
  downloadedTracks?: Set<string>;
  failedTracks?: Set<string>;
  skippedTracks?: Set<string>;
  downloadingTrack?: string | null;
  isDownloading?: boolean;
  currentPage?: number;
  itemsPerPage?: number;
  showCheckboxes?: boolean;
  hideAlbumColumn?: boolean;
  folderName?: string;
  isArtistDiscography?: boolean;
  downloadedLyrics?: Set<string>;
  failedLyrics?: Set<string>;
  skippedLyrics?: Set<string>;
  downloadingLyricsTrack?: string | null;
  availabilityMap?: Map<string, TrackAvailability>;
  downloadedCovers?: Set<string>;
  failedCovers?: Set<string>;
  skippedCovers?: Set<string>;
  downloadingCoverTrack?: string | null;
  onDownloadLyrics?: (spotifyId: string, name: string, artists: string, albumName: string, folderName?: string, isArtistDiscography?: boolean, position?: number, albumArtist?: string, releaseDate?: string, discNumber?: number) => void;
  onDownloadCover?: (coverUrl: string, trackName: string, artistName: string, albumName: string, folderName?: string, isArtistDiscography?: boolean, position?: number, trackId?: string, albumArtist?: string, releaseDate?: string, discNumber?: number) => void;
  onArtistClick?: (artist: { id: string; name: string; external_urls: string }) => void;
  onAlbumClick?: (album: { id: string; name: string; external_urls: string }) => void;
  onTrackClick?: (track: TrackMetadata) => void;
  checkingAvailability?: boolean;
  checkingTrackId?: string | null;
}>(), {
  searchQuery: '',
  sortBy: 'title-asc',
  selectedTracks: () => [],
  downloadedTracks: () => new Set(),
  failedTracks: () => new Set(),
  skippedTracks: () => new Set(),
  downloadingTrack: null,
  isDownloading: false,
  currentPage: 1,
  itemsPerPage: 100,
  showCheckboxes: true,
  hideAlbumColumn: false,
  downloadedLyrics: () => new Set(),
  failedLyrics: () => new Set(),
  skippedLyrics: () => new Set(),
  downloadedCovers: () => new Set(),
  failedCovers: () => new Set(),
  skippedCovers: () => new Set(),
});

const emit = defineEmits<{
  toggleTrack: [id: string];
  toggleSelectAll: [tracks: TrackMetadata[]];
  downloadTrack: [id: string, name: string, artists: string, albumName: string, spotifyId?: string, folderName?: string, durationMs?: number, position?: number, albumArtist?: string, releaseDate?: string, coverUrl?: string, trackNum?: number, discNum?: number, totalTracks?: number, totalDiscs?: number, copyright?: string, publisher?: string];
  downloadLyrics: [spotifyId: string, name: string, artists: string, albumName: string, folderName?: string, isArtistDiscography?: boolean, position?: number, albumArtist?: string, releaseDate?: string, discNumber?: number];
  downloadCover: [coverUrl: string, trackName: string, artistName: string, albumName: string, folderName?: string, isArtistDiscography?: boolean, position?: number, trackId?: string, albumArtist?: string, releaseDate?: string, discNumber?: number];
  pageChange: [page: number];
  artistClick: [artist: { id: string; name: string; external_urls: string }];
  albumClick: [album: { id: string; name: string; external_urls: string }];
  trackClick: [track: TrackMetadata];
  checkAvailability: [spotifyId: string];
}>();

const { playPreview, loadingPreview, playingTrack } = usePreview();

function getClickableArtists(track: TrackMetadata): ClickableArtist[] {
  return buildClickableArtists(track.artists, track.artists_data, track.artist_id, track.artist_url);
}

// Filtering & sorting (mirrors original logic exactly)
const filteredTracks = computed(() => {
  let result = props.tracks.filter(t => {
    if (!props.searchQuery) return true;
    const q = props.searchQuery.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.artists.toLowerCase().includes(q) || t.album_name.toLowerCase().includes(q);
  });
  const { sortBy, downloadedTracks, failedTracks } = props;
  if (sortBy === 'title-asc') result = [...result].sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === 'title-desc') result = [...result].sort((a, b) => b.name.localeCompare(a.name));
  else if (sortBy === 'artist-asc') result = [...result].sort((a, b) => a.artists.localeCompare(b.artists));
  else if (sortBy === 'artist-desc') result = [...result].sort((a, b) => b.artists.localeCompare(a.artists));
  else if (sortBy === 'duration-asc') result = [...result].sort((a, b) => a.duration_ms - b.duration_ms);
  else if (sortBy === 'duration-desc') result = [...result].sort((a, b) => b.duration_ms - a.duration_ms);
  else if (sortBy === 'plays-asc') result = [...result].sort((a, b) => (parseInt(a.plays||'0') || 0) - (parseInt(b.plays||'0') || 0));
  else if (sortBy === 'plays-desc') result = [...result].sort((a, b) => (parseInt(b.plays||'0') || 0) - (parseInt(a.plays||'0') || 0));
  else if (sortBy === 'downloaded') result = [...result].sort((a, b) => (downloadedTracks.has(b.spotify_id||'') ? 1 : 0) - (downloadedTracks.has(a.spotify_id||'') ? 1 : 0));
  else if (sortBy === 'not-downloaded') result = [...result].sort((a, b) => (downloadedTracks.has(a.spotify_id||'') ? 1 : 0) - (downloadedTracks.has(b.spotify_id||'') ? 1 : 0));
  else if (sortBy === 'failed') result = [...result].sort((a, b) => (failedTracks.has(b.spotify_id||'') ? 1 : 0) - (failedTracks.has(a.spotify_id||'') ? 1 : 0));
  return result;
});

const totalPages = computed(() => Math.ceil(filteredTracks.value.length / props.itemsPerPage));
const startIndex = computed(() => (props.currentPage - 1) * props.itemsPerPage);
const paginatedTracks = computed(() => filteredTracks.value.slice(startIndex.value, startIndex.value + props.itemsPerPage));

const tracksWithId = computed(() => filteredTracks.value.filter(t => t.spotify_id));
const allSelected = computed(() => tracksWithId.value.length > 0 && tracksWithId.value.every(t => props.selectedTracks.includes(t.spotify_id!)));

const paginationPages = computed((): (number | 'ellipsis')[] => {
  const total = totalPages.value;
  const current = props.currentPage;
  if (total <= 10) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  if (current <= 7) { for (let i = 2; i <= 10; i++) pages.push(i); pages.push('ellipsis'); pages.push(total); }
  else if (current >= total - 7) { pages.push('ellipsis'); for (let i = total - 9; i <= total; i++) pages.push(i); }
  else { pages.push('ellipsis'); pages.push(current - 1); pages.push(current); pages.push(current + 1); pages.push('ellipsis'); pages.push(total); }
  return pages;
});

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatPlays(plays: string | undefined): string {
  if (!plays) return '';
  const num = parseInt(plays, 10);
  return isNaN(num) ? plays : num.toLocaleString();
}

function getDownloadTitle(spotifyId: string): string {
  if (props.downloadingTrack === spotifyId) return 'Downloading...';
  if (props.skippedTracks.has(spotifyId)) return 'Already exists';
  if (props.downloadedTracks.has(spotifyId)) return 'Downloaded';
  if (props.failedTracks.has(spotifyId)) return 'Failed';
  return 'Download Track';
}

function getTrackStatusIcon(spotifyId?: string) { return null; } // inline icons in template
</script>

<style scoped>
.sf-tracklist { display: flex; flex-direction: column; gap: 1rem; }
.sf-table-wrap { border: 1px solid hsl(var(--border)); border-radius: 0.375rem; }
.sf-overflow { overflow-x: auto; }
.sf-table { width: 100%; border-collapse: collapse; }
.sf-thead-row { border-bottom: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 0.5); }
.sf-th { height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; font-size: 0.875rem; color: hsl(var(--muted-foreground)); vertical-align: middle; }
.sf-th--check { width: 3rem; }
.sf-th--num { width: 3rem; }
.sf-th--album { display: none; }
.sf-th--dur,.sf-th--plays { display: none; }
.sf-th--actions { width: 8rem; text-align: center; }
@media (min-width: 768px) { .sf-th--album { display: table-cell; } }
@media (min-width: 1024px) { .sf-th--dur { display: table-cell; } }
@media (min-width: 1280px) { .sf-th--plays { display: table-cell; } }
.sf-tbody-row { border-bottom: 1px solid hsl(var(--border)); transition: background 0.15s; }
.sf-tbody-row:hover { background: hsl(var(--muted) / 0.5); }
.sf-td { padding: 1rem; vertical-align: middle; font-size: 0.875rem; }
.sf-td--num { color: hsl(var(--muted-foreground)); }
.sf-td--album { display: none; color: hsl(var(--muted-foreground)); }
.sf-td--dur,.sf-td--plays { display: none; color: hsl(var(--muted-foreground)); }
.sf-td--actions { text-align: center; }
@media (min-width: 768px) { .sf-td--album { display: table-cell; } }
@media (min-width: 1024px) { .sf-td--dur { display: table-cell; } }
@media (min-width: 1280px) { .sf-td--plays { display: table-cell; } }
.sf-num-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.sf-status-up { font-size: 0.75rem; color: hsl(142 76% 36%); }
.sf-status-down { font-size: 0.75rem; color: hsl(0 72% 51%); }
.sf-status-new { font-size: 0.75rem; color: hsl(220 90% 56%); }
.sf-title-cell { display: flex; align-items: center; gap: 0.75rem; }
.sf-thumb { width: 2.5rem; height: 2.5rem; border-radius: 4px; object-fit: cover; }
.sf-title-info { display: flex; flex-direction: column; }
.sf-title-row { display: flex; align-items: center; gap: 0.5rem; }
.sf-name { font-weight: 500; }
.sf-clickable-name { font-weight: 500; cursor: pointer; }
.sf-clickable-name:hover { text-decoration: underline; }
.sf-clickable { cursor: pointer; }
.sf-clickable:hover { text-decoration: underline; }
.sf-explicit { display: inline-flex; align-items: center; justify-content: center; background: hsl(0 72% 51%); color: white; font-size: 0.625rem; height: 1rem; width: 1rem; border-radius: 2px; flex-shrink: 0; }
.sf-artist-cell { font-size: 0.875rem; color: hsl(var(--muted-foreground)); }
.sf-actions { display: flex; align-items: center; justify-content: center; gap: 0.25rem; }
.sf-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem; border-radius: 6px; border: none;
  background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
  cursor: pointer; transition: opacity 0.15s;
}
.sf-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sf-icon-btn--outline { background: transparent; border: 1px solid hsl(var(--border)); color: hsl(var(--foreground)); }
.sf-icon-btn--outline:hover:not(:disabled) { background: hsl(var(--muted)); }
.sf-spinner { width: 1rem; height: 1rem; border-radius: 9999px; border: 2px solid currentColor; border-top-color: transparent; animation: spin 0.8s linear infinite; }
.text-green { color: hsl(142 76% 36%); }
.text-yellow { color: hsl(48 96% 53%); }
.text-red { color: hsl(0 72% 51%); }
.sf-pagination { display: flex; align-items: center; justify-content: center; gap: 0.25rem; flex-wrap: wrap; }
.sf-page-btn {
  padding: 0.375rem 0.625rem; font-size: 0.875rem; border-radius: 6px;
  border: 1px solid hsl(var(--border)); background: transparent;
  color: hsl(var(--foreground)); cursor: pointer; transition: background 0.15s;
}
.sf-page-btn:hover:not(:disabled) { background: hsl(var(--muted)); }
.sf-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sf-page-btn--active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-color: transparent; }
.sf-ellipsis { padding: 0.375rem 0.25rem; color: hsl(var(--muted-foreground)); }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
