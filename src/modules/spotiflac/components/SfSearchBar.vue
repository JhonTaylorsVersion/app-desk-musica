<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import {
  CloudDownload,
  Link,
  Search,
  XCircle,
  X,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { invoke } from '@tauri-apps/api/core';
import { useTypingEffect } from '../composables/useTypingEffect';
import { useSettings } from '../composables/useSettings';
import SfFetchHistory from './SfFetchHistory.vue';
import type { HistoryItem } from './SfFetchHistory.vue';
import { cn } from '@/lib/utils';

type ResultTab = 'tracks' | 'albums' | 'artists' | 'playlists';

const props = defineProps<{
  url: string;
  loading: boolean;
  history: HistoryItem[];
  hasResult: boolean;
  searchMode: boolean;
  region: string;
}>();

const emit = defineEmits<{
  (e: 'update:url', value: string): void;
  (e: 'update:searchMode', value: boolean): void;
  (e: 'update:region', value: string): void;
  (e: 'fetch'): void;
  (e: 'fetchUrl', url: string): void;
  (e: 'historySelect', item: HistoryItem): void;
  (e: 'historyRemove', id: string): void;
}>();

const FETCH_PLACEHOLDERS = [
  'https://open.spotify.com/track/...',
  'https://open.spotify.com/album/...',
  'https://open.spotify.com/playlist/...',
  'https://open.spotify.com/artist/...',
];

const SEARCH_PLACEHOLDERS = [
  'Golden',
  'Taylor Swift',
  'The Weeknd',
  'Starboy',
  'Joji',
  'Die For You',
];

const REGIONS = [
  'AD', 'AE', 'AG', 'AL', 'AM', 'AO', 'AR', 'AT', 'AU', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BN', 'BO', 'BR', 'BS', 'BT', 'BW', 'BZ', 'CA', 'CD', 'CG', 'CH', 'CI', 'CL', 'CM', 'CO', 'CR', 'CV', 'CW', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'ES', 'ET', 'FI', 'FJ', 'FM', 'FR', 'GA', 'GB', 'GD', 'GE', 'GH', 'GM', 'GN', 'GQ', 'GR', 'GT', 'GW', 'GY', 'HK', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IN', 'IQ', 'IS', 'IT', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MG', 'MH', 'MK', 'ML', 'MN', 'MO', 'MR', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NE', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NZ', 'OM', 'PA', 'PE', 'PG', 'PH', 'PK', 'PL', 'PS', 'PT', 'PW', 'PY', 'QA', 'RO', 'RS', 'RW', 'SA', 'SB', 'SC', 'SE', 'SG', 'SI', 'SK', 'SL', 'SM', 'SN', 'SR', 'ST', 'SV', 'SZ', 'TD', 'TG', 'TH', 'TJ', 'TL', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'US', 'UY', 'UZ', 'VC', 'VE', 'VN', 'VU', 'WS', 'XK', 'ZA', 'ZM', 'ZW',
];

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const getRegionName = (code: string) => {
  try {
    if (code === 'XK') return 'Kosovo';
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
};

const RECENT_SEARCHES_KEY = 'spotiflac_recent_searches';
const MAX_RECENT_SEARCHES = 8;
const SEARCH_LIMIT = 50;

const searchQuery = ref('');
const searchResults = ref<any>(null);
const { settings } = useSettings();
const showRegionSelector = computed(() => settings.value.linkResolver === 'songlink');
const resultFilter = ref('');
const sortOrders = ref<Record<ResultTab, string>>({
  tracks: 'default',
  albums: 'default',
  artists: 'default',
  playlists: 'default',
});
const isSearching = ref(false);
const isLoadingMore = ref(false);
const lastSearchedQuery = ref('');
const activeTab = ref<ResultTab>('tracks');
const recentSearches = ref<string[]>([]);
const hasMore = ref<Record<ResultTab, boolean>>({
  tracks: false,
  albums: false,
  artists: false,
  playlists: false,
});
const showInvalidUrlDialog = ref(false);
const invalidUrl = ref('');

let searchTimeout: ReturnType<typeof setTimeout> | null = null;
const placeholders = computed(() => (props.searchMode ? SEARCH_PLACEHOLDERS : FETCH_PLACEHOLDERS));
const placeholderText = useTypingEffect(placeholders);

onMounted(() => {
  try {
    const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (saved) {
      recentSearches.value = JSON.parse(saved);
    }
  } catch (error) {
    // console.error('Failed to load recent searches:', error);
  }
});

const saveRecentSearch = (query: string) => {
  const trimmed = query.trim();
  if (!trimmed) return;

  const filtered = recentSearches.value.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
  const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
  recentSearches.value = updated;

  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch (error) {
    // console.error('Failed to save recent searches:', error);
  }
};

const removeRecentSearch = (query: string) => {
  const updated = recentSearches.value.filter((s) => s !== query);
  recentSearches.value = updated;

  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch (error) {
    // console.error('Failed to save recent searches:', error);
  }
};

const handleSearch = async () => {
  if (!props.searchMode || !searchQuery.value.trim()) return;
  if (searchQuery.value.trim() === lastSearchedQuery.value) return;

  isSearching.value = true;
  try {
    const results = await invoke<any>('search_spotify', {
      query: searchQuery.value,
      limit: SEARCH_LIMIT,
    });

    searchResults.value = results;
    resultFilter.value = '';
    lastSearchedQuery.value = searchQuery.value.trim();
    saveRecentSearch(searchQuery.value.trim());

    hasMore.value = {
      tracks: results.tracks?.length === SEARCH_LIMIT,
      albums: results.albums?.length === SEARCH_LIMIT,
      artists: results.artists?.length === SEARCH_LIMIT,
      playlists: results.playlists?.length === SEARCH_LIMIT,
    };

    if (results.tracks?.length > 0) activeTab.value = 'tracks';
    else if (results.albums?.length > 0) activeTab.value = 'albums';
    else if (results.artists?.length > 0) activeTab.value = 'artists';
    else if (results.playlists?.length > 0) activeTab.value = 'playlists';
  } catch (error) {
    // console.error('Search failed:', error);
    searchResults.value = null;
  } finally {
    isSearching.value = false;
  }
};

watch([searchQuery, () => props.searchMode], () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  if (props.searchMode && searchQuery.value.trim()) {
    searchTimeout = setTimeout(handleSearch, 400);
  }
});

const handleLoadMore = async () => {
  if (!searchResults.value || !lastSearchedQuery.value || isLoadingMore.value) return;

  const typeMap: Record<ResultTab, string> = {
    tracks: 'track',
    albums: 'album',
    artists: 'artist',
    playlists: 'playlist',
  };

  const currentCount = getTabCount(activeTab.value);
  isLoadingMore.value = true;

  try {
    const moreResults = await invoke<any[]>('search_spotify_by_type', {
      query: lastSearchedQuery.value,
      searchType: typeMap[activeTab.value],
      limit: SEARCH_LIMIT,
      offset: currentCount,
    });

    if (moreResults.length > 0 && searchResults.value) {
      searchResults.value[activeTab.value] = [
        ...(searchResults.value[activeTab.value] || []),
        ...moreResults,
      ];
    }

    hasMore.value[activeTab.value] = moreResults.length === SEARCH_LIMIT;
  } catch (error) {
    // console.error('Load more failed:', error);
  } finally {
    isLoadingMore.value = false;
  }
};

const isSpotifyUrl = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const isUrl = /^(https?:\/\/|www\.)/i.test(trimmed) || /^spotify:/i.test(trimmed);
  if (!isUrl) return true;

  return (
    trimmed.includes('spotify.com') ||
    trimmed.includes('spotify.link') ||
    trimmed.startsWith('spotify:')
  );
};

