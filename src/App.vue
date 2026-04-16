<script lang="ts">
import { defineComponent } from "vue";
import { useAppLogic } from "./useAppLogic";

export default defineComponent({
  name: "App",
  setup: useAppLogic,
});
</script>

<template>
  <div class="app" :class="{ 'is-track-dragging': draggedTrack != null }">
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
                          @mousedown.stop.prevent
                          @click.stop.prevent="
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
                          @mousedown.stop.prevent
                          @click.stop.prevent="playQuickSearchAlbum(album)"
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

          <!-- SECCIÓN DE GESTIÓN DE ACTIVOS -->
          <div class="asset-manager-section">
            <div class="panel-divider"></div>
            <div class="asset-manager-header">
              <div class="panel-title">Almacenamiento de Activos</div>
              <div class="panel-subtitle">Elige dónde buscar letras, canvas y carátulas</div>
            </div>

            <div class="asset-mode-selector glass-panel-inner">
              <button 
                class="mode-toggle-btn" 
                :class="{ active: assetStorageMode === 'unified' }"
                type="button"
                @click="assetStorageMode = 'unified'"
              >
                Unificado
                <span class="mode-desc">Junto a la música</span>
              </button>
              <button 
                class="mode-toggle-btn" 
                :class="{ active: assetStorageMode === 'custom' }"
                type="button"
                @click="assetStorageMode = 'custom'"
              >
                Personalizado
                <span class="mode-desc">Carpetas específicas</span>
              </button>
            </div>

            <div v-if="assetStorageMode === 'custom'" class="custom-paths-list">
              <div class="custom-path-item glass-panel-inner">
                <div class="path-info">
                  <div class="path-label">Carpeta de Canvas (.mp4)</div>
                  <div class="path-value">{{ customCanvasPath || 'Predeterminada' }}</div>
                </div>
                <button class="small-action-btn" type="button" @click="selectCustomCanvasPath">Cambiar</button>
              </div>

              <div class="custom-path-item glass-panel-inner">
                <div class="path-info">
                  <div class="path-label">Carpeta de Letras (.lrc)</div>
                  <div class="path-value">{{ customLyricsPath || 'Predeterminada' }}</div>
                </div>
                <button class="small-action-btn" type="button" @click="selectCustomLyricsPath">Cambiar</button>
              </div>

              <div class="custom-path-item glass-panel-inner">
                <div class="path-info">
                  <div class="path-label">Carpeta de Carátulas</div>
                  <div class="path-value">{{ customCoversPath || 'Predeterminada' }}</div>
                </div>
                <button class="small-action-btn" type="button" @click="selectCustomCoversPath">Cambiar</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="main-view-area">
        <div
          v-if="!isLyricsMode"
          class="main-layout"
          :class="{
            'sidebar-collapsed': isLibrarySidebarCollapsed,
            'spotiflac-layout': currentViewMode === 'spotiflac',
          }"
        >
          <aside
            class="left-library-sidebar glass-panel-inner"
            :class="{ collapsed: isLibrarySidebarCollapsed }"
          >
            <div class="left-library-header">
              <template v-if="!isLibrarySidebarCollapsed">
                <div class="left-library-header-main">
                  <button
                    class="sidebar-toggle-btn"
                    type="button"
                    @click="toggleLibrarySidebar"
                    aria-label="Comprimir biblioteca"
                    title="Comprimir biblioteca"
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
                      <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                      <path d="M15 4v16"></path>
                      <path d="m10 12-3-3"></path>
                      <path d="m10 12-3 3"></path>
                    </svg>
                  </button>
                  <div class="panel-title">Tu biblioteca</div>
                </div>

                <button
                  class="library-create-btn"
                  type="button"
                  @click="showPlaylistCreator"
                >
                  <span class="library-create-plus">+</span>
                  <span>Crear</span>
                </button>
              </template>

              <template v-else>
                <button
                  class="sidebar-toggle-btn is-collapsed"
                  type="button"
                  @click="toggleLibrarySidebar"
                  aria-label="Expandir biblioteca"
                  title="Expandir biblioteca"
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
                    <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                    <path d="M9 4v16"></path>
                    <path d="m14 12 3-3"></path>
                    <path d="m14 12 3 3"></path>
                  </svg>
                </button>
              </template>
            </div>

            <div
              v-if="isLibrarySidebarCollapsed"
              class="collapsed-sidebar-actions"
            >
              <button
                class="collapsed-spotiflac-btn"
                :class="{
                  active: currentViewMode === 'spotiflac',
                  offline: isSpotiFlacOffline,
                }"
                type="button"
                @click="openSpotiFlacView"
                :title="
                  isSpotiFlacOffline
                    ? 'Necesitas internet para usar SpotiFLAC'
                    : 'SpotiFLAC'
                "
                aria-label="Abrir SpotiFLAC"
              >
                SF
                <span v-if="isSpotiFlacOffline" class="spotiflac-button-badge"
                  >Sin red</span
                >
              </button>
              <button
                class="collapsed-create-btn"
                type="button"
                @click="showPlaylistCreator"
                title="Crear playlist"
                aria-label="Crear playlist"
              >
                +
              </button>
            </div>

            <div
              v-if="isPlaylistCreatorVisible && !isLibrarySidebarCollapsed"
              class="playlist-creator-card glass-panel-inner"
            >
              <input
                ref="newPlaylistInputRef"
                v-model="newPlaylistName"
                type="text"
                class="search-input playlist-create-input"
                placeholder="Nombre de la playlist"
                @keydown.enter.prevent="submitPlaylistCreation"
                @keydown.esc.prevent="cancelPlaylistCreator"
              />
              <div class="playlist-creator-actions">
                <button
                  class="small-action-btn subtle"
                  type="button"
                  @click="cancelPlaylistCreator"
                >
                  Cancelar
                </button>
                <button
                  class="small-action-btn"
                  type="button"
                  :disabled="!newPlaylistName.trim()"
                  @click="submitPlaylistCreation"
                >
                  Guardar
                </button>
              </div>
            </div>

            <div v-if="!isLibrarySidebarCollapsed" class="library-filter-pills">
              <button
                class="library-pill spotiflac-pill"
                :class="{
                  active: currentViewMode === 'spotiflac',
                  offline: isSpotiFlacOffline,
                }"
                type="button"
                @click="openSpotiFlacView"
              >
                SpotiFLAC
                <span v-if="isSpotiFlacOffline" class="spotiflac-pill-badge"
                  >Necesita internet</span
                >
              </button>
              <button
                class="library-pill"
                :class="{ active: sidebarLibraryFilter === 'playlists' }"
                type="button"
                @click="toggleSidebarLibraryFilter('playlists')"
              >
                Playlists
              </button>
              <button
                class="library-pill"
                :class="{ active: sidebarLibraryFilter === 'albums' }"
                type="button"
                @click="toggleSidebarLibraryFilter('albums')"
              >
                Álbumes
              </button>
              <button
                class="library-pill"
                :class="{ active: sidebarLibraryFilter === 'artists' }"
                type="button"
                @click="toggleSidebarLibraryFilter('artists')"
              >
                Artistas
              </button>
            </div>

            <div v-if="!isLibrarySidebarCollapsed" class="left-library-tools">
              <button
                class="left-library-search-toggle"
                type="button"
                aria-label="Buscar en tu biblioteca"
                @click="toggleSidebarSearch"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="11" cy="11" r="7"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </button>
              <div class="left-library-tools-label">Recientes</div>
            </div>

            <div
              v-if="isSidebarSearchVisible && !isLibrarySidebarCollapsed"
              class="left-library-search-row"
            >
              <input
                ref="sidebarSearchInputRef"
                v-model="sidebarLibrarySearch"
                type="text"
                class="search-input"
                placeholder="Buscar en tu biblioteca"
              />
            </div>

            <div
              class="left-library-list"
              @dragover="handleSidebarListDragOver"
              @drop="handleSidebarListDrop"
              @dragleave="handleSidebarListDragLeave"
            >
              <button
                v-for="item in visibleSidebarLibraryItems"
                :key="item.key"
                class="left-library-item"
                :class="{
                  active: item.isActive,
                  'drop-enabled': isSidebarItemDropEnabled(item),
                  'drop-disabled':
                    draggedTrack != null && !isSidebarItemDropEnabled(item),
                  'drop-active': isSidebarItemDropActive(item),
                  [`kind-${item.kind}`]: true,
                  collapsed: isLibrarySidebarCollapsed,
                }"
                type="button"
                :title="item.title"
                :data-sidebar-drop-playlist-id="
                  item.kind === 'playlist' && item.playlistId != null
                    ? item.playlistId
                    : null
                "
                @click="item.onClick()"
                @dragenter="handleSidebarItemDragEnter($event, item)"
                @dragover="handleSidebarItemDragOver($event, item)"
                @dragleave="handleSidebarItemDragLeave($event, item)"
                @drop="handleSidebarItemDrop($event, item)"
                @contextmenu="
                  item.kind === 'playlist' && item.playlistId != null
                    ? openPlaylistContextMenu($event, item.playlistId)
                    : null
                "
              >
                <div class="left-library-item-cover">
                  <!-- Caso especial: Tus Me Gusta -->
                  <div
                    v-if="item.kind === 'playlist' && item.isSystem"
                    class="playlist-cover-system liked-songs"
                  >
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                  </div>
                  
                  <div
                    v-else-if="
                      item.kind === 'playlist' && item.coverTiles.length > 0
                    "
                    class="playlist-cover-grid"
                    :class="`count-${Math.min(item.coverTiles.length, 4)}`"
                  >
                    <div
                      v-for="(tile, tileIndex) in item.coverTiles"
                      :key="`${item.key}-tile-${tileIndex}`"
                      class="playlist-cover-tile"
                    >
                      <img v-if="tile" :src="tile" alt="" />
                      <div v-else class="playlist-cover-tile-placeholder">
                        ♪
                      </div>
                    </div>
                  </div>
                  <img v-else-if="item.cover" :src="item.cover" alt="" />
                  <div v-else class="left-library-item-placeholder">
                    {{
                      item.kind === "playlist"
                        ? "♪"
                        : item.kind === "album"
                          ? "💿"
                          : "●"
                    }}
                  </div>
                </div>
                <div
                  v-if="!isLibrarySidebarCollapsed"
                  class="left-library-item-copy"
                >
                  <div class="left-library-item-title">{{ item.title }}</div>
                  <div class="left-library-item-subtitle">
                    {{ item.subtitle }}
                  </div>
                </div>
              </button>

              <div
                v-if="
                  visibleSidebarLibraryItems.length === 0 &&
                  !isLibrarySidebarCollapsed
                "
                class="left-library-empty"
              >
                <div class="left-library-empty-title">
                  No encontré resultados
                </div>
                <div class="left-library-empty-copy">
                  Prueba con otro filtro o crea una playlist nueva.
                </div>
              </div>
            </div>
          </aside>

          <div class="library-panel glass-panel-inner">
            <template v-if="currentViewMode === 'spotiflac'">
              <div class="spotiflac-view">
                <div class="spotiflac-hero">
                  <div class="spotiflac-hero-left">
                    <h2 class="spotiflac-title">SpotiFLAC</h2>
                    <div class="spotiflac-kicker">Herramientas de descarga</div>
                    <div
                      v-if="isSpotiFlacOffline"
                      class="spotiflac-connection-badge"
                    >
                      Sin internet. Necesitas conexion para usar esta funcion.
                    </div>
                  </div>

                  <button
                    class="small-action-btn spotiflac-refresh-btn"
                    type="button"
                    @click="reloadSpotiFlacFrame"
                  >
                    Recargar
                  </button>
                </div>

                <div class="spotiflac-embed-shell">
                  <iframe
                    v-if="isSpotiFlacReady"
                    ref="spotiflacFrame"
                    class="spotiflac-embed"
                    :src="spotiFlacUrl"
                    title="SpotiFLAC"
                  ></iframe>
                  <div v-else class="spotiflac-offline-state">
                    <div class="spotiflac-offline-icon">SF</div>
                    <div class="spotiflac-offline-title">
                      {{
                        isSpotiFlacOffline
                          ? "Sin conexion a internet"
                          : "SpotiFLAC aun no esta listo"
                      }}
                    </div>
                    <div class="spotiflac-offline-copy">
                      {{ spotiFlacStatusMessage }}
                    </div>
                    <div class="spotiflac-offline-steps">
                      <template v-if="isSpotiFlacOffline">
                        Conectate a internet y vuelve a intentarlo para usar
                        SpotiFLAC dentro de la app.
                      </template>
                      <template v-else>
                      La interfaz ya vive dentro de esta app en
                      <span>public/spotiflac</span>. Si no carga, recompila el
                      modulo embebido de SpotiFLAC.
                      </template>
                    </div>
                    <button
                      class="small-action-btn"
                      type="button"
                      :disabled="isSpotiFlacChecking"
                      @click="reloadSpotiFlacFrame"
                    >
                      {{
                        isSpotiFlacChecking
                          ? "Comprobando..."
                          : "Comprobar otra vez"
                      }}
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="isSearchViewActive">
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
                          @mousedown.stop.prevent
                          @click.stop.prevent="
                            committedSearchTopResult.playAction()
                          "
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
                        <div v-else class="search-circle-cover placeholder">
                          ♪
                        </div>
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
                        <div v-else class="search-album-cover placeholder">
                          ♪
                        </div>
                        <span
                          class="search-card-play-overlay"
                          @mousedown.stop.prevent
                          @click.stop.prevent="
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
              <div
                v-if="
                  currentViewMode !== 'album' && currentViewMode !== 'playlist'
                "
                class="panel-header"
              >
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

              <div
                class="search-row"
                v-if="
                  currentViewMode !== 'album' && currentViewMode !== 'playlist'
                "
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

              <!--
              <div
                v-if="false && currentViewMode === 'playlist' && activePlaylist"
                class="playlist-hero glass-panel-inner"
                @contextmenu="
                  activePlaylist
                    ? openPlaylistContextMenu($event, activePlaylistSafe.id)
                    : null
                "
              >
                <div class="playlist-hero-art">
                  <div
                    v-if="activePlaylistCoverTiles.length > 0"
                    class="playlist-cover-grid playlist-hero-cover"
                    :class="`count-${Math.min(activePlaylistCoverTiles.length, 4)}`"
                  >
                    <div
                      v-for="(tile, tileIndex) in activePlaylistCoverTiles"
                      :key="`active-playlist-tile-${tileIndex}`"
                      class="playlist-cover-tile"
                    >
                      <img v-if="tile" :src="tile || undefined" alt="" />
                      <div v-else class="playlist-cover-tile-placeholder">
                        ♪
                      </div>
                    </div>
                  </div>
                  <div v-else class="playlist-hero-placeholder">♪</div>
                </div>

                <div class="playlist-hero-copy">
                  <span class="playlist-hero-type">Playlist</span>
                  <h1 class="playlist-hero-title">
                    {{ activePlaylistSafe.name }}
                  </h1>
                  <div class="playlist-hero-meta">
                    {{ activePlaylist.trackCount }} canciones •
                    {{ activePlaylistDurationFormatted }}
                  </div>
                </div>

                <div class="playlist-hero-actions">
                  <button
                    class="sah-play-btn glass-shadow"
                    type="button"
                    @click="playPlaylistById(activePlaylist.id)"
                  >
                    <svg
                      v-if="isActivePlaylistPlaying"
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

                  <button
                    class="small-action-btn"
                    type="button"
                    @click="addPlaylistToQueue(activePlaylist.id)"
                    :disabled="activePlaylist.trackCount === 0"
                  >
                    Añadir a la fila
                  </button>
                </div>
              </div>
              -->

              <div v-if="shouldShowCurrentViewEmpty" class="library-empty">
                <div class="empty-title small-title">
                  {{ currentViewEmptyTitle }}
                </div>
                <div class="empty-subtitle">
                  {{ currentViewEmptySubtitle }}
                </div>
              </div>

              <div
                v-else
                ref="albumScrollContainerRef"
                class="tracks-list spotify-list"
                :class="{
                  'album-sticky-active':
                    currentViewMode === 'album' && compactAlbumBarVisible,
                  'playlist-view-active': currentViewMode === 'playlist',
                }"
                @scroll="updateAlbumCompactBar"
              >
                <div
                  v-if="currentViewMode === 'playlist' && activePlaylist"
                  class="spotify-album-hero playlist-view-hero"
                  @contextmenu="
                    openPlaylistContextMenu($event, activePlaylist.id)
                  "
                >
                  <div class="sah-content playlist-sah-content">
                    <!-- Carátula de sistema para Tus Me Gusta -->
                      <div
                        v-if="activePlaylist.isSystem === 1"
                        class="playlist-cover-system liked-songs sah-cover glass-shadow"
                      >
                        <svg viewBox="0 0 24 24" width="86" height="86" fill="white">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
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
                        <img v-if="tile" :src="tile" alt="" />
                        <div v-else class="playlist-cover-tile-placeholder">
                          ♪
                        </div>
                      </div>
                    </div>
                    <div
                      v-else
                      class="sah-cover-placeholder glass-shadow"
                      :class="{ 'empty-playlist-cover': isActivePlaylistEmpty }"
                    >
                      ♪
                    </div>

                    <div class="sah-info">
                      <span class="sah-type">
                        {{
                          isActivePlaylistEmpty
                            ? "Playlist pública"
                            : "Playlist creada"
                        }}
                      </span>
                      <h1 class="sah-title playlist-view-title">
                        {{ activePlaylist.name }}
                      </h1>
                      
                      <!-- Botones de Sincronización Manual -->
                      <div v-if="activePlaylist && activePlaylist.spotifyUrl" class="playlist-sync-manual-controls">
                        <button 
                          class="playlist-sync-force-btn" 
                          :class="{ 
                            'is-loading': isManualSyncing === activePlaylist.id,
                            'is-success': isSyncSuccess === activePlaylist.id
                          }"
                          :disabled="isManualSyncing === activePlaylist.id"
                          title="Sincronizar ahora con Spotify"
                          @click="activePlaylist && manualForceSync(activePlaylist.id)"
                        >
                          <template v-if="isSyncSuccess === activePlaylist.id">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                              <path d="M20 6L9 17L4 12" stroke="#1db954" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </template>
                          <template v-else-if="isManualSyncing === activePlaylist.id">
                            <div class="spotify-sync-spinner-mini white" style="width: 14px; height: 14px;"></div>
                          </template>
                          <svg v-else viewBox="0 0 496 512" width="16" height="16">
                            <path fill="#1ed760" d="M248 8C111.1 8 0 119.1 0 256s111.1 248 248 248 248-111.1 248-248S384.9 8 248 8Z"/>
                            <path d="M406.6 231.1c-5.2 0-8.4-1.3-12.9-3.9-71.2-42.5-198.5-52.7-280.9-29.7-3.6 1-8.1 2.6-12.9 2.6-13.2 0-23.3-10.3-23.3-23.6 0-13.6 8.4-21.3 17.4-23.9 35.2-10.3 74.6-15.2 117.5-15.2 73 0 149.5 15.2 205.4 47.8 7.8 4.5 12.9 10.7 12.9 22.6 0 13.6-11 23.3-23.3 23.3zm-31 76.2c-5.2 0-8.7-2.3-12.3-4.2-62.5-37-155.7-51.9-238.6-29.4-4.8 1.3-7.4 2.6-11.9 2.6-10.7 0-19.4-8.7-19.4-19.4s5.2-17.8 15.5-20.7c27.8-7.8 56.2-13.6 97.8-13.6 64.9 0 127.6 16.1 177 45.5 8.1 4.8 11.3 11 11.3 19.7-.1 10.8-8.5 19.5-19.4 19.5zm-26.9 65.6c-4.2 0-6.8-1.3-10.7-3.6-62.4-37.6-135-39.2-206.7-24.5-3.9 1-9 2.6-11.9 2.6-9.7 0-15.8-7.7-15.8-15.8 0-10.3 6.1-15.2 13.6-16.8 81.9-18.1 165.6-16.5 237 26.2 6.1 3.9 9.7 7.4 9.7 16.5s-7.1 15.4-15.2 15.4z"/>
                          </svg>
                          <span>
                            {{ isManualSyncing === activePlaylist.id ? 'Sincronizando...' : isSyncSuccess === activePlaylist.id ? 'Al día' : 'Sincronizar' }}
                          </span>
                        </button>

                        <template v-if="activePlaylistSync">
                          <button 
                            v-if="activePlaylistSync.newTracks.length > 0"
                            class="playlist-sync-status-badge nuevas"
                            @click="activePlaylist && (sessionDismissedNuevas[activePlaylist.id] = '')"
                          >
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                            Ver {{ activePlaylistSync.newTracks.length }} nuevas
                          </button>
                          
                          <button 
                            v-if="activePlaylistSync.removedTracks.length > 0"
                            class="playlist-sync-status-badge eliminadas"
                            @click="activePlaylist && (sessionDismissedBajas[activePlaylist.id] = '')"
                          >
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
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
                        <span class="sah-bullet">•</span>
                        <span>{{ activePlaylist.trackCount }} canciones</span>
                        <span class="sah-bullet">•</span>
                        <span>{{ activePlaylistDurationFormatted }}</span>
                      </div>
                    </div>
                  </div>
                </div>

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
                  v-if="
                    currentViewMode === 'playlist' &&
                    activePlaylist &&
                    !isActivePlaylistEmpty
                  "
                  class="spotify-album-actions playlist-view-actions"
                >
                  <button
                    class="sah-play-btn glass-shadow"
                    @click="playPlaylistById(activePlaylistSafe.id)"
                  >
                    <svg
                      v-if="isActivePlaylistPlaying"
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
                  <button
                    class="sah-icon-btn"
                    type="button"
                    @click="addPlaylistToQueue(activePlaylistSafe.id)"
                    :disabled="activePlaylistSafe.trackCount === 0"
                    title="Agregar a la fila"
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
                    @click="
                      openPlaylistContextMenuFromButton(
                        $event,
                        activePlaylist.id,
                      )
                    "
                    title="Mas opciones"
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
                    currentViewMode === 'playlist' && !isActivePlaylistEmpty
                  "
                  class="search-row album-search-row playlist-search-row"
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
                      ×
                    </button>
                  </div>
                </div>

                <div
                  v-if="
                    currentViewMode === 'playlist' &&
                    activePlaylist &&
                    isActivePlaylistEmpty
                  "
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
                        @click="
                          openPlaylistContextMenuFromButton(
                            $event,
                            activePlaylist.id,
                          )
                        "
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
                          ×
                        </button>
                      </div>
                    </div>

                    <div class="search-input-wrapper empty-playlist-search">
                      <input
                        ref="emptyPlaylistSearchInputRef"
                        v-model="emptyPlaylistSearch"
                        type="text"
                        class="search-input empty-playlist-search-input"
                        placeholder="Busca canciones o artistas para añadir"
                      />

                      <button
                        v-if="emptyPlaylistSearch"
                        class="search-clear-btn"
                        type="button"
                        @click="emptyPlaylistSearch = ''"
                      >
                        ×
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
                              :src="getLibraryTrackCover(track)!"
                              alt=""
                            />
                            <div
                              v-else
                              class="empty-playlist-result-cover placeholder"
                            >
                              ♪
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
                  v-if="!isActivePlaylistEmpty"
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
                  <div class="col-album" v-if="currentViewMode !== 'album'">
                    Álbum
                  </div>
                  <div class="col-added">
                    {{
                      currentViewMode === "playlist"
                        ? "Fecha en que se agrego"
                        : "Agregado"
                    }}
                  </div>
                  <div class="col-time">⏱</div>
                </div>

                <div
                  v-if="!isActivePlaylistEmpty"
                  v-for="(track, index) in displayedTracks"
                  :key="
                    currentViewMode === 'playlist'
                      ? `${track.path}-${index}`
                      : track.path
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
                  @mouseenter="hoveredLibraryTrackPath = track.path"
                  @mouseleave="hoveredLibraryTrackPath = null"
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
                          ? (getLibraryTrackMetadata(track)?.track_number ??
                            index + 1)
                          : index + 1
                      }}
                    </span>

                    <span
                      v-else-if="shouldShowLibraryPlayIcon(track, index)"
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
                      v-else-if="shouldShowLibraryPauseIcon(track, index)"
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
                    @click.stop="
                      toggleLibraryTrackPlayback(track, index)
                    "
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
                          <svg viewBox="0 0 24 24" width="16" height="16" :fill="isLiked(track.path) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                          </svg>
                        </button>
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
                      @click.stop="openLibraryTrackContextMenu($event, track, index)"
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

          <div v-if="currentViewMode !== 'spotiflac'" class="right-sidebar">
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
              :class="{
                'has-canvas-bg': canvasUrl,
                'has-cover-bg': !canvasUrl,
              }"
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
              {{ connectPlaybackDeviceLabel }}
            </div>

            <div class="sbp-device-meta">
              <template v-if="isMobileConnectActive">
                {{ mobileConnectTitle }}
              </template>
              <template v-else>
                {{ (outputDeviceInfo.sample_rate / 1000).toFixed(1) }} kHz /
                {{ outputDeviceInfo.sample_format }}
              </template>
            </div>

            <button
              v-if="isMobileConnectActive"
              class="connect-device-btn"
              type="button"
              @click="listenOnDesktop"
            >
              Escuchar en este PC
            </button>
            <button
              v-else
              class="connect-device-btn"
              type="button"
              @click="listenOnMobile"
            >
              Escuchar en telefono
            </button>
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
    <!-- Acciones para selección múltiple -->
    <template v-if="multiSelectedLibraryTracks.length > 1">
      <div class="context-menu-header">
        Selección de {{ multiSelectedLibraryTracks.length }} canciones
      </div>
      <button
        class="context-menu-item"
        type="button"
        @click="addSelectionToQueue"
      >
        Agregar selección a la fila
      </button>
      <button
        class="context-menu-item with-chevron"
        type="button"
        @click="toggleContextMenuPlaylistPicker"
      >
        Agregar selección a una playlist
      </button>
      <button
        v-if="contextMenuCanRemoveFromPlaylist && contextMenuActivePlaylist"
        class="context-menu-item"
        type="button"
        @click="removeContextMenuTrackFromPlaylist()"
      >
        Eliminar selección de {{ contextMenuActivePlaylist.name }}
      </button>
    </template>

    <!-- Acciones para un solo track (Legacy/Single) -->
    <template v-else>
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
      <button
        v-if="contextMenuPlaylistActions.length > 0"
        class="context-menu-item with-chevron"
        type="button"
        @click="toggleContextMenuPlaylistPicker"
      >
        Agregar a una playlist
      </button>
      <button
        v-if="contextMenuCanRemoveFromPlaylist && contextMenuActivePlaylist"
        class="context-menu-item"
        type="button"
        @click="removeContextMenuTrackFromPlaylist"
      >
        Eliminar de {{ contextMenuActivePlaylist.name }}
      </button>
      <div
        v-if="
          contextMenuPlaylistActions.length > 0 ||
          contextMenuCanRemoveFromPlaylist
        "
        class="context-menu-separator"
      ></div>
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
    </template>
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

  <div
    v-if="contextMenu.visible && isContextMenuPlaylistPickerVisible"
    class="track-context-menu context-menu-playlist-picker"
    :style="contextMenuPlaylistPickerStyle"
    @click.stop
  >
    <div class="context-menu-playlist-search">
      <input
        ref="contextMenuPlaylistSearchInputRef"
        v-model="contextMenuPlaylistSearch"
        type="text"
        class="context-menu-playlist-search-input"
        placeholder="Busca una playlist"
      />
    </div>
    <button
      class="context-menu-item"
      type="button"
      @click="openContextMenuPlaylistCreator"
    >
      Nueva playlist
    </button>
    <div class="context-menu-separator"></div>
    <div class="context-menu-playlist-list">
      <button
        v-for="playlistItem in filteredContextMenuPlaylistActions"
        :key="playlistItem.id"
        class="context-menu-item"
        type="button"
        @click="addContextMenuTrackToPlaylist(playlistItem.id)"
      >
        {{ playlistItem.name }}
      </button>
      <div
        v-if="filteredContextMenuPlaylistActions.length === 0"
        class="context-menu-playlist-empty"
      >
        No se encontraron playlists.
      </div>
    </div>
  </div>

  <div
    v-if="playlistContextMenu.visible && activePlaylistContextMenuTarget"
    class="track-context-menu"
    :style="playlistContextMenuStyle"
    @click.stop
  >
    <button
      class="context-menu-item"
      type="button"
      :disabled="activePlaylistContextMenuTarget.trackCount === 0"
      @click="playPlaylistFromContextMenu"
    >
      Reproducir
    </button>
    <button
      class="context-menu-item"
      type="button"
      :disabled="activePlaylistContextMenuTarget.trackCount === 0"
      @click="addPlaylistToQueueFromContextMenu"
    >
      Agregar a la fila de reproduccion
    </button>
    <template v-if="!activePlaylistContextMenuTarget.isSystem">
      <div class="context-menu-separator"></div>
      <button
        class="context-menu-item"
        type="button"
        @click="openRenamePlaylistModal(activePlaylistContextMenuTarget.id)"
      >
        Editar datos
      </button>
      <button
        class="context-menu-item danger"
        type="button"
        @click="requestDeletePlaylist(activePlaylistContextMenuTarget.id)"
      >
        Eliminar
      </button>
    </template>
  </div>

  <div
    v-if="duplicatePlaylistModal"
    class="playlist-modal-backdrop"
    @click.self="closeDuplicatePlaylistModal"
  >
    <div class="playlist-modal duplicate-track-modal">
      <div class="playlist-modal-copy">
        <h2>Canciones ya agregadas</h2>
        <p>
          Esta canción ya está en tu playlist "{{
            duplicatePlaylistModal.playlistName
          }}".
        </p>
      </div>

      <div class="playlist-modal-actions duplicate-track-actions">
        <button
          class="playlist-modal-btn ghost"
          type="button"
          @click="confirmDuplicatePlaylistAdd"
        >
          Agregar de todas formas
        </button>
        <button
          class="playlist-modal-btn success"
          type="button"
          @click="closeDuplicatePlaylistModal"
        >
          No agregar
        </button>
      </div>
    </div>
  </div>

  <div
    v-if="isRenamePlaylistModalVisible"
    class="playlist-modal-backdrop"
    @click.self="closePlaylistRenameModal"
  >
    <div class="playlist-modal rename-modal">
      <div class="playlist-modal-copy">
        <h2>Editar playlist</h2>
        <p>Cambia el nombre de tu playlist.</p>
      </div>

      <input
        v-model="renamePlaylistName"
        class="playlist-modal-input"
        type="text"
        maxlength="80"
        placeholder="Nombre de la playlist"
        @keydown.enter.prevent="submitPlaylistRename"
      />

      <div class="playlist-modal-actions">
        <button
          class="playlist-modal-btn ghost"
          type="button"
          @click="closePlaylistRenameModal"
        >
          Cancelar
        </button>
        <button
          class="playlist-modal-btn primary"
          type="button"
          :disabled="!renamePlaylistName.trim()"
          @click="submitPlaylistRename"
        >
          Guardar
        </button>
      </div>
    </div>
  </div>

  <div
    v-if="playlistPendingDeletion"
    class="playlist-modal-backdrop"
    @click.self="closePlaylistDeleteModal"
  >
    <div class="playlist-modal delete-modal">
      <div class="playlist-modal-copy">
        <h2>¿Quieres eliminar este elemento de Tu biblioteca?</h2>
        <p>Se eliminara {{ playlistPendingDeletion.name }} de Tu biblioteca.</p>
      </div>

      <div class="playlist-modal-actions delete-playlist-actions-wrap">
        <div class="delete-files-option">
          <label class="delete-files-checkbox">
            <input type="checkbox" v-model="deletePlaylistWithFiles" />
            <span class="checkbox-custom"></span>
            <span class="checkbox-label">Eliminar la playlist <strong>{{ playlistPendingDeletion.name }}</strong> y sus canciones físicamente de tu PC</span>
          </label>
          <div v-if="deletePlaylistWithFiles" class="delete-files-hard-warning">
            <svg class="modal-warning-icon" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 8V12M12 16H12.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span>
              Solo se borrarán los archivos físicos de esta playlist. Si una
              canción está en otra lista de reproducción, permanecerá guardada
              en tu PC.
            </span>
          </div>
        </div>

        <div class="modal-footer-buttons">
          <button
            class="playlist-modal-btn ghost"
            type="button"
            @click="closePlaylistDeleteModal"
          >
            Cancelar
          </button>
          <button
            class="playlist-modal-btn danger"
            type="button"
            @click="confirmDeletePlaylist"
          >
            {{ deletePlaylistWithFiles ? 'Eliminar todo' : 'Eliminar' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    v-if="trackPendingDeletion"
    class="playlist-modal-backdrop"
    @click.self="closeTrackDeleteModal"
  >
    <div class="playlist-modal delete-modal">
      <div class="playlist-modal-copy">
        <h2>
          {{ trackPendingDeletion.count && trackPendingDeletion.count > 1 
            ? `¿Quitar estas ${trackPendingDeletion.count} canciones?` 
            : "¿Quitar esta canción de la playlist?" }}
        </h2>
        <p v-if="!trackPendingDeletion.count || trackPendingDeletion.count === 1">
          Se quitará
          <strong>{{ getTrackDisplayTitle(trackPendingDeletion.track) }}</strong>
          de <strong>{{ trackPendingDeletion.playlistName }}</strong>.
        </p>
        <p v-else>
          Se quitarán <strong>{{ trackPendingDeletion.count }} canciones</strong> 
          de <strong>{{ trackPendingDeletion.playlistName }}</strong>.
        </p>
      </div>

      <div class="playlist-modal-actions delete-playlist-actions-wrap">
        <div v-if="trackPendingDeletion.isPhysical" class="delete-files-option">
          <label class="delete-files-checkbox">
            <input type="checkbox" v-model="deleteTrackWithFiles" />
            <span class="checkbox-custom"></span>
            <span class="checkbox-label">
              {{ trackPendingDeletion.count && trackPendingDeletion.count > 1 
                 ? "Eliminar también los archivos físicos del PC" 
                 : "Eliminar también el archivo físico del PC" }}
            </span>
          </label>
          <div v-if="deleteTrackWithFiles" class="delete-files-hard-warning">
            <svg class="modal-warning-icon" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 8V12M12 16H12.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span>
              {{ trackPendingDeletion.count && trackPendingDeletion.count > 1 
                 ? "Los archivos se eliminarán físicamente solo de la carpeta de la playlist" 
                 : "El archivo se eliminará físicamente solo de la carpeta de la playlist" }}
              <strong>{{ trackPendingDeletion.playlistName }}</strong>. Otras
              copias en tu PC no se verán afectadas.
            </span>
          </div>
        </div>

        <div class="modal-footer-buttons">
          <button
            class="playlist-modal-btn ghost"
            type="button"
            @click="closeTrackDeleteModal"
          >
            Cancelar
          </button>
          <button
            class="playlist-modal-btn danger"
            type="button"
            @click="confirmDeleteTrack"
          >
            {{
              deleteTrackWithFiles ? "Eliminar del disco" : "Quitar de la lista"
            }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal de Sincronización de Spotify (Premium Redesign) -->
  <transition name="spotify-sync-modal">
    <div
      v-if="pendingSpotifySyncs.length > 0"
      class="spotify-sync-modal-backdrop"
      @click.self="closeSyncModalSoft(pendingSpotifySyncs[0].playlistId)"
    >
      <div class="spotify-sync-modal glass-panel">
        <div class="spotify-sync-modal-header">
          <div class="spotify-sync-icon-badge">
            <svg viewBox="0 0 496 512" width="60" height="60">
              <path fill="#1ed760" d="M248 8C111.1 8 0 119.1 0 256s111.1 248 248 248 248-111.1 248-248S384.9 8 248 8Z"/>
              <path d="M406.6 231.1c-5.2 0-8.4-1.3-12.9-3.9-71.2-42.5-198.5-52.7-280.9-29.7-3.6 1-8.1 2.6-12.9 2.6-13.2 0-23.3-10.3-23.3-23.6 0-13.6 8.4-21.3 17.4-23.9 35.2-10.3 74.6-15.2 117.5-15.2 73 0 149.5 15.2 205.4 47.8 7.8 4.5 12.9 10.7 12.9 22.6 0 13.6-11 23.3-23.3 23.3zm-31 76.2c-5.2 0-8.7-2.3-12.3-4.2-62.5-37-155.7-51.9-238.6-29.4-4.8 1.3-7.4 2.6-11.9 2.6-10.7 0-19.4-8.7-19.4-19.4s5.2-17.8 15.5-20.7c27.8-7.8 56.2-13.6 97.8-13.6 64.9 0 127.6 16.1 177 45.5 8.1 4.8 11.3 11 11.3 19.7-.1 10.8-8.5 19.5-19.4 19.5zm-26.9 65.6c-4.2 0-6.8-1.3-10.7-3.6-62.4-37.6-135-39.2-206.7-24.5-3.9 1-9 2.6-11.9 2.6-9.7 0-15.8-7.7-15.8-15.8 0-10.3 6.1-15.2 13.6-16.8 81.9-18.1 165.6-16.5 237 26.2 6.1 3.9 9.7 7.4 9.7 16.5s-7.1 15.4-15.2 15.4z"/>
            </svg>
          </div>
          <h2 v-if="!isSyncSuccess">Sincronización de Spotify</h2>
          <h2 v-else>¡Todo listo!</h2>
        </div>

        <div v-if="isSyncSuccess" class="spotify-sync-success-view">
          <div class="spotify-sync-success-icon">
            <svg viewBox="0 0 24 24" width="80" height="80" fill="#1db954"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
          </div>
          <p>Sincronización completada con éxito</p>
        </div>

        <div v-else class="spotify-sync-sections">
          <!-- Columna Izquierda: NUEVAS -->
          <div 
            v-if="pendingSpotifySyncs[0].newTracks.length > 0 && sessionDismissedNuevas[pendingSpotifySyncs[0].playlistId] !== pendingSpotifySyncs[0].newTracks.map(t => t.id).sort().join(',')" 
            class="spotify-sync-column"
          >
            <div class="spotify-sync-column-header">
              <h3 class="spotify-sync-section-title">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: middle; margin-right: 6px;"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                Nuevas canciones
              </h3>
              <p class="spotify-sync-column-subtitle">Detectamos <strong>{{ pendingSpotifySyncs[0].newTracks.length }}</strong> novedades.</p>
            </div>
            
            <div class="spotify-sync-track-list">
              <div 
                v-for="track in pendingSpotifySyncs[0].newTracks" 
                :key="track.id"
                class="spotify-sync-track-item"
              >
                <div class="spotify-sync-track-cover-mini">
                  <img v-if="track.cover" :src="track.cover" alt="" />
                  <div v-else class="spotify-sync-track-placeholder">♪</div>
                </div>
                <div class="spotify-sync-track-info" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <div style="flex: 1; min-width: 0;">
                    <div class="spotify-sync-track-title">{{ track.title }}</div>
                    <div class="spotify-sync-track-artist">{{ track.artists }}</div>
                  </div>
                  <!-- Estado de la descarga en la fila -->
                  <div v-if="track.status" class="spotify-sync-track-status" :class="track.status">
                    <div v-if="track.status === 'downloading'" class="spotify-sync-spinner-mini"></div>
                    <span v-if="track.status === 'downloading'">Bajando...</span>
                    <span v-if="track.status === 'done'">Listo</span>
                    <span v-if="track.status === 'error'">Error</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="spotify-sync-column-footer">
              <div class="sync-actions-group">
                <button
                  class="spotify-sync-btn ghost mini"
                  type="button"
                  @click="sessionDismissedNuevas[pendingSpotifySyncs[0].playlistId] = pendingSpotifySyncs[0].newTracks.map(t => t.id).sort().join(',')"
                  title="Recordar luego"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h2v5.2l4.5 2.7-.7.3z"/></svg>
                </button>
                <button
                  class="spotify-sync-btn ghost mini"
                  type="button"
                  @click="ignoreNewTracksSync(pendingSpotifySyncs[0].playlistId, pendingSpotifySyncs[0].newTracks)"
                  title="Ignorar permanentemente"
                >
                  No mostrar
                </button>
              </div>
              <button
                class="spotify-sync-btn primary mini"
                type="button"
                :disabled="isSyncDownloading"
                @click="applyNewTracksSync(pendingSpotifySyncs[0].playlistId, pendingSpotifySyncs[0].newTracks, pendingSpotifySyncs[0].remoteIds || [])"
              >
                <template v-if="isSyncDownloading">
                  <div class="spotify-sync-spinner-mini white" style="margin-right: 10px;"></div>
                  Descargando ({{ pendingSpotifySyncs[0].newTracks.filter(t => t.status !== 'done').length }})
                </template>
                <template v-else>
                  Descargar todas
                </template>
              </button>
            </div>
          </div>

          <!-- Columna Derecha: ELIMINADAS -->
          <div 
            v-if="pendingSpotifySyncs[0].removedTracks.length > 0 && sessionDismissedBajas[pendingSpotifySyncs[0].playlistId] !== pendingSpotifySyncs[0].removedTracks.map(t => t.path).sort().join(',')" 
            class="spotify-sync-column"
          >
            <div class="spotify-sync-column-header">
              <h3 class="spotify-sync-section-title danger">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: middle; margin-right: 6px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                Eliminadas en Spotify
              </h3>
              <p class="spotify-sync-column-subtitle">Hay <strong>{{ pendingSpotifySyncs[0].removedTracks.length }}</strong> bajas en el origen.</p>
            </div>
            
            <div class="spotify-sync-track-list">
              <div 
                v-for="track in pendingSpotifySyncs[0].removedTracks" 
                :key="track.id"
                class="spotify-sync-track-item selectable"
                :class="{ selected: selectedRemovedTracks.includes(track.path) }"
                @click="toggleRemovedTrackSelection(track.path)"
              >
                <div class="spotify-sync-checkbox">
                  <div class="checkbox-inner" :class="{ active: selectedRemovedTracks.includes(track.path) }">
                    <svg v-if="selectedRemovedTracks.includes(track.path)" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"/></svg>
                  </div>
                </div>
                <div class="spotify-sync-track-cover-mini">
                  <img v-if="track.cover" :src="track.cover" alt="" />
                  <div v-else class="spotify-sync-track-placeholder">♪</div>
                </div>
                <div class="spotify-sync-track-info">
                  <div class="spotify-sync-track-title">{{ track.title }}</div>
                  <div class="spotify-sync-track-artist">{{ track.artists }}</div>
                </div>
              </div>
            </div>

            <div class="spotify-sync-column-footer">
              <div class="sync-actions-group">
                <button
                  class="spotify-sync-btn ghost mini"
                  type="button"
                  @click="sessionDismissedBajas[pendingSpotifySyncs[0].playlistId] = pendingSpotifySyncs[0].removedTracks.map(t => t.path).sort().join(',')"
                  title="Recordar luego"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h2v5.2l4.5 2.7-.7.3z"/></svg>
                </button>
                <button
                  class="spotify-sync-btn ghost mini"
                  type="button"
                  @click="ignoreRemovedTracksSync(pendingSpotifySyncs[0].playlistId, selectedRemovedTracks)"
                  title="Ignorar permanentemente"
                >
                  Mantener
                </button>
              </div>
              <button
                class="spotify-sync-btn danger mini"
                type="button"
                :disabled="selectedRemovedTracks.length === 0"
                @click="applyRemovedTracksSync(pendingSpotifySyncs[0].playlistId, selectedRemovedTracks, pendingSpotifySyncs[0].remoteIds || [])"
              >
                Quitar marcadas
              </button>
            </div>
          </div>
        </div>

        <!-- Cierre automático si ambos estados coinciden con los descartados -->
        <div v-if="(pendingSpotifySyncs[0].newTracks.length === 0 || sessionDismissedNuevas[pendingSpotifySyncs[0].playlistId] === pendingSpotifySyncs[0].newTracks.map(t => t.id).sort().join(',')) && (pendingSpotifySyncs[0].removedTracks.length === 0 || sessionDismissedBajas[pendingSpotifySyncs[0].playlistId] === pendingSpotifySyncs[0].removedTracks.map(t => t.path).sort().join(','))" v-show="false">
          {{ discardSpotifySync(pendingSpotifySyncs[0].playlistId, pendingSpotifySyncs[0]) }}
        </div>
      </div>
    </div>
  </transition>

  <transition name="playlist-add-toast">
    <div
      v-if="playlistAddToast"
      class="playlist-add-toast"
      role="status"
      aria-live="polite"
    >
      <div class="playlist-add-toast-cover">
        <img
          v-if="playlistAddToast.cover"
          :src="playlistAddToast.cover"
          alt=""
        />
        <div v-else class="playlist-add-toast-cover placeholder">♪</div>
      </div>
      <div class="playlist-add-toast-copy">
        <div class="playlist-add-toast-title">
          Se agregó a {{ playlistAddToast.playlistName }}
        </div>
        <div class="playlist-add-toast-subtitle">
          {{ playlistAddToast.trackTitle }} · {{ playlistAddToast.artist }}
        </div>
      </div>
    </div>
  </transition>

  <transition name="boot-overlay-fade">
    <div v-if="isAppBooting" class="boot-overlay" aria-live="polite">
      <div class="boot-overlay-card glass-panel">
        <div class="boot-overlay-spinner" aria-hidden="true"></div>
        <div class="boot-overlay-copy">
          <p class="boot-overlay-eyebrow">Iniciando</p>
          <h2>Preparando tu música</h2>
          <p>
            Cargando biblioteca, recuperando sesión y conectando la salida de
            audio.
          </p>
        </div>
      </div>
    </div>
  </transition>
</template>

<style>
/* --- Spotify Sync Styles (Premium Redesign) --- */
.spotify-sync-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background-color: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.spotify-sync-modal {
  width: min(850px, 95%);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  padding: 32px;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  animation: modal-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  background: rgba(40, 44, 52, 0.98);
  border-radius: 40px;
  overflow: hidden;
}

@keyframes modal-enter {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.spotify-sync-modal-header {
  text-align: center;
  margin-bottom: 24px;
}

.spotify-sync-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
}

.spotify-sync-modal-header h2 {
  margin: 0;
  font-size: 32px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.02em;
}

.spotify-sync-modal-header p {
  margin: 8px 0 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: 15px;
  line-height: 1.5;
}

.spotify-sync-sections {
  display: flex;
  flex-direction: row; /* Cambio a horizontal */
  gap: 32px;
  flex: 1;
  overflow: hidden;
  margin-bottom: 24px;
}

.spotify-sync-column {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 12px;
}

.spotify-sync-section-title {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: 800;
  text-transform: uppercase;
  color: #1ed760;
  margin: 0;
  letter-spacing: 0.05em;
}

.spotify-sync-section-title.danger {
  color: #ff4d4d;
}

.spotify-sync-column-header {
  margin-bottom: 4px;
  padding-left: 8px;
}

.spotify-sync-column-subtitle {
  margin: 6px 0 0;
  color: rgba(255, 255, 255, 0.4);
  font-size: 16px;
  line-height: 1.4;
}

.spotify-sync-column-subtitle strong {
  color: rgba(255, 255, 255, 0.7);
}

.playlist-sync-manual-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0 16px;
  animation: spotify-sync-fade-in 0.5s ease-out;
}

.playlist-sync-force-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.playlist-sync-force-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.playlist-sync-status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
  animation: spotify-sync-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.playlist-sync-status-badge.nuevas {
  background: #1db954;
  color: #000;
}

.playlist-sync-status-badge.eliminadas {
  background: #ff4d4d;
  color: #fff;
}

.playlist-sync-status-badge:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.spotify-sync-success-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  animation: spotify-sync-fade-in 0.4s ease-out;
}

.spotify-sync-success-icon {
  margin-bottom: 24px;
  animation: spotify-sync-pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.spotify-sync-success-view p {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

@keyframes spotify-sync-fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spotify-sync-pop {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.spotify-sync-track-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.spotify-sync-empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.2);
  font-size: 13px;
  font-style: italic;
}

.spotify-sync-column-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
}

.sync-actions-group {
  display: flex;
  gap: 10px;
}

.spotify-sync-btn.mini {
  height: 44px;
  padding: 0 20px;
  font-size: 15px;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* Estilo especial para los botones de icono */
.spotify-sync-btn.mini:has(svg:only-child) {
  width: 38px;
  padding: 0;
}

.spotify-sync-btn.danger {
  background: rgba(255, 77, 77, 0.1);
  color: #ff4d4d;
  border: 1px solid rgba(255, 77, 77, 0.2);
}

.spotify-sync-btn.danger:hover:not(:disabled) {
  background: #ff4d4d;
  color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 77, 77, 0.3);
}

.spotify-sync-btn.danger:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.spotify-sync-track-item.selectable {
  cursor: pointer;
}

.spotify-sync-track-item.selected {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}

.spotify-sync-checkbox {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox-inner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.checkbox-inner.active {
  background: #ff4d4d;
  border-color: #ff4d4d;
  color: #fff;
}

/* Custom Scrollbar */
.spotify-sync-track-list::-webkit-scrollbar {
  width: 6px;
}
.spotify-sync-track-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.spotify-sync-track-item {
  display: flex;
  align-items: center;
  padding: 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
  gap: 12px;
}

.spotify-sync-track-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.spotify-sync-track-cover-mini {
  width: 54px;
  height: 54px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spotify-sync-track-cover-mini img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.spotify-sync-track-placeholder {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.2);
}

.spotify-sync-track-info {
  flex: 1;
  min-width: 0;
}

.spotify-sync-track-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spotify-sync-track-artist {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spotify-sync-track-status {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: 8px;
  flex-shrink: 0;
}

.spotify-sync-track-status.downloading {
  color: #1db954;
  background: rgba(29, 185, 84, 0.1);
}

.spotify-sync-track-status.done {
  color: #1db954;
  opacity: 0.7;
}

.spotify-sync-track-status.error {
  color: #ff4d4d;
  background: rgba(255, 77, 77, 0.1);
}

/* Spinner animado */
.spotify-sync-spinner-mini {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(29, 185, 84, 0.3);
  border-top-color: #1db954;
  border-radius: 50%;
  animation: spotify-sync-spin 0.8s linear infinite;
}

.spotify-sync-spinner-mini.white {
  border-color: rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
}

@keyframes spotify-sync-spin {
  to { transform: rotate(360deg); }
}

.spotify-sync-more-count {
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  padding: 8px 0;
}

.spotify-sync-modal-footer {
  display: flex;
  gap: 12px;
  margin-top: auto;
}

.spotify-sync-btn {
  flex: 1;
  height: 52px;
  border-radius: 26px;
  border: none;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.spotify-sync-btn.ghost {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.spotify-sync-btn.ghost:hover {
  background: rgba(255, 255, 255, 0.18);
}

.spotify-sync-btn.primary {
  background: #1db954;
  color: #000;
}

.spotify-sync-btn.primary:hover {
  background: #1ed760;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(29, 185, 84, 0.4);
}

.spotify-sync-btn.primary:active {
  transform: translateY(0);
}

/* Animations for Vue Transitions */
.spotify-sync-modal-enter-active,
.spotify-sync-modal-leave-active {
  transition: all 0.4s ease;
}

.spotify-sync-modal-enter-from,
.spotify-sync-modal-leave-to {
  opacity: 0;
  backdrop-filter: blur(0px);
}
.delete-files-hard-warning {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: rgba(255, 77, 77, 0.08);
  border: 1px solid rgba(255, 77, 77, 0.2);
  color: #ff4d4d;
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 13.5px;
  line-height: 1.5;
  margin-top: 12px;
  animation: spotify-sync-fade-in 0.3s ease-out;
}

.modal-warning-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 2px;
}
.track-row.selected {
  background: rgba(255, 255, 255, 0.1) !important;
}

.context-menu-header {
  padding: 10px 14px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 800;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.02);
}
.playlist-sync-force-btn.is-success {
  background: rgba(29, 185, 84, 0.1);
  border-color: rgba(29, 185, 84, 0.3);
  color: #1db954;
  animation: spotify-sync-pop 0.3s ease;
}
.playlist-cover-system.liked-songs {
  width: 100%;
  aspect-ratio: 1 / 1;
  background: linear-gradient(135deg, #450af5, #c4efd9);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 10px rgba(0,0,0,0.2);
}

.playlist-view-hero .playlist-cover-system.liked-songs {
  width: 232px; /* Tamaño estándar de carátula en héroe */
  height: 232px;
  flex-shrink: 0;
  border-radius: 8px;
}
.playlist-cover-system.liked-songs svg {
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}

.track-row-title-container {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.track-heart-btn {
  background: none;
  border: none;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #b3b3b3;
  transition: all 0.2s ease;
  opacity: 0; /* Hidden until hover by default */
}

.track-row:hover .track-heart-btn,
.track-heart-btn.active {
  opacity: 1;
}

.track-heart-btn:hover {
  transform: scale(1.15);
  color: white;
}

.track-heart-btn.active {
  color: #1db954;
}

.track-heart-btn svg {
  transition: fill 0.2s ease, stroke 0.2s ease;
}
.empty-playlist-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.refresh-suggestions-btn {
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
