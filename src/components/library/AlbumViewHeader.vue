<template>
  <template v-if="currentViewMode === 'album'">
    <div :ref="albumHeroRef" class="spotify-album-hero">
      <div class="sah-content">
        <img
          v-if="activeAlbumCover"
          :src="activeAlbumCover"
          class="sah-cover glass-shadow"
          alt="Album Cover"
        />
        <div v-else class="sah-cover-placeholder glass-shadow">&#9835;</div>

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
            <span v-for="(artist, i) in splitArtists(activeAlbumArtist || '')" :key="artist">
              <span class="sah-artist hoverable-link" @click="goToArtist(artist)">{{ artist }}</span>
              <span v-if="i < splitArtists(activeAlbumArtist || '').length - 1">, </span>
            </span>

            <span class="sah-bullet">&bull;</span>
            <span>{{ activeAlbumYear }}</span>
            <span class="sah-bullet">&bull;</span>
            <span>{{ activeAlbumTracks.length }} canciones, <span class="sah-duration">{{ activeAlbumDurationFormatted }}</span></span>
          </div>
        </div>
      </div>
    </div>

    <div class="spotify-album-actions">
      <button class="sah-play-btn glass-shadow" @click="playAlbum">
        <svg v-if="isActiveAlbumPlaying" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
        <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </button>
      <button class="sah-icon-btn">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
      </button>
      <button class="sah-icon-btn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="19" cy="12" r="1"></circle>
          <circle cx="5" cy="12" r="1"></circle>
        </svg>
      </button>
    </div>

    <div class="search-row album-search-row">
      <div class="search-input-wrapper">
        <input
          :ref="librarySearchInputRef"
          :value="librarySearch"
          type="text"
          class="search-input"
          :placeholder="librarySearchPlaceholder"
          @input="updateLibrarySearch"
        />

        <button
          v-if="librarySearch"
          class="search-clear-btn"
          @click="clearLibrarySearch"
          type="button"
        >
          &times;
        </button>
      </div>
    </div>

    <div
      class="album-compact-sticky-bar"
      :class="{ visible: compactAlbumBarVisible }"
      :style="compactAlbumBarStyle"
    >
      <button class="album-compact-play-btn" @click="playAlbum">
        <svg v-if="isActiveAlbumPlaying" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </button>

      <div class="album-compact-meta">
        <div class="album-compact-title">{{ activeAlbumView }}</div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
defineProps<{
  activeAlbumArtist: string | null;
  activeAlbumCover: string | null;
  activeAlbumDurationFormatted: string;
  activeAlbumTracks: any[];
  activeAlbumView: string | null;
  activeAlbumYear: string | number | null;
  albumHeroRef: any;
  compactAlbumBarStyle: Record<string, string>;
  compactAlbumBarVisible: boolean;
  currentViewMode: string;
  goToArtist: (artist: string) => void;
  isActiveAlbumPlaying: boolean;
  librarySearch: string;
  librarySearchInputRef: any;
  librarySearchPlaceholder: string;
  playAlbum: () => void;
  splitArtists: (artists: string) => string[];
}>();

const emit = defineEmits<{
  (e: "update:librarySearch", value: string): void;
}>();

function updateLibrarySearch(event: Event) {
  emit("update:librarySearch", (event.target as HTMLInputElement).value);
}

function clearLibrarySearch() {
  emit("update:librarySearch", "");
}
</script>
