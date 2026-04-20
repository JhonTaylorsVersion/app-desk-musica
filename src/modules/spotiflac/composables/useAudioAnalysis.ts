import { ref, watch, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { 
  AnalysisResult, 
  AnalysisProgress, 
  FrontendAnalysisPayload, 
  AudioArrayBufferInput,
  SpectrumParams,
} from '../utils/flac-analysis';
import { 
  analyzeAudioArrayBuffer, 
  analyzeAudioFile, 
  analyzeDecodedSamples, 
  analyzeSpectrumFromSamples, 
  parseAudioMetadataFromInput, 
  pcm16MonoArrayBufferToFloat32Samples 
} from '../utils/flac-analysis';
import { loadAudioAnalysisPreferences } from '../utils/audio-analysis-preferences';
import { toastWithSound as toast } from '../utils/toast-with-sound';

// Replicating React's module-level persistence
const sessionResult = ref<AnalysisResult | null>(null);
const sessionSelectedFilePath = ref("");
const sessionError = ref<string | null>(null);
const sessionSamples = ref<Float32Array | null>(null);
const sessionCurrentAnalysisKey = ref("");
const sessionSamplesByKey = new Map<string, Float32Array>();

interface BackendAnalysisDecodeResponse {
  pcm_base64: string;
  sample_rate: number;
  channels: number;
  bits_per_sample: number;
  duration: number;
  bitrate_kbps?: number;
  bit_depth?: string;
}

async function base64ToArrayBuffer(base64: string, shouldCancel?: () => boolean): Promise<ArrayBuffer> {
  const clean = base64.includes(",") ? base64.split(",")[1] : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    if (shouldCancel?.()) throw new Error("Analysis cancelled");
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function useAudioAnalysis() {
  const analyzing = ref(false);
  const analysisProgress = ref({ percent: 0, message: "Preparing analysis..." });
  const spectrumLoading = ref(false);
  const spectrumProgress = ref({ percent: 0, message: "Preparing analysis..." });
  
  const currentToken = ref<{ cancelled: boolean } | null>(null);

  const createToken = () => {
    if (currentToken.value) currentToken.value.cancelled = true;
    currentToken.value = { cancelled: false };
    return currentToken.value;
  };

  const cancelAnalysis = () => {
    if (currentToken.value) currentToken.value.cancelled = true;
    analyzing.value = false;
    spectrumLoading.value = false;
  };

  onUnmounted(() => {
    cancelAnalysis();
  });

  const analyzeFilePath = async (filePath: string) => {
    if (!filePath) return;
    const token = createToken();
    analyzing.value = true;
    analysisProgress.value = { percent: 1, message: "Reading file from disk..." };
    sessionError.value = null;
    sessionResult.value = null;
    sessionSelectedFilePath.value = filePath;
    sessionCurrentAnalysisKey.value = filePath;

    try {
      const prefs = loadAudioAnalysisPreferences();
      analysisProgress.value = { percent: 5, message: "Reading file bytes..." };
      
      // We'll try to read as base64 first as in original
      let base64Data: string = await invoke('read_file_as_base64', { path: filePath });
      if (token.cancelled) return;
      
      const arrayBuffer = await base64ToArrayBuffer(base64Data, () => token.cancelled);
      base64Data = ""; // Clear memory

      const input: AudioArrayBufferInput = {
        fileName: filePath.split(/[/\\]/).pop() || filePath,
        fileSize: arrayBuffer.byteLength,
        arrayBuffer
      };

      const updateProgress = (p: AnalysisProgress) => {
        if (token.cancelled) return;
        analysisProgress.value = { percent: Math.round(p.percent), message: p.message };
      };

      let payload: FrontendAnalysisPayload;
      try {
        payload = await analyzeAudioArrayBuffer(input, {
          fftSize: prefs.fftSize,
          windowFunction: prefs.windowFunction
        }, updateProgress, () => token.cancelled);
      } catch (err: any) {
        // Fallback to FFmpeg decode if browser decoder fails (e.g. for high bit depth FLAC)
        // console.warn("Browser decoder failed, trying FFmpeg fallback:", err);
        analysisProgress.value = { percent: 20, message: "Using FFmpeg fallback..." };
        
        const decoded: BackendAnalysisDecodeResponse = await invoke('decode_audio_for_analysis', { path: filePath });
        if (token.cancelled) return;

        const pcmBuffer = await base64ToArrayBuffer(decoded.pcm_base64, () => token.cancelled);
        const samples = pcm16MonoArrayBufferToFloat32Samples(pcmBuffer);
        
        const metadata = parseAudioMetadataFromInput(input);
        // Merge backend metadata if it's more accurate
        if (decoded.sample_rate > 0) metadata.sampleRate = decoded.sample_rate;
        if (decoded.duration > 0) metadata.duration = decoded.duration;
        
        payload = await analyzeDecodedSamples(input, metadata, samples, {
          fftSize: prefs.fftSize,
          windowFunction: prefs.windowFunction
        }, updateProgress, () => token.cancelled, decoded.duration);
      }

      if (token.cancelled) return;

      sessionSamplesByKey.set(filePath, payload.samples);
      sessionSamples.value = payload.samples;
      sessionResult.value = payload.result;
      toast.success("Analysis complete");

    } catch (err: any) {
      if (err.message === "Analysis cancelled") return;
      // console.error("Analysis failed:", err);
      sessionError.value = err.message || "Failed to analyze file";
      toast.error("Analysis Failed", { description: sessionError.value || "" });
    } finally {
      if (!token.cancelled) analyzing.value = false;
    }
  };

  const reAnalyzeSpectrum = async (fftSize: number, windowFunction: string) => {
    if (!sessionResult.value || !sessionSamples.value) return;
    const token = createToken();
    spectrumLoading.value = true;
    spectrumProgress.value = { percent: 0, message: "Preparing FFT..." };

    try {
      const spectrum = await analyzeSpectrumFromSamples(sessionSamples.value, sessionResult.value.sample_rate, {
        fftSize,
        windowFunction: windowFunction as any
      }, (p) => {
        if (token.cancelled) return;
        spectrumProgress.value = { percent: Math.round(p.percent), message: p.message };
      }, () => token.cancelled);

      if (token.cancelled) return;

      sessionResult.value = {
        ...sessionResult.value,
        spectrum
      };
      toast.success("Spectrum updated");
    } catch (err: any) {
      if (err.message === "Analysis cancelled") return;
      // console.error("Spectrum re-analysis failed:", err);
      toast.error("Spectrum update failed");
    } finally {
      if (!token.cancelled) spectrumLoading.value = false;
    }
  };

  const clearResult = () => {
    cancelAnalysis();
    sessionResult.value = null;
    sessionError.value = null;
    sessionSelectedFilePath.value = "";
    sessionSamples.value = null;
    sessionCurrentAnalysisKey.value = "";
  };

  return {
    analyzing,
    analysisProgress,
    result: sessionResult,
    error: sessionError,
    selectedFilePath: sessionSelectedFilePath,
    spectrumLoading,
    spectrumProgress,
    analyzeFilePath,
    reAnalyzeSpectrum,
    cancelAnalysis,
    clearResult
  };
}
