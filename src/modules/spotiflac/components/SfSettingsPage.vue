<script setup lang="ts">
import { ref, reactive, watch, onMounted } from "vue";
import {
  useSettings,
  type FolderPreset,
  type FilenamePreset,
  type FontFamily,
} from "../composables/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen,
  Save,
  RotateCcw,
  Settings2,
  Database,
  ShieldCheck,
  Palette,
  ExternalLink,
  Files,
  Layout,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FolderSync,
  Hash,
  Activity,
  ChevronRight,
} from "lucide-vue-next";
import { invoke } from "@tauri-apps/api/core";
import { toastWithSound as toast } from "../utils/toast-with-sound";
import SfPlatformIcons from "./SfPlatformIcons.vue";

const props = defineProps<{
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onResetRequest?: ((resetFn: () => void) => void) | null;
}>();

const { settings, save, reset, initialized } = useSettings();

// UI State
const activeTab = ref("general");
const isLoadingStatus = ref(false);
const serviceStatus = ref<Record<string, string>>({});

// Local temporary state for unsaved changes
const tempSettings = reactive({ ...settings.value });

// Watch for external changes to settings
watch(
  settings,
  (newVal) => {
    Object.assign(tempSettings, newVal);
  },
  { deep: true },
);

const hasUnsavedChanges = ref(false);
watch(
  tempSettings,
  () => {
    hasUnsavedChanges.value =
      JSON.stringify(tempSettings) !== JSON.stringify(settings.value);
    props.onUnsavedChangesChange?.(hasUnsavedChanges.value);
  },
  { deep: true },
);

const handleSave = async () => {
  await save({ ...tempSettings });
  hasUnsavedChanges.value = false;
  props.onUnsavedChangesChange?.(false);
  toast.success("Settings saved");
};

const handleReset = async () => {
  await reset();
  Object.assign(tempSettings, settings.value);
  hasUnsavedChanges.value = false;
  props.onUnsavedChangesChange?.(false);
  toast.success("Settings reset to default");
};

const resetToSavedSettings = () => {
  Object.assign(tempSettings, settings.value);
  hasUnsavedChanges.value = false;
  props.onUnsavedChangesChange?.(false);
};

const pickFolder = async () => {
  try {
    const selected = await invoke<string | null>("select_folder");
    if (selected) {
      tempSettings.downloadPath = selected;
    }
  } catch (err) {
    // console.error(err);
  }
};

const openConfigFolder = async () => {
  await invoke("open_config_folder");
};

const fetchStatus = async (force = false) => {
  isLoadingStatus.value = true;
  try {
    const payload = await invoke<string>("fetch_unified_api_status", {
      forceRefresh: force,
    });
    serviceStatus.value = JSON.parse(payload);
  } catch (err) {
    // console.error("Failed to fetch status:", err);
  } finally {
    isLoadingStatus.value = false;
  }
};

onMounted(() => {
  if (activeTab.value === "status") {
    fetchStatus();
  }
});

watch(activeTab, (newTab) => {
  if (newTab === "status") {
    fetchStatus();
  }
});

import {
  FOLDER_PRESETS,
  FILENAME_PRESETS,
  FONT_OPTIONS,
} from "../utils/settings";

const QUALITY_DESC = {
  tidal: {
    LOSSLESS: "16-bit FLAC (CD Quality)",
    HI_RES_LOSSLESS: "24-bit FLAC (High Res)",
  },
  qobuz: {
    "6": "MP3 320kbps",
    "7": "16-bit FLAC",
    "27": "24-bit FLAC",
  },
};

const ACCENTS = [
  { value: "yellow", label: "Yellow", color: "#FFC107" },
  { value: "emerald", label: "Emerald", color: "#10B981" },
  { value: "blue", label: "Blue", color: "#3B82F6" },
  { value: "rose", label: "Rose", color: "#F43F5E" },
];

const SOURCE_ORDER_OPTIONS = [
  "tidal-qobuz-amazon",
  "tidal-amazon-qobuz",
  "qobuz-tidal-amazon",
  "qobuz-amazon-tidal",
  "amazon-tidal-qobuz",
  "amazon-qobuz-tidal",
  "tidal-qobuz",
  "tidal-amazon",
  "qobuz-tidal",
  "qobuz-amazon",
  "amazon-tidal",
  "amazon-qobuz",
];

watch(
  () => props.onResetRequest,
  (registerReset) => {
    registerReset?.(resetToSavedSettings);
  },
  { immediate: true },
);
</script>

