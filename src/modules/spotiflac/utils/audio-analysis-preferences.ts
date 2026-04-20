export type AnalyzerColorScheme = "spek" | "viridis" | "hot" | "cool" | "grayscale";
export type AnalyzerFreqScale = "linear" | "log2";
export type AnalyzerWindowFunction = "hann" | "hamming" | "blackman" | "rectangular";

export interface AudioAnalysisPreferences {
    colorScheme: AnalyzerColorScheme;
    freqScale: AnalyzerFreqScale;
    fftSize: number;
    windowFunction: AnalyzerWindowFunction;
}

const STORAGE_KEY = "spotiflac_audio_analysis_prefs_v2";

const DEFAULT_PREFS: AudioAnalysisPreferences = {
    colorScheme: "spek",
    freqScale: "linear",
    fftSize: 4096,
    windowFunction: "hann",
};

export function loadAudioAnalysisPreferences(): AudioAnalysisPreferences {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return { ...DEFAULT_PREFS, ...JSON.parse(saved) };
        }
    } catch (err) {
        // console.error("Failed to load audio analysis preferences:", err);
    }
    return DEFAULT_PREFS;
}

export function saveAudioAnalysisPreferences(prefs: AudioAnalysisPreferences): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (err) {
        // console.error("Failed to save audio analysis preferences:", err);
    }
}
