<template>
  <!-- Mirrors DownloadProgress.tsx 1:1 -->
  <div class="w-full space-y-2 mt-4">
    <div class="flex items-center gap-2">
      <div class="sf-progress-bar flex-1">
        <div class="sf-progress-fill" :style="{ width: `${clampedProgress}%` }" />
      </div>
      <button class="sf-btn-stop" @click="$emit('stop')">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <rect x="9" y="9" width="6" height="6" />
        </svg>
        Stop
      </button>
    </div>
    <p class="text-xs text-muted">
      {{ clampedProgress }}% —
      {{ currentTrack ? `${currentTrack.name} — ${currentTrack.artists}` : 'Preparing download...' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface CurrentTrack {
  name: string;
  artists: string;
}

const props = defineProps<{
  progress: number;
  currentTrack: CurrentTrack | null;
}>();

defineEmits<{ stop: [] }>();

const clampedProgress = computed(() => Math.min(100, Math.max(0, props.progress)));
</script>

<style scoped>
.sf-progress-bar {
  height: 8px;
  background: hsl(var(--muted));
  border-radius: 9999px;
  overflow: hidden;
}
.sf-progress-fill {
  height: 100%;
  background: hsl(var(--primary));
  border-radius: 9999px;
  transition: width 0.3s ease;
}
.sf-btn-stop {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 0.8rem;
  border-radius: 6px;
  border: 1px solid hsl(var(--destructive));
  color: hsl(var(--destructive));
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
}
.sf-btn-stop:hover {
  background: hsl(var(--destructive) / 0.1);
}
.text-muted {
  color: hsl(var(--muted-foreground));
}
</style>
