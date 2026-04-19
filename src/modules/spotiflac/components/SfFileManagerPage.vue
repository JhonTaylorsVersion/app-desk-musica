<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import {
  FolderOpen,
  RefreshCw,
  FileMusic,
  ChevronRight,
  ChevronDown,
  Pencil,
  Eye,
  Folder,
  Info,
  RotateCcw,
  FileText,
  Image,
  Copy,
  Check,
  Search,
  Wand2,
  X,
} from "lucide-vue-next";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toastWithSound as toast } from "@/modules/spotiflac/utils/toast-with-sound";

import type {
  FileMetadata,
  RenamePreview,
  RenameResult,
} from "../types/file-manager";

// --- CONSTANTS ---

const FORMAT_PRESETS: Record<string, { label: string; template: string }> = {
  title: { label: "Title", template: "{title}" },
  "title-artist": { label: "Title - Artist", template: "{title} - {artist}" },
  "artist-title": { label: "Artist - Title", template: "{artist} - {title}" },
  "track-title": { label: "Track. Title", template: "{track}. {title}" },
  "track-title-artist": {
    label: "Track. Title - Artist",
    template: "{track}. {title} - {artist}",
  },
  "track-artist-title": {
    label: "Track. Artist - Title",
    template: "{track}. {artist} - {title}",
  },
  "title-album-artist": {
    label: "Title - Album Artist",
    template: "{title} - {album_artist}",
  },
  "track-title-album-artist": {
    label: "Track. Title - Album Artist",
    template: "{track}. {title} - {album_artist}",
  },
  "artist-album-title": {
    label: "Artist - Album - Title",
    template: "{artist} - {album} - {title}",
  },
  "track-dash-title": { label: "Track - Title", template: "{track} - {title}" },
  "disc-track-title": {
    label: "Disc-Track. Title",
    template: "{disc}-{track}. {title}",
  },
  "disc-track-title-artist": {
    label: "Disc-Track. Title - Artist",
    template: "{disc}-{track}. {title} - {artist}",
  },
  custom: { label: "Custom...", template: "{title} - {artist}" },
};

const STORAGE_KEY = "spotiflac_file_manager_state";
const DEFAULT_PRESET = "title-artist";
const DEFAULT_CUSTOM_FORMAT = "{title} - {artist}";

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

// --- STATE ---

const rootPath = ref("");
const allFiles = ref<FileNode[]>([]);
const selectedFiles = ref<Set<string>>(new Set());
const loading = ref(false);
const activeTab = ref<TabType>("track");
const formatPreset = ref(DEFAULT_PRESET);
const customFormat = ref(DEFAULT_CUSTOM_FORMAT);

const showPreview = ref(false);
const previewData = ref<RenamePreview[]>([]);
const renaming = ref(false);
const previewOnly = ref(false);
const isFullscreen = ref(false);

const showResetConfirm = ref(false);
const showMetadata = ref(false);
const metadataFile = ref("");
const metadataInfo = ref<FileMetadata | null>(null);
const loadingMetadata = ref(false);

const showLyricsPreview = ref(false);
const lyricsContent = ref("");
const lyricsFile = ref("");
const lyricsTab = ref<"synced" | "plain">("synced");
const copySuccess = ref(false);

const showCoverPreview = ref(false);
const coverFile = ref("");
const coverData = ref("");

const showManualRename = ref(false);
const manualRenameFile = ref("");
const manualRenameName = ref("");
const manualRenaming = ref(false);

// --- COMPUTED ---

const renameFormat = computed(() => {
  return formatPreset.value === "custom"
    ? customFormat.value || FORMAT_PRESETS["custom"].template
    : FORMAT_PRESETS[formatPreset.value].template;
});

const getAllFilesFlat = (nodes: FileNode[]): FileNode[] => {
  const result: FileNode[] = [];
  for (const node of nodes) {
    if (!node.is_dir) result.push(node);
    if (node.children) result.push(...getAllFilesFlat(node.children));
  }
  return result;
};

