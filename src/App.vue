<script lang="ts">
import { defineComponent } from "vue";
import { useAppLogic } from "./useAppLogic";
import SpotiFlacEmbeddedView from "./modules/spotiflac/SpotiFlacEmbeddedView.vue";
import { Toaster } from "vue-sonner";
import AlbumViewHeader from "./components/library/AlbumViewHeader.vue";
import EmptyPlaylistView from "./components/library/EmptyPlaylistView.vue";
import ArtistViewSection from "./components/library/ArtistViewSection.vue";
import LibraryTrackTable from "./components/library/LibraryTrackTable.vue";
import PlaylistViewHeader from "./components/library/PlaylistViewHeader.vue";
import QueuePanel from "./components/library/QueuePanel.vue";
import SearchResultsView from "./components/library/SearchResultsView.vue";

export default defineComponent({
  name: "App",
  components: {
    AlbumViewHeader,
    EmptyPlaylistView,
    ArtistViewSection,
    LibraryTrackTable,
    PlaylistViewHeader,
    QueuePanel,
    SearchResultsView,
    SpotiFlacEmbeddedView,
    Toaster,
  },
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
              aria-label="Limpiar bÃºsqueda global"
              title="Limpiar bÃºsqueda global"
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
                    BÃºsquedas recientes
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
                      aria-label="Quitar de bÃºsquedas recientes"
                      title="Quitar de bÃºsquedas recientes"
                      @click.stop="removeRecentGlobalSearch(item)"
                    >
                      &times;
                    </button>
                  </div>

                  <div
                    v-if="recentGlobalSearches.length === 0"
                    class="global-search-empty-state"
                  >
                    Tus bÃºsquedas recientes aparecerÃ¡n aquÃ­.
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
                        &uarr;
                      </button>
                      <button
                        class="global-search-nav-btn"
                        type="button"
                        aria-label="Navegar abajo"
                      >
                        &darr;
                      </button>
                      <span class="global-search-nav-label">Navegar</span>
                    </div>

                    <div class="global-search-actions">
                      <div class="global-search-kbd-hint">
                        <span class="topbar-shortcut-key">&crarr;</span>
                        <span>Ingresar bÃºsqueda</span>
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
                      <span class="global-search-suggestion-icon">&#8989;</span>
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
                    No encontrÃ© coincidencias rÃ¡pidas para "{{
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
            <div class="global-search-section-title">BÃºsquedas recientes</div>

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
              <div v-else class="global-search-thumb placeholder">&#9835;</div>

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
              Tus bÃºsquedas recientes aparecerÃ¡n aquÃ­.
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
                <span class="topbar-shortcut-key">&crarr;</span>
                <span>Ingresar bÃºsqueda</span>
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
                <span class="global-search-suggestion-icon">&#8989;</span>
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
                <div v-else class="global-search-thumb placeholder">
                  &#9835;
                </div>

                <div class="global-search-meta">
                  <div class="global-search-item-title">
                    {{ getTrackDisplayTitle(track) }}
                  </div>
                  <div class="global-search-item-subtitle">
                    CanciÃ³n &bull; {{ getLibraryTrackArtist(track) }}
                  </div>
                </div>
              </button>
            </div>

            <div
              v-if="!hasQuickSearchResults"
              class="global-search-empty-state"
            >
              No encontrÃ© coincidencias rÃ¡pidas para "{{
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
              @click="anadirRutaMusica"
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

          <!-- SECCIÃ“N DE GESTIÃ“N DE ACTIVOS -->
          <div class="asset-manager-section">
            <div class="panel-divider"></div>
            <div class="asset-manager-header">
              <div class="panel-title">Almacenamiento de Activos</div>
              <div class="panel-subtitle">
                Elige dÃ³nde buscar letras, canvas y carÃ¡tulas
              </div>
            </div>

            <div class="asset-mode-selector glass-panel-inner">
              <button
                class="mode-toggle-btn"
                :class="{ active: assetStorageMode === 'unified' }"
                type="button"
                @click="assetStorageMode = 'unified'"
              >
                Unificado
                <span class="mode-desc">Junto a la mÃºsica</span>
              </button>
              <button
                class="mode-toggle-btn"
                :class="{ active: assetStorageMode === 'custom' }"
                type="button"
                @click="assetStorageMode = 'custom'"
              >
                Personalizado
                <span class="mode-desc">Carpetas especÃ­ficas</span>
              </button>
            </div>

            <div v-if="assetStorageMode === 'custom'" class="custom-paths-list">
              <div class="custom-path-item glass-panel-inner">
                <div class="path-info">
                  <div class="path-label">Carpeta de Canvas (.mp4)</div>
                  <div class="path-value">
                    {{ customCanvasPath || "Predeterminada" }}
                  </div>
                </div>
                <button
                  class="small-action-btn"
                  type="button"
                  @click="selectCustomCanvasPath"
                >
                  Cambiar
                </button>
              </div>

              <div class="custom-path-item glass-panel-inner">
                <div class="path-info">
                  <div class="path-label">Carpeta de Letras (.lrc)</div>
                  <div class="path-value">
                    {{ customLyricsPath || "Predeterminada" }}
                  </div>
                </div>
                <button
                  class="small-action-btn"
                  type="button"
                  @click="selectCustomLyricsPath"
                >
                  Cambiar
                </button>
              </div>

              <div class="custom-path-item glass-panel-inner">
                <div class="path-info">
                  <div class="path-label">Carpeta de CarÃ¡tulas</div>
                  <div class="path-value">
                    {{ customCoversPath || "Predeterminada" }}
                  </div>
                </div>
                <button
                  class="small-action-btn"
                  type="button"
                  @click="selectCustomCoversPath"
                >
                  Cambiar
                </button>
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
                Ãlbumes
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
                    <svg
                      viewBox="0 0 24 24"
                      width="24"
                      height="24"
                      fill="white"
                    >
                      <path
                        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                      />
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
                        &#9835;
                      </div>
                    </div>
                  </div>
                  <img v-else-if="item.cover" :src="item.cover" alt="" />
                  <div v-else class="left-library-item-placeholder">
                    {{
                      item.kind === "playlist"
                        ? "&#9835;"
                        : item.kind === "album"
                          ? "??"
                          : "?"
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
                  No encontrÃ© resultados
                </div>
                <div class="left-library-empty-copy">
                  Prueba con otro filtro o crea una playlist nueva.
                </div>
              </div>
            </div>
          </aside>

          <div class="library-panel glass-panel-inner">
            <template v-if="currentViewMode === 'spotiflac'">
              <SpotiFlacEmbeddedView />
            </template>

            <template v-else-if="isSearchViewActive">
              <SearchResultsView
                :committed-global-search="committedGlobalSearch"
                :committed-search-albums="committedSearchAlbums"
                :committed-search-artists="committedSearchArtists"
                :committed-search-top-result="committedSearchTopResult"
                :committed-search-tracks="committedSearchTracks"
                :get-library-track-artist="getLibraryTrackArtist"
                :get-library-track-cover="getLibraryTrackCover"
                :get-library-track-duration="getLibraryTrackDuration"
                :get-track-display-title="getTrackDisplayTitle"
                :go-to-album="goToAlbum"
                :go-to-artist="goToArtist"
                :is-search-album-playing="isSearchAlbumPlaying"
                :is-search-artist-playing="isSearchArtistPlaying"
                :is-search-track-playing="isSearchTrackPlaying"
                :play-album-result="playAlbumResult"
                :play-artist="playArtist"
                :play-track-from-library="playTrackFromLibrary"
                :toggle-or-play-search-track="toggleOrPlaySearchTrack"
              />
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
                    AÃ±adir visibles a la fila
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
                    &times;
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
                        &#9835;
                      </div>
                    </div>
                  </div>
                  <div v-else class="playlist-hero-placeholder">&#9835;</div>
                </div>

                <div class="playlist-hero-copy">
                  <span class="playlist-hero-type">Playlist</span>
                  <h1 class="playlist-hero-title">
                    {{ activePlaylistSafe.name }}
                  </h1>
                  <div class="playlist-hero-meta">
                    {{ activePlaylist.trackCount }} canciones &bull;
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
                    AÃ±adir a la fila
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
                <PlaylistViewHeader
                  :active-playlist="activePlaylist"
                  :active-playlist-context-menu-target="
                    activePlaylistContextMenuTarget
                  "
                  :active-playlist-cover-tiles="activePlaylistCoverTiles"
                  :active-playlist-duration-formatted="
                    activePlaylistDurationFormatted
                  "
                  :active-playlist-safe="activePlaylistSafe"
                  :active-playlist-sync="activePlaylistSync"
                  :add-playlist-to-queue="addPlaylistToQueue"
                  :current-view-mode="currentViewMode"
                  :is-active-playlist-empty="isActivePlaylistEmpty"
                  :is-active-playlist-playing="isActivePlaylistPlaying"
                  :is-manual-syncing="isManualSyncing"
                  :is-spotify-ordering="isSpotifyOrdering"
                  :is-sync-success="isSyncSuccess"
                  :library-search="librarySearch"
                  :library-search-input-ref="librarySearchInputRef"
                  :library-search-placeholder="librarySearchPlaceholder"
                  :manual-force-sync="manualForceSync"
                  :open-empty-playlist-discovery="openEmptyPlaylistDiscovery"
                  :open-playlist-context-menu="openPlaylistContextMenu"
                  :open-playlist-context-menu-from-button="
                    openPlaylistContextMenuFromButton
                  "
                  :order-playlist-from-spotify="orderPlaylistFromSpotify"
                  :play-playlist-by-id="playPlaylistById"
                  @dismiss-session-bajas="sessionDismissedBajas[$event] = ''"
                  @dismiss-session-nuevas="
                    sessionDismissedNuevas[$event] = ''
                  "
                  @update:library-search="librarySearch = $event"
                />

                <AlbumViewHeader
                  :active-album-artist="activeAlbumArtist"
                  :active-album-cover="activeAlbumCover"
                  :active-album-duration-formatted="
                    activeAlbumDurationFormatted
                  "
                  :active-album-tracks="activeAlbumTracks"
                  :active-album-view="activeAlbumView"
                  :active-album-year="activeAlbumYear"
                  :album-hero-ref="albumHeroRef"
                  :compact-album-bar-style="compactAlbumBarStyle"
                  :compact-album-bar-visible="compactAlbumBarVisible"
                  :current-view-mode="currentViewMode"
                  :go-to-artist="goToArtist"
                  :is-active-album-playing="isActiveAlbumPlaying"
                  :library-search="librarySearch"
                  :library-search-input-ref="librarySearchInputRef"
                  :library-search-placeholder="librarySearchPlaceholder"
                  :play-album="playAlbum"
                  :split-artists="splitArtists"
                  @update:library-search="librarySearch = $event"
                />

                <EmptyPlaylistView
                  :active-playlist="activePlaylist"
                  :add-track-to-active-playlist="addTrackToActivePlaylist"
                  :close-empty-playlist-discovery="closeEmptyPlaylistDiscovery"
                  :current-view-mode="currentViewMode"
                  :empty-playlist-search="emptyPlaylistSearch"
                  :empty-playlist-search-input-ref="emptyPlaylistSearchInputRef"
                  :empty-playlist-search-results="emptyPlaylistSearchResults"
                  :get-library-track-album="getLibraryTrackAlbum"
                  :get-library-track-artist="getLibraryTrackArtist"
                  :get-library-track-cover="getLibraryTrackCover"
                  :get-track-display-title="getTrackDisplayTitle"
                  :is-active-playlist-empty="isActivePlaylistEmpty"
                  :is-empty-playlist-discovery-visible="
                    isEmptyPlaylistDiscoveryVisible
                  "
                  :open-empty-playlist-discovery="openEmptyPlaylistDiscovery"
                  :open-playlist-context-menu-from-button="
                    openPlaylistContextMenuFromButton
                  "
                  :playlist="playlist"
                  :refresh-playlist-recommendations="
                    refreshPlaylistRecommendations
                  "
                  @update:empty-playlist-search="emptyPlaylistSearch = $event"
                />

                <ArtistViewSection
                  :active-artist-albums="activeArtistAlbums"
                  :active-artist-view="activeArtistView"
                  :current-view-mode="currentViewMode"
                  :go-to-album="goToAlbum"
                />

                <LibraryTrackTable
                  :compact-album-bar-visible="compactAlbumBarVisible"
                  :current-view-mode="currentViewMode"
                  :displayed-tracks="displayedTracks"
                  :get-album-artist-for-track="getAlbumArtistForTrack"
                  :get-library-track-album="getLibraryTrackAlbum"
                  :get-library-track-artist="getLibraryTrackArtist"
                  :get-library-track-cover="getLibraryTrackCover"
                  :get-library-track-duration="getLibraryTrackDuration"
                  :get-library-track-metadata="getLibraryTrackMetadata"
                  :get-track-display-title="getTrackDisplayTitle"
                  :go-to-album="goToAlbum"
                  :go-to-artist="goToArtist"
                  :handle-track-pointer-down="handleTrackPointerDown"
                  :hovered-library-track-path="hoveredLibraryTrackPath"
                  :is-active-playlist-empty="isActivePlaylistEmpty"
                  :is-library-track-active="isLibraryTrackActive"
                  :is-library-track-current="isLibraryTrackCurrent"
                  :is-library-track-hovered="isLibraryTrackHovered"
                  :is-library-track-selected="isLibraryTrackSelected"
                  :is-liked="isLiked"
                  :is-playing="isPlaying"
                  :liked-songs-playlist="likedSongsPlaylist"
                  :open-library-track-context-menu="openLibraryTrackContextMenu"
                  :play-track-from-library="playTrackFromLibrary"
                  :should-show-library-equalizer="shouldShowLibraryEqualizer"
                  :should-show-library-index-number="
                    shouldShowLibraryIndexNumber
                  "
                  :should-show-library-pause-icon="shouldShowLibraryPauseIcon"
                  :should-show-library-play-icon="shouldShowLibraryPlayIcon"
                  :split-artists="splitArtists"
                  :toggle-library-track-playback="toggleLibraryTrackPlayback"
                  :toggle-track-like="toggleTrackLike"
                  @update:hovered-library-track-path="
                    hoveredLibraryTrackPath = $event
                  "
                />
              </div>
            </template>
          </div>

          <div v-if="currentViewMode !== 'spotiflac'" class="right-sidebar">
            <QueuePanel
              v-if="isQueuePanelOpen"
              :clear-queue="clearQueue"
              :filtered-queue-with-index="filteredQueueWithIndex"
              :get-library-track-artist="getLibraryTrackArtist"
              :get-library-track-cover="getLibraryTrackCover"
              :get-track-display-title="getTrackDisplayTitle"
              :go-to-artist="goToArtist"
              :hovered-queue-track-id="hoveredQueueTrackId"
              :is-queue-panel-open="isQueuePanelOpen"
              :is-queue-track-active="isQueueTrackActive"
              :open-track-context-menu="openTrackContextMenu"
              :play-track-from-queue="playTrackFromQueue"
              :queue="queue"
              :split-artists="splitArtists"
              @update:hovered-queue-track-id="hoveredQueueTrackId = $event"
            />

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
                      alt="CarÃ¡tula"
                      class="cover-image glass-shadow"
                    />
                  </template>
                  <template v-else>
                    <div class="cover-placeholder glass-shadow">&#9835;</div>
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
                        <span class="meta-label">TÃ­tulo</span>
                        <span class="meta-value">{{
                          metadata?.title || "â€”"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Artista</span>
                        <span class="meta-value">{{
                          metadata?.artist || "â€”"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Ãlbum</span>
                        <span class="meta-value">{{
                          metadata?.album || "â€”"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Artista del Ã¡lbum</span>
                        <span class="meta-value">{{
                          metadata?.album_artist || "â€”"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">GÃ©nero</span>
                        <span class="meta-value">{{
                          metadata?.genre || "â€”"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Compositor</span>
                        <span class="meta-value">{{
                          formatMetadataListValue(metadata?.composer) || "â€”"
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
                        <span class="meta-label">AÃ±o</span>
                        <span class="meta-value">{{
                          metadata?.year || "â€”"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">DuraciÃ³n</span>
                        <span class="meta-value">{{
                          metadata?.duration_formatted || formatTime(duration)
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Bitrate</span>
                        <span class="meta-value">{{
                          metadata?.audio_bitrate
                            ? `${metadata.audio_bitrate} kbps`
                            : "â€”"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Formato</span>
                        <span class="meta-value uppercase">{{
                          fileExtension || "â€”"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Sample rate</span>
                        <span class="meta-value">{{
                          metadata?.sample_rate
                            ? `${metadata.sample_rate} Hz`
                            : "â€”"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Bit depth</span>
                        <span class="meta-value">{{
                          metadata?.bit_depth
                            ? `${metadata.bit_depth} bits`
                            : "â€”"
                        }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="meta-label">Canales</span>
                        <span class="meta-value">{{
                          metadata?.channels || "â€”"
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
              <div class="sad-mic">??</div>
              No hay letra sincronizada ni embebida para esta canciÃ³n.
            </div>
          </div>
        </div>

        <div v-else class="empty-state glass-panel-inner">
          <div class="empty-icon">??</div>
          <div class="empty-title">Tu mÃºsica, a tu manera</div>
          <div class="empty-subtitle">
            AÃ±ade una o varias carpetas para ver toda tu biblioteca, buscar y
            crear tu fila de reproducciÃ³n.
          </div>
        </div>
      </div>
      <div v-if="filePath" class="spotify-bottom-player glass-panel-inner">
        <div class="sbp-left">
          <img v-if="coverUrl" :src="coverUrl" class="sbp-cover" />
          <div v-else class="sbp-cover-placeholder">&#9835;</div>
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
              <span>Reproduciendo a travÃ©s de</span>
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
    <!-- Acciones para selecciÃ³n mÃºltiple -->
    <template v-if="multiSelectedLibraryTracks.length > 1">
      <div class="context-menu-header">
        SelecciÃ³n de {{ multiSelectedLibraryTracks.length }} canciones
      </div>
      <button
        class="context-menu-item"
        type="button"
        @click="addSelectionToQueue"
      >
        Agregar selecciÃ³n a la fila
      </button>
      <button
        class="context-menu-item with-chevron"
        type="button"
        @click="toggleContextMenuPlaylistPicker"
      >
        Agregar selecciÃ³n a una playlist
      </button>
      <button
        v-if="contextMenuCanRemoveFromPlaylist && contextMenuActivePlaylist"
        class="context-menu-item"
        type="button"
        @click="removeContextMenuTrackFromPlaylist()"
      >
        Eliminar selecciÃ³n de {{ contextMenuActivePlaylist.name }}
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
        Agregar a la fila de reproducciÃ³n
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
      Ir al Ã¡lbum
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
          Esta canciÃ³n ya estÃ¡ en tu playlist "{{
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
        <h2>Â¿Quieres eliminar este elemento de Tu biblioteca?</h2>
        <p>Se eliminara {{ playlistPendingDeletion.name }} de Tu biblioteca.</p>
      </div>

      <div class="playlist-modal-actions delete-playlist-actions-wrap">
        <div class="delete-files-option">
          <label class="delete-files-checkbox">
            <input type="checkbox" v-model="deletePlaylistWithFiles" />
            <span class="checkbox-custom"></span>
            <span class="checkbox-label"
              >Eliminar la playlist
              <strong>{{ playlistPendingDeletion.name }}</strong> y sus
              canciones fÃ­sicamente de tu PC</span
            >
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
              Solo se borrarÃ¡n los archivos fÃ­sicos de esta playlist. Si una
              canciÃ³n estÃ¡ en otra lista de reproducciÃ³n, permanecerÃ¡ guardada
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
            {{ deletePlaylistWithFiles ? "Eliminar todo" : "Eliminar" }}
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
          {{
            trackPendingDeletion.count && trackPendingDeletion.count > 1
              ? `Â¿Quitar estas ${trackPendingDeletion.count} canciones?`
              : "Â¿Quitar esta canciÃ³n de la playlist?"
          }}
        </h2>
        <p
          v-if="!trackPendingDeletion.count || trackPendingDeletion.count === 1"
        >
          Se quitarÃ¡
          <strong>{{
            getTrackDisplayTitle(trackPendingDeletion.track)
          }}</strong>
          de <strong>{{ trackPendingDeletion.playlistName }}</strong
          >.
        </p>
        <p v-else>
          Se quitarÃ¡n
          <strong>{{ trackPendingDeletion.count }} canciones</strong> de
          <strong>{{ trackPendingDeletion.playlistName }}</strong
          >.
        </p>
      </div>

      <div class="playlist-modal-actions delete-playlist-actions-wrap">
        <div v-if="trackPendingDeletion.isPhysical" class="delete-files-option">
          <label class="delete-files-checkbox">
            <input type="checkbox" v-model="deleteTrackWithFiles" />
            <span class="checkbox-custom"></span>
            <span class="checkbox-label">
              {{
                trackPendingDeletion.count && trackPendingDeletion.count > 1
                  ? "Eliminar tambiÃ©n los archivos fÃ­sicos del PC"
                  : "Eliminar tambiÃ©n el archivo fÃ­sico del PC"
              }}
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
              {{
                trackPendingDeletion.count && trackPendingDeletion.count > 1
                  ? "Los archivos se eliminarÃ¡n fÃ­sicamente solo de la carpeta de la playlist"
                  : "El archivo se eliminarÃ¡ fÃ­sicamente solo de la carpeta de la playlist"
              }}
              <strong>{{ trackPendingDeletion.playlistName }}</strong
              >. Otras copias en tu PC no se verÃ¡n afectadas.
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

  <!-- Modal de SincronizaciÃ³n de Spotify (Premium Redesign) -->
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
              <path
                fill="#1ed760"
                d="M248 8C111.1 8 0 119.1 0 256s111.1 248 248 248 248-111.1 248-248S384.9 8 248 8Z"
              />
              <path
                d="M406.6 231.1c-5.2 0-8.4-1.3-12.9-3.9-71.2-42.5-198.5-52.7-280.9-29.7-3.6 1-8.1 2.6-12.9 2.6-13.2 0-23.3-10.3-23.3-23.6 0-13.6 8.4-21.3 17.4-23.9 35.2-10.3 74.6-15.2 117.5-15.2 73 0 149.5 15.2 205.4 47.8 7.8 4.5 12.9 10.7 12.9 22.6 0 13.6-11 23.3-23.3 23.3zm-31 76.2c-5.2 0-8.7-2.3-12.3-4.2-62.5-37-155.7-51.9-238.6-29.4-4.8 1.3-7.4 2.6-11.9 2.6-10.7 0-19.4-8.7-19.4-19.4s5.2-17.8 15.5-20.7c27.8-7.8 56.2-13.6 97.8-13.6 64.9 0 127.6 16.1 177 45.5 8.1 4.8 11.3 11 11.3 19.7-.1 10.8-8.5 19.5-19.4 19.5zm-26.9 65.6c-4.2 0-6.8-1.3-10.7-3.6-62.4-37.6-135-39.2-206.7-24.5-3.9 1-9 2.6-11.9 2.6-9.7 0-15.8-7.7-15.8-15.8 0-10.3 6.1-15.2 13.6-16.8 81.9-18.1 165.6-16.5 237 26.2 6.1 3.9 9.7 7.4 9.7 16.5s-7.1 15.4-15.2 15.4z"
              />
            </svg>
          </div>
          <h2 v-if="!isSyncSuccess">
            {{
              pendingSpotifySyncs[0].isScanning
                ? "Sincronizando..."
                : "SincronizaciÃ³n de Spotify"
            }}
          </h2>
          <h2 v-else>Â¡Todo listo!</h2>
        </div>

        <div v-if="isSyncSuccess" class="spotify-sync-success-view">
          <div class="spotify-sync-success-icon">
            <svg viewBox="0 0 24 24" width="80" height="80" fill="#1db954">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
              />
            </svg>
          </div>
          <p>SincronizaciÃ³n completada con Ã©xito</p>
        </div>

        <div v-else class="spotify-sync-sections">
          <!-- Columna Izquierda: NUEVAS -->
          <div
            v-if="
              pendingSpotifySyncs[0].newTracks.length > 0 &&
              sessionDismissedNuevas[pendingSpotifySyncs[0].playlistId] !==
                pendingSpotifySyncs[0].newTracks
                  .map((t) => t.id)
                  .sort()
                  .join(',')
            "
            class="spotify-sync-column"
          >
            <div class="spotify-sync-column-header">
              <h3 class="spotify-sync-section-title">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="currentColor"
                  style="vertical-align: middle; margin-right: 6px"
                >
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                Nuevas canciones
              </h3>
              <p class="spotify-sync-column-subtitle">
                Detectamos
                <strong>{{ pendingSpotifySyncs[0].newTracks.length }}</strong>
                novedades.
                <button
                  v-if="
                    (!isManualSyncing ||
                      pendingSpotifySyncs[0].isDeepMode !== undefined) &&
                    !pendingSpotifySyncs[0].isForcedFromUpToDate
                  "
                  class="spotify-sync-deep-scan-link"
                  type="button"
                  :disabled="pendingSpotifySyncs[0].isScanning"
                  @click="
                    manualForceSync(
                      pendingSpotifySyncs[0].playlistId,
                      !pendingSpotifySyncs[0].isDeepMode,
                    )
                  "
                >
                  {{
                    pendingSpotifySyncs[0].isDeepMode
                      ? "(Ver solo las nuevas)"
                      : "(Ver todas las faltantes)"
                  }}
                </button>
              </p>
              <div
                v-if="activePendingSpotifySync?.newTracks.length > 1"
                class="spotify-sync-bulk-actions"
              >
                <button
                  v-if="!areAllNewTracksSelected(activePendingNewTrackIds)"
                  type="button"
                  class="spotify-sync-bulk-link"
                  :disabled="isBulkSelectingNewTracks"
                  @click="
                    setAllNewTracksSelection(activePendingNewTrackIds, true)
                  "
                >
                  {{
                    isBulkSelectingNewTracks ? "Procesando..." : "Marcar todas"
                  }}
                </button>
                <button
                  v-else
                  type="button"
                  class="spotify-sync-bulk-link"
                  :disabled="isBulkSelectingNewTracks"
                  @click="
                    setAllNewTracksSelection(activePendingNewTrackIds, false)
                  "
                >
                  {{
                    isBulkSelectingNewTracks
                      ? "Procesando..."
                      : "Desmarcar todas"
                  }}
                </button>
              </div>
            </div>

            <div
              ref="syncNewTracksListRef"
              class="spotify-sync-track-list"
              @scroll="onSyncNewTracksScroll"
            >
              <div
                v-if="virtualNewTracksWindow.topPadding > 0"
                class="spotify-sync-virtual-spacer"
                :style="{ height: `${virtualNewTracksWindow.topPadding}px` }"
              ></div>
              <div
                v-for="item in virtualNewTracksWindow.items"
                :key="item.track.id"
                class="spotify-sync-track-item selectable"
                :class="{
                  selected: isNewTrackSelected(item.track.id),
                }"
                @click="toggleNewTrackSelection(item.track.id)"
              >
                <div
                  v-if="pendingSpotifySyncs[0].newTracks.length > 1"
                  class="spotify-sync-checkbox"
                >
                  <div
                    class="checkbox-inner"
                    :class="{
                      active: isNewTrackSelected(item.track.id),
                      success: true,
                    }"
                  >
                    <svg
                      v-if="isNewTrackSelected(item.track.id)"
                      viewBox="0 0 24 24"
                      width="10"
                      height="10"
                      fill="currentColor"
                    >
                      <path
                        d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"
                      />
                    </svg>
                  </div>
                </div>
                <div class="spotify-sync-track-cover-mini">
                  <img v-if="item.track.cover" :src="item.track.cover" alt="" />
                  <div v-else class="spotify-sync-track-placeholder">
                    &#9835;
                  </div>
                </div>
                <div
                  class="spotify-sync-track-info"
                  style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                  "
                >
                  <div style="flex: 1; min-width: 0">
                    <div class="spotify-sync-track-title">
                      {{ item.track.title }}
                    </div>
                    <div class="spotify-sync-track-artist">
                      {{ item.track.artists }}
                    </div>
                  </div>
                  <!-- Estado de la descarga en la fila -->
                  <div
                    v-if="
                      item.track.status === 'downloading' ||
                      item.track.status === 'finishing' ||
                      item.track.status === 'waiting'
                    "
                    class="spotify-sync-track-status downloading"
                  >
                    <div class="spotify-sync-spinner-mini"></div>
                    <span>{{
                      item.track.status === "waiting"
                        ? "En cola..."
                        : "Bajando..."
                    }}</span>
                  </div>
                  <div
                    v-else-if="item.track.status"
                    class="spotify-sync-track-status"
                    :class="item.track.status"
                  >
                    <span v-if="item.track.status === 'done'">Listo</span>
                    <span v-if="item.track.status === 'error'">Error</span>
                  </div>
                </div>
              </div>
              <div
                v-if="virtualNewTracksWindow.bottomPadding > 0"
                class="spotify-sync-virtual-spacer"
                :style="{ height: `${virtualNewTracksWindow.bottomPadding}px` }"
              ></div>
            </div>

            <div class="spotify-sync-column-footer">
              <div class="sync-actions-group">
                <button
                  class="spotify-sync-btn ghost mini"
                  type="button"
                  @click="
                    sessionDismissedNuevas[pendingSpotifySyncs[0].playlistId] =
                      pendingSpotifySyncs[0].newTracks
                        .map((t) => t.id)
                        .sort()
                        .join(',')
                  "
                  title="Recordar luego"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="currentColor"
                  >
                    <path
                      d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h2v5.2l4.5 2.7-.7.3z"
                    />
                  </svg>
                </button>
                <button
                  class="spotify-sync-btn ghost mini"
                  type="button"
                  @click="
                    ignoreNewTracksSync(
                      pendingSpotifySyncs[0].playlistId,
                      pendingSpotifySyncs[0].newTracks,
                    )
                  "
                  title="Ignorar permanentemente"
                >
                  No mostrar
                </button>
              </div>
              <button
                class="spotify-sync-btn primary mini"
                type="button"
                :disabled="
                  isSyncDownloading || pendingSpotifySyncs[0].isScanning
                "
                @click="
                  applyNewTracksSync(
                    pendingSpotifySyncs[0].playlistId,
                    pendingSpotifySyncs[0].newTracks,
                    pendingSpotifySyncs[0].remoteIds || [],
                  )
                "
              >
                <template v-if="isSyncDownloading">
                  <div
                    class="spotify-sync-spinner-mini white"
                    style="margin-right: 10px"
                  ></div>
                  Descargando ({{ selectedNewTracks.length }})
                </template>
                <template v-else-if="pendingSpotifySyncs[0].isScanning">
                  <div
                    class="spotify-sync-spinner-mini white"
                    style="margin-right: 10px"
                  ></div>
                  Escaneando...
                </template>
                <template v-else>
                  Descargar ({{ selectedNewTracks.length }})
                </template>
              </button>
            </div>
          </div>

          <!-- Columna Derecha: ELIMINADAS -->
          <div
            v-if="
              pendingSpotifySyncs[0].removedTracks.length > 0 &&
              sessionDismissedBajas[pendingSpotifySyncs[0].playlistId] !==
                pendingSpotifySyncs[0].removedTracks
                  .map((t) => t.path)
                  .sort()
                  .join(',')
            "
            class="spotify-sync-column"
          >
            <div class="spotify-sync-column-header">
              <h3 class="spotify-sync-section-title danger">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="currentColor"
                  style="vertical-align: middle; margin-right: 6px"
                >
                  <path
                    d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  />
                </svg>
                Eliminadas en Spotify
              </h3>
              <p class="spotify-sync-column-subtitle">
                Hay
                <strong>{{
                  pendingSpotifySyncs[0].removedTracks.length
                }}</strong>
                bajas en el origen.
              </p>
              <div
                v-if="activePendingSpotifySync?.removedTracks.length > 1"
                class="spotify-sync-bulk-actions"
              >
                <button
                  v-if="
                    !areAllRemovedTracksSelected(activePendingRemovedTrackPaths)
                  "
                  type="button"
                  class="spotify-sync-bulk-link"
                  :disabled="isBulkSelectingRemovedTracks"
                  @click="
                    setAllRemovedTracksSelection(
                      activePendingRemovedTrackPaths,
                      true,
                    )
                  "
                >
                  {{
                    isBulkSelectingRemovedTracks
                      ? "Procesando..."
                      : "Marcar todas"
                  }}
                </button>
                <button
                  v-else
                  type="button"
                  class="spotify-sync-bulk-link"
                  :disabled="isBulkSelectingRemovedTracks"
                  @click="
                    setAllRemovedTracksSelection(
                      activePendingRemovedTrackPaths,
                      false,
                    )
                  "
                >
                  {{
                    isBulkSelectingRemovedTracks
                      ? "Procesando..."
                      : "Desmarcar todas"
                  }}
                </button>
              </div>
            </div>

            <div
              ref="syncRemovedTracksListRef"
              class="spotify-sync-track-list"
              @scroll="onSyncRemovedTracksScroll"
            >
              <div
                v-if="virtualRemovedTracksWindow.topPadding > 0"
                class="spotify-sync-virtual-spacer"
                :style="{
                  height: `${virtualRemovedTracksWindow.topPadding}px`,
                }"
              ></div>
              <div
                v-for="item in virtualRemovedTracksWindow.items"
                :key="item.track.id"
                class="spotify-sync-track-item selectable"
                :class="{
                  selected: isRemovedTrackSelected(item.track.path),
                }"
                @click="toggleRemovedTrackSelection(item.track.path)"
              >
                <div
                  v-if="pendingSpotifySyncs[0].removedTracks.length > 1"
                  class="spotify-sync-checkbox"
                >
                  <div
                    class="checkbox-inner"
                    :class="{
                      active: isRemovedTrackSelected(item.track.path),
                    }"
                  >
                    <svg
                      v-if="isRemovedTrackSelected(item.track.path)"
                      viewBox="0 0 24 24"
                      width="10"
                      height="10"
                      fill="currentColor"
                    >
                      <path
                        d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"
                      />
                    </svg>
                  </div>
                </div>
                <div class="spotify-sync-track-cover-mini">
                  <img v-if="item.track.cover" :src="item.track.cover" alt="" />
                  <div v-else class="spotify-sync-track-placeholder">
                    &#9835;
                  </div>
                </div>
                <div class="spotify-sync-track-info">
                  <div class="spotify-sync-track-title">
                    {{ item.track.title }}
                  </div>
                  <div class="spotify-sync-track-artist">
                    {{ item.track.artists }}
                  </div>
                </div>
              </div>
              <div
                v-if="virtualRemovedTracksWindow.bottomPadding > 0"
                class="spotify-sync-virtual-spacer"
                :style="{
                  height: `${virtualRemovedTracksWindow.bottomPadding}px`,
                }"
              ></div>
            </div>

            <div
              class="spotify-sync-column-footer"
              style="flex-direction: column; align-items: stretch; gap: 12px"
            >
              <!-- Nueva opciÃ³n de borrado inteligente -->
              <div
                v-if="selectedRemovedTracks.length > 0"
                class="delete-files-option sync-mini"
                style="
                  margin: 0;
                  padding: 10px;
                  background: rgba(255, 77, 77, 0.05);
                  border-radius: 12px;
                  border: 1px solid rgba(255, 77, 77, 0.1);
                "
              >
                <label
                  class="delete-files-checkbox"
                  style="gap: 10px; cursor: pointer"
                >
                  <input type="checkbox" v-model="deleteSyncTracksWithFiles" />
                  <span class="checkbox-custom"></span>
                  <span
                    class="checkbox-label"
                    style="
                      font-size: 13px;
                      color: rgba(255, 255, 255, 0.7);
                      line-height: 1.4;
                    "
                  >
                    Eliminar tambiÃ©n archivos fÃ­sicos si pertenecen a esta
                    carpeta
                  </span>
                </label>
              </div>

              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  width: 100%;
                "
              >
                <div class="sync-actions-group">
                  <button
                    class="spotify-sync-btn ghost mini"
                    type="button"
                    @click="
                      sessionDismissedBajas[pendingSpotifySyncs[0].playlistId] =
                        pendingSpotifySyncs[0].removedTracks
                          .map((t) => t.path)
                          .sort()
                          .join(',')
                    "
                    title="Recordar luego"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="currentColor"
                    >
                      <path
                        d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h2v5.2l4.5 2.7-.7.3z"
                      />
                    </svg>
                  </button>
                  <button
                    class="spotify-sync-btn ghost mini"
                    type="button"
                    @click="
                      ignoreRemovedTracksSync(
                        pendingSpotifySyncs[0].playlistId,
                        selectedRemovedTracks,
                      )
                    "
                    title="Ignorar permanentemente"
                  >
                    Mantener
                  </button>
                </div>
                <button
                  class="spotify-sync-btn danger mini"
                  type="button"
                  :disabled="selectedRemovedTracks.length === 0"
                  @click="
                    applyRemovedTracksSync(
                      pendingSpotifySyncs[0].playlistId,
                      selectedRemovedTracks,
                      pendingSpotifySyncs[0].remoteIds || [],
                    )
                  "
                >
                  Quitar ({{ selectedRemovedTracks.length }})
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Cierre automÃƒÂ¡tico si ambos estados coinciden con los descartados -->
        <div
          v-if="
            (pendingSpotifySyncs[0].newTracks.length === 0 ||
              sessionDismissedNuevas[pendingSpotifySyncs[0].playlistId] ===
                pendingSpotifySyncs[0].newTracks
                  .map((t) => t.id)
                  .sort()
                  .join(',')) &&
            (pendingSpotifySyncs[0].removedTracks.length === 0 ||
              sessionDismissedBajas[pendingSpotifySyncs[0].playlistId] ===
                pendingSpotifySyncs[0].removedTracks
                  .map((t) => t.path)
                  .sort()
                  .join(','))
          "
          v-show="false"
        >
          {{
            discardSpotifySync(
              pendingSpotifySyncs[0].playlistId,
              pendingSpotifySyncs[0],
            )
          }}
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
        <div v-else class="playlist-add-toast-cover placeholder">&#9835;</div>
      </div>
      <div class="playlist-add-toast-copy">
        <div class="playlist-add-toast-title">
          Se agregÃ³ a {{ playlistAddToast.playlistName }}
        </div>
        <div class="playlist-add-toast-subtitle">
          {{ playlistAddToast.trackTitle }} Â· {{ playlistAddToast.artist }}
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
          <h2>Preparando tu mÃºsica</h2>
          <p>
            Cargando biblioteca, recuperando sesiÃ³n y conectando la salida de
            audio.
          </p>
        </div>
      </div>
    </div>
  </transition>

  <Toaster
    v-if="currentViewMode !== 'spotiflac'"
    position="top-right"
    expand
    richColors
    closeButton
  />
</template>

<style src="./styles/app.css"></style>
