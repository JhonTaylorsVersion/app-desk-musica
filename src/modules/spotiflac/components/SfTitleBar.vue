<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { 
  X, Minus, Copy, Square, SlidersHorizontal, 
  Globe, Eye, EyeOff, ExternalLink, Info 
} from 'lucide-vue-next';
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel 
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const appWindow = getCurrentWindow();
const isMaximized = ref(false);
const hoveredWindowControl = ref<'tools' | 'minimize' | 'maximize' | 'close' | null>(null);

const IP_INFO_REFRESH_INTERVAL_MS = 30000;
const SPOTIFY_BLOCKED_COUNTRY_CODES = new Set([
  "AF", "IO", "CF", "CN", "CU", "ER", "IR", "MM", "KP", "RU", "SO", "SS", "SD", "SY", "TM", "YE"
]);

const currentIPInfo = ref<any>(null);
const isLoadingCurrentIPInfo = ref(false);
const currentIPInfoError = ref("");
const showIPAddress = ref(false);

const loadCurrentIPInfo = async (silent = false) => {
  if (!silent) {
    isLoadingCurrentIPInfo.value = true;
    currentIPInfoError.value = "";
  }
  try {
    const info = await invoke<any>('get_current_ip_info');
    currentIPInfo.value = info;
    currentIPInfoError.value = "";
  } catch (error: any) {
    if (!silent || !currentIPInfo.value) {
      currentIPInfo.value = null;
      currentIPInfoError.value = typeof error === 'string' ? error : "Unable to detect IP";
    }
  } finally {
    if (!silent) isLoadingCurrentIPInfo.value = false;
  }
};

let intervalId: any = null;

onMounted(async () => {
  isMaximized.value = await appWindow.isMaximized();
  
  const unlistenResized = await appWindow.onResized(async () => {
    isMaximized.value = await appWindow.isMaximized();
  });

  loadCurrentIPInfo();
  
  intervalId = setInterval(() => {
    loadCurrentIPInfo(true);
  }, IP_INFO_REFRESH_INTERVAL_MS);

  const handleFocus = () => {
    if (document.visibilityState === "visible") {
      loadCurrentIPInfo(true);
    }
  };

  window.addEventListener("focus", handleFocus);
  document.addEventListener("visibilitychange", handleFocus);

  onUnmounted(() => {
    unlistenResized();
    if (intervalId) clearInterval(intervalId);
    window.removeEventListener("focus", handleFocus);
    document.removeEventListener("visibilitychange", handleFocus);
  });
});

const minimize = () => appWindow.minimize();
const toggleMaximize = async () => {
  await appWindow.toggleMaximize();
  isMaximized.value = await appWindow.isMaximized();
};
const close = () => appWindow.close();

const openExternal = async (url: string) => {
  await invoke('open_url', { url });
};

const detectedCountryCode = computed(() => currentIPInfo.value?.country_code?.toUpperCase() || "");
const detectedFlagPath = computed(() => detectedCountryCode.value ? `/assets/flags/${detectedCountryCode.value.toLowerCase()}.svg` : "");
const isSpotifyBlockedCountry = computed(() => detectedCountryCode.value !== "" && SPOTIFY_BLOCKED_COUNTRY_CODES.has(detectedCountryCode.value));
const closeButtonStyle = computed(() => ({
  backgroundColor: hoveredWindowControl.value === 'close' ? '#e81123' : 'transparent',
  color: hoveredWindowControl.value === 'close' ? '#ffffff' : 'hsl(var(--foreground))'
}));
const closeIconStyle = computed(() => ({
  opacity: hoveredWindowControl.value === 'close' ? '1' : '0.6',
  color: hoveredWindowControl.value === 'close' ? '#ffffff' : 'currentColor'
}));
</script>

