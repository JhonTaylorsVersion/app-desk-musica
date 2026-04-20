<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  BadgeCheck,
  Download,
  FileText,
  Filter,
  FolderOpen,
  Gem,
  ImageDown,
  LayoutGrid,
  List,
  Music,
  Users,
  XCircle,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SfDownloadProgress from "./SfDownloadProgress.vue";
import SfSearchAndSort from "./SfSearchAndSort.vue";
import SfTrackList from "./SfTrackList.vue";
import {
  downloadAvatar,
  downloadGalleryImage,
  downloadHeader,
} from "../utils/api";
import { getSettings } from "../utils/settings";
import { toastWithSound as toast } from "../utils/toast-with-sound";

const props = withDefaults(
  defineProps<{
    artistInfo: any;
    albumList: any[];
    trackList: any[];
    isDownloading: boolean;
    selectedTracks: string[];
    downloadedTracks: Set<string>;
    failedTracks?: Set<string>;
    skippedTracks?: Set<string>;
    downloadingTrack?: string | null;
    bulkDownloadType?: "all" | "selected" | null;
    downloadProgress?: number;
    currentDownloadInfo?: { name: string; artists: string; id?: string } | null;
    itemsPerPage?: number;
    currentPage?: number;
    searchQuery?: string;
    sortBy?: string;
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
  }>(),
  {
    failedTracks: () => new Set(),
    skippedTracks: () => new Set(),
    downloadingTrack: null,
    bulkDownloadType: null,
    downloadProgress: 0,
    currentDownloadInfo: null,
    itemsPerPage: 100,
    currentPage: 1,
    searchQuery: "",
    sortBy: "default",
    downloadedLyrics: () => new Set(),
    failedLyrics: () => new Set(),
    skippedLyrics: () => new Set(),
    downloadingLyricsTrack: null,
    downloadedCovers: () => new Set(),
    failedCovers: () => new Set(),
    skippedCovers: () => new Set(),
    downloadingCoverTrack: null,
    checkingTrackId: null,
  },
);

const emit = defineEmits<{
  (e: "back"): void;
  (e: "downloadAll"): void;
  (e: "downloadSelected"): void;
  (e: "albumClick", album: any): void;
  (e: "toggleTrack", id: string): void;
  (e: "toggleSelectAll", tracks: any[]): void;
  (e: "openFolder"): void;
  (e: "downloadTrack", ...args: any[]): void;
  (e: "downloadLyrics", ...args: any[]): void;
  (e: "downloadCover", ...args: any[]): void;
  (e: "checkAvailability", id: string): void;
  (e: "downloadAllLyrics"): void;
  (e: "downloadAllCovers"): void;
  (e: "searchChange", value: string): void;
  (e: "sortChange", value: string): void;
  (e: "pageChange", value: number): void;
  (
    e: "artistClick",
    artist: { id: string; name: string; external_urls: string },
  ): void;
  (e: "trackClick", track: any): void;
}>();

const activeTab = ref<"albums" | "tracks" | "gallery">("albums");
const selectedCategory = ref("all");
const downloadingHeader = ref(false);
const downloadingAvatar = ref(false);
const downloadingGalleryIndex = ref<number | null>(null);
const downloadingAllGallery = ref(false);
const showAlbumFilterDialog = ref(false);
const selectedAlbumFilters = ref<string[]>([]);
const artistCardRef = ref<HTMLElement | null>(null);
const artistHeaderRef = ref<HTMLElement | null>(null);
const artistBioRef = ref<HTMLElement | null>(null);
const artistFooterRef = ref<HTMLElement | null>(null);
const biographyLineClamp = ref(2);
let biographyResizeObserver: ResizeObserver | null = null;

const hasGallery = computed(
  () =>
    Array.isArray(props.artistInfo?.gallery) &&
    props.artistInfo.gallery.length > 0,
);
const headerDownloadUrl = computed(
  () => props.artistInfo?.header || props.artistInfo?.images || "",
);

