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
        <button className="live-player__end-btn" onClick={onEndLive}>
          End Live
        </button>
      </div>
    </div>
  );
}
