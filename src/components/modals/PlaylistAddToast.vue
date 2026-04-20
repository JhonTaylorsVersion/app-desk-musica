<script lang="ts">
import { defineComponent, inject } from "vue";

export default defineComponent({
  name: "PlaylistAddToast",
  setup() {
    const logic = inject<any>("appLogic");
    return { ...logic };
  },
});
</script>

<template>
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
          Se agreg&oacute; a {{ playlistAddToast.playlistName }}
        </div>
        <div class="playlist-add-toast-subtitle">
          {{ playlistAddToast.trackTitle }} &middot; {{ playlistAddToast.artist }}
        </div>
      </div>
    </div>
  </transition>
</template>
