<script setup lang="ts">
import { computed } from 'vue';
import type { TrackAvailability } from '@/modules/spotiflac/types/api';
import SfPlatformIcons from './SfPlatformIcons.vue';
// openExternal is probably defined elsewhere, we can assume it's in utils
import { openExternal } from '@/modules/spotiflac/utils/utils';

interface Props {
  availability?: TrackAvailability;
}

const props = defineProps<Props>();

interface AvailabilityLinkEntry {
  id: string;
  found: boolean;
  url?: string;
  colorClass: string;
}

const entries = computed<AvailabilityLinkEntry[]>(() => {
  if (!props.availability) return [];
  
  const tidalUrl = props.availability.tidal_url?.trim() || "";
  const qobuzUrl = props.availability.qobuz_url?.trim() || "";
  const amazonUrl = props.availability.amazon_url?.trim() || "";
  
  return [
    {
      id: "tidal",
      found: tidalUrl !== "",
      url: tidalUrl,
      colorClass: tidalUrl ? "text-green-500" : "text-red-500",
    },
    {
      id: "qobuz",
      found: qobuzUrl !== "",
      url: qobuzUrl,
      colorClass: qobuzUrl ? "text-green-500" : "text-red-500",
    },
    {
      id: "amazon",
      found: amazonUrl !== "",
      url: amazonUrl,
      colorClass: amazonUrl ? "text-green-500" : "text-red-500",
    },
  ];
});

const handleOpen = (url?: string) => {
  if (url) {
    if (typeof openExternal === 'function') {
      openExternal(url);
    } else {
      window.open(url, '_blank', 'noreferrer');
    }
  }
};
</script>

<template>
  <div v-if="!availability">
    <p>Check Availability</p>
  </div>
  <div v-else class="flex flex-col gap-1.5 w-[260px] max-w-[260px] pointer-events-auto">
    <template v-for="entry in entries" :key="entry.id">
      
      <!-- Link found -->
      <button 
        v-if="entry.found" 
        type="button" 
        @click="handleOpen(entry.url)" 
        class="flex items-center gap-2 text-left text-xs hover:underline min-w-0 cursor-pointer" 
        :title="entry.url"
      >
        <SfPlatformIcons :platform="entry.id" :class="`w-4 h-4 shrink-0 ${entry.colorClass}`" />

        <span class="truncate whitespace-nowrap leading-5 min-w-0">
          {{ entry.url }}
        </span>
      </button>

      <!-- Link NOT found -->
      <div v-else class="flex items-center gap-2 text-left text-xs min-w-0">
        <SfPlatformIcons :platform="entry.id" :class="`w-4 h-4 shrink-0 ${entry.colorClass}`" />

        <span class="truncate whitespace-nowrap leading-5 min-w-0 text-red-500">
          Not Found
        </span>
      </div>
    </template>
  </div>
</template>
