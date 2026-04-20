<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { 
  Trash2, ExternalLink, Search, ArrowUpDown, History, Play, Pause, 
  Database, CloudUpload, Music2, Disc3, ListMusic, UserRound,
  FileAudio, LayoutGrid, List, Clock, Filter, Trash
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { Pagination } from '@/components/ui/pagination';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle 
} from '@/components/ui/dialog';
import SfPlatformIcons from './SfPlatformIcons.vue';

interface DownloadHistoryItem {
  id: string;
  spotify_id: string;
  title: string;
  artists: string;
  album: string;
  duration_str: string;
  cover_url: string;
  quality: string;
  format: string;
  path: string;
  source: string;
  timestamp: number;
}

interface FetchHistoryItem {
  id: string;
  url: string;
  type: string;
  name: string;
  info: string;
  image: string;
  data: string;
  timestamp: number;
}

const emit = defineEmits<{
  (e: 'historySelect', cachedData: string): void;
}>();

const activeTab = ref<'downloads' | 'fetches'>('downloads');
const downloadHistory = ref<DownloadHistoryItem[]>([]);
const fetchHistory = ref<FetchHistoryItem[]>([]);

const downloadSearchQuery = ref('');
const downloadSortBy = ref('date_desc');
const downloadCurrentPage = ref(1);

const fetchSearchQuery = ref('');
const activeFetchTab = ref('track');
const fetchCurrentPage = ref(1);

const ITEMS_PER_PAGE = 50;

const loadDownloadHistory = async () => {
  try {
    const items = await invoke<DownloadHistoryItem[]>('get_download_history');
    downloadHistory.value = items || [];
  } catch (err) {
    // console.error("Failed to load download history:", err);
  }
};

const loadFetchHistory = async () => {
  try {
    const items = await invoke<FetchHistoryItem[]>('get_fetch_history');
    fetchHistory.value = items || [];
  } catch (err) {
    // console.error("Failed to load fetch history:", err);
  }
};

let pollInterval: any = null;

