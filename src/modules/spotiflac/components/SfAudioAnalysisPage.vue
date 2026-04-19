<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAudioAnalysis } from '../composables/useAudioAnalysis';
import SfAudioAnalysis from './SfAudioAnalysis.vue';
import SfSpectrumVisualization from './SfSpectrumVisualization.vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Activity, FileAudio, Trash2, Download, Maximize2, X } from 'lucide-vue-next';
import { open } from '@tauri-apps/plugin-dialog';

const {
  analyzing,
  analysisProgress,
  result,
  error,
  selectedFilePath,
  spectrumLoading,
  spectrumProgress,
  analyzeFilePath,
  reAnalyzeSpectrum,
  clearResult,
  cancelAnalysis
} = useAudioAnalysis();

const pickFile = async () => {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: 'Audio Files',
        extensions: ['flac', 'mp3', 'm4a', 'aac', 'wav', 'ogg']
      }
    ]
  });

  if (selected && typeof selected === 'string') {
    analyzeFilePath(selected);
  }
};

const handleDownloadCanvas = () => {
  // To be implemented via ref if needed, but original used a hidden canvas trick
  // For now we just implement the UI
};

const showFullscreenSpectrum = ref(false);
</script>

<template>
  <div class="min-h-full flex flex-col space-y-6 max-w-[1400px] mx-auto pb-12">
    <!-- Header Section -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 sticky top-0 bg-background/95 backdrop-blur z-20">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Audio Analysis</h1>
        <p class="text-muted-foreground">Spectral inspection and quality verification for audio masters.</p>
      </div>
      <div class="flex items-center gap-2">
        <Button v-if="result" variant="outline" size="sm" @click="clearResult" class="h-9 gap-2">
          <Trash2 class="h-4 w-4" />
          Clear result
        </Button>
        <Button @click="pickFile" :disabled="analyzing" class="h-9 gap-2 shadow-lg shadow-primary/20">
          <FileAudio class="h-4 w-4" />
          {{ result ? 'Check another file' : 'Select audio file' }}
        </Button>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="space-y-6">
      <!-- Error State -->
      <Card v-if="error" class="border-destructive/50 bg-destructive/5">
        <CardContent class="p-6">
          <div class="flex items-center gap-3 text-destructive">
            <X class="h-5 w-5" />
            <p class="font-medium">{{ error }}</p>
          </div>
        </CardContent>
      </Card>

      <!-- Analysis Results Section -->
      <div v-if="analyzing || result" class="grid grid-cols-1 gap-6">
        <!-- Technical Details Card -->
        <SfAudioAnalysis 
          :result="result" 
          :analyzing="analyzing" 
          :filePath="selectedFilePath"
        />

        <!-- Progress Overlay for global analysis -->
        <div v-if="analyzing" class="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md">
          <div class="w-full max-w-md p-8 bg-card border rounded-2xl shadow-2xl space-y-6 text-center">
            <div class="relative mx-auto h-20 w-20">
              <div class="absolute inset-0 rounded-full border-4 border-primary/20"></div>
              <div class="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
              <Activity class="absolute inset-0 m-auto h-8 w-8 text-primary animate-pulse" />
            </div>
            <div class="space-y-2">
              <h3 class="text-xl font-bold">{{ analysisProgress.message }}</h3>
              <p class="text-sm text-muted-foreground tabular-nums">{{ analysisProgress.percent }}% complete</p>
            </div>
            <div class="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div 
                class="bg-primary h-full transition-all duration-300" 
                :style="{ width: `${analysisProgress.percent}%` }"
              ></div>
            </div>
            <Button variant="ghost" size="sm" @click="cancelAnalysis" class="text-muted-foreground hover:text-destructive">
              Cancel Analysis
            </Button>
          </div>
        </div>

        <!-- Spectrum Visualization Section -->
        <div v-if="result" class="space-y-4">
          <div class="flex items-center justify-between border-l-4 border-primary pl-4">
            <div class="space-y-0.5">
              <h2 class="text-xl font-bold tracking-tight">Spectral Overlook</h2>
              <p class="text-xs text-muted-foreground">High-precision spectrogram visualization.</p>
            </div>
            <div class="flex items-center gap-2">
              <Button variant="secondary" size="sm" @click="showFullscreenSpectrum = true" class="h-8 w-8 p-0">
                <Maximize2 class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <SfSpectrumVisualization 
            :spectrumData="result.spectrum"
            :sampleRate="result.sample_rate"
            :duration="result.duration"
            :fileName="selectedFilePath.split(/[/\\]/).pop()"
            :isAnalyzingSpectrum="spectrumLoading"
            :spectrumProgress="spectrumProgress"
            @reAnalyze="reAnalyzeSpectrum"
          />
        </div>
      </div>

      <!-- Welcome State (No file selected) -->
      <div v-else class="flex flex-col items-center justify-center py-20 px-4 text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div class="relative group">
          <div class="absolute -inset-4 bg-primary/20 rounded-full blur-2xl group-hover:bg-primary/30 transition-all duration-500"></div>
          <div class="relative flex items-center justify-center h-40 w-40 rounded-full bg-muted border-4 border-background shadow-2xl">
            <Activity class="h-20 w-20 text-primary opacity-80" />
          </div>
        </div>
        
        <div class="max-w-xl space-y-4">
          <h2 class="text-4xl font-black tracking-tighter">QUALITY ASSURANCE</h2>
          <p class="text-lg text-muted-foreground">
            Drop your masters here to verify spectral resolution, calculate true peak, and ensure the master's integrity. Supporting FLAC, WAV, MP3, and more.
          </p>
          <div class="flex flex-wrap justify-center gap-3 pt-4">
             <div class="flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-xs font-mono font-bold">
               <span class="h-2 w-2 rounded-full bg-blue-500"></span> FFT ANALYSIS
             </div>
             <div class="flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-xs font-mono font-bold">
               <span class="h-2 w-2 rounded-full bg-emerald-500"></span> PEAK/RMS
             </div>
             <div class="flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-xs font-mono font-bold">
               <span class="h-2 w-2 rounded-full bg-purple-500"></span> UPSCALE DETECTION
             </div>
          </div>
        </div>

        <Button @click="pickFile" size="lg" class="px-10 h-14 text-lg font-bold rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-xl shadow-primary/30">
          SELECT SOURCE MASTER
        </Button>
      </div>
    </div>

    <!-- Fullscreen Spectrum Modal (Conceptual) -->
    <div v-if="showFullscreenSpectrum && result" class="fixed inset-0 z-[100] bg-black/95 flex flex-col p-4 animate-in fade-in duration-300">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-white">{{ selectedFilePath.split(/[/\\]/).pop() }} - SPECTROGRAM</h3>
        <Button variant="ghost" size="icon" @click="showFullscreenSpectrum = false" class="text-white hover:bg-white/10">
          <X class="h-6 w-6" />
        </Button>
      </div>
      <div class="flex-1 overflow-auto bg-black border border-white/10 rounded-xl relative">
        <SfSpectrumVisualization 
          class="min-h-full"
          :spectrumData="result.spectrum"
          :sampleRate="result.sample_rate"
          :duration="result.duration"
          :fileName="selectedFilePath.split(/[/\\]/).pop()"
          :isAnalyzingSpectrum="spectrumLoading"
          :spectrumProgress="spectrumProgress"
          @reAnalyze="reAnalyzeSpectrum"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.perspective-container {
  perspective: 1000px;
}
</style>
