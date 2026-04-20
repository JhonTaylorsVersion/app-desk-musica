<script lang="ts">
import { defineComponent, inject, ref } from "vue";

export default defineComponent({
  name: "TrackContextMenu",
  setup() {
    const logic = inject<any>("appLogic");
    return { ...logic };
  },
});
</script>

<template>
  <div
    v-if="contextMenu.visible"
    class="track-context-menu"
    :style="contextMenuStyle"
    @click.stop
  >
    <!-- Acciones para selecci&oacute;n m&uacute;ltiple -->
    <template v-if="multiSelectedLibraryTracks.length > 1">
      <div class="context-menu-header">
        Selecci&oacute;n de {{ multiSelectedLibraryTracks.length }} canciones
      </div>
      <button
        class="context-menu-item"
        type="button"
        @click="addSelectionToQueue"
      >
        Agregar selecci&oacute;n a la fila
      </button>
      <button
        class="context-menu-item with-chevron"
        type="button"
        @click="toggleContextMenuPlaylistPicker"
      >
        Agregar selecci&oacute;n a una playlist
      </button>
      <button
        v-if="contextMenuCanRemoveFromPlaylist && contextMenuActivePlaylist"
        class="context-menu-item"
        type="button"
        @click="removeContextMenuTrackFromPlaylist()"
      >
        Eliminar selecci&oacute;n de {{ contextMenuActivePlaylist.name }}
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
        Agregar a la fila de reproducci&oacute;n
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
      Ir al &aacute;lbum
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
</template>
