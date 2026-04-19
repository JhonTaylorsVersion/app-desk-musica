<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';
import { listen } from '@tauri-apps/api/event';

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Upload, X, CheckCircle2, AlertCircle, Trash2, FileMusic, AudioLines } from "lucide-vue-next";
import { Spinner } from "@/components/ui/spinner";
import { toastWithSound as toast } from "@/modules/spotiflac/utils/toast-with-sound";

interface AudioFile {
  path: string;
  name: string;
  format: string;
  size: number;
  status: "pending" | "resampling" | "success" | "error";
  error?: string;
  outputPath?: string;
  srcSampleRate?: number;
  srcBitDepth?: number;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatSampleRate = (sr?: number): string => {
  if (!sr) return "";
  if (sr === 44100) return "44.1kHz";
  if (sr >= 1000) return `${sr / 1000}kHz`;
  return `${sr}Hz`;
};

const SAMPLE_RATE_OPTIONS = [
  { value: "44100", label: "44.1kHz" },
  { value: "48000", label: "48kHz" },
  { value: "96000", label: "96kHz" },
  { value: "192000", label: "192kHz" },
];

const BIT_DEPTH_OPTIONS = [
  { value: "16", label: "16-bit" },
  { value: "24", label: "24-bit" },
];

const STORAGE_KEY = "spotiflac_audio_resampler_state";

const files = ref<AudioFile[]>([]);
const sampleRate = ref("44100");
const bitDepth = ref("16");

const resampling = ref(false);
const isDragging = ref(false);
const isFullscreen = ref(false);

onMounted(() => {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.files?.length > 0) files.value = parsed.files;
      if (parsed.sampleRate) sampleRate.value = parsed.sampleRate;
      if (parsed.bitDepth) bitDepth.value = parsed.bitDepth;
    }
  } catch (err) {
    console.error("Failed to load saved state:", err);
  }

  const checkFullscreen = () => {
    const isMaximized = window.innerHeight >= window.screen.height * 0.9;
    isFullscreen.value = isMaximized;
  };
  
  checkFullscreen();
  window.addEventListener("resize", checkFullscreen);
  
  return () => {
    window.removeEventListener("resize", checkFullscreen);
  };
});

onMounted(async () => {
  const unlistenFileDrop = await listen<{ paths: string[] }>('tauri://file-drop', (event) => {
    isDragging.value = false;
    handleFileDrop(event.payload.paths);
  });
  const unlistenFileDropHover = await listen('tauri://file-drop-hover', () => {
    isDragging.value = true;
  });
  const unlistenFileDropCancelled = await listen('tauri://file-drop-cancelled', () => {
    isDragging.value = false;
  });
  
  onUnmounted(() => {
    unlistenFileDrop();
    unlistenFileDropHover();
    unlistenFileDropCancelled();
  });
});

watch([files, sampleRate, bitDepth], () => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      files: files.value,
      sampleRate: sampleRate.value,
      bitDepth: bitDepth.value,
    }));
  } catch (err) {
    console.error("Failed to save state:", err);
  }
}, { deep: true });

const handleSelectFiles = async () => {
  try {
    const selected = await open({
      multiple: true,
      filters: [{ name: 'FLAC Audio', extensions: ['flac'] }]
    });
    if (selected && Array.isArray(selected)) {
      await addFiles(selected);
    } else if (selected) {
      await addFiles([selected as string]);
    }
  } catch (err) {
    toast.error("File Selection Failed", {
      description: err instanceof Error ? err.message : "Failed to select files",
    });
  }
};

const handleSelectFolder = async () => {
  try {
    const selectedFolder = await open({ directory: true });
    if (selectedFolder && typeof selectedFolder === 'string') {
      const folderFiles: { path: string }[] = await invoke('list_audio_files', { dirPath: selectedFolder });
      if (folderFiles && folderFiles.length > 0) {
        await addFiles(folderFiles.map((f) => f.path));
      } else {
        toast.info("No audio files found", {
          description: "No FLAC files found in the selected folder.",
        });
      }
    }
  } catch (err) {
    toast.error("Folder Selection Failed", {
      description: err instanceof Error ? err.message : "Failed to select folder",
    });
  }
};

