import { useState, useEffect } from "react";
import type { LiveState } from "../../hooks/useLiveStream";
import "./LivePlayer.css";

function useCurrentTime() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return time;
}

interface LivePlayerProps {
  camera: string;
  state: LiveState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onEndLive: () => void;
}

/**
 * Displays the live camera stream via a <video> element driven by MSE.
 * The videoRef is managed by useLiveStream and must be attached to the
 * video element so that MediaSource can be bound before the metadata
 * message arrives over the WebSocket.
 */
export default function LivePlayer({ camera, state, videoRef, onEndLive }: LivePlayerProps) {
  const currentTime = useCurrentTime();
  const showOverlay = state === "connecting" || state === "buffering";
  const timeString = currentTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="timeline-player live-player">
      <div className="timeline-player__video-wrapper live-player__video-wrapper">
        {/* The video element is always rendered so videoRef is available
            when the WS metadata message arrives and MSE is initialized. */}
        <video
          ref={videoRef}
          className="live-player__video"
          autoPlay
          muted
          playsInline
        />

        {/* Status overlays on top of the video */}
        {showOverlay && (
          <div className="live-player__overlay">
            <div className="live-player__spinner" />
            <div className="live-player__status">
              {state === "connecting" ? `Connecting to ${camera}...` : "Buffering..."}
            </div>
          </div>
        )}

        {state === "live" && (
          <div className="live-player__badge">
            <span className="live-player__badge-dot" />
            LIVE
          </div>
        )}

        {state === "live" && (
          <div className="live-player__camera-info">
            <span>{camera.replace(/_/g, " ")}</span>
            <span className="live-player__timestamp">{timeString}</span>
          </div>
        )}

        {state === "error" && (
          <div className="live-player__overlay live-player__overlay--error">
            <div className="live-player__status">Connection lost</div>
          </div>
        )}
      </div>

      <div className="live-player__controls">
        <span className="live-player__camera-name">{camera.replace(/_/g, " ")}</span>
        <button className="live-player__end-btn" onClick={onEndLive}>
          End Live
        </button>
      </div>
    </div>
  );
}