const computedCategories = computed(() => {
  if (!props.albumList) return [{ id: "all", name: "All", count: 0 }];
  const cats = new Map<string, number>();
  let total = 0;
  for (const album of props.albumList) {
    const type = album.album_type || "album";
    const normalized =
      type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    cats.set(normalized, (cats.get(normalized) || 0) + 1);
    total++;
  }
  const result = [{ id: "all", name: "All", count: total }];
  Array.from(cats.keys())
    .sort()
    .forEach((name) => {
      result.push({ id: name.toLowerCase(), name, count: cats.get(name) || 0 });
    });
  return result;
});

const filteredAlbums = computed(() => {
  if (!props.albumList) return [];
  if (selectedCategory.value === "all") return props.albumList;
  return props.albumList.filter(
    (album) =>
      (album.album_type || "album").toLowerCase() === selectedCategory.value,
  );
});

const filteredTrackList = computed(() => {
  if (selectedAlbumFilters.value.length === 0) return props.trackList || [];
  return (props.trackList || []).filter((track) =>
    selectedAlbumFilters.value.includes(track.album_name),
  );
});

const filteredAlbumGroups = computed(() => {
  const grouped = new Map<
    string,
    { type: string; count: number; tracks: any[] }
  >();
  for (const track of props.trackList || []) {
    const albumName = track.album_name;
    if (!grouped.has(albumName)) {
      grouped.set(albumName, {
        type: (track.album_type || "album").toLowerCase(),
        count: 0,
        tracks: [],
      });
    }
    const group = grouped.get(albumName)!;
    group.count += 1;
    group.tracks.push(track);
  }
  return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
});

const toggleAlbumFilter = (albumName: string) => {
  if (selectedAlbumFilters.value.includes(albumName)) {
    selectedAlbumFilters.value = selectedAlbumFilters.value.filter(
      (name) => name !== albumName,
    );
  } else {
    selectedAlbumFilters.value = [...selectedAlbumFilters.value, albumName];
  }
};

const isAlbumSelected = (tracks: any[]) => {
  const tracksWithId = tracks.filter((t) => t.spotify_id);
  return (
    tracksWithId.length > 0 &&
    tracksWithId.every((t) => props.selectedTracks.includes(t.spotify_id))
  );
};

const updateBiographyClamp = () => {
  const cardEl = artistCardRef.value;
  const headerEl = artistHeaderRef.value;
  const bioEl = artistBioRef.value;
  const footerEl = artistFooterRef.value;

  if (!cardEl || !headerEl || !bioEl || !footerEl) return;

  const cardStyle = window.getComputedStyle(cardEl);
  const gap = Number.parseFloat(cardStyle.rowGap || cardStyle.gap || "0") || 0;
  const paddingTop = Number.parseFloat(cardStyle.paddingTop || "0") || 0;
  const paddingBottom = Number.parseFloat(cardStyle.paddingBottom || "0") || 0;
  const bioStyle = window.getComputedStyle(bioEl);

  let lineHeight = Number.parseFloat(bioStyle.lineHeight || "0");
  if (!lineHeight || Number.isNaN(lineHeight)) {
    const fontSize = Number.parseFloat(bioStyle.fontSize || "16") || 16;
    lineHeight = fontSize * 1.5;
  }

  const availableHeight =
    cardEl.clientHeight -
    paddingTop -
    paddingBottom -
    headerEl.offsetHeight -
    footerEl.offsetHeight -
    gap * 2;

  biographyLineClamp.value = Math.max(
    1,
    Math.floor(availableHeight / lineHeight),
  );
};

const scheduleBiographyClamp = () => {
  void nextTick(() => {
    updateBiographyClamp();
  });
};

type ArtistTheme = {
  title: string;
  body: string;
  muted: string;
  accent: string;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  avatarBorder: string;
  avatarShadow: string;
  overlay: string;
  actionBg: string;
  actionHoverBg: string;
  actionBorder: string;
  actionIcon: string;
  actionShadow: string;
};

