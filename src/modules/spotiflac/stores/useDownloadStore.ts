import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import { listen, type Event } from '@tauri-apps/api/event';

// Mirrors backend.DownloadQueueInfo from the original Wails model
export interface DownloadQueueItem {
    id: string;
    track_name: string;
    artist_name: string;
    album_name: string;
    status: 'queued' | 'downloading' | 'completed' | 'failed' | 'skipped';
    progress: number;      // MB downloaded
    speed: number;         // MB/s
    error_message?: string;
    file_path?: string;
}

export interface DownloadQueueInfo {
    is_downloading: boolean;
    queue: DownloadQueueItem[];
    current_speed: number;       // MB/s overall
    total_downloaded: number;    // MB total this session
    session_start_time: number;  // Unix timestamp seconds
    queued_count: number;
    completed_count: number;
    failed_count: number;
    skipped_count: number;
}

interface ProgressUpdate {
    item_id: string;
    status: string;
    progress_mb: number;
    speed_mbps: number;
}

interface StatusUpdate {
    item_id: string;
    status: string;
    error_message?: string;
    file_path?: string;
}

export const useDownloadStore = defineStore('download', {
    state: () => ({
        queueInfo: {
            is_downloading: false,
            queue: [],
            current_speed: 0,
            total_downloaded: 0,
            session_start_time: 0,
            queued_count: 0,
            completed_count: 0,
            failed_count: 0,
            skipped_count: 0,
        } as DownloadQueueInfo,
        setupDone: false,
    }),

    getters: {
        queue: (state) => state.queueInfo.queue,
        isDownloading: (state) => state.queueInfo.is_downloading,
        totalDownloaded: (state) => state.queueInfo.total_downloaded,
        currentSpeed: (state) => state.queueInfo.current_speed,
    },

    actions: {
        async setupListeners() {
            if (this.setupDone) return;
            this.setupDone = true;

            // Listen to per-item progress updates from Rust engine
            await listen<ProgressUpdate>('download-progress', (event: Event<ProgressUpdate>) => {
                const data = event.payload;
                const item = this.queueInfo.queue.find(i => i.id === data.item_id);
                if (item) {
                    item.status = data.status as DownloadQueueItem['status'];
                    item.progress = data.progress_mb;
                    item.speed = data.speed_mbps;
                }
                
                // Aggregated stats
                this.queueInfo.current_speed = this.queueInfo.queue
                    .filter(i => i.status === 'downloading')
                    .reduce((acc, curr) => acc + (curr.speed || 0), 0);
                
                this.queueInfo.total_downloaded = this.queueInfo.queue
                    .reduce((acc, curr) => acc + (curr.progress || 0), 0);

                if (data.status === 'downloading') {
                    this.queueInfo.is_downloading = true;
                }
            });

            // Listen to status change events
            await listen<StatusUpdate>('download-status', (event: Event<StatusUpdate>) => {
                const data = event.payload;
                const item = this.queueInfo.queue.find(i => i.id === data.item_id);
                if (item) {
                    item.status = data.status as DownloadQueueItem['status'];
                    if (data.error_message) item.error_message = data.error_message;
                    if (data.file_path) item.file_path = data.file_path;
                }
                this._recomputeCounts();
            });
        },

        // Poll the backend queue — mirrors the original 500ms interval in DownloadQueue.tsx
        async fetchQueue() {
            try {
                const info = await invoke<DownloadQueueInfo>('get_download_queue');
                this.queueInfo = info;
            } catch (e) {
                // console.error('Failed to fetch download queue:', e);
            }
        },

        async clearCompletedDownloads() {
            await invoke('clear_completed_downloads');
            await this.fetchQueue();
        },

        async clearAllDownloads() {
            await invoke('clear_all_downloads');
            await this.fetchQueue();
        },

        async exportFailedDownloads(): Promise<string> {
            return await invoke<string>('export_failed_downloads');
        },

        _recomputeCounts() {
            const q = this.queueInfo.queue;
            this.queueInfo.queued_count    = q.filter(i => i.status === 'queued').length;
            this.queueInfo.completed_count = q.filter(i => i.status === 'completed').length;
            this.queueInfo.failed_count    = q.filter(i => i.status === 'failed').length;
            this.queueInfo.skipped_count   = q.filter(i => i.status === 'skipped').length;
            this.queueInfo.is_downloading  = q.some(i => i.status === 'downloading');
        },

        clearQueue() {
            this.queueInfo = {
                is_downloading: false,
                queue: [],
                current_speed: 0,
                total_downloaded: 0,
                session_start_time: 0,
                queued_count: 0,
                completed_count: 0,
                failed_count: 0,
                skipped_count: 0,
            };
        },
    },
});
