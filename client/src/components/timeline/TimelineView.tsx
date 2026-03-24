import { useEffect, useRef, useState, useCallback } from "react";
import { useTimeline } from "../../hooks/useTimeline";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useThumbnailVideo } from "../../hooks/useThumbnailVideo";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { captureFrame } from "../../utils/captureFrame";
import { ThumbnailCache } from "../../utils/thumbnailCache";
import type { TimelineRecording } from "./TimelineBar";
import TimelineTopBar from "./TimelineTopBar";
import TimelinePlayer from "./TimelinePlayer";
import "./TimelinePlayer.css";
import TimelineBar from "./TimelineBar";

const thumbCache = new ThumbnailCache(50);

function parseHashRecordingId(): number | null {
  const qs = window.location.hash.split("?")[1] || "";
  const params = new URLSearchParams(qs);
  const raw = params.get("id");
  if (raw === null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

export default function TimelineView() {
  const {
    cameras,
    camera,
    setCamera,
    eventType,
    setEventType,
    timePreset,
    setTimePreset,
    timeRange,
    setCustomTimeRange,
    recordings,
    latestRecording,
    counts,
    selectedRecording,
    setSelectedRecording,
    seekRatio,
    loading,
    error,
    reload,
  } = useTimeline();

  useKeyboardShortcuts({ recordings, selectedRecording, setSelectedRecording });

  const [isLive, setIsLive] = useState(false);

  const handleGoLive = useCallback(() => {
    if (!isLive) setIsLive(true);
  }, [isLive]);

  const hasRestoredRef = useRef(false);
  const hasAutoJumpedRef = useRef(false);

  // On mount, restore selection from URL hash
  useEffect(() => {
    if (hasRestoredRef.current || loading || recordings.length === 0) return;
    hasRestoredRef.current = true;

    const id = parseHashRecordingId();
    if (id === null) return;

    const match = recordings.find((r) => r.id === id);
    if (match) {
      setSelectedRecording(match);
      // URL hash restore counts as auto-jump so we don't override it
      hasAutoJumpedRef.current = true;
    }
  }, [loading, recordings, setSelectedRecording]);

  // Auto-select latest recording on first data load
  useEffect(() => {
    if (hasAutoJumpedRef.current || loading || recordings.length === 0) return;
    if (!latestRecording) return;

    hasAutoJumpedRef.current = true;
    setSelectedRecording(latestRecording);
  }, [loading, recordings, latestRecording, setSelectedRecording]);

  // Thumbnail preview state
  const [hoverRecording, setHoverRecording] = useState<{ recording: TimelineRecording; offsetRatio: number } | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailLoading, setThumbnailLoading] = useState(false);

  const debouncedHover = useDebouncedValue(hoverRecording, 150);

  const { requestFrame, videoElement, isReady } = useThumbnailVideo({
    onFrameReady: useCallback((video: HTMLVideoElement) => {
      const dataUrl = captureFrame(video);
      if (dataUrl && debouncedHover) {
        const key = ThumbnailCache.makeKey(debouncedHover.recording.path, debouncedHover.offsetRatio);
        thumbCache.set(key, dataUrl);
        setThumbnailUrl(dataUrl);
      }
      setThumbnailLoading(false);
    }, [debouncedHover]),
  });

  // When debounced hover changes, request a thumbnail frame
  useEffect(() => {
    if (!debouncedHover) {
      setThumbnailUrl(null);
      setThumbnailLoading(false);
      return;
    }

    const key = ThumbnailCache.makeKey(debouncedHover.recording.path, debouncedHover.offsetRatio);
    const cached = thumbCache.get(key);
    if (cached) {
      setThumbnailUrl(cached);
      setThumbnailLoading(false);
      return;
    }

    setThumbnailLoading(true);
    requestFrame(debouncedHover.recording.path, debouncedHover.offsetRatio);
  }, [debouncedHover, requestFrame]);

  const handleHoverRecording = useCallback((recording: TimelineRecording | null, offsetRatio: number) => {
    if (recording) {
      setHoverRecording({ recording, offsetRatio });
    } else {
      setHoverRecording(null);
    }
  }, []);

  // Sync selectedRecording changes to URL hash
  useEffect(() => {
    if (selectedRecording) {
      window.location.hash = `recordings?id=${selectedRecording.id}`;
    } else if (hasRestoredRef.current) {
      window.location.hash = "recordings";
    }
  }, [selectedRecording]);

  return (
    <div className="timeline-view">
      <TimelineTopBar
        cameras={cameras}
        selectedCamera={camera}
        onCameraChange={setCamera}
        timePreset={timePreset}
        onTimePresetChange={setTimePreset}
        onCustomTimeRange={setCustomTimeRange}
        timeRange={timeRange}
        eventType={eventType as "" | "doorbell" | "motion"}
        onEventTypeChange={setEventType}
        counts={counts}
      />
      {recordings.length === 0 && !loading ? (
        <div className="timeline-player">
          <div className="timeline-player__empty">
            <svg
              className="timeline-player__empty-icon"
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <h3 className="timeline-player__empty-title">No recordings found</h3>
            <p className="timeline-player__empty-subtitle">
              Try adjusting your filters or selecting a different time range
            </p>
          </div>
        </div>
      ) : (
        <TimelinePlayer
          recording={selectedRecording}
          seekRatio={seekRatio}
          onPrevious={() => {
            const idx = recordings.findIndex((r) => r.id === selectedRecording?.id);
            if (idx > 0) setSelectedRecording(recordings[idx - 1]);
          }}
          onNext={() => {
            const idx = recordings.findIndex((r) => r.id === selectedRecording?.id);
            if (idx >= 0 && idx < recordings.length - 1) setSelectedRecording(recordings[idx + 1]);
          }}
          onDelete={async (rec) => {
            try {
              const [date, cam, file] = rec.path.split("/");
              await fetch(`/api/recordings/${date}/${cam}/${file}`, { method: "DELETE" });
              setSelectedRecording(null);
              reload();
            } catch {
              // Error handling is in the player component
            }
          }}
        />
      )}
      <TimelineBar
        timeRange={timeRange}
        recordings={recordings}
        selectedRecordingId={selectedRecording?.id ?? null}
        onSelect={setSelectedRecording}
        centeredRecordingId={selectedRecording?.id ?? null}
        thumbnailUrl={thumbnailUrl}
        thumbnailLoading={thumbnailLoading}
        onHoverRecording={handleHoverRecording}
        isLive={isLive}
        onGoLive={handleGoLive}
      />
    </div>
  );
}