const theme = ref<ArtistTheme>({
  title: "#0f172a",
  body: "rgba(15, 23, 42, 0.92)",
  muted: "rgba(15, 23, 42, 0.76)",
  accent: "#0ea5e9",
  cardBg: "rgba(255, 255, 255, 0.56)",
  cardBorder: "rgba(255, 255, 255, 0.42)",
  cardShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
  avatarBorder: "rgba(255, 255, 255, 0.95)",
  avatarShadow: "0 22px 55px rgba(15, 23, 42, 0.18)",
  overlay:
    "linear-gradient(to top, rgba(255,255,255,0.28), rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
  actionBg: "rgba(255, 255, 255, 0.88)",
  actionHoverBg: "rgba(255, 255, 255, 0.98)",
  actionBorder: "rgba(15, 23, 42, 0.08)",
  actionIcon: "#0f172a",
  actionShadow: "0 14px 35px rgba(15, 23, 42, 0.16)",
});

const srgbToLinear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
};

const luminanceFromRgb = (r: number, g: number, b: number) =>
  0.2126 * srgbToLinear(r) +
  0.7152 * srgbToLinear(g) +
  0.0722 * srgbToLinear(b);

const contrastRatio = (a: number, b: number) => {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
};

const averageLuminance = (samples: number[]) =>
  samples.reduce((sum, value) => sum + value, 0) / Math.max(samples.length, 1);

const buildThemeFromLuminance = (luminance: number): ArtistTheme => {
  const whiteContrast = contrastRatio(1, luminance);
  const blackContrast = contrastRatio(0, luminance);
  const prefersLightText = whiteContrast >= blackContrast;

  if (prefersLightText) {
    return {
      title: "#ffffff",
      body: "rgba(255, 255, 255, 0.94)",
      muted: "rgba(255, 255, 255, 0.82)",
      accent: "#38bdf8",
      cardBg: "rgba(8, 15, 30, 0.48)",
      cardBorder: "rgba(255, 255, 255, 0.16)",
      cardShadow: "0 24px 60px rgba(0, 0, 0, 0.28)",
      avatarBorder: "rgba(245, 248, 255, 0.98)",
      avatarShadow: "0 22px 55px rgba(0, 0, 0, 0.34)",
      overlay:
        "linear-gradient(to top, rgba(4,8,20,0.42), rgba(4,8,20,0.18), rgba(4,8,20,0.04))",
      actionBg: "rgba(255, 255, 255, 0.14)",
      actionHoverBg: "rgba(255, 255, 255, 0.22)",
      actionBorder: "rgba(255, 255, 255, 0.34)",
      actionIcon: "#ffffff",
      actionShadow: "0 18px 38px rgba(0, 0, 0, 0.24)",
    };
  }

  return {
    title: "#0f172a",
    body: "rgba(15, 23, 42, 0.92)",
    muted: "rgba(15, 23, 42, 0.76)",
    accent: "#0ea5e9",
    cardBg: "rgba(255, 255, 255, 0.62)",
    cardBorder: "rgba(255, 255, 255, 0.42)",
    cardShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
    avatarBorder: "rgba(255, 255, 255, 0.95)",
    avatarShadow: "0 22px 55px rgba(15, 23, 42, 0.18)",
    overlay:
      "linear-gradient(to top, rgba(255,255,255,0.28), rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
    actionBg: "rgba(255, 255, 255, 0.88)",
    actionHoverBg: "rgba(255, 255, 255, 0.98)",
    actionBorder: "rgba(15, 23, 42, 0.08)",
    actionIcon: "#0f172a",
    actionShadow: "0 14px 35px rgba(15, 23, 42, 0.16)",
  };
};

const analyzeImageLuminance = (url: string) => {
  if (!url) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 24;
      canvas.height = 24;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const luminanceSamples: number[] = [];
      for (let y = 4; y < 20; y += 2) {
        for (let x = 3; x < 21; x += 2) {
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          luminanceSamples.push(luminanceFromRgb(pixel[0], pixel[1], pixel[2]));
        }
      }
      luminanceSamples.sort((a, b) => a - b);
      const median = luminanceSamples[Math.floor(luminanceSamples.length / 2)];
      const average = averageLuminance(luminanceSamples);
      theme.value = buildThemeFromLuminance(median * 0.65 + average * 0.35);
    } catch {
      theme.value = buildThemeFromLuminance(0.82);
    }
  };
  img.onerror = () => {
    theme.value = buildThemeFromLuminance(0.82);
  };
};

