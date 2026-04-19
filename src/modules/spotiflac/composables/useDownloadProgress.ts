import { computed } from "vue";
import { useDownloadStore } from "../stores/useDownloadStore";

export interface DownloadProgressInfo {
    is_downloading: boolean;
    mb_downloaded: number;
    speed_mbps: number;
}

export function useDownloadProgress() {
    const store = useDownloadStore();

    const progress = computed<DownloadProgressInfo>(() => {
        const downloadingItems = store.queue.filter(item => item.status === 'downloading');
        const active = downloadingItems.length > 0;
        
        let totalSpeed = 0;
        let totalProgressMb = 0;

        for (const item of downloadingItems) {
            totalSpeed += item.speed || 0;
            totalProgressMb += item.progress || 0;
        }

        return {
            is_downloading: active,
            mb_downloaded: totalProgressMb,
            speed_mbps: totalSpeed,
        };
    });

    return progress;
}