const filterFilesByType = (nodes: FileNode[], type: TabType): FileNode[] => {
  return nodes
    .map((node) => {
      if (node.is_dir && node.children) {
        const filteredChildren = filterFilesByType(node.children, type);
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      }
      const ext = node.name.toLowerCase();
      if (
        type === "track" &&
        (ext.endsWith(".flac") || ext.endsWith(".mp3") || ext.endsWith(".m4a"))
      )
        return node;
      if (type === "lyric" && ext.endsWith(".lrc")) return node;
      if (
        type === "cover" &&
        (ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".png"))
      )
        return node;
      return null;
    })
    .filter((node): node is FileNode => node !== null);
};

const filteredFiles = computed(() =>
  filterFilesByType(allFiles.value, activeTab.value),
);

const allAudioFiles = computed(() =>
  getAllFilesFlat(filterFilesByType(allFiles.value, "track")),
);
const allLyricFiles = computed(() =>
  getAllFilesFlat(filterFilesByType(allFiles.value, "lyric")),
);
const allCoverFiles = computed(() =>
  getAllFilesFlat(filterFilesByType(allFiles.value, "cover")),
);

const allSelected = computed(
  () =>
    allAudioFiles.value.length > 0 &&
    selectedFiles.value.size === allAudioFiles.value.length,
);

// --- METHODS ---

const loadSettings = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.formatPreset) formatPreset.value = parsed.formatPreset;
      if (parsed.customFormat) customFormat.value = parsed.customFormat;
    }
  } catch {}

  // We can't easily get downloadPath here without session/store,
  // but in SfSettingsPage it should be available.
};

const saveSettings = () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      formatPreset: formatPreset.value,
      customFormat: customFormat.value,
    }),
  );
};

const loadFiles = async () => {
  if (!rootPath.value) return;
  loading.value = true;
  try {
    const result = await invoke<FileNode[]>("list_directory_items", {
      path: rootPath.value,
    });
    allFiles.value = result || [];
    selectedFiles.value = new Set();
  } catch (err) {
    toast.error("Failed to load files", { description: String(err) });
    allFiles.value = [];
    selectedFiles.value = new Set();
  } finally {
    loading.value = false;
  }
};

const handleSelectFolder = async () => {
  try {
    const path = await invoke<string | null>("select_folder");
    if (path) {
      rootPath.value = path;
      loadFiles();
    }
  } catch (err) {
    toast.error("Failed to select folder");
  }
};

const toggleExpand = (path: string) => {
  const toggleNode = (nodes: FileNode[]): FileNode[] => {
    return nodes.map((node) => {
      if (node.path === path) return { ...node, expanded: !node.expanded };
      if (node.children)
        return { ...node, children: toggleNode(node.children) };
      return node;
    });
  };
  allFiles.value = toggleNode(allFiles.value);
};

const toggleSelect = (path: string) => {
  const newSet = new Set(selectedFiles.value);
  if (newSet.has(path)) newSet.delete(path);
  else newSet.add(path);
  selectedFiles.value = newSet;
};

const toggleFolderSelect = (node: FileNode) => {
  const folderFiles = getAllFilesFlat([node]);
  const allInFolderSelected = folderFiles.every((f) =>
    selectedFiles.value.has(f.path),
  );
  const newSet = new Set(selectedFiles.value);

  if (allInFolderSelected) {
    folderFiles.forEach((f) => newSet.delete(f.path));
  } else {
    folderFiles.forEach((f) => newSet.add(f.path));
  }
  selectedFiles.value = newSet;
};

const isFolderSelected = (node: FileNode): boolean | "indeterminate" => {
  const folderFiles = getAllFilesFlat([node]);
  if (folderFiles.length === 0) return false;
  const selectedCount = folderFiles.filter((f) =>
    selectedFiles.value.has(f.path),
  ).length;
  if (selectedCount === 0) return false;
  if (selectedCount === folderFiles.length) return true;
  return "indeterminate";
};

const selectAll = () => {
  selectedFiles.value = new Set(allAudioFiles.value.map((f) => f.path));
};

const deselectAll = () => {
  selectedFiles.value = new Set();
};

const handlePreview = async (isPreviewOnly: boolean) => {
  if (selectedFiles.value.size === 0) {
    toast.error("No files selected");
    return;
  }
  try {
    const result = await invoke<RenamePreview[]>("preview_rename_files", {
      files: Array.from(selectedFiles.value),
      formatTemplate: renameFormat.value,
    });
    previewData.value = result;
    previewOnly.value = isPreviewOnly;
    showPreview.value = true;
  } catch (err) {
    toast.error("Failed to generate preview", { description: String(err) });
  }
};