watch(
  () => props.artistInfo?.header || props.artistInfo?.images,
  (newUrl) => {
    if (newUrl) analyzeImageLuminance(newUrl);
  },
  { immediate: true },
);

onMounted(() => {
  const initialUrl = props.artistInfo?.header || props.artistInfo?.images;
  if (initialUrl) analyzeImageLuminance(initialUrl);
  scheduleBiographyClamp();

  if (typeof ResizeObserver !== "undefined") {
    biographyResizeObserver = new ResizeObserver(() => {
      updateBiographyClamp();
    });

    if (artistCardRef.value)
      biographyResizeObserver.observe(artistCardRef.value);
    if (artistHeaderRef.value)
      biographyResizeObserver.observe(artistHeaderRef.value);
    if (artistBioRef.value) biographyResizeObserver.observe(artistBioRef.value);
    if (artistFooterRef.value)
      biographyResizeObserver.observe(artistFooterRef.value);
  }

  window.addEventListener("resize", updateBiographyClamp);
});

onUnmounted(() => {
  biographyResizeObserver?.disconnect();
  biographyResizeObserver = null;
  window.removeEventListener("resize", updateBiographyClamp);
});

watch(
  () => [
    props.artistInfo?.name,
    props.artistInfo?.biography,
    props.artistInfo?.verified,
    props.artistInfo?.listeners,
    props.artistInfo?.followers,
    props.artistInfo?.rank,
    props.artistInfo?.total_albums,
    props.albumList?.length,
  ],
  () => {
    scheduleBiographyClamp();
  },
);

const formatNumber = (num: number) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const handleDownloadHeader = async () => {
  if (!headerDownloadUrl.value) return;
  downloadingHeader.value = true;
  try {
    const settings = getSettings();
    const response = await downloadHeader({
      header_url: headerDownloadUrl.value,
      artist_name: props.artistInfo.name,
      output_dir: settings.downloadPath,
    });
    if (response.success) {
      if (response.already_exists) toast.info("Header already exists");
      else toast.success("Header downloaded successfully");
    } else {
      toast.error(response.error || "Failed to download header");
    }
  } catch (error) {
    toast.error(`Error downloading header: ${error}`);
  } finally {
    downloadingHeader.value = false;
  }
};

const handleDownloadAvatar = async () => {
  if (!props.artistInfo?.images) return;
  downloadingAvatar.value = true;
  try {
    const settings = getSettings();
    const response = await downloadAvatar({
      avatar_url: props.artistInfo.images,
      artist_name: props.artistInfo.name,
      output_dir: settings.downloadPath,
    });
    if (response.success) {
      if (response.already_exists) toast.info("Avatar already exists");
      else toast.success("Avatar downloaded successfully");
    } else {
      toast.error(response.error || "Failed to download avatar");
    }
  } catch (error) {
    toast.error(`Error downloading avatar: ${error}`);
  } finally {
    downloadingAvatar.value = false;
  }
};

const handleDownloadGalleryImage = async (imageUrl: string, index: number) => {
  downloadingGalleryIndex.value = index;
  try {
    const settings = getSettings();
    const response = await downloadGalleryImage({
      image_url: imageUrl,
      artist_name: props.artistInfo.name,
      image_index: index + 1,
      output_dir: settings.downloadPath,
    });
    if (response.success) {
      if (response.already_exists)
        toast.info(`Gallery image ${index + 1} already exists`);
      else toast.success(`Gallery image ${index + 1} downloaded successfully`);
    } else {
      toast.error(
        response.error || `Failed to download gallery image ${index + 1}`,
      );
    }
  } catch (error) {
    toast.error(`Error downloading gallery image ${index + 1}: ${error}`);
  } finally {
    downloadingGalleryIndex.value = null;
  }
};

