import { useDownloadProgress } from "@/hooks/useDownloadProgress";
import { useDownloadQueueData } from "@/hooks/useDownloadQueueData";
import { Download, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
interface DownloadProgressToastProps {
    onClick: () => void;
    forceVisible?: boolean;
}
export function DownloadProgressToast({ onClick, forceVisible = false }: DownloadProgressToastProps) {
    const queueInfo = useDownloadQueueData({ intervalMs: 1000 });
    const hasActiveQueueItems = queueInfo.queue.some(item => item.status === "queued" || item.status === "downloading");
    const progress = useDownloadProgress({
        enabled: forceVisible || hasActiveQueueItems,
        intervalMs: 750,
    });
    const hasActiveDownloads = forceVisible || hasActiveQueueItems || queueInfo.is_downloading || progress.is_downloading;
    const [dismissed, setDismissed] = useState(false);
    useEffect(() => {
        if (hasActiveDownloads) {
            setDismissed(false);
        }
    }, [hasActiveDownloads]);
    if (!hasActiveDownloads || dismissed) {
        return null;
    }
    return (<div className="fixed bottom-4 left-[calc(56px+1rem)] z-50 animate-in slide-in-from-bottom-5 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-5">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-foreground shadow-lg dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 rounded-full text-muted-foreground" onClick={() => setDismissed(true)}>
          <X className="h-4 w-4"/>
        </Button>
        <Button variant="ghost" className="h-auto cursor-pointer p-0 text-inherit hover:bg-transparent" onClick={onClick}>
        <div className="flex items-center gap-3">
          <Download className={`h-4 w-4 text-blue-600 dark:text-blue-400 ${progress.is_downloading ? 'animate-bounce' : ''}`}/>
          <div className="flex flex-col min-w-[80px]">
            <p className="text-sm font-medium font-mono tabular-nums">
              {progress.mb_downloaded.toFixed(2)} MB
            </p>
            {progress.speed_mbps > 0 && (<p className="text-xs font-mono tabular-nums text-muted-foreground dark:text-blue-300">
                {progress.speed_mbps.toFixed(2)} MB/s
              </p>)}
          </div>
          <ChevronRight className="ml-1 h-4 w-4 text-muted-foreground dark:text-blue-300"/>
        </div>
        </Button>
      </div>
    </div>);
}