const handleFetchWithValidation = () => {
  if (!isSpotifyUrl(props.url)) {
    invalidUrl.value = props.url;
    showInvalidUrlDialog.value = true;
    return;
  }

  emit('fetch');
};

const handlePaste = (e: ClipboardEvent) => {
  if (props.searchMode) return;

  const pastedText = e.clipboardData?.getData('text');
  if (pastedText && !isSpotifyUrl(pastedText)) {
    e.preventDefault();
    invalidUrl.value = pastedText;
    showInvalidUrlDialog.value = true;
  }
};

const handleResultClick = (externalUrl: string) => {
  emit('update:searchMode', false);
  emit('fetchUrl', externalUrl);
};

const formatDuration = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const hasAnyResults = computed(
  () =>
    searchResults.value &&
    (searchResults.value.tracks?.length > 0 ||
      searchResults.value.albums?.length > 0 ||
      searchResults.value.artists?.length > 0 ||
      searchResults.value.playlists?.length > 0),
);

const getTabCount = (tab: ResultTab): number => {
  if (!searchResults.value) return 0;
  return searchResults.value[tab]?.length || 0;
};

const sortedResults = computed(() => {
  if (!searchResults.value) return { tracks: [], albums: [], artists: [], playlists: [] };

  const filterStr = resultFilter.value.toLowerCase();

  const processTab = (
    tab: ResultTab,
    filterFn: (item: any) => boolean,
    sortFn: (a: any, b: any) => number,
  ) => {
    const items = [...(searchResults.value[tab] || [])];
    const filteredItems = filterStr ? items.filter(filterFn) : items;
    if (sortOrders.value[tab] !== 'default') filteredItems.sort(sortFn);
    return filteredItems;
  };

  const tracks = processTab(
    'tracks',
    (t) =>
      (t.name || '').toLowerCase().includes(filterStr) ||
      (t.artists || '').toLowerCase().includes(filterStr),
    (a, b) => {
      const s = sortOrders.value.tracks;
      if (s === 'title-asc') return (a.name || '').localeCompare(b.name || '');
      if (s === 'title-desc') return (b.name || '').localeCompare(a.name || '');
      if (s === 'artist-asc') return (a.artists || '').localeCompare(b.artists || '');
      if (s === 'artist-desc') return (b.artists || '').localeCompare(a.artists || '');
      if (s === 'duration-desc') return (b.duration_ms || 0) - (a.duration_ms || 0);
      if (s === 'duration-asc') return (a.duration_ms || 0) - (b.duration_ms || 0);
      return 0;
    },
  );

  const albums = processTab(
    'albums',
    (a) =>
      (a.name || '').toLowerCase().includes(filterStr) ||
      (a.artists || '').toLowerCase().includes(filterStr),
    (a, b) => {
      const s = sortOrders.value.albums;
      if (s === 'title-asc') return (a.name || '').localeCompare(b.name || '');
      if (s === 'title-desc') return (b.name || '').localeCompare(a.name || '');
      if (s === 'artist-asc') return (a.artists || '').localeCompare(b.artists || '');
      if (s === 'artist-desc') return (b.artists || '').localeCompare(a.artists || '');
      if (s === 'year-desc') return (b.release_date || '').localeCompare(a.release_date || '');
      if (s === 'year-asc') return (a.release_date || '').localeCompare(b.release_date || '');
      return 0;
    },
  );

  const artists = processTab(
    'artists',
    (a) => (a.name || '').toLowerCase().includes(filterStr),
    (a, b) => {
      const s = sortOrders.value.artists;
      if (s === 'name-asc') return (a.name || '').localeCompare(b.name || '');
      if (s === 'name-desc') return (b.name || '').localeCompare(a.name || '');
      return 0;
    },
  );

  const playlists = processTab(
    'playlists',
    (p) =>
      (p.name || '').toLowerCase().includes(filterStr) ||
      (p.owner || '').toLowerCase().includes(filterStr),
    (a, b) => {
      const s = sortOrders.value.playlists;
      if (s === 'title-asc') return (a.name || '').localeCompare(b.name || '');
      if (s === 'title-desc') return (b.name || '').localeCompare(a.name || '');
      if (s === 'owner-asc') return (a.owner || '').localeCompare(b.owner || '');
      if (s === 'owner-desc') return (b.owner || '').localeCompare(a.owner || '');
      return 0;
    },
  );

  return { tracks, albums, artists, playlists };
});

