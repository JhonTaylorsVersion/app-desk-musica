<template>
  <Transition name="slide-up">
    <div
      v-if="hasActiveDownloads"
      class="sf-toast-wrap"
      @click="$emit('click')"
    >
      <button type="button" class="sf-toast-card">
        <div class="sf-toast-inner">
          <Download class="sf-icon" :class="{ 'sf-icon--anim': progress.is_downloading }" />

          <div class="sf-toast-stats">
            <p class="sf-stat-main tabular-nums">
              {{ progress.mb_downloaded.toFixed(2) }} MB
            </p>
            <p v-if="progress.speed_mbps > 0" class="sf-stat-sub tabular-nums">
              {{ progress.speed_mbps.toFixed(2) }} MB/s
            </p>
          </div>

          <ChevronRight class="sf-chevron" />
        </div>
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useDownloadStore } from '../stores/useDownloadStore';
import { Download, ChevronRight } from 'lucide-vue-next';

defineEmits<{ click: [] }>();

const store = useDownloadStore();
const queueInfo = computed(() => store.queueInfo);
const progress = ref({
  is_downloading: false,
  mb_downloaded: 0,
  speed_mbps: 0,
});

const hasActiveDownloads = computed(() => {
  const hasQueueActivity = queueInfo.value.queue.some(
    item => item.status === 'queued' || item.status === 'downloading',
  );

  return hasQueueActivity || progress.value.is_downloading;
});

let queuePollInterval: ReturnType<typeof setInterval> | null = null;
let progressPollInterval: ReturnType<typeof setInterval> | null = null;

const pollQueue = async () => {
  await store.fetchQueue();
};

const pollProgress = async () => {
  try {
    progress.value = await invoke('get_download_progress');
  } catch (e) {
    // console.error('Failed to get download progress:', e);
    progress.value = {
      is_downloading: false,
      mb_downloaded: 0,
      speed_mbps: 0,
    };
  }
};

onMounted(() => {
  store.setupListeners();
  void pollQueue();
  void pollProgress();
  queuePollInterval = setInterval(() => void pollQueue(), 200);
  progressPollInterval = setInterval(() => void pollProgress(), 200);
});

watch(hasActiveDownloads, (active) => {
  if (!active) {
    progress.value = {
      is_downloading: false,
      mb_downloaded: 0,
      speed_mbps: 0,
    };
  }
});

onUnmounted(() => {
  if (queuePollInterval) clearInterval(queuePollInterval);
  if (progressPollInterval) clearInterval(progressPollInterval);
});
</script>

<style scoped>
.sf-toast-wrap {
  position: absolute;
  bottom: 1rem;
  left: calc(56px + 1rem);
  z-index: 50;
  cursor: pointer;
}

.sf-toast-card {
  position: relative;
  display: block;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.75rem;
  display: flex;
  align-items: center;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  min-width: 0;
  overflow: hidden;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  cursor: pointer;
}

.sf-toast-card:hover {
  background: var(--muted);
}

.sf-toast-inner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.sf-icon {
  width: 1rem;
  height: 1rem;
  color: rgb(37 99 235);
  flex-shrink: 0;
}

.sf-icon--anim {
  animation: download-bounce 1s infinite;
}

.sf-toast-stats {
  display: flex;
  flex-direction: column;
  min-width: 80px;
}

.sf-stat-main {
  font-size: 0.875rem;
  font-weight: 500;
  font-family: monospace;
  font-variant-numeric: tabular-nums;
}

.sf-stat-sub {
  font-size: 0.75rem;
  font-family: monospace;
  font-variant-numeric: tabular-nums;
  color: var(--muted-foreground);
}

.sf-chevron {
  width: 1rem;
  height: 1rem;
  color: var(--muted-foreground);
  margin-left: auto;
}

.dark .sf-toast-card {
  border-color: rgb(30 64 175);
  background: rgb(23 37 84);
  color: rgb(219 234 254);
}

.dark .sf-toast-card:hover {
  background: rgb(30 58 138);
}

.dark .sf-stat-sub,
.dark .sf-chevron {
  color: rgb(147 197 253);
}

@keyframes download-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

/* Transitions */
.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
