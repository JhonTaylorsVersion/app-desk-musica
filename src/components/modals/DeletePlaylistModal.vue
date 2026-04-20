<script lang="ts">
import { defineComponent, inject } from "vue";

export default defineComponent({
  name: "DeletePlaylistModal",
  setup() {
    const logic = inject<any>("appLogic");
    return { ...logic };
  },
});
</script>

<template>
  <div
    v-if="playlistPendingDeletion"
    class="playlist-modal-backdrop"
    @click.self="closePlaylistDeleteModal"
  >
    <div class="playlist-modal delete-modal">
      <div class="playlist-modal-copy">
        <h2>&iquest;Quieres eliminar este elemento de Tu biblioteca?</h2>
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
              canciones f&iacute;sicamente de tu PC</span
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
              Solo se borrar&aacute;n los archivos f&iacute;sicos de esta playlist. Si una
              canci&oacute;n est&aacute; en otra lista de reproducci&oacute;n, permanecer&aacute; guardada
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
</template>
