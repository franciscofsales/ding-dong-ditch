<<<<<<< HEAD
import { useEffect, useRef, useState } from "react";
import type { LiveStreamState } from "../../hooks/useLiveStream";
import "./LivePlayer.css";

interface LivePlayerProps {
  cameraName: string;
  liveState: LiveStreamState;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onEndLive: () => void;
  onRetry: () => void;
}

const MAX_RETRIES = 2;

function CurrentTime() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="live-player__time">
      {new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(now)}
    </span>
  );
}

export default function LivePlayer({
  cameraName,
  liveState,
  error,
  videoRef,
  onEndLive,
  onRetry,
}: LivePlayerProps) {
  const retryCountRef = useRef(0);

  // Reset retry count when we successfully go live
  useEffect(() => {
    if (liveState === "live") {
      retryCountRef.current = 0;
    }
  }, [liveState]);

  // Track retries on error
  useEffect(() => {
    if (liveState === "error") {
      retryCountRef.current += 1;
    }
  }, [liveState]);

  const retriesExhausted = retryCountRef.current >= MAX_RETRIES && liveState === "error";

  if (liveState === "connecting" || liveState === "buffering") {
    return (
      <div className="live-player">
        <div className="live-player__loading">
          <div className="live-player__spinner" />
          <span className="live-player__loading-text">
            {liveState === "connecting"
              ? "Connecting to camera..."
              : "Buffering..."}
          </span>
        </div>
        <div className="live-player__bottom">
          <span className="live-player__status-text">{cameraName}</span>
          <button className="live-player__end-btn" onClick={onEndLive}>
            End Live
          </button>
        </div>
      </div>
    );
  }

  if (liveState === "error") {
    return (
      <div className="live-player">
        <div className="live-player__error">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {retriesExhausted ? (
            <>
              <span className="live-player__error-message">Camera offline</span>
              <span className="live-player__error-sub">
                Unable to connect after multiple attempts
              </span>
            </>
          ) : (
            <>
              <span className="live-player__error-message">
                {error ?? "Connection lost"}
              </span>
              <button className="live-player__retry-btn" onClick={onRetry}>
                Retry
              </button>
            </>
          )}
        </div>
        <div className="live-player__bottom">
          <span className="live-player__status-text">{cameraName}</span>
          <button className="live-player__end-btn" onClick={onEndLive}>
            End Live
          </button>
        </div>
      </div>
    );
  }

  // live or paused state
  return (
    <div className="live-player">
      <div
        className={`live-player__video-wrapper${
          liveState === "paused" ? " live-player__video-wrapper--paused" : ""
        }`}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
        />
        <div className="live-player__overlay">
          <span className="live-player__badge">
            <span className="live-player__badge-dot" />
            LIVE
          </span>
          <div className="live-player__info">
            <span className="live-player__camera-name">{cameraName}</span>
            <CurrentTime />
          </div>
        </div>
      </div>
      <div className="live-player__bottom">
        <span className="live-player__status-text">
          {liveState === "paused" ? "Paused" : "Live"}
        </span>
=======
import type { LiveStreamState } from "../../hooks/useLiveStream";
import "./TimelinePlayer.css";

interface LivePlayerProps {
  camera: string;
  state: LiveStreamState;
  onEndLive: () => void;
}

/**
 * Displays the live camera stream.
 * Currently renders a placeholder with connection state while
 * the WebSocket/RTSP streaming infrastructure is built out.
 */
export default function LivePlayer({ camera, state, onEndLive }: LivePlayerProps) {
  return (
    <div className="timeline-player">
      <div className="timeline-player__video-wrapper live-player__video-wrapper">
        <div className="live-player__stream-area">
          {state === "connecting" && (
            <div className="live-player__status">Connecting to {camera}...</div>
          )}
          {state === "buffering" && (
            <div className="live-player__status">Buffering...</div>
          )}
          {state === "live" && (
            <div className="live-player__status live-player__status--live">
              <span className="live-player__live-dot" />
              LIVE
            </div>
          )}
          {state === "error" && (
            <div className="live-player__status live-player__status--error">
              Connection lost
            </div>
          )}
        </div>
      </div>
      <div className="live-player__controls">
        <span className="live-player__camera-name">{camera}</span>
>>>>>>> worktree-agent-a65d213c
        <button className="live-player__end-btn" onClick={onEndLive}>
          End Live
        </button>
      </div>
    </div>
  );
}
