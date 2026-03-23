import { useEffect, useRef } from "react";
import { useTimeline } from "../../hooks/useTimeline";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import TimelineTopBar from "./TimelineTopBar";
import TimelinePlayer from "./TimelinePlayer";
import "./TimelinePlayer.css";
import TimelineBar from "./TimelineBar";

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
    counts,
    selectedRecording,
    setSelectedRecording,
    loading,
    error,
    reload,
  } = useTimeline();

  useKeyboardShortcuts({ recordings, selectedRecording, setSelectedRecording });

  const hasRestoredRef = useRef(false);

  // On mount, restore selection from URL hash
  useEffect(() => {
    if (hasRestoredRef.current || loading || recordings.length === 0) return;
    hasRestoredRef.current = true;

    const id = parseHashRecordingId();
    if (id === null) return;

    const match = recordings.find((r) => r.id === id);
    if (match) {
      setSelectedRecording(match);
    }
  }, [loading, recordings, setSelectedRecording]);

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
      />
    </div>
  );
}
