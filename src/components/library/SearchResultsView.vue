<template>
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

    <div v-if="committedSearchTopResult" class="search-results-main-grid">
      <div class="search-top-result">
        <div class="search-section-title">Resultado principal</div>
        <button
          class="search-top-card glass-panel-inner"
          :class="{
            'search-top-card-artist': committedSearchTopResult.kind === 'artist',
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
            <div v-else class="search-top-card-cover placeholder">&#9835;</div>

            <span
              class="search-top-card-play-overlay"
              @mousedown.stop.prevent
              @click.stop.prevent="committedSearchTopResult.playAction()"
            >
              <svg
                v-if="
                  (committedSearchTopResult.kind === 'song' &&
                    committedSearchTracks[0] &&
                    isSearchTrackPlaying(committedSearchTracks[0])) ||
                  (committedSearchTopResult.kind === 'album' &&
                    isSearchAlbumPlaying(
                      committedSearchTopResult.title,
                      committedSearchAlbums[0]?.artist,
                    )) ||
                  (committedSearchTopResult.kind === 'artist' &&
                    isSearchArtistPlaying(committedSearchTopResult.title))
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
                :src="getLibraryTrackCover(track) || undefined"
                alt=""
                class="search-song-cover"
              />
              <div v-else class="search-song-cover placeholder">&#9835;</div>
              <span
                class="search-card-play-overlay"
                @mousedown.stop.prevent
                @click.stop.prevent="toggleOrPlaySearchTrack(track)"
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
            <div v-else class="search-circle-cover placeholder">&#9835;</div>
            <span
              class="search-card-play-overlay search-card-play-overlay-circle"
              @mousedown.stop.prevent
              @click.stop.prevent="playArtist(artist.name)"
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
            <div v-else class="search-album-cover placeholder">&#9835;</div>
            <span
              class="search-card-play-overlay"
              @mousedown.stop.prevent
              @click.stop.prevent="playAlbumResult(album.name, album.artist)"
            >
              <svg
                v-if="isSearchAlbumPlaying(album.name, album.artist)"
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
          <div class="search-album-subtitle">{{ album.artist }}</div>
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

<script setup lang="ts">
defineProps<{
  committedGlobalSearch: string;
  committedSearchAlbums: any[];
  committedSearchArtists: any[];
  committedSearchTopResult: any;
  committedSearchTracks: any[];
  getLibraryTrackArtist: (track: any) => string;
  getLibraryTrackCover: (track: any) => string | null | undefined;
  getLibraryTrackDuration: (track: any) => string;
  getTrackDisplayTitle: (track: any) => string;
  goToAlbum: (album: string, artist: string) => void;
  goToArtist: (artist: string) => void;
  isSearchAlbumPlaying: (album: string, artist: string | undefined) => boolean;
  isSearchArtistPlaying: (artist: string) => boolean;
  isSearchTrackPlaying: (track: any) => boolean;
  playAlbumResult: (album: string, artist: string) => void;
  playArtist: (artist: string) => void;
  playTrackFromLibrary: (track: any) => void;
  toggleOrPlaySearchTrack: (track: any) => void;
}>();
</script>
