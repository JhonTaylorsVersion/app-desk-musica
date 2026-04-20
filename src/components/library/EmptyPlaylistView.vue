<template>
  <div
    v-if="currentViewMode === 'playlist' && activePlaylist && isActivePlaylistEmpty"
    class="empty-playlist-shell"
  >
    <div class="empty-playlist-toolbar">
      <div class="empty-playlist-toolbar-left">
        <button
          class="sah-icon-btn"
          type="button"
          title="Agregar canciones a la playlist"
          @click="openEmptyPlaylistDiscovery"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="4" y1="6" x2="14" y2="6"></line>
            <line x1="4" y1="12" x2="14" y2="12"></line>
            <line x1="4" y1="18" x2="14" y2="18"></line>
            <path d="M18 8v8"></path>
            <path d="M14 12h8"></path>
          </svg>
        </button>
        <button
          class="sah-icon-btn"
          type="button"
          title="Mas opciones"
          @click="openPlaylistContextMenuFromButton($event, activePlaylist.id)"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="5" cy="12" r="1"></circle>
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="19" cy="12" r="1"></circle>
          </svg>
        </button>
      </div>
      <div class="empty-playlist-toolbar-right">
        <span>Lista</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
      </div>
    </div>

    <div class="empty-playlist-divider"></div>

    <div
      v-if="isEmptyPlaylistDiscoveryVisible"
      class="empty-playlist-discovery"
    >
      <div class="empty-playlist-discovery-head">
        <h2>Encontremos contenido para tu playlist</h2>
        <div class="empty-playlist-header-actions">
          <button
            class="small-action-btn subtle refresh-suggestions-btn"
            type="button"
            @click="refreshPlaylistRecommendations"
            title="Obtener nuevas sugerencias"
          >
            Actualizar
          </button>
          <button
            class="empty-playlist-close-btn"
            type="button"
            @click="closeEmptyPlaylistDiscovery"
            aria-label="Cerrar sugerencias"
          >
            &times;
          </button>
        </div>
      </div>

      <div class="search-input-wrapper empty-playlist-search">
        <input
          :ref="emptyPlaylistSearchInputRef"
          :value="emptyPlaylistSearch"
          type="text"
          class="search-input empty-playlist-search-input"
          placeholder="Busca canciones o artistas para añadir"
          @input="updateEmptyPlaylistSearch"
        />

        <button
          v-if="emptyPlaylistSearch"
          class="search-clear-btn"
          type="button"
          @click="clearEmptyPlaylistSearch"
        >
          &times;
        </button>
      </div>

      <div
        v-if="emptyPlaylistSearchResults.length > 0"
        class="empty-playlist-results"
      >
        <div
          v-for="track in emptyPlaylistSearchResults"
          :key="`empty-playlist-suggestion-${track.path}`"
          class="empty-playlist-result-row"
        >
          <div class="empty-playlist-result-main">
            <div class="empty-playlist-result-cover">
              <img
                v-if="getLibraryTrackCover(track)"
                :src="getLibraryTrackCover(track) || undefined"
                alt=""
              />
              <div
                v-else
                class="empty-playlist-result-cover placeholder"
              >
                &#9835;
              </div>
            </div>

            <div class="empty-playlist-result-copy">
              <div class="empty-playlist-result-title">
                {{ getTrackDisplayTitle(track) }}
              </div>
              <div class="empty-playlist-result-subtitle">
                {{ getLibraryTrackArtist(track) }}
              </div>
            </div>
          </div>

          <div class="empty-playlist-result-album">
            {{ getLibraryTrackAlbum(track) }}
          </div>

          <button
            class="empty-playlist-add-btn"
            type="button"
            @click="addTrackToActivePlaylist(track)"
          >
            Agregar
          </button>
        </div>
      </div>

      <div v-else class="empty-playlist-no-results">
        {{
          playlist.length === 0
            ? "Tu biblioteca está vacía. Agrega carpetas de música para poder llenar esta playlist."
            : "No encontré resultados con esa búsqueda."
        }}
      </div>
    </div>

    <div v-else class="empty-playlist-discovery-collapsed">
      <button
        class="small-action-btn subtle"
        type="button"
        @click="openEmptyPlaylistDiscovery"
      >
        Buscar contenido para esta playlist
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  activePlaylist: any;
  addTrackToActivePlaylist: (track: any) => void;
  closeEmptyPlaylistDiscovery: () => void;
  currentViewMode: string;
  emptyPlaylistSearch: string;
  emptyPlaylistSearchInputRef: any;
  emptyPlaylistSearchResults: any[];
  getLibraryTrackAlbum: (track: any) => string;
  getLibraryTrackArtist: (track: any) => string;
  getLibraryTrackCover: (track: any) => string | null | undefined;
  getTrackDisplayTitle: (track: any) => string;
  isActivePlaylistEmpty: boolean;
  isEmptyPlaylistDiscoveryVisible: boolean;
  openEmptyPlaylistDiscovery: () => void;
  openPlaylistContextMenuFromButton: (event: MouseEvent, playlistId: number) => void;
  playlist: any[];
  refreshPlaylistRecommendations: () => void;
}>();

const emit = defineEmits<{
  (e: "update:emptyPlaylistSearch", value: string): void;
}>();

function updateEmptyPlaylistSearch(event: Event) {
  emit("update:emptyPlaylistSearch", (event.target as HTMLInputElement).value);
}

function clearEmptyPlaylistSearch() {
  emit("update:emptyPlaylistSearch", "");
}
</script>
