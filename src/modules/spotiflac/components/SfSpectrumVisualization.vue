<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import type { SpectrumData } from "../utils/flac-analysis";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  loadAudioAnalysisPreferences,
  saveAudioAnalysisPreferences,
  type AnalyzerColorScheme,
  type AnalyzerFreqScale,
  type AnalyzerWindowFunction,
} from "../utils/audio-analysis-preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  sampleRate: number;
  duration: number;
  spectrumData?: SpectrumData;
  fileName?: string;
  isAnalyzingSpectrum?: boolean;
  spectrumProgress?: {
    percent: number;
    message: string;
  };
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "reAnalyze", fftSize: number, windowFunction: string): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const preferences = loadAudioAnalysisPreferences();

const freqScale = ref<AnalyzerFreqScale>(preferences.freqScale);
const colorScheme = ref<AnalyzerColorScheme>(preferences.colorScheme);
const fftSize = ref<string>(String(preferences.fftSize));
const windowFunction = ref<AnalyzerWindowFunction>(preferences.windowFunction);

const MARGIN = { top: 50, right: 120, bottom: 70, left: 90 };
const CANVAS_W = 1100;
const CANVAS_H = 600;
const MAX_RENDER_HEIGHT = 1080;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function spekColorMap(t: number): [number, number, number] {
  const colors: Array<[number, number, number]> = [
    [0, 0, 0],
    [0, 0, 25],
    [0, 0, 50],
    [0, 0, 80],
    [20, 0, 120],
    [50, 0, 150],
    [80, 0, 180],
    [120, 0, 120],
    [150, 0, 80],
    [180, 0, 40],
    [210, 0, 0],
    [240, 30, 0],
    [255, 60, 0],
    [255, 100, 0],
    [255, 140, 0],
    [255, 180, 0],
    [255, 210, 0],
    [255, 235, 0],
    [255, 250, 50],
    [255, 255, 100],
    [255, 255, 150],
    [255, 255, 200],
    [255, 255, 255],
  ];
  const scaled = t * (colors.length - 1);
  const idx = Math.floor(scaled);
  const fraction = scaled - idx;
  if (idx >= colors.length - 1) return colors[colors.length - 1];
  const c1 = colors[idx];
  const c2 = colors[idx + 1];
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * fraction),
    Math.round(c1[1] + (c2[1] - c1[1]) * fraction),
    Math.round(c1[2] + (c2[2] - c1[2]) * fraction),
  ];
}

function viridisColorMap(t: number): [number, number, number] {
  const colors: Array<[number, number, number]> = [
    [68, 1, 84],
    [70, 20, 100],
    [72, 40, 120],
    [67, 62, 133],
    [62, 74, 137],
    [55, 89, 140],
    [49, 104, 142],
    [43, 117, 142],
    [38, 130, 142],
    [35, 144, 140],
    [31, 158, 137],
    [42, 171, 129],
    [53, 183, 121],
    [81, 194, 105],
    [109, 205, 89],
    [144, 214, 67],
    [180, 222, 44],
    [216, 227, 41],
    [253, 231, 37],
  ];
  const scaled = t * (colors.length - 1);
  const idx = Math.floor(scaled);
  const fraction = scaled - idx;
  if (idx >= colors.length - 1) return colors[colors.length - 1];
  const c1 = colors[idx];
  const c2 = colors[idx + 1];
  return [
    Math.floor(c1[0] + (c2[0] - c1[0]) * fraction),
    Math.floor(c1[1] + (c2[1] - c1[1]) * fraction),
    Math.floor(c1[2] + (c2[2] - c1[2]) * fraction),
  ];
}

function hotColorMap(t: number): [number, number, number] {
  if (t < 0.33) return [Math.floor(t * 3 * 255), 0, 0];
  if (t < 0.66) return [255, Math.floor((t - 0.33) * 3 * 255), 0];
  return [255, 255, Math.floor((t - 0.66) * 3 * 255)];
}

function coolColorMap(t: number): [number, number, number] {
  return [Math.floor(t * 255), Math.floor((1 - t) * 255), 255];
}

function getColorValues(
  norm: number,
  scheme: AnalyzerColorScheme,
): [number, number, number] {
  const value = clamp01(norm);
  switch (scheme) {
    case "spek":
      return spekColorMap(value);
    case "viridis":
      return viridisColorMap(value);
    case "hot":
      return hotColorMap(value);
    case "cool":
      return coolColorMap(value);
    case "grayscale":
    default: {
      const gray = Math.floor(value * 255);
      return [gray, gray, gray];
    }
  }
}

