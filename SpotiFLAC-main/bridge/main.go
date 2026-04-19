package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/afkarxyz/SpotiFLAC/backend"
)

type DownloadRequest struct {
	Service              string `json:"service"`
	Query                string `json:"query,omitempty"`
	TrackName            string `json:"track_name,omitempty"`
	ArtistName           string `json:"artist_name,omitempty"`
	AlbumName            string `json:"album_name,omitempty"`
	AlbumArtist          string `json:"album_artist,omitempty"`
	ReleaseDate          string `json:"release_date,omitempty"`
	CoverURL             string `json:"cover_url,omitempty"`
	ApiURL               string `json:"api_url,omitempty"`
	OutputDir            string `json:"output_dir,omitempty"`
	AudioFormat          string `json:"audio_format,omitempty"`
	FilenameFormat       string `json:"filename_format,omitempty"`
	TrackNumber          bool   `json:"track_number,omitempty"`
	Position             int    `json:"position,omitempty"`
	UseAlbumTrackNumber  bool   `json:"use_album_track_number,omitempty"`
	SpotifyID            string `json:"spotify_id,omitempty"`
	EmbedLyrics          bool   `json:"embed_lyrics,omitempty"`
	EmbedMaxQualityCover bool   `json:"embed_max_quality_cover,omitempty"`
	ServiceURL           string `json:"service_url,omitempty"`
	Duration             int    `json:"duration,omitempty"`
	ItemID               string `json:"item_id,omitempty"`
	SpotifyTrackNumber   int    `json:"spotify_track_number,omitempty"`
	SpotifyDiscNumber    int    `json:"spotify_disc_number,omitempty"`
	SpotifyTotalTracks   int    `json:"spotify_total_tracks,omitempty"`
	SpotifyTotalDiscs    int    `json:"spotify_total_discs,omitempty"`
	Copyright            string `json:"copyright,omitempty"`
	Publisher            string `json:"publisher,omitempty"`
	PlaylistName         string `json:"playlist_name,omitempty"`
	PlaylistOwner        string `json:"playlist_owner,omitempty"`
	AllowFallback        bool   `json:"allow_fallback"`
	UseFirstArtistOnly   bool   `json:"use_first_artist_only,omitempty"`
	UseSingleGenre       bool   `json:"use_single_genre,omitempty"`
	EmbedGenre           bool   `json:"embed_genre,omitempty"`
	Separator            string `json:"separator,omitempty"`
}

type DownloadResponse struct {
	Success       bool   `json:"success"`
	Message       string `json:"message"`
	File          string `json:"file,omitempty"`
	Error         string `json:"error,omitempty"`
	AlreadyExists bool   `json:"already_exists,omitempty"`
	ItemID        string `json:"item_id_diag,omitempty"`
	UsedService   string `json:"used_service,omitempty"`
}

type StreamingURLsRequest struct {
	SpotifyTrackID string `json:"spotify_track_id"`
	Region         string `json:"region,omitempty"`
}

type TrackAvailabilityRequest struct {
	SpotifyTrackID string `json:"spotify_track_id"`
}

type SpotifyMetadataRequest struct {
	URL       string  `json:"url"`
	Batch     bool    `json:"batch,omitempty"`
	Delay     float64 `json:"delay,omitempty"`
	Timeout   float64 `json:"timeout,omitempty"`
	Separator string  `json:"separator,omitempty"`
}

type DeezerGenreRequest struct {
	ISRC string `json:"isrc"`
}

type GetPreviewURLRequest struct {
	SpotifyTrackID string `json:"track_id"`
}

func cleanupInvalidDownloadArtifacts(paths ...string) {
	seen := make(map[string]struct{}, len(paths))
	for _, path := range paths {
		if path == "" {
			continue
		}
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		_ = os.Remove(path)
	}
}

