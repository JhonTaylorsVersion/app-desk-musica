import { toast } from "vue-sonner";
import { warmUpAudio, playSuccessSound, playErrorSound, playWarningSound, playInfoSound, } from "./audio";
import { logger } from "./logger";
import { getSettings } from "./settings";
const toastStyle = {
    class: "font-mono lowercase",
};
type ToastData = Parameters<typeof toast.success>[1];

// Helper to check settings safely
const isSfxEnabled = () => {
    try {
        return getSettings().sfxEnabled;
    } catch {
        return true; // Default to true if settings aren't ready
    }
};

export const toastWithSound = {
    warmUp: () => {
        warmUpAudio();
    },
    success: (message: string, data?: ToastData) => {
        const msg = message.toLowerCase();
        logger.success(msg);
        if (isSfxEnabled())
            playSuccessSound();
        return toast.success(msg, { ...toastStyle, ...data });
    },
    error: (message: string, data?: ToastData) => {
        const msg = message.toLowerCase();
        logger.error(msg);
        if (isSfxEnabled())
            playErrorSound();
        return toast.error(msg, { ...toastStyle, ...data });
    },
    warning: (message: string, data?: ToastData) => {
        const msg = message.toLowerCase();
        logger.warning(msg);
        if (isSfxEnabled())
            playWarningSound();
        return toast.warning(msg, { ...toastStyle, ...data });
    },
    info: (message: string, data?: ToastData) => {
        const msg = message.toLowerCase();
        logger.info(msg);
        if (isSfxEnabled())
            playInfoSound();
        return toast.info(msg, { ...toastStyle, ...data });
    },
    message: (message: string, data?: ToastData) => {
        const msg = message.toLowerCase();
        logger.info(msg);
        if (isSfxEnabled())
            playInfoSound();
        return toast(msg, { ...toastStyle, ...data });
    },
    silentInfo: (message: string, data?: ToastData) => {
        const msg = message.toLowerCase();
        logger.info(msg);
        return toast.info(msg, { ...toastStyle, ...data });
    },
    dismiss: (id?: string | number) => toast.dismiss(id),
    toast: toast,
};
