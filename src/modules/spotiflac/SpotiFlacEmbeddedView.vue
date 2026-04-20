<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { Toaster } from 'vue-sonner';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  SfSidebar,
  SfHeader,
  SfMainPage,
  SfSettingsPage,
  SfAboutPage,
  SfHistoryPage,
  SfAudioAnalysisPage,
  SfAudioConverterPage,
  SfAudioResamplerPage,
  SfFileManagerPage,
  SfDebugLoggerPage,
  SfDownloadQueue,
  SfDownloadProgressToast,
} from './components';
import type { PageType } from './components/SfSidebar.vue';
import {
  ArrowUp,
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from 'lucide-vue-next';
import { useSettings } from './composables/useSettings';
import { useApiStatus } from './composables/useApiStatus';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toastWithSound as toast } from './utils/toast-with-sound';

const APP_VERSION = ref('2.2.0');
const osPlatform = ref('windows');

const { settings, loadSettings, applyTheme, applyThemeMode, applyFont } = useSettings();
const { ensureApiStatusCheckStarted } = useApiStatus();
const currentPage = ref<PageType>('main');
const showDownloadQueue = ref(false);
const hasUnsavedSettings = ref(false);
const pendingPageChange = ref<PageType | null>(null);
const showUnsavedChangesDialog = ref(false);
const resetSettingsFn = ref<(() => void) | null>(null);

const isFFmpegInstalled = ref<boolean | null>(null);
const isInstallingFFmpeg = ref(false);
const ffmpegProgress = ref(0);
const ffmpegStatus = ref('');

const hasUpdate = ref(false);
const releaseDate = ref<string | null>(null);
const showScrollTop = ref(false);
const toasterTheme = ref<'light' | 'dark'>('light');
const containerRef = ref<HTMLElement | null>(null);
const toasterOffset = ref({ left: 'calc(56px + 1rem)', bottom: '1rem' });
let themeObserver: MutationObserver | null = null;
let cleanups: Array<() => void> = [];
let resizeObserver: ResizeObserver | null = null;

const syncToasterOffset = () => {
  const container = containerRef.value;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  toasterOffset.value = {
    left: `${Math.max(rect.left + 72, 16)}px`,
    bottom: `${Math.max(window.innerHeight - rect.bottom + 16, 16)}px`,
  };
};

const syncToasterTheme = () => {
  toasterTheme.value = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
};

const toasterIcons = {
  success: h(CircleCheck, { class: 'size-4' }),
  info: h(Info, { class: 'size-4' }),
  warning: h(TriangleAlert, { class: 'size-4' }),
  error: h(OctagonX, { class: 'size-4' }),
  loading: h(LoaderCircle, { class: 'size-4 animate-spin' }),
};

const toasterOptions = computed(() => ({
  class: 'font-mono lowercase',
  classes: {
    success:
      'border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100 [&>svg]:text-green-500',
    error:
      'border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100 [&>svg]:text-red-500',
    warning:
      'border-yellow-500 bg-yellow-50 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100 [&>svg]:text-yellow-500',
    info:
      'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100 [&>svg]:text-blue-500',
  },
  style: {
    '--normal-bg': 'var(--popover)',
    '--normal-text': 'var(--popover-foreground)',
    '--normal-border': 'var(--border)',
    '--border-radius': 'var(--radius)',
  },
}));

const handleScroll = () => {
  showScrollTop.value = window.scrollY > 300;
};

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const checkFFmpeg = async () => {
  try {
    isFFmpegInstalled.value = await invoke<boolean>('check_ffmpeg_installed');
  } catch (err) {
    // console.error('FFmpeg check failed:', err);
    isFFmpegInstalled.value = false;
  }
};

const installFFmpeg = async () => {
  isInstallingFFmpeg.value = true;
  ffmpegProgress.value = 0;
  ffmpegStatus.value = 'Initializing...';

  try {
    const response = await invoke<{ success: boolean; error?: string }>('download_ffmpeg');
    if (response.success) {
      toast.success('FFmpeg installed successfully!');
      isFFmpegInstalled.value = true;
    } else {
      toast.error(response.error || 'Failed to install FFmpeg. Please check logs.');
    }
  } catch (err: any) {
    toast.error(`Installation error: ${err}`);
  } finally {
    isInstallingFFmpeg.value = false;
  }
};

