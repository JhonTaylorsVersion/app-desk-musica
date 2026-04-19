import { onMounted, ref } from "vue";
import {
  DEFAULT_SETTINGS,
  applyFont,
  applyTheme,
  applyThemeMode,
  loadSettings as loadSettingsUtil,
  resetToDefaultSettings,
  saveSettings as saveSettingsUtil,
  type Settings,
  type FontFamily,
  type FolderPreset,
  type FilenamePreset,
} from "../utils/settings";

export type { Settings, FontFamily, FolderPreset, FilenamePreset };
export { DEFAULT_SETTINGS };

const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
const initialized = ref(false);

export function useSettings() {
  const load = async () => {
    try {
      settings.value = await loadSettingsUtil();
      applyThemeMode(settings.value.themeMode);
      applyTheme(settings.value.theme);
      applyFont(settings.value.fontFamily);
    } catch (error) {
      console.error("Failed to load settings:", error);
      settings.value = { ...DEFAULT_SETTINGS };
    } finally {
      initialized.value = true;
    }
  };

  const save = async (newSettings?: Settings) => {
    if (newSettings) {
      settings.value = { ...newSettings };
    }
    await saveSettingsUtil(settings.value);
    applyThemeMode(settings.value.themeMode);
    applyTheme(settings.value.theme);
    applyFont(settings.value.fontFamily);
  };

  const reset = async () => {
    settings.value = await resetToDefaultSettings();
    applyThemeMode(settings.value.themeMode);
    applyTheme(settings.value.theme);
    applyFont(settings.value.fontFamily);
  };

  onMounted(() => {
    if (!initialized.value) {
      void load();
    }
  });

  return {
    settings,
    initialized,
    loadSettings: load,
    save,
    reset,
    applyTheme,
    applyThemeMode,
    applyFont,
  };
}
