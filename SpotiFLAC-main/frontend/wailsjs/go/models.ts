class ModelBase {
  [key: string]: any;

  constructor(data?: Record<string, unknown>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}

export const main = {
  SpotifyMetadataRequest: class SpotifyMetadataRequest extends ModelBase {},
  SpotifySearchRequest: class SpotifySearchRequest extends ModelBase {},
  SpotifySearchByTypeRequest: class SpotifySearchByTypeRequest extends ModelBase {},
  DownloadRequest: class DownloadRequest extends ModelBase {},
  LyricsDownloadRequest: class LyricsDownloadRequest extends ModelBase {},
  CoverDownloadRequest: class CoverDownloadRequest extends ModelBase {},
  HeaderDownloadRequest: class HeaderDownloadRequest extends ModelBase {},
  GalleryImageDownloadRequest: class GalleryImageDownloadRequest extends ModelBase {},
  AvatarDownloadRequest: class AvatarDownloadRequest extends ModelBase {},
  ConvertAudioRequest: class ConvertAudioRequest extends ModelBase {},
  ResampleAudioRequest: class ResampleAudioRequest extends ModelBase {},
};

export namespace main {
  export type SpotifyMetadataRequest = InstanceType<typeof main.SpotifyMetadataRequest>;
  export type SpotifySearchRequest = InstanceType<typeof main.SpotifySearchRequest>;
  export type SpotifySearchByTypeRequest = InstanceType<typeof main.SpotifySearchByTypeRequest>;
  export type DownloadRequest = InstanceType<typeof main.DownloadRequest>;
  export type LyricsDownloadRequest = InstanceType<typeof main.LyricsDownloadRequest>;
  export type CoverDownloadRequest = InstanceType<typeof main.CoverDownloadRequest>;
  export type HeaderDownloadRequest = InstanceType<typeof main.HeaderDownloadRequest>;
  export type GalleryImageDownloadRequest = InstanceType<typeof main.GalleryImageDownloadRequest>;
  export type AvatarDownloadRequest = InstanceType<typeof main.AvatarDownloadRequest>;
  export type ConvertAudioRequest = InstanceType<typeof main.ConvertAudioRequest>;
  export type ResampleAudioRequest = InstanceType<typeof main.ResampleAudioRequest>;
}

export const backend = {
  SearchResponse: class SearchResponse extends ModelBase {
    tracks: any[] = [];
    albums: any[] = [];
    artists: any[] = [];
    playlists: any[] = [];
  },
  DownloadQueueInfo: class DownloadQueueInfo extends ModelBase {
    queue: any[] = [];
    queued_count = 0;
    completed_count = 0;
    failed_count = 0;
    skipped_count = 0;
    total_downloaded = 0;
    current_speed = 0;
    session_start_time = 0;
  },
  FileInfo: class FileInfo extends ModelBase {},
  RenamePreview: class RenamePreview extends ModelBase {},
  RenameResult: class RenameResult extends ModelBase {},
  AudioMetadata: class AudioMetadata extends ModelBase {},
  HistoryItem: class HistoryItem extends ModelBase {},
  FetchHistoryItem: class FetchHistoryItem extends ModelBase {},
  ProgressInfo: class ProgressInfo extends ModelBase {},
  LyricsDownloadResponse: class LyricsDownloadResponse extends ModelBase {},
  CoverDownloadResponse: class CoverDownloadResponse extends ModelBase {},
  HeaderDownloadResponse: class HeaderDownloadResponse extends ModelBase {},
  GalleryImageDownloadResponse: class GalleryImageDownloadResponse extends ModelBase {},
  AvatarDownloadResponse: class AvatarDownloadResponse extends ModelBase {},
  ConvertAudioResult: class ConvertAudioResult extends ModelBase {},
  ResampleResult: class ResampleResult extends ModelBase {},
  FlacInfo: class FlacInfo extends ModelBase {},
  AnalysisDecodeResponse: class AnalysisDecodeResponse extends ModelBase {},
};

export namespace backend {
  export type SearchResponse = InstanceType<typeof backend.SearchResponse>;
  export type SearchResult = Record<string, any>;
  export type FileInfo = InstanceType<typeof backend.FileInfo>;
  export type RenamePreview = InstanceType<typeof backend.RenamePreview>;
  export type RenameResult = InstanceType<typeof backend.RenameResult>;
  export type AudioMetadata = InstanceType<typeof backend.AudioMetadata>;
  export type HistoryItem = InstanceType<typeof backend.HistoryItem>;
  export type FetchHistoryItem = InstanceType<typeof backend.FetchHistoryItem>;
  export type ProgressInfo = InstanceType<typeof backend.ProgressInfo>;
  export type DownloadQueueInfo = InstanceType<typeof backend.DownloadQueueInfo>;
  export type LyricsDownloadResponse = InstanceType<typeof backend.LyricsDownloadResponse>;
  export type CoverDownloadResponse = InstanceType<typeof backend.CoverDownloadResponse>;
  export type HeaderDownloadResponse = InstanceType<typeof backend.HeaderDownloadResponse>;
  export type GalleryImageDownloadResponse = InstanceType<typeof backend.GalleryImageDownloadResponse>;
  export type AvatarDownloadResponse = InstanceType<typeof backend.AvatarDownloadResponse>;
  export type ConvertAudioResult = InstanceType<typeof backend.ConvertAudioResult>;
  export type ResampleResult = InstanceType<typeof backend.ResampleResult>;
  export type FlacInfo = InstanceType<typeof backend.FlacInfo>;
  export type AnalysisDecodeResponse = InstanceType<typeof backend.AnalysisDecodeResponse>;
}
