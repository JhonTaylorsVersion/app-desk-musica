import { useState, useEffect, useRef } from "react";
import { GetDownloadProgress } from "../../wailsjs/go/main/App";
export interface DownloadProgressInfo {
    is_downloading: boolean;
    mb_downloaded: number;
    speed_mbps: number;
}
interface UseDownloadProgressOptions {
    enabled?: boolean;
    intervalMs?: number;
}
export function useDownloadProgress(options?: UseDownloadProgressOptions) {
    const enabled = options?.enabled ?? true;
    const intervalMs = options?.intervalMs ?? 750;
    const [progress, setProgress] = useState<DownloadProgressInfo>({
        is_downloading: false,
        mb_downloaded: 0,
        speed_mbps: 0,
    });
    const intervalRef = useRef<number | null>(null);
    const requestInFlightRef = useRef(false);
    useEffect(() => {
        if (!enabled) {
            setProgress({
                is_downloading: false,
                mb_downloaded: 0,
                speed_mbps: 0,
            });
            return;
        }
        const pollProgress = async () => {
            if (requestInFlightRef.current) {
                return;
            }
            requestInFlightRef.current = true;
            try {
                const progressInfo = await GetDownloadProgress();
                setProgress((previous) => previous.is_downloading === progressInfo.is_downloading &&
                    previous.mb_downloaded === progressInfo.mb_downloaded &&
                    previous.speed_mbps === progressInfo.speed_mbps
                    ? previous
                    : progressInfo);
            }
            catch (error) {
                console.error("Failed to get download progress:", error);
            }
            finally {
                requestInFlightRef.current = false;
            }
        };
        intervalRef.current = window.setInterval(pollProgress, intervalMs);
        pollProgress();
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [enabled, intervalMs]);
    return progress;
}
