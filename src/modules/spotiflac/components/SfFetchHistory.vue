<template>
  <!-- Mirrors FetchHistory.tsx 1:1 -->
  <div v-if="history.length > 0" class="sf-history">
    <span class="sf-history-label">{{ history.length === 1 ? 'Recent Fetch' : 'Recent Fetches' }}</span>
    <div class="sf-history-scroll">
      <div
        v-for="item in history"
        :key="item.id"
        class="sf-history-card group"
        @click="$emit('select', item)"
      >
        <!-- Remove button -->
        <button
          class="sf-history-remove"
          @click.stop="$emit('remove', item.id)"
          title="Remove"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div class="sf-history-inner">
          <div class="sf-history-thumb">
            <img v-if="item.image" :src="item.image" :alt="item.name" class="sf-thumb-img" />
            <div v-else class="sf-thumb-placeholder">No Image</div>
          </div>
          <div class="sf-history-meta">
            <p class="sf-history-name" :title="item.name">{{ item.name }}</p>
            <p class="sf-history-artist" :title="item.artist">{{ item.artist }}</p>
            <span class="sf-type-badge" :class="`sf-type-badge--${item.type}`">
              <!-- Icons inline -->
              <svg v-if="item.type === 'track'" class="h-2.5 w-2.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
              <svg v-else-if="item.type === 'album'" class="h-2.5 w-2.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else-if="item.type === 'playlist'" class="h-2.5 w-2.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              <svg v-else-if="item.type === 'artist'" class="h-2.5 w-2.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              {{ getTypeLabel(item.type) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface HistoryItem {
    id: string;
    url: string;
    type: 'track' | 'album' | 'playlist' | 'artist';
    name: string;
    artist: string;
    image: string;
    timestamp: number;
    data?: string;
    info?: string;
}

defineProps<{ history: HistoryItem[] }>();
defineEmits<{ select: [item: HistoryItem]; remove: [id: string] }>();

function getTypeLabel(type: string): string {
    const map: Record<string, string> = { track: 'Track', album: 'Album', playlist: 'Playlist', artist: 'Artist' };
    return map[type] || type;
}
</script>

<style scoped>
.sf-history { display: flex; flex-direction: column; gap: 0.5rem; }
.sf-history-label { font-size: 0.875rem; color: hsl(var(--muted-foreground)); }
.sf-history-scroll { display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem; padding-top: 0.5rem; }
.sf-history-card {
  position: relative; flex-shrink: 0; width: 130px; cursor: pointer;
  border-radius: 0.5rem; border: 1px solid hsl(var(--border));
  background: hsl(var(--card)); transition: background 0.15s; overflow: visible;
}
.sf-history-card:hover { background: hsl(var(--accent)); }
.sf-history-remove {
  position: absolute; top: -6px; right: -6px; z-index: 10;
  width: 20px; height: 20px; border-radius: 9999px;
  background: hsl(0 72% 51%); color: hsl(0 72% 90%);
  border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s, background 0.15s;
}
.sf-history-card:hover .sf-history-remove { opacity: 1; }
.sf-history-remove:hover { background: hsl(0 72% 40%); }
.sf-history-inner { padding: 0.5rem; }
.sf-history-thumb { aspect-ratio: 1; width: 100%; border-radius: 0.375rem; overflow: hidden; margin-bottom: 0.5rem; background: hsl(var(--muted)); }
.sf-thumb-img { width: 100%; height: 100%; object-fit: cover; }
.sf-thumb-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: hsl(var(--muted-foreground)); }
.sf-history-meta { display: flex; flex-direction: column; gap: 2px; }
.sf-history-name { font-size: 0.75rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf-history-artist { font-size: 0.75rem; color: hsl(var(--muted-foreground)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf-type-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 0.625rem; padding: 2px 6px; border-radius: 4px;
}
.sf-type-badge--track   { background: hsl(220 90% 56% / 0.1); color: hsl(220 90% 56%); }
.sf-type-badge--album   { background: hsl(142 76% 36% / 0.1); color: hsl(142 76% 36%); }
.sf-type-badge--playlist{ background: hsl(270 70% 56% / 0.1); color: hsl(270 70% 56%); }
.sf-type-badge--artist  { background: hsl(25 90% 56% / 0.1);  color: hsl(25 90% 56%);  }
</style>
