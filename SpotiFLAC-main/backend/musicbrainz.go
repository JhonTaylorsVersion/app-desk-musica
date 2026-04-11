package backend

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"net/url"
	"strings"
	"time"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

var AppVersion = "Unknown"

const musicBrainzAPIBase = "https://musicbrainz.org/ws/2"

type MusicBrainzRecordingResponse struct {
	Recordings []struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Length   int    `json:"length"`
		Releases []struct {
			ID           string `json:"id"`
			Title        string `json:"title"`
			Status       string `json:"status"`
			ReleaseGroup struct {
				ID          string `json:"id"`
				Title       string `json:"title"`
				PrimaryType string `json:"primary-type"`
			} `json:"release-group"`
			Date    string `json:"date"`
			Country string `json:"country"`
			Media   []struct {
				Format string `json:"format"`
			} `json:"media"`
			LabelInfo []struct {
				Label struct {
					Name string `json:"name"`
				} `json:"label"`
			} `json:"label-info"`
		} `json:"releases"`
		ArtistCredit []struct {
			Artist struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"artist"`
		} `json:"artist-credit"`
		Tags []struct {
			Count int    `json:"count"`
			Name  string `json:"name"`
		} `json:"tags"`
	} `json:"recordings"`
}

type normalizedMusicBrainzTag struct {
	Name  string
	Count int
	Score int
}

var excludedMusicBrainzGenreTerms = []string{
	"billboard",
	"hot 100",
	"chart",
	"charts",
	"ranking",
	"rankings",
	"award",
	"awards",
	"grammy",
	"mama",
	"melon",
	"itunes",
	"spotify",
	"apple music",
	"viral",
	"top 10",
	"top 20",
	"top 40",
	"top 50",
	"top 100",
	"number one",
	"no. 1",
	"ost",
	"original soundtrack",
	"soundtrack",
	"single of the year",
	"weeks",
	"week",
	"wochen",
	"monat",
	"monate",
	"month",
	"months",
	"dias",
	"dias",
	"days",
	"semanas",
	"weeks on chart",
	"chart run",
	"debut",
	"peak position",
	"number 1",
	"nr. 1",
	"no 1",
	"certification",
	"certifications",
	"sales",
	"streams",
	"streaming",
	"radio",
	"idol",
	"idols",
	"girl group",
	"boy group",
	"female vocalists",
	"male vocalists",
	"korean",
	"japanese",
	"china",
	"chinese",
	"thai",
	"viral 50",
	"top songs",
}

var musicBrainzGenreChartPattern = regexp.MustCompile(`\b\d+\+?\s*(week|weeks|wochen|monat|monate|month|months|day|days|dias|semana|semanas)\b`)

var broadMusicBrainzGenreTerms = []string{
	"asian music",
	"world music",
	"international music",
	"pop music",
	"music",
}

var strongMusicBrainzGenreTerms = []string{
	"k-pop",
	"j-pop",
	"c-pop",
	"edm",
	"electronic dance music",
	"hard techno",
	"techno",
	"hardstyle",
	"trance",
	"house",
	"dance",
	"dance-pop",
	"dance pop",
	"synth-pop",
	"synth pop",
	"electropop",
	"electro pop",
	"industrial",
	"dubstep",
	"drum and bass",
	"dnb",
	"trap",
	"hip hop",
	"hip-hop",
	"rap",
	"r&b",
	"rhythm and blues",
	"alt-pop",
	"alt pop",
	"alternative pop",
	"indie pop",
	"electronic",
	"pop",
	"rock",
	"metal",
	"jazz",
	"soul",
	"funk",
	"disco",
	"latin",
	"reggaeton",
	"afrobeats",
	"ambient",
	"phonk",
}

var allowedDigitGenreTerms = []string{
	"2-step",
	"2 step",
	"8-bit",
	"8 bit",
}

func isLikelyGenreTag(tagName string) bool {
	normalized := strings.TrimSpace(strings.ToLower(tagName))
	if normalized == "" {
		return false
	}

	if musicBrainzGenreChartPattern.MatchString(normalized) {
		return false
	}

	for _, term := range excludedMusicBrainzGenreTerms {
		if strings.Contains(normalized, term) {
			return false
		}
	}

	if strings.ContainsAny(normalized, "0123456789") {
		for _, allowedTerm := range allowedDigitGenreTerms {
			if strings.Contains(normalized, allowedTerm) {
				return true
			}
		}
		return false
	}

	return true
}

func scoreMusicBrainzGenreTag(tagName string, count int) (int, bool) {
	normalized := strings.TrimSpace(strings.ToLower(tagName))
	if !isLikelyGenreTag(normalized) {
		return 0, false
	}

	score := count * 100

	for _, term := range strongMusicBrainzGenreTerms {
		if strings.Contains(normalized, term) {
			score += 400
		}
	}

	for _, term := range broadMusicBrainzGenreTerms {
		if normalized == term {
			score -= 550
			break
		}
		if strings.Contains(normalized, term) {
			score -= 300
		}
	}

	if strings.Contains(normalized, " music") || strings.HasSuffix(normalized, "music") {
		score -= 220
	}

	if strings.Contains(normalized, "asian") && !strings.Contains(normalized, "k-pop") && !strings.Contains(normalized, "j-pop") && !strings.Contains(normalized, "c-pop") {
		score -= 250
	}

	if strings.Contains(normalized, "pop") && !strings.Contains(normalized, "k-pop") && !strings.Contains(normalized, "j-pop") && !strings.Contains(normalized, "c-pop") && !strings.Contains(normalized, "synth-pop") && !strings.Contains(normalized, "dance-pop") {
		score += 80
	}

	if strings.Contains(normalized, "genre") {
		score -= 400
	}

	if score <= 0 {
		return 0, false
	}

	return score, true
}

func collectPrimaryMusicBrainzGenres(tags []struct {
	Count int    `json:"count"`
	Name  string `json:"name"`
}, limit int) []string {
	if limit <= 0 {
		limit = 1
	}

	caser := cases.Title(language.English)
	byName := make(map[string]normalizedMusicBrainzTag)

	for _, tag := range tags {
		score, ok := scoreMusicBrainzGenreTag(tag.Name, tag.Count)
		if !ok {
			continue
		}

		normalizedName := strings.TrimSpace(strings.ToLower(tag.Name))
		if normalizedName == "" {
			continue
		}

		candidate := normalizedMusicBrainzTag{
			Name:  caser.String(normalizedName),
			Count: tag.Count,
			Score: score,
		}

		if existing, exists := byName[normalizedName]; !exists || candidate.Score > existing.Score || (candidate.Score == existing.Score && candidate.Count > existing.Count) {
			byName[normalizedName] = candidate
		}
	}

	normalizedTags := make([]normalizedMusicBrainzTag, 0, len(byName))
	for _, tag := range byName {
		normalizedTags = append(normalizedTags, tag)
	}

	sort.SliceStable(normalizedTags, func(i, j int) bool {
		if normalizedTags[i].Score == normalizedTags[j].Score {
			if normalizedTags[i].Count == normalizedTags[j].Count {
				return normalizedTags[i].Name < normalizedTags[j].Name
			}
			return normalizedTags[i].Count > normalizedTags[j].Count
		}
		return normalizedTags[i].Score > normalizedTags[j].Score
	})

	if len(normalizedTags) > limit {
		normalizedTags = normalizedTags[:limit]
	}

	result := make([]string, 0, len(normalizedTags))
	for _, tag := range normalizedTags {
		result = append(result, tag.Name)
	}

	return result
}

func FetchMusicBrainzMetadata(isrc, title, artist, album string, useSingleGenre bool, embedGenre bool) (Metadata, error) {
	var meta Metadata

	if !embedGenre {
		return meta, nil
	}

	if isrc == "" {
		return meta, fmt.Errorf("no ISRC provided")
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	query := fmt.Sprintf("isrc:%s", isrc)
	reqURL := fmt.Sprintf("%s/recording?query=%s&fmt=json&inc=releases+artist-credits+tags+media+release-groups+labels", musicBrainzAPIBase, url.QueryEscape(query))

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return meta, err
	}

	req.Header.Set("User-Agent", fmt.Sprintf("SpotiFLAC/%s ( hi@afkarxyz.qzz.io )", AppVersion))

	var resp *http.Response
	var lastErr error

	for i := 0; i < 3; i++ {
		resp, lastErr = client.Do(req)
		if lastErr == nil && resp.StatusCode == http.StatusOK {
			break
		}

		if resp != nil {
			resp.Body.Close()
		}

		if i < 2 {
			time.Sleep(2 * time.Second)
		}
	}

	if lastErr != nil {
		return meta, lastErr
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return meta, fmt.Errorf("MusicBrainz API returned status: %d", resp.StatusCode)
	}
	defer resp.Body.Close()

	var mbResp MusicBrainzRecordingResponse
	if err := json.NewDecoder(resp.Body).Decode(&mbResp); err != nil {
		return meta, err
	}

	if len(mbResp.Recordings) == 0 {
		return meta, fmt.Errorf("no recordings found for ISRC: %s", isrc)
	}

	recording := mbResp.Recordings[0]
	genreLimit := 3
	if useSingleGenre {
		genreLimit = 1
	}

	genres := collectPrimaryMusicBrainzGenres(recording.Tags, genreLimit)
	if len(genres) > 0 {
		meta.Genre = strings.Join(genres, GetSeparator())
	}

	return meta, nil
}
