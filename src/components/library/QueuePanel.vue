<template>
  <div
    v-if="isQueuePanelOpen"
    class="queue-panel glass-panel-inner"
    style="height: 100%"
  >
    <div class="panel-header">
      <div>
        <div class="panel-title">Fila de reproducción</div>
        <div class="panel-subtitle">{{ queue.length }} elemento(s)</div>
      </div>

      <button
        class="small-action-btn danger"
        type="button"
        @click="clearQueue"
        :disabled="queue.length === 0"
      >
        Limpiar
      </button>
    </div>

    <div v-if="queue.length === 0" class="queue-empty">
      <div class="empty-icon small">🧾</div>
      <div class="empty-title small-title">La fila está vacía</div>
      <div class="empty-subtitle">
        Añade canciones desde la biblioteca para verlas aquí.
      </div>
    </div>

    <div v-else class="queue-list">
      <div
        v-for="item in filteredQueueWithIndex"
        :key="`${item.track.path}-${item.realIndex}`"
        class="queue-row"
        :class="{
          active: isQueueTrackActive(item.track, item.realIndex),
          hovered: hoveredQueueTrackId === item.track.queueId,
        }"
        @mouseenter="updateHoveredQueueTrackId(item.track.queueId)"
        @mouseleave="updateHoveredQueueTrackId(null)"
        @contextmenu="
          openTrackContextMenu($event, item.track, 'queue', item.realIndex)
        "
      >
        <div class="queue-row-card">
          <div
            class="track-main-info"
            @click="playTrackFromQueue(item.realIndex)"
          >
            <div class="queue-item-cover row-cover">
              <img
                v-if="getLibraryTrackCover(item.track)"
                :src="getLibraryTrackCover(item.track) || undefined"
                alt="cover"
              />
              <div v-else class="row-cover-placeholder">&#9835;</div>
            </div>

            <div class="queue-item-meta">
              <div class="track-name">
                {{ getTrackDisplayTitle(item.track) }}
              </div>
              <div class="track-path">
                <span
                  v-for="(artist, i) in splitArtists(getLibraryTrackArtist(item.track))"
                  :key="artist"
                >
                  <span
                    class="hoverable-link queue-artist-link"
                    :title="artist"
                    @click.stop="goToArtist(artist)"
                    >{{ artist }}</span
                  >
                  <span
                    v-if="
                      i <
                      splitArtists(getLibraryTrackArtist(item.track)).length - 1
                    "
                    >,
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div class="track-actions">
            <button
              class="row-btn queue-hover-btn"
              type="button"
              @click.stop="playTrackFromQueue(item.realIndex)"
              aria-label="Reproducir"
            >
              ▶
            </button>
            <button
              class="row-btn queue-hover-btn queue-dots-btn"
              type="button"
              @click.stop="
                openTrackContextMenu($event, item.track, 'queue', item.realIndex)
              "
              aria-label="Más opciones"
            >
              &times;
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  clearQueue: () => void;
  filteredQueueWithIndex: Array<{ realIndex: number; track: any }>;
  getLibraryTrackArtist: (track: any) => string;
  getLibraryTrackCover: (track: any) => string | null | undefined;
  getTrackDisplayTitle: (track: any) => string;
  goToArtist: (artist: string) => void;
  hoveredQueueTrackId: number | null;
  isQueuePanelOpen: boolean;
  isQueueTrackActive: (track: any, realIndex: number) => boolean;
  openTrackContextMenu: (
    event: MouseEvent,
    track: any,
    source: "queue",
    index: number,
  ) => void;
  playTrackFromQueue: (realIndex: number) => void;
  queue: any[];
  splitArtists: (artists: string) => string[];
}>();

const emit = defineEmits<{
  (e: "update:hoveredQueueTrackId", value: number | null): void;
}>();

function updateHoveredQueueTrackId(value: number | null) {
  emit("update:hoveredQueueTrackId", value);
}
</script>
