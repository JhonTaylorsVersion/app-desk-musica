<script setup lang="ts">
import { 
  Music, 
  Database, 
  Globe2, 
  Activity,
  Box
} from "lucide-vue-next";

// Import original PNG assets
import amazonIcon from "@/assets/icons/amzn.png";
import qobuzIcon from "@/assets/icons/qbz.png";
import tidalLightIcon from "@/assets/icons/tidal_l.png";
import tidalDarkIcon from "@/assets/icons/tidal_d.png";
import songlinkLightIcon from "@/assets/icons/songlink_l.png";
import songlinkDarkIcon from "@/assets/icons/songlink_d.png";
import musicbrainzLightIcon from "@/assets/icons/musicbrainz_l.png";
import musicbrainzDarkIcon from "@/assets/icons/musicbrainz_d.png";
import songstatsIcon from "@/assets/icons/songstats.png";
import lrclibIcon from "@/assets/icons/lrclib.png";

// Common platform icons for Spotify, Tidal, Qobuz, Amazon, etc.
const props = defineProps<{
  platform: string;
  variant?: "plain" | "branded";
  customClass?: string;
}>();
</script>

<template>
  <span 
    :class="[
      customClass,
      variant === 'branded' ? 'flex items-center justify-center rounded-md overflow-hidden bg-card border shadow-sm' : 'flex items-center justify-center inline-flex'
    ]"
    :style="variant === 'branded' ? { aspectRatio: '1/1' } : {}"
  >
    <!-- TIDAL -->
    <template v-if="platform === 'tidal'">
      <img :src="tidalLightIcon" class="h-full w-full object-contain dark:hidden" alt="Tidal" />
      <img :src="tidalDarkIcon" class="h-full w-full object-contain hidden dark:block" alt="Tidal" />
    </template>
    
    <!-- QOBUZ -->
    <template v-else-if="platform === 'qobuz'">
      <img :src="qobuzIcon" class="h-full w-full object-contain" alt="Qobuz" />
    </template>
    
    <!-- AMAZON -->
    <template v-else-if="platform === 'amazon'">
      <img :src="amazonIcon" class="h-full w-full object-contain" alt="Amazon Music" />
    </template>

    <!-- SONGLINK -->
    <template v-else-if="platform === 'songlink'">
      <img :src="songlinkLightIcon" class="h-full w-full object-contain dark:hidden" alt="Songlink" />
      <img :src="songlinkDarkIcon" class="h-full w-full object-contain hidden dark:block" alt="Songlink" />
    </template>

    <!-- SONGSTATS -->
    <template v-else-if="platform === 'songstats'">
      <img :src="songstatsIcon" class="h-full w-full object-contain" alt="Songstats" />
    </template>

    <!-- LRCLIB -->
    <template v-else-if="platform === 'lrclib'">
      <img :src="lrclibIcon" class="h-full w-full object-contain" alt="LRCLIB" />
    </template>

    <!-- MUSICBRAINZ -->
    <template v-else-if="platform === 'musicbrainz'">
      <img :src="musicbrainzLightIcon" class="h-full w-full object-contain dark:hidden" alt="MusicBrainz" />
      <img :src="musicbrainzDarkIcon" class="h-full w-full object-contain hidden dark:block" alt="MusicBrainz" />
    </template>
    
    <!-- SPOTIFY (Keep SVG for now as there was no PNG in original list) -->
    <template v-else-if="platform === 'spotify'">
      <span class="flex items-center justify-center bg-[#1DB954] rounded-full p-[15%] h-full w-full">
        <svg viewBox="0 0 24 24" fill="black" class="h-full w-full"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.49 17.306c-.215.353-.674.464-1.026.25-2.85-1.742-6.438-2.135-10.665-1.168-.403.092-.81-.16-.903-.563-.092-.403.16-.81.563-.903 4.63-1.06 8.583-.615 11.776 1.336.353.215.465.674.25 1.026zm1.465-3.26c-.27.441-.85.582-1.29.31-3.26-2.003-8.232-2.585-12.09-1.413-.491.15-1.018-.124-1.168-.615-.15-.491.124-1.018.615-1.168 4.41-1.34 9.894-.684 13.623 1.605.441.27.583.85.31 1.29zm.126-3.393c-3.91-2.323-10.366-2.538-14.137-1.393-.6.182-1.238-.155-1.42-.756-.182-.6.155-1.238.756-1.42 4.335-1.317 11.453-1.057 15.986 1.633.54.32.716 1.014.395 1.554-.32.54-1.014.717-1.554.394z"/></svg>
      </span>
    </template>
    
    <!-- FALLBACKS -->
    <template v-else-if="platform === 'music'">
       <Music class="h-full w-full" />
    </template>
    <template v-else-if="platform === 'database'">
       <Database class="h-full w-full" />
    </template>
    <template v-else-if="platform === 'globe'">
       <Globe2 class="h-full w-full" />
    </template>
    <template v-else>
       <Box class="h-full w-full opacity-50" />
    </template>
  </span>
</template>
