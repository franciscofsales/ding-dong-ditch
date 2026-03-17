import type { Recording } from "../../types/recording";

interface RecordingCardProps {
  recording: Recording;
  onPlay: (recording: Recording) => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (path: string) => void;
}

function formatTime(file: string): string {
  return file.replace(".mp4", "").replace(/-/g, ":");
}

function formatSize(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

export default function RecordingCard({ recording, onPlay, isSelectMode = false, isSelected = false, onToggleSelect }: RecordingCardProps) {
  const handleClick = () => {
    if (isSelectMode) {
      onToggleSelect?.(recording.path);
    } else {
      onPlay(recording);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const isDoorbell = recording.event_type === 'doorbell';

  return (
    <div
      className={`recording-card${isDoorbell ? " recording-card--doorbell" : ""}${isSelected ? " recording-card--selected" : ""}`}
      role={isSelectMode ? "checkbox" : "button"}
      tabIndex={0}
      aria-checked={isSelectMode ? isSelected : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${isSelectMode ? (isSelected ? "Deselect" : "Select") : "Play"} ${isDoorbell ? "doorbell" : "motion"} recording from ${recording.camera} at ${recording.date} ${formatTime(recording.file)}`}
    >
      <div className="recording-card__thumbnail">
        {isSelectMode && (
          <span
            className={`recording-card__checkbox${isSelected ? " recording-card__checkbox--checked" : ""}`}
            aria-hidden="true"
          />
        )}
        {recording.snapshot_key ? (
          <img
            src={`/api/recordings/${recording.snapshot_key}`}
            alt={`Snapshot from ${recording.camera}`}
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className="recording-card__placeholder-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        <span className="recording-card__camera-badge">{recording.camera}</span>
        <span className="recording-card__time-badge">{formatTime(recording.file)}</span>
        {isDoorbell && (
          <span className="recording-card__doorbell-badge" aria-label="Doorbell ring">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            Doorbell
          </span>
        )}

        <div className="recording-card__play-overlay">
          <svg className="recording-card__play-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>

      <div className="recording-card__body">
        <div className="recording-card__description">
          {recording.description || "No description available"}
        </div>
        <div className="recording-card__meta">
          <span>{recording.date}</span>
          <span>{formatSize(recording.size)}</span>
        </div>
      </div>
    </div>
  );
}