const handleDownloadAllGallery = async () => {
  if (!hasGallery.value) return;
  downloadingAllGallery.value = true;
  try {
    let successCount = 0;
    let existsCount = 0;
    let failCount = 0;
    const settings = getSettings();
    for (let index = 0; index < props.artistInfo.gallery.length; index++) {
      const response = await downloadGalleryImage({
        image_url: props.artistInfo.gallery[index],
        artist_name: props.artistInfo.name,
        image_index: index + 1,
        output_dir: settings.downloadPath,
      });
      if (response.success) {
        if (response.already_exists) existsCount++;
        else successCount++;
      } else {
        failCount++;
      }
    }
    if (successCount > 0 && existsCount > 0)
      toast.success(
        `${successCount} images downloaded, ${existsCount} already existed`,
      );
    else if (existsCount > 0 && successCount === 0)
      toast.info(`All ${existsCount} images already exist`);
    else if (successCount > 0)
      toast.success(
        `All ${successCount} gallery images downloaded successfully`,
      );
    if (failCount > 0) toast.error(`${failCount} images failed to download`);
  } catch (error) {
    toast.error(`Error downloading gallery images: ${error}`);
  } finally {
    downloadingAllGallery.value = false;
  }
};

const artistCardStyle = computed(() => ({
  background: theme.value.cardBg,
  borderColor: theme.value.cardBorder,
  boxShadow: theme.value.cardShadow,
}));
const artistTitleStyle = computed(() => ({ color: theme.value.title }));
const artistBodyStyle = computed(() => ({ color: theme.value.body }));
const artistMutedStyle = computed(() => ({ color: theme.value.muted }));
const artistAccentStyle = computed(() => ({ color: theme.value.accent }));
const heroOverlayStyle = computed(() => ({ background: theme.value.overlay }));
const avatarFrameStyle = computed(() => ({
  borderColor: theme.value.avatarBorder,
  boxShadow: theme.value.avatarShadow,
}));
const actionButtonStyle = computed(
  () =>
    ({
      "--sf-action-bg": theme.value.actionBg,
      "--sf-action-hover-bg": theme.value.actionHoverBg,
      "--sf-action-border": theme.value.actionBorder,
      "--sf-action-icon": theme.value.actionIcon,
      "--sf-action-shadow": theme.value.actionShadow,
    }) as Record<string, string>,
);

const artistBiographyStyle = computed(() => ({
  color: theme.value.body,
  WebkitLineClamp: String(biographyLineClamp.value),
}));
</script>

