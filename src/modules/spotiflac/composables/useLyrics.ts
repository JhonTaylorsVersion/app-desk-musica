import { ref } from "vue";
import { downloadLyrics } from "../utils/api";
import { getSettings } from "../utils/settings";
import { parseTemplate, type TemplateData } from "../types/settings";
import { toastWithSound as toast } from "../utils/toast-with-sound";
import { joinPath, sanitizePath, getFirstArtist } from "../utils/utils";
import { logger } from "../utils/logger";
import type { TrackMetadata } from "../types/api";
import { invoke } from "@tauri-apps/api/core";

async function resolveTemplateISRC(settings: {
    folderTemplate?: string;
    filenameTemplate?: string;
}, spotifyId?: string): Promise<string> {
    if (!spotifyId) {
        return "";
    }
    const folderTemplate = settings.folderTemplate || "";
    const filenameTemplate = settings.filenameTemplate || "";
    if (!folderTemplate.includes("{isrc}") && !filenameTemplate.includes("{isrc}")) {
        return "";
    }
    try {
        return await invoke("get_track_isrc", { spotify_id: spotifyId });
    }
    catch {
        return "";
    }
}

export function useLyrics() {
    const downloadingLyricsTrack = ref<string | null>(null);
    const downloadedLyrics = ref<Set<string>>(new Set());
    const failedLyrics = ref<Set<string>>(new Set());
    const skippedLyrics = ref<Set<string>>(new Set());
    const isBulkDownloadingLyrics = ref(false);
    const lyricsDownloadProgress = ref(0);
    const stopBulkDownloadRef = ref(false);

    const handleDownloadLyrics = async (spotifyId: string, trackName: string, artistName: string, albumName?: string, playlistName?: string, position?: number, albumArtist?: string, releaseDate?: string, discNumber?: number, isAlbum?: boolean) => {
        if (!spotifyId) {
            toast.error("No Spotify ID found for this track");
            return;
        }
        logger.info(`downloading lyrics: ${trackName} - ${artistName}`);
        const settings = getSettings();
        downloadingLyricsTrack.value = spotifyId;
        
        try {
            const os = settings.operatingSystem;
            let outputDir = settings.downloadPath;
            const placeholder = "__SLASH_PLACEHOLDER__";
            const yearValue = releaseDate?.substring(0, 4);
            const displayArtist = settings.useFirstArtistOnly && artistName ? getFirstArtist(artistName) : artistName;
            const displayAlbumArtist = settings.useFirstArtistOnly && albumArtist ? getFirstArtist(albumArtist) : albumArtist;
            const resolvedTemplateISRC = await resolveTemplateISRC(settings as any, spotifyId);
            const templateData: TemplateData = {
                artist: displayArtist?.replace(/\//g, placeholder),
                album: albumName?.replace(/\//g, placeholder),
                album_artist: displayAlbumArtist?.replace(/\//g, placeholder) || displayArtist?.replace(/\//g, placeholder),
                title: trackName?.replace(/\//g, placeholder),
                isrc: resolvedTemplateISRC?.replace(/\//g, placeholder),
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
            const useAlbumTrackNumber = settings.folderTemplate?.includes("{album}") || false;
            const response = await downloadLyrics({
                spotify_id: spotifyId,
                track_name: trackName,
                artist_name: displayArtist,
                album_name: albumName || "",
                album_artist: displayAlbumArtist || "",
                release_date: releaseDate || "",
                isrc: resolvedTemplateISRC || undefined,
                output_dir: outputDir,
                filename_format: settings.filenameTemplate || "{title}",
                track_number: settings.trackNumber,
                position: position || 0,
                use_album_track_number: useAlbumTrackNumber,
                disc_number: discNumber || 0,
            });
            if (response.success) {
                if (response.already_exists) {
                    toast.info("Lyrics file already exists");
                    skippedLyrics.value.add(spotifyId);
                    skippedLyrics.value = new Set(skippedLyrics.value);
                }
                else {
                    toast.success("Lyrics downloaded successfully");
                    downloadedLyrics.value.add(spotifyId);
                    downloadedLyrics.value = new Set(downloadedLyrics.value);
                }
                failedLyrics.value.delete(spotifyId);
                failedLyrics.value = new Set(failedLyrics.value);
            }
            else {
                toast.error(response.error || "Failed to download lyrics");
                failedLyrics.value.add(spotifyId);
                failedLyrics.value = new Set(failedLyrics.value);
            }
        }
        catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to download lyrics");
            failedLyrics.value.add(spotifyId);
            failedLyrics.value = new Set(failedLyrics.value);
        }
        finally {
            downloadingLyricsTrack.value = null;
        }
    };

    const handleDownloadAllLyrics = async (tracks: TrackMetadata[], playlistName?: string, _isArtistDiscography?: boolean, isAlbum?: boolean) => {
        const tracksWithSpotifyId = tracks.filter((track) => track.spotify_id);
        if (tracksWithSpotifyId.length === 0) {
            toast.error("No tracks with Spotify ID available for lyrics download");
            return;
        }
        const settings = getSettings();
        isBulkDownloadingLyrics.value = true;
        lyricsDownloadProgress.value = 0;
        stopBulkDownloadRef.value = false;
        
        let completed = 0;
        let success = 0;
        let failed = 0;
        let skipped = 0;
        const total = tracksWithSpotifyId.length;
        
        for (let i = 0; i < tracksWithSpotifyId.length; i++) {
            const track = tracksWithSpotifyId[i];
            if (stopBulkDownloadRef.value) {
                toast.info("Lyrics download stopped by user");
                break;
            }
            const id = track.spotify_id!;
            downloadingLyricsTrack.value = id;
            lyricsDownloadProgress.value = Math.round((completed / total) * 100);
            
            try {
                // Bulk logic processing mirroring original exactly
                const os = settings.operatingSystem;
                let outputDir = settings.downloadPath;
                const placeholder = "__SLASH_PLACEHOLDER__";
                const useAlbumTrackNumber = settings.folderTemplate?.includes("{album}") || false;
                const trackPosition = useAlbumTrackNumber ? (track.track_number || i + 1) : (i + 1);
                const yearValue = track.release_date?.substring(0, 4);
                const displayArtist = settings.useFirstArtistOnly && track.artists ? getFirstArtist(track.artists) : track.artists;
                const displayAlbumArtist = settings.useFirstArtistOnly && track.album_artist ? getFirstArtist(track.album_artist) : track.album_artist;
                const resolvedTemplateISRC = await resolveTemplateISRC(settings as any, id);
                const templateData: TemplateData = {
                    artist: displayArtist?.replace(/\//g, placeholder),
                    album: track.album_name?.replace(/\//g, placeholder),
                    album_artist: displayAlbumArtist?.replace(/\//g, placeholder) || displayArtist?.replace(/\//g, placeholder),
                    title: track.name?.replace(/\//g, placeholder),
                    isrc: resolvedTemplateISRC?.replace(/\//g, placeholder),
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
                const response = await downloadLyrics({
                    spotify_id: id,
                    track_name: track.name,
                    artist_name: displayArtist,
                    album_name: track.album_name || "",
                    album_artist: displayAlbumArtist || "",
                    release_date: track.release_date || "",
                    isrc: resolvedTemplateISRC || undefined,
                    output_dir: outputDir,
                    filename_format: settings.filenameTemplate || "{title}",
                    track_number: settings.trackNumber,
                    position: trackPosition,
                    use_album_track_number: useAlbumTrackNumber,
                    disc_number: track.disc_number || 0,
                });
                if (response.success) {
                    if (response.already_exists) {
                        skipped++;
                        skippedLyrics.value.add(id);
                        skippedLyrics.value = new Set(skippedLyrics.value);
                    }
                    else {
                        success++;
                        downloadedLyrics.value.add(id);
                        downloadedLyrics.value = new Set(downloadedLyrics.value);
                    }
                    failedLyrics.value.delete(id);
                    failedLyrics.value = new Set(failedLyrics.value);
                }
                else {
                    failed++;
                    failedLyrics.value.add(id);
                    failedLyrics.value = new Set(failedLyrics.value);
                }
            }
            catch (err) {
                failed++;
                logger.error(`error downloading lyrics: ${track.name} - ${err}`);
                failedLyrics.value.add(id);
                failedLyrics.value = new Set(failedLyrics.value);
            }
            completed++;
        }
        downloadingLyricsTrack.value = null;
        isBulkDownloadingLyrics.value = false;
        lyricsDownloadProgress.value = 0;
        if (!stopBulkDownloadRef.value) {
            toast.success(`Lyrics: ${success} downloaded, ${skipped} skipped, ${failed} failed`);
        }
    };

    const handleStopLyricsDownload = () => {
        logger.info("lyrics download stopped by user");
        stopBulkDownloadRef.value = true;
        toast.info("Stopping lyrics download...");
    };

    const resetLyricsState = () => {
        downloadedLyrics.value = new Set();
        failedLyrics.value = new Set();
        skippedLyrics.value = new Set();
    };

    return {
        downloadingLyricsTrack,
        downloadedLyrics,
        failedLyrics,
        skippedLyrics,
        isBulkDownloadingLyrics,
        lyricsDownloadProgress,
        handleDownloadLyrics,
        handleDownloadAllLyrics,
        handleStopLyricsDownload,
        resetLyricsState,
    };
}
