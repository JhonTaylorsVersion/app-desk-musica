package com.appdeskmusica.mobile;

import android.content.Context;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioOutput")
public class AudioOutputPlugin extends Plugin {
    private AudioManager audioManager;
    private AudioDeviceCallback audioDeviceCallback;

    @Override
    public void load() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);

        if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        audioDeviceCallback = new AudioDeviceCallback() {
            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                notifyListeners("audioOutputChanged", buildCurrentOutput());
            }

            @Override
            public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                notifyListeners("audioOutputChanged", buildCurrentOutput());
            }
        };

        audioManager.registerAudioDeviceCallback(audioDeviceCallback, null);
    }

    @Override
    protected void handleOnDestroy() {
        if (audioManager != null && audioDeviceCallback != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            audioManager.unregisterAudioDeviceCallback(audioDeviceCallback);
        }

        audioDeviceCallback = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getCurrentOutput(PluginCall call) {
        call.resolve(buildCurrentOutput());
    }

    @NonNull
    private JSObject buildCurrentOutput() {
        JSObject result = new JSObject();
        AudioOutputDescriptor descriptor = resolveCurrentOutput();

        result.put("name", descriptor.name);
        result.put("type", descriptor.type);
        result.put("isExternal", descriptor.isExternal);

        return result;
    }

    @NonNull
    private AudioOutputDescriptor resolveCurrentOutput() {
        if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return new AudioOutputDescriptor("Altavoz del teléfono", "speaker", false);
        }

        AudioDeviceInfo[] outputs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
        AudioDeviceInfo bluetoothDevice = findFirstMatching(outputs,
                AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                AudioDeviceInfo.TYPE_BLE_HEADSET,
                AudioDeviceInfo.TYPE_BLE_SPEAKER,
                AudioDeviceInfo.TYPE_BLE_BROADCAST);

        if ((audioManager.isBluetoothA2dpOn() || audioManager.isBluetoothScoOn()) && bluetoothDevice != null) {
            return new AudioOutputDescriptor(readDeviceName(bluetoothDevice, "Bluetooth"), "bluetooth", true);
        }

        AudioDeviceInfo wiredDevice = findFirstMatching(outputs,
                AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
                AudioDeviceInfo.TYPE_WIRED_HEADSET,
                AudioDeviceInfo.TYPE_USB_HEADSET,
                AudioDeviceInfo.TYPE_USB_DEVICE,
                AudioDeviceInfo.TYPE_USB_ACCESSORY,
                AudioDeviceInfo.TYPE_LINE_ANALOG,
                AudioDeviceInfo.TYPE_LINE_DIGITAL);

        if (wiredDevice != null) {
            return new AudioOutputDescriptor(readDeviceName(wiredDevice, "Auriculares"), "wired", true);
        }

        AudioDeviceInfo speakerDevice = findFirstMatching(outputs, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
        if (speakerDevice != null) {
            return new AudioOutputDescriptor("Altavoz del teléfono", "speaker", false);
        }

        AudioDeviceInfo earpieceDevice = findFirstMatching(outputs, AudioDeviceInfo.TYPE_BUILTIN_EARPIECE);
        if (earpieceDevice != null) {
            return new AudioOutputDescriptor("Auricular del teléfono", "earpiece", false);
        }

        AudioDeviceInfo fallback = firstNamedOutput(outputs);
        if (fallback != null) {
            return new AudioOutputDescriptor(readDeviceName(fallback, "Este dispositivo"), "device", false);
        }

        return new AudioOutputDescriptor("Este dispositivo", "device", false);
    }

    private AudioDeviceInfo findFirstMatching(AudioDeviceInfo[] outputs, int... deviceTypes) {
        if (outputs == null) {
            return null;
        }

        for (int deviceType : deviceTypes) {
            for (AudioDeviceInfo deviceInfo : outputs) {
                if (deviceInfo.getType() == deviceType) {
                    return deviceInfo;
                }
            }
        }

        return null;
    }

    private AudioDeviceInfo firstNamedOutput(AudioDeviceInfo[] outputs) {
        if (outputs == null) {
            return null;
        }

        for (AudioDeviceInfo deviceInfo : outputs) {
            CharSequence productName = deviceInfo.getProductName();
            if (productName != null && productName.toString().trim().length() > 0) {
                return deviceInfo;
            }
        }

        return outputs.length > 0 ? outputs[0] : null;
    }

    @NonNull
    private String readDeviceName(AudioDeviceInfo deviceInfo, String fallback) {
        CharSequence productName = deviceInfo.getProductName();
        if (productName == null) {
            return fallback;
        }

        String name = productName.toString().trim();
        return name.isEmpty() ? fallback : name;
    }

    private static final class AudioOutputDescriptor {
        final String name;
        final String type;
        final boolean isExternal;

        AudioOutputDescriptor(String name, String type, boolean isExternal) {
            this.name = name;
            this.type = type;
            this.isExternal = isExternal;
        }
    }
}
