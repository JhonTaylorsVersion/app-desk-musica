import { useEffect, useRef, useState } from "react";
import { X, Download, CheckCircle2, XCircle, Clock, FileCheck, Trash2, HardDrive, Zap, Timer, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { GetDownloadQueue, ClearCompletedDownloads, ClearAllDownloads, ExportFailedDownloads } from "../../wailsjs/go/main/App";
import { toastWithSound as toast } from "@/lib/toast-with-sound";
import { backend } from "../../wailsjs/go/models";
import type { UiDownloadQueueItem } from "@/hooks/useDownload";
const DOWNLOAD_QUEUE_KEY = "spotiflac-download-queue";
const DOWNLOAD_PROGRESS_KEY = "spotiflac-download-progress";
interface DownloadQueueProps {
    isOpen: boolean;
    onClose: () => void;
    fallbackQueueItems?: UiDownloadQueueItem[];
    fallbackDownloadedMB?: number;
    fallbackSpeedMbps?: number;
    fallbackSessionStartTime?: number;
    fallbackIsDownloading?: boolean;
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
export function DownloadQueue({
    isOpen,
    onClose,
    fallbackQueueItems = [],
    fallbackDownloadedMB = 0,
    fallbackSpeedMbps = 0,
    fallbackSessionStartTime = 0,
    fallbackIsDownloading = false,
}: DownloadQueueProps) {
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
        if (!isOpen)
            return;
        const fetchQueue = async () => {
            if (requestInFlightRef.current) {
                return;
            }
            requestInFlightRef.current = true;
            try {
                const info = await GetDownloadQueue();
                const fallback = getFallbackQueueInfo();
                setQueueInfo(info.queue.length === 0 && fallback ? fallback : info);
            }
            catch (error) {
                const fallback = getFallbackQueueInfo();
                if (fallback) {
                    setQueueInfo(fallback);
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
        const interval = setInterval(fetchQueue, 1000);
        return () => {
            window.removeEventListener("spotiflac-download-state-changed", handleStateChanged);
            clearInterval(interval);
        };
    }, [isOpen]);
    const handleClearHistory = async () => {
        try {
            await ClearCompletedDownloads();
            const info = await GetDownloadQueue();
            setQueueInfo(info);
        }
        catch (error) {
            console.error("Failed to clear history:", error);
        }
    };
    const handleReset = async () => {
        try {
            await ClearAllDownloads();
            const info = await GetDownloadQueue();
            setQueueInfo(info);
            toast.success("Download queue reset");
        }
        catch (error) {
            console.error("Failed to reset queue:", error);
        }
    };
    const handleExportFailed = async () => {
        try {
            const message = await ExportFailedDownloads();
            if (message.startsWith("Successfully")) {
                toast.success(message);
            }
            else if (message !== "Export cancelled") {
                toast.info(message);
            }
        }
        catch (error) {
            console.error("Failed to export:", error);
            toast.error(`Failed to export: ${error}`);
        }
    };
    const getStatusIcon = (status: string) => {
        switch (status) {
            case "downloading":
                return <Download className="h-4 w-4 text-blue-500 animate-bounce"/>;
            case "completed":
                return <CheckCircle2 className="h-4 w-4 text-green-500"/>;
            case "failed":
                return <XCircle className="h-4 w-4 text-red-500"/>;
            case "skipped":
                return <FileCheck className="h-4 w-4 text-yellow-500"/>;
            case "queued":
                return <Clock className="h-4 w-4 text-muted-foreground"/>;
            default:
                return null;
        }
    };
    const getStatusBadge = (status: string) => {
        const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
            downloading: "default",
            completed: "outline",
            failed: "destructive",
            skipped: "secondary",
            queued: "outline",
        };
        return (<Badge variant={variants[status] || "outline"} className="text-xs">
      {status}
    </Badge>);
    };
    const formatDuration = (startTimestamp: number) => {
        if (startTimestamp === 0)
            return "—";
        const now = Math.floor(Date.now() / 1000);
        const durationSeconds = now - startTimestamp;
        const hours = Math.floor(durationSeconds / 3600);
        const minutes = Math.floor((durationSeconds % 3600) / 60);
        const seconds = durationSeconds % 60;
        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        }
        else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        else {
            return `${seconds}s`;
        }
    };
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const toggleFilter = (status: string) => {
        setFilterStatus(prev => prev === status ? "all" : status);
    };
    const shouldPreferFallbackState = fallbackQueueItems.length > 0 || fallbackIsDownloading;
    const effectiveQueue = shouldPreferFallbackState ? fallbackQueueItems : queueInfo.queue;
    const effectiveQueuedCount = shouldPreferFallbackState ? effectiveQueue.filter((item: any) => item.status === "queued").length : queueInfo.queued_count;
    const effectiveCompletedCount = shouldPreferFallbackState ? effectiveQueue.filter((item: any) => item.status === "completed").length : queueInfo.completed_count;
    const effectiveFailedCount = shouldPreferFallbackState ? effectiveQueue.filter((item: any) => item.status === "failed").length : queueInfo.failed_count;
    const effectiveSkippedCount = shouldPreferFallbackState ? effectiveQueue.filter((item: any) => item.status === "skipped").length : queueInfo.skipped_count;
    const effectiveDownloadedMB = shouldPreferFallbackState ? fallbackDownloadedMB : queueInfo.total_downloaded;
    const effectiveCurrentSpeed = shouldPreferFallbackState ? fallbackSpeedMbps : queueInfo.current_speed;
    const effectiveSessionStartTime = shouldPreferFallbackState ? fallbackSessionStartTime : queueInfo.session_start_time;
    const effectiveIsDownloading = shouldPreferFallbackState ? fallbackIsDownloading : queueInfo.is_downloading;
    const filteredQueue = effectiveQueue.filter((item: any) => {
        if (filterStatus === "all")
            return true;
        return item.status === filterStatus;
    });
    return (<Dialog open={isOpen} onOpenChange={onClose}>
    <DialogContent className="max-w-[1200px] w-[95vw] max-h-[80vh] flex flex-col p-0 gap-0 [&>button]:hidden">
      <DialogHeader className="px-6 pt-6 pb-4 border-b space-y-0">
        <div className="flex items-center justify-between mb-4">
          <DialogTitle className="text-lg font-semibold hover:text-primary transition-colors cursor-pointer" onClick={handleReset}>Download Queue</DialogTitle>
          <div className="flex items-center gap-2">
            {(effectiveCompletedCount > 0 || effectiveFailedCount > 0 || effectiveSkippedCount > 0) && (<Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={handleClearHistory}>
              <Trash2 className="h-3 w-3"/>
              Clear History
            </Button>)}
            {effectiveFailedCount > 0 && (<Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={handleExportFailed}>
              <FileDown className="h-3 w-3"/>
              Export Failures
            </Button>)}
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted" onClick={onClose}>
              <X className="h-4 w-4"/>
            </Button>
          </div>
        </div>


        <div className="flex items-center gap-4 text-sm">
          <div className={`flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-all select-none ${filterStatus === 'queued' ? 'bg-secondary px-2 py-0.5 rounded-md ring-1 ring-border' : ''}`} onClick={() => toggleFilter('queued')}>
            <Clock className="h-3.5 w-3.5 text-muted-foreground"/>
            <span className="text-muted-foreground">Queued:</span>
            <span className="font-semibold">{effectiveQueuedCount}</span>
          </div>
          <div className={`flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-all select-none ${filterStatus === 'completed' ? 'bg-green-500/10 px-2 py-0.5 rounded-md ring-1 ring-green-500/20' : ''}`} onClick={() => toggleFilter('completed')}>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500"/>
            <span className="text-muted-foreground">Completed:</span>
            <span className="font-semibold">{effectiveCompletedCount}</span>
          </div>
          <div className={`flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-all select-none ${filterStatus === 'skipped' ? 'bg-yellow-500/10 px-2 py-0.5 rounded-md ring-1 ring-yellow-500/20' : ''}`} onClick={() => toggleFilter('skipped')}>
            <FileCheck className="h-3.5 w-3.5 text-yellow-500"/>
            <span className="text-muted-foreground">Skipped:</span>
            <span className="font-semibold">{effectiveSkippedCount}</span>
          </div>
          <div className={`flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-all select-none ${filterStatus === 'failed' ? 'bg-red-500/10 px-2 py-0.5 rounded-md ring-1 ring-red-500/20' : ''}`} onClick={() => toggleFilter('failed')}>
            <XCircle className="h-3.5 w-3.5 text-red-500"/>
            <span className="text-muted-foreground">Failed:</span>
            <span className="font-semibold">{effectiveFailedCount}</span>
          </div>
        </div>


        <div className="flex items-center gap-4 text-sm pt-3 mt-3 border-t">
          <div className="flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-muted-foreground"/>
            <span className="text-muted-foreground">Downloaded:</span>
            <span className="font-semibold font-mono">
              {effectiveDownloadedMB > 0 ? `${effectiveDownloadedMB.toFixed(2)} MB` : "0.00 MB"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground"/>
            <span className="text-muted-foreground">Speed:</span>
            <span className="font-semibold font-mono">
              {effectiveCurrentSpeed > 0 && effectiveIsDownloading
            ? `${effectiveCurrentSpeed.toFixed(2)} MB/s`
            : "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5 text-muted-foreground"/>
            <span className="text-muted-foreground">Duration:</span>
            <span className="font-semibold font-mono">
              {effectiveSessionStartTime > 0 ? formatDuration(effectiveSessionStartTime) : "—"}
            </span>
          </div>
        </div>

      </DialogHeader>


      <div className="flex-1 overflow-y-auto px-6 custom-scrollbar">
        <div className="space-y-2 py-4">
          {effectiveQueue.length === 0 ? (<div className="text-center py-12 text-muted-foreground">
            <Download className="h-12 w-12 mx-auto mb-3 opacity-20"/>
            <p>No downloads in queue</p>
          </div>) : filteredQueue.length === 0 ? (<div className="text-center py-12 text-muted-foreground">
             <p>No downloads with status "{filterStatus}"</p>
             <Button variant="link" onClick={() => setFilterStatus("all")}>Clear filter</Button>
            </div>) : (filteredQueue.map((item: any) => (<div key={item.id} className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="mt-1">{getStatusIcon(item.status)}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.track_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {item.artist_name}
                      {item.album_name && ` • ${item.album_name}`}
                    </p>
                  </div>
                  {getStatusBadge(item.status)}
                </div>


                {item.status === "downloading" && (<div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground font-mono">
                  <span>
                    {item.progress > 0
                    ? `${item.progress.toFixed(2)} MB`
                    : effectiveIsDownloading && effectiveCurrentSpeed > 0
                        ? "Downloading..."
                        : "Starting..."}
                  </span>
                  <span>
                    {item.speed > 0
                    ? `${item.speed.toFixed(2)} MB/s`
                    : effectiveCurrentSpeed > 0
                        ? `${effectiveCurrentSpeed.toFixed(2)} MB/s`
                        : "—"}
                  </span>
                </div>)}


                {item.status === "completed" && (<div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="font-mono">{item.progress.toFixed(2)} MB</span>
                </div>)}


                {item.status === "skipped" && (<div className="mt-1.5 text-xs text-muted-foreground">
                  File already exists
                </div>)}


                {item.status === "failed" && item.error_message && (<div className="mt-1.5 text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded px-2 py-1">
                  {item.error_message}
                </div>)}


                {(item.status === "completed" || item.status === "skipped") && item.file_path && (<div className="mt-1.5 text-xs text-muted-foreground truncate font-mono">
                  {item.file_path}
                </div>)}
              </div>
            </div>
          </div>)))}
        </div>
      </div>
    </DialogContent>
  </Dialog>);
}
