<script setup lang="ts">
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { invoke } from '@tauri-apps/api/core';
import { formatRelativeTime } from '../utils/relative-time';
import logoUrl from '@/assets/spotiflac.svg';

defineProps<{
  version: string;
  hasUpdate?: boolean;
  releaseDate?: string | null;
}>();

const openGithub = () => {
  void invoke('open_url', { url: 'https://github.com/spotbye/SpotiFLAC/releases' });
};

const reloadApp = () => {
  window.location.reload();
};
</script>

<template>
  <div class="relative">
    <div class="text-center space-y-2">
      <div class="flex items-center justify-center gap-3">
        <img
          :src="logoUrl"
          alt="SpotiFLAC"
          class="w-12 h-12 cursor-pointer"
          @click="reloadApp"
        />
        <h1 class="text-4xl font-bold cursor-pointer" @click="reloadApp">
          SpotiFLAC
        </h1>
        <div class="relative">
          <Tooltip>
            <TooltipTrigger as-child>
              <Badge variant="default" as-child>
                <button
                  type="button"
                  class="cursor-pointer hover:opacity-80 transition-opacity"
                  @click="openGithub"
                >
                  v{{ version }}
                </button>
              </Badge>
            </TooltipTrigger>
            <TooltipContent v-if="hasUpdate && releaseDate">
              <p>{{ formatRelativeTime(releaseDate) }}</p>
            </TooltipContent>
          </Tooltip>
          <span v-if="hasUpdate" class="absolute -top-1 -right-1 flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
        </div>
      </div>
      <p class="text-muted-foreground">
        Get tracks in true FLAC from Providers.
      </p>
    </div>
  </div>
</template>
