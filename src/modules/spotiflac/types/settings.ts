export interface TemplateData {
  artist?: string;
  album?: string;
  album_artist?: string;
  title?: string;
  track?: string | number;
  disc?: string | number;
  year?: string;
  date?: string;
  isrc?: string;
  playlist?: string;
}

export function parseTemplate(template: string, data: TemplateData): string {
  if (!template) return '';
  return template
    .replace(/\{title\}/g, data.title || "Unknown Title")
    .replace(/\{artist\}/g, data.artist || "Unknown Artist")
    .replace(/\{album\}/g, data.album || "Unknown Album")
    .replace(/\{album_artist\}/g, data.album_artist || data.artist || "Unknown Artist")
    .replace(/\{isrc\}/g, data.isrc || "")
    .replace(/\{track\}/g, data.track != null ? String(data.track).padStart(2, "0") : "00")
    .replace(/\{disc\}/g, data.disc != null ? String(data.disc) : "1")
    .replace(/\{year\}/g, data.year || "0000")
    .replace(/\{date\}/g, data.date || "0000-00-00")
    .replace(/\{playlist\}/g, data.playlist || "");
}
