<template>
  <template v-if="currentViewMode === 'playlist' && activePlaylist">
    <div
      class="spotify-album-hero playlist-view-hero"
      @contextmenu="openPlaylistContextMenu($event, activePlaylist.id)"
    >
      <div class="sah-content playlist-sah-content">
        <div
          v-if="activePlaylist.isSystem === 1"
          class="playlist-cover-system liked-songs sah-cover glass-shadow"
        >
          <svg viewBox="0 0 24 24" width="86" height="86" fill="white">
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            />
          </svg>
        </div>

        <div
          v-else-if="activePlaylistCoverTiles.length > 0"
          class="playlist-cover-grid sah-cover playlist-hero-cover-grid glass-shadow"
          :class="`count-${Math.min(activePlaylistCoverTiles.length, 4)}`"
        >
          <div
            v-for="(tile, tileIndex) in activePlaylistCoverTiles"
            :key="`playlist-hero-tile-${tileIndex}`"
            class="playlist-cover-tile"
          >
            <img v-if="tile" :src="tile || undefined" alt="" />
            <div v-else class="playlist-cover-tile-placeholder">&#9835;</div>
          </div>
        </div>
        <div
          v-else
          class="sah-cover-placeholder glass-shadow"
          :class="{ 'empty-playlist-cover': isActivePlaylistEmpty }"
        >
          &#9835;
        </div>

        <div class="sah-info">
          <span class="sah-type">
            {{ isActivePlaylistEmpty ? "Playlist pública" : "Playlist creada" }}
          </span>
          <h1 class="sah-title playlist-view-title">{{ activePlaylist.name }}</h1>

          <div
            v-if="activePlaylist.spotifyUrl"
            class="playlist-sync-manual-controls"
          >
            <button
              class="playlist-sync-force-btn"
              :class="{
                'is-loading': isManualSyncing === activePlaylist.id,
                'is-success': isSyncSuccess === activePlaylist.id,
              }"
              :disabled="isManualSyncing === activePlaylist.id"
              title="Sincronizar ahora con Spotify"
              @click="manualForceSync(activePlaylist.id)"
            >
              <template v-if="isSyncSuccess === activePlaylist.id">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                  <path
                    d="M20 6L9 17L4 12"
                    stroke="#1db954"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </template>
              <template v-else-if="isManualSyncing === activePlaylist.id">
                <div class="spotify-sync-spinner-mini white" style="width: 14px; height: 14px"></div>
              </template>
              <svg v-else viewBox="0 0 496 512" width="16" height="16">
                <path fill="#1ed760" d="M248 8C111.1 8 0 119.1 0 256s111.1 248 248 248 248-111.1 248-248S384.9 8 248 8Z" />
                <path d="M406.6 231.1c-5.2 0-8.4-1.3-12.9-3.9-71.2-42.5-198.5-52.7-280.9-29.7-3.6 1-8.1 2.6-12.9 2.6-13.2 0-23.3-10.3-23.3-23.6 0-13.6 8.4-21.3 17.4-23.9 35.2-10.3 74.6-15.2 117.5-15.2 73 0 149.5 15.2 205.4 47.8 7.8 4.5 12.9 10.7 12.9 22.6 0 13.6-11 23.3-23.3 23.3zm-31 76.2c-5.2 0-8.7-2.3-12.3-4.2-62.5-37-155.7-51.9-238.6-29.4-4.8 1.3-7.4 2.6-11.9 2.6-10.7 0-19.4-8.7-19.4-19.4s5.2-17.8 15.5-20.7c27.8-7.8 56.2-13.6 97.8-13.6 64.9 0 127.6 16.1 177 45.5 8.1 4.8 11.3 11 11.3 19.7-.1 10.8-8.5 19.5-19.4 19.5zm-26.9 65.6c-4.2 0-6.8-1.3-10.7-3.6-62.4-37.6-135-39.2-206.7-24.5-3.9 1-9 2.6-11.9 2.6-9.7 0-15.8-7.7-15.8-15.8 0-10.3 6.1-15.2 13.6-16.8 81.9-18.1 165.6-16.5 237 26.2 6.1 3.9 9.7 7.4 9.7 16.5s-7.1 15.4-15.2 15.4z" />
              </svg>
              <span>
                {{
                  isManualSyncing === activePlaylist.id
                    ? "Sincronizando..."
                    : isSyncSuccess === activePlaylist.id
                      ? "Al día"
                      : "Sincronizar"
                }}
              </span>
            </button>
            <button
              class="playlist-sync-force-btn secondary"
              :class="{ 'is-loading': isSpotifyOrdering === activePlaylist.id }"
              :disabled="isSpotifyOrdering === activePlaylist.id || isManualSyncing === activePlaylist.id"
              title="Ordenar según el orden actual de Spotify"
              @click="orderPlaylistFromSpotify(activePlaylist.id)"
            >
              <template v-if="isSpotifyOrdering === activePlaylist.id">
                <div class="spotify-sync-spinner-mini white" style="width: 14px; height: 14px"></div>
              </template>
              <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path d="M7 7h10M7 12h7M7 17h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
              </svg>
              <span>{{ isSpotifyOrdering === activePlaylist.id ? "Ordenando..." : "Ordenar" }}</span>
            </button>
            <button
              v-if="isSyncSuccess === activePlaylist.id && isManualSyncing !== activePlaylist.id"
              class="spotify-sync-deep-scan-link"
              type="button"
              @click="manualForceSync(activePlaylist.id, true, true)"
            >
              (Ver todas)
            </button>

            <template v-if="activePlaylistSync">
              <button
                v-if="activePlaylistSync.newTracks.length > 0"
                class="playlist-sync-status-badge nuevas"
                @click="dismissSessionNuevas(activePlaylist.id)"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                Ver {{ activePlaylistSync.newTracks.length }} nuevas
              </button>

              <button
                v-if="activePlaylistSync.removedTracks.length > 0"
                class="playlist-sync-status-badge eliminadas"
                @click="dismissSessionBajas(activePlaylist.id)"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
                Ver {{ activePlaylistSync.removedTracks.length }} eliminadas
              </button>
            </template>
          </div>
          <div class="playlist-owner-row">
            <button
              class="playlist-owner-add-btn"
              type="button"
              aria-label="Agregar canciones a la playlist"
              @click.stop="openEmptyPlaylistDiscovery"
            >
              +
            </button>
          </div>
          <div class="sah-meta playlist-view-meta">
            <span class="playlist-owner-chip">Tu biblioteca</span>
            <span class="sah-bullet">&bull;</span>
            <span>{{ activePlaylist.trackCount }} canciones</span>
            <span class="sah-bullet">&bull;</span>
            <span>{{ activePlaylistDurationFormatted }}</span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="!isActivePlaylistEmpty"
      class="spotify-album-actions playlist-view-actions"
    >
      <button class="sah-play-btn glass-shadow" @click="playPlaylistById(activePlaylistSafe.id)">
        <svg v-if="isActivePlaylistPlaying" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
        <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </button>
      <button
        class="sah-icon-btn"
        type="button"
        @click="addPlaylistToQueue(activePlaylistSafe.id)"
        :disabled="activePlaylistSafe.trackCount === 0"
        title="Agregar a la fila"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
        @click="openPlaylistContextMenuFromButton($event, activePlaylist.id)"
        title="Mas opciones"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="5" cy="12" r="1"></circle>
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="19" cy="12" r="1"></circle>
        </svg>
      </button>
    </div>

    <div v-if="!isActivePlaylistEmpty" class="search-row album-search-row playlist-search-row">
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
  </template>
