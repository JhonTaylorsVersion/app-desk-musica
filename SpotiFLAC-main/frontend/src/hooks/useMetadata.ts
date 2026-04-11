import { useEffect, useRef, useState } from "react";
import { getSettings } from "@/lib/settings";
import { fetchSpotifyMetadata } from "@/lib/api";
import { toastWithSound as toast } from "@/lib/toast-with-sound";
import { logger } from "@/lib/logger";
import { AddFetchHistory } from "../../wailsjs/go/main/App";
import { EventsOff, EventsOn } from "../../wailsjs/runtime/runtime";
import type { SpotifyMetadataResponse } from "@/types/api";
function normalizeMetadataResponse(data: SpotifyMetadataResponse): SpotifyMetadataResponse {
    if ("playlist_info" in data) {
        const trackList = Array.isArray(data.track_list) ? data.track_list : [];
        return {
            ...data,
            playlist_info: {
                ...data.playlist_info,
                name: data.playlist_info?.name || data.playlist_info?.owner?.name || "",
                tracks: {
                    total: data.playlist_info?.tracks?.total ?? trackList.length,
                },
                followers: {
                    total: data.playlist_info?.followers?.total ?? 0,
                },
                owner: {
                    display_name: data.playlist_info?.owner?.display_name || data.playlist_info?.owner?.name || "",
                    name: data.playlist_info?.owner?.name || data.playlist_info?.name || "",
                    images: data.playlist_info?.owner?.images || "",
                },
                cover: data.playlist_info?.cover || "",
                description: data.playlist_info?.description || "",
            },
            track_list: trackList,
        };
    }
    if ("artist_info" in data) {
        return {
            ...data,
            artist_info: {
                ...data.artist_info,
                name: data.artist_info?.name || "",
                followers: data.artist_info?.followers ?? 0,
                genres: Array.isArray(data.artist_info?.genres) ? data.artist_info.genres : [],
                images: data.artist_info?.images || "",
                total_albums: data.artist_info?.total_albums ?? data.album_list?.length ?? 0,
            },
            album_list: Array.isArray(data.album_list) ? data.album_list : [],
            track_list: Array.isArray(data.track_list) ? data.track_list : [],
        };
    }
    if ("album_info" in data) {
        const trackList = Array.isArray(data.track_list) ? data.track_list : [];
        return {
            ...data,
            album_info: {
                ...data.album_info,
                total_tracks: data.album_info?.total_tracks ?? trackList.length,
                name: data.album_info?.name || "",
                release_date: data.album_info?.release_date || "",
                artists: data.album_info?.artists || "",
                images: data.album_info?.images || "",
            },
            track_list: trackList,
        };
    }
    return data;
}
export function useMetadata() {
    const [loading, setLoading] = useState(false);
    const [metadata, setMetadata] = useState<SpotifyMetadataResponse | null>(null);
    const loadingToastId = useRef<string | number | null>(null);
    const fetchedCount = useRef(0);
    const currentName = useRef("");
    const [showApiModal, setShowApiModal] = useState(false);
    const [showAlbumDialog, setShowAlbumDialog] = useState(false);
    const [selectedAlbum, setSelectedAlbum] = useState<{
        id: string;
        name: string;
        external_urls: string;
    } | null>(null);
    const [pendingArtistName, setPendingArtistName] = useState<string | null>(null);
    useEffect(() => {
        if (loading) {
            fetchedCount.current = 0;
            currentName.current = "";
            loadingToastId.current = toast.silentInfo("fetching metadata...", {
                duration: Infinity,
                description: "please wait while we retrieve the information"
            });
            return;
        }
        if (loadingToastId.current) {
            toast.dismiss(loadingToastId.current);
            loadingToastId.current = null;
        }
    }, [loading]);
    useEffect(() => {
        const handler = (data: any) => {
            if (!data) {
                return;
            }
            if (Array.isArray(data)) {
                fetchedCount.current += data.length;
                if (loadingToastId.current && currentName.current) {
                    toast.silentInfo(`fetching tracks for ${currentName.current.toLowerCase()}...`, {
                        id: loadingToastId.current,
                        description: `${fetchedCount.current.toLocaleString()} tracks fetched`
                    });
                }
            }
            else {
                const baseInfo = normalizeMetadataResponse(data);
                const name = "artist_info" in baseInfo ? baseInfo.artist_info.name :
                    "album_info" in baseInfo ? baseInfo.album_info.name :
                        "playlist_info" in baseInfo ? (baseInfo.playlist_info.name || baseInfo.playlist_info.owner?.name || "") : "";
                if (name) {
                    currentName.current = name;
                    if (loadingToastId.current) {
                        toast.silentInfo(`fetching tracks for ${name.toLowerCase()}...`, {
                            id: loadingToastId.current,
                            description: `${fetchedCount.current.toLocaleString()} tracks fetched`
                        });
                    }
                }
            }
            setMetadata(prev => {
                if (Array.isArray(data)) {
                    if (!prev || !("track_list" in prev)) {
                        return prev;
                    }
                    return {
                        ...prev,
                        track_list: [...prev.track_list, ...data]
                    };
                }
                if (prev && "track_list" in prev && prev.track_list.length > 0) {
                    return prev;
                }
                const baseInfo = normalizeMetadataResponse(data);
                if (!("track_list" in baseInfo)) {
                    baseInfo.track_list = [];
                }
                return baseInfo;
            });
        };
        EventsOn("metadata-stream", handler);
        return () => EventsOff("metadata-stream");
    }, []);
    const getUrlType = (url: string): string => {
        if (url.includes("/track/"))
            return "track";
        if (url.includes("/album/"))
            return "album";
        if (url.includes("/playlist/"))
            return "playlist";
        if (url.includes("/artist/"))
            return "artist";
        return "unknown";
    };
    const saveToHistory = async (url: string, data: SpotifyMetadataResponse) => {
        try {
            let name = "";
            let info = "";
            let image = "";
            let type = "unknown";
            if ("track" in data) {
                type = "track";
                name = data.track.name;
                info = data.track.artists;
                image = (data.track.images && data.track.images.length > 0) ? data.track.images : "";
            }
            else if ("album_info" in data) {
                type = "album";
                name = data.album_info.name;
                info = `${data.track_list.length} tracks`;
                image = data.album_info.images;
            }
            else if ("playlist_info" in data) {
                type = "playlist";
                if (data.playlist_info.name) {
                    name = data.playlist_info.name;
                }
                else if (data.playlist_info.owner?.name) {
                    name = data.playlist_info.owner.name;
                }
                info = `${data.playlist_info.tracks?.total ?? data.track_list?.length ?? 0} tracks`;
                image = data.playlist_info.cover || data.playlist_info.owner?.images || "";
            }
            else if ("artist_info" in data) {
                type = "artist";
                name = data.artist_info.name;
                info = `${data.artist_info.total_albums || data.album_list.length} albums`;
                image = data.artist_info.images;
            }
            const jsonStr = JSON.stringify(data);
            await AddFetchHistory({
                id: crypto.randomUUID(),
                url: url,
                type: type,
                name: name,
                info: info,
                image: image,
                data: jsonStr,
                timestamp: Math.floor(Date.now() / 1000)
            });
        }
        catch (err) {
            console.error("Failed to save fetch history:", err);
        }
    };
    const fetchMetadataDirectly = async (url: string) => {
        const urlType = getUrlType(url);
        logger.info(`fetching ${urlType} metadata...`);
        logger.debug(`url: ${url}`);
        setLoading(true);
        setMetadata(null);
        try {
            const startTime = Date.now();
            const timeout = urlType === "artist" ? 60 : 300;
            const rawData = await fetchSpotifyMetadata(url, true, 1.0, timeout);
            const data = normalizeMetadataResponse(rawData);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            if ("playlist_info" in data) {
                const playlistInfo = data.playlist_info;
                if (!playlistInfo.owner?.name && (playlistInfo.tracks?.total ?? 0) === 0 && data.track_list.length === 0) {
                    logger.warning("playlist appears to be empty or private");
                    toast.error("Playlist not found or may be private");
                    setMetadata(null);
                    return;
                }
            }
            else if ("album_info" in data) {
                const albumInfo = data.album_info;
                if (!albumInfo.name && albumInfo.total_tracks === 0 && data.track_list.length === 0) {
                    logger.warning("album appears to be empty or not found");
                    toast.error("Album not found or may be private");
                    setMetadata(null);
                    return;
                }
            }
            setMetadata(data);
            saveToHistory(url, data);
            if ("track" in data) {
                logger.success(`fetched track: ${data.track.name} - ${data.track.artists}`);
                logger.debug(`duration: ${data.track.duration_ms}ms`);
            }
            else if ("album_info" in data) {
                logger.success(`fetched album: ${data.album_info.name}`);
                logger.debug(`${data.track_list.length} tracks, released: ${data.album_info.release_date}`);
            }
            else if ("playlist_info" in data) {
                logger.success(`fetched playlist: ${data.track_list.length} tracks`);
                logger.debug(`by ${data.playlist_info.owner?.display_name || data.playlist_info.owner?.name || "unknown owner"}`);
            }
            else if ("artist_info" in data) {
                logger.success(`fetched artist: ${data.artist_info.name}`);
                logger.debug(`${data.album_list.length} albums, ${data.track_list.length} tracks`);
            }
            logger.info(`fetch completed in ${elapsed}s`);
            toast.success("Metadata fetched successfully");
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Failed to fetch metadata";
            logger.error(`fetch failed: ${errorMsg}`);
            const settings = getSettings();
            if (!settings.useSpotFetchAPI) {
                setShowApiModal(true);
            }
            else {
                toast.error(errorMsg);
            }
        }
        finally {
            setLoading(false);
        }
    };
    const loadFromCache = (cachedData: string) => {
        try {
            const data = normalizeMetadataResponse(JSON.parse(cachedData));
            setMetadata(data);
            toast.success("Loaded from cache");
        }
        catch (err) {
            console.error("Failed to load from cache:", err);
            toast.error("Failed to load from cache");
        }
    };
    const handleFetchMetadata = async (url: string) => {
        if (!url.trim()) {
            logger.warning("empty url provided");
            toast.error("Please enter a Spotify URL");
            return;
        }
        let urlToFetch = url.trim();
        const isArtistUrl = urlToFetch.includes("/artist/");
        if (isArtistUrl && !urlToFetch.includes("/discography")) {
            urlToFetch = urlToFetch.replace(/\/$/, "") + "/discography/all";
            logger.debug("converted to discography url");
        }
        if (isArtistUrl) {
            logger.info("artist url detected");
            setPendingArtistName(null);
            await fetchMetadataDirectly(urlToFetch);
        }
        else {
            await fetchMetadataDirectly(urlToFetch);
        }
        return urlToFetch;
    };
    const handleAlbumClick = (album: {
        id: string;
        name: string;
        external_urls: string;
    }) => {
        logger.debug(`album clicked: ${album.name}`);
        setSelectedAlbum(album);
        setShowAlbumDialog(true);
    };
    const handleArtistClick = async (artist: {
        id: string;
        name: string;
        external_urls: string;
    }) => {
        logger.debug(`artist clicked: ${artist.name}`);
        const artistUrl = artist.external_urls.replace(/\/$/, "") + "/discography/all";
        setPendingArtistName(artist.name);
        await fetchMetadataDirectly(artistUrl);
        return artistUrl;
    };
    const handleConfirmAlbumFetch = async () => {
        if (!selectedAlbum)
            return;
        const albumUrl = selectedAlbum.external_urls;
        logger.info(`fetching album: ${selectedAlbum.name}...`);
        logger.debug(`url: ${albumUrl}`);
        setShowAlbumDialog(false);
        setLoading(true);
        setMetadata(null);
        try {
            const startTime = Date.now();
            const rawData = await fetchSpotifyMetadata(albumUrl);
            const data = normalizeMetadataResponse(rawData);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            if ("album_info" in data) {
                const albumInfo = data.album_info;
                if (!albumInfo.name && albumInfo.total_tracks === 0 && data.track_list.length === 0) {
                    logger.warning("album appears to be empty or not found");
                    toast.error("Album not found or may be private");
                    setMetadata(null);
                    setSelectedAlbum(null);
                    return albumUrl;
                }
            }
            setMetadata(data);
            saveToHistory(albumUrl, data);
            if ("album_info" in data) {
                logger.success(`fetched album: ${data.album_info.name}`);
                logger.debug(`${data.track_list.length} tracks, released: ${data.album_info.release_date}`);
            }
            logger.info(`fetch completed in ${elapsed}s`);
            toast.success("Album metadata fetched successfully");
            return albumUrl;
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Failed to fetch album metadata";
            logger.error(`fetch failed: ${errorMsg}`);
            const settings = getSettings();
            if (!settings.useSpotFetchAPI) {
                setShowApiModal(true);
            }
            else {
                toast.error(errorMsg);
            }
        }
        finally {
            setLoading(false);
            setSelectedAlbum(null);
        }
    };
    return {
        loading,
        metadata,
        showAlbumDialog,
        setShowAlbumDialog,
        selectedAlbum,
        pendingArtistName,
        handleFetchMetadata,
        handleAlbumClick,
        handleConfirmAlbumFetch,
        handleArtistClick,
        loadFromCache,
        showApiModal,
        setShowApiModal,
        resetMetadata: () => setMetadata(null),
    };
}