<template>
  <div data-tauri-drag-region class="sf-titlebar">
    <div class="sf-titlebar__left pointer-events-none">
      <div class="flex items-center gap-2">
        <div class="h-2.5 w-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]"></div>
        <span class="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">SpotiFLAC Desktop</span>
      </div>
      
      <div v-if="currentIPInfo || isLoadingCurrentIPInfo" class="flex items-center gap-2 px-2 py-1 bg-muted/40 rounded-lg border border-muted-foreground/5 animate-in slide-in-from-left-2 duration-700">
        <template v-if="isLoadingCurrentIPInfo && !currentIPInfo">
           <div class="h-3 w-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
        </template>
        <template v-else>
          <img v-if="detectedFlagPath" :src="detectedFlagPath" :alt="detectedCountryCode" class="h-3 w-4.5 rounded-sm object-cover shadow-sm border border-black/10" />
          <span :class="['text-[10px] font-bold tracking-tight', isSpotifyBlockedCountry ? 'text-destructive' : 'text-muted-foreground']">
            {{ currentIPInfo?.country }}{{ isSpotifyBlockedCountry ? ' (Blocked)' : '' }}
          </span>
        </template>
      </div>
    </div>

    <div class="sf-titlebar__controls no-drag">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button class="sf-titlebar__button sf-titlebar__button--tools">
            <SlidersHorizontal :class="['h-3.5 w-3.5 transition-colors', isSpotifyBlockedCountry ? 'text-destructive animate-pulse' : 'opacity-60']" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-72 rounded-xl shadow-2xl p-1 backdrop-blur-xl bg-background/95 border-muted-foreground/10 animate-in zoom-in-95 duration-200">
          <DropdownMenuLabel class="px-3 py-2 text-xs font-black uppercase tracking-widest opacity-60 flex items-center justify-between">
            Propiedades de Red
            <div v-if="isSpotifyBlockedCountry" class="h-2 w-2 rounded-full bg-destructive shadow-[0_0_5px_rgba(var(--destructive),0.5)]"></div>
          </DropdownMenuLabel>
          <div class="p-3 space-y-3">
             <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                   <div class="h-8 w-11 rounded-md overflow-hidden border shadow-sm flex items-center justify-center bg-muted/50">
                      <img v-if="detectedFlagPath" :src="detectedFlagPath" class="h-full w-full object-cover" />
                      <Globe v-else class="h-4 w-4 opacity-40" />
                   </div>
                   <div class="flex flex-col">
                      <span class="text-xs font-black truncate max-w-[140px]">
                        {{ isLoadingCurrentIPInfo ? 'Detectando...' : (currentIPInfo?.country || 'Desconocido') }}
                      </span>
                      <span class="text-[10px] font-bold text-muted-foreground truncate opacity-70">
                         {{ showIPAddress ? currentIPInfo?.ip : 'IP Oculta' }}
                      </span>
                   </div>
                </div>
                <button 
                  v-if="currentIPInfo"
                  @click.stop="showIPAddress = !showIPAddress"
                  class="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                >
                   <EyeOff v-if="showIPAddress" class="h-3.5 w-3.5 opacity-60" />
                   <Eye v-else class="h-3.5 w-3.5 opacity-60" />
                </button>
             </div>

             <div v-if="isSpotifyBlockedCountry" class="p-2 bg-destructive/10 rounded-lg flex items-center gap-2 border border-destructive/20 animate-in shake">
                 <div class="h-2 w-2 rounded-full bg-destructive"></div>
                 <p class="text-[10px] font-black text-destructive leading-tight">BLOQUEADO POR SPOTIFY EN TU REGIÓN</p>
             </div>
          </div>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem @click="openExternal('https://afkarxyz.qzz.io')" class="gap-3 h-10 rounded-lg font-bold">
            <Globe class="h-4 w-4 opacity-50" />
            <span>Sitio Web Oficial</span>
            <ExternalLink class="ml-auto h-3 w-3 opacity-30" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" class="h-4 mx-1 opacity-10 shrink-0" />

      <button 
        @click="minimize" 
        class="sf-titlebar__button"
        title="Minimizar"
      >
        <Minus class="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
      </button>
      <button 
        @click="toggleMaximize" 
        class="sf-titlebar__button"
        :title="isMaximized ? 'Restaurar' : 'Maximizar'"
      >
        <Copy v-if="isMaximized" class="h-3 w-3 opacity-60 hover:opacity-100" />
        <Square v-else class="h-3 w-3 opacity-60 hover:opacity-100" />
      </button>
      <button 
        @click="close" 
        @mouseenter="hoveredWindowControl = 'close'"
        @mouseleave="hoveredWindowControl = null"
        @focus="hoveredWindowControl = 'close'"
        @blur="hoveredWindowControl = null"
        class="sf-titlebar__button sf-titlebar__button--close group"
        :style="closeButtonStyle"
        title="Cerrar"
      >
        <X class="h-4 w-4 transition-opacity transition-colors duration-150" :style="closeIconStyle" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.no-drag {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.sf-titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  width: auto;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 16px;
  padding-right: 0;
  border-bottom: 1px solid hsl(var(--border));
  background: color-mix(in oklab, hsl(var(--background)) 72%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 60;
  user-select: none;
  box-sizing: border-box;
}

.sf-titlebar__left {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  padding-right: 12px;
}

.sf-titlebar__controls {
  flex: 0 0 auto;
  height: 40px;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
}

.sf-titlebar__button {
  -webkit-app-region: no-drag;
  app-region: no-drag;
  flex: 0 0 auto;
  width: 46px;
  min-width: 46px;
  max-width: 46px;
  height: 40px;
  min-height: 40px;
  max-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  background-color: transparent;
  color: hsl(var(--foreground));
  transition: background-color 160ms ease, color 160ms ease, opacity 160ms ease;
  box-sizing: border-box;
}

.sf-titlebar__button:hover {
  background-color: hsl(var(--muted));
}

.sf-titlebar__button--tools {
  width: 48px;
  min-width: 48px;
  max-width: 48px;
}

.sf-titlebar__button--close {
  width: 52px;
  min-width: 52px;
  max-width: 52px;
}

.sf-titlebar__button--close:hover,
.sf-titlebar__button--close:focus-visible,
.sf-titlebar__button--close:active {
  background-color: #e81123 !important;
  color: white !important;
}

.sf-titlebar__button--close:hover :deep(svg),
.sf-titlebar__button--close:focus-visible :deep(svg),
.sf-titlebar__button--close:active :deep(svg) {
  color: white !important;
  opacity: 1 !important;
}
</style>
