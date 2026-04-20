<script lang="ts">
import { defineComponent, inject } from "vue";

export default defineComponent({
  name: "RenamePlaylistModal",
  setup() {
    const logic = inject<any>("appLogic");
    return { ...logic };
  },
});
</script>

<template>
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
</template>
