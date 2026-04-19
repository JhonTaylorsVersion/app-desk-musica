<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Activity } from 'lucide-vue-next';
import type { AnalysisResult } from '../utils/flac-analysis';

interface Props {
  result: AnalysisResult | null;
  analyzing: boolean;
  onAnalyze?: () => void;
  showAnalyzeButton?: boolean;
  filePath?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showAnalyzeButton: true
});

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatNumber = (num: number) => {
  return num.toFixed(2);
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};
</script>

<template>
  <Card v-if="analyzing">
    <CardContent class="px-6 py-8">
      <div class="flex items-center justify-center gap-3">
        <Spinner class="h-5 w-5" />
        <span class="text-muted-foreground animate-pulse">Analyzing audio quality...</span>
      </div>
    </CardContent>
  </Card>

  <Card v-else-if="!result && showAnalyzeButton">
    <CardContent class="px-6 py-12">
      <div class="flex flex-col items-center justify-center gap-4 text-center">
        <div class="p-4 rounded-full bg-primary/10">
          <Activity class="h-10 w-10 text-primary" />
        </div>
        <div class="space-y-2">
          <h3 class="font-semibold text-lg">Audio Quality Analysis</h3>
          <p class="text-sm text-muted-foreground max-w-sm">
            Inspect spectral content and effective quality of FLAC, MP3, M4A, and AAC files. 
            Identify upscales and transcodes with precision.
          </p>
        </div>
        <Button v-if="onAnalyze" @click="onAnalyze" size="lg" class="gap-2">
          <Activity class="h-4 w-4" />
          Start Analysis
        </Button>
      </div>
    </CardContent>
  </Card>

  <Card v-else-if="result" class="overflow-hidden border-primary/20 bg-primary/5">
    <CardHeader v-if="filePath" class="pb-2 border-b bg-muted/30">
      <p class="text-xs font-mono break-all text-muted-foreground opacity-80">{{ filePath }}</p>
    </CardHeader>

    <CardContent class="pt-6">
      <div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <!-- Format Column -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 border-b pb-1">
            <div class="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
            <p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Format & Identity</p>
          </div>
          <ul class="space-y-2.5 text-sm">
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Codec Type:</span>
              <span class="font-bold font-mono text-primary">{{ result.file_type }}</span>
            </li>
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Sample Rate:</span>
              <span class="font-medium font-mono tabular-nums">{{ (result.sample_rate / 1000).toFixed(1) }} kHz</span>
            </li>
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Bit Depth:</span>
              <span class="font-medium font-mono">{{ result.bit_depth }}</span>
            </li>
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Channels:</span>
              <span class="font-medium font-mono">{{ result.channels === 2 ? "Stereo" : result.channels === 1 ? "Mono" : result.channels }}</span>
            </li>
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Duration:</span>
              <span class="font-medium font-mono tabular-nums">{{ formatDuration(result.duration) }}</span>
            </li>
            <li v-if="result.file_size" class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">File Size:</span>
              <span class="font-medium font-mono tabular-nums">{{ formatFileSize(result.file_size) }}</span>
            </li>
          </ul>
        </div>

        <!-- Analytics Column -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 border-b pb-1">
            <div class="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
            <p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Signal Analytics</p>
          </div>
          <ul class="space-y-2.5 text-sm">
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Nyquist Limit:</span>
              <span class="font-medium font-mono tabular-nums">{{ (result.sample_rate / 2000).toFixed(1) }} kHz</span>
            </li>
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Dynamic Range:</span>
              <span class="font-medium font-mono tabular-nums">{{ formatNumber(result.dynamic_range) }} dB</span>
            </li>
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Peak Amplitude:</span>
              <span class="font-medium font-mono tabular-nums">{{ formatNumber(result.peak_amplitude) }} dB</span>
            </li>
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">RMS Level:</span>
              <span class="font-medium font-mono tabular-nums">{{ formatNumber(result.rms_level) }} dB</span>
            </li>
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Total Samples:</span>
              <span class="font-medium font-mono tabular-nums">{{ result.total_samples.toLocaleString() }}</span>
            </li>
          </ul>
        </div>

        <!-- Spectrum Meta Column (Conditional) -->
        <div v-if="result.spectrum" class="space-y-4">
          <div class="flex items-center gap-2 border-b pb-1">
            <div class="h-1.5 w-1.5 rounded-full bg-purple-500"></div>
            <p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Processing Meta</p>
          </div>
          <ul class="space-y-2.5 text-sm">
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">FFT Windows:</span>
              <span class="font-medium font-mono tabular-nums">{{ result.spectrum.time_slices.length.toLocaleString() }}</span>
            </li>
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">FFT Buffer:</span>
              <span class="font-medium font-mono tabular-nums">{{ (result.spectrum.freq_bins - 1) * 2 }}</span>
            </li>
            <li class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Resolution:</span>
              <span class="font-medium font-mono tabular-nums">{{ (result.sample_rate / ((result.spectrum.freq_bins - 1) * 2)).toFixed(2) }} Hz</span>
            </li>
            <li v-if="result.bitrate_kbps" class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Avg. Bitrate:</span>
              <span class="font-bold font-mono text-primary tabular-nums">{{ result.bitrate_kbps }} kbps</span>
            </li>
            <li v-if="result.codec_mode" class="flex justify-between items-baseline">
              <span class="text-muted-foreground text-xs">Encoding:</span>
              <span class="font-medium font-mono">{{ result.codec_mode }}</span>
            </li>
          </ul>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
