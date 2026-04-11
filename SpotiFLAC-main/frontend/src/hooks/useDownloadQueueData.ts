import { useEffect, useRef, useState } from "react";
import { GetDownloadQueue } from "../../wailsjs/go/main/App";
import { backend } from "../../wailsjs/go/models";
const DOWNLOAD_QUEUE_KEY = "spotiflac-download-queue";
const DOWNLOAD_PROGRESS_KEY = "spotiflac-download-progress";
interface UseDownloadQueueDataOptions {
    enabled?: boolean;
    intervalMs?: number;
}
function getFallbackQueueInfo() {
    try {
        const runtimeState = (window as any).__spotiflacRuntimeState;
        const queue = Array.isArray(runtimeState?.queue)
            ? runtimeState.queue
            : JSON.parse(localStorage.getItem(DOWNLOAD_QUEUE_KEY) || "[]");
        const progress = runtimeState?.progress || JSON.parse(localStorage.getItem(DOWNLOAD_PROGRESS_KEY) || "{}");
        return new backend.DownloadQueueInfo({
            queue: Array.isArray(queue) ? queue : [],
            queued_count: Array.isArray(queue) ? queue.filter((item: any) => item.status === "queued").length : 0,
            completed_count: Array.isArray(queue) ? queue.filter((item: any) => item.status === "completed").length : 0,
            failed_count: Array.isArray(queue) ? queue.filter((item: any) => item.status === "failed").length : 0,
            skipped_count: Array.isArray(queue) ? queue.filter((item: any) => item.status === "skipped").length : 0,
            total_downloaded: Number(progress?.mb_downloaded || 0),
            current_speed: Number(progress?.speed_mbps || 0),
            session_start_time: Number(progress?.session_start_time || 0),
            is_downloading: Boolean(progress?.is_downloading),
        });
    }
    catch {
        return null;
    }
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
                const fallback = getFallbackQueueInfo();
                const finalInfo = info.queue.length === 0 && fallback ? fallback : info;
                setQueueInfo((previous) => JSON.stringify(previous) === JSON.stringify(finalInfo)
                    ? previous
                    : finalInfo);
            }
            catch (error) {
                const fallback = getFallbackQueueInfo();
                if (fallback) {
                    setQueueInfo((previous) => JSON.stringify(previous) === JSON.stringify(fallback)
                        ? previous
                        : fallback);
                }
                else {
                    console.error("Failed to get download queue:", error);
                }
            }
            finally {
                requestInFlightRef.current = false;
            }
        };
        fetchQueue();
        const handleStateChanged = () => {
            void fetchQueue();
        };
        window.addEventListener("spotiflac-download-state-changed", handleStateChanged);
        const interval = setInterval(fetchQueue, intervalMs);
        return () => {
            window.removeEventListener("spotiflac-download-state-changed", handleStateChanged);
            clearInterval(interval);
        };
    }, [enabled, intervalMs]);
    return queueInfo;
}
