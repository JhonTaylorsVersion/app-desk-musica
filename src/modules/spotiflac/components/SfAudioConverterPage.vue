<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FileMusic,
  WandSparkles,
} from "lucide-vue-next";
import { Spinner } from "@/components/ui/spinner";
import { toastWithSound as toast } from "@/modules/spotiflac/utils/toast-with-sound";

interface AudioFile {
  path: string;
  name: string;
  format: string;
  size: number;
  status: "pending" | "converting" | "success" | "error";
  error?: string;
  outputPath?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const BITRATE_OPTIONS = [
  { value: "320k", label: "320k" },
  { value: "256k", label: "256k" },
  { value: "192k", label: "192k" },
  { value: "128k", label: "128k" },
];

const M4A_CODEC_OPTIONS = [
  { value: "aac", label: "AAC" },
  { value: "alac", label: "ALAC" },
];

const STORAGE_KEY = "spotiflac_audio_converter_state";

const files = ref<AudioFile[]>([]);
const outputFormat = ref<"mp3" | "m4a">("mp3");
const bitrate = ref("320k");
const m4aCodec = ref<"aac" | "alac">("aac");

const converting = ref(false);
const isDragging = ref(false);
const isFullscreen = ref(false);

// Load state
onMounted(() => {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.files?.length > 0) files.value = parsed.files;
      if (parsed.outputFormat) outputFormat.value = parsed.outputFormat;
      if (parsed.bitrate) bitrate.value = parsed.bitrate;
      if (parsed.m4aCodec) m4aCodec.value = parsed.m4aCodec;
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

  // Clean up
  return () => {
    window.removeEventListener("resize", checkFullscreen);
  };
});

// Setup Tauri drag & drop
onMounted(async () => {
  const unlistenFileDrop = await listen<{ paths: string[] }>(
    "tauri://file-drop",
    (event) => {
      isDragging.value = false;
      handleFileDrop(event.payload.paths);
    },
  );
  const unlistenFileDropHover = await listen("tauri://file-drop-hover", () => {
    isDragging.value = true;
  });
  const unlistenFileDropCancelled = await listen(
    "tauri://file-drop-cancelled",
    () => {
      isDragging.value = false;
    },
  );

  onUnmounted(() => {
    unlistenFileDrop();
    unlistenFileDropHover();
    unlistenFileDropCancelled();
  });
});

// Save state
watch(
  [files, outputFormat, bitrate, m4aCodec],
  () => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          files: files.value,
          outputFormat: outputFormat.value,
          bitrate: bitrate.value,
          m4aCodec: m4aCodec.value,
        }),
      );
    } catch (err) {
      console.error("Failed to save state:", err);
    }
  },
  { deep: true },
);

// Auto-adjust formats
watch([files, outputFormat, m4aCodec], () => {
  if (files.value.length === 0) return;
  const allMP3 = files.value.every((f) => f.format === "mp3");
  if (allMP3 && outputFormat.value !== "m4a") {
    outputFormat.value = "m4a";
  }
  const hasFlac = files.value.some((f) => f.format === "flac");
  if (!hasFlac && m4aCodec.value === "alac") {
    m4aCodec.value = "aac";
  }
});

const isFormatDisabled = computed(
  () => files.value.length > 0 && files.value.every((f) => f.format === "mp3"),
);
const hasFlacFiles = computed(() =>
  files.value.some((f) => f.format === "flac"),
);

const handleSelectFiles = async () => {
  try {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Audio", extensions: ["mp3", "flac"] }],
    });
    if (selected && Array.isArray(selected)) {
      await addFiles(selected);
    } else if (selected) {
      await addFiles([selected as string]);
    }
  } catch (err) {
    toast.error("File Selection Failed", {
      description:
        err instanceof Error ? err.message : "Failed to select files",
    });
  }
};

const handleSelectFolder = async () => {
  try {
    const selectedFolder = await open({ directory: true });
    if (selectedFolder && typeof selectedFolder === "string") {
      const folderFiles: { path: string }[] = await invoke("list_audio_files", {
        dirPath: selectedFolder,
      });
      if (folderFiles && folderFiles.length > 0) {
        await addFiles(folderFiles.map((f) => f.path));
      } else {
        toast.info("No audio files found", {
          description: "No FLAC or MP3 files found in the selected folder.",
        });
      }
    }
  } catch (err) {
    toast.error("Folder Selection Failed", {
      description:
        err instanceof Error ? err.message : "Failed to select folder",
    });
  }
};

