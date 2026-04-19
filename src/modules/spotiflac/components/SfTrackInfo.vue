<script setup lang="ts">
import { computed } from 'vue';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Download, FolderOpen, CheckCircle, XCircle, 
  FileText, FileCheck, Globe, ImageDown, Play, Pause 
} from "lucide-vue-next";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { TrackMetadata, TrackAvailability } from "@/modules/spotiflac/types/api";
import { usePreview } from "@/modules/spotiflac/composables/usePreview";
import SfAvailabilityLinks from "./SfAvailabilityLinks.vue";
import { hasAvailabilityLinks } from "@/modules/spotiflac/utils/artist-links"; // Adjusted this, assumes we ported it here
import { buildClickableArtists } from "@/modules/spotiflac/utils/artist-links";

interface TrackInfoProps {
  track: TrackMetadata & {
    album_name: string;
    release_date: string;
  };
  isDownloading?: boolean;
  downloadingTrack?: string | null;
  isDownloaded?: boolean;
  isFailed?: boolean;
  isSkipped?: boolean;
  
  downloadingLyricsTrack?: string | null;
  downloadedLyrics?: boolean;
  failedLyrics?: boolean;
  skippedLyrics?: boolean;
  
  checkingAvailability?: boolean;
  availability?: TrackAvailability;
  
  downloadingCover?: boolean;
  downloadedCover?: boolean;
  failedCover?: boolean;
  skippedCover?: boolean;
}

const props = withDefaults(defineProps<TrackInfoProps>(), {
  isDownloading: false,
  downloadingTrack: null,
  isDownloaded: false,
  isFailed: false,
  isSkipped: false,
  
  downloadingLyricsTrack: null,
  downloadedLyrics: false,
  failedLyrics: false,
  skippedLyrics: false,
  
  checkingAvailability: false,
  
  downloadingCover: false,
  downloadedCover: false,
  failedCover: false,
  skippedCover: false,
});

const emit = defineEmits<{
  download: [
    id: string, name: string, artists: string, albumName?: string, 
    spotifyId?: string, playlistName?: string, durationMs?: number, 
    position?: number, albumArtist?: string, releaseDate?: string, 
    coverUrl?: string, spotifyTrackNumber?: number, spotifyDiscNumber?: number, 
    spotifyTotalTracks?: number, spotifyTotalDiscs?: number, 
    copyright?: string, publisher?: string
  ],
  downloadLyrics: [
    spotifyId: string, name: string, artists: string, albumName?: string, 
    playlistName?: string, isArtistDiscography?: boolean, position?: number,
    albumArtist?: string, releaseDate?: string, discNumber?: number
  ],
  checkAvailability: [spotifyId: string],
  downloadCover: [
    coverUrl: string, trackName: string, artistName: string, albumName?: string, 
    playlistName?: string, isArtistDiscography?: boolean, position?: number, trackId?: string, 
    albumArtist?: string, releaseDate?: string, discNumber?: number
  ],
  openFolder: [],
  albumClick: [{ id: string, name: string, external_urls: string }],
  artistClick: [{ id: string, name: string, external_urls: string }],
  back: []
}>();

const { playPreview, loadingPreview, playingTrack } = usePreview();

const hasAlbumClick = computed(() => {
  return !!(props.track.album_id && props.track.album_url);
});

const clickableArtists = computed(() => {
  return buildClickableArtists(
    props.track.artists, 
    props.track.artists_data, 
    props.track.artist_id, 
    props.track.artist_url
  );
});

const formatDuration = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const formatPlays = (plays?: string) => {
  if (!plays) return "";
  const num = parseInt(plays, 10);
  if (isNaN(num)) return plays;
  return num.toLocaleString();
};

const handleDownload = () => {
  emit('download',
    props.track.spotify_id || "", props.track.name, props.track.artists, 
    props.track.album_name, props.track.spotify_id, undefined, 
    props.track.duration_ms, props.track.track_number, props.track.album_artist, 
    props.track.release_date, props.track.images, props.track.track_number, 
    props.track.disc_number, props.track.total_tracks, props.track.total_discs, 
    props.track.copyright, props.track.publisher
  );
};

const handleDownloadLyrics = () => {
  if (props.track.spotify_id) {
    emit('downloadLyrics', 
      props.track.spotify_id, props.track.name, props.track.artists, 
      props.track.album_name, undefined, false, props.track.track_number,
      props.track.album_artist, props.track.release_date, props.track.disc_number
    );
  }
};

const handleCheckAvailability = () => {
  if (props.track.spotify_id) {
    emit('checkAvailability', props.track.spotify_id);
  }
};

const handleDownloadCover = () => {
  if (props.track.images) {
    emit('downloadCover', 
      props.track.images, props.track.name, props.track.artists, 
      props.track.album_name, undefined, false, props.track.track_number,
      props.track.spotify_id, props.track.album_artist, props.track.release_date, props.track.disc_number
    );
  }
};
</script>