function getColorString(norm: number, scheme: AnalyzerColorScheme): string {
  const [r, g, b] = getColorValues(norm, scheme);
  return `rgb(${r},${g},${b})`;
}

function addAxisLabels(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  sampleRate: number,
  duration: number,
  freqScale: AnalyzerFreqScale,
  fileName?: string,
) {
  ctx.fillStyle = "#ffffff";
  ctx.font = "12px Segoe UI";
  ctx.textAlign = "center";
  const widthFactor = plotWidth / 1000;
  let timeStep: number;
  if (duration <= 10) timeStep = widthFactor >= 1.8 ? 0.25 : 0.5;
  else if (duration <= 30) timeStep = widthFactor >= 1.8 ? 0.5 : 1;
  else if (duration <= 120) timeStep = widthFactor >= 1.8 ? 3 : 5;
  else if (duration <= 600) timeStep = widthFactor >= 1.8 ? 10 : 20;
  else timeStep = widthFactor >= 1.8 ? 20 : 40;

  if (duration > 0) {
    for (let time = 0; time <= duration + 1e-9; time += timeStep) {
      const timeProgress = time / duration;
      const x = MARGIN.left + timeProgress * (plotWidth - 1);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, MARGIN.top + plotHeight);
      ctx.lineTo(x, MARGIN.top + plotHeight + 5);
      ctx.stroke();
      let label =
        timeStep >= 60
          ? `${Math.floor(time / 60)}m${time % 60 ? (time % 60) + "s" : ""}`
          : `${time}s`;
      ctx.fillText(label, x, CANVAS_H - MARGIN.bottom + 20);
    }
  }

  ctx.textAlign = "right";
  const maxFreq = sampleRate / 2;
  if (freqScale === "log2") {
    const minFreq = 20;
    for (let freq = minFreq; freq <= maxFreq; freq *= 2) {
      const freqNormalized =
        Math.log2(freq / minFreq) / Math.log2(maxFreq / minFreq);
      const y = MARGIN.top + plotHeight * (1 - freqNormalized);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left - 5, y);
      ctx.lineTo(MARGIN.left, y);
      ctx.stroke();
      ctx.fillText(
        freq >= 1000 ? `${(freq / 1000).toFixed(1)}k` : `${freq}`,
        MARGIN.left - 10,
        y + 4,
      );
    }
  } else {
    let freqStep = maxFreq <= 8000 ? 500 : maxFreq <= 16000 ? 1000 : 2000;
    for (let freq = 0; freq <= maxFreq; freq += freqStep) {
      const y = MARGIN.top + plotHeight - (freq / maxFreq) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(MARGIN.left - 5, y);
      ctx.lineTo(MARGIN.left, y);
      ctx.stroke();
      ctx.fillText(
        freq >= 1000 ? `${freq / 1000}k` : `${freq}`,
        MARGIN.left - 15,
        y + 4,
      );
    }
  }
  ctx.textAlign = "center";
  ctx.font = "14px Segoe UI";
  ctx.fillText("Time (seconds)", CANVAS_W / 2, CANVAS_H - 15);
  ctx.save();
  ctx.translate(25, CANVAS_H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Frequency (Hz)", 0, 0);
  ctx.restore();
  ctx.font = "12px Segoe UI";
  if (fileName) {
    ctx.textAlign = "left";
    ctx.fillText(fileName, MARGIN.left + 15, 25);
  }
  ctx.textAlign = "right";
  ctx.fillText(`Sample Rate: ${sampleRate} Hz`, CANVAS_W - 20, 25);
}

function drawColorBar(
  ctx: CanvasRenderingContext2D,
  plotHeight: number,
  scheme: AnalyzerColorScheme,
) {
  const colorBarWidth = 20;
  const colorBarX = CANVAS_W - MARGIN.right + 30;
  const colorBarY = MARGIN.top;
  const gradient = ctx.createLinearGradient(
    0,
    colorBarY + plotHeight,
    0,
    colorBarY,
  );
  for (let i = 0; i <= 100; i++)
    gradient.addColorStop(i / 100, getColorString(i / 100, scheme));
  ctx.fillStyle = gradient;
  ctx.fillRect(colorBarX, colorBarY, colorBarWidth, plotHeight);
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(colorBarX, colorBarY, colorBarWidth, plotHeight);
  ctx.fillStyle = "#ffffff";
  ctx.font = "10px Segoe UI";
  ctx.textAlign = "left";
  ctx.fillText("High", colorBarX + colorBarWidth + 5, colorBarY + 12);
  ctx.fillText(
    "Low",
    colorBarX + colorBarWidth + 5,
    colorBarY + plotHeight - 5,
  );
}

