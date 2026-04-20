<script lang="ts">
import { defineComponent, inject } from "vue";

export default defineComponent({
  name: "GlobalSearchPopover",
  setup() {
    const logic = inject<any>("appLogic");
    return { ...logic };
  },
});
</script>

<template>
  <div
    v-if="isGlobalSearchPopoverVisible"
    class="global-search-popover glass-panel"
  >
    <div class="global-search-popover-content">
      <template v-if="isQuickSearching">
        <div class="global-search-skeletons">
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
            <span>Ingresar b&uacute;squeda</span>
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
                Canci&oacute;n &bull; {{ getLibraryTrackArtist(track) }}
              </div>
            </div>
          </button>
        </div>

        <div
          v-if="!hasQuickSearchResults"
          class="global-search-empty-state"
        >
          No encontr&eacute; coincidencias r&aacute;pidas para "{{
            globalSearch.trim()
          }}".
        </div>
      </template>
    </div>
  </div>
</template>