<template>
  <div
    class="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000"
  >
    <div
      class="relative h-[300px] rounded-[40px] overflow-hidden group shadow-2xl"
    >
      <div class="absolute top-6 right-6 z-50">
        <Button
          variant="ghost"
          size="icon"
          @click="emit('back')"
          class="rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-md text-white border border-white/10 shadow-xl transition-all active:scale-90 h-10 w-10"
        >
          <XCircle class="h-6 w-6" />
        </Button>
      </div>
      <img
        :src="artistInfo.header || artistInfo.images"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[2s]"
      />
      <div
        class="absolute inset-0 transition-opacity duration-1000"
        :style="heroOverlayStyle"
      ></div>

      <div
        class="absolute bottom-3 left-10 right-10 flex flex-col md:flex-row items-end gap-10"
      >
        <div
          class="relative h-52 w-52 rounded-full border-8 overflow-hidden shrink-0 z-10 -ml-7 group/avatar"
          :style="avatarFrameStyle"
        >
          <img :src="artistInfo.images" class="h-full w-full object-cover" />
          <div
            class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/avatar:bg-black/45 transition-colors duration-200"
          >
            <Button
              size="icon"
              variant="secondary"
              :disabled="downloadingAvatar"
              class="sf-dynamic-action-btn h-14 w-14 rounded-2xl shadow-xl backdrop-blur-md opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-200"
              :style="actionButtonStyle"
              @click.stop="handleDownloadAvatar"
            >
              <span v-if="downloadingAvatar" class="sf-spinner" />
              <ImageDown v-else class="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div
          ref="artistCardRef"
          class="flex-none w-[650px] h-[290px] -mb-1.5 px-6 py-5 rounded-[32px] backdrop-blur-md backdrop-saturate-200 border transition-all duration-1000 -ml-8 overflow-hidden flex flex-col gap-3"
          :style="artistCardStyle"
        >
          <div ref="artistHeaderRef" class="space-y-1 shrink-0">
            <div
              class="text-xs md:text-sm font-semibold tracking-wide opacity-90"
              :style="artistBodyStyle"
            >
              Artist
            </div>
            <div
              class="flex items-center justify-center md:justify-start gap-3"
            >
              <h1
                class="text-5xl md:text-6xl font-black tracking-tighter leading-none drop-shadow-xl transition-colors duration-500"
                :style="artistTitleStyle"
              >
                {{ artistInfo.name }}
              </h1>

              <BadgeCheck
                v-if="artistInfo.verified"
                class="h-8 w-8 md:h-9 md:w-9 shrink-0 text-white fill-sky-400 drop-shadow-[0_6px_18px_rgba(56,189,248,0.35)]"
              />
            </div>
          </div>

          <p
            ref="artistBioRef"
            v-if="artistInfo.biography"
            class="sf-dynamic-bio flex-1 text-sm md:text-[15px] font-medium max-w-4xl drop-shadow-md leading-relaxed transition-colors duration-500"
            :style="artistBiographyStyle"
          >
            {{ artistInfo.biography.replace(/<[^>]*>/g, "") }}
          </p>

          <div
            ref="artistFooterRef"
            class="flex flex-col gap-3 mt-auto shrink-0"
          >
            <div
              class="flex flex-col md:flex-row md:items-end md:justify-between gap-3"
            >
              <div
                class="flex flex-wrap items-end justify-center md:justify-start gap-x-6 gap-y-2 text-sm font-bold transition-colors duration-500"
                :style="artistMutedStyle"
              >
                <span class="flex items-center gap-2"
                  ><Users class="h-4 w-4" />
                  {{
                    formatNumber(
                      artistInfo.listeners || artistInfo.followers || 0,
                    )
                  }}
                  followers</span
                >
                <span class="flex items-center gap-2"
                  ><Music class="h-4 w-4" />
                  {{ artistInfo.total_albums || albumList.length }} albums</span
                >
                <span class="flex items-center gap-2"
                  ><Gem class="h-4 w-4" /> {{ artistInfo.rank || 0 }} global
                  rank</span
                >
              </div>

              <div
                v-if="headerDownloadUrl"
                class="flex justify-center md:justify-end"
              >
                <Button
                  size="icon"
                  variant="secondary"
                  :disabled="downloadingHeader"
                  class="sf-dynamic-action-btn h-12 w-12 rounded-2xl shadow-xl backdrop-blur-lg shrink-0"
                  :style="actionButtonStyle"
                  @click.stop="handleDownloadHeader"
                >
                  <span v-if="downloadingHeader" class="sf-spinner" />
                  <ImageDown v-else class="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex items-center justify-between border-b pb-4">
      <div class="flex p-1 bg-muted rounded-xl gap-1">
        <button
          @click="activeTab = 'tracks'"
          :class="[
            'px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2',
            activeTab === 'tracks'
              ? 'bg-background shadow-sm text-primary'
              : 'text-muted-foreground',
          ]"
        >
          <List class="h-4 w-4" />
          Discography Tracks
        </button>
        <button
          @click="activeTab = 'albums'"
          :class="[
            'px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2',
            activeTab === 'albums'
              ? 'bg-background shadow-sm text-primary'
              : 'text-muted-foreground',
          ]"
        >
          <LayoutGrid class="h-4 w-4" />
          Studio Albums
        </button>
        <button
          v-if="hasGallery"
          @click="activeTab = 'gallery'"
          :class="[
            'px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2',
            activeTab === 'gallery'
              ? 'bg-background shadow-sm text-primary'
              : 'text-muted-foreground',
          ]"
        >
          <ImageDown class="h-4 w-4" />
          Gallery
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'gallery' && hasGallery" class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-2xl font-bold">
          Gallery ({{ artistInfo.gallery.length.toLocaleString() }})
        </h3>
        <Button
          variant="outline"
          size="icon"
          :disabled="downloadingAllGallery"
          @click="handleDownloadAllGallery"
        >
          <span v-if="downloadingAllGallery" class="sf-spinner" />
          <ImageDown v-else class="h-4 w-4" />
        </Button>
      </div>
      <div
        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      >
        <div
          v-for="(imageUrl, index) in artistInfo.gallery"
          :key="index"
          class="relative group"
        >
          <div
            class="relative aspect-square rounded-md overflow-hidden shadow-md"
          >
            <img
              :src="imageUrl"
              :alt="`${artistInfo.name} gallery ${Number(index) + 1}`"
              class="w-full h-full object-cover"
            />
            <div
              class="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center"
            >
              <Button
                size="icon"
                variant="secondary"
                :disabled="downloadingGalleryIndex === index"
                class="opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 text-white border-white/20"
                @click="handleDownloadGalleryImage(imageUrl, Number(index))"
              >
                <span
                  v-if="downloadingGalleryIndex === index"
                  class="sf-spinner"
                />
                <ImageDown v-else class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'albums'" class="space-y-6">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h3 class="text-2xl font-bold">Discography</h3>
        <div class="flex gap-2">
          <Button
            size="sm"
            :disabled="isDownloading"
            @click="emit('downloadAll')"
          >
            <Download class="h-4 w-4 mr-2" />
            Download Discography
          </Button>
          <Button
            v-if="selectedTracks.length > 0"
            size="sm"
            variant="secondary"
            :disabled="isDownloading"
            @click="emit('downloadSelected')"
          >
            <Download class="h-4 w-4 mr-2" />
            Download Selected ({{ selectedTracks.length }})
          </Button>
        </div>
      </div>

      <div class="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        <Button
          v-for="cat in computedCategories"
          :key="cat.id"
          :variant="selectedCategory === cat.id ? 'default' : 'secondary'"
          size="sm"
          @click="selectedCategory = cat.id"
          class="rounded-full h-9 px-4 font-bold text-xs whitespace-nowrap transition-all active:scale-95"
        >
          {{ cat.name }} <span class="ml-1 opacity-60">({{ cat.count }})</span>
        </Button>
      </div>

      <div
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6"
      >
        <div
          v-for="album in filteredAlbums"
          :key="album.id"
          class="group cursor-pointer space-y-3 relative"
          @click="emit('albumClick', album)"
        >
          <div
            v-if="
              trackList.some((t) => t.album_name === album.name && t.spotify_id)
            "
            class="absolute left-2 top-2 z-20"
            @click.stop
            @pointerdown.stop
          >
            <Checkbox
              :checked="
                isAlbumSelected(
                  trackList.filter((t) => t.album_name === album.name),
                )
              "
              class="border-white/90 bg-black/40 shadow-[0_2px_10px_rgba(0,0,0,0.35)] backdrop-blur-sm data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:shadow-[0_2px_12px_rgba(250,204,21,0.45)]"
              @click.stop
              @pointerdown.stop
              @update:checked="
                emit(
                  'toggleSelectAll',
                  trackList.filter((t) => t.album_name === album.name),
                )
              "
            />
          </div>
          <div
            class="aspect-square rounded-2xl overflow-hidden shadow-xl border relative"
          >
            <img
              :src="album.images"
              class="h-full w-full object-cover group-hover:scale-110 transition-transform duration-700"
            />
            <div class="absolute bottom-2 right-2">
              <div
                class="bg-black/60 backdrop-blur-md text-[10px] font-black uppercase tracking-tighter text-white px-2 py-0.5 rounded-md border border-white/20 shadow-lg"
              >
                {{ album.album_type || "ALBUM" }}
              </div>
            </div>
          </div>
          <div>
            <h4
              class="font-bold truncate group-hover:text-primary transition-colors text-sm"
            >
              {{ album.name }}
            </h4>
            <p class="text-xs text-muted-foreground font-medium">
              {{ album.release_date.split("-")[0] }}
              <span class="mx-1">•</span>
              {{ album.total_tracks }}
              {{ album.total_tracks === 1 ? "track" : "tracks" }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'tracks'" class="space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h3 class="text-2xl font-bold">All Tracks</h3>
        <div class="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            @click="showAlbumFilterDialog = true"
          >
            <Filter class="h-4 w-4 mr-2" />
            Filter Albums
          </Button>
          <Button
            size="sm"
            :disabled="isDownloading"
            @click="emit('downloadAll')"
          >
            <Download class="h-4 w-4 mr-2" />
            Download All
          </Button>
          <Button
            v-if="selectedTracks.length > 0"
            size="sm"
            variant="secondary"
            :disabled="isDownloading"
            @click="emit('downloadSelected')"
          >
            <Download class="h-4 w-4 mr-2" />
            Download Selected ({{ selectedTracks.length.toLocaleString() }})
          </Button>
          <Button
            size="icon"
            variant="outline"
            :disabled="isBulkDownloadingLyrics"
            @click="emit('downloadAllLyrics')"
          >
            <span v-if="isBulkDownloadingLyrics" class="sf-spinner" />
            <FileText v-else class="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            :disabled="isBulkDownloadingCovers"
            @click="emit('downloadAllCovers')"
          >
            <span v-if="isBulkDownloadingCovers" class="sf-spinner" />
            <ImageDown v-else class="h-4 w-4" />
          </Button>
          <Button
            v-if="downloadedTracks.size > 0"
            size="icon"
            variant="outline"
            @click="emit('openFolder')"
          >
            <FolderOpen class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <SfDownloadProgress
        v-if="isDownloading"
        :progress="downloadProgress || 0"
        :current-track="currentDownloadInfo || null"
      />

      <SfSearchAndSort
        :search-query="searchQuery || ''"
        :sort-by="sortBy || 'default'"
        @search-change="emit('searchChange', $event)"
        @sort-change="emit('sortChange', $event)"
      />

      <SfTrackList
        :tracks="filteredTrackList"
        :search-query="searchQuery || ''"
        :sort-by="sortBy || 'default'"
        :selected-tracks="selectedTracks"
        :downloaded-tracks="downloadedTracks"
        :failed-tracks="failedTracks"
        :skipped-tracks="skippedTracks"
        :downloading-track="downloadingTrack"
        :is-downloading="isDownloading"
        :current-page="currentPage || 1"
        :items-per-page="itemsPerPage || 100"
        :show-checkboxes="true"
        :hide-album-column="false"
        :folder-name="artistInfo.name"
        :is-artist-discography="true"
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
        @toggle-track="(id) => emit('toggleTrack', id)"
        @toggle-select-all="(tracks) => emit('toggleSelectAll', tracks)"
        @download-track="(...args: any[]) => emit('downloadTrack', ...args)"
        @download-lyrics="(...args: any[]) => emit('downloadLyrics', ...args)"
        @download-cover="(...args: any[]) => emit('downloadCover', ...args)"
        @check-availability="(id) => emit('checkAvailability', id)"
        @page-change="(page) => emit('pageChange', page)"
        @artist-click="(artist) => emit('artistClick', artist)"
        @album-click="(album) => emit('albumClick', album)"
        @track-click="(track) => emit('trackClick', track)"
      />

      <Dialog
        :open="showAlbumFilterDialog"
        @update:open="showAlbumFilterDialog = $event"
      >
        <DialogContent class="sm:max-w-[500px] max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Select Albums</DialogTitle>
          </DialogHeader>
          <div class="space-y-4 overflow-y-auto pr-2 max-h-[60vh]">
            <div
              v-for="[albumName, data] in filteredAlbumGroups"
              :key="albumName"
              class="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                :checked="selectedAlbumFilters.includes(albumName)"
                class="mt-1"
                @update:checked="toggleAlbumFilter(albumName)"
              />
              <div class="flex-1">
                <div class="text-sm font-medium">{{ albumName }}</div>
                <div
                  class="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span
                    class="capitalize bg-muted px-1.5 py-0.5 rounded text-[10px] font-semibold border"
                  >
                    {{ data.type }}
                  </span>
                  <span>•</span>
                  <span>{{ data.count }} tracks</span>
                  <span>•</span>
                  <span>{{
                    data.tracks[0]?.release_date?.split("-")[0] ||
                    "Unknown Year"
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
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

.sf-dynamic-bio {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sf-spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: spin 0.8s linear infinite;
}

.sf-dynamic-action-btn {
  background: var(--sf-action-bg) !important;
  color: var(--sf-action-icon) !important;
  border: 1px solid var(--sf-action-border) !important;
  box-shadow: var(--sf-action-shadow) !important;
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
}

.sf-dynamic-action-btn:hover:not(:disabled) {
  background: var(--sf-action-hover-bg) !important;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
