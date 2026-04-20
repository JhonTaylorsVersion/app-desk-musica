<template>
  <!-- Mirrors DebugLoggerPage.tsx 1:1 -->
  <div class="sf-debug-page">
    <div class="sf-debug-header">
      <h1 class="sf-title">Debug Logs</h1>
      <div class="sf-debug-actions">
        <button class="sf-btn" :disabled="!canExportFailed" @click="handleExportFailed">
          <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/>
            <polyline points="9 15 12 18 15 15"/>
          </svg>
          Export Failed
        </button>
        <button class="sf-btn" :disabled="logs.length === 0" @click="handleCopy">
          <svg v-if="copied" class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <svg v-else class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        </button>
        <button class="sf-btn" :disabled="logs.length === 0" @click="handleClear">
          <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          Clear
        </button>
      </div>
    </div>

    <div ref="scrollRef" class="sf-log-panel custom-scrollbar">
      <p v-if="logs.length === 0" class="sf-log-empty">no logs yet...</p>
      <div v-else v-for="(log, i) in logs" :key="i" class="sf-log-row">
        <span class="sf-log-time">[{{ formatTime(log.timestamp) }}]</span>
        <span class="sf-log-level" :class="`lvl-${log.level}`">[{{ log.level }}]</span>
        <span class="sf-log-msg">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { logger, type LogEntry } from '../utils/logger';
import { useDownloadStore } from '../stores/useDownloadStore';
import { toastWithSound as toast } from '../utils/toast-with-sound';

const logs = ref<LogEntry[]>([]);
const copied = ref(false);
const scrollRef = ref<HTMLDivElement | null>(null);

const store = useDownloadStore();
const queueInfo = computed(() => store.queueInfo);

const hasDownloadActivity = computed(() =>
  queueInfo.value.queue.length > 0 ||
  queueInfo.value.queued_count > 0 ||
  queueInfo.value.completed_count > 0 ||
  queueInfo.value.failed_count > 0 ||
  queueInfo.value.skipped_count > 0,
);
const canExportFailed = computed(() => hasDownloadActivity.value && queueInfo.value.failed_count > 0);

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function handleClear() { logger.clear(); }

async function handleCopy() {
  const text = logs.value.map(l => `[${formatTime(l.timestamp)}] [${l.level}] ${l.message}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 500);
  } catch (err) {
    // console.error('Failed to copy logs:', err);
  }
}

async function handleExportFailed() {
  if (!canExportFailed.value) return;
  try {
    const message = await store.exportFailedDownloads();
    if (message.startsWith('Successfully')) toast.success(message);
    else if (message !== 'Export cancelled') toast.info(message);
  } catch (error) {
    toast.error(`Failed to export: ${error}`);
  }
}

// Auto-scroll when logs update — mirrors useEffect([logs])
watch(logs, async () => {
  await nextTick();
  if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
}, { flush: 'post' });

let unsubscribe: (() => void) | null = null;
onMounted(() => {
  unsubscribe = logger.subscribe(() => { logs.value = logger.getLogs(); });
  logs.value = logger.getLogs();
});
onUnmounted(() => { unsubscribe?.(); });
</script>

<style scoped>
.sf-debug-page { display: flex; flex-direction: column; gap: 1.5rem; }
.sf-debug-header { display: flex; align-items: center; justify-content: space-between; }
.sf-title { font-size: 1.5rem; font-weight: 700; }
.sf-debug-actions { display: flex; align-items: center; gap: 0.5rem; }
.sf-btn {
  display: flex; align-items: center; gap: 0.375rem;
  padding: 0.375rem 0.75rem; font-size: 0.875rem;
  border: 1px solid hsl(var(--border)); border-radius: 6px;
  background: transparent; color: hsl(var(--foreground)); cursor: pointer;
  transition: background 0.15s;
}
.sf-btn:hover:not(:disabled) { background: hsl(var(--muted)); }
.sf-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sf-log-panel {
  height: calc(100vh - 220px); overflow-y: auto;
  background: hsl(var(--muted) / 0.5); border-radius: 0.5rem;
  padding: 1rem; font-family: monospace; font-size: 0.75rem;
}
.sf-log-empty { color: hsl(var(--muted-foreground)); text-transform: lowercase; }
.sf-log-row { display: flex; gap: 0.5rem; padding: 2px 0; }
.sf-log-time { color: hsl(var(--muted-foreground)); flex-shrink: 0; }
.sf-log-level { flex-shrink: 0; width: 64px; }
.sf-log-msg { word-break: break-all; }
.lvl-info    { color: hsl(220 90% 56%); }
.lvl-success { color: hsl(142 76% 36%); }
.lvl-warning { color: hsl(48 96% 53%); }
.lvl-error   { color: hsl(0 72% 51%); }
.lvl-debug   { color: hsl(var(--muted-foreground)); }
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 3px; }
</style>
