import { useEffect, useRef, useState } from "react";
import type { Recording } from "../../types/recording";
import ConfirmDialog from "../ConfirmDialog";

interface TimelinePlayerProps {
  recording: Recording;
  onDelete: (path: string) => void;
}

function formatTime(file: string): string {
  return file.replace(".mp4", "").replace(/-/g, ":");
}

function formatSize(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function formatFullDate(dateStr: string, file: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  return `${formatted} at ${formatTime(file)}`;
}

export default function TimelinePlayer({ recording, onDelete }: TimelinePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setVideoError(false);
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, [recording.path]);

  const isDoorbell = recording.event_type === "doorbell";

  return (
    <div className="timeline-player">
      <div className="timeline-player__video-container">
        {videoError ? (
          <div className="timeline-player__error">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4m0 4h.01" />
            </svg>
            <p>Unable to load video</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            src={`/api/recordings/${recording.path}`}
            onError={() => setVideoError(true)}
          />
        )}
      </div>

      <div className="timeline-player__details">
        <div className="timeline-player__camera">
          {recording.camera}
          <span
            className={`timeline-player__event-badge${isDoorbell ? " timeline-player__event-badge--doorbell" : ""}`}
          >
            {isDoorbell ? "Doorbell ring" : "Motion"}
          </span>
        </div>
        <div className="timeline-player__datetime">
          {formatFullDate(recording.date, recording.file)}
        </div>
        {recording.description && (
          <div className="timeline-player__description">{recording.description}</div>
        )}
        <div className="timeline-player__footer">
          <span className="timeline-player__size">{formatSize(recording.size)}</span>
          <button
            className="btn btn-danger"
            onClick={() => setShowDeleteConfirm(true)}
            aria-label="Delete this recording"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete recording"
          message="Delete this recording? This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDelete(recording.path);
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
