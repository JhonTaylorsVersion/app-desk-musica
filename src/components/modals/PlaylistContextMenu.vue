<script lang="ts">
import { defineComponent, inject } from "vue";

export default defineComponent({
  name: "PlaylistContextMenu",
  setup() {
    const logic = inject<any>("appLogic");
    return { ...logic };
  },
});
</script>

<template>
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
</template>