const handleRename = async () => {
  if (selectedFiles.value.size === 0) return;
  renaming.value = true;
  try {
    const result = await invoke<RenameResult[]>("rename_files_by_metadata", {
      files: Array.from(selectedFiles.value),
      formatTemplate: renameFormat.value,
    });
    const successCount = result.filter((r) => r.success).length;
    const failCount = result.filter((r) => !r.success).length;

    if (successCount > 0) {
      toast.success("Rename Complete", {
        description: `${successCount} file(s) renamed`,
      });
    } else {
      toast.error("Rename Failed");
    }
    showPreview.value = false;
    selectedFiles.value = new Set();
    loadFiles();
  } catch (err) {
    toast.error("Rename Failed", { description: String(err) });
  } finally {
    renaming.value = false;
  }
};

// --- PREVIEWS ---

const handleShowMetadata = async (filePath: string, e: Event) => {
  e.stopPropagation();
  metadataFile.value = filePath;
  loadingMetadata.value = true;
  try {
    const meta = await invoke<FileMetadata>("read_file_metadata", {
      path: filePath,
    });
    metadataInfo.value = meta;
    showMetadata.value = true;
  } catch (err) {
    toast.error("Failed to read metadata");
  } finally {
    loadingMetadata.value = false;
  }
};

const handleShowLyrics = async (filePath: string, e: Event) => {
  e.stopPropagation();
  lyricsFile.value = filePath;
  lyricsTab.value = "synced";
  try {
    const content = await invoke<string>("read_text_file", { path: filePath });
    lyricsContent.value = content;
    showLyricsPreview.value = true;
  } catch (err) {
    toast.error("Failed to read lyrics");
  }
};

const handleShowCover = async (filePath: string, e: Event) => {
  e.stopPropagation();
  coverFile.value = filePath;
  try {
    const data = await invoke<string>("read_image_as_base64", {
      path: filePath,
    });
    coverData.value = data;
    showCoverPreview.value = true;
  } catch (err) {
    toast.error("Failed to load image");
  }
};

const handleCopyLyrics = async () => {
  try {
    const text =
      lyricsTab.value === "synced"
        ? lyricsContent.value
        : getPlainLyrics(lyricsContent.value);
    await navigator.clipboard.writeText(text);
    copySuccess.value = true;
    setTimeout(() => (copySuccess.value = false), 1500);
  } catch {
    toast.error("Failed to copy");
  }
};

const getPlainLyrics = (content: string) => {
  return content
    .split("\n")
    .map((line) => line.replace(/^\[[\d:.]+\]\s*/, ""))
    .filter((line) => !line.startsWith("[") || line.includes("]"))
    .map((line) => (line.startsWith("[") ? "" : line))
    .join("\n")
    .trim();
};

const formatTimestamp = (timestamp: string): string => {
  const match = timestamp.match(/\[(\d+):(\d+)(?:\.(\d+))?\]/);
  if (!match) return timestamp;
  return `${match[1]}:${match[2]}`;
};

const handleManualRename = (filePath: string, e: Event) => {
  e.stopPropagation();
  const fileName = filePath.split(/[/\\]/).pop() || "";
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");
  manualRenameFile.value = filePath;
  manualRenameName.value = nameWithoutExt;
  showManualRename.value = true;
};

const handleConfirmManualRename = async () => {
  if (!manualRenameFile.value || !manualRenameName.value.trim()) return;
  manualRenaming.value = true;
  try {
    await invoke("rename_file_to", {
      oldPath: manualRenameFile.value,
      newName: manualRenameName.value.trim(),
    });
    toast.success("Renamed successfully");
    showManualRename.value = false;
    loadFiles();
  } catch (err) {
    toast.error("Failed to rename file");
  } finally {
    manualRenaming.value = false;
  }
};

// --- LIFECYCLES ---

onMounted(() => {
  loadSettings();
  const checkFullscreen = () => {
    isFullscreen.value = window.innerHeight >= window.screen.height * 0.9;
  };
  checkFullscreen();
  window.addEventListener("resize", checkFullscreen);
});

onUnmounted(() => {
  //
});

watch([formatPreset, customFormat], saveSettings);

