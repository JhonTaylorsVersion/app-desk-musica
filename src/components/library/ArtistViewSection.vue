<template>
  <div
    v-if="currentViewMode === 'artist' && activeArtistAlbums.length > 0"
    class="artist-albums-grid"
  >
    <h3 class="section-subtitle">Álbumes</h3>
    <div class="albums-grid">
      <div
        v-for="album in activeArtistAlbums"
        :key="album.name"
        class="album-card glass-panel-inner"
        @click="goToAlbum(album.name, activeArtistView || '')"
      >
        <img v-if="album.cover" :src="album.cover" alt="cover" />
        <div v-else class="album-cover-placeholder">&#9835;</div>
        <div class="album-name">{{ album.name }}</div>
      </div>
    </div>
    <h3 class="section-subtitle">Canciones</h3>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  activeArtistAlbums: Array<{ cover?: string | null; name: string }>;
  activeArtistView: string | null;
  currentViewMode: string;
  goToAlbum: (album: string, artist: string) => void;
}>();
</script>
