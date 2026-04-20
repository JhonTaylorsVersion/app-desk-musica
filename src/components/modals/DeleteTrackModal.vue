<script lang="ts">
import { defineComponent, inject } from "vue";

export default defineComponent({
  name: "DeleteTrackModal",
  setup() {
    const logic = inject<any>("appLogic");
    return { ...logic };
  },
});
</script>

<template>
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
              ? `&iquest;Quitar estas ${trackPendingDeletion.count} canciones?`
              : "&iquest;Quitar esta canci&oacute;n de la playlist?"
          }}
        </h2>
        <p
          v-if="!trackPendingDeletion.count || trackPendingDeletion.count === 1"
        >
          Se quitar&aacute;
          <strong>{{
            getTrackDisplayTitle(trackPendingDeletion.track)
          }}</strong>
          de <strong>{{ trackPendingDeletion.playlistName }}</strong
          >.
        </p>
        <p v-else>
          Se quitar&aacute;n
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
                  ? "Eliminar tambi&eacute;n los archivos f&iacute;sicos del PC"
                  : "Eliminar tambi&eacute;n el archivo f&iacute;sico del PC"
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
                  ? "Los archivos se eliminar&aacute;n f&iacute;sicamente solo de la carpeta de la playlist"
                  : "El archivo se eliminar&aacute; f&iacute;sicamente solo de la carpeta de la playlist"
              }}
              <strong>{{ trackPendingDeletion.playlistName }}</strong
              >. Otras copias en tu PC no se ver&aacute;n afectadas.
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
</template>
