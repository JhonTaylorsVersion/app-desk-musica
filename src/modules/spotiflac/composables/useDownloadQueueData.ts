import { computed } from "vue";
import { useDownloadStore } from "../stores/useDownloadStore";

export function useDownloadQueueData() {
    const store = useDownloadStore();

    const queueInfo = computed(() => {
        let queued_count = 0;
        let completed_count = 0;
        let failed_count = 0;
        let skipped_count = 0;
        let total_downloaded = 0;
        let current_speed = 0;

        for (const item of store.queue) {
            if (item.status === 'queued') queued_count++;
            if (item.status === 'completed') completed_count++;
            if (item.status === 'failed') failed_count++;
            if (item.status === 'skipped') skipped_count++;
            if (item.status === 'downloading') {
                current_speed += item.speed || 0;
            }
            total_downloaded += item.progress || 0;
        }

        return {
            is_downloading: store.queue.some(i => i.status === 'downloading'),
            queue: store.queue,
            current_speed,
            total_downloaded,
            session_start_time: 0,
            queued_count,
            completed_count,
            failed_count,
            skipped_count,
        };
    });

    return queueInfo;
}
