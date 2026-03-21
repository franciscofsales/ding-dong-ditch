interface TimelineTopBarProps {
  selectedCamera: string;
  onCameraChange: (camera: string) => void;
  cameras: string[];
}

export default function TimelineTopBar({ selectedCamera, onCameraChange, cameras }: TimelineTopBarProps) {
  return (
    <div className="timeline-topbar">
      <select
        className="timeline-topbar__camera-select"
        value={selectedCamera}
        onChange={(e) => onCameraChange(e.target.value)}
      >
        <option value="">All cameras</option>
        {cameras.map((cam) => (
          <option key={cam} value={cam}>{cam}</option>
        ))}
      </select>
    </div>
  );
}