const addFiles = async (paths: string[]) => {
  const validExtensions = [".flac"];
  
  const invalidFiles = paths.filter((path) => {
    const ext = path.toLowerCase().slice(path.lastIndexOf("."));
    return !validExtensions.includes(ext);
  });
  
  if (invalidFiles.length > 0) {
    toast.error("Unsupported format", {
      description: "Only FLAC files are supported for resampling.",
    });
  }
  
  const validPaths = paths.filter((path) => {
    const ext = path.toLowerCase().slice(path.lastIndexOf("."));
    return validExtensions.includes(ext);
  });
  
  const newAudioFiles: AudioFile[] = [];
  
  for (const path of validPaths) {
    if (files.value.some(f => f.path === path)) continue;
    
    let fileSize = 0;
    try {
      const stats = await stat(path);
      fileSize = stats.size;
    } catch (e) {
      console.warn("Failed to get file size for", path, e);
    }
    
    const name = path.split(/[/\\]/).pop() || path;
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    
    newAudioFiles.push({
      path,
      name,
      format: ext,
      size: fileSize,
      status: "pending"
    });
  }
  
  if (newAudioFiles.length > 0) {
    if (paths.length > newAudioFiles.length + invalidFiles.length) {
      const skipped = paths.length - newAudioFiles.length - invalidFiles.length;
      toast.info("Some files skipped", {
        description: `${skipped} file(s) were already added`,
      });
    }
    files.value = [...files.value, ...newAudioFiles];
  } else if (validPaths.length > 0) {
    toast.info("No new files added", {
      description: "All valid files were already added",
    });
  }
};

const handleFileDrop = async (paths: string[]) => {
  if (paths.length === 0) return;
  await addFiles(paths);
};

const removeFile = (path: string) => {
  files.value = files.value.filter((f) => f.path !== path);
};

const clearFiles = () => {
  files.value = [];
};

const handleResample = async () => {
  if (files.value.length === 0) {
    toast.error("No files selected", {
      description: "Please add FLAC files to resample",
    });
    return;
  }
  
  resampling.value = true;
  try {
    const inputPaths = files.value.map((f) => f.path);
    files.value = files.value.map((f) => {
      if (inputPaths.includes(f.path)) {
        return { ...f, status: "resampling", error: undefined };
      }
      return f;
    });
    
    const results: any[] = await invoke('resample_audio_batch', {
      request: {
        input_files: inputPaths,
        sample_rate: sampleRate.value,
        bit_depth: bitDepth.value,
      }
    });
    
    files.value = files.value.map((f) => {
      const result = results.find((r: any) => r.input_file === f.path || r.input_file.toLowerCase() === f.path.toLowerCase());
      if (result) {
        return {
          ...f,
          status: result.success ? "success" : "error",
          error: result.error,
          outputPath: result.output_file,
        };
      }
      return f;
    });
    
    const successCount = results.filter((r: any) => r.success).length;
    const failCount = results.filter((r: any) => !r.success).length;
    
    if (successCount > 0) {
      toast.success("Resampling Complete", {
        description: `Successfully resampled ${successCount} file(s)${failCount > 0 ? `, ${failCount} failed` : ""}`,
      });
    } else if (failCount > 0) {
      toast.error("Resampling Failed", {
        description: `All ${failCount} file(s) failed to resample`,
      });
    }
  } catch (err) {
    toast.error("Resampling Error", {
      description: err instanceof Error ? err.message : String(err),
    });
    files.value = files.value.map((f) => ({ ...f, status: "error", error: "Resampling failed" }));
  } finally {
    resampling.value = false;
  }
};

const resampleableCount = computed(() => files.value.filter((f) => f.status === "pending" || f.status === "success").length);
const successCount = computed(() => files.value.filter((f) => f.status === "success").length);
</script>

