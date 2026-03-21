interface TimelineBarProps {
  currentTime: Date;
  onSeek: (time: Date) => void;
}

export default function TimelineBar({ currentTime, onSeek }: TimelineBarProps) {
  return (
    <div className="timeline-bar">
      <div className="timeline-bar__axis">
        <span className="timeline-bar__now-indicator">
          {currentTime.toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
