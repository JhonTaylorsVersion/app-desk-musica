<script lang="ts">
import { defineComponent, provide } from "vue";
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

// Modales
import RoutesManagerModal from "./components/modals/RoutesManagerModal.vue";
import GlobalSearchPopover from "./components/modals/GlobalSearchPopover.vue";
import TrackContextMenu from "./components/modals/TrackContextMenu.vue";
import PlaylistContextMenu from "./components/modals/PlaylistContextMenu.vue";
import DuplicatePlaylistModal from "./components/modals/DuplicatePlaylistModal.vue";
import RenamePlaylistModal from "./components/modals/RenamePlaylistModal.vue";
import DeletePlaylistModal from "./components/modals/DeletePlaylistModal.vue";
import DeleteTrackModal from "./components/modals/DeleteTrackModal.vue";
import SpotifySyncModal from "./components/modals/SpotifySyncModal.vue";
import BootOverlay from "./components/modals/BootOverlay.vue";
import PlaylistAddToast from "./components/modals/PlaylistAddToast.vue";

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
    // Modales
    RoutesManagerModal,
    GlobalSearchPopover,
    TrackContextMenu,
    PlaylistContextMenu,
    DuplicatePlaylistModal,
    RenamePlaylistModal,
    DeletePlaylistModal,
    DeleteTrackModal,
    SpotifySyncModal,
    BootOverlay,
    PlaylistAddToast,
  },
  setup() {
    const logic = useAppLogic();
    provide("appLogic", logic);
    return logic;
  },
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
                        <span class="recent-search-type">Canción</span>
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
                      &times;
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

      <GlobalSearchPopover />

      <RoutesManagerModal />

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
                  @dismiss-session-nuevas="sessionDismissedNuevas[$event] = ''"
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
                      alt="Carátula"
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
                          formatMetadataListValue(metadata?.composer) || "—"
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
              <div class="sad-mic">??</div>
              No hay letra sincronizada ni embebida para esta canción.
            </div>
          </div>
        </div>

        <div v-else class="empty-state glass-panel-inner">
          <div class="empty-icon">??</div>
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

  <TrackContextMenu />
  <PlaylistContextMenu />
  <DuplicatePlaylistModal />
  <RenamePlaylistModal />
  <DeletePlaylistModal />
  <DeleteTrackModal />
  <SpotifySyncModal />
  <PlaylistAddToast />
  <BootOverlay />

  <Toaster
    v-if="currentViewMode !== 'spotiflac'"
    position="top-right"
    expand
    richColors
    closeButton
  />
</template>

<style src="./styles/app.css"></style>
