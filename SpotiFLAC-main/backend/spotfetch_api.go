package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

func shouldFallbackFromSpotFetch(spotifyType string, data interface{}) bool {
	isPlaceholder := func(value string) bool {
		normalized := strings.TrimSpace(strings.ToLower(value))
		switch normalized {
		case "",
			"cancion de spotify",
			"metadata pendiente de migrar",
			"spotiflac":
			return true
		default:
			return false
		}
	}

	switch payload := data.(type) {
	case TrackResponse:
		return payload.Track.SpotifyID == "" ||
			isPlaceholder(payload.Track.Name) ||
			isPlaceholder(payload.Track.Artists) ||
			isPlaceholder(payload.Track.AlbumName)
	case *AlbumResponsePayload:
		return isPlaceholder(payload.AlbumInfo.Name) ||
			(payload.AlbumInfo.TotalTracks == 0 && len(payload.TrackList) == 0)
	case PlaylistResponsePayload:
		return isPlaceholder(payload.PlaylistInfo.Owner.Name) ||
			isPlaceholder(payload.PlaylistInfo.Owner.DisplayName) ||
			(payload.PlaylistInfo.Tracks.Total == 0 && len(payload.TrackList) == 0 && spotifyType == "playlist")
	case *ArtistDiscographyPayload:
		return isPlaceholder(payload.ArtistInfo.Name) ||
			(payload.ArtistInfo.TotalAlbums == 0 && len(payload.AlbumList) == 0 && len(payload.TrackList) == 0)
	default:
		return true
	}
}

func streamTrackListChunks(ctx context.Context, tracks []AlbumTrackMetadata, callback MetadataCallback) error {
	if callback == nil || len(tracks) == 0 {
		return nil
	}

	const chunkSize = 25
	for start := 0; start < len(tracks); start += chunkSize {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		end := start + chunkSize
		if end > len(tracks) {
			end = len(tracks)
		}

		callback(tracks[start:end])

		if end < len(tracks) {
			time.Sleep(15 * time.Millisecond)
		}
	}

	return nil
}

func GetSpotifyDataWithAPI(ctx context.Context, spotifyURL string, useAPI bool, apiBaseURL string, batch bool, delay time.Duration, separator string, callback MetadataCallback) (interface{}, error) {
	if !useAPI || apiBaseURL == "" {
		return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
	}

	spotifyType, id := parseSpotifyURLToTypeAndID(spotifyURL)
	if spotifyType == "" || id == "" {
		return nil, fmt.Errorf("invalid Spotify URL: %s", spotifyURL)
	}

	if spotifyType == "artist" {
		return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
	}

	apiURL := fmt.Sprintf("%s/%s/%s", strings.TrimSuffix(apiBaseURL, "/"), spotifyType, id)

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
	}

	var data interface{}

	switch spotifyType {
	case "track":
		var trackResp TrackResponse
		if err := json.Unmarshal(bodyBytes, &trackResp); err != nil {
			return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
		}
		data = trackResp
	case "album":
		var albumResp AlbumResponsePayload
		if err := json.Unmarshal(bodyBytes, &albumResp); err != nil {
			return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
		}
		data = &albumResp
		if callback != nil && !shouldFallbackFromSpotFetch(spotifyType, data) {
			callback(&AlbumResponsePayload{
				AlbumInfo: albumResp.AlbumInfo,
				TrackList: []AlbumTrackMetadata{},
			})
			if err := streamTrackListChunks(ctx, albumResp.TrackList, callback); err != nil {
				return nil, err
			}
		}
	case "playlist":
		var playlistResp PlaylistResponsePayload
		if err := json.Unmarshal(bodyBytes, &playlistResp); err != nil {
			return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
		}
		data = playlistResp
		if callback != nil && !shouldFallbackFromSpotFetch(spotifyType, data) {
			callback(PlaylistResponsePayload{
				PlaylistInfo: playlistResp.PlaylistInfo,
				TrackList:    []AlbumTrackMetadata{},
			})
			if err := streamTrackListChunks(ctx, playlistResp.TrackList, callback); err != nil {
				return nil, err
			}
		}
	case "artist":
		var artistResp ArtistDiscographyPayload
		if err := json.Unmarshal(bodyBytes, &artistResp); err != nil {
			return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
		}
		data = &artistResp
		if callback != nil && !shouldFallbackFromSpotFetch(spotifyType, data) {
			callback(&ArtistDiscographyPayload{
				ArtistInfo: artistResp.ArtistInfo,
				AlbumList:  artistResp.AlbumList,
				TrackList:  []AlbumTrackMetadata{},
			})
			if err := streamTrackListChunks(ctx, artistResp.TrackList, callback); err != nil {
				return nil, err
			}
		}
	default:
		return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
	}

	if shouldFallbackFromSpotFetch(spotifyType, data) {
		return GetFilteredSpotifyData(ctx, spotifyURL, batch, delay, separator, callback)
	}

	if callback != nil {
		switch payload := data.(type) {
		case TrackResponse:
			t := payload.Track
			callback([]AlbumTrackMetadata{{
				SpotifyID:   t.SpotifyID,
				Artists:     t.Artists,
				Name:        t.Name,
				AlbumName:   t.AlbumName,
				AlbumArtist: t.AlbumArtist,
				DurationMS:  t.DurationMS,
				Images:      t.Images,
				ReleaseDate: t.ReleaseDate,
				TrackNumber: t.TrackNumber,
				TotalTracks: t.TotalTracks,
				DiscNumber:  t.DiscNumber,
				TotalDiscs:  t.TotalDiscs,
				ExternalURL: t.ExternalURL,
				Plays:       t.Plays,
				PreviewURL:  t.PreviewURL,
				IsExplicit:  t.IsExplicit,
			}})
		}
	}

	return data, nil
}

func parseSpotifyURLToTypeAndID(url string) (string, string) {

	if strings.HasPrefix(url, "spotify:") {
		parts := strings.Split(url, ":")
		if len(parts) >= 3 {
			return parts[1], parts[2]
		}
	}

	re := regexp.MustCompile(`spotify\.com/(track|album|playlist|artist)/([a-zA-Z0-9]+)`)
	matches := re.FindStringSubmatch(url)
	if len(matches) == 3 {
		return matches[1], matches[2]
	}

	return "", ""
}
