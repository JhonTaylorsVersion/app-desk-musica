import { invoke } from '@tauri-apps/api/core';
import type { 
    SpotifyMetadataResponse, DownloadRequest, DownloadResponse, HealthResponse, 
    CurrentIPInfo, LyricsDownloadRequest, LyricsDownloadResponse, 
    CoverDownloadRequest, CoverDownloadResponse, HeaderDownloadRequest, 
    HeaderDownloadResponse, GalleryImageDownloadRequest, GalleryImageDownloadResponse, 
    AvatarDownloadRequest, AvatarDownloadResponse 
} from "../types/api";

export async function fetchSpotifyMetadata(url: string, batch: boolean = true, delay: number = 1.0, timeout: number = 300.0): Promise<SpotifyMetadataResponse> {
    return await invoke('get_spotify_metadata', { url });
}

export async function downloadTrack(request: DownloadRequest): Promise<DownloadResponse> {
    return await invoke('download_track', { 
        url: request.service_url || request.spotify_url || request.spotify_id || '', 
        config: request, 
        tidalIdOverride: null 
    });
}

export async function checkHealth(): Promise<HealthResponse> {
    return {
        status: "ok",
        time: new Date().toISOString(),
    };
}

export async function fetchCurrentIPInfo(): Promise<CurrentIPInfo> {
    return await invoke<CurrentIPInfo>('get_current_ip_info');
}

export async function downloadLyrics(request: LyricsDownloadRequest): Promise<LyricsDownloadResponse> {
    return await invoke('download_lyrics', { request });
}

export async function downloadCover(request: CoverDownloadRequest): Promise<CoverDownloadResponse> {
    return await invoke('download_cover', { request });
}

export async function downloadHeader(request: HeaderDownloadRequest): Promise<HeaderDownloadResponse> {
    return await invoke('download_header', { request });
}

export async function downloadGalleryImage(request: GalleryImageDownloadRequest): Promise<GalleryImageDownloadResponse> {
    return await invoke('download_gallery_image', { request });
}

export async function downloadAvatar(request: AvatarDownloadRequest): Promise<AvatarDownloadResponse> {
    return await invoke('download_avatar', { request });
}
