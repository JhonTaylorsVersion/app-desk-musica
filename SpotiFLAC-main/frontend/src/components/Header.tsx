interface HeaderProps {
  version: string;
  hasUpdate: boolean;
  releaseDate?: string | null;
}
export function Header({}: HeaderProps) {
  return (
    <div className="relative">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <img
            src="/spotiflac/icon.svg"
            alt="SpotiFLAC"
            className="w-12 h-12 cursor-pointer"
            onClick={() => window.location.reload()}
          />{" "}
          <h1
            className="text-4xl font-bold cursor-pointer"
            onClick={() => window.location.reload()}
          >
            SpotiFLAC
          </h1>
        </div>
        <p className="text-muted-foreground">
          Get Spotify tracks in true FLAC from Tidal, Qobuz & Amazon Music — no
          account required.
        </p>
      </div>
    </div>
  );
}