<template>
  <div class="h-full flex flex-col space-y-6 max-w-[1000px] mx-auto pb-10">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2">
      <div class="space-y-0.5">
        <h1 class="text-3xl font-extrabold tracking-tight">Settings</h1>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="openConfigFolder" class="gap-2 h-9">
          <FolderOpen class="h-4 w-4" />
          Open Config Folder
        </Button>
        <Button variant="outline" size="sm" @click="handleReset" class="gap-2 h-9">
          <RotateCcw class="h-4 w-4" />
          Reset to Default
        </Button>
        <Button
          @click="handleSave"
          size="sm"
          :disabled="!hasUnsavedChanges"
          class="gap-2 h-9 px-4 bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-all font-bold"
        >
          <Save class="h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </div>

    <!-- Tabs Navigation -->
    <div class="flex items-center gap-1 border-b border-muted">
      <button
        v-for="tab in [
          { id: 'general', label: 'General', icon: Settings2 },
          { id: 'file_management', label: 'File Management', icon: Files },
          { id: 'status', label: 'Status', icon: Activity },
        ]"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="flex items-center gap-2 px-4 py-2 text-sm font-bold transition-all border-b-2 rounded-t-lg"
        :class="[
          activeTab === tab.id
            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
            : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50',
        ]"
      >
        <component :is="tab.icon" class="h-4 w-4" />
        {{ tab.label }}
      </button>
    </div>

    <div v-if="initialized" class="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <!-- GENERAL TAB -->
      <div v-if="activeTab === 'general'" class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
        <!-- LEFT COLUMN: Directories & Visuals -->
        <div class="space-y-6">
          <div class="space-y-2">
            <Label class="text-xs font-black uppercase tracking-widest text-muted-foreground">Download Path</Label>
            <div class="flex gap-2">
              <Input
                v-model="tempSettings.downloadPath"
                placeholder="C:\Users\jhon\Music"
                class="h-9 font-medium text-sm bg-muted/30 border-muted"
              />
              <Button @click="pickFolder" class="h-9 bg-primary hover:bg-primary/90 font-bold">
                <FolderOpen class="h-4 w-4 mr-1" />
                Browse
              </Button>
            </div>
          </div>

          <div class="space-y-2">
            <Label class="text-xs font-black uppercase tracking-widest text-muted-foreground">Appearance</Label>
                <Select v-model="tempSettings.themeMode">
                  <SelectTrigger class="h-9 w-[180px] bg-muted/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
          </div>

          <div class="space-y-2">
            <Label class="text-xs font-black uppercase tracking-widest text-muted-foreground">Accent</Label>
            <Select v-model="tempSettings.theme">
              <SelectTrigger class="h-9 w-[180px] bg-muted/20">
                <SelectValue>
                  <div class="flex items-center gap-2">
                    <div class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: ACCENTS.find(a => a.value === tempSettings.theme)?.color || '#ffd60a' }"></div>
                    {{ ACCENTS.find(a => a.value === tempSettings.theme)?.label || 'Yellow' }}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="accent in ACCENTS" :key="accent.value" :value="accent.value">
                  <div class="flex items-center gap-2">
                    <div class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: accent.color }"></div>
                    {{ accent.label }}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label class="text-xs font-black uppercase tracking-widest text-muted-foreground">Font</Label>
            <Select v-model="tempSettings.fontFamily">
              <SelectTrigger class="h-9 w-[180px] bg-muted/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="f in FONT_OPTIONS" :key="f.value" :value="f.value">
                  {{ f.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center gap-3 pt-1">
            <Switch v-model="tempSettings.sfxEnabled" />
            <Label class="text-sm font-bold">Sound Effects</Label>
          </div>
        </div>

        <!-- RIGHT COLUMN: Services & Toggles -->
        <div class="space-y-6">
          <div class="space-y-2">
            <Label class="text-xs font-black uppercase tracking-widest text-muted-foreground">Link Resolver</Label>
            <div class="flex items-center gap-6">
              <Select v-model="tempSettings.linkResolver">
                <SelectTrigger class="h-9 w-[220px] bg-muted/20">
                  <div class="flex items-center gap-2 capitalize">
                    <SfPlatformIcons :platform="tempSettings.linkResolver" class="h-4 w-4" />
                    {{ tempSettings.linkResolver }}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="songlink">Songlink</SelectItem>
                  <SelectItem value="songstats">Songstats</SelectItem>
                </SelectContent>
              </Select>
              <div class="flex items-center gap-3">
                <Switch v-model="tempSettings.allowResolverFallback" />
                <Label class="text-xs font-bold whitespace-nowrap">Allow Fallback</Label>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <Label class="text-xs font-black uppercase tracking-widest text-muted-foreground">Source</Label>
            <div class="flex items-center gap-3">
              <!-- Box 1: Downloader Strategy (Compact) -->
              <Select v-model="tempSettings.downloader">
                <SelectTrigger class="h-9 w-[110px] bg-muted/20">
                  <SelectValue>
                    <div class="flex items-center gap-2">
                      <SfPlatformIcons v-if="tempSettings.downloader !== 'auto'" :platform="tempSettings.downloader" variant="branded" class="h-4 w-4" />
                      {{ tempSettings.downloader.charAt(0).toUpperCase() + tempSettings.downloader.slice(1) }}
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="tidal">
                    <div class="flex items-center gap-2">
                      <SfPlatformIcons platform="tidal" variant="branded" class="h-4 w-4" />
                      Tidal
                    </div>
                  </SelectItem>
                  <SelectItem value="qobuz">
                    <div class="flex items-center gap-2">
                      <SfPlatformIcons platform="qobuz" variant="branded" class="h-4 w-4" />
                      Qobuz
                    </div>
                  </SelectItem>
                  <SelectItem value="amazon">
                    <div class="flex items-center gap-2">
                      <SfPlatformIcons platform="amazon" variant="branded" class="h-4 w-4" />
                      Amazon
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <!-- Box 2: Auto Order Permutations -->
              <Select v-model="tempSettings.autoOrder">
                <SelectTrigger class="h-9 w-fit min-w-[120px] px-3 bg-muted/20">
                  <SelectValue>
                    <div class="flex items-center gap-1.5">
                      <template v-for="(p, index) in tempSettings.autoOrder.split('-')" :key="index">
                        <SfPlatformIcons :platform="p" variant="branded" class="h-4 w-4" />
                        <ChevronRight v-if="index < tempSettings.autoOrder.split('-').length - 1" class="h-3 w-3 opacity-30" />
                      </template>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="order in SOURCE_ORDER_OPTIONS" :key="order" :value="order">
                    <div class="flex items-center gap-1.5">
                      <template v-for="(p, index) in order.split('-')" :key="index">
                        <SfPlatformIcons :platform="p" variant="branded" class="h-4 w-4" />
                        <ChevronRight v-if="index < order.split('-').length - 1" class="h-3 w-3 opacity-30" />
                      </template>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              
              <!-- Box 3: Quality -->
              <Select v-model="tempSettings.autoQuality">
                <SelectTrigger class="h-9 w-[180px] bg-muted/20">
                  <SelectValue>
                    <span v-if="tempSettings.autoQuality === '16'">16-bit/44.1kHz</span>
                    <span v-else>24-bit/96kHz+</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16">16-bit/44.1kHz</SelectItem>
                  <SelectItem value="24">24-bit/96kHz+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator class="opacity-30 my-4" />

          <!-- Feature Toggles -->
          <div class="space-y-4 pt-1">
            <div class="flex items-center justify-between group">
              <div class="flex items-center gap-3">
                <Switch v-model="tempSettings.embedLyrics" />
                <Label class="text-sm font-bold">Embed Lyrics</Label>
              </div>
            </div>
            <div class="flex items-center justify-between group">
              <div class="flex items-center gap-3">
                <Switch v-model="tempSettings.embedMaxQualityCover" />
                <Label class="text-sm font-bold">Embed Max Quality Cover</Label>
              </div>
            </div>
            <div class="flex items-center justify-between group">
              <div class="flex items-center gap-3">
                <Switch v-model="tempSettings.embedGenre" />
                <Label class="text-sm font-bold">Embed Genre</Label>
              </div>
            </div>
            <div class="flex items-center justify-between group">
              <div class="flex items-center gap-3">
                <Switch v-model="tempSettings.useSingleGenre" />
                <Label class="text-sm font-bold">Use Single Genre</Label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- FILE MANAGEMENT TAB -->
      <div v-if="activeTab === 'file_management'" class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
        <div class="space-y-6">
          <div class="space-y-2">
            <Label class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Folder Structure</Label>
            <Select v-model="tempSettings.folderPreset">
              <SelectTrigger class="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="(v, k) in FOLDER_PRESETS" :key="k" :value="k">{{ v.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-4 pt-2">
             <div class="flex items-center gap-3">
                <Switch v-model="tempSettings.createPlaylistFolder" />
                <Label class="text-sm font-bold">Playlist Folder</Label>
             </div>
             <div class="flex items-center gap-3">
                <Switch v-model="tempSettings.playlistOwnerFolderName" />
                <Label class="text-sm font-bold">Playlist Owner Folder Name</Label>
             </div>
             <div class="flex items-center gap-3">
                <Switch v-model="tempSettings.createM3u8File" />
                <Label class="text-sm font-bold">Create M3U8 Playlist File</Label>
             </div>
             <div class="flex items-center gap-3">
                <Switch v-model="tempSettings.useFirstArtistOnly" />
                <Label class="text-sm font-bold">Use First Artist Only</Label>
             </div>
             <div class="flex items-center gap-3">
                <Switch v-model="tempSettings.redownloadWithSuffix" />
                <Label class="text-sm font-bold">Redownload With Suffix</Label>
             </div>
          </div>
        </div>

        <div class="space-y-6">
          <div class="space-y-2">
            <Label class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filename Format</Label>
            <Select v-model="tempSettings.filenamePreset">
              <SelectTrigger class="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="(v, k) in FILENAME_PRESETS" :key="k" :value="k">{{ v.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Separator</Label>
            <Select v-model="tempSettings.separator">
              <SelectTrigger class="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comma">Comma (,)</SelectItem>
                <SelectItem value="semicolon">Semicolon (;)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="pt-2 px-1">
             <Label class="text-[10px] uppercase font-black text-muted-foreground tracking-widest block mb-1">Preview</Label>
             <p class="text-xs font-mono opacity-50">All The Stars - Kendrick Lamar; SZA.flac</p>
          </div>
        </div>
      </div>

      <!-- STATUS TAB -->
      <div v-if="activeTab === 'status'" class="space-y-6">
        <div class="flex justify-end">
          <Button variant="outline" size="sm" @click="fetchStatus(true)" :disabled="isLoadingStatus" class="gap-2">
            <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoadingStatus }" />
            Refresh All
          </Button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <div
            v-for="service in [
              { id: 'tidal', label: 'Tidal A', icon: 'tidal' },
              { id: 'tidal_b', label: 'Tidal B', icon: 'tidal' },
              { id: 'tidal_c', label: 'Tidal C', icon: 'tidal' },
              { id: 'tidal_d', label: 'Tidal D', icon: 'tidal' },
              { id: 'tidal_e', label: 'Tidal E', icon: 'tidal' },
              { id: 'tidal_f', label: 'Tidal F', icon: 'tidal' },
              { id: 'tidal_g', label: 'Tidal G', icon: 'tidal' },
              { id: 'qobuz_a', label: 'Qobuz A', icon: 'qobuz' },
              { id: 'qobuz_b', label: 'Qobuz B', icon: 'qobuz' },
              { id: 'qobuz_c', label: 'Qobuz C', icon: 'qobuz' },
              { id: 'amazon', label: 'Amazon Music', icon: 'amazon' },
              { id: 'lrclib', label: 'LRCLIB', icon: 'music' },
              { id: 'musicbrainz', label: 'MusicBrainz', icon: 'database' },
            ]"
            :key="service.id"
            class="flex items-center justify-between p-3 border rounded-xl bg-card transition-all hover:border-primary/50"
          >
            <div class="flex items-center gap-2.5">
               <div class="p-1.5 rounded-lg bg-muted text-foreground">
                 <SfPlatformIcons :platform="service.icon" class="h-4 w-4" />
               </div>
               <span class="text-xs font-extrabold tracking-tight">{{ service.label }}</span>
            </div>
            <div class="flex-shrink-0">
               <CheckCircle2 v-if="serviceStatus[service.id] === 'up'" class="h-4 w-4 text-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
               <XCircle v-else-if="serviceStatus[service.id] === 'down'" class="h-4 w-4 text-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]" />
               <div v-else-if="isLoadingStatus" class="h-4 w-4 rounded-full border-2 border-muted border-t-primary animate-spin"></div>
               <div v-else class="h-3 w-3 rounded-full bg-muted-foreground/20 border border-muted-foreground/30" title="Status Unknown"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-else class="flex flex-col items-center justify-center py-40 gap-4">
      <RefreshCw class="h-10 w-10 text-primary animate-spin" />
      <p class="text-sm font-medium text-muted-foreground">Initializing settings engine...</p>
    </div>
  </div>
</template>

<style scoped>
.h-full {
  scrollbar-gutter: stable;
}
</style>