const checkForUpdates = async () => {
  try {
    const response = await fetch('https://api.github.com/repos/afkarxyz/SpotiFLAC/releases/latest');
    const data = await response.json();
    const latestVersion = data.tag_name?.replace(/^v/, '') || '';

    releaseDate.value = data.published_at || null;
    if (latestVersion && latestVersion > APP_VERSION.value) {
      hasUpdate.value = true;
    }
  } catch (err) {
    // console.error('Update check failed:', err);
  }
};

const handlePageChange = (page: PageType | 'queue') => {
  if (page === 'queue') {
    showDownloadQueue.value = true;
  } else if (
    currentPage.value === 'settings' &&
    hasUnsavedSettings.value &&
    page !== 'settings'
  ) {
    pendingPageChange.value = page;
    showUnsavedChangesDialog.value = true;
  } else {
    currentPage.value = page;
    scrollToTop();
  }
};

const handleDiscardChanges = () => {
  showUnsavedChangesDialog.value = false;
  resetSettingsFn.value?.();
  const savedSettings = settings.value;
  applyThemeMode(savedSettings.themeMode);
  applyTheme(savedSettings.theme);
  applyFont(savedSettings.fontFamily);
  if (pendingPageChange.value) {
    currentPage.value = pendingPageChange.value;
    pendingPageChange.value = null;
    hasUnsavedSettings.value = false;
    scrollToTop();
  }
};

const handleCancelNavigation = () => {
  showUnsavedChangesDialog.value = false;
  pendingPageChange.value = null;
};

const handleUnsavedChangesChange = (value: boolean) => {
  hasUnsavedSettings.value = value;
};

const handleRegisterSettingsReset = (fn: () => void) => {
  resetSettingsFn.value = fn;
};

const handleHistorySelect = (cachedData: string) => {
  currentPage.value = 'main';
  window.dispatchEvent(new CustomEvent('spotiflac:history-select', { detail: cachedData }));
};

onMounted(async () => {
  await loadSettings();
  await nextTick();
  syncToasterTheme();
  syncToasterOffset();
  themeObserver = new MutationObserver(syncToasterTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  resizeObserver = new ResizeObserver(syncToasterOffset);
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }

  checkFFmpeg();

  try {
    APP_VERSION.value = await invoke<string>('get_app_version');
  } catch {
    APP_VERSION.value = '2.2.0';
  }

  try {
    osPlatform.value = await invoke<string>('get_platform');
  } catch {
    osPlatform.value = 'windows';
  }

  checkForUpdates();
  ensureApiStatusCheckStarted();

  const unlistenProgress = await listen<number>('ffmpeg-progress', (event) => {
    ffmpegProgress.value = event.payload;
    ffmpegStatus.value =
      event.payload >= 100
        ? 'Extracting binaries...'
        : `Downloading binaries... ${event.payload.toFixed(1)}%`;
  });

  const unlistenStatus = await listen<string>('ffmpeg-status', (event) => {
    ffmpegStatus.value = event.payload;
  });

  const unlistenBackendLog = await listen<string>('backend-log', (event) => {
    // console.log(`%c[Backend]%c ${event.payload}`, 'color: #7c3aed; font-weight: bold', '');
  });

  cleanups = [unlistenProgress, unlistenStatus, unlistenBackendLog];

  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', syncToasterOffset);

  const warmUpAudio = () => {
    toast.warmUp();
    window.removeEventListener('click', warmUpAudio);
    window.removeEventListener('keydown', warmUpAudio);
  };
  window.addEventListener('click', warmUpAudio, { once: true });
  window.addEventListener('keydown', warmUpAudio, { once: true });
});

onUnmounted(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  themeObserver?.disconnect();
  themeObserver = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('resize', syncToasterOffset);
});
</script>

