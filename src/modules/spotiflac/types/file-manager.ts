export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  children?: FileNode[];
  expanded?: boolean;
}

export interface FileMetadata {
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  track_number: number;
  disc_number: number;
  year: string;
  upc?: string;
  isrc?: string;
}

export interface RenamePreview {
  old_path: string;
  old_name: string;
  new_name: string;
  error?: string;
}

export interface RenameResult {
  path: string;
  success: boolean;
  error?: string;
}

export type TabType = "track" | "lyric" | "cover";
