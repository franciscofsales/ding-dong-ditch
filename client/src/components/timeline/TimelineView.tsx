import { useEffect, useRef, useState, useCallback } from "react";
import { useTimeline } from "../../hooks/useTimeline";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useThumbnailVideo } from "../../hooks/useThumbnailVideo";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useLiveStream } from "../../hooks/useLiveStream";
import { captureFrame } from "../../utils/captureFrame";
import { ThumbnailCache } from "../../utils/thumbnailCache";
import type { TimelineRecording } from "./TimelineBar";
import TimelineTopBar from "./TimelineTopBar";
import TimelinePlayer from "./TimelinePlayer";
import LivePlayer from "./LivePlayer";
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

  const liveStream = useLiveStream();

  // Track whether the user has explicitly started a live session
  const [isLive, setIsLive] = useState(false);

  // Derived display states (Task 4.4)
  const isLiveActive =
    isLive &&
    ["connecting", "buffering", "live"].includes(liveStream.state);
  const isLivePaused =
    isLive && liveStream.state === "paused";

  // Start live stream
  const handleGoLive = useCallback(() => {
    if (!camera) return;
    setIsLive(true);
    setSelectedRecording(null);
    liveStream.start(camera);
  }, [camera, liveStream, setSelectedRecording]);

  // End live stream
  const handleEndLive = useCallback(() => {
    setIsLive(false);
    liveStream.stop();
  }, [liveStream]);

  // Pause live on recording select (Task 4.1)
  const handleSelectRecording = useCallback(
    (recording: TimelineRecording | null, ratio?: number) => {
      if (recording && isLive && ["connecting", "buffering", "live"].includes(liveStream.state)) {
        liveStream.pause();
      }
      setSelectedRecording(recording, ratio);
    },
    [isLive, liveStream, setSelectedRecording],
  );

  // Return to live handler with stale session handling (Task 4.2 + 4.3)
  const handleReturnToLive = useCallback(() => {
    setSelectedRecording(null);
    // If the WS died while we were paused, start a new session
    if (liveStream.state === "error" || liveStream.state === "idle") {
      if (camera) {
        liveStream.start(camera);
      }
    } else {
      liveStream.resume();
    }
  }, [camera, liveStream, setSelectedRecording]);

  useKeyboardShortcuts({ recordings, selectedRecording, setSelectedRecording });

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

  // No auto-select on initial load — user lands on empty player
  // with Go Live button visible. They can click a recording or go live.

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

  // Render the player area.
  // LivePlayer stays mounted (hidden) during pause so the <video> element
  // and MSE SourceBuffer survive — avoiding black screen on resume.
  const isLiveSessionActive = isLive && liveStream.state !== "idle";

  const renderPlayerArea = () => {
    return (
      <>
        {/* LivePlayer: always mounted when a live session exists, hidden when paused */}
        {isLiveSessionActive && (
          <div style={isLivePaused ? { display: "none" } : undefined}>
            <LivePlayer
              camera={camera}
              state={liveStream.state}
              videoRef={liveStream.videoRef}
              onEndLive={handleEndLive}
            />
          </div>
        )}

        {/* Recording player or empty state: shown when not live or when live is paused */}
        {(!isLiveSessionActive || isLivePaused) && (
          <>
            {recordings.length === 0 && !loading && !isLivePaused ? (
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
                  if (idx > 0) handleSelectRecording(recordings[idx - 1]);
                }}
                onNext={() => {
                  const idx = recordings.findIndex((r) => r.id === selectedRecording?.id);
                  if (idx >= 0 && idx < recordings.length - 1) handleSelectRecording(recordings[idx + 1]);
                }}
                onDelete={async (rec) => {
                  try {
                    const [date, cam, file] = rec.path.split("/");
                    await fetch(`/api/recordings/${date}/${cam}/${file}`, { method: "DELETE" });
                    handleSelectRecording(null);
                    reload();
                  } catch {
                    // Error handling is in the player component
                  }
                }}
                onReturnToLive={isLivePaused ? handleReturnToLive : undefined}
              />
            )}
          </>
        )}
      </>
    );
  };

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
      {renderPlayerArea()}
      <TimelineBar
        timeRange={timeRange}
        recordings={recordings}
        selectedRecordingId={selectedRecording?.id ?? null}
        onSelect={handleSelectRecording}
        centeredRecordingId={selectedRecording?.id ?? null}
        thumbnailUrl={thumbnailUrl}
        thumbnailLoading={thumbnailLoading}
        onHoverRecording={handleHoverRecording}
        isLive={isLiveActive}
        onGoLive={handleGoLive}
      />
    </div>
  );
}