<template>
  <div class="space-y-6" :class="isFullscreen ? 'h-full flex flex-col' : ''">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Audio Resampler</h1>
      <div v-if="files.length > 0" class="flex gap-2">
        <Button variant="outline" size="sm" @click="handleSelectFiles">
          <Upload class="h-4 w-4 mr-2"/> Add Files
        </Button>
        <Button variant="outline" size="sm" @click="handleSelectFolder">
          <Upload class="h-4 w-4 mr-2"/> Add Folder
        </Button>
        <Button variant="outline" size="sm" @click="clearFiles" :disabled="resampling">
          <Trash2 class="h-4 w-4 mr-2"/> Clear All
        </Button>
      </div>
    </div>

    <div 
      class="flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-all relative overflow-hidden" 
      :class="`${isFullscreen ? 'flex-1 min-h-[400px]' : 'h-[400px]'} ${isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'}`"
    >
      <div v-show="isDragging" class="absolute inset-0 z-50 bg-background/50 flex items-center justify-center pointer-events-none">
        <div class="bg-primary text-primary-foreground p-4 rounded-xl shadow-xl flex items-center gap-3">
          <Upload class="h-8 w-8 animate-bounce" />
          <span class="text-xl font-bold">Drop Action Audio Files Here</span>
        </div>
      </div>
      
      <div v-if="files.length === 0" class="flex flex-col items-center justify-center p-6 w-full">
        <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Upload class="h-8 w-8 text-primary"/>
        </div>
        <p class="text-sm text-muted-foreground mb-4 text-center">
          {{ isDragging ? "Drop your audio files here" : "Drag and drop audio files here, or click the button below to select" }}
        </p>
        <div class="flex gap-3">
          <Button @click="handleSelectFiles" size="lg">
            <Upload class="h-5 w-5 mr-2"/> Select Files
          </Button>
          <Button @click="handleSelectFolder" size="lg" variant="outline">
            <Upload class="h-5 w-5 mr-2"/> Select Folder
          </Button>
        </div>
        <p class="text-xs text-muted-foreground mt-4 text-center">
          Supported format: FLAC
        </p>
      </div>

      <div v-else class="w-full h-full p-6 space-y-4 flex flex-col pt-0 pb-0">
        <div class="space-y-2 pb-4 pt-6 border-b shrink-0">
          <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-2">
              <Label class="whitespace-nowrap">Bit Depth:</Label>
              <ToggleGroup type="single" variant="outline" v-model="bitDepth">
                <ToggleGroupItem v-for="opt in BIT_DEPTH_OPTIONS" :key="opt.value" :value="opt.value" :aria-label="opt.label">
                  {{ opt.label }}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div class="flex items-center gap-2">
              <Label class="whitespace-nowrap">Sample Rate:</Label>
              <ToggleGroup type="single" variant="outline" v-model="sampleRate">
                <ToggleGroupItem v-for="opt in SAMPLE_RATE_OPTIONS" :key="opt.value" :value="opt.value" :aria-label="opt.label">
                  {{ opt.label }}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between shrink-0">
          <div class="text-sm text-muted-foreground">
            {{ files.length }} file(s) • {{ successCount }} resampled
          </div>
        </div>

        <div class="flex-1 space-y-2 overflow-y-auto min-h-0 pr-2">
          <div v-for="file in files" :key="file.path" class="flex items-center gap-3 rounded-lg border p-3">
            <Spinner v-if="file.status === 'resampling'" class="h-4 w-4 text-primary" />
            <CheckCircle2 v-else-if="file.status === 'success'" class="h-4 w-4 text-green-500" />
            <AlertCircle v-else-if="file.status === 'error'" class="h-4 w-4 text-destructive" />
            <FileMusic v-else class="h-4 w-4 text-muted-foreground" />
            
            <div class="flex-1 min-w-0">
              <p class="truncate text-sm font-medium">{{ file.name }}</p>
              <p v-if="file.error" class="truncate text-xs text-destructive">
                {{ file.error }}
              </p>
            </div>

            <span class="text-xs text-muted-foreground shrink-0 whitespace-nowrap hidden sm:inline-block">
              {{ formatFileSize(file.size) }}
            </span>
            <span class="text-xs uppercase text-muted-foreground shrink-0">
              {{ file.format }}
            </span>
            
            <Button 
              v-if="file.status !== 'resampling'" 
              variant="ghost" 
              size="icon" 
              class="h-8 w-8 ml-2 shrink-0" 
              @click="removeFile(file.path)" 
              :disabled="resampling"
            >
              <X class="h-4 w-4"/>
            </Button>
          </div>
        </div>

        <div class="flex justify-center pt-4 pb-6 border-t shrink-0">
          <Button @click="handleResample" :disabled="resampling || resampleableCount === 0" size="lg" class="w-full sm:w-auto">
            <template v-if="resampling">
              <Spinner class="h-4 w-4 mr-2"/> Resampling...
            </template>
            <template v-else>
              <AudioLines :size="16" class="mr-2 text-primary-foreground"/>
              Resample {{ resampleableCount > 0 ? `${resampleableCount} File(s)` : "" }}
            </template>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
