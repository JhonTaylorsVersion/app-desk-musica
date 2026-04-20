<script setup lang="ts">
import { computed } from "vue";
import {
  Download,
  FolderOpen,
  Search,
  User,
  Music,
  Calendar,
  Layers,
  Clock,
  ShieldCheck,
  ExternalLink,
  ChevronLeft,
  Play,
  LayoutGrid,
  X,
  XCircle,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import SfTrackList from "./SfTrackList.vue";

const props = withDefaults(
  defineProps<{
    playlistInfo: any;
    trackList: any[];
    isDownloading: boolean;
    downloadProgress: number;
    currentDownloadInfo: any;
    downloadedTracks: Set<string>;
    selectedTracks: string[];
    failedTracks?: Set<string>;
    skippedTracks?: Set<string>;
    downloadingTrack?: string | null;
    itemsPerPage?: number;
    currentPage?: number;

    downloadedLyrics?: Set<string>;
    failedLyrics?: Set<string>;
    skippedLyrics?: Set<string>;
    downloadingLyricsTrack?: string | null;
    isBulkDownloadingLyrics?: boolean;

    downloadedCovers?: Set<string>;
    failedCovers?: Set<string>;
    skippedCovers?: Set<string>;
    downloadingCoverTrack?: string | null;
    isBulkDownloadingCovers?: boolean;

    availabilityMap?: Map<string, any>;
    checkingAvailability?: boolean;
    checkingTrackId?: string | null;
    searchQuery?: string;
    sortBy?: string;
  }>(),
  {
    failedTracks: () => new Set(),
    skippedTracks: () => new Set(),
    downloadingTrack: null,
    itemsPerPage: 100,
    currentPage: 1,
    searchQuery: "",
    sortBy: "default",
  },
);

const emit = defineEmits<{
  (e: "back"): void;
  (e: "downloadAll"): void;
  (e: "downloadSelected"): void;
  (e: "stopDownload"): void;
  (e: "openFolder"): void;
  (e: "toggleTrack", id: string): void;
  (e: "toggleSelectAll"): void;
  (e: "downloadTrack", ...args: any[]): void;
  (e: "downloadLyrics", ...args: any[]): void;
  (e: "downloadCover", ...args: any[]): void;
  (e: "checkAvailability", id: string): void;
  (e: "downloadAllLyrics"): void;
  (e: "downloadAllCovers"): void;
  (e: "pageChange", page: number): void;
  (e: "searchChange", query: string): void;
  (e: "sortChange", sortBy: string): void;
}>();

const formatFollowers = (count: number) => {
  if (count >= 1000000) return (count / 1000000).toFixed(1) + "M";
  if (count >= 1000) return (count / 1000).toFixed(1) + "K";
  return count.toString();
};
</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
    <!-- Playlist Header -->
    <div
      class="relative overflow-hidden rounded-3xl group border shadow-2xl bg-card"
    >
      <!-- Background Blur -->
      <div class="absolute inset-0 z-0">
        <img
          :src="playlistInfo.cover"
          class="w-full h-full object-cover blur-3xl opacity-20 scale-150"
        />
        <div
          class="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent"
        ></div>
      </div>

      <div class="absolute top-6 right-6 z-50">
        <Button
          variant="ghost"
          size="icon"
          @click="emit('back')"
          class="rounded-full bg-background/20 hover:bg-background/40 backdrop-blur-md text-foreground border border-white/10 shadow-xl transition-all active:scale-90 h-10 w-10"
        >
          <XCircle class="h-6 w-6" />
        </Button>
      </div>

      <div
        class="relative z-10 p-8 flex flex-col md:flex-row gap-8 items-center md:items-end w-full"
      >
        <div
          class="h-64 w-64 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0 border border-white/10 group-hover:scale-105 transition-transform duration-700"
        >
          <img :src="playlistInfo.cover" class="h-full w-full object-cover" />
        </div>

        <div class="flex-1 space-y-4 text-center md:text-left">
          <div class="space-y-2">
            <div
              class="flex items-center justify-center md:justify-start gap-2"
            >
              <Badge
                variant="secondary"
                class="bg-primary/10 text-primary border-primary/20 font-bold uppercase tracking-widest text-[10px]"
                >Playlist</Badge
              >
              <span
                v-if="playlistInfo.public"
                class="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-50"
                >Public</span
              >
            </div>
            <h1
              class="text-4xl md:text-6xl font-black tracking-tighter leading-none"
            >
              {{ playlistInfo.name }}
            </h1>
          </div>

          <div
            class="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2 text-sm text-muted-foreground font-medium"
          >
            <div class="flex items-center gap-1.5">
              <User class="h-4 w-4 text-primary" />
              {{ playlistInfo.owner?.display_name || playlistInfo.owner?.name }}
            </div>
            <div class="flex items-center gap-1.5">
              <Music class="h-4 w-4 text-primary" />
              {{ playlistInfo.tracks?.total }} tracks
            </div>
            <div class="flex items-center gap-1.5">
              <Clock class="h-4 w-4 text-primary" />
              {{
                formatFollowers(
                  playlistInfo.followers?.total ?? playlistInfo.followers ?? 0,
                )
              }}
              followers
            </div>
          </div>

          <div
            class="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-4"
          >
            <Button
              v-if="isDownloading"
              variant="destructive"
              @click="emit('stopDownload')"
              class="rounded-xl h-12 px-8 font-bold shadow-lg shadow-red-500/20"
            >
              Stop Sync
            </Button>
            <Button
              v-else
              @click="emit('downloadAll')"
              class="rounded-xl h-12 px-8 font-bold shadow-lg shadow-primary/20 gap-2"
            >
              <Download class="h-5 w-5" />
              Download All Tracks
            </Button>

            <Button
              variant="outline"
              @click="emit('downloadSelected')"
              :disabled="selectedTracks.length === 0"
              class="rounded-xl h-12 px-6 font-bold"
            >
              Download Selected ({{ selectedTracks.length }})
            </Button>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    @click="emit('openFolder')"
                    class="h-12 w-12 rounded-xl bg-accent/50 hover:bg-accent"
                  >
                    <FolderOpen class="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Open sync directory</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>

    <!-- Track List -->
    <Card class="border-none shadow-none bg-transparent">
      <SfTrackList
        :tracks="trackList"
        :selected-tracks="selectedTracks"
        :downloaded-tracks="downloadedTracks"
        :downloading-track="isDownloading ? currentDownloadInfo?.id : null"
        :downloaded-lyrics="downloadedLyrics"
        :failed-lyrics="failedLyrics"
        :skipped-lyrics="skippedLyrics"
        :downloading-lyrics-track="downloadingLyricsTrack"
        :downloaded-covers="downloadedCovers"
        :failed-covers="failedCovers"
        :skipped-covers="skippedCovers"
        :downloading-cover-track="downloadingCoverTrack"
        :availability-map="availabilityMap"
        :checking-availability="checkingAvailability"
        :checking-track-id="checkingTrackId"
        :current-page="currentPage"
        :items-per-page="itemsPerPage"
        :search-query="searchQuery"
        :sort-by="sortBy"
        @toggle-track="(id) => emit('toggleTrack', id)"
        @toggle-select-all="emit('toggleSelectAll')"
        @download-track="(...args: any[]) => emit('downloadTrack', ...args)"
        @download-lyrics="(...args: any[]) => emit('downloadLyrics', ...args)"
        @download-cover="(...args: any[]) => emit('downloadCover', ...args)"
        @check-availability="(id) => emit('checkAvailability', id)"
        @page-change="(page) => emit('pageChange', page)"
      />
    </Card>
  </div>
</template>