onMounted(() => {
  loadDownloadHistory();
  loadFetchHistory();
  pollInterval = setInterval(() => {
    if (activeTab.value === 'downloads') loadDownloadHistory();
    else loadFetchHistory();
  }, 10000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});

const formatDate = (ts: number) => {
  const d = new Date(ts * 1000);
  return d.toLocaleString();
};

const filteredDownloadHistory = computed(() => {
  let result = [...downloadHistory.value];
  if (downloadSearchQuery.value) {
    const q = downloadSearchQuery.value.toLowerCase();
    result = result.filter(v => v.title.toLowerCase().includes(q) || v.artists.toLowerCase().includes(q) || v.album.toLowerCase().includes(q));
  }
  
  result.sort((a, b) => {
    if (downloadSortBy.value === 'date_desc') return b.timestamp - a.timestamp;
    if (downloadSortBy.value === 'date_asc') return a.timestamp - b.timestamp;
    if (downloadSortBy.value === 'title_asc') return a.title.localeCompare(b.title);
    if (downloadSortBy.value === 'title_desc') return b.title.localeCompare(a.title);
    return 0;
  });
  
  return result;
});

const paginatedDownloads = computed(() => {
  const start = (downloadCurrentPage.value - 1) * ITEMS_PER_PAGE;
  return filteredDownloadHistory.value.slice(start, start + ITEMS_PER_PAGE);
});

const filteredFetchHistory = computed(() => {
  let result = fetchHistory.value.filter(v => v.type?.toLowerCase() === activeFetchTab.value);
  if (fetchSearchQuery.value) {
    const q = fetchSearchQuery.value.toLowerCase();
    result = result.filter(v => v.name.toLowerCase().includes(q) || v.info.toLowerCase().includes(q));
  }
  result.sort((a, b) => b.timestamp - a.timestamp);
  return result;
});

const paginatedFetch = computed(() => {
  const start = (fetchCurrentPage.value - 1) * ITEMS_PER_PAGE;
  return filteredFetchHistory.value.slice(start, start + ITEMS_PER_PAGE);
});

const clearDownloads = async () => {
  try {
    await invoke('clear_download_history');
    await loadDownloadHistory();
  } catch (err) {
    // console.error(err);
  }
};

const clearFetch = async () => {
  try {
    await invoke('clear_fetch_history_by_type', { itemType: activeFetchTab.value });
    await loadFetchHistory();
  } catch (err) {
    // console.error(err);
  }
};

const deleteDownloadItem = async (id: string) => {
  try {
    await invoke('delete_download_history_item', { id });
    await loadDownloadHistory();
  } catch (err) {
    // console.error(err);
  }
};

const deleteFetchItem = async (id: string) => {
  try {
    await invoke('delete_fetch_history_item', { id });
    await loadFetchHistory();
  } catch (err) {
    // console.error(err);
  }
};

const getPlatform = (source: string) => {
  const s = source.toLowerCase();
  if (s.includes('tidal')) return 'tidal';
  if (s.includes('qobuz')) return 'qobuz';
  if (s.includes('amazon')) return 'amazon';
  return 'spotify';
};

const getTrackLink = (spotifyId: string) => {
    if (spotifyId?.startsWith("tidal_")) return `https://listen.tidal.com/track/${spotifyId.replace("tidal_", "")}`;
    if (spotifyId?.startsWith("qobuz_")) return `https://www.qobuz.com/track/${spotifyId.replace("qobuz_", "")}`;
    if (spotifyId?.startsWith("amazon_")) return `https://music.amazon.com/tracks/${spotifyId.replace("amazon_", "")}`;
    return `https://open.spotify.com/track/${spotifyId}`;
};

const openInBrowser = async (url: string) => {
  try {
    await invoke('open_url', { url });
  } catch (error) {
    // console.error("Failed to open URL via backend:", error);
    window.open(url, '_blank');
  }
};

const restoreFetchState = (item: FetchHistoryItem) => {
  if (!item.data) return;
  emit('historySelect', item.data);
};

const showClearConfirm = ref(false);
</script>

<template>
  <div class="h-full flex flex-col space-y-6 max-w-[1400px] mx-auto pb-12">
    <!-- Header Section -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 sticky top-0 bg-background/95 backdrop-blur z-20">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">History</h1>
        <p class="text-muted-foreground">Manage your download logs and previous metadata fetches.</p>
      </div>
      
      <div class="flex p-1 bg-muted rounded-xl gap-1">
        <button 
          @click="activeTab = 'downloads'" 
          :class="['px-6 py-2 rounded-lg text-sm font-medium transition-all', activeTab === 'downloads' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground']"
        >
          Downloads
        </button>
        <button 
          @click="activeTab = 'fetches'" 
          :class="['px-6 py-2 rounded-lg text-sm font-medium transition-all', activeTab === 'fetches' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground']"
        >
          Fetch Logs
        </button>
      </div>
    </div>

    <!-- Downloads Tab Content -->
    <div v-if="activeTab === 'downloads'" class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <!-- Toolbar -->
      <div class="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div class="flex items-center gap-3 w-full sm:w-auto">
          <div class="relative w-full sm:w-80 group">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input v-model="downloadSearchQuery" placeholder="Search tracks, artists, albums..." class="pl-10 h-10 border-muted-foreground/20 focus-visible:ring-primary" />
          </div>
          <Select v-model="downloadSortBy">
            <SelectTrigger class="w-[180px] h-10">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Latest first</SelectItem>
              <SelectItem value="date_asc">Oldest first</SelectItem>
              <SelectItem value="title_asc">Title A-Z</SelectItem>
              <SelectItem value="title_desc">Title Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <Button v-if="downloadHistory.length > 0" variant="destructive" size="sm" @click="showClearConfirm = true" class="gap-2 h-10">
          <Trash2 class="h-4 w-4" />
          Clear All History
        </Button>
      </div>

      <!-- Downloads History List -->
      <div v-if="paginatedDownloads.length > 0" class="space-y-3">
        <Card v-for="item in paginatedDownloads" :key="item.id" class="group overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
          <CardContent class="p-0">
            <div class="flex items-center p-3 gap-4">
              <div class="relative h-14 w-14 rounded-lg overflow-hidden flex-shrink-0 shadow-md">
                <img :src="item.cover_url" class="h-full w-full object-cover transition-transform group-hover:scale-110 duration-500" />
                <div class="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-[2px] py-0.5 flex justify-center">
                  <SfPlatformIcons :platform="getPlatform(item.source)" class="h-3 w-3" />
                </div>
              </div>
              
              <div class="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                <div class="flex-1 min-w-0">
                  <h4 class="font-bold text-sm truncate group-hover:text-primary transition-colors">{{ item.title }}</h4>
                <p class="text-xs text-muted-foreground truncate">{{ item.artists }} • {{ item.album }}</p>
                </div>
                
                <div class="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline" class="font-mono text-[10px] px-1.5 h-5 bg-background">{{ item.format.toUpperCase() }}</Badge>
                  <Badge variant="secondary" class="font-mono text-[10px] px-1.5 h-5">{{ item.quality }}</Badge>
                </div>
                
                <div class="hidden md:flex flex-col items-end gap-0.5 w-32 flex-shrink-0">
                  <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Downloaded</span>
                  <span class="text-xs font-mono font-bold">{{ formatDate(item.timestamp).split(',')[0] }}</span>
                </div>
              </div>

              <div class="flex items-center gap-1">
                <Tooltip content="Open in Browser">
                  <Button variant="ghost" size="icon" @click="openInBrowser(getTrackLink(item.spotify_id))" class="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-500">
                    <ExternalLink class="h-4 w-4" />
                  </Button>
                </Tooltip>
                <Tooltip content="Delete Log">
                  <Button variant="ghost" size="icon" @click="deleteDownloadItem(item.id)" class="h-8 w-8 hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 class="h-4 w-4" />
                  </Button>
                </Tooltip>
              </div>
            </div>
            
            <div class="px-3 py-1 bg-muted/30 border-t flex justify-between items-center bg-transparent group-hover:bg-muted/10 transition-colors">
               <span class="text-[10px] font-mono text-muted-foreground truncate max-w-md opacity-40 group-hover:opacity-100 transition-opacity">
                 Path: {{ item.path }}
               </span>
               <span class="text-[10px] font-mono text-muted-foreground tabular-nums opacity-60">
                 {{ formatDate(item.timestamp).split(',')[1] }}
               </span>
            </div>
          </CardContent>
        </Card>

        <!-- Pagination -->
        <div class="pt-6">
          <Pagination 
            :total="filteredDownloadHistory.length" 
            :perPage="ITEMS_PER_PAGE" 
            :current="downloadCurrentPage" 
            @change="downloadCurrentPage = $event"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div class="h-20 w-20 rounded-full bg-muted flex items-center justify-center text-muted-foreground opacity-40">
           <History class="h-10 w-10" />
        </div>
        <div class="space-y-1">
          <h3 class="text-xl font-bold">No download history</h3>
          <p class="text-muted-foreground text-sm max-w-sm">Items will appear here once you start downloading tracks from your providers.</p>
        </div>
      </div>
    </div>

    <!-- Fetch Logs Tab -->
    <div v-else class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div class="flex flex-col sm:flex-row gap-4 items-center justify-between">
         <div class="flex p-1 bg-muted rounded-lg gap-1">
            <button @click="activeFetchTab = 'track'" :class="['px-4 py-1.5 rounded-md text-xs font-bold transition-all', activeFetchTab === 'track' ? 'bg-background shadow text-primary' : 'text-muted-foreground shadow-none']">
              TRACKS
            </button>
            <button @click="activeFetchTab = 'album'" :class="['px-4 py-1.5 rounded-md text-xs font-bold transition-all', activeFetchTab === 'album' ? 'bg-background shadow text-primary' : 'text-muted-foreground shadow-none']">
              ALBUMS
            </button>
            <button @click="activeFetchTab = 'playlist'" :class="['px-4 py-1.5 rounded-md text-xs font-bold transition-all', activeFetchTab === 'playlist' ? 'bg-background shadow text-primary' : 'text-muted-foreground shadow-none']">
              PLAYLISTS
            </button>
            <button @click="activeFetchTab = 'artist'" :class="['px-4 py-1.5 rounded-md text-xs font-bold transition-all', activeFetchTab === 'artist' ? 'bg-background shadow text-primary' : 'text-muted-foreground shadow-none']">
              ARTISTS
            </button>
         </div>

         <div class="flex items-center gap-3 w-full sm:w-auto">
            <div class="relative w-full sm:w-64 group">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input v-model="fetchSearchQuery" placeholder="Filter logs..." class="pl-10 h-10 border-muted-foreground/20 focus-visible:ring-primary" />
            </div>
            <Button v-if="filteredFetchHistory.length > 0" variant="outline" size="sm" @click="clearFetch" class="h-10 gap-2 text-destructive border-destructive/20 hover:bg-destructive/5">
              <Trash2 class="h-4 w-4" />
              Clear Tab
            </Button>
         </div>
      </div>

      <!-- Fetch History Grid -->
      <div v-if="paginatedFetch.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card v-for="item in paginatedFetch" :key="item.id" class="group transition-all hover:border-primary/40 hover:translate-y-[-2px] hover:shadow-lg shadow-black/20">
          <CardContent class="p-3">
             <div class="flex gap-3">
                <div class="h-16 w-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted shadow-inner">
                  <img :src="item.image" class="h-full w-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                </div>
                <div class="flex-1 min-w-0 pr-6">
                  <h4 class="font-bold text-sm truncate group-hover:text-primary transition-colors">{{ item.name }}</h4>
                  <p class="text-xs text-muted-foreground truncate">{{ item.info }}</p>
                  <div class="mt-1 flex items-center gap-2">
                    <Clock class="h-3 w-3 text-muted-foreground/60" />
                    <span class="text-[10px] font-mono text-muted-foreground/80">{{ formatDate(item.timestamp) }}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" @click="deleteFetchItem(item.id)" class="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 class="h-3.5 w-3.5" />
                </Button>
             </div>
             <div class="mt-3 flex gap-2">
                <Button variant="secondary" size="sm" class="flex-1 h-8 text-[11px] font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-colors overflow-hidden relative" @click="restoreFetchState(item)">
                  <span class="relative z-10 flex items-center gap-1 justify-center">
                    <CloudUpload class="h-3.5 w-3.5" />
                    RESTORE STATE
                  </span>
                </Button>
                <Tooltip content="Open Original URL">
                   <Button variant="outline" size="sm" @click="openInBrowser(item.url)" class="h-8 w-8 p-0">
                     <ExternalLink class="h-3.5 w-3.5" />
                   </Button>
                </Tooltip>
             </div>
          </CardContent>
        </Card>
      </div>

      <!-- Empty State for Fetch -->
      <div v-else class="flex flex-col items-center justify-center py-24 text-center space-y-4 border-2 border-dashed border-muted rounded-3xl">
        <div class="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground/30">
           <Database class="h-8 w-8" />
        </div>
        <div class="space-y-1">
          <h3 class="text-lg font-bold">No fetch logs found</h3>
          <p class="text-muted-foreground text-xs font-mono max-w-xs uppercase">logs directory is empty or filter yielded no results</p>
        </div>
      </div>
      
      <!-- Pagination for Fetch -->
      <div v-if="filteredFetchHistory.length > ITEMS_PER_PAGE" class="pt-6">
        <Pagination 
          :total="filteredFetchHistory.length" 
          :perPage="ITEMS_PER_PAGE" 
          :current="fetchCurrentPage" 
          @change="fetchCurrentPage = $event"
        />
      </div>
    </div>

    <!-- Confirmation Dialog -->
    <Dialog v-model:open="showClearConfirm">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Clear All History?</DialogTitle>
          <DialogDescription>
            This will permanently delete all records of previous downloads from the local database. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="mt-4 gap-2">
          <Button variant="ghost" @click="showClearConfirm = false">Cancel</Button>
          <Button variant="destructive" @click="() => { clearDownloads(); showClearConfirm = false; }">
            Yes, Clear Everything
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.group-hover-show {
  opacity: 0;
  transition: opacity 0.2s ease;
}
.group:hover .group-hover-show {
  opacity: 1;
}
</style>