<template>
  <Card className="relative">
    <div class="absolute top-4 right-4 z-10">
        <Button variant="ghost" size="icon" @click="emit('back')">
            <XCircle class="h-5 w-5"/>
        </Button>
    </div>
    
    <CardContent class="px-6 py-6">
      <div class="flex gap-6 items-start">
        <div class="shrink-0">
          <div v-if="track.images" class="relative w-48 h-48 rounded-md shadow-lg overflow-hidden">
            <img :src="track.images" :alt="track.name" class="w-full h-full object-cover"/>
            <div class="absolute bottom-1 right-1 bg-black/80 text-white px-1.5 py-0.5 text-xs font-medium rounded">
              {{ formatDuration(track.duration_ms) }}
            </div>
          </div>
        </div>
        
        <div class="flex-1 space-y-4 min-w-0">
          <div class="space-y-1">
            <div class="flex items-center gap-3">
              <h1 class="text-3xl font-bold break-words">{{ track.name }}</h1>
              
              <span v-if="track.is_explicit" class="inline-flex items-center justify-center bg-red-600 text-white text-[10px] h-4 w-4 rounded shrink-0" title="Explicit">E</span>
              
              <FileCheck v-if="isSkipped" class="h-6 w-6 text-yellow-500 shrink-0"/>
              <CheckCircle v-else-if="isDownloaded" class="h-6 w-6 text-green-500 shrink-0"/>
              <XCircle v-else-if="isFailed" class="h-6 w-6 text-red-500 shrink-0"/>
            </div>
            
            <p class="text-lg text-muted-foreground">
              <template v-if="clickableArtists.length > 0">
                <span v-for="(artist, index) in clickableArtists" :key="`${artist.id || artist.name}-${index}`">
                    <span 
                      class="cursor-pointer hover:underline" 
                      @click="emit('artistClick', { id: artist.id, name: artist.name, external_urls: artist.external_urls })"
                    >
                        {{ artist.name }}
                    </span>
                    <span v-if="index < clickableArtists.length - 1">, </span>
                </span>
              </template>
              <template v-else>
                {{ track.artists }}
              </template>
            </p>
          </div>
          
          <div class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div class="space-y-3">
              <div>
                <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-0.5">Album</p>
                <p class="font-medium truncate leading-tight">
                  <span v-if="hasAlbumClick" class="cursor-pointer hover:underline text-primary/90" @click="emit('albumClick', { id: track.album_id!, name: track.album_name, external_urls: track.album_url! })">
                    {{ track.album_name }}
                  </span>
                  <span v-else>
                    {{ track.album_name }}
                  </span>
                </p>
              </div>
              
              <div v-if="track.isrc">
                <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-0.5">ISRC</p>
                <p class="font-mono text-xs">{{ track.isrc }}</p>
              </div>

              <div v-if="track.plays">
                <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-0.5">Total Plays</p>
                <p class="font-medium tabular-nums">{{ formatPlays(track.plays) }}</p>
              </div>
            </div>
            
            <div class="space-y-3">
              <div>
                <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-0.5">Release Date</p>
                <p class="font-medium uppercase">{{ track.release_date }}</p>
              </div>
              
              <div v-if="track.publisher">
                <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-0.5">Publisher</p>
                <p class="font-medium truncate leading-tight" :title="track.publisher">{{ track.publisher }}</p>
              </div>

              <div v-if="track.copyright">
                <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-0.5">Copyright</p>
                <p class="text-[11px] text-muted-foreground leading-snug line-clamp-2" :title="track.copyright">
                  {{ track.copyright }}
                </p>
              </div>
            </div>
          </div>
          
          <TooltipProvider v-if="track.spotify_id">
            <div class="flex gap-2 flex-wrap">
              <Button @click="handleDownload" :disabled="isDownloading || downloadingTrack === track.spotify_id">
                <Spinner v-if="downloadingTrack === track.spotify_id" />
                <template v-else>
                  <Download class="h-4 w-4 mr-2"/>
                  Download
                </template>
              </Button>
              
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button @click="playPreview(track.spotify_id!, track.name)" variant="outline" size="icon" :disabled="loadingPreview === track.spotify_id">
                    <Spinner v-if="loadingPreview === track.spotify_id" />
                    <Pause v-else-if="playingTrack === track.spotify_id" class="h-4 w-4"/>
                    <Play v-else class="h-4 w-4"/>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ playingTrack === track.spotify_id ? "Stop Preview" : "Play Preview" }}</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button @click="handleDownloadLyrics" variant="outline" size="icon" :disabled="downloadingLyricsTrack === track.spotify_id">
                    <Spinner v-if="downloadingLyricsTrack === track.spotify_id" />
                    <FileCheck v-else-if="skippedLyrics" class="h-4 w-4 text-yellow-500"/>
                    <CheckCircle v-else-if="downloadedLyrics" class="h-4 w-4 text-green-500"/>
                    <XCircle v-else-if="failedLyrics" class="h-4 w-4 text-red-500"/>
                    <FileText v-else class="h-4 w-4"/>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Download Separate Lyric</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip v-if="track.images">
                <TooltipTrigger as-child>
                  <Button @click="handleDownloadCover" variant="outline" size="icon" :disabled="downloadingCover">
                    <Spinner v-if="downloadingCover" />
                    <FileCheck v-else-if="skippedCover" class="h-4 w-4 text-yellow-500"/>
                    <CheckCircle v-else-if="downloadedCover" class="h-4 w-4 text-green-500"/>
                    <XCircle v-else-if="failedCover" class="h-4 w-4 text-red-500"/>
                    <ImageDown v-else class="h-4 w-4"/>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Download Separate Cover</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button @click="handleCheckAvailability" variant="outline" size="icon" :disabled="checkingAvailability">
                    <Spinner v-if="checkingAvailability" />
                    <template v-else-if="availability">
                       <CheckCircle v-if="hasAvailabilityLinks(availability)" class="h-4 w-4 text-green-500"/>
                       <XCircle v-else class="h-4 w-4 text-red-500"/>
                    </template>
                    <Globe v-else class="h-4 w-4"/>
                  </Button>
                </TooltipTrigger>
                <TooltipContent class="pointer-events-auto">
                  <SfAvailabilityLinks v-if="availability" :availability="availability"/>
                  <span v-else>Check Availability</span>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip v-if="isDownloaded">
                <TooltipTrigger as-child>
                  <Button @click="emit('openFolder')" variant="outline" size="icon">
                    <FolderOpen class="h-4 w-4"/>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Open Folder</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