async function renderSpectrogram(
  ctx: CanvasRenderingContext2D,
  spectrum: SpectrumData,
  sampleRate: number,
  duration: number,
  scale: AnalyzerFreqScale,
  scheme: AnalyzerColorScheme,
  fileName: string | undefined,
  shouldCancel: () => boolean,
) {
  const plotWidth = CANVAS_W - MARGIN.left - MARGIN.right;
  const plotHeight = CANVAS_H - MARGIN.top - MARGIN.bottom;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const data = spectrum.time_slices;
  const numTime = data.length;
  const numFreq = data[0]?.magnitudes.length ?? 0;
  if (!numTime || !numFreq) return;
  let minMag = Infinity;
  let maxMag = -Infinity;
  for (let i = 0; i < numTime; i += Math.max(1, Math.floor(numTime / 5000))) {
    for (const m of data[i].magnitudes) {
      if (Number.isFinite(m)) {
        if (m < minMag) minMag = m;
        if (m > maxMag) maxMag = m;
      }
    }
  }
  if (!Number.isFinite(minMag)) {
    minMag = -120;
    maxMag = 0;
  }
  const range = maxMag - minMag || 1;
  const highResImageData = ctx.createImageData(plotWidth, MAX_RENDER_HEIGHT);
  const highResData = highResImageData.data;
  const CHUNK = 50;
  for (let xStart = 0; xStart < plotWidth; xStart += CHUNK) {
    if (shouldCancel()) return;
    for (let x = xStart; x < Math.min(xStart + CHUNK, plotWidth); x++) {
      const tPos = (x / (plotWidth - 1)) * (numTime - 1);
      const tIdx = Math.floor(tPos);
      const tIdx2 = Math.min(tIdx + 1, numTime - 1);
      const tFrac = tPos - tIdx;
      const f1 = data[tIdx].magnitudes;
      const f2 = data[tIdx2].magnitudes;
      for (let y = 0; y < MAX_RENDER_HEIGHT; y++) {
        let fProg = (MAX_RENDER_HEIGHT - 1 - y) / (MAX_RENDER_HEIGHT - 1);
        if (scale === "log2") {
          const minF = 20;
          const maxF = sampleRate / 2;
          fProg = (minF * Math.pow(2, fProg * Math.log2(maxF / minF))) / maxF;
        }
        const fPos = fProg * (numFreq - 1);
        const fIdx = Math.floor(fPos);
        const fIdx2 = Math.min(fIdx + 1, numFreq - 1);
        const fFrac = fPos - fIdx;
        const mag =
          (f1[fIdx] * (1 - fFrac) + f1[fIdx2] * fFrac) * (1 - tFrac) +
          (f2[fIdx] * (1 - fFrac) + f2[fIdx2] * fFrac) * tFrac;
        const [r, g, b] = getColorValues(
          clamp01((mag - minMag) / range),
          scheme,
        );
        const pIdx = (y * plotWidth + x) * 4;
        highResData[pIdx] = r;
        highResData[pIdx + 1] = g;
        highResData[pIdx + 2] = b;
        highResData[pIdx + 3] = 255;
      }
    }
    await new Promise((r) => setTimeout(r, 1));
  }
  if (shouldCancel()) return;
  const finalImage = ctx.createImageData(plotWidth, plotHeight);
  for (let y = 0; y < plotHeight; y++) {
    for (let x = 0; x < plotWidth; x++) {
      const hrIdx =
        (Math.round((y / plotHeight) * MAX_RENDER_HEIGHT) * plotWidth + x) * 4;
      const fIdx = (y * plotWidth + x) * 4;
      if (hrIdx < highResData.length) {
        finalImage.data[fIdx] = highResData[hrIdx];
        finalImage.data[fIdx + 1] = highResData[hrIdx + 1];
        finalImage.data[fIdx + 2] = highResData[hrIdx + 2];
        finalImage.data[fIdx + 3] = 255;
      }
    }
  }
  ctx.putImageData(finalImage, MARGIN.left, MARGIN.top);
  addAxisLabels(
    ctx,
    plotWidth,
    plotHeight,
    sampleRate,
    duration,
    scale,
    fileName,
  );
  drawColorBar(ctx, plotHeight, scheme);
}

let canceledFlag = false;
const shouldCancel = () => canceledFlag;

onMounted(() => {
  render();
});

watch([() => props.spectrumData, colorScheme, freqScale], () => {
  render();
});

