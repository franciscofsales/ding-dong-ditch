interface TimelinePlayerProps {
  currentTime: Date;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
}

export default function TimelinePlayer({ currentTime, isPlaying, onPlay, onPause }: TimelinePlayerProps) {
  return (
    <div className="timeline-player">
      <div className="timeline-player__viewport">
        <div className="timeline-player__placeholder">
          <span>{currentTime.toLocaleTimeString()}</span>
        </div>
      </div>
      <div className="timeline-player__controls">
        <button
          className="btn btn-sm"
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
      </div>
    </div>
  );
}