<template>
  <div
    ref="containerRef"
    class="spotiflac-embedded h-full bg-background text-foreground"
  >
    <div class="relative h-full overflow-hidden rounded-[28px] border border-white/6 bg-background/95">
      <SfSidebar :current-page="currentPage" @page-change="handlePageChange" />

      <div class="h-full overflow-y-auto pl-14 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div class="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
          <SfHeader
            v-if="currentPage === 'main'"
            :version="APP_VERSION"
            :has-update="hasUpdate"
            :release-date="releaseDate"
          />

          <SfMainPage v-if="currentPage === 'main'" />
          <SfSettingsPage
            v-else-if="currentPage === 'settings'"
            :on-unsaved-changes-change="handleUnsavedChangesChange"
            :on-reset-request="handleRegisterSettingsReset"
          />
          <SfAboutPage v-else-if="currentPage === 'about'" />
          <SfHistoryPage
            v-else-if="currentPage === 'history'"
            @history-select="handleHistorySelect"
          />
          <SfAudioAnalysisPage v-else-if="currentPage === 'audio-analysis'" />
          <SfAudioConverterPage v-else-if="currentPage === 'audio-converter'" />
          <SfAudioResamplerPage v-else-if="currentPage === 'audio-resampler'" />
          <SfFileManagerPage v-else-if="currentPage === 'file-manager'" />
          <SfDebugLoggerPage v-else-if="currentPage === 'debug'" />
        </div>
      </div>

      <SfDownloadQueue :is-open="showDownloadQueue" @close="showDownloadQueue = false" />
      <SfDownloadProgressToast @click="showDownloadQueue = true" />

      <Button
        v-if="showScrollTop"
        variant="default"
        size="icon"
        class="absolute bottom-6 right-6 z-50 h-10 w-10 rounded-full shadow-lg"
        @click="scrollToTop"
      >
        <ArrowUp class="h-5 w-5" />
      </Button>
    </div>

    <Dialog :open="isFFmpegInstalled === false && !isInstallingFFmpeg">
      <DialogContent class="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-primary">
            <div class="h-2 w-2 rounded-full bg-primary animate-ping"></div>
            FFmpeg Dependency Missing
          </DialogTitle>
          <DialogDescription class="pt-2">
            SpotiFLAC requires FFmpeg to process and resample your high-quality downloads.
            Would you like us to automatically download and configure it for you?
          </DialogDescription>
        </DialogHeader>
        <div
          class="rounded-xl border border-dashed border-muted-foreground/20 bg-muted/30 p-4 text-[11px] font-mono text-muted-foreground"
        >
          Estimated download size: ~60MB <br />
          Platform: {{ osPlatform }}-x64
        </div>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="ghost" @click="isFFmpegInstalled = null">Later</Button>
          <Button @click="installFFmpeg">Install Automatically</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <div
      v-if="isInstallingFFmpeg"
      class="absolute inset-0 z-[100] flex items-center justify-center bg-background/80 p-6 backdrop-blur-md"
    >
      <div class="max-w-md w-full space-y-8 text-center animate-in fade-in zoom-in duration-300">
        <div class="space-y-2">
          <h2 class="text-2xl font-black uppercase italic tracking-tighter">Installing FFmpeg</h2>
          <p class="text-sm font-medium text-muted-foreground">{{ ffmpegStatus }}</p>
        </div>

        <div class="relative py-4">
          <Progress :model-value="ffmpegProgress" class="h-3 shadow-inner" />
          <div class="absolute -bottom-2 right-0 text-[10px] font-mono opacity-50">
            {{ ffmpegProgress.toFixed(1) }}%
          </div>
        </div>

        <div class="flex justify-center pt-4">
          <div class="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
            <div class="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
            <span class="text-[10px] font-black uppercase tracking-widest text-primary">
              Optimizing Engine
            </span>
          </div>
        </div>
      </div>
    </div>

    <Dialog v-model:open="showUnsavedChangesDialog">
      <DialogContent class="sm:max-w-[425px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Unsaved Changes</DialogTitle>
          <DialogDescription>
            You have unsaved changes in Settings. Are you sure you want to leave?
            Your changes will be lost.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="handleCancelNavigation">Cancel</Button>
          <Button variant="destructive" @click="handleDiscardChanges">Discard Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Toaster
      position="bottom-left"
      :duration="1000"
      :theme="toasterTheme"
      :icons="toasterIcons"
      :toast-options="toasterOptions"
      :offset="toasterOffset"
      :mobile-offset="toasterOffset"
    />
  </div>
</template>