const tabs: { key: ResultTab; label: string }[] = [
  { key: 'tracks', label: 'Tracks' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' },
  { key: 'playlists', label: 'Playlists' },
];
</script>

<template>
  <div class="space-y-4 w-full min-w-0">
    <div class="flex items-center gap-2 min-w-0">
      <Tooltip>
        <Button
          variant="outline"
          size="icon"
          class="shrink-0"
          @click="emit('update:searchMode', !searchMode)"
        >
          <Link v-if="searchMode" class="h-4 w-4" />
          <Search v-else class="h-4 w-4" />
        </Button>
        <template #content>
          <p>{{ searchMode ? 'Fetch Mode' : 'Search Mode' }}</p>
        </template>
      </Tooltip>

      <div class="relative flex-1 min-w-0">
        <template v-if="!searchMode">
          <Input
            :model-value="url"
            @update:model-value="(v) => emit('update:url', v)"
            :placeholder="placeholderText"
            class="pr-8"
            @paste="handlePaste"
            @keydown.enter="handleFetchWithValidation"
          />
          <button
            v-if="url"
            @click="emit('update:url', '')"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <XCircle class="h-4 w-4" />
          </button>
        </template>

        <template v-else>
          <Input
            v-model="searchQuery"
            :placeholder="placeholderText"
            class="pr-8"
          />
          <button
            v-if="searchQuery"
            @click="() => { searchQuery = ''; searchResults = null; lastSearchedQuery = ''; resultFilter = ''; }"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <XCircle class="h-4 w-4" />
          </button>
        </template>
      </div>

      <div v-if="!searchMode" class="flex items-center gap-2 shrink-0">
        <Select
          v-if="showRegionSelector"
          :model-value="region"
          @update:model-value="(v) => emit('update:region', v)"
        >
          <SelectTrigger class="w-[70px] shrink-0">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent class="max-h-[300px]">
            <SelectItem v-for="r in REGIONS" :key="r" :value="r" :text-value="r">
              {{ r }}
              <span class="text-muted-foreground">
                ({{ getRegionName(r) }})
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        <Button class="shrink-0" @click="handleFetchWithValidation" :disabled="loading">
          <template v-if="loading">
            <Spinner size="sm" />
            Fetching...
          </template>
          <template v-else>
            <CloudDownload class="h-4 w-4" />
            Fetch
          </template>
        </Button>
      </div>
    </div>

    <SfFetchHistory
      v-if="!searchMode && !hasResult"
      :history="history"
      @select="(i) => emit('historySelect', i)"
      @remove="(id) => emit('historyRemove', id)"
    />

    <div v-if="searchMode" class="space-y-4 min-w-0">
      <div v-if="!searchQuery && !searchResults && recentSearches.length > 0" class="space-y-2">
        <p class="text-sm text-muted-foreground">Recent Searches</p>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="query in recentSearches"
            :key="query"
            class="group relative flex items-center px-3 py-1.5 bg-muted hover:bg-accent rounded-full text-sm cursor-pointer transition-colors"
            @click="searchQuery = query"
          >
            <span>{{ query }}</span>
            <button
              @click.stop="removeRecentSearch(query)"
              class="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow-sm"
            >
              <X class="h-3 w-3 text-red-900" :stroke-width="3" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="isSearching" class="flex items-center justify-center py-8">
        <Spinner />
        <span class="ml-2 text-muted-foreground">Searching...</span>
      </div>

      <div v-else-if="searchQuery && !hasAnyResults" class="text-center py-8 text-muted-foreground">
        No results found for "{{ searchQuery }}"
      </div>

      <div v-else-if="hasAnyResults" class="min-w-0">
        <div class="sf-search-tabs flex gap-8 border-b border-muted mb-6 px-2 overflow-x-auto no-scrollbar">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            v-show="getTabCount(tab.key) > 0"
            type="button"
            @click="activeTab = tab.key"
            :class="cn(
              'pb-3 text-sm font-bold transition-all relative whitespace-nowrap group cursor-pointer',
              activeTab === tab.key
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )"
          >
            {{ tab.label }} ({{ getTabCount(tab.key) }})
            <div 
              v-if="activeTab === tab.key" 
              class="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-t-full animate-in slide-in-from-left-full duration-300" 
            />
          </button>
        </div>

        <div class="flex items-center gap-4 mb-6">
          <div class="relative flex-1 group">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              v-model="resultFilter"
              :placeholder="`Search ${activeTab}...`"
              class="pl-11 pr-10 h-11 bg-muted/30 border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/20 rounded-xl"
            />
            <button
              v-if="resultFilter"
              @click="resultFilter = ''"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <XCircle class="h-4 w-4" />
            </button>
          </div>
          
          <div class="flex items-center gap-2">
            <ArrowUpDown class="h-4 w-4 text-muted-foreground" />
            <Select :model-value="sortOrders[activeTab]" @update:model-value="(v) => (sortOrders[activeTab] = v)">
              <SelectTrigger class="w-[180px] h-11 bg-muted/30 border-none shadow-none focus:ring-1 focus:ring-primary/20 rounded-xl font-bold">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent class="rounded-2xl border-none shadow-2xl">
                <SelectItem value="default" class="rounded-lg">Default</SelectItem>
                <template v-if="activeTab === 'tracks'">
                  <SelectItem value="title-asc" class="rounded-lg">Title (A-Z)</SelectItem>
                  <SelectItem value="title-desc" class="rounded-lg">Title (Z-A)</SelectItem>
                  <SelectItem value="artist-asc" class="rounded-lg">Artist (A-Z)</SelectItem>
                  <SelectItem value="artist-desc" class="rounded-lg">Artist (Z-A)</SelectItem>
                  <SelectItem value="duration-desc" class="rounded-lg">Duration (Longest)</SelectItem>
                  <SelectItem value="duration-asc" class="rounded-lg">Duration (Shortest)</SelectItem>
                </template>
                <template v-if="activeTab === 'albums'">
                  <SelectItem value="title-asc">Title (A-Z)</SelectItem>
                  <SelectItem value="title-desc">Title (Z-A)</SelectItem>
                  <SelectItem value="artist-asc">Artist (A-Z)</SelectItem>
                  <SelectItem value="artist-desc">Artist (Z-A)</SelectItem>
                  <SelectItem value="year-desc">Year (Newest)</SelectItem>
                  <SelectItem value="year-asc">Year (Oldest)</SelectItem>
                </template>
                <template v-if="activeTab === 'artists'">
                  <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                  <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                </template>
                <template v-if="activeTab === 'playlists'">
                  <SelectItem value="title-asc">Title (A-Z)</SelectItem>
                  <SelectItem value="title-desc">Title (Z-A)</SelectItem>
                  <SelectItem value="owner-asc">Owner (A-Z)</SelectItem>
                  <SelectItem value="owner-desc">Owner (Z-A)</SelectItem>
                </template>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="grid gap-2 min-w-0">
          <template v-if="activeTab === 'tracks'">
            <button
              v-for="track in sortedResults.tracks"
              :key="track.id"
              type="button"
              class="flex items-center gap-4 p-4 rounded-2xl bg-muted/10 hover:bg-muted/30 border border-transparent hover:border-muted/50 cursor-pointer text-left transition-all duration-300 min-w-0 shadow-sm"
              @click="handleResultClick(track.external_urls)"
            >
              <img
                v-if="track.images"
                :src="track.images"
                alt=""
                class="w-14 h-14 rounded-xl object-cover shrink-0 shadow-md"
              />
              <div v-else class="w-14 h-14 rounded-xl bg-muted shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 min-w-0 mb-0.5">
                  <p class="text-base font-black truncate tracking-tight">{{ track.name }}</p>
                  <span
                    v-if="track.is_explicit"
                    class="flex items-center justify-center min-w-[18px] h-[18px] rounded-sm bg-destructive text-[10px] font-black text-destructive-foreground leading-none shrink-0"
                    title="Explicit"
                  >
                    E
                  </span>
                </div>
                <p class="text-sm text-muted-foreground font-bold truncate opacity-60">
                  {{ track.artists }}
                </p>
              </div>
              <span class="text-sm text-muted-foreground font-mono font-medium shrink-0 opacity-40">
                {{ formatDuration(track.duration_ms || 0) }}
              </span>
            </button>
          </template>

          <template v-if="activeTab === 'albums'">
            <button
              v-for="album in sortedResults.albums"
              :key="album.id"
              type="button"
              class="flex items-center gap-4 p-4 rounded-2xl bg-muted/10 hover:bg-muted/30 border border-transparent hover:border-muted/50 cursor-pointer text-left transition-all duration-300 min-w-0 shadow-sm"
              @click="handleResultClick(album.external_urls)"
            >
              <img
                v-if="album.images"
                :src="album.images"
                alt=""
                class="w-14 h-14 rounded-xl object-cover shrink-0 shadow-md"
              />
              <div v-else class="w-14 h-14 rounded-xl bg-muted shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-base font-black truncate tracking-tight">{{ album.name }}</p>
                <p class="text-sm text-muted-foreground font-bold truncate opacity-60">
                  {{ album.artists }}
                </p>
              </div>
              <span class="text-sm text-muted-foreground font-medium shrink-0 opacity-40">
                {{ album.release_date || '' }}
              </span>
            </button>
          </template>

          <template v-if="activeTab === 'artists'">
            <button
              v-for="artist in sortedResults.artists"
              :key="artist.id"
              type="button"
              class="flex items-center gap-4 p-4 rounded-2xl bg-muted/10 hover:bg-muted/30 border border-transparent hover:border-muted/50 cursor-pointer text-left transition-all duration-300 min-w-0 shadow-sm"
              @click="handleResultClick(artist.external_urls)"
            >
              <img
                v-if="artist.images"
                :src="artist.images"
                alt=""
                class="w-14 h-14 rounded-full object-cover shrink-0 shadow-md"
              />
              <div v-else class="w-14 h-14 rounded-full bg-muted shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-base font-black truncate tracking-tight">{{ artist.name }}</p>
                <p class="text-sm text-muted-foreground font-bold opacity-60 tracking-wider uppercase text-[10px]">Artist</p>
              </div>
            </button>
          </template>

          <template v-if="activeTab === 'playlists'">
            <button
              v-for="playlist in sortedResults.playlists"
              :key="playlist.id"
              type="button"
              class="flex items-center gap-4 p-4 rounded-2xl bg-muted/10 hover:bg-muted/30 border border-transparent hover:border-muted/50 cursor-pointer text-left transition-all duration-300 min-w-0 shadow-sm"
              @click="handleResultClick(playlist.external_urls)"
            >
              <img
                v-if="playlist.images"
                :src="playlist.images"
                alt=""
                class="w-14 h-14 rounded-xl object-cover shrink-0 shadow-md"
              />
              <div v-else class="w-14 h-14 rounded-xl bg-muted shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-base font-black truncate tracking-tight">{{ playlist.name }}</p>
                <p class="text-sm text-muted-foreground font-bold truncate opacity-60">
                  {{ playlist.owner || '' }}
                </p>
              </div>
            </button>
          </template>
        </div>

        <div v-if="hasMore[activeTab]" class="flex justify-center pt-2">
          <Button variant="outline" @click="handleLoadMore" :disabled="isLoadingMore">
            <template v-if="isLoadingMore">
              <Spinner />
              Loading...
            </template>
            <template v-else>
              <ChevronDown class="h-4 w-4" />
              Load More
            </template>
          </Button>
        </div>
      </div>
    </div>

    <Dialog v-model:open="showInvalidUrlDialog">
      <DialogContent class="sm:max-w-[480px] rounded-3xl p-8 border-none ring-1 ring-muted/20 shadow-3xl backdrop-blur-3xl bg-background/90">
        <DialogHeader class="gap-4">
          <div class="mx-auto bg-destructive/10 w-20 h-20 rounded-full flex items-center justify-center mb-2">
            <XCircle class="h-10 w-10 text-destructive animate-in zoom-in duration-500" />
          </div>
          <DialogTitle class="text-3xl font-black text-center tracking-tighter">URL no válida</DialogTitle>
          <DialogDescription class="text-center text-base font-medium px-4 opacity-80">
            Solo se permiten enlaces oficiales de <span class="text-primary font-black">Spotify</span> en el modo de Sincronización Directa.
          </DialogDescription>
        </DialogHeader>

        <div v-if="invalidUrl" class="my-6 p-6 bg-muted/50 rounded-2xl border-2 border-dashed border-destructive/20 text-xs font-mono break-all opacity-90 text-destructive/80 leading-relaxed shadow-inner">
          <p class="mb-2 font-black uppercase text-[10px] opacity-40">Entrada rechazada:</p>
          {{ invalidUrl }}
        </div>

        <DialogFooter class="sm:justify-center pt-4">
          <Button
            variant="outline"
            @click="showInvalidUrlDialog = false"
            class="rounded-2xl h-14 w-full text-lg font-black hover:bg-muted border-2 transition-all active:scale-[0.98]"
          >
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.sf-search-tabs {
  scrollbar-width: none;
}

.sf-search-tabs button {
  outline: none !important;
}

/* Subtle result item transition */
.grid > button {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease, border-color 0.2s ease;
}

.grid > button:active {
  transform: scale(0.985);
}
</style>
