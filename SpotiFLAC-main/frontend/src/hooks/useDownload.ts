import { useState, useRef } from "react";
import { downloadTrack, fetchSpotifyMetadata } from "@/lib/api";
import { getSettings, parseTemplate, type TemplateData } from "@/lib/settings";
import { toastWithSound as toast } from "@/lib/toast-with-sound";
import { joinPath, sanitizePath, getFirstArtist } from "@/lib/utils";
import { logger } from "@/lib/logger";
import type { TrackMetadata } from "@/types/api";
interface CheckFileExistenceRequest {
    spotify_id: string;
    track_name: string;
    artist_name: string;
    album_name?: string;
    album_artist?: string;
    release_date?: string;
    track_number?: number;
    disc_number?: number;
    position?: number;
    use_album_track_number?: boolean;
    filename_format?: string;
    include_track_number?: boolean;
    audio_format?: string;
    relative_path?: string;
}
interface FileExistenceResult {
    spotify_id: string;
    exists: boolean;
    file_path?: string;
    track_name?: string;
    artist_name?: string;
}
interface ExistingTrackMetadata {
    title?: string | null;
    artist?: string | null;
    album?: string | null;
    album_artist?: string | null;
    year?: string | null;
    release_date?: string | null;
    track_number?: string | null;
    track_total?: string | null;
    disc_number?: string | null;
    disc_total?: string | null;
    cover_art?: {
        data_url?: string | null;
    } | null;
}
interface BatchConflictTrack {
    index: number;
    name: string;
    artists: string;
    album: string;
    outputPath: string;
    playlistPosition: number;
}
interface BatchConflictAnalysis {
    conflictGroups: BatchConflictTrack[][];
    filenameOverrides: Map<number, string>;
}
const CheckFilesExistence = (outputDir: string, rootDir: string, tracks: CheckFileExistenceRequest[]): Promise<FileExistenceResult[]> => (window as any)["go"]["main"]["App"]["CheckFilesExistence"](outputDir, rootDir, tracks);
const SkipDownloadItem = (itemID: string, filePath: string): Promise<void> => (window as any)["go"]["main"]["App"]["SkipDownloadItem"](itemID, filePath);
const CreateM3U8File = (playlistName: string, outputDir: string, filePaths: string[]): Promise<void> => (window as any)["go"]["main"]["App"]["CreateM3U8File"](playlistName, outputDir, filePaths);
function sanitizeFilenameLikeBackend(name: string): string {
    const withSlashesReplaced = (name || "").replaceAll("/", " ");
    const withoutReservedChars = withSlashesReplaced.replace(/[<>:"\\|?*]/g, " ");
    const withoutControlChars = Array.from(withoutReservedChars)
        .filter((char) => {
        const code = char.charCodeAt(0);
        if (code === 0x7f) {
            return false;
        }
        if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
            return false;
        }
        return true;
    })
        .join("")
        .trim()
        .replace(/^[.\s]+|[.\s]+$/g, "")
        .replace(/\s+/g, " ")
        .replace(/_+/g, "_")
        .replace(/^[_\s]+|[_\s]+$/g, "");
    return withoutControlChars || "Unknown";
}
function buildExpectedFilenameLikeBackend(trackName: string, artistName: string, albumName: string, albumArtist: string, releaseDate: string, filenameFormat: string, includeTrackNumber: boolean, position: number, discNumber: number): string {
    const safeTitle = sanitizeFilenameLikeBackend(trackName);
    const safeArtist = sanitizeFilenameLikeBackend(artistName);
    const safeAlbum = sanitizeFilenameLikeBackend(albumName);
    const safeAlbumArtist = sanitizeFilenameLikeBackend(albumArtist);
    const year = releaseDate?.length >= 4 ? releaseDate.slice(0, 4) : "";
    let filename = filenameFormat || "{title} - {artist}";
    if (filename.includes("{")) {
        filename = filename
            .replaceAll("{title}", safeTitle)
            .replaceAll("{artist}", safeArtist)
            .replaceAll("{album}", safeAlbum)
            .replaceAll("{album_artist}", safeAlbumArtist)
            .replaceAll("{year}", year)
            .replaceAll("{date}", sanitizeFilenameLikeBackend(releaseDate || ""));
        if (discNumber > 0) {
            filename = filename.replaceAll("{disc}", String(discNumber));
        }
        else {
            filename = filename.replaceAll("{disc}", "");
        }
        if (position > 0) {
            filename = filename.replaceAll("{track}", String(position).padStart(2, "0"));
        }
        else {
            filename = filename
                .replace(/\{track\}\.\s*/g, "")
                .replace(/\{track\}\s*-\s*/g, "")
                .replace(/\{track\}\s*/g, "");
        }
    }
    else {
        switch (filename) {
            case "artist-title":
                filename = `${safeArtist} - ${safeTitle}`;
                break;
            case "title":
                filename = safeTitle;
                break;
            default:
                filename = `${safeTitle} - ${safeArtist}`;
                break;
        }
        if (includeTrackNumber && position > 0) {
            filename = `${String(position).padStart(2, "0")}. ${filename}`;
        }
    }
    return `${filename}.flac`;
}
function buildInternalDuplicateFilenameTemplate(baseFilenameTemplate: string, uniqueKey: string | number): string {
    const normalizedKey = String(uniqueKey || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "");
    const safeKey = normalizedKey || "variant";
    return `${baseFilenameTemplate}__sfdup_${safeKey}`;
}
function buildBatchDuplicateFilenameTemplate(baseFilenameTemplate: string, playlistPosition: number): string {
    return buildInternalDuplicateFilenameTemplate(baseFilenameTemplate, `p${String(playlistPosition).padStart(4, "0")}`);
}
function buildSingleTrackDuplicateFilenameTemplate(baseFilenameTemplate: string, spotifyId?: string, fallbackId?: string): string {
    const uniqueToken = [
        spotifyId || fallbackId || "track",
        Date.now().toString(36),
    ].filter(Boolean).join("_");
    return buildInternalDuplicateFilenameTemplate(baseFilenameTemplate, uniqueToken);
}
function normalizeComparableText(value?: string | null): string {
    return String(value || "")
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}
function normalizeComparableDate(value?: string | null): string {
    const normalized = normalizeComparableText(value);
    if (!normalized) {
        return "";
    }
    return normalized.length >= 10 ? normalized.slice(0, 10) : normalized;
}
function normalizeComparableNumber(value?: string | number | null): string {
    const raw = String(value ?? "").trim();
    if (!raw) {
        return "";
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
}
async function computeSha256HexFromBuffer(buffer: BufferSource): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
}
async function hashDataUrl(dataUrl?: string | null): Promise<string> {
    const normalized = String(dataUrl || "").trim();
    if (!normalized) {
        return "";
    }
    return await computeSha256HexFromBuffer(new TextEncoder().encode(normalized));
}
async function hashRemoteCover(coverUrl?: string | null): Promise<string> {
    const normalized = String(coverUrl || "").trim();
    if (!normalized) {
        return "";
    }
    try {
        const response = await fetch(normalized);
        if (!response.ok) {
            return "";
        }
        return await computeSha256HexFromBuffer(await response.arrayBuffer());
    }
    catch {
        return "";
    }
}
async function detectExistingTrackDifferences(existingFilePath: string, track: {
    trackName?: string;
    artistName?: string;
    albumName?: string;
    albumArtist?: string;
    releaseDate?: string;
    spotifyTrackNumber?: number;
    spotifyDiscNumber?: number;
    spotifyTotalTracks?: number;
    spotifyTotalDiscs?: number;
    coverUrl?: string;
}): Promise<string[]> {
    const { ReadAudioMetadata } = await import("../../wailsjs/go/main/App");
    const metadata = await ReadAudioMetadata(existingFilePath) as ExistingTrackMetadata;
    const differences: string[] = [];
    const checks: Array<[string, string, string]> = [
        ["titulo", normalizeComparableText(metadata.title), normalizeComparableText(track.trackName)],
        ["artista", normalizeComparableText(metadata.artist), normalizeComparableText(track.artistName)],
        ["album", normalizeComparableText(metadata.album), normalizeComparableText(track.albumName)],
        ["album artist", normalizeComparableText(metadata.album_artist), normalizeComparableText(track.albumArtist)],
        ["fecha", normalizeComparableDate(metadata.release_date || metadata.year), normalizeComparableDate(track.releaseDate)],
        ["track", normalizeComparableNumber(metadata.track_number), normalizeComparableNumber(track.spotifyTrackNumber)],
        ["disc", normalizeComparableNumber(metadata.disc_number), normalizeComparableNumber(track.spotifyDiscNumber)],
        ["total tracks", normalizeComparableNumber(metadata.track_total), normalizeComparableNumber(track.spotifyTotalTracks)],
        ["total discs", normalizeComparableNumber(metadata.disc_total), normalizeComparableNumber(track.spotifyTotalDiscs)],
    ];
    for (const [label, existingValue, requestedValue] of checks) {
        if (existingValue && requestedValue && existingValue !== requestedValue) {
            differences.push(label);
        }
    }
    if (differences.length === 0) {
        // Si toda la metadata musical coincide, lo tratamos como la misma version.
        // Comparar bytes de portada produce falsos positivos porque algunas fuentes
        // re-encodan la imagen aunque sea la misma edicion.
        return differences;
    }
    const [existingCoverHash, requestedCoverHash] = await Promise.all([
        hashDataUrl(metadata.cover_art?.data_url),
        hashRemoteCover(track.coverUrl),
    ]);
    if (existingCoverHash && requestedCoverHash && existingCoverHash !== requestedCoverHash) {
        differences.push("cover");
    }
    return differences;
}
async function findExistingVersionMatches(outputDir: string, expectedFilename: string, track: {
    trackName?: string;
    artistName?: string;
    albumName?: string;
    albumArtist?: string;
    releaseDate?: string;
    spotifyTrackNumber?: number;
    spotifyDiscNumber?: number;
    spotifyTotalTracks?: number;
    spotifyTotalDiscs?: number;
    coverUrl?: string;
}): Promise<{ exactMatchPath: string | null; detectedDifferences: string[] }> {
    const extensionMatch = expectedFilename.match(/\.([^.]+)$/);
    const extension = extensionMatch?.[1] || "flac";
    const baseName = expectedFilename.replace(/\.[^.]+$/, "");
    const { FindDuplicateCandidates } = await import("../../wailsjs/go/main/App");
    const candidates = await FindDuplicateCandidates(outputDir, baseName, extension);
    let firstDifferenceSet: string[] = [];
    for (const candidatePath of candidates) {
        const differences = await detectExistingTrackDifferences(candidatePath, track);
        if (differences.length === 0) {
            return { exactMatchPath: candidatePath, detectedDifferences: [] };
        }
        if (firstDifferenceSet.length === 0) {
            firstDifferenceSet = differences;
        }
    }
    return {
        exactMatchPath: null,
        detectedDifferences: firstDifferenceSet,
    };
}
function analyzeBatchFilenameConflicts(tracks: TrackMetadata[], settings: any, folderName: string | undefined, isAlbum: boolean | undefined): BatchConflictAnalysis {
    const outputGroups = new Map<string, BatchConflictTrack[]>();
    const useAlbumSubfolder = Boolean(settings.folderTemplate?.includes("{album}") || settings.folderTemplate?.includes("{album_artist}") || settings.folderTemplate?.includes("{playlist}"));
    const baseFilenameTemplate = settings.filenameTemplate || "{title} - {artist}";
    tracks.forEach((track, index) => {
        const placeholder = "__SLASH_PLACEHOLDER__";
        const displayArtist = settings.useFirstArtistOnly && track.artists ? getFirstArtist(track.artists) : track.artists;
        const displayAlbumArtist = settings.useFirstArtistOnly && track.album_artist ? getFirstArtist(track.album_artist) : track.album_artist;
        const hasSubfolder = settings.folderTemplate && settings.folderTemplate.trim() !== "";
        const playlistPosition = index + 1;
        const trackNumberForTemplate = (hasSubfolder && (track.track_number || 0) > 0)
            ? (track.track_number || 0)
            : playlistPosition;
        let targetDir = settings.downloadPath;
        if (settings.createPlaylistFolder && folderName && (!isAlbum || !useAlbumSubfolder)) {
            targetDir = joinPath(settings.operatingSystem, targetDir, sanitizePath(folderName.replace(/\//g, " "), settings.operatingSystem));
        }
        if (settings.folderTemplate) {
            const folderPath = parseTemplate(settings.folderTemplate, {
                artist: displayArtist?.replace(/\//g, placeholder),
                album: track.album_name?.replace(/\//g, placeholder),
                album_artist: displayAlbumArtist?.replace(/\//g, placeholder) || displayArtist?.replace(/\//g, placeholder),
                title: track.name?.replace(/\//g, placeholder),
                track: trackNumberForTemplate,
                year: track.release_date?.substring(0, 4),
                date: track.release_date,
                playlist: folderName?.replace(/\//g, placeholder),
            });
            if (folderPath) {
                const parts = folderPath.split("/").filter((part: string) => part.trim());
                for (const part of parts) {
                    targetDir = joinPath(settings.operatingSystem, targetDir, sanitizePath(part.replaceAll(placeholder, " "), settings.operatingSystem));
                }
            }
        }
        const expectedFilename = buildExpectedFilenameLikeBackend(track.name || "", displayArtist || "", track.album_name || "", displayAlbumArtist || "", track.release_date || "", baseFilenameTemplate, settings.trackNumber || false, trackNumberForTemplate, track.disc_number || 0);
        const outputPath = joinPath(settings.operatingSystem, targetDir, expectedFilename).toLowerCase();
        const entry: BatchConflictTrack = {
            index,
            name: track.name || "",
            artists: displayArtist || "",
            album: track.album_name || "",
            outputPath,
            playlistPosition,
        };
        const currentGroup = outputGroups.get(outputPath) || [];
        currentGroup.push(entry);
        outputGroups.set(outputPath, currentGroup);
    });
    const conflictGroups = Array.from(outputGroups.values()).filter((group) => group.length > 1);
    if (conflictGroups.length === 0) {
        return { conflictGroups: [], filenameOverrides: new Map() };
    }
    const previewLines = conflictGroups.slice(0, 3).flatMap((group, groupIndex) => {
        const fileName = group[0].outputPath.split(/[/\\]/).pop() || group[0].outputPath;
        const lines = [`${groupIndex + 1}. ${fileName}`];
        for (const item of group.slice(0, 3)) {
            lines.push(`   - ${item.name} | ${item.artists} | ${item.album || "Sin album"}`);
        }
        if (group.length > 3) {
            lines.push(`   - ... y ${group.length - 3} mas`);
        }
        return lines;
    });
    const shouldPreserveAll = window.confirm([
        `Se encontraron ${conflictGroups.length} grupo(s) de canciones que terminarian con el mismo nombre de archivo.`,
        "",
        ...previewLines,
        "",
        "Aceptar: descargar todas con nombres internos unicos, manteniendo el titulo normal en metadata y en la app.",
        "Cancelar: mantener el comportamiento actual y saltar las repetidas cuando choquen con el mismo archivo.",
    ].join("\n"));
    const filenameOverrides = new Map<number, string>();
    if (shouldPreserveAll) {
        for (const group of conflictGroups) {
            for (const item of group) {
                filenameOverrides.set(item.index, buildBatchDuplicateFilenameTemplate(baseFilenameTemplate, item.playlistPosition));
            }
        }
        toast.info("Se descargaran todas las versiones con nombres internos unicos y metadata original.");
    }
    else {
        toast.info("Se mantendra el comportamiento actual para canciones que generan el mismo archivo.");
    }
    return { conflictGroups, filenameOverrides };
}
export function useDownload(region: string) {
    const [downloadProgress, setDownloadProgress] = useState<number>(0);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadingTrack, setDownloadingTrack] = useState<string | null>(null);
    const [bulkDownloadType, setBulkDownloadType] = useState<"all" | "selected" | null>(null);
    const [downloadedTracks, setDownloadedTracks] = useState<Set<string>>(new Set());
    const [failedTracks, setFailedTracks] = useState<Set<string>>(new Set());
    const [skippedTracks, setSkippedTracks] = useState<Set<string>>(new Set());
    const [queuedTracks, setQueuedTracks] = useState<Set<string>>(new Set());
    const [currentDownloadInfo, setCurrentDownloadInfo] = useState<{
        name: string;
        artists: string;
    } | null>(null);
    const shouldStopDownloadRef = useRef(false);
    const singleTrackQueueRef = useRef<Array<[string, string | undefined, string | undefined, string | undefined, string | undefined, string | undefined, number | undefined, number | undefined, string | undefined, string | undefined, string | undefined, number | undefined, number | undefined, number | undefined, number | undefined, string | undefined, string | undefined]>>([]);
    const singleTrackProcessingRef = useRef(false);
    const downloadWithAutoFallback = async (id: string, settings: any, trackName?: string, artistName?: string, albumName?: string, playlistName?: string, position?: number, spotifyId?: string, durationMs?: number, releaseYear?: string, albumArtist?: string, releaseDate?: string, coverUrl?: string, spotifyTrackNumber?: number, spotifyDiscNumber?: number, spotifyTotalTracks?: number, spotifyTotalDiscs?: number, copyright?: string, publisher?: string) => {
        const service = settings.downloader;
        const baseFilenameTemplate = settings.filenameTemplate || "{title} - {artist}";
        let filenameTemplateForRequest = baseFilenameTemplate;
        const query = trackName && artistName ? `${trackName} ${artistName} ` : undefined;
        const os = settings.operatingSystem;
        let outputDir = settings.downloadPath;
        let useAlbumTrackNumber = false;
        const placeholder = "__SLASH_PLACEHOLDER__";
        let finalReleaseDate = releaseDate;
        let finalTrackNumber = spotifyTrackNumber || 0;
        if (spotifyId) {
            try {
                const trackURL = `https://open.spotify.com/track/${spotifyId}`;
                const trackMetadata = await fetchSpotifyMetadata(trackURL, false, 0, 10);
                if ("track" in trackMetadata && trackMetadata.track) {
                    if (trackMetadata.track.release_date) {
                        finalReleaseDate = trackMetadata.track.release_date;
                    }
                    if (trackMetadata.track.track_number > 0) {
                        finalTrackNumber = trackMetadata.track.track_number;
                    }
                }
            }
            catch (err) {
            }
        }
        const yearValue = releaseYear || finalReleaseDate?.substring(0, 4);
        const hasSubfolder = settings.folderTemplate && settings.folderTemplate.trim() !== "";
        const trackNumberForTemplate = (hasSubfolder && finalTrackNumber > 0) ? finalTrackNumber : (position || 0);
        if (hasSubfolder) {
            useAlbumTrackNumber = true;
        }
        const displayArtist = settings.useFirstArtistOnly && artistName
            ? getFirstArtist(artistName)
            : artistName;
        const displayAlbumArtist = settings.useFirstArtistOnly && albumArtist
            ? getFirstArtist(albumArtist)
            : albumArtist;
        const templateData: TemplateData = {
            artist: displayArtist?.replace(/\//g, placeholder),
            album: albumName?.replace(/\//g, placeholder),
            album_artist: displayAlbumArtist?.replace(/\//g, placeholder) || displayArtist?.replace(/\//g, placeholder),
            title: trackName?.replace(/\//g, placeholder),
            track: trackNumberForTemplate,
            year: yearValue,
            date: releaseDate,
            playlist: playlistName?.replace(/\//g, placeholder),
        };
        const folderTemplate = settings.folderTemplate || "";
        const useAlbumSubfolder = folderTemplate.includes("{album}") || folderTemplate.includes("{album_artist}") || folderTemplate.includes("{playlist}");
        if (settings.createPlaylistFolder && playlistName && !useAlbumSubfolder) {
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
        const serviceForCheck = service === "auto" ? "flac" : (service === "tidal" ? "flac" : (service === "qobuz" ? "flac" : "flac"));
        const { AddToDownloadQueue } = await import("../../wailsjs/go/main/App");
        const itemID = await AddToDownloadQueue(id, trackName || "", displayArtist || "", albumName || "");
        if (trackName && artistName) {
            try {
                const expectedFilename = buildExpectedFilenameLikeBackend(trackName, displayArtist || "", albumName || "", displayAlbumArtist || "", finalReleaseDate || releaseDate || "", filenameTemplateForRequest, settings.trackNumber || false, trackNumberForTemplate, spotifyDiscNumber || 0);
                const checkRequest: CheckFileExistenceRequest = {
                    spotify_id: spotifyId || id,
                    track_name: trackName,
                    artist_name: displayArtist || "",
                    album_name: albumName,
                    album_artist: displayAlbumArtist,
                    release_date: finalReleaseDate || releaseDate,
                    track_number: finalTrackNumber || spotifyTrackNumber || 0,
                    disc_number: spotifyDiscNumber || 0,
                    position: trackNumberForTemplate,
                    use_album_track_number: useAlbumTrackNumber,
                    filename_format: filenameTemplateForRequest,
                    include_track_number: settings.trackNumber || false,
                    audio_format: serviceForCheck,
                };
                const existenceResults = await CheckFilesExistence(outputDir, settings.downloadPath, [checkRequest]);
                if (existenceResults.length > 0 && existenceResults[0].exists) {
                    const conflictingPath = existenceResults[0].file_path || "";
                    const versionReference = {
                        trackName,
                        artistName: displayArtist || artistName,
                        albumName,
                        albumArtist: displayAlbumArtist,
                        releaseDate: finalReleaseDate || releaseDate,
                        spotifyTrackNumber: finalTrackNumber || spotifyTrackNumber,
                        spotifyDiscNumber,
                        spotifyTotalTracks,
                        spotifyTotalDiscs,
                        coverUrl,
                    };
                    const { exactMatchPath, detectedDifferences } = await findExistingVersionMatches(outputDir, expectedFilename, versionReference);
                    if (exactMatchPath) {
                        await SkipDownloadItem(itemID, exactMatchPath);
                        return {
                            success: true,
                            message: "File already exists",
                            file: exactMatchPath,
                            already_exists: true,
                        };
                    }
                    const differences = detectedDifferences;
                    const shouldDownloadAsVariant = window.confirm([
                        "Se encontro una version parecida, pero no es exactamente la misma.",
                        "",
                        `Cambios detectados: ${differences.length > 0 ? differences.join(", ") : "metadata diferente"}`,
                        `Titulo: ${trackName || "Sin titulo"}`,
                        `Artista: ${displayArtist || artistName || "Sin artista"}`,
                        `Album: ${albumName || "Sin album"}`,
                        "",
                        "Aceptar: descargar tambien esta variante con nombre interno unico.",
                        "Cancelar: omitir esta variante.",
                    ].join("\n"));
                    if (!shouldDownloadAsVariant) {
                        await SkipDownloadItem(itemID, conflictingPath);
                        return {
                            success: true,
                            message: "Se omitio la variante detectada",
                            file: conflictingPath,
                            already_exists: true,
                        };
                    }
                    filenameTemplateForRequest = buildSingleTrackDuplicateFilenameTemplate(baseFilenameTemplate, spotifyId, id);
                    toast.info("Se descargara esta version con un nombre interno unico, manteniendo el titulo original en la app.");
                }
            }
            catch (err) {
                console.warn("File existence check failed:", err);
            }
        }
        if (service === "auto") {
            let streamingURLs: any = null;
            if (spotifyId) {
                try {
                    const { GetStreamingURLs } = await import("../../wailsjs/go/main/App");
                    const urlsJson = await GetStreamingURLs(spotifyId, region);
                    streamingURLs = JSON.parse(urlsJson);
                }
                catch (err) {
                    console.error("Failed to get streaming URLs:", err);
                }
            }
            const durationSeconds = durationMs ? Math.round(durationMs / 1000) : undefined;
            const order = (settings.autoOrder || "tidal-amazon-qobuz").split("-");
            let lastResponse: any = { success: false, error: "No matching services found" };
            const fallbackErrors: string[] = [];
            const is24Bit = (settings.autoQuality || "24") === "24";
            const tidalQuality = is24Bit ? "HI_RES_LOSSLESS" : "LOSSLESS";
            const qobuzQuality = is24Bit ? "27" : "6";
            for (const s of order) {
                if (s === "tidal" && streamingURLs?.tidal_url) {
                    try {
                        logger.debug(`trying tidal for: ${trackName} - ${artistName}`);
                        const response = await downloadTrack({
                            service: "tidal",
                            query,
                            track_name: trackName,
                            artist_name: displayArtist,
                            album_name: albumName,
                            album_artist: displayAlbumArtist,
                            release_date: finalReleaseDate || releaseDate,
                            cover_url: coverUrl,
                            output_dir: outputDir,
                            filename_format: filenameTemplateForRequest,
                            track_number: settings.trackNumber,
                            position,
                            use_album_track_number: useAlbumTrackNumber,
                            spotify_id: spotifyId,
                            embed_lyrics: settings.embedLyrics,
                            embed_max_quality_cover: settings.embedMaxQualityCover,
                            service_url: streamingURLs.tidal_url,
                            duration: durationSeconds,
                            item_id: itemID,
                            audio_format: tidalQuality,
                            spotify_track_number: spotifyTrackNumber,
                            spotify_disc_number: spotifyDiscNumber,
                            spotify_total_tracks: spotifyTotalTracks,
                            spotify_total_discs: spotifyTotalDiscs,
                            copyright: copyright,
                            publisher: publisher,
                            use_first_artist_only: settings.useFirstArtistOnly,
                            use_single_genre: settings.useSingleGenre,
                            embed_genre: settings.embedGenre,
                        });
                        if (response.success) {
                            logger.success(`tidal: ${trackName} - ${artistName}`);
                            return response;
                        }
                        const errMsg = response.error || response.message || "Failed";
                        fallbackErrors.push(`[Tidal] ${errMsg}`);
                        lastResponse = response;
                        logger.warning(`tidal failed, trying next...`);
                    }
                    catch (err) {
                        logger.error(`tidal error: ${err}`);
                        fallbackErrors.push(`[Tidal] ${String(err)}`);
                        lastResponse = { success: false, error: String(err) };
                    }
                }
                else if (s === "amazon" && streamingURLs?.amazon_url) {
                    try {
                        logger.debug(`trying amazon for: ${trackName} - ${artistName}`);
                        const response = await downloadTrack({
                            service: "amazon",
                            query,
                            track_name: trackName,
                            artist_name: displayArtist,
                            album_name: albumName,
                            album_artist: displayAlbumArtist,
                            release_date: finalReleaseDate || releaseDate,
                            cover_url: coverUrl,
                            output_dir: outputDir,
                            filename_format: filenameTemplateForRequest,
                            track_number: settings.trackNumber,
                            position,
                            use_album_track_number: useAlbumTrackNumber,
                            spotify_id: spotifyId,
                            embed_lyrics: settings.embedLyrics,
                            embed_max_quality_cover: settings.embedMaxQualityCover,
                            service_url: streamingURLs.amazon_url,
                            item_id: itemID,
                            spotify_track_number: spotifyTrackNumber,
                            spotify_disc_number: spotifyDiscNumber,
                            spotify_total_tracks: spotifyTotalTracks,
                            spotify_total_discs: spotifyTotalDiscs,
                            copyright: copyright,
                            publisher: publisher,
                            use_single_genre: settings.useSingleGenre,
                            embed_genre: settings.embedGenre,
                        });
                        if (response.success) {
                            logger.success(`amazon: ${trackName} - ${artistName}`);
                            return response;
                        }
                        const errMsg = response.error || response.message || "Failed";
                        fallbackErrors.push(`[Amazon] ${errMsg}`);
                        lastResponse = response;
                        logger.warning(`amazon failed, trying next...`);
                    }
                    catch (err) {
                        logger.error(`amazon error: ${err}`);
                        fallbackErrors.push(`[Amazon] ${String(err)}`);
                        lastResponse = { success: false, error: String(err) };
                    }
                }
                else if (s === "qobuz") {
                    try {
                        logger.debug(`trying qobuz for: ${trackName} - ${artistName}`);
                        const response = await downloadTrack({
                            service: "qobuz",
                            query,
                            track_name: trackName,
                            artist_name: displayArtist,
                            album_name: albumName,
                            album_artist: displayAlbumArtist,
                            release_date: finalReleaseDate || releaseDate,
                            cover_url: coverUrl,
                            output_dir: outputDir,
                            filename_format: filenameTemplateForRequest,
                            track_number: settings.trackNumber,
                            position: trackNumberForTemplate,
                            use_album_track_number: useAlbumTrackNumber,
                            spotify_id: spotifyId,
                            embed_lyrics: settings.embedLyrics,
                            embed_max_quality_cover: settings.embedMaxQualityCover,
                            item_id: itemID,
                            audio_format: qobuzQuality,
                            spotify_track_number: spotifyTrackNumber,
                            spotify_disc_number: spotifyDiscNumber,
                            spotify_total_tracks: spotifyTotalTracks,
                            spotify_total_discs: spotifyTotalDiscs,
                            copyright: copyright,
                            publisher: publisher,
                            use_single_genre: settings.useSingleGenre,
                            embed_genre: settings.embedGenre,
                        });
                        if (response.success) {
                            logger.success(`qobuz: ${trackName} - ${artistName}`);
                            return response;
                        }
                        const errMsg = response.error || response.message || "Failed";
                        fallbackErrors.push(`[Qobuz] ${errMsg}`);
                        lastResponse = response;
                        logger.warning(`qobuz failed, trying next...`);
                    }
                    catch (err) {
                        logger.error(`qobuz error: ${err}`);
                        fallbackErrors.push(`[Qobuz] ${String(err)}`);
                        lastResponse = { success: false, error: String(err) };
                    }
                }
            }
            if (itemID) {
                const { MarkDownloadItemFailed } = await import("../../wailsjs/go/main/App");
                const finalError = fallbackErrors.length > 0 ? fallbackErrors.join(" | ") : (lastResponse.error || "All services failed");
                await MarkDownloadItemFailed(itemID, finalError);
            }
            return lastResponse;
        }
        const durationSecondsForFallback = durationMs ? Math.round(durationMs / 1000) : undefined;
        let audioFormat: string | undefined;
        if (service === "tidal") {
            audioFormat = settings.tidalQuality || "LOSSLESS";
        }
        else if (service === "qobuz") {
            audioFormat = settings.qobuzQuality || "6";
        }
        else if (service === "deezer") {
            audioFormat = "flac";
        }
        logger.debug(`trying ${service} for: ${trackName} - ${artistName}`);
        const singleServiceResponse = await downloadTrack({
            service: service as "tidal" | "qobuz" | "amazon",
            query,
            track_name: trackName,
            artist_name: displayArtist,
            album_name: albumName,
            album_artist: displayAlbumArtist,
            release_date: finalReleaseDate || releaseDate,
            cover_url: coverUrl,
            output_dir: outputDir,
            filename_format: filenameTemplateForRequest,
            track_number: settings.trackNumber,
            position: trackNumberForTemplate,
            use_album_track_number: useAlbumTrackNumber,
            spotify_id: spotifyId,
            embed_lyrics: settings.embedLyrics,
            embed_max_quality_cover: settings.embedMaxQualityCover,
            duration: durationSecondsForFallback,
            item_id: itemID,
            audio_format: audioFormat,
            spotify_track_number: spotifyTrackNumber,
            spotify_disc_number: spotifyDiscNumber,
            spotify_total_tracks: spotifyTotalTracks,
            spotify_total_discs: spotifyTotalDiscs,
            copyright: copyright,
            publisher: publisher,
            use_single_genre: settings.useSingleGenre,
            embed_genre: settings.embedGenre,
        });
        if (!singleServiceResponse.success && itemID) {
            const { MarkDownloadItemFailed } = await import("../../wailsjs/go/main/App");
            await MarkDownloadItemFailed(itemID, singleServiceResponse.error || "Download failed");
        }
        return singleServiceResponse;
    };
    const downloadWithItemID = async (settings: any, itemID: string, trackName?: string, artistName?: string, albumName?: string, folderName?: string, position?: number, spotifyId?: string, durationMs?: number, isAlbum?: boolean, releaseYear?: string, albumArtist?: string, releaseDate?: string, coverUrl?: string, spotifyTrackNumber?: number, spotifyDiscNumber?: number, spotifyTotalTracks?: number, spotifyTotalDiscs?: number, copyright?: string, publisher?: string) => {
        const service = settings.downloader;
        const query = trackName && artistName ? `${trackName} ${artistName}` : undefined;
        const os = settings.operatingSystem;
        let outputDir = settings.downloadPath;
        let useAlbumTrackNumber = false;
        const placeholder = "__SLASH_PLACEHOLDER__";
        let finalReleaseDate = releaseDate;
        let finalTrackNumber = spotifyTrackNumber || 0;
        if (spotifyId) {
            try {
                const trackURL = `https://open.spotify.com/track/${spotifyId}`;
                const trackMetadata = await fetchSpotifyMetadata(trackURL, false, 0, 10);
                if ("track" in trackMetadata && trackMetadata.track) {
                    if (trackMetadata.track.release_date) {
                        finalReleaseDate = trackMetadata.track.release_date;
                    }
                    if (trackMetadata.track.track_number > 0) {
                        finalTrackNumber = trackMetadata.track.track_number;
                    }
                }
            }
            catch (err) {
            }
        }
        const yearValue = releaseYear || finalReleaseDate?.substring(0, 4);
        const hasSubfolder = settings.folderTemplate && settings.folderTemplate.trim() !== "";
        const trackNumberForTemplate = (hasSubfolder && finalTrackNumber > 0) ? finalTrackNumber : (position || 0);
        const displayArtist = settings.useFirstArtistOnly && artistName
            ? getFirstArtist(artistName)
            : artistName;
        const displayAlbumArtist = settings.useFirstArtistOnly && albumArtist
            ? getFirstArtist(albumArtist)
            : albumArtist;
        const templateData: TemplateData = {
            artist: displayArtist?.replace(/\//g, placeholder),
            album: albumName?.replace(/\//g, placeholder),
            album_artist: displayAlbumArtist?.replace(/\//g, placeholder) || displayArtist?.replace(/\//g, placeholder),
            title: trackName?.replace(/\//g, placeholder),
            track: trackNumberForTemplate,
            year: yearValue,
            date: releaseDate,
            playlist: folderName?.replace(/\//g, placeholder),
        };
        const folderTemplate = settings.folderTemplate || "";
        const useAlbumSubfolder = folderTemplate.includes("{album}") || folderTemplate.includes("{album_artist}") || folderTemplate.includes("{playlist}");
        if (settings.createPlaylistFolder && folderName && (!isAlbum || !useAlbumSubfolder)) {
            outputDir = joinPath(os, outputDir, sanitizePath(folderName.replace(/\//g, " "), os));
        }
        if (settings.folderTemplate) {
            const folderPath = parseTemplate(settings.folderTemplate, templateData);
            if (folderPath) {
                const parts = folderPath.split("/").filter(p => p.trim());
                for (const part of parts) {
                    const sanitizedPart = part.replace(new RegExp(placeholder, "g"), " ");
                    outputDir = joinPath(os, outputDir, sanitizePath(sanitizedPart, os));
                }
            }
        }
        if (service === "auto") {
            let streamingURLs: any = null;
            if (spotifyId) {
                try {
                    const { GetStreamingURLs } = await import("../../wailsjs/go/main/App");
                    const urlsJson = await GetStreamingURLs(spotifyId, region);
                    streamingURLs = JSON.parse(urlsJson);
                }
                catch (err) {
                    console.error("Failed to get streaming URLs:", err);
                }
            }
            const durationSeconds = durationMs ? Math.round(durationMs / 1000) : undefined;
            const order = (settings.autoOrder || "tidal-amazon-qobuz").split("-");
            let lastResponse: any = { success: false, error: "No matching services found" };
            const fallbackErrors: string[] = [];
            const is24Bit = (settings.autoQuality || "24") === "24";
            const tidalQuality = is24Bit ? "HI_RES_LOSSLESS" : "LOSSLESS";
            const qobuzQuality = is24Bit ? "27" : "6";
            for (const s of order) {
                if (s === "tidal" && streamingURLs?.tidal_url) {
                    try {
                        logger.debug(`trying tidal for: ${trackName} - ${artistName}`);
                        const response = await downloadTrack({
                            service: "tidal",
                            query,
                            track_name: trackName,
                            artist_name: displayArtist,
                            album_name: albumName,
                            album_artist: displayAlbumArtist,
                            release_date: finalReleaseDate || releaseDate,
                            cover_url: coverUrl,
                            output_dir: outputDir,
                            filename_format: settings.filenameTemplate,
                            track_number: settings.trackNumber,
                            position,
                            use_album_track_number: useAlbumTrackNumber,
                            spotify_id: spotifyId,
                            embed_lyrics: settings.embedLyrics,
                            embed_max_quality_cover: settings.embedMaxQualityCover,
                            service_url: streamingURLs.tidal_url,
                            duration: durationSeconds,
                            item_id: itemID,
                            audio_format: tidalQuality,
                            spotify_track_number: spotifyTrackNumber,
                            spotify_disc_number: spotifyDiscNumber,
                            spotify_total_tracks: spotifyTotalTracks,
                            spotify_total_discs: spotifyTotalDiscs,
                            copyright: copyright,
                            publisher: publisher,
                            use_first_artist_only: settings.useFirstArtistOnly,
                            use_single_genre: settings.useSingleGenre,
                            embed_genre: settings.embedGenre,
                        });
                        if (response.success) {
                            logger.success(`tidal: ${trackName} - ${artistName}`);
                            return response;
                        }
                        const errMsg = response.error || response.message || "Failed";
                        fallbackErrors.push(`[Tidal] ${errMsg}`);
                        lastResponse = response;
                        logger.warning(`tidal failed, trying next...`);
                    }
                    catch (err) {
                        logger.error(`tidal error: ${err}`);
                        fallbackErrors.push(`[Tidal] ${String(err)}`);
                        lastResponse = { success: false, error: String(err) };
                    }
                }
                else if (s === "amazon" && streamingURLs?.amazon_url) {
                    try {
                        logger.debug(`trying amazon for: ${trackName} - ${artistName}`);
                        const response = await downloadTrack({
                            service: "amazon",
                            query,
                            track_name: trackName,
                            artist_name: displayArtist,
                            album_name: albumName,
                            album_artist: displayAlbumArtist,
                            release_date: finalReleaseDate || releaseDate,
                            cover_url: coverUrl,
                            output_dir: outputDir,
                            filename_format: settings.filenameTemplate,
                            track_number: settings.trackNumber,
                            position,
                            use_album_track_number: useAlbumTrackNumber,
                            spotify_id: spotifyId,
                            embed_lyrics: settings.embedLyrics,
                            embed_max_quality_cover: settings.embedMaxQualityCover,
                            service_url: streamingURLs.amazon_url,
                            item_id: itemID,
                            spotify_track_number: spotifyTrackNumber,
                            spotify_disc_number: spotifyDiscNumber,
                            spotify_total_tracks: spotifyTotalTracks,
                            spotify_total_discs: spotifyTotalDiscs,
                            copyright: copyright,
                            publisher: publisher,
                            use_first_artist_only: settings.useFirstArtistOnly,
                            use_single_genre: settings.useSingleGenre,
                            embed_genre: settings.embedGenre,
                        });
                        if (response.success) {
                            logger.success(`amazon: ${trackName} - ${artistName}`);
                            return response;
                        }
                        const errMsg = response.error || response.message || "Failed";
                        fallbackErrors.push(`[Amazon] ${errMsg}`);
                        lastResponse = response;
                        logger.warning(`amazon failed, trying next...`);
                    }
                    catch (err) {
                        logger.error(`amazon error: ${err}`);
                        fallbackErrors.push(`[Amazon] ${String(err)}`);
                        lastResponse = { success: false, error: String(err) };
                    }
                }
                else if (s === "qobuz") {
                    try {
                        logger.debug(`trying qobuz for: ${trackName} - ${artistName}`);
                        const response = await downloadTrack({
                            service: "qobuz",
                            query,
                            track_name: trackName,
                            artist_name: displayArtist,
                            album_name: albumName,
                            album_artist: displayAlbumArtist,
                            release_date: finalReleaseDate || releaseDate,
                            cover_url: coverUrl,
                            output_dir: outputDir,
                            filename_format: settings.filenameTemplate,
                            track_number: settings.trackNumber,
                            position: trackNumberForTemplate,
                            use_album_track_number: useAlbumTrackNumber,
                            spotify_id: spotifyId,
                            embed_lyrics: settings.embedLyrics,
                            embed_max_quality_cover: settings.embedMaxQualityCover,
                            duration: durationSeconds,
                            item_id: itemID,
                            audio_format: qobuzQuality,
                            spotify_track_number: spotifyTrackNumber,
                            spotify_disc_number: spotifyDiscNumber,
                            spotify_total_tracks: spotifyTotalTracks,
                            spotify_total_discs: spotifyTotalDiscs,
                            copyright: copyright,
                            publisher: publisher,
                            use_first_artist_only: settings.useFirstArtistOnly,
                            use_single_genre: settings.useSingleGenre,
                            embed_genre: settings.embedGenre,
                        });
                        if (response.success) {
                            logger.success(`qobuz: ${trackName} - ${artistName}`);
                            return response;
                        }
                        const errMsg = response.error || response.message || "Failed";
                        fallbackErrors.push(`[Qobuz] ${errMsg}`);
                        lastResponse = response;
                        logger.warning(`qobuz failed, trying next...`);
                    }
                    catch (err) {
                        logger.error(`qobuz error: ${err}`);
                        fallbackErrors.push(`[Qobuz] ${String(err)}`);
                        lastResponse = { success: false, error: String(err) };
                    }
                }
            }
            if (!lastResponse.success && itemID) {
                const { MarkDownloadItemFailed } = await import("../../wailsjs/go/main/App");
                const finalError = fallbackErrors.length > 0 ? fallbackErrors.join(" | ") : (lastResponse.error || "All services failed");
                await MarkDownloadItemFailed(itemID, finalError);
            }
            return lastResponse;
        }
        const durationSecondsForFallback = durationMs ? Math.round(durationMs / 1000) : undefined;
        let audioFormat: string | undefined;
        if (service === "tidal") {
            audioFormat = settings.tidalQuality || "LOSSLESS";
        }
        else if (service === "qobuz") {
            audioFormat = settings.qobuzQuality || "6";
        }
        const singleServiceResponse = await downloadTrack({
            service: service as "tidal" | "qobuz" | "amazon",
            query,
            track_name: trackName,
            artist_name: displayArtist,
            album_name: albumName,
            album_artist: displayAlbumArtist,
            release_date: finalReleaseDate || releaseDate,
            cover_url: coverUrl,
            output_dir: outputDir,
            filename_format: settings.filenameTemplate,
            track_number: settings.trackNumber,
            position: trackNumberForTemplate,
            use_album_track_number: useAlbumTrackNumber,
            spotify_id: spotifyId,
            embed_lyrics: settings.embedLyrics,
            embed_max_quality_cover: settings.embedMaxQualityCover,
            duration: durationSecondsForFallback,
            item_id: itemID,
            audio_format: audioFormat,
            spotify_track_number: spotifyTrackNumber,
            spotify_disc_number: spotifyDiscNumber,
            spotify_total_tracks: spotifyTotalTracks,
            spotify_total_discs: spotifyTotalDiscs,
            copyright: copyright,
            publisher: publisher,
            use_first_artist_only: settings.useFirstArtistOnly,
            use_single_genre: settings.useSingleGenre,
            embed_genre: settings.embedGenre,
        });
        if (!singleServiceResponse.success && itemID) {
            const { MarkDownloadItemFailed } = await import("../../wailsjs/go/main/App");
            await MarkDownloadItemFailed(itemID, singleServiceResponse.error || "Download failed");
        }
        return singleServiceResponse;
    };
    const processSingleTrackQueue = async () => {
        if (singleTrackProcessingRef.current) {
            return;
        }
        singleTrackProcessingRef.current = true;
        try {
            while (singleTrackQueueRef.current.length > 0) {
                const [id, trackName, artistName, albumName, spotifyId, playlistName, durationMs, position, albumArtist, releaseDate, coverUrl, spotifyTrackNumber, spotifyDiscNumber, spotifyTotalTracks, spotifyTotalDiscs, copyright, publisher] = singleTrackQueueRef.current.shift()!;
                const settings = getSettings();
                const displayArtist = settings.useFirstArtistOnly && artistName ? getFirstArtist(artistName) : artistName;
                logger.info(`starting download: ${trackName} - ${displayArtist}`);
                setQueuedTracks((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
                setDownloadingTrack(id);
                try {
                    const releaseYear = releaseDate?.substring(0, 4);
                    const response = await downloadWithAutoFallback(id, settings, trackName, artistName, albumName, playlistName, position, spotifyId, durationMs, releaseYear, albumArtist || "", releaseDate, coverUrl, spotifyTrackNumber, spotifyDiscNumber, spotifyTotalTracks, spotifyTotalDiscs, copyright, publisher);
                    if (response.success) {
                        if (response.already_exists) {
                            toast.info(response.message);
                            setSkippedTracks((prev) => new Set(prev).add(id));
                        }
                        else {
                            toast.success(response.message);
                        }
                        setDownloadedTracks((prev) => new Set(prev).add(id));
                        setFailedTracks((prev) => {
                            const newSet = new Set(prev);
                            newSet.delete(id);
                            return newSet;
                        });
                    }
                    else {
                        toast.error(response.error || "Download failed");
                        setFailedTracks((prev) => new Set(prev).add(id));
                    }
                }
                catch (err) {
                    toast.error(err instanceof Error ? err.message : "Download failed");
                    setFailedTracks((prev) => new Set(prev).add(id));
                }
                finally {
                    setDownloadingTrack(null);
                }
            }
        }
        finally {
            singleTrackProcessingRef.current = false;
        }
    };
    const handleDownloadTrack = async (id: string, trackName?: string, artistName?: string, albumName?: string, spotifyId?: string, playlistName?: string, durationMs?: number, position?: number, albumArtist?: string, releaseDate?: string, coverUrl?: string, spotifyTrackNumber?: number, spotifyDiscNumber?: number, spotifyTotalTracks?: number, spotifyTotalDiscs?: number, copyright?: string, publisher?: string) => {
        if (!id) {
            toast.error("No ID found for this track");
            return;
        }
        if (downloadingTrack === id ||
            queuedTracks.has(id) ||
            singleTrackQueueRef.current.some((entry) => entry[0] === id)) {
            return;
        }
        singleTrackQueueRef.current.push([id, trackName, artistName, albumName, spotifyId, playlistName, durationMs, position, albumArtist, releaseDate, coverUrl, spotifyTrackNumber, spotifyDiscNumber, spotifyTotalTracks, spotifyTotalDiscs, copyright, publisher]);
        setQueuedTracks((prev) => new Set(prev).add(id));
        queueMicrotask(() => {
            void processSingleTrackQueue();
        });
    };
    const handleDownloadSelected = async (selectedTracks: string[], allTracks: TrackMetadata[], folderName?: string, isAlbum?: boolean) => {
        if (selectedTracks.length === 0) {
            toast.error("No tracks selected");
            return;
        }
        logger.info(`starting batch download: ${selectedTracks.length} selected tracks`);
        const settings = getSettings();
        setIsDownloading(true);
        setBulkDownloadType("selected");
        setDownloadProgress(0);
        let outputDir = settings.downloadPath;
        const os = settings.operatingSystem;
        const useAlbumTag = settings.folderTemplate?.includes("{album}");
        if (settings.createPlaylistFolder && folderName && (!isAlbum || !useAlbumTag)) {
            outputDir = joinPath(os, outputDir, sanitizePath(folderName.replace(/\//g, " "), os));
        }
        const selectedTrackObjects = selectedTracks
            .map((id) => allTracks.find((t) => t.spotify_id === id))
            .filter((t): t is TrackMetadata => t !== undefined);
        const conflictAnalysis = analyzeBatchFilenameConflicts(selectedTrackObjects, settings, folderName, isAlbum);
        logger.info(`checking existing files in parallel...`);
        const useAlbumTrackNumber = settings.folderTemplate?.includes("{album}") || false;
        const audioFormat = "flac";
        const existenceChecks = selectedTrackObjects.map((track, index) => {
            const displayArtist = settings.useFirstArtistOnly && track.artists ? getFirstArtist(track.artists) : track.artists;
            const displayAlbumArtist = settings.useFirstArtistOnly && track.album_artist ? getFirstArtist(track.album_artist) : track.album_artist;
            return {
                spotify_id: track.spotify_id || "",
                track_name: track.name || "",
                artist_name: displayArtist || "",
                album_name: track.album_name || "",
                album_artist: displayAlbumArtist || "",
                release_date: track.release_date || "",
                track_number: track.track_number || 0,
                disc_number: track.disc_number || 0,
                position: index + 1,
                use_album_track_number: useAlbumTrackNumber,
                filename_format: conflictAnalysis.filenameOverrides.get(index) || settings.filenameTemplate || "",
                include_track_number: settings.trackNumber || false,
                audio_format: audioFormat,
            };
        });
        const existenceResults = await CheckFilesExistence(outputDir, settings.downloadPath, existenceChecks);
        const existingSpotifyIDs = new Set<string>();
        const existingFilePaths = new Map<string, string>();
        const finalFilePaths = new Map<string, string>();
        for (const result of existenceResults) {
            if (result.exists) {
                existingSpotifyIDs.add(result.spotify_id);
                existingFilePaths.set(result.spotify_id, result.file_path || "");
                finalFilePaths.set(result.spotify_id, result.file_path || "");
            }
        }
        logger.info(`found ${existingSpotifyIDs.size} existing files`);
        const { AddToDownloadQueue } = await import("../../wailsjs/go/main/App");
        const itemIDs: string[] = [];
        for (const id of selectedTracks) {
            const track = allTracks.find((t) => t.spotify_id === id);
            if (!track)
                continue;
            const trackID = track.spotify_id || id;
            const displayArtist = settings.useFirstArtistOnly && track.artists ? getFirstArtist(track.artists) : track.artists;
            const itemID = await AddToDownloadQueue(trackID, track.name || "", displayArtist || "", track.album_name || "");
            itemIDs.push(itemID);
            if (existingSpotifyIDs.has(trackID)) {
                const filePath = existingFilePaths.get(trackID) || "";
                setTimeout(() => SkipDownloadItem(itemID, filePath), 10);
                setSkippedTracks((prev) => new Set(prev).add(id));
                setDownloadedTracks((prev) => new Set(prev).add(id));
            }
        }
        const tracksToDownload = selectedTrackObjects.filter((track) => {
            const trackID = track.spotify_id || "";
            return !existingSpotifyIDs.has(trackID);
        });
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = existingSpotifyIDs.size;
        const total = selectedTracks.length;
        setDownloadProgress(Math.round((skippedCount / total) * 100));
        for (let i = 0; i < tracksToDownload.length; i++) {
            if (shouldStopDownloadRef.current) {
                toast.info(`Download stopped. ${successCount} tracks downloaded, ${tracksToDownload.length - i} remaining.`);
                break;
            }
            const track = tracksToDownload[i];
            const id = track.spotify_id || "";
            const originalIndex = selectedTracks.indexOf(id);
            const itemID = itemIDs[originalIndex];
            setDownloadingTrack(id);
            const displayArtist = settings.useFirstArtistOnly && track.artists ? getFirstArtist(track.artists) : track.artists;
            setCurrentDownloadInfo({ name: track.name, artists: displayArtist || "" });
            try {
                const releaseYear = track.release_date?.substring(0, 4);
                const trackSettings = conflictAnalysis.filenameOverrides.has(originalIndex)
                    ? { ...settings, filenameTemplate: conflictAnalysis.filenameOverrides.get(originalIndex) }
                    : settings;
                const response = await downloadWithItemID(trackSettings, itemID, track.name, track.artists, track.album_name, folderName, originalIndex + 1, track.spotify_id, track.duration_ms, isAlbum, releaseYear, track.album_artist || "", track.release_date, track.images, track.track_number, track.disc_number, track.total_tracks, track.total_discs, track.copyright, track.publisher);
                if (response.success) {
                    if (response.already_exists) {
                        skippedCount++;
                        logger.info(`skipped: ${track.name} - ${displayArtist} (already exists)`);
                        setSkippedTracks((prev) => new Set(prev).add(id));
                    }
                    else {
                        successCount++;
                        logger.success(`downloaded: ${track.name} - ${displayArtist}`);
                    }
                    if (response.file) {
                        finalFilePaths.set(id, response.file);
                        finalFilePaths.set(track.spotify_id || id, response.file);
                    }
                    setDownloadedTracks((prev) => new Set(prev).add(id));
                    setFailedTracks((prev) => {
                        const newSet = new Set(prev);
                        newSet.delete(id);
                        return newSet;
                    });
                }
                else {
                    errorCount++;
                    logger.error(`failed: ${track.name} - ${displayArtist}`);
                    setFailedTracks((prev) => new Set(prev).add(id));
                }
            }
            catch (err) {
                errorCount++;
                logger.error(`error: ${track.name} - ${err}`);
                setFailedTracks((prev) => new Set(prev).add(id));
                if (itemID) {
                    const { MarkDownloadItemFailed } = await import("../../wailsjs/go/main/App");
                    await MarkDownloadItemFailed(itemID, err instanceof Error ? err.message : String(err));
                }
            }
            const completedCount = skippedCount + successCount + errorCount;
            setDownloadProgress(Math.min(100, Math.round((completedCount / total) * 100)));
        }
        setDownloadingTrack(null);
        setCurrentDownloadInfo(null);
        setIsDownloading(false);
        setBulkDownloadType(null);
        shouldStopDownloadRef.current = false;
        const { CancelAllQueuedItems } = await import("../../wailsjs/go/main/App");
        await CancelAllQueuedItems();
        if (settings.createM3u8File && folderName) {
            const paths = selectedTrackObjects.map((t) => finalFilePaths.get(t.spotify_id || "") || "").filter((p) => p !== "");
            if (paths.length > 0) {
                try {
                    logger.info(`creating m3u8 playlist: ${folderName}`);
                    await CreateM3U8File(folderName, outputDir, paths);
                    toast.success("M3U8 playlist created");
                }
                catch (err) {
                    logger.error(`failed to create m3u8 playlist: ${err}`);
                    toast.error(`Failed to create M3U8 playlist: ${err}`);
                }
            }
        }
        logger.info(`batch complete: ${successCount} downloaded, ${skippedCount} skipped, ${errorCount} failed`);
        if (errorCount === 0 && skippedCount === 0) {
            toast.success(`Downloaded ${successCount} tracks successfully`);
        }
        else if (errorCount === 0 && successCount === 0) {
            toast.info(`${skippedCount} tracks already exist`);
        }
        else if (errorCount === 0) {
            toast.info(`${successCount} downloaded, ${skippedCount} skipped`);
        }
        else {
            const parts = [];
            if (successCount > 0)
                parts.push(`${successCount} downloaded`);
            if (skippedCount > 0)
                parts.push(`${skippedCount} skipped`);
            parts.push(`${errorCount} failed`);
            toast.warning(parts.join(", "));
        }
    };
    const handleDownloadAll = async (tracks: TrackMetadata[], folderName?: string, isAlbum?: boolean) => {
        const tracksWithId = tracks.filter((track) => track.spotify_id);
        if (tracksWithId.length === 0) {
            toast.error("No tracks available for download");
            return;
        }
        logger.info(`starting batch download: ${tracksWithId.length} tracks`);
        const settings = getSettings();
        const conflictAnalysis = analyzeBatchFilenameConflicts(tracksWithId, settings, folderName, isAlbum);
        setIsDownloading(true);
        setBulkDownloadType("all");
        setDownloadProgress(0);
        let outputDir = settings.downloadPath;
        const os = settings.operatingSystem;
        const useAlbumTag = settings.folderTemplate?.includes("{album}");
        if (settings.createPlaylistFolder && folderName && (!isAlbum || !useAlbumTag)) {
            outputDir = joinPath(os, outputDir, sanitizePath(folderName.replace(/\//g, " "), os));
        }
        logger.info(`checking existing files in parallel...`);
        const useAlbumTrackNumber = settings.folderTemplate?.includes("{album}") || false;
        const audioFormat = "flac";
        const existenceChecks = tracksWithId.map((track, index) => {
            const displayArtist = settings.useFirstArtistOnly && track.artists ? getFirstArtist(track.artists) : track.artists;
            const displayAlbumArtist = settings.useFirstArtistOnly && track.album_artist ? getFirstArtist(track.album_artist) : track.album_artist;
            return {
                spotify_id: track.spotify_id || "",
                track_name: track.name || "",
                artist_name: displayArtist || "",
                album_name: track.album_name || "",
                album_artist: displayAlbumArtist || "",
                release_date: track.release_date || "",
                track_number: track.track_number || 0,
                disc_number: track.disc_number || 0,
                position: index + 1,
                use_album_track_number: useAlbumTrackNumber,
                filename_format: conflictAnalysis.filenameOverrides.get(index) || settings.filenameTemplate || "",
                include_track_number: settings.trackNumber || false,
                audio_format: audioFormat,
            };
        });
        const existenceResults = await CheckFilesExistence(outputDir, settings.downloadPath, existenceChecks);
        const finalFilePaths: string[] = new Array(tracksWithId.length).fill("");
        const existingSpotifyIDs = new Set<string>();
        const existingFilePaths = new Map<string, string>();
        for (let i = 0; i < existenceResults.length; i++) {
            const result = existenceResults[i];
            if (result.exists) {
                existingSpotifyIDs.add(result.spotify_id);
                existingFilePaths.set(result.spotify_id, result.file_path || "");
                finalFilePaths[i] = result.file_path || "";
            }
        }
        logger.info(`found ${existingSpotifyIDs.size} existing files`);
        const { AddToDownloadQueue } = await import("../../wailsjs/go/main/App");
        const itemIDs: string[] = [];
        for (const track of tracksWithId) {
            const displayArtist = settings.useFirstArtistOnly && track.artists ? getFirstArtist(track.artists) : track.artists;
            const itemID = await AddToDownloadQueue(track.spotify_id || "", track.name || "", displayArtist || "", track.album_name || "");
            itemIDs.push(itemID);
            const trackID = track.spotify_id || "";
            if (existingSpotifyIDs.has(trackID)) {
                const filePath = existingFilePaths.get(trackID) || "";
                setTimeout(() => SkipDownloadItem(itemID, filePath), 10);
                setSkippedTracks((prev: Set<string>) => new Set(prev).add(trackID));
                setDownloadedTracks((prev: Set<string>) => new Set(prev).add(trackID));
            }
        }
        const tracksToDownload = tracksWithId.filter((track) => {
            const trackID = track.spotify_id || "";
            return !existingSpotifyIDs.has(trackID);
        });
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = existingSpotifyIDs.size;
        const total = tracksWithId.length;
        setDownloadProgress(Math.round((skippedCount / total) * 100));
        for (let i = 0; i < tracksToDownload.length; i++) {
            if (shouldStopDownloadRef.current) {
                toast.info(`Download stopped. ${successCount} tracks downloaded, ${tracksToDownload.length - i} remaining.`);
                break;
            }
            const track = tracksToDownload[i];
            const originalIndex = tracksWithId.findIndex((t) => t.spotify_id === track.spotify_id);
            const itemID = itemIDs[originalIndex];
            const trackId = track.spotify_id || "";
            setDownloadingTrack(trackId);
            const displayArtist = settings.useFirstArtistOnly && track.artists ? getFirstArtist(track.artists) : track.artists;
            setCurrentDownloadInfo({ name: track.name || "", artists: displayArtist || "" });
            try {
                const releaseYear = track.release_date?.substring(0, 4);
                const trackSettings = conflictAnalysis.filenameOverrides.has(originalIndex)
                    ? { ...settings, filenameTemplate: conflictAnalysis.filenameOverrides.get(originalIndex) }
                    : settings;
                const response = await downloadWithItemID(trackSettings, itemID, track.name, track.artists, track.album_name, folderName, originalIndex + 1, track.spotify_id, track.duration_ms, isAlbum, releaseYear, track.album_artist || "", track.release_date, track.images, track.track_number, track.disc_number, track.total_tracks, track.total_discs, track.copyright, track.publisher);
                if (response.success) {
                    if (response.already_exists) {
                        skippedCount++;
                        logger.info(`skipped: ${track.name} - ${displayArtist} (already exists)`);
                        setSkippedTracks((prev) => new Set(prev).add(trackId));
                    }
                    else {
                        successCount++;
                        logger.success(`downloaded: ${track.name} - ${displayArtist}`);
                    }
                    setDownloadedTracks((prev) => new Set(prev).add(trackId));
                    setFailedTracks((prev) => {
                        const newSet = new Set(prev);
                        newSet.delete(trackId);
                        return newSet;
                    });
                    if (response.file) {
                        finalFilePaths[originalIndex] = response.file;
                    }
                }
                else {
                    errorCount++;
                    logger.error(`failed: ${track.name} - ${displayArtist}`);
                    setFailedTracks((prev) => new Set(prev).add(trackId));
                }
            }
            catch (err) {
                errorCount++;
                logger.error(`error: ${track.name} - ${err}`);
                setFailedTracks((prev) => new Set(prev).add(trackId));
                const { MarkDownloadItemFailed } = await import("../../wailsjs/go/main/App");
                await MarkDownloadItemFailed(itemID, err instanceof Error ? err.message : String(err));
            }
            const completedCount = skippedCount + successCount + errorCount;
            setDownloadProgress(Math.min(100, Math.round((completedCount / total) * 100)));
        }
        setDownloadingTrack(null);
        setCurrentDownloadInfo(null);
        setIsDownloading(false);
        setBulkDownloadType(null);
        shouldStopDownloadRef.current = false;
        const { CancelAllQueuedItems: CancelQueued } = await import("../../wailsjs/go/main/App");
        await CancelQueued();
        if (settings.createM3u8File && folderName) {
            try {
                logger.info(`creating m3u8 playlist: ${folderName}`);
                await CreateM3U8File(folderName, outputDir, finalFilePaths.filter(p => p !== ""));
                toast.success("M3U8 playlist created");
            }
            catch (err) {
                logger.error(`failed to create m3u8 playlist: ${err}`);
                toast.error(`Failed to create M3U8 playlist: ${err}`);
            }
        }
        logger.info(`batch complete: ${successCount} downloaded, ${skippedCount} skipped, ${errorCount} failed`);
        if (errorCount === 0 && skippedCount === 0) {
            toast.success(`Downloaded ${successCount} tracks successfully`);
        }
        else if (errorCount === 0 && successCount === 0) {
            toast.info(`${skippedCount} tracks already exist`);
        }
        else if (errorCount === 0) {
            toast.info(`${successCount} downloaded, ${skippedCount} skipped`);
        }
        else {
            const parts = [];
            if (successCount > 0)
                parts.push(`${successCount} downloaded`);
            if (skippedCount > 0)
                parts.push(`${skippedCount} skipped`);
            parts.push(`${errorCount} failed`);
            toast.warning(parts.join(", "));
        }
    };
    const handleStopDownload = () => {
        logger.info("download stopped by user");
        shouldStopDownloadRef.current = true;
        toast.info("Stopping download...");
    };
    const resetDownloadedTracks = () => {
        setDownloadedTracks(new Set());
        setFailedTracks(new Set());
        setSkippedTracks(new Set());
    };
    return {
        downloadProgress,
        isDownloading,
        downloadingTrack,
        bulkDownloadType,
        downloadedTracks,
        failedTracks,
        skippedTracks,
        queuedTracks,
        currentDownloadInfo,
        handleDownloadTrack,
        handleDownloadSelected,
        handleDownloadAll,
        handleStopDownload,
        resetDownloadedTracks,
    };
}
