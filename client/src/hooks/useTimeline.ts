import { useState, useCallback } from "react";

export interface TimelineState {
  currentTime: Date;
  selectedCamera: string;
  isPlaying: boolean;
  cameras: string[];
}

export function useTimeline() {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [selectedCamera, setSelectedCamera] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [cameras, setCameras] = useState<string[]>([]);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const seek = useCallback((time: Date) => {
    setCurrentTime(time);
  }, []);

  return {
    currentTime,
    selectedCamera,
    setSelectedCamera,
    isPlaying,
    cameras,
    setCameras,
    play,
    pause,
    seek,
  };
}