const addFiles = async (paths: string[]) => {
  const validExtensions = [".mp3", ".flac"];
  const m4aFiles = paths.filter((path) => {
    const ext = path.toLowerCase().slice(path.lastIndexOf("."));
    return ext === ".m4a";
  });

  if (m4aFiles.length > 0) {
    toast.error("M4A files not supported", {
      description:
        "Only FLAC and MP3 files are supported as input. Please convert M4A files first.",
    });
  }

  const validPaths = paths.filter((path) => {
    const ext = path.toLowerCase().slice(path.lastIndexOf("."));
    return validExtensions.includes(ext);
  });

  const newAudioFiles: AudioFile[] = [];

  for (const path of validPaths) {
    if (files.value.some((f) => f.path === path)) continue;

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
      status: "pending",
    });
  }

  if (newAudioFiles.length > 0) {
    if (paths.length > newAudioFiles.length) {
      const skipped = paths.length - newAudioFiles.length;
      toast.info("Some files skipped", {
        description: `${skipped} file(s) were skipped (unsupported format or already added)`,
      });
    }
    files.value = [...files.value, ...newAudioFiles];
  } else if (paths.length > 0 && m4aFiles.length === 0) {
    toast.info("No new files added", {
      description: "All files were already added or have unsupported format",
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

const handleConvert = async () => {
  if (files.value.length === 0) {
    toast.error("No files selected", {
      description: "Please add audio files to convert",
    });
    return;
  }

  converting.value = true;
  try {
    const inputPaths = files.value.map((f) => f.path);
    files.value = files.value.map((f) => {
      if (inputPaths.includes(f.path)) {
        return { ...f, status: "converting", error: undefined };
      }
      return f;
    });

    // Call Tauri backend string `convert_audio_batch`
    const results: any[] = await invoke("convert_audio_batch", {
      inputFiles: inputPaths,
      outputFormat: outputFormat.value,
      bitrate: bitrate.value,
      codec: outputFormat.value === "m4a" ? m4aCodec.value : "",
    });

    files.value = files.value.map((f) => {
      const result = results.find(
        (r: any) =>
          r.input_file === f.path ||
          r.input_file.toLowerCase() === f.path.toLowerCase(),
      );
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
      toast.success("Conversion Complete", {
        description: `Successfully converted ${successCount} file(s)${failCount > 0 ? `, ${failCount} failed` : ""}`,
      });
    } else if (failCount > 0) {
      toast.error("Conversion Failed", {
        description: `All ${failCount} file(s) failed to convert`,
      });
    }
  } catch (err) {
    toast.error("Conversion Error", {
      description: err instanceof Error ? err.message : String(err),
    });
    files.value = files.value.map((f) => ({
      ...f,
      status: "error",
      error: "Conversion failed",
    }));
  } finally {
    converting.value = false;
  }
};

const convertableCount = computed(
  () =>
    files.value.filter((f) => f.status === "pending" || f.status === "success")
      .length,
);
const successCount = computed(
  () => files.value.filter((f) => f.status === "success").length,
);

import { computed } from "vue";
</script>

<template>
  <div class="space-y-6" :class="isFullscreen ? 'h-full flex flex-col' : ''">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Audio Converter</h1>
      <div v-if="files.length > 0" class="flex gap-2">
        <Button variant="outline" size="sm" @click="handleSelectFiles">
          <Upload class="h-4 w-4 mr-2" /> Add Files
        </Button>
        <Button variant="outline" size="sm" @click="handleSelectFolder">
          <Upload class="h-4 w-4 mr-2" /> Add Folder
        </Button>
        <Button
          variant="outline"
          size="sm"
          @click="clearFiles"
          :disabled="converting"
        >
          <Trash2 class="h-4 w-4 mr-2" /> Clear All
        </Button>
      </div>
    </div>

    <!-- Drop Zone / Main Area -->
    <div
      class="flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-all relative overflow-hidden"
      :class="`${isFullscreen ? 'flex-1 min-h-[400px]' : 'h-[400px]'} ${isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'}`"
    >
      <!-- Overlay for dragging -->
      <div
        v-show="isDragging"
        class="absolute inset-0 z-50 bg-background/50 flex items-center justify-center pointer-events-none"
      >
        <div
          class="bg-primary text-primary-foreground p-4 rounded-xl shadow-xl flex items-center gap-3"
        >
          <Upload class="h-8 w-8 animate-bounce" />
          <span class="text-xl font-bold">Drop Audio Files Here</span>
        </div>
      </div>

      <div
        v-if="files.length === 0"
        class="flex flex-col items-center justify-center p-6 w-full"
      >
        <div
          class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted"
        >
          <Upload class="h-8 w-8 text-primary" />
        </div>
        <p class="text-sm text-muted-foreground mb-4 text-center">
          {{
            isDragging
              ? "Drop your audio files here"
              : "Drag and drop audio files here, or click the button below to select"
          }}
        </p>
        <div class="flex gap-3">
          <Button @click="handleSelectFiles" size="lg">
            <Upload class="h-5 w-5 mr-2" /> Select Files
          </Button>
          <Button @click="handleSelectFolder" size="lg" variant="outline">
            <Upload class="h-5 w-5 mr-2" /> Select Folder
          </Button>
        </div>
        <p class="text-xs text-muted-foreground mt-4 text-center">
          Supported formats: FLAC, MP3
        </p>
      </div>

      <div v-else class="w-full h-full p-6 space-y-4 flex flex-col pt-0 pb-0">
        <!-- Settings Header -->
        <div class="space-y-2 pb-4 pt-6 border-b shrink-0">
          <div class="flex items-center flex-wrap gap-4">
            <div class="flex items-center gap-2">
              <Label class="whitespace-nowrap">Format:</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                v-model="outputFormat"
                :disabled="isFormatDisabled"
              >
                <ToggleGroupItem
                  v-if="!isFormatDisabled"
                  value="mp3"
                  aria-label="MP3"
                  >MP3</ToggleGroupItem
                >
                <ToggleGroupItem
                  value="m4a"
                  aria-label="M4A"
                  :disabled="isFormatDisabled"
                  >M4A</ToggleGroupItem
                >
              </ToggleGroup>
            </div>

            <div
              v-if="outputFormat === 'm4a' && hasFlacFiles"
              class="flex items-center gap-2"
            >
              <Label class="whitespace-nowrap">Codec:</Label>
              <ToggleGroup type="single" variant="outline" v-model="m4aCodec">
                <ToggleGroupItem
                  v-for="opt in M4A_CODEC_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                  :aria-label="opt.label"
                >
                  {{ opt.label }}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div
              v-if="!(outputFormat === 'm4a' && m4aCodec === 'alac')"
              class="flex items-center gap-2"
            >
              <Label class="whitespace-nowrap">Bitrate:</Label>
              <ToggleGroup type="single" variant="outline" v-model="bitrate">
                <ToggleGroupItem
                  v-for="opt in BITRATE_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                  :aria-label="opt.label"
                >
                  {{ opt.label }}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between shrink-0">
          <div class="text-sm text-muted-foreground">
            {{ files.length }} file(s) • {{ successCount }} converted
          </div>
        </div>

        <div class="flex-1 space-y-2 overflow-y-auto min-h-0 pr-2">
          <div
            v-for="file in files"
            :key="file.path"
            class="flex items-center gap-3 rounded-lg border p-3"
          >
            <!-- Icon -->
            <Spinner
              v-if="file.status === 'converting'"
              class="h-4 w-4 text-primary"
            />
            <CheckCircle2
              v-else-if="file.status === 'success'"
              class="h-4 w-4 text-green-500"
            />
            <AlertCircle
              v-else-if="file.status === 'error'"
              class="h-4 w-4 text-destructive"
            />
            <FileMusic v-else class="h-4 w-4 text-muted-foreground" />

            <div class="flex-1 min-w-0">
              <p class="truncate text-sm font-medium">{{ file.name }}</p>
              <p v-if="file.error" class="truncate text-xs text-destructive">
                {{ file.error }}
              </p>
            </div>

            <span
              class="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline-block"
            >
              {{ formatFileSize(file.size) }}
            </span>
            <span class="text-xs uppercase text-muted-foreground">
              {{ file.format }}
            </span>

            <Button
              v-if="file.status !== 'converting'"
              variant="ghost"
              size="icon"
              class="h-8 w-8 ml-2"
              @click="removeFile(file.path)"
              :disabled="converting"
            >
              <X class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div class="flex justify-center pt-4 pb-6 border-t shrink-0">
          <Button
            @click="handleConvert"
            :disabled="converting || convertableCount === 0"
            size="lg"
            class="w-full sm:w-auto"
          >
            <template v-if="converting">
              <Spinner class="h-4 w-4 mr-2" /> Converting...
            </template>
            <template v-else>
              <WandSparkles class="h-4 w-4 mr-2" /> Convert
              {{ convertableCount > 0 ? `${convertableCount} File(s)` : "" }}
            </template>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
