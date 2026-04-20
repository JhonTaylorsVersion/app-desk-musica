import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { toastWithSound as toast } from '../utils/toast-with-sound';
import { useSettings } from './useSettings';
import { buildPlaylistFolderName } from '../utils/playlist';
import { joinPath, sanitizePath, getFirstArtist } from '../utils/utils';

type QueueTrack = {
    id?: string;
    spotify_id?: string;
    spotify_url?: string;
    external_urls?: string;
    folder_name?: string;
    name?: string;
    title?: string;
    artists?: string;
    position?: number;
    album_name?: string;
    album?: string;
    album_artist?: string;
    release_date?: string;
    images?: string;
    duration_ms?: number;
    track_number?: number;
    disc_number?: number;
    total_tracks?: number;
    total_discs?: number;
    copyright?: string;
    publisher?: string;
    is_album_context?: boolean;
};

type BatchType = 'all' | 'selected' | null;

type FileExistenceResult = {
    spotify_id?: string;
    exists: boolean;
    file_path?: string | null;
};

type LibraryPlaylistSummary = {
    id: number;
    name: string;
    trackCount: number;
    trackPaths: string[];
    spotifyUrl?: string | null;
    spotifySyncedIds?: string | null;
};

type PlaylistSyncContext = {
    kind: 'playlist';
    spotifyUrl: string;
    playlistName: string;
};

