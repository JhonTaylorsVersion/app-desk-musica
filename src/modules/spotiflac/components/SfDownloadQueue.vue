<template>
  <Transition name="fade">
    <div
      v-if="isOpen"
      class="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      @click.self="$emit('close')"
    >
      <div class="flex max-h-[80vh] w-[95vw] max-w-[1200px] flex-col gap-0 overflow-hidden rounded-xl border bg-background p-0 shadow-2xl">
          <div class="px-6 pt-6 pb-4 border-b space-y-0">
            <div class="flex items-center justify-between mb-4">
              <h2
                class="text-lg font-semibold hover:text-primary transition-colors cursor-pointer"
                title="Click to reset queue"
                @click="handleReset"
              >
                Download Queue
              </h2>

              <div class="flex items-center gap-2">
                <button
                  v-if="queueInfo.completed_count > 0 || queueInfo.failed_count > 0 || queueInfo.skipped_count > 0"
                  class="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs rounded-md hover:bg-muted transition-colors"
                  @click="handleClearHistory"
                >
                  <Trash2 class="h-3 w-3" />
                  Clear History
                </button>

                <button
                  v-if="queueInfo.failed_count > 0"
                  class="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs rounded-md hover:bg-muted transition-colors"
                  @click="handleExportFailed"
                >
                  <FileDown class="h-3 w-3" />
                  Export Failures
                </button>

                <button
                  class="inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-muted transition-colors"
                  @click="$emit('close')"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
            </div>

            <div class="flex items-center gap-4 text-sm flex-wrap">
              <div
                class="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-all select-none"
                :class="filterStatus === 'queued' ? 'bg-secondary px-2 py-0.5 rounded-md ring-1 ring-border' : ''"
                @click="toggleFilter('queued')"
              >
                <Clock class="h-3.5 w-3.5 text-muted-foreground" />
                <span class="text-muted-foreground">Queued:</span>
                <span class="font-semibold">{{ queueInfo.queued_count }}</span>
              </div>

              <div
                class="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-all select-none"
                :class="filterStatus === 'completed' ? 'bg-green-500/10 px-2 py-0.5 rounded-md ring-1 ring-green-500/20' : ''"
                @click="toggleFilter('completed')"
              >
                <CheckCircle2 class="h-3.5 w-3.5 text-green-500" />
                <span class="text-muted-foreground">Completed:</span>
                <span class="font-semibold">{{ queueInfo.completed_count }}</span>
              </div>

              <div
                class="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-all select-none"
                :class="filterStatus === 'skipped' ? 'bg-yellow-500/10 px-2 py-0.5 rounded-md ring-1 ring-yellow-500/20' : ''"
                @click="toggleFilter('skipped')"
              >
                <FileCheck class="h-3.5 w-3.5 text-yellow-500" />
                <span class="text-muted-foreground">Skipped:</span>
                <span class="font-semibold">{{ queueInfo.skipped_count }}</span>
              </div>

              <div
                class="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-all select-none"
                :class="filterStatus === 'failed' ? 'bg-red-500/10 px-2 py-0.5 rounded-md ring-1 ring-red-500/20' : ''"
                @click="toggleFilter('failed')"
              >
                <XCircle class="h-3.5 w-3.5 text-red-500" />
                <span class="text-muted-foreground">Failed:</span>
                <span class="font-semibold">{{ queueInfo.failed_count }}</span>
              </div>
            </div>

            <div class="flex items-center gap-4 text-sm pt-3 mt-3 border-t flex-wrap">
              <div class="flex items-center gap-1.5">
                <HardDrive class="h-3.5 w-3.5 text-muted-foreground" />
                <span class="text-muted-foreground">Downloaded:</span>
                <span class="font-semibold font-mono tabular-nums">
                  {{ queueInfo.total_downloaded > 0 ? `${queueInfo.total_downloaded.toFixed(2)} MB` : '0.00 MB' }}
                </span>
              </div>

              <div class="flex items-center gap-1.5">
                <Zap class="h-3.5 w-3.5 text-muted-foreground" />
                <span class="text-muted-foreground">Speed:</span>
                <span class="font-semibold font-mono tabular-nums">
                  {{ queueInfo.current_speed > 0 && queueInfo.is_downloading ? `${queueInfo.current_speed.toFixed(2)} MB/s` : '—' }}
                </span>
              </div>

              <div class="flex items-center gap-1.5">
                <Timer class="h-3.5 w-3.5 text-muted-foreground" />
                <span class="text-muted-foreground">Duration:</span>
                <span class="font-semibold font-mono tabular-nums">
                  {{ queueInfo.session_start_time > 0 ? formatDuration(queueInfo.session_start_time) : '—' }}
                </span>
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto px-6 custom-scrollbar">
            <div class="space-y-2 py-4">
              <div v-if="queueInfo.queue.length === 0" class="text-center py-12 text-muted-foreground">
                <Download class="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No downloads in queue</p>
              </div>

              <div v-else-if="filteredQueue.length === 0" class="text-center py-12 text-muted-foreground">
                <p>No downloads with status "{{ filterStatus }}"</p>
                <button class="text-primary text-sm mt-2" @click="filterStatus = 'all'">Clear filter</button>
              </div>

              <div
                v-for="item in filteredQueue"
                v-else
                :key="item.id"
                class="border rounded-lg p-3 hover:bg-muted/30 transition-colors"
              >
                <div class="flex items-start gap-3">
                  <div class="mt-1">
                    <Download v-if="item.status === 'downloading'" class="h-4 w-4 text-blue-500 animate-bounce" />
                    <CheckCircle2 v-else-if="item.status === 'completed'" class="h-4 w-4 text-green-500" />
                    <XCircle v-else-if="item.status === 'failed'" class="h-4 w-4 text-red-500" />
                    <FileCheck v-else-if="item.status === 'skipped'" class="h-4 w-4 text-yellow-500" />
                    <Clock v-else class="h-4 w-4 text-muted-foreground" />
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2 mb-1">
                      <div class="flex-1 min-w-0">
                        <p class="font-medium truncate">{{ item.track_name }}</p>
                        <p class="text-sm text-muted-foreground truncate">
                          {{ item.artist_name }}<span v-if="item.album_name"> • {{ item.album_name }}</span>
                        </p>
                      </div>

                      <div
                        class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors"
                        :class="getBadgeClasses(item.status)"
                      >
                        {{ item.status }}
                      </div>
                    </div>

                    <div
                      v-if="item.status === 'downloading'"
                      class="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground font-mono tabular-nums"
                    >
                      <span>
                        {{ getItemProgress(item) > 0
                          ? `${getItemProgress(item).toFixed(2)} MB`
                          : queueInfo.is_downloading && queueInfo.current_speed > 0
                            ? 'Downloading...'
                            : 'Starting...' }}
                      </span>
                      <span>
                        {{ getItemSpeed(item) > 0
                          ? `${getItemSpeed(item).toFixed(2)} MB/s`
                          : queueInfo.current_speed > 0
                            ? `${queueInfo.current_speed.toFixed(2)} MB/s`
                            : '—' }}
                      </span>
                    </div>

                    <div
                      v-if="item.status === 'completed'"
                      class="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground"
                    >
                      <span class="font-mono tabular-nums">{{ getItemProgress(item).toFixed(2) }} MB</span>
                    </div>

                    <div v-if="item.status === 'skipped'" class="mt-1.5 text-xs text-muted-foreground">
                      File already exists
                    </div>

                    <div
                      v-if="item.status === 'failed' && item.error_message"
                      class="mt-1.5 text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded px-2 py-1"
                    >
                      {{ item.error_message }}
                    </div>

                    <div
                      v-if="(item.status === 'completed' || item.status === 'skipped') && item.file_path"
                      class="mt-1.5 text-xs text-muted-foreground truncate font-mono"
                    >
                      {{ item.file_path }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import {
  X,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck,
  Trash2,
  HardDrive,
  Zap,
  Timer,
  FileDown,
} from 'lucide-vue-next';
import { useDownloadStore } from '../stores/useDownloadStore';
import { toastWithSound as toast } from '../utils/toast-with-sound';

const props = defineProps<{ isOpen: boolean }>();
defineEmits<{ close: [] }>();

const store = useDownloadStore();
const queueInfo = computed(() => store.queueInfo);
const filterStatus = ref<string>('all');

const toggleFilter = (status: string) => {
  filterStatus.value = filterStatus.value === status ? 'all' : status;
};

const filteredQueue = computed(() => {
  if (filterStatus.value === 'all') return queueInfo.value.queue;
  return queueInfo.value.queue.filter((item) => item.status === filterStatus.value);
});

const getItemProgress = (item: any): number => item.progress ?? item.progress_mb ?? 0;
const getItemSpeed = (item: any): number => item.speed ?? item.speed_mbps ?? 0;

const getBadgeClasses = (status: string) => {
  if (status === 'downloading') return 'border-transparent bg-primary text-primary-foreground';
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-500';
  if (status === 'skipped') return 'border-transparent bg-secondary text-secondary-foreground';
  return 'text-foreground';
};

const formatDuration = (startTimestamp: number): string => {
  if (startTimestamp === 0) return '—';
  const now = Math.floor(Date.now() / 1000);
  const durationSeconds = now - startTimestamp;
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const handleClearHistory = async () => {
  try {
    await store.clearCompletedDownloads();
  } catch (e) {
    console.error('Failed to clear history:', e);
  }
};

const handleReset = async () => {
  try {
    await store.clearAllDownloads();
    toast.success('Download queue reset');
  } catch (e) {
    console.error('Failed to reset queue:', e);
  }
};

const handleExportFailed = async () => {
  try {
    const message = await store.exportFailedDownloads();
    if (message.startsWith('Successfully')) {
      toast.success(message);
    } else if (message !== 'Export cancelled') {
      toast.info(message);
    }
  } catch (e) {
    console.error('Failed to export:', e);
    toast.error(`Failed to export: ${e}`);
  }
};

let pollInterval: ReturnType<typeof setInterval> | null = null;

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      void store.fetchQueue();
      pollInterval = setInterval(() => void store.fetchQueue(), 200);
    } else if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 3px;
}
</style>
