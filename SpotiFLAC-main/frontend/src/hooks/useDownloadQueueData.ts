import { useEffect, useRef, useState } from "react";
import { GetDownloadQueue } from "../../wailsjs/go/main/App";
import { backend } from "../../wailsjs/go/models";
interface UseDownloadQueueDataOptions {
    enabled?: boolean;
    intervalMs?: number;
}
export function useDownloadQueueData(options?: UseDownloadQueueDataOptions) {
    const enabled = options?.enabled ?? true;
    const intervalMs = options?.intervalMs ?? 1000;
    const [queueInfo, setQueueInfo] = useState<backend.DownloadQueueInfo>(new backend.DownloadQueueInfo({
        is_downloading: false,
        queue: [],
        current_speed: 0,
        total_downloaded: 0,
        session_start_time: 0,
        queued_count: 0,
        completed_count: 0,
        failed_count: 0,
        skipped_count: 0,
    }));
    const requestInFlightRef = useRef(false);
    useEffect(() => {
        if (!enabled) {
            return;
        }
        const fetchQueue = async () => {
            if (requestInFlightRef.current) {
                return;
            }
            requestInFlightRef.current = true;
            try {
                const info = await GetDownloadQueue();
                setQueueInfo((previous) => JSON.stringify(previous) === JSON.stringify(info)
                    ? previous
                    : info);
            }
            catch (error) {
                console.error("Failed to get download queue:", error);
            }
            finally {
                requestInFlightRef.current = false;
            }
        };
        fetchQueue();
        const interval = setInterval(fetchQueue, intervalMs);
        return () => clearInterval(interval);
    }, [enabled, intervalMs]);
    return queueInfo;
}
