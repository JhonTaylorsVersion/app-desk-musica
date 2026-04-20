<script lang="ts">
import { defineComponent, inject } from "vue";

export default defineComponent({
  name: "DuplicatePlaylistModal",
  setup() {
    const logic = inject<any>("appLogic");
    return { ...logic };
  },
});
</script>

<template>
  <div
    v-if="duplicatePlaylistModal"
    class="playlist-modal-backdrop"
    @click.self="closeDuplicatePlaylistModal"
  >
    <div class="playlist-modal duplicate-track-modal">
      <div class="playlist-modal-copy">
        <h2>Canciones ya agregadas</h2>
        <p>
          Esta canci&oacute;n ya est&aacute; en tu playlist "{{
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
</template>