// Tree Renderer Helpers
const onImageError = (e: Event) => {
  (e.target as HTMLImageElement).src = "https://placehold.co/300?text=No+Cover";
};

// Utility for formatting preview string
const previewStr = computed(() => {
  return (
    renameFormat.value
      .replace(/\{title\}/g, "All The Stars")
      .replace(/\{artist\}/g, "Kendrick Lamar, SZA")
      .replace(/\{album\}/g, "Black Panther")
      .replace(/\{album_artist\}/g, "Kendrick Lamar")
      .replace(/\{track\}/g, "01")
      .replace(/\{disc\}/g, "1")
      .replace(/\{year\}/g, "2018")
      .replace(/\{date\}/g, "2018-02-09")
      .replace(/\{isrc\}/g, "USUM71801234") + ".flac"
  );
});
</script>

<template>
  <div class="space-y-6" :class="isFullscreen ? 'h-full flex flex-col' : ''">
    <div class="flex items-center justify-between shrink-0">
      <h1 class="text-2xl font-bold">File Manager</h1>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center gap-2 shrink-0">
      <Input
        v-model="rootPath"
        placeholder="Select a folder..."
        class="flex-1"
      />
      <Button @click="handleSelectFolder">
        <FolderOpen class="h-4 w-4 mr-2" /> Browse
      </Button>
      <Button
        variant="outline"
        @click="loadFiles"
        :disabled="loading || !rootPath"
      >
        <RefreshCw
          class="h-4 w-4 mr-2"
          :class="loading ? 'animate-spin' : ''"
        />
        Refresh
      </Button>
    </div>

    <!-- Tabs -->
    <div class="flex gap-2 border-b shrink-0">
      <Button
        :variant="activeTab === 'track' ? 'default' : 'ghost'"
        size="sm"
        @click="activeTab = 'track'"
        class="rounded-b-none px-4"
      >
        <FileMusic class="h-4 w-4 mr-2" /> Tracks ({{ allAudioFiles.length }})
      </Button>
      <Button
        :variant="activeTab === 'lyric' ? 'default' : 'ghost'"
        size="sm"
        @click="activeTab = 'lyric'"
        class="rounded-b-none px-4"
      >
        <FileText class="h-4 w-4 mr-2" /> Lyrics ({{ allLyricFiles.length }})
      </Button>
      <Button
        :variant="activeTab === 'cover' ? 'default' : 'ghost'"
        size="sm"
        @click="activeTab = 'cover'"
        class="rounded-b-none px-4"
      >
        <Image class="h-4 w-4 mr-2" /> Covers ({{ allCoverFiles.length }})
      </Button>
    </div>

    <!-- Track Settings -->
    <div
      v-if="activeTab === 'track'"
      class="space-y-3 shrink-0 animate-in fade-in duration-300"
    >
      <div class="flex items-center gap-2">
        <Label class="text-sm font-semibold">Rename Format</Label>
        <Info class="h-3.5 w-3.5 text-muted-foreground cursor-help" />
      </div>
      <div class="flex items-center gap-2">
        <select
          v-model="formatPreset"
          class="flex h-10 w-[240px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option v-for="(opt, key) in FORMAT_PRESETS" :key="key" :value="key">
            {{ opt.label }}
          </option>
        </select>
        <Input
          v-if="formatPreset === 'custom'"
          v-model="customFormat"
          placeholder="{artist} - {title}"
          class="flex-1"
        />
        <Button variant="ghost" size="icon" @click="showResetConfirm = true">
          <RotateCcw class="h-4 w-4" />
        </Button>
      </div>
      <p
        class="text-[11px] text-muted-foreground font-mono bg-muted/50 p-2 rounded border border-dashed"
      >
        Preview: <span class="text-primary">{{ previewStr }}</span>
      </p>
    </div>

    <!-- File Browser -->
    <div
      class="border rounded-lg bg-card overflow-hidden flex flex-col"
      :class="isFullscreen ? 'flex-1 min-h-0' : 'min-h-[400px]'"
    >
      <!-- Browser Header -->
      <div
        v-if="activeTab === 'track'"
        class="flex items-center justify-between p-3 border-b bg-muted/30 shrink-0"
      >
        <div class="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            @click="allSelected ? deselectAll() : selectAll()"
          >
            {{ allSelected ? "Deselect All" : "Select All" }}
          </Button>
          <span class="text-xs text-muted-foreground"
            >{{ selectedFiles.size }} of {{ allAudioFiles.length }} file(s)
            selected</span
          >
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            @click="handlePreview(true)"
            :disabled="selectedFiles.size === 0 || loading"
          >
            <Eye class="h-4 w-4 mr-2" /> Preview
          </Button>
          <Button
            size="sm"
            @click="handlePreview(false)"
            :disabled="selectedFiles.size === 0 || loading"
          >
            <Pencil class="h-4 w-4 mr-2" /> Rename
          </Button>
        </div>
      </div>

      <!-- Tree Content -->
      <div class="flex-1 overflow-y-auto p-2 min-h-0">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <Spinner class="h-8 w-8" />
        </div>
        <div
          v-else-if="filteredFiles.length === 0"
          class="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3"
        >
          <Folder class="h-12 w-12 opacity-20" />
          <p>
            {{
              rootPath
                ? `No ${activeTab} files found`
                : "Select a folder to browse files"
            }}
          </p>
        </div>
        <div v-else class="space-y-0.5">
          <template v-for="node in filteredFiles" :key="node.path">
            <FileTreeNode
              :node="node"
              :depth="0"
              :activeTab="activeTab"
              :selectedFiles="selectedFiles"
              @toggle-expand="toggleExpand"
              @toggle-select="toggleSelect"
              @toggle-folder-select="toggleFolderSelect"
              @show-metadata="handleShowMetadata"
              @show-lyrics="handleShowLyrics"
              @show-cover="handleShowCover"
              @manual-rename="handleManualRename"
              :isFolderSelected="isFolderSelected"
            />
          </template>
        </div>
      </div>
    </div>

    <!-- Dialogs -->
    <Dialog :open="showPreview" @update:open="showPreview = $event">
      <DialogContent
        class="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        <DialogHeader>
          <DialogTitle>Rename Preview</DialogTitle>
          <DialogDescription
            >Review path changes before applying.</DialogDescription
          >
        </DialogHeader>
        <div class="flex-1 overflow-y-auto space-y-2 py-4 px-1 min-h-0">
          <div
            v-for="(item, idx) in previewData"
            :key="idx"
            class="p-3 rounded-lg border text-xs"
            :class="
              item.error
                ? 'border-destructive/50 bg-destructive/5'
                : 'border-border bg-muted/20'
            "
          >
            <div class="text-muted-foreground break-all mb-1">
              {{ item.old_name }}
            </div>
            <div v-if="item.error" class="text-destructive font-medium">
              {{ item.error }}
            </div>
            <div
              v-else
              class="text-primary font-bold break-all flex items-start gap-1"
            >
              <ChevronRight class="h-3 w-3 shrink-0 mt-0.5" />
              {{ item.new_name }}
            </div>
          </div>
        </div>
        <DialogFooter class="pt-4 border-t">
          <Button v-if="previewOnly" @click="showPreview = false">Close</Button>
          <template v-else>
            <Button
              variant="outline"
              @click="showPreview = false"
              :disabled="renaming"
              >Cancel</Button
            >
            <Button @click="handleRename" :disabled="renaming" class="gap-2">
              <Spinner v-if="renaming" class="h-4 w-4" />
              {{
                renaming
                  ? "Renaming..."
                  : `Rename ${previewData.filter((p) => !p.error).length} File(s)`
              }}
            </Button>
          </template>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Metadata Dialog -->
    <Dialog :open="showMetadata" @update:open="showMetadata = $event">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Track Metadata</DialogTitle>
          <DialogDescription class="truncate">{{
            metadataFile.split(/[/\\]/).pop()
          }}</DialogDescription>
        </DialogHeader>
        <div class="py-4 space-y-3">
          <div v-if="loadingMetadata" class="flex justify-center py-6">
            <Spinner />
          </div>
          <template v-else-if="metadataInfo">
            <div
              v-for="(val, label) in metadataInfo"
              :key="label"
              class="grid grid-cols-[100px_1fr] gap-2 text-sm border-b border-muted py-1"
            >
              <span class="text-muted-foreground capitalize">{{
                label.replace("_", " ")
              }}</span>
              <span class="font-medium truncate">{{ val || "-" }}</span>
            </div>
          </template>
        </div>
        <DialogFooter
          ><Button @click="showMetadata = false">Close</Button></DialogFooter
        >
      </DialogContent>
    </Dialog>

    <!-- Lyrics Preview -->
    <Dialog :open="showLyricsPreview" @update:open="showLyricsPreview = $event">
      <DialogContent class="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Lyrics Preview</DialogTitle>
          <DialogDescription class="truncate">{{
            lyricsFile.split(/[/\\]/).pop()
          }}</DialogDescription>
        </DialogHeader>
        <div class="flex gap-2 border-b pb-2">
          <Button
            :variant="lyricsTab === 'synced' ? 'default' : 'ghost'"
            size="sm"
            @click="lyricsTab = 'synced'"
            >Synced</Button
          >
          <Button
            :variant="lyricsTab === 'plain' ? 'default' : 'ghost'"
            size="sm"
            @click="lyricsTab = 'plain'"
            >Plain</Button
          >
        </div>
        <div
          class="flex-1 overflow-y-auto py-4 bg-muted/30 rounded-lg my-2 px-4 font-mono text-sm min-h-0"
        >
          <pre v-if="lyricsTab === 'plain'" class="whitespace-pre-wrap">{{
            getPlainLyrics(lyricsContent)
          }}</pre>
          <div v-else class="space-y-1">
            <div
              v-for="(line, idx) in lyricsContent.split('\n')"
              :key="idx"
              class="flex gap-2 group"
            >
              <span
                v-if="line.match(/^\[\d/)"
                class="text-primary/60 shrink-0 font-bold"
                >{{ formatTimestamp(line) }}</span
              >
              <span class="text-foreground/80">{{
                line.replace(/^\[[\d:.]+\]\s*/, "")
              }}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="handleCopyLyrics" class="gap-2">
            <Check v-if="copySuccess" class="h-4 w-4" />
            <Copy v-else class="h-4 w-4" />
            {{ copySuccess ? "Copied" : "Copy" }}
          </Button>
          <Button @click="showLyricsPreview = false">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Cover Preview -->
    <Dialog :open="showCoverPreview" @update:open="showCoverPreview = $event">
      <DialogContent class="max-w-md">
        <DialogHeader><DialogTitle>Cover Preview</DialogTitle></DialogHeader>
        <div class="flex items-center justify-center p-4">
          <img
            :src="coverData"
            class="max-w-full rounded-lg shadow-2xl border"
            @error="onImageError"
          />
        </div>
        <DialogFooter
          ><Button @click="showCoverPreview = false"
            >Close</Button
          ></DialogFooter
        >
      </DialogContent>
    </Dialog>

    <!-- Manual Rename -->
    <Dialog :open="showManualRename" @update:open="showManualRename = $event">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Manual Rename</DialogTitle>
          <DialogDescription class="truncate">{{
            manualRenameFile.split(/[/\\]/).pop()
          }}</DialogDescription>
        </DialogHeader>
        <div class="py-6 space-y-2">
          <Label>New Filename</Label>
          <div class="flex gap-2">
            <Input v-model="manualRenameName" class="flex-1" />
            <Badge variant="outline" class="h-10 px-3">{{
              manualRenameFile.match(/\.[^.]+$/)?.[0] || ""
            }}</Badge>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showManualRename = false"
            >Cancel</Button
          >
          <Button @click="handleConfirmManualRename" :disabled="manualRenaming"
            >Rename</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<!-- INLINE TREE NODE COMPONENT -->
