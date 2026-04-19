import { ref } from "vue";
import { downloadCover } from "../utils/api";
import { getSettings } from "../utils/settings";
import { parseTemplate, type TemplateData } from "../types/settings";
import { toastWithSound as toast } from "../utils/toast-with-sound";
import { joinPath, sanitizePath, getFirstArtist } from "../utils/utils";
import { logger } from "../utils/logger";
import type { TrackMetadata } from "../types/api";

export function useCover() {
    const downloadingCover = ref(false);
    const downloadingCoverTrack = ref<string | null>(null);
    const downloadedCovers = ref<Set<string>>(new Set());
    const failedCovers = ref<Set<string>>(new Set());
    const skippedCovers = ref<Set<string>>(new Set());
    const isBulkDownloadingCovers = ref(false);
    const coverDownloadProgress = ref(0);
    const stopBulkDownloadRef = ref(false);

    const handleDownloadCover = async (coverUrl: string, trackName: string, artistName: string, albumName?: string, playlistName?: string, position?: number, trackId?: string, albumArtist?: string, releaseDate?: string, discNumber?: number, isAlbum?: boolean) => {
        if (!coverUrl) {
            toast.error("No cover URL found for this track");
            return;
        }
        const id = trackId || `${trackName}-${artistName}`;
        logger.info(`downloading cover: ${trackName} - ${artistName}`);
        
        const settings = getSettings();
        downloadingCover.value = true;
        downloadingCoverTrack.value = id;
        
        try {
            const os = settings.operatingSystem;
            let outputDir = settings.downloadPath;
            const placeholder = "__SLASH_PLACEHOLDER__";
            const yearValue = releaseDate?.substring(0, 4);
            const displayArtist = settings.useFirstArtistOnly && artistName ? getFirstArtist(artistName) : artistName;
            const displayAlbumArtist = settings.useFirstArtistOnly && albumArtist ? getFirstArtist(albumArtist) : albumArtist;
            
            const templateData: TemplateData = {
                artist: displayArtist?.replace(/\//g, placeholder),
                album: albumName?.replace(/\//g, placeholder),
                album_artist: displayAlbumArtist?.replace(/\//g, placeholder) || displayArtist?.replace(/\//g, placeholder),
                title: trackName?.replace(/\//g, placeholder),
                track: position != null ? String(position) : undefined,
                year: yearValue,
                date: releaseDate,
                playlist: playlistName?.replace(/\//g, placeholder),
            };
            
            const folderTemplate = settings.folderTemplate || "";
            const useAlbumSubfolder = folderTemplate.includes("{album}") || folderTemplate.includes("{album_artist}") || folderTemplate.includes("{playlist}");
            
            if (settings.createPlaylistFolder && playlistName && (!isAlbum || !useAlbumSubfolder)) {
                outputDir = joinPath(os, outputDir, sanitizePath(playlistName.replace(/\//g, " "), os));
            }
            if (settings.folderTemplate) {
                const folderPath = parseTemplate(settings.folderTemplate, templateData);
                if (folderPath) {
                    const parts = folderPath.split("/").filter((p: string) => p.trim());
                    for (const part of parts) {
                        const sanitizedPart = part.replace(new RegExp(placeholder, "g"), " ");
                        outputDir = joinPath(os, outputDir, sanitizePath(sanitizedPart, os));
                    }
                }
            }
            
            const response = await downloadCover({
                cover_url: coverUrl,
                track_name: trackName,
                artist_name: displayArtist,
                album_name: albumName || "",
                album_artist: displayAlbumArtist || "",
                release_date: releaseDate || "",
                output_dir: outputDir,
                filename_format: settings.filenameTemplate || "{title}",
                track_number: settings.trackNumber,
                position: position || 0,
                disc_number: discNumber || 0,
            });
            
            if (response.success) {
                if (response.already_exists) {
                    toast.info("Cover file already exists");
                    skippedCovers.value.add(id);
                    skippedCovers.value = new Set(skippedCovers.value);
                }
                else {
                    toast.success("Cover downloaded successfully");
                    downloadedCovers.value.add(id);
                    downloadedCovers.value = new Set(downloadedCovers.value);
                }
                failedCovers.value.delete(id);
                failedCovers.value = new Set(failedCovers.value);
            }
            else {
                toast.error(response.error || "Failed to download cover");
                failedCovers.value.add(id);
                failedCovers.value = new Set(failedCovers.value);
            }
        }
        catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to download cover");
            failedCovers.value.add(id);
            failedCovers.value = new Set(failedCovers.value);
        }
        finally {
            downloadingCover.value = false;
            downloadingCoverTrack.value = null;
        }
    };

    const handleDownloadAllCovers = async (tracks: TrackMetadata[], playlistName?: string, isAlbum?: boolean) => {
        if (tracks.length === 0) {
            toast.error("No tracks to download covers");
            return;
        }
        const settings = getSettings();
        isBulkDownloadingCovers.value = true;
        coverDownloadProgress.value = 0;
        stopBulkDownloadRef.value = false;
        
        let completed = 0;
        let success = 0;
        let skipped = 0;
        let failed = 0;
        
        for (let i = 0; i < tracks.length; i++) {
            if (stopBulkDownloadRef.value) {
                toast.info("Cover download stopped");
                break;
            }
            const track = tracks[i];
            if (!track.images) {
                completed++;
                coverDownloadProgress.value = Math.round((completed / tracks.length) * 100);
                continue;
            }
            const id = track.spotify_id || `${track.name}-${track.artists}`;
            downloadingCoverTrack.value = id;
            try {
                const os = settings.operatingSystem;
                let outputDir = settings.downloadPath;
                const placeholder = "__SLASH_PLACEHOLDER__";
                const useAlbumTrackNumber = settings.folderTemplate?.includes("{album}") || false;
                const trackPosition = useAlbumTrackNumber ? (track.track_number || i + 1) : (i + 1);
                const yearValue = track.release_date?.substring(0, 4);
                const displayArtist = settings.useFirstArtistOnly && track.artists ? getFirstArtist(track.artists) : track.artists;
                const displayAlbumArtist = settings.useFirstArtistOnly && track.album_artist ? getFirstArtist(track.album_artist) : track.album_artist;
                
                const templateData: TemplateData = {
                    artist: displayArtist?.replace(/\//g, placeholder),
                    album: track.album_name?.replace(/\//g, placeholder),
                    album_artist: displayAlbumArtist?.replace(/\//g, placeholder) || displayArtist?.replace(/\//g, placeholder),
                    title: track.name?.replace(/\//g, placeholder),
                    track: String(trackPosition),
                    year: yearValue,
                    date: track.release_date,
                    playlist: playlistName?.replace(/\//g, placeholder),
                };
                
                const folderTemplate = settings.folderTemplate || "";
                const useAlbumSubfolder = folderTemplate.includes("{album}") || folderTemplate.includes("{album_artist}") || folderTemplate.includes("{playlist}");
                if (settings.createPlaylistFolder && playlistName && (!isAlbum || !useAlbumSubfolder)) {
                    outputDir = joinPath(os, outputDir, sanitizePath(playlistName.replace(/\//g, " "), os));
                }
                if (settings.folderTemplate) {
                    const folderPath = parseTemplate(settings.folderTemplate, templateData);
                    if (folderPath) {
                        const parts = folderPath.split("/").filter((p: string) => p.trim());
                        for (const part of parts) {
                            const sanitizedPart = part.replace(new RegExp(placeholder, "g"), " ");
                            outputDir = joinPath(os, outputDir, sanitizePath(sanitizedPart, os));
                        }
                    }
                }
                const response = await downloadCover({
                    cover_url: track.images,
                    track_name: track.name,
                    artist_name: displayArtist,
                    album_name: track.album_name,
                    album_artist: displayAlbumArtist,
                    release_date: track.release_date,
                    output_dir: outputDir,
                    filename_format: settings.filenameTemplate || "{title}",
                    track_number: settings.trackNumber,
                    position: trackPosition,
                    disc_number: track.disc_number || 0,
                });
                if (response.success) {
                    if (response.already_exists) {
                        skipped++;
                        skippedCovers.value.add(id);
                        skippedCovers.value = new Set(skippedCovers.value);
                    }
                    else {
                        success++;
                        downloadedCovers.value.add(id);
                        downloadedCovers.value = new Set(downloadedCovers.value);
                    }
                }
                else {
                    failed++;
                    failedCovers.value.add(id);
                    failedCovers.value = new Set(failedCovers.value);
                }
            }
            catch {
                failed++;
                failedCovers.value.add(id);
                failedCovers.value = new Set(failedCovers.value);
            }
            completed++;
            coverDownloadProgress.value = Math.round((completed / tracks.length) * 100);
        }
        
        downloadingCoverTrack.value = null;
        isBulkDownloadingCovers.value = false;
        coverDownloadProgress.value = 0;
        if (!stopBulkDownloadRef.value) {
            toast.success(`Covers: ${success} downloaded, ${skipped} skipped, ${failed} failed`);
        }
    };

    const handleStopCoverDownload = () => {
        stopBulkDownloadRef.value = true;
    };

    const resetCoverState = () => {
        downloadedCovers.value = new Set();
        failedCovers.value = new Set();
        skippedCovers.value = new Set();
    };

    return {
        downloadingCover,
        downloadingCoverTrack,
        downloadedCovers,
        failedCovers,
        skippedCovers,
        isBulkDownloadingCovers,
        coverDownloadProgress,
        handleDownloadCover,
        handleDownloadAllCovers,
        handleStopCoverDownload,
        resetCoverState,
    };
}
