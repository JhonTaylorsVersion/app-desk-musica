<template>
  <template v-if="!isActivePlaylistEmpty">
    <div
      class="library-table-head"
      :class="{
        'album-view-grid': currentViewMode === 'album',
        'playlist-view-grid': currentViewMode === 'playlist',
        'with-compact-album-bar':
          currentViewMode === 'album' && compactAlbumBarVisible,
      }"
    >
      <div class="col-index">#</div>
      <div class="col-title">Título</div>
      <div class="col-album" v-if="currentViewMode !== 'album'">Álbum</div>
      <div class="col-added">
        {{ currentViewMode === "playlist" ? "Fecha en que se agrego" : "Agregado" }}
      </div>
      <div class="col-time">&#9201;</div>
    </div>

    <div
      v-for="(track, index) in displayedTracks"
      :key="
        currentViewMode === 'playlist' ? `${track.path}-${index}` : track.path
      "
      class="track-row spotify-row"
      :class="{
        active: isLibraryTrackActive(track, index),
        selected: isLibraryTrackSelected(track, index),
        hovered: isLibraryTrackHovered(track),
        playing: isLibraryTrackCurrent(track, index) && isPlaying,
        paused: isLibraryTrackCurrent(track, index) && !isPlaying,
        'album-view-grid': currentViewMode === 'album',
        'playlist-view-grid': currentViewMode === 'playlist',
      }"
      :data-track-path="track.path"
      @mouseenter="updateHoveredTrackPath(track.path)"
      @mouseleave="updateHoveredTrackPath(null)"
      @mousedown.left="handleTrackPointerDown($event, track, index)"
      @contextmenu.prevent="openLibraryTrackContextMenu($event, track, index)"
      @dblclick="playTrackFromLibrary(track, index)"
    >
      <div
        class="col-index row-index interactive-index"
        @click.stop="toggleLibraryTrackPlayback(track, index)"
      >
        <span
          v-if="shouldShowLibraryIndexNumber(track, index)"
          class="row-index-number"
        >
          {{
            currentViewMode === "album"
              ? (getLibraryTrackMetadata(track)?.track_number ?? index + 1)
              : index + 1
          }}
        </span>

        <span
          v-else-if="shouldShowLibraryPlayIcon(track, index)"
          class="row-index-icon"
          aria-label="Reproducir"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="7,5 19,12 7,19"></polygon>
          </svg>
        </span>

        <span
          v-else-if="shouldShowLibraryPauseIcon(track, index)"
          class="row-index-icon"
          aria-label="Pausar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14"></rect>
            <rect x="14" y="5" width="4" height="14"></rect>
          </svg>
        </span>

        <span
          v-else-if="shouldShowLibraryEqualizer(track, index)"
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
        @click.stop="toggleLibraryTrackPlayback(track, index)"
      >
        <div class="row-cover" v-if="currentViewMode !== 'album'">
          <img
            v-if="getLibraryTrackCover(track)"
            :src="getLibraryTrackCover(track) || undefined"
            alt="cover"
          />
          <div v-else class="row-cover-placeholder">&#9835;</div>
        </div>

        <div class="row-title-meta">
          <div class="track-row-title-container">
            <div class="track-name spotify-track-name">
              {{ getTrackDisplayTitle(track) }}
            </div>

            <button
              v-if="likedSongsPlaylist"
              class="track-heart-btn"
              :class="{ active: isLiked(track.path) }"
              type="button"
              title="Me gusta"
              @click.stop="toggleTrackLike(track)"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                :fill="isLiked(track.path) ? 'currentColor' : 'none'"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
              </svg>
            </button>
          </div>
          <div class="track-path spotify-track-subtitle">
            <span
              v-for="(artist, i) in splitArtists(getLibraryTrackArtist(track))"
              :key="artist"
            >
              <span class="hoverable-link" @click.stop="goToArtist(artist)">{{ artist }}</span>
              <span
                v-if="i < splitArtists(getLibraryTrackArtist(track)).length - 1"
                >,
              </span>
            </span>
          </div>
        </div>
      </div>

      <div
        class="col-album row-album hoverable-link"
        v-if="currentViewMode !== 'album'"
        @click.stop="goToAlbum(getLibraryTrackAlbum(track), getAlbumArtistForTrack(track))"
      >
        {{ getLibraryTrackAlbum(track) }}
      </div>

      <div class="col-added row-added">Local</div>

      <div class="col-time row-time-actions">
        <span class="row-duration">{{ getLibraryTrackDuration(track) }}</span>
        <button
          class="library-row-menu-btn"
          type="button"
          aria-label="Más opciones"
          @click.stop="openLibraryTrackContextMenu($event, track, index)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.8"></circle>
            <circle cx="12" cy="12" r="1.8"></circle>
            <circle cx="19" cy="12" r="1.8"></circle>
          </svg>
        </button>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
defineProps<{
  compactAlbumBarVisible: boolean;
  currentViewMode: string;
  displayedTracks: any[];
  getAlbumArtistForTrack: (track: any) => string;
  getLibraryTrackArtist: (track: any) => string;
  getLibraryTrackCover: (track: any) => string | null | undefined;
  getLibraryTrackDuration: (track: any) => string;
  getLibraryTrackMetadata: (track: any) => { track_number?: number | null } | null | undefined;
  getLibraryTrackAlbum: (track: any) => string;
  getTrackDisplayTitle: (track: any) => string;
  goToAlbum: (album: string, artist: string) => void;
  goToArtist: (artist: string) => void;
  handleTrackPointerDown: (event: MouseEvent, track: any, index: number) => void;
  hoveredLibraryTrackPath: string | null;
  isActivePlaylistEmpty: boolean;
  isLibraryTrackActive: (track: any, index?: number) => boolean;
  isLibraryTrackCurrent: (track: any, index?: number) => boolean;
  isLibraryTrackHovered: (track: any) => boolean;
  isLibraryTrackSelected: (track: any, index?: number) => boolean;
  isLiked: (path: string) => boolean;
  isPlaying: boolean;
  likedSongsPlaylist: any;
  openLibraryTrackContextMenu: (event: MouseEvent, track: any, index?: number) => void;
  playTrackFromLibrary: (track: any, index?: number) => void;
  shouldShowLibraryEqualizer: (track: any, index?: number) => boolean;
  shouldShowLibraryIndexNumber: (track: any, index?: number) => boolean;
  shouldShowLibraryPauseIcon: (track: any, index?: number) => boolean;
  shouldShowLibraryPlayIcon: (track: any, index?: number) => boolean;
  splitArtists: (artists: string) => string[];
  toggleLibraryTrackPlayback: (track: any, index?: number) => void;
  toggleTrackLike: (track: any) => void;
}>();

const emit = defineEmits<{
  (e: "update:hoveredLibraryTrackPath", value: string | null): void;
}>();

function updateHoveredTrackPath(value: string | null) {
  emit("update:hoveredLibraryTrackPath", value);
}
</script>