<script lang="ts">
import { defineComponent, type PropType } from "vue";
import type { FileNode, TabType } from "../types/file-manager";

const FileTreeNode = defineComponent({
  name: "FileTreeNode",
  props: {
    node: { type: Object as PropType<FileNode>, required: true },
    depth: { type: Number, required: true },
    activeTab: { type: String as PropType<TabType>, required: true },
    selectedFiles: { type: Object as PropType<Set<string>>, required: true },
    isFolderSelected: {
      type: Function as PropType<(n: FileNode) => boolean | "indeterminate">,
      required: true,
    },
  },
  emits: [
    "toggle-expand",
    "toggle-select",
    "toggle-folder-select",
    "show-metadata",
    "show-lyrics",
    "show-cover",
    "manual-rename",
  ],
  setup(props, { emit }) {
    const formatSize = (s: number) => {
      if (s === 0) return "";
      const k = 1024;
      const i = Math.floor(Math.log(s) / Math.log(k));
      return (s / Math.pow(k, i)).toFixed(1) + " " + ["B", "KB", "MB", "GB"][i];
    };
    return { formatSize };
  },
  template: `
        <div>
            <div 
                class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm group"
                :class="selectedFiles.has(node.path) ? 'bg-primary/5' : ''"
                :style="{ paddingLeft: (depth * 20 + 8) + 'px' }"
                @click="node.is_dir ? $emit('toggle-expand', node.path) : (activeTab === 'track' ? $emit('toggle-select', node.path) : null)"
            >
                <template v-if="node.is_dir">
                    <div @click.stop class="h-4 w-4 flex items-center justify-center">
                        <Checkbox 
                            v-if="activeTab === 'track'"
                            :checked="isFolderSelected(node)" 
                            @update:checked="$emit('toggle-folder-select', node)" 
                        />
                    </div>
                    <ChevronDown v-if="node.expanded" class="h-4 w-4 text-muted-foreground shrink-0" />
                    <ChevronRight v-else class="h-4 w-4 text-muted-foreground shrink-0" />
                    <Folder class="h-4 w-4 text-yellow-500 fill-yellow-500/20 shrink-0" />
                </template>
                <template v-else>
                    <div @click.stop class="h-4 w-4 flex items-center justify-center">
                        <Checkbox 
                            v-if="activeTab === 'track'"
                            :checked="selectedFiles.has(node.path)" 
                            @update:checked="$emit('toggle-select', node.path)" 
                        />
                    </div>
                    <FileMusic v-if="activeTab === 'track'" class="h-4 w-4 text-primary shrink-0" />
                    <FileText v-else-if="activeTab === 'lyric'" class="h-4 w-4 text-blue-500 shrink-0" />
                    <Image v-else class="h-4 w-4 text-green-500 shrink-0" />
                </template>
                
                <span class="truncate flex-1">
                    {{ node.name }}
                    <span v-if="node.is_dir" class="text-[10px] text-muted-foreground ml-1">({{ node.children?.length || 0 }})</span>
                </span>

                <div v-if="!node.is_dir" class="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span class="text-[10px] font-mono text-muted-foreground shrink-0">{{ formatSize(node.size) }}</span>
                    
                    <button v-if="activeTab === 'track'" class="p-1 hover:bg-primary/20 rounded" @click.stop="$emit('show-metadata', node.path, $event)">
                        <Info class="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button v-if="activeTab === 'lyric'" class="p-1 hover:bg-primary/30 rounded" @click.stop="$emit('manual-rename', node.path, $event)">
                        <Pencil class="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button v-if="activeTab === 'lyric'" class="p-1 hover:bg-primary/30 rounded" @click.stop="$emit('show-lyrics', node.path, $event)">
                        <Eye class="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button v-if="activeTab === 'cover'" class="p-1 hover:bg-primary/30 rounded" @click.stop="$emit('manual-rename', node.path, $event)">
                        <Pencil class="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button v-if="activeTab === 'cover'" class="p-1 hover:bg-primary/30 rounded" @click.stop="$emit('show-cover', node.path, $event)">
                        <Eye class="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                </div>
            </div>
            
            <div v-if="node.is_dir && node.expanded && node.children">
                <template v-for="child in node.children" :key="child.path">
                    <FileTreeNode 
                        :node="child" 
                        :depth="depth + 1" 
                        :activeTab="activeTab"
                        :selectedFiles="selectedFiles"
                        @toggle-expand="$emit('toggle-expand', $event)"
                        @toggle-select="$emit('toggle-select', $event)"
                        @toggle-folder-select="$emit('toggle-folder-select', $event)"
                        @show-metadata="$emit('show-metadata', $event)"
                        @show-lyrics="$emit('show-lyrics', $event)"
                        @show-cover="$emit('show-cover', $event)"
                        @manual-rename="$emit('manual-rename', $event)"
                        :isFolderSelected="isFolderSelected"
                    />
                </template>
            </div>
        </div>
    `,
});
export { FileTreeNode };
</script>

<style scoped>
pre::-webkit-scrollbar {
  width: 6px;
}
pre::-webkit-scrollbar-thumb {
  background: hsl(var(--muted));
  border-radius: 3px;
}
</style>