async function render() {
  if (!canvasRef.value) return;
  const ctx = canvasRef.value.getContext("2d");
  if (!ctx) return;
  canceledFlag = true; // cancel previous
  await new Promise((r) => setTimeout(r, 10));
  canceledFlag = false;

  if (props.spectrumData) {
    canvasRef.value.width = CANVAS_W;
    canvasRef.value.height = CANVAS_H;
    await renderSpectrogram(
      ctx,
      props.spectrumData,
      props.sampleRate,
      props.duration,
      freqScale.value,
      colorScheme.value,
      props.fileName,
      shouldCancel,
    );
  } else {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#444444";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("No spectrum data", CANVAS_W / 2, CANVAS_H / 2);
  }
}

function handleReAnalyze(size: string, func: string) {
  fftSize.value = size;
  windowFunction.value = func as AnalyzerWindowFunction;
  emit("reAnalyze", parseInt(size, 10), func);
  saveAudioAnalysisPreferences({
    colorScheme: colorScheme.value,
    freqScale: freqScale.value,
    fftSize: parseInt(size, 10),
    windowFunction: windowFunction.value,
  });
}

watch([colorScheme, freqScale], () => {
  saveAudioAnalysisPreferences({
    colorScheme: colorScheme.value,
    freqScale: freqScale.value,
    fftSize: parseInt(fftSize.value, 10),
    windowFunction: windowFunction.value,
  });
});

defineExpose({
  getCanvasDataURL: () => canvasRef.value?.toDataURL("image/png"),
});

const COLOR_SCHEMES = [
  {
    value: "spek",
    label: "Spek",
    gradient: "linear-gradient(to right, #0f0040, #1e0080, #4000ff, #ffff00)",
  },
  {
    value: "viridis",
    label: "Viridis",
    gradient: "linear-gradient(to right, #440154, #fde725)",
  },
  {
    value: "hot",
    label: "Hot",
    gradient: "linear-gradient(to right, #000000, #ffffff)",
  },
  {
    value: "cool",
    label: "Cool",
    gradient: "linear-gradient(to right, #000080, #ffffff)",
  },
  {
    value: "grayscale",
    label: "Grayscale",
    gradient: "linear-gradient(to right, #000000, #ffffff)",
  },
];
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-4 p-1">
      <div class="flex items-center gap-2">
        <Label class="text-sm font-medium">Color:</Label>
        <Select v-model="colorScheme" :disabled="isAnalyzingSpectrum">
          <SelectTrigger class="h-8 w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="s in COLOR_SCHEMES"
              :key="s.value"
              :value="s.value"
            >
              <div class="flex items-center gap-2">
                <div
                  class="h-4 w-4 rounded-sm border"
                  :style="{ backgroundImage: s.gradient }"
                ></div>
                <span>{{ s.label }}</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2">
        <Label class="text-sm font-medium">Scale:</Label>
        <Select v-model="freqScale" :disabled="isAnalyzingSpectrum">
          <SelectTrigger class="h-8 w-[95px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="linear">Linear</SelectItem>
            <SelectItem value="log2">Log2</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2">
        <Label class="text-sm font-medium">FFT:</Label>
        <Select
          v-model="fftSize"
          @update:model-value="
            (v: string) => handleReAnalyze(v, windowFunction)
          "
          :disabled="isAnalyzingSpectrum"
        >
          <SelectTrigger class="h-8 w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1024">1024</SelectItem>
            <SelectItem value="2048">2048</SelectItem>
            <SelectItem value="4096">4096</SelectItem>
            <SelectItem value="8192">8192</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2">
        <Label class="text-sm font-medium">Window:</Label>
        <Select
          v-model="windowFunction"
          @update:model-value="(v: string) => handleReAnalyze(fftSize, v)"
          :disabled="isAnalyzingSpectrum"
        >
          <SelectTrigger class="h-8 w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hann">Hann</SelectItem>
            <SelectItem value="hamming">Hamming</SelectItem>
            <SelectItem value="blackman">Blackman</SelectItem>
            <SelectItem value="rectangular">Rectangular</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div
      class="relative border border-white/10 rounded-lg overflow-hidden bg-black shadow-xl aspect-[11/6]"
    >
      <div
        v-if="isAnalyzingSpectrum"
        class="absolute inset-0 z-10 grid place-items-center bg-black/60 backdrop-blur-sm"
      >
        <div class="w-full max-w-xs space-y-2 px-4 text-center">
          <div
            class="flex items-center justify-between text-sm text-foreground/90 mb-1"
          >
            <span>{{ spectrumProgress?.message || "Processing..." }}</span>
            <span class="tabular-nums font-mono"
              >{{ Math.round(spectrumProgress?.percent || 0) }}%</span
            >
          </div>
          <Progress :value="spectrumProgress?.percent" class="h-1.5 w-full" />
        </div>
      </div>
      <canvas ref="canvasRef" class="w-full h-full object-contain" />
    </div>
  </div>
</template>
