<template>
  <!-- Mirrors ApiStatusTab.tsx 1:1 -->
  <div class="space-y">
    <div class="sf-refresh-row">
      <button class="sf-btn-outline" :disabled="isCheckingAll" @click="refreshAll()">
        <svg class="h-4 w-4" :class="{ 'sf-spin': isCheckingAll }" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        Refresh All
      </button>
    </div>

    <div class="sf-status-grid">
      <div v-for="source in sources" :key="source.id" class="sf-status-card">
        <div class="sf-status-left">
          <!-- Icons via inline SVG matching PlatformIcons -->
          <component :is="getPlatformIcon(source.type)" class="sf-platform-icon" />
          <p class="sf-source-name">{{ source.name }}</p>
        </div>
        <div class="sf-status-indicator">
          <div v-if="(statuses[source.id] || 'idle') === 'checking'" class="sf-spinner-icon" />
          <svg v-else-if="(statuses[source.id] || 'idle') === 'online'" class="h-5 w-5 text-emerald" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <svg v-else-if="(statuses[source.id] || 'idle') === 'offline'" class="h-5 w-5 text-red" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <div v-else class="sf-idle-dot" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useApiStatus } from '../composables/useApiStatus';
import { computed, defineComponent, h } from 'vue';

const { state, sources, refreshAll } = useApiStatus();
const statuses = computed(() => state.value.statuses);
const isCheckingAll = computed(() => state.value.isCheckingAll);

// Inline minimal SVG platform icons matching PlatformIcons.tsx usage
function getPlatformIcon(type: string) {
  const icons: Record<string, string> = {
    tidal: 'M12 3L2 8l10 5 10-5-10-5zM2 16l10 5 10-5M2 12l10 5 10-5',
    qobuz: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
    amazon: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z',
    lrclib: 'M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm12-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    musicbrainz: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z',
  };
  const d = icons[type] || icons.qobuz;
  return defineComponent({
    render() {
      return h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'w-5 h-5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 },
        [h('path', { d })],
      );
    },
  });
}
</script>

<style scoped>
.space-y { display: flex; flex-direction: column; gap: 1.5rem; }
.sf-refresh-row { display: flex; justify-content: flex-end; }
.sf-btn-outline {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.375rem 0.75rem; font-size: 0.875rem;
  border: 1px solid hsl(var(--border)); border-radius: 6px;
  background: transparent; color: hsl(var(--foreground));
  cursor: pointer; transition: background 0.15s;
}
.sf-btn-outline:hover:not(:disabled) { background: hsl(var(--muted)); }
.sf-btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
.sf-status-grid {
  display: grid; grid-template-columns: repeat(1, 1fr); gap: 1rem;
}
@media (min-width: 640px)  { .sf-status-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .sf-status-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 1280px) { .sf-status-grid { grid-template-columns: repeat(4, 1fr); } }
.sf-status-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem; border: 1px solid hsl(var(--border)); border-radius: 0.5rem;
  background: hsl(var(--card));
}
.sf-status-left { display: flex; align-items: center; gap: 0.75rem; }
.sf-platform-icon { width: 1.25rem; height: 1.25rem; color: hsl(var(--muted-foreground)); flex-shrink: 0; }
.sf-source-name { font-weight: 500; }
.sf-spinner-icon {
  width: 1.25rem; height: 1.25rem; border-radius: 9999px;
  border: 2px solid hsl(var(--muted-foreground)); border-top-color: transparent;
  animation: sf-spin 0.8s linear infinite;
}
.sf-idle-dot { width: 1.25rem; height: 1.25rem; border-radius: 9999px; background: hsl(var(--muted)); }
.text-emerald { color: hsl(160 84% 39%); }
.text-red { color: hsl(0 72% 51%); }
.sf-spin { animation: sf-spin 0.8s linear infinite; }
@keyframes sf-spin { to { transform: rotate(360deg); } }
</style>