func enrichSpotifyTrackFields(req *DownloadRequest) {
	if req.SpotifyID == "" {
		return
	}

	needsMetadata := req.Copyright == "" ||
		req.Publisher == "" ||
		req.SpotifyTotalDiscs == 0 ||
		req.ReleaseDate == "" ||
		req.SpotifyTotalTracks == 0 ||
		req.SpotifyTrackNumber == 0

	if !needsMetadata {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	trackURL := fmt.Sprintf("https://open.spotify.com/track/%s", req.SpotifyID)
	trackData, err := backend.GetFilteredSpotifyData(ctx, trackURL, false, 0, ", ", nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[BRIDGE] Metadata enrichment FAIL for ID %s: %v\n", req.SpotifyID, err)
		return
	}
	fmt.Fprintf(os.Stderr, "[BRIDGE] Metadata enrichment SUCCESS for ID %s\n", req.SpotifyID)

	var trackResp struct {
		Track struct {
			Copyright   string `json:"copyright"`
			Publisher   string `json:"publisher"`
			TotalDiscs  int    `json:"total_discs"`
			TotalTracks int    `json:"total_tracks"`
			TrackNumber int    `json:"track_number"`
			ReleaseDate string `json:"release_date"`
		} `json:"track"`
	}

	jsonData, err := json.Marshal(trackData)
	if err != nil {
		return
	}
	if err := json.Unmarshal(jsonData, &trackResp); err != nil {
		return
	}

	if req.Copyright == "" {
		req.Copyright = trackResp.Track.Copyright
	}
	if req.Publisher == "" {
		req.Publisher = trackResp.Track.Publisher
	}
	if req.SpotifyTotalDiscs == 0 {
		req.SpotifyTotalDiscs = trackResp.Track.TotalDiscs
	}
	if req.SpotifyTotalTracks == 0 {
		req.SpotifyTotalTracks = trackResp.Track.TotalTracks
	}
	if req.SpotifyTrackNumber == 0 {
		req.SpotifyTrackNumber = trackResp.Track.TrackNumber
	}
	if req.ReleaseDate == "" {
		req.ReleaseDate = trackResp.Track.ReleaseDate
	}
}

func downloadTrack(req DownloadRequest) (DownloadResponse, error) {
	if req.Service == "qobuz" && req.SpotifyID == "" {
		return DownloadResponse{Success: false, Error: "Spotify ID is required for Qobuz"}, fmt.Errorf("spotify ID is required for qobuz")
	}

	if req.Service == "" {
		req.Service = "tidal"
	}
	fmt.Fprintf(os.Stderr, "[BRIDGE] Starting downloadTrack. Service: %s, ID: %s, Track: %s\n", req.Service, req.SpotifyID, req.TrackName)

	if req.OutputDir == "" {
		req.OutputDir = "."
	} else {
		if req.PlaylistName != "" {
			req.OutputDir = filepath.Join(req.OutputDir, backend.SanitizeFilename(req.PlaylistName))
		}
		req.OutputDir = backend.SanitizeFolderPath(req.OutputDir)
	}

	if req.AudioFormat == "" {
		req.AudioFormat = "LOSSLESS"
	}
	if req.FilenameFormat == "" {
		req.FilenameFormat = "title-artist"
	}

	itemID := req.ItemID
	if itemID == "" {
		if req.SpotifyID != "" {
			itemID = fmt.Sprintf("%s-%d", req.SpotifyID, time.Now().UnixNano())
		} else {
			itemID = fmt.Sprintf("%s-%s-%d", req.TrackName, req.ArtistName, time.Now().UnixNano())
		}
		backend.AddToQueue(itemID, req.TrackName, req.ArtistName, req.AlbumName, req.SpotifyID)
	}

	backend.SetDownloading(true)
	backend.StartDownloadItem(itemID)
	defer backend.SetDownloading(false)

	spotifyURL := ""
	if req.SpotifyID != "" {
		spotifyURL = fmt.Sprintf("https://open.spotify.com/track/%s", req.SpotifyID)
	}

	enrichSpotifyTrackFields(&req)

	if req.TrackName != "" && req.ArtistName != "" {
		expectedFilename := backend.BuildExpectedFilename(
			req.TrackName,
			req.ArtistName,
			req.AlbumName,
			req.AlbumArtist,
			req.ReleaseDate,
			req.FilenameFormat,
			req.PlaylistName,
			req.PlaylistOwner,
			req.TrackNumber,
			req.Position,
			req.SpotifyDiscNumber,
			req.UseAlbumTrackNumber,
		)
		expectedPath := filepath.Join(req.OutputDir, expectedFilename)
		if fileInfo, err := os.Stat(expectedPath); err == nil && fileInfo.Size() > 100*1024 {
			backend.SkipDownloadItem(itemID, expectedPath)
			return DownloadResponse{
				Success:       true,
				Message:       "File already exists",
				File:          expectedPath,
				AlreadyExists: true,
				ItemID:        itemID,
			}, nil
		}
	}

	lyricsChan := make(chan string, 1)
	isrcChan := make(chan string, 1)

	if req.SpotifyID != "" {
		if req.EmbedLyrics {
			go func() {
				client := backend.NewLyricsClient()
				resp, _, err := client.FetchLyricsAllSources(req.SpotifyID, req.TrackName, req.ArtistName, req.AlbumName, req.Duration)
				if err == nil && resp != nil && len(resp.Lines) > 0 {
					lyricsChan <- client.ConvertToLRC(resp, req.TrackName, req.ArtistName)
				} else {
					lyricsChan <- ""
				}
			}()
		} else {
			close(lyricsChan)
		}

		if req.Service == "qobuz" {
			go func() {
				client := backend.NewSongLinkClient()
				isrc, err := client.GetISRCDirect(req.SpotifyID)
				if err != nil {
					isrcChan <- ""
					return
				}
				isrcChan <- isrc
			}()
		} else {
			close(isrcChan)
		}
	} else {
		close(lyricsChan)
		close(isrcChan)
	}

	appDir, _ := backend.GetAppDir()
	fmt.Fprintf(os.Stderr, "[BRIDGE] User Home AppDir: %s\n", appDir)

	var (
		err           error
		filename      string
		serviceErrors []string
	)

	servicesToTry := []string{req.Service}
	if req.Service == "auto" {
		servicesToTry = []string{"tidal", "qobuz", "amazon"}
	}

	var usedService string
	for _, service := range servicesToTry {
		usedService = service
		fmt.Fprintf(os.Stderr, "[BRIDGE] Trial: %s\n", service)
		
		var currentErr error
		switch service {
		case "amazon":
			downloader := backend.NewAmazonDownloader()
			if req.ServiceURL != "" {
				filename, currentErr = downloader.DownloadByURL(req.ServiceURL, req.OutputDir, req.AudioFormat, req.FilenameFormat, req.PlaylistName, req.PlaylistOwner, req.TrackNumber, req.Position, req.TrackName, req.ArtistName, req.AlbumName, req.AlbumArtist, req.ReleaseDate, req.CoverURL, req.SpotifyTrackNumber, req.SpotifyDiscNumber, req.SpotifyTotalTracks, req.EmbedMaxQualityCover, req.SpotifyTotalDiscs, req.Copyright, req.Publisher, spotifyURL, req.UseFirstArtistOnly, req.UseSingleGenre, req.EmbedGenre)
			} else {
				filename, currentErr = downloader.DownloadBySpotifyID(req.SpotifyID, req.OutputDir, req.AudioFormat, req.FilenameFormat, req.PlaylistName, req.PlaylistOwner, req.TrackNumber, req.Position, req.TrackName, req.ArtistName, req.AlbumName, req.AlbumArtist, req.ReleaseDate, req.CoverURL, req.SpotifyTrackNumber, req.SpotifyDiscNumber, req.SpotifyTotalTracks, req.EmbedMaxQualityCover, req.SpotifyTotalDiscs, req.Copyright, req.Publisher, spotifyURL, req.UseFirstArtistOnly, req.UseSingleGenre, req.EmbedGenre)
			}
		case "auto", "tidal":
			if req.ApiURL == "" || req.ApiURL == "auto" {
				downloader := backend.NewTidalDownloader("")
				if req.ServiceURL != "" {
					filename, currentErr = downloader.DownloadByURLWithFallback(req.ServiceURL, req.OutputDir, req.AudioFormat, req.FilenameFormat, req.TrackNumber, req.Position, req.TrackName, req.ArtistName, req.AlbumName, req.AlbumArtist, req.ReleaseDate, req.UseAlbumTrackNumber, req.CoverURL, req.EmbedMaxQualityCover, req.SpotifyTrackNumber, req.SpotifyDiscNumber, req.SpotifyTotalTracks, req.SpotifyTotalDiscs, req.Copyright, req.Publisher, spotifyURL, req.AllowFallback, req.UseFirstArtistOnly, req.UseSingleGenre, req.EmbedGenre)
				} else {
					filename, currentErr = downloader.Download(req.SpotifyID, req.OutputDir, req.AudioFormat, req.FilenameFormat, req.TrackNumber, req.Position, req.TrackName, req.ArtistName, req.AlbumName, req.AlbumArtist, req.ReleaseDate, req.UseAlbumTrackNumber, req.CoverURL, req.EmbedMaxQualityCover, req.SpotifyTrackNumber, req.SpotifyDiscNumber, req.SpotifyTotalTracks, req.SpotifyTotalDiscs, req.Copyright, req.Publisher, spotifyURL, req.AllowFallback, req.UseFirstArtistOnly, req.UseSingleGenre, req.EmbedGenre)
				}
			} else {
				downloader := backend.NewTidalDownloader(req.ApiURL)
				if req.ServiceURL != "" {
					filename, currentErr = downloader.DownloadByURL(req.ServiceURL, req.OutputDir, req.AudioFormat, req.FilenameFormat, req.TrackNumber, req.Position, req.TrackName, req.ArtistName, req.AlbumName, req.AlbumArtist, req.ReleaseDate, req.UseAlbumTrackNumber, req.CoverURL, req.EmbedMaxQualityCover, req.SpotifyTrackNumber, req.SpotifyDiscNumber, req.SpotifyTotalTracks, req.SpotifyTotalDiscs, req.Copyright, req.Publisher, spotifyURL, req.AllowFallback, req.UseFirstArtistOnly, req.UseSingleGenre, req.EmbedGenre)
				} else {
					filename, currentErr = downloader.Download(req.SpotifyID, req.OutputDir, req.AudioFormat, req.FilenameFormat, req.TrackNumber, req.Position, req.TrackName, req.ArtistName, req.AlbumName, req.AlbumArtist, req.ReleaseDate, req.UseAlbumTrackNumber, req.CoverURL, req.EmbedMaxQualityCover, req.SpotifyTrackNumber, req.SpotifyDiscNumber, req.SpotifyTotalTracks, req.SpotifyTotalDiscs, req.Copyright, req.Publisher, spotifyURL, req.AllowFallback, req.UseFirstArtistOnly, req.UseSingleGenre, req.EmbedGenre)
				}
			}
		case "qobuz":
			isrc := <-isrcChan
			downloader := backend.NewQobuzDownloader()
			quality := req.AudioFormat
			if quality == "" {
				quality = "6"
			}
			filename, currentErr = downloader.DownloadTrackWithISRC(isrc, req.OutputDir, quality, req.FilenameFormat, req.TrackNumber, req.Position, req.TrackName, req.ArtistName, req.AlbumName, req.AlbumArtist, req.ReleaseDate, req.UseAlbumTrackNumber, req.CoverURL, req.EmbedMaxQualityCover, req.SpotifyTrackNumber, req.SpotifyDiscNumber, req.SpotifyTotalTracks, req.SpotifyTotalDiscs, req.Copyright, req.Publisher, spotifyURL, req.AllowFallback, req.UseFirstArtistOnly, req.UseSingleGenre, req.EmbedGenre)
		default:
			currentErr = fmt.Errorf("unknown service: %s", service)
		}

		if currentErr == nil {
			err = nil
			break
		}
		
		err = currentErr
		serviceErrors = append(serviceErrors, fmt.Sprintf("%s: %v", service, currentErr))
		fmt.Fprintf(os.Stderr, "[BRIDGE] %s error: %v\n", service, currentErr)
	}

	if err != nil {
		allErrors := strings.Join(serviceErrors, " | ")
		fmt.Fprintf(os.Stderr, "[BRIDGE] ALL SERVICES FAILED for %s: %s\n", req.ItemID, allErrors)
		backend.FailDownloadItem(itemID, fmt.Sprintf("All services failed: %s", allErrors))
		if filename != "" && !strings.HasPrefix(filename, "EXISTS:") {
			if _, statErr := os.Stat(filename); statErr == nil {
				_ = os.Remove(filename)
			}
		}
		return DownloadResponse{Success: false, Error: fmt.Sprintf("All services failed: %s", allErrors), ItemID: itemID}, err
	}
	fmt.Fprintf(os.Stderr, "[BRIDGE] DOWNLOAD SUCCESS for %s. File: %s\n", req.ItemID, filename)

	alreadyExists := false
	if strings.HasPrefix(filename, "EXISTS:") {
		alreadyExists = true
		filename = strings.TrimPrefix(filename, "EXISTS:")
	}

	if !alreadyExists {
		validated, validationErr := backend.ValidateDownloadedTrackDuration(filename, req.Duration)
		if validationErr != nil {
			cleanupInvalidDownloadArtifacts(filename)
			errorMessage := validationErr.Error()
			backend.FailDownloadItem(itemID, errorMessage)
			return DownloadResponse{Success: false, Error: errorMessage, ItemID: itemID}, errors.New(errorMessage)
		}
		if !validated {
			fmt.Fprintf(os.Stderr, "[DownloadValidation] skipped for %s\n", filename)
		}
	}

	if !alreadyExists && req.SpotifyID != "" && req.EmbedLyrics && (strings.HasSuffix(filename, ".flac") || strings.HasSuffix(filename, ".mp3") || strings.HasSuffix(filename, ".m4a")) {
		lyrics := <-lyricsChan
		if lyrics != "" {
			_ = backend.EmbedLyricsOnlyUniversal(filename, lyrics)
		}
	}

	message := "Download completed successfully"
	if alreadyExists {
		message = "File already exists"
		backend.SkipDownloadItem(itemID, filename)
	} else {
		if fileInfo, statErr := os.Stat(filename); statErr == nil {
			finalSize := float64(fileInfo.Size()) / (1024 * 1024)
			backend.CompleteDownloadItem(itemID, filename, finalSize)
		} else {
			backend.CompleteDownloadItem(itemID, filename, 0)
		}

		go func(fPath, track, artist, album, sID, cover, format, source string) {
			time.Sleep(1 * time.Second)
			quality := "Unknown"
			durationStr := "0:00"

			meta, err := backend.GetTrackMetadata(fPath)
			if err == nil {
				if meta.Bitrate > 0 {
					quality = fmt.Sprintf("%dkbps/%.1fkHz", meta.Bitrate/1000, float64(meta.SampleRate)/1000.0)
				} else if meta.SampleRate > 0 {
					quality = fmt.Sprintf("%.1fkHz", float64(meta.SampleRate)/1000.0)
				}
				d := int(meta.Duration)
				durationStr = fmt.Sprintf("%d:%02d", d/60, d%60)
			}

			item := backend.HistoryItem{
				SpotifyID:   sID,
				Title:       track,
				Artists:     artist,
				Album:       album,
				DurationStr: durationStr,
				CoverURL:    cover,
				Quality:     quality,
				Format:      strings.ToUpper(format),
				Path:        fPath,
				Source:      source,
			}

			if item.Format == "" || item.Format == "LOSSLESS" {
				ext := filepath.Ext(fPath)
				if len(ext) > 1 {
					item.Format = strings.ToUpper(ext[1:])
				}
			}

			switch item.Format {
			case "6", "7", "27":
				item.Format = "FLAC"
			}

			_ = backend.AddHistoryItem(item, "SpotiFLAC")
		}(filename, req.TrackName, req.ArtistName, req.AlbumName, req.SpotifyID, req.CoverURL, req.AudioFormat, req.Service)
	}

	return DownloadResponse{
		Success:       true,
		Message:       message,
		File:          filename,
		AlreadyExists: alreadyExists,
		ItemID:        itemID,
		UsedService:   usedService,
	}, nil
}

func main() {
	_ = backend.InitHistoryDB("SpotiFLAC")
	_ = backend.InitISRCCacheDB()
	_ = backend.InitProviderPriorityDB()

	if len(os.Args) < 2 {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
			"success": false,
			"error":   "missing command",
		})
		os.Exit(1)
	}

	command := os.Args[1]
	switch command {
	case "download-track":
		var req DownloadRequest
		if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   fmt.Sprintf("invalid request: %v", err),
			})
			os.Exit(1)
		}

		originalStdout := os.Stdout
		os.Stdout = os.Stderr
		resp, err := downloadTrack(req)
		os.Stdout = originalStdout
		_ = json.NewEncoder(os.Stdout).Encode(resp)
		if err != nil {
			os.Exit(1)
		}
	case "get-streaming-urls":
		var req StreamingURLsRequest
		if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   fmt.Sprintf("invalid request: %v", err),
			})
			os.Exit(1)
		}

		originalStdout := os.Stdout
		os.Stdout = os.Stderr
		client := backend.NewSongLinkClient()
		urls, err := client.GetAllURLsFromSpotify(strings.TrimSpace(req.SpotifyTrackID), strings.TrimSpace(req.Region))
		os.Stdout = originalStdout
		if err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   err.Error(),
			})
			os.Exit(1)
		}
		_ = json.NewEncoder(os.Stdout).Encode(urls)
	case "check-track-availability":
		var req TrackAvailabilityRequest
		if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   fmt.Sprintf("invalid request: %v", err),
			})
			os.Exit(1)
		}

		originalStdout := os.Stdout
		os.Stdout = os.Stderr
		client := backend.NewSongLinkClient()
		availability, err := client.CheckTrackAvailability(strings.TrimSpace(req.SpotifyTrackID))
		os.Stdout = originalStdout
		if err != nil && availability == nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   err.Error(),
			})
			os.Exit(1)
		}
		if availability == nil {
			availability = &backend.TrackAvailability{SpotifyID: strings.TrimSpace(req.SpotifyTrackID)}
		}
		_ = json.NewEncoder(os.Stdout).Encode(availability)
		if err != nil {
			os.Exit(1)
		}
	case "get-spotify-metadata":
		var req SpotifyMetadataRequest
		if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   fmt.Sprintf("invalid request: %v", err),
			})
			os.Exit(1)
		}

		if strings.TrimSpace(req.URL) == "" {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   "url is required",
			})
			os.Exit(1)
		}

		originalStdout := os.Stdout
		os.Stdout = os.Stderr
		timeout := 15 * time.Second
		if req.Timeout > 0 {
			timeout = time.Duration(req.Timeout * float64(time.Second))
		}
		delay := time.Duration(req.Delay * float64(time.Second))
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		result, err := backend.GetFilteredSpotifyData(ctx, strings.TrimSpace(req.URL), req.Batch, delay, req.Separator, nil)
		cancel()
		os.Stdout = originalStdout

		if err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   err.Error(),
			})
			os.Exit(1)
		}

		_ = json.NewEncoder(os.Stdout).Encode(result)
	case "get-deezer-genres":
		var req DeezerGenreRequest
		if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   fmt.Sprintf("invalid request: %v", err),
			})
			os.Exit(1)
		}

		if strings.TrimSpace(req.ISRC) == "" {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   "isrc is required",
			})
			os.Exit(1)
		}

		genres, err := backend.FetchDeezerGenresByISRC(req.ISRC)
		if err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   err.Error(),
			})
			os.Exit(1)
		}

		genre := ""
		if len(genres) > 0 {
			genre = genres[0]
		}

		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
			"success": true,
			"genres":  genres,
			"genre":   genre,
			"isrc":    strings.ToUpper(strings.TrimSpace(req.ISRC)),
		})
	case "search-spotify":
		var req struct {
			Query string `json:"query"`
			Limit int    `json:"limit"`
		}
		if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   fmt.Sprintf("invalid request: %v", err),
			})
			os.Exit(1)
		}

		if req.Query == "" {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   "search query is required",
			})
			os.Exit(1)
		}

		if req.Limit <= 0 {
			req.Limit = 50
		}

		originalStdout := os.Stdout
		os.Stdout = os.Stderr
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		results, err := backend.SearchSpotify(ctx, req.Query, req.Limit)
		cancel()
		os.Stdout = originalStdout

		if err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   err.Error(),
			})
			os.Exit(1)
		}

		_ = json.NewEncoder(os.Stdout).Encode(results)
	case "search-spotify-by-type":
		var req struct {
			Query      string `json:"query"`
			SearchType string `json:"search_type"`
			Limit      int    `json:"limit"`
			Offset     int    `json:"offset"`
		}
		if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   fmt.Sprintf("invalid request: %v", err),
			})
			os.Exit(1)
		}

		if req.Query == "" || req.SearchType == "" {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   "query and search_type are required",
			})
			os.Exit(1)
		}

		if req.Limit <= 0 {
			req.Limit = 50
		}

		originalStdout := os.Stdout
		os.Stdout = os.Stderr
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		results, err := backend.SearchSpotifyByType(ctx, req.Query, req.SearchType, req.Limit, req.Offset)
		cancel()
		os.Stdout = originalStdout

		if err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   err.Error(),
			})
			os.Exit(1)
		}

		_ = json.NewEncoder(os.Stdout).Encode(results)
	case "get-preview-url":
		var req GetPreviewURLRequest
		if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   fmt.Sprintf("invalid request: %v", err),
			})
			os.Exit(1)
		}

		if strings.TrimSpace(req.SpotifyTrackID) == "" {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   "track_id is required",
			})
			os.Exit(1)
		}

		url, err := backend.GetPreviewURL(strings.TrimSpace(req.SpotifyTrackID))
		if err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"success": false,
				"error":   err.Error(),
			})
			os.Exit(1)
		}

		_ = json.NewEncoder(os.Stdout).Encode(url)
	default:
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
			"success": false,
			"error":   fmt.Sprintf("unknown command: %s", command),
		})
		os.Exit(1)
	}
}