export function useDownload() {
    const { settings } = useSettings();
    const isDownloading = ref(false);
    const downloadProgress = ref(0);
    const downloadingTrack = ref<string | null>(null);
    const bulkDownloadType = ref<BatchType>(null);
    const currentDownloadInfo = ref<{ name: string; id: string; artists: string } | null>(null);
    const downloadedTracks = ref(new Set<string>());
    const failedTracks = ref(new Set<string>());
    const skippedTracks = ref(new Set<string>());
    const shouldStopDownload = ref(false);

    const markDownloaded = (trackId: string) => {
        downloadedTracks.value.add(trackId);
        failedTracks.value.delete(trackId);
        skippedTracks.value.delete(trackId);
    };

    const markSkipped = (trackId: string) => {
        skippedTracks.value.add(trackId);
        downloadedTracks.value.add(trackId);
        failedTracks.value.delete(trackId);
    };

    const markFailed = (trackId: string) => {
        failedTracks.value.add(trackId);
        downloadedTracks.value.delete(trackId);
        skippedTracks.value.delete(trackId);
    };

    const resolveTrackId = (track: QueueTrack) => track.spotify_id || track.id || '';

    const resolveTrackUrl = (track: QueueTrack) =>
        track.spotify_url ||
        track.external_urls ||
        (resolveTrackId(track) ? `https://open.spotify.com/track/${resolveTrackId(track)}` : '');

    const resolveTrackName = (track: QueueTrack) => track.name || track.title || 'Unknown Track';

    const resolveTrackArtists = (track: QueueTrack) => track.artists || 'Unknown Artist';

    const dedupeTracks = (tracks: QueueTrack[]) => {
        const seen = new Set<string>();
        return tracks.filter((track) => {
            const trackId = resolveTrackId(track);
            if (!trackId || seen.has(trackId)) return false;
            seen.add(trackId);
            return true;
        });
    };

    const normalizePlaylistName = (value: string | undefined) =>
        (value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/['’`´]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim()
            .toLowerCase();

    const buildAppConfig = (outputDir: string, track?: QueueTrack) => ({
        output_dir: outputDir,
        download_quality: settings.value.autoQuality === '24' ? 'HiRes' : 'Lossless',
        filename_format: settings.value.filenameTemplate || '{title} - {artist}',
        embed_metadata: true,
        embed_cover: true,
        embed_genre: settings.value.embedGenre,
        use_single_genre: settings.value.useSingleGenre,
        redownload_with_suffix: settings.value.redownloadWithSuffix,
        download_artist_images: true,
        embed_lyrics: settings.value.embedLyrics,
        save_lrc_file: true,
        downloader: settings.value.downloader,
        auto_order: settings.value.autoOrder.split('-'),
        allow_resolver_fallback: settings.value.allowResolverFallback,
        folder_structure: settings.value.folderTemplate,
        separator: settings.value.separator === 'comma' ? ',' : ';',
        use_first_artist_only: settings.value.useFirstArtistOnly,
        use_album_track_number: Boolean(settings.value.folderTemplate?.includes('{album}')),
        position_override: track?.position || null,
    });

    const buildOutputDir = (folderName?: string, isAlbum?: boolean) => {
        let outputDir = settings.value.downloadPath;
        const os = settings.value.operatingSystem;
        const useAlbumTag = settings.value.folderTemplate?.includes('{album}');

        if (settings.value.createPlaylistFolder && folderName && (!isAlbum || !useAlbumTag)) {
            outputDir = joinPath(os, outputDir, sanitizePath(folderName.replace(/\//g, ' '), os));
        }

        return outputDir;
    };

    const buildExistenceRequest = (track: QueueTrack, position: number) => {
        const displayArtist =
            settings.value.useFirstArtistOnly && track.artists
                ? getFirstArtist(track.artists)
                : track.artists;
        const displayAlbumArtist =
            settings.value.useFirstArtistOnly && track.album_artist
                ? getFirstArtist(track.album_artist)
                : track.album_artist;

        return {
            spotify_id: resolveTrackId(track),
            name: resolveTrackName(track),
            artists: displayArtist || resolveTrackArtists(track),
            track_name: resolveTrackName(track),
            artist_name: displayArtist || resolveTrackArtists(track),
            album_name: track.album_name || track.album || '',
            album_artist: displayAlbumArtist || '',
            release_date: track.release_date || '',
            track_number: track.track_number || 0,
            disc_number: track.disc_number || 0,
            position,
            use_album_track_number: Boolean(settings.value.folderTemplate?.includes('{album}')),
            filename_format: settings.value.filenameTemplate || '',
            include_track_number: settings.value.trackNumber || false,
            audio_format: 'flac',
        };
    };

    const queueTrack = async (track: QueueTrack) => {
        const trackId = resolveTrackId(track);
        const displayArtist =
            settings.value.useFirstArtistOnly && track.artists
                ? getFirstArtist(track.artists)
                : resolveTrackArtists(track);

        await invoke('add_to_download_queue', {
            id: trackId,
            trackName: resolveTrackName(track),
            artistName: displayArtist,
            albumName: track.album_name || track.album || '',
            spotifyId: trackId,
        });

        return trackId;
    };

    const runSingleDownload = async (track: QueueTrack, outputDir: string): Promise<string | null> => {
        const trackId = resolveTrackId(track);
        const spotifyUrl = resolveTrackUrl(track);
        const trackName = resolveTrackName(track);
        const trackArtists = resolveTrackArtists(track);

        if (!trackId || !spotifyUrl) {
            toast.error(`Track data is incomplete for ${trackName}`);
            return null;
        }

        currentDownloadInfo.value = {
            name: trackName,
            id: trackId,
            artists: trackArtists,
        };
        downloadingTrack.value = trackId;

        const downloadedPath = await invoke<string>('download_track', {
            url: spotifyUrl,
            config: buildAppConfig(outputDir, track),
        });

        markDownloaded(trackId);
        return downloadedPath;
    };

    const checkExistingTracks = async (tracks: QueueTrack[], outputDir: string) => {
        const existence = await invoke<FileExistenceResult[]>('check_files_existence', {
            outputDir,
            rootDir: settings.value.downloadPath,
            tracks: tracks.map((track, index) => buildExistenceRequest(track, track.position || index + 1)),
        });

        const existingSpotifyIds = new Set<string>();
        const existingFilePaths = new Map<string, string>();

        for (const result of existence) {
            if (result.exists && result.spotify_id) {
                existingSpotifyIds.add(result.spotify_id);
                existingFilePaths.set(result.spotify_id, result.file_path || '');
            }
        }

        return { existingSpotifyIds, existingFilePaths };
    };

    const createPlaylistFileIfNeeded = async (folderName: string, outputDir: string, filePaths: string[]) => {
        const validPaths = filePaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0);
        if (!settings.value.createM3u8File || !folderName || validPaths.length === 0) {
            return;
        }

        try {
            await invoke('create_m3u8_file', {
                playlistName: folderName,
                outputDir,
                filePaths: validPaths,
            });
            toast.success('M3U8 playlist created');
        } catch (err: any) {
            // console.error('Failed to create M3U8 playlist:', err);
            toast.error(`Failed to create M3U8 playlist: ${err}`);
        }
    };

    const syncPlaylistWithLibrary = async (
        context: PlaylistSyncContext,
        tracks: QueueTrack[],
        finalFilePaths: Map<string, string>,
    ) => {
        const normalizedPlaylistName = normalizePlaylistName(context.playlistName);
        const resolvedTrackPaths = tracks
            .map((track) => {
                const trackId = resolveTrackId(track);
                return trackId ? finalFilePaths.get(trackId) || '' : '';
            })
            .filter((path): path is string => Boolean(path && path.trim().length > 0));

        const remoteIds = tracks
            .map((track) => resolveTrackId(track))
            .filter((trackId): trackId is string => Boolean(trackId));

        console.log('[PlaylistDebug][spotiflacDownloadSync] Preparing playlist sync', {
            playlistName: context.playlistName,
            spotifyUrl: context.spotifyUrl,
            resolvedTrackPaths,
            remoteIdsCount: remoteIds.length,
            remoteIdsSample: remoteIds.slice(0, 10),
        });

        if (!normalizedPlaylistName || !context.spotifyUrl || resolvedTrackPaths.length === 0) {
            console.warn('[PlaylistDebug][spotiflacDownloadSync] Skipped playlist sync due to incomplete data', {
                playlistName: context.playlistName,
                spotifyUrl: context.spotifyUrl,
                resolvedTrackPathsCount: resolvedTrackPaths.length,
            });
            return;
        }

        const playlists = await invoke<LibraryPlaylistSummary[]>('get_playlists');
        const existingPlaylist =
            playlists.find((playlist) => normalizePlaylistName(playlist.name) === normalizedPlaylistName) || null;

        let playlistId = existingPlaylist?.id ?? null;

        console.log('[PlaylistDebug][spotiflacDownloadSync] Existing playlist lookup', {
            playlistName: context.playlistName,
            existingPlaylist,
        });

        if (!playlistId) {
            const createdPlaylist = await invoke<LibraryPlaylistSummary>('create_playlist', {
                name: context.playlistName,
            });
            playlistId = createdPlaylist.id;
            console.log('[PlaylistDebug][spotiflacDownloadSync] Created playlist in library DB', {
                playlistName: context.playlistName,
                playlistId,
            });
        }

        await invoke('set_playlist_spotify_url', {
            playlistId,
            spotifyUrl: context.spotifyUrl,
        });

        console.log('[PlaylistDebug][spotiflacDownloadSync] Saved spotifyUrl in library DB', {
            playlistName: context.playlistName,
            playlistId,
            spotifyUrl: context.spotifyUrl,
        });

        await invoke('set_playlist_synced_ids', {
            playlistId,
            syncedIdsJson: JSON.stringify(remoteIds),
        });

        console.log('[PlaylistDebug][spotiflacDownloadSync] Saved spotifySyncedIds in library DB', {
            playlistName: context.playlistName,
            playlistId,
            remoteIdsCount: remoteIds.length,
        });

        for (let index = 0; index < resolvedTrackPaths.length; index += 1) {
            const trackPath = resolvedTrackPaths[index];
            await invoke('add_track_to_playlist', {
                playlistId,
                trackPath,
                position: index,
            });
        }

        const refreshedPlaylists = await invoke<LibraryPlaylistSummary[]>('get_playlists');
        const persistedPlaylist =
            refreshedPlaylists.find((playlist) => playlist.id === playlistId) || null;

        console.log('[PlaylistDebug][spotiflacDownloadSync] Playlist persisted after sync', {
            playlistId,
            playlistName: context.playlistName,
            persistedPlaylist,
        });
    };

    const finishBatchState = async () => {
        downloadingTrack.value = null;
        currentDownloadInfo.value = null;
        isDownloading.value = false;
        bulkDownloadType.value = null;
        shouldStopDownload.value = false;
        await invoke('cancel_all_queued_items');
    };

    const downloadTrack = async (track: QueueTrack): Promise<string | null> => {
        if (isDownloading.value) return null;

        const trackId = resolveTrackId(track);
        const trackName = resolveTrackName(track);
        const outputDir = buildOutputDir(track.folder_name, track.is_album_context);

        isDownloading.value = true;
        downloadProgress.value = 0;
        bulkDownloadType.value = null;

        try {
            const { existingSpotifyIds, existingFilePaths } = await checkExistingTracks([track], outputDir);

            if (existingSpotifyIds.has(trackId)) {
                await queueTrack(track);
                await invoke('skip_download_item', {
                    itemId: trackId,
                    filePath: existingFilePaths.get(trackId) || '',
                });
                markSkipped(trackId);
                downloadProgress.value = 100;
                toast.info('File already exists');
                return existingFilePaths.get(trackId) || null;
            }

            await queueTrack(track);
            const downloadedPath = await runSingleDownload(track, outputDir);
            downloadProgress.value = 100;
            toast.success(`Downloaded: ${trackName}`);
            return downloadedPath;
        } catch (err: any) {
            // console.error('Download failed:', err);
            markFailed(trackId);
            await invoke('mark_download_item_failed', {
                itemId: trackId,
                error: String(err),
            }).catch(() => undefined);
            toast.error(`Failed to download ${trackName}: ${err}`);
            return null;
        } finally {
            await finishBatchState();
        }
    };

    const runBatchDownload = async (
        tracks: QueueTrack[],
        folderName: string | undefined,
        batchType: Exclude<BatchType, null>,
        isAlbum: boolean = false,
        playlistSyncContext?: PlaylistSyncContext,
    ) => {
        if (isDownloading.value) return;
        if (!Array.isArray(tracks) || tracks.length === 0) {
            toast.warning('No tracks available for batch download');
            return;
        }

        const validTracks = tracks.filter((track) => resolveTrackId(track));
        const uniqueTracks = dedupeTracks(validTracks);
        if (uniqueTracks.length === 0) {
            toast.warning('No valid tracks available for download');
            return;
        }

        isDownloading.value = true;
        bulkDownloadType.value = batchType;
        downloadProgress.value = 0;
        shouldStopDownload.value = false;

        const outputDir = buildOutputDir(folderName, isAlbum);
        const finalFilePaths = new Map<string, string>();
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        try {
            const { existingSpotifyIds, existingFilePaths } = await checkExistingTracks(uniqueTracks, outputDir);

            for (const track of uniqueTracks) {
                const trackId = resolveTrackId(track);
                await queueTrack(track);

                if (existingSpotifyIds.has(trackId)) {
                    const filePath = existingFilePaths.get(trackId) || '';
                    finalFilePaths.set(trackId, filePath);
                    markSkipped(trackId);
                    skippedCount++;
                    await invoke('skip_download_item', {
                        itemId: trackId,
                        filePath,
                    });
                }
            }

            const total = uniqueTracks.length;

            if (total > 0) {
                downloadProgress.value = Math.round((skippedCount / total) * 100);
            }

            for (let i = 0; i < uniqueTracks.length; i++) {
                const track = uniqueTracks[i];
                const trackId = resolveTrackId(track);

                if (existingSpotifyIds.has(trackId)) {
                    continue;
                }

                if (shouldStopDownload.value) {
                    toast.info(`Download stopped. ${successCount} tracks downloaded, ${uniqueTracks.length - i} remaining.`);
                    break;
                }

                try {
                    const downloadedPath = await runSingleDownload(track, outputDir);
                    if (downloadedPath) {
                        successCount++;
                        finalFilePaths.set(trackId, downloadedPath);
                    } else {
                        errorCount++;
                        markFailed(trackId);
                    }
                } catch (err: any) {
                    errorCount++;
                    markFailed(trackId);
                    await invoke('mark_download_item_failed', {
                        itemId: trackId,
                        error: String(err),
                    }).catch(() => undefined);
                }

                const completedCount = skippedCount + successCount + errorCount;
                downloadProgress.value = Math.min(100, Math.round((completedCount / total) * 100));
            }

            if (folderName) {
                await createPlaylistFileIfNeeded(folderName, outputDir, uniqueTracks.map((track) => finalFilePaths.get(resolveTrackId(track)) || ''));
            }

            if (playlistSyncContext) {
                try {
                    await syncPlaylistWithLibrary(playlistSyncContext, uniqueTracks, finalFilePaths);
                } catch (error) {
                    console.error('[PlaylistDebug][spotiflacDownloadSync] Failed to sync playlist with library DB', {
                        playlistName: playlistSyncContext.playlistName,
                        spotifyUrl: playlistSyncContext.spotifyUrl,
                        error,
                    });
                }
            }

            if (errorCount === 0 && skippedCount === 0) {
                toast.success(`Downloaded ${successCount} tracks successfully`);
            } else if (errorCount === 0 && successCount === 0) {
                toast.info(`${skippedCount} tracks already exist`);
            } else if (errorCount === 0) {
                toast.info(`${successCount} downloaded, ${skippedCount} skipped`);
            } else {
                const parts: string[] = [];
                if (successCount > 0) parts.push(`${successCount} downloaded`);
                if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
                parts.push(`${errorCount} failed`);
                toast.warning(parts.join(', '));
            }
        } catch (err: any) {
            toast.error(`Batch download failed: ${err}`);
        } finally {
            await finishBatchState();
        }
    };

    const downloadBatch = async (
        tracks: QueueTrack[],
        folderName?: string,
        isAlbum: boolean = false,
        playlistSyncContext?: PlaylistSyncContext,
    ) => {
        const normalizedTracks = tracks.map((track, index) => ({
            ...track,
            position: track.position || index + 1,
            folder_name: folderName,
            is_album_context: isAlbum,
        }));
        await runBatchDownload(normalizedTracks, folderName, 'all', isAlbum, playlistSyncContext);
    };

    const downloadSelected = async (
        selectedTrackIds: string[],
        allTracks: QueueTrack[],
        folderName?: string,
        isAlbum: boolean = false,
        playlistSyncContext?: PlaylistSyncContext,
    ) => {
        const selectedTracks = allTracks
            .map((track, index) => ({
                ...track,
                position: track.position || index + 1,
                folder_name: folderName,
                is_album_context: isAlbum,
            }))
            .filter((track) => selectedTrackIds.includes(resolveTrackId(track)));
        await runBatchDownload(selectedTracks, folderName, 'selected', isAlbum, playlistSyncContext);
    };

    const handleStopDownload = () => {
        shouldStopDownload.value = true;
        toast.info('Stopping download...');
    };

    const resetDownloadedTracks = () => {
        downloadedTracks.value = new Set();
        failedTracks.value = new Set();
        skippedTracks.value = new Set();
        downloadProgress.value = 0;
        downloadingTrack.value = null;
        currentDownloadInfo.value = null;
        bulkDownloadType.value = null;
        shouldStopDownload.value = false;
    };

    const getFolderNameForMetadata = (metadata: any): string => {
        if (!metadata) return '';
        if ('album_info' in metadata) {
            return metadata.album_info?.name || '';
        }
        if ('playlist_info' in metadata) {
            return buildPlaylistFolderName(
                metadata.playlist_info?.name,
                metadata.playlist_info?.owner?.display_name,
                settings.value.playlistOwnerFolderName,
            );
        }
        if ('artist_info' in metadata) {
            return metadata.artist_info?.name || '';
        }
        return '';
    };

    return {
        isDownloading,
        downloadProgress,
        downloadingTrack,
        bulkDownloadType,
        currentDownloadInfo,
        downloadedTracks,
        failedTracks,
        skippedTracks,
        downloadTrack,
        downloadBatch,
        downloadSelected,
        handleStopDownload,
        resetDownloadedTracks,
        getFolderNameForMetadata,
    };
}
