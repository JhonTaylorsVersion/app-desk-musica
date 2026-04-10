import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

export type AudioOutputInfo = {
  name: string;
  type: string;
  isExternal: boolean;
};

type AudioOutputChangedListener = (output: AudioOutputInfo) => void;

type AudioOutputPlugin = {
  getCurrentOutput(): Promise<AudioOutputInfo>;
  setVolumeButtonMode(options: { remote: boolean }): Promise<void>;
  addListener(
    eventName: "audioOutputChanged",
    listenerFunc: AudioOutputChangedListener,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
};

export const AudioOutput = registerPlugin<AudioOutputPlugin>("AudioOutput");

const bluetoothDevicePattern =
  /buds|airpods|headphones|headset|bluetooth|earbuds|speaker|parlante/i;

export const getDefaultAudioOutput = () => {
  if (typeof navigator === "undefined") {
    return {
      name: "Este dispositivo",
      type: "device",
      isExternal: false,
    } satisfies AudioOutputInfo;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const isAndroid = userAgent.includes("android");
  const isAppleMobile = /iphone|ipad|ipod/.test(userAgent);

  return {
    name: isAndroid
      ? "Altavoz del teléfono"
      : isAppleMobile
        ? "Salida del iPhone"
        : "Este dispositivo",
    type: isAndroid ? "speaker" : "device",
    isExternal: false,
  } satisfies AudioOutputInfo;
};

const pickConnectedOutputName = (
  devices: Array<{ kind: string; label: string }>,
) => {
  const normalized = devices
    .map((device) => ({
      kind: device.kind,
      label: device.label?.trim() ?? "",
    }))
    .filter((device) => device.label.length > 0);

  const preferred = normalized.find((device) =>
    bluetoothDevicePattern.test(device.label),
  );

  if (preferred) return preferred.label;

  const output = normalized.find((device) => device.kind === "audiooutput");
  if (output) return output.label;

  const input = normalized.find((device) => device.kind === "audioinput");
  return input?.label ?? null;
};

export const getWebAudioOutput = async () => {
  if (
    typeof navigator === "undefined" ||
    !("mediaDevices" in navigator) ||
    typeof navigator.mediaDevices.enumerateDevices !== "function"
  ) {
    return getDefaultAudioOutput();
  }

  try {
    const name = pickConnectedOutputName(
      await navigator.mediaDevices.enumerateDevices(),
    );

    return name
      ? {
          name,
          type: "external",
          isExternal: true,
        }
      : getDefaultAudioOutput();
  } catch {
    return getDefaultAudioOutput();
  }
};

export const getCurrentAudioOutput = async () => {
  if (Capacitor.getPlatform() === "android") {
    try {
      return await AudioOutput.getCurrentOutput();
    } catch {
      return getWebAudioOutput();
    }
  }

  return getWebAudioOutput();
};