</template>

<script setup lang="ts">
defineProps<{
  activePlaylist: any;
  activePlaylistContextMenuTarget: any;
  activePlaylistCoverTiles: Array<string | null>;
  activePlaylistDurationFormatted: string;
  activePlaylistSafe: any;
  activePlaylistSync: any;
  addPlaylistToQueue: (playlistId: number) => void;
  currentViewMode: string;
  isActivePlaylistEmpty: boolean;
  isActivePlaylistPlaying: boolean;
  isManualSyncing: number | null;
  isSpotifyOrdering: number | null;
  isSyncSuccess: number | null;
  librarySearch: string;
  librarySearchInputRef: any;
  librarySearchPlaceholder: string;
  manualForceSync: (playlistId: number, forceFullSync?: boolean, includeRemoved?: boolean) => void;
  openEmptyPlaylistDiscovery: () => void;
  openPlaylistContextMenu: (event: MouseEvent, playlistId: number) => void;
  openPlaylistContextMenuFromButton: (event: MouseEvent, playlistId: number) => void;
  orderPlaylistFromSpotify: (playlistId: number) => void;
  playPlaylistById: (playlistId: number) => void;
}>();

const emit = defineEmits<{
  (e: "dismiss-session-bajas", playlistId: number): void;
  (e: "dismiss-session-nuevas", playlistId: number): void;
  (e: "update:librarySearch", value: string): void;
}>();

function dismissSessionNuevas(playlistId: number) {
  emit("dismiss-session-nuevas", playlistId);
}

function dismissSessionBajas(playlistId: number) {
  emit("dismiss-session-bajas", playlistId);
}

function updateLibrarySearch(event: Event) {
  emit("update:librarySearch", (event.target as HTMLInputElement).value);
}

function clearLibrarySearch() {
  emit("update:librarySearch", "");
}
</script>
