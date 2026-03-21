import { useState, useEffect, useCallback, useRef } from "react";
import type { TimelineRecording, TimeRange } from "../components/timeline/TimelineBar";

export interface RecordingCounts {
  motion: number;
  doorbell: number;
  total: number;
}

const CAMERA_STORAGE_KEY = "timeline-selected-camera";

function defaultTimeRange(): TimeRange {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from, to };
}

export function useTimeline() {
  const [cameras, setCameras] = useState<string[]>([]);
  const [camera, setCamera] = useState<string>("");
  const [eventType, setEventType] = useState<string>("");
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultTimeRange);
  const [recordings, setRecordings] = useState<TimelineRecording[]>([]);
  const [counts, setCounts] = useState<RecordingCounts>({ motion: 0, doorbell: 0, total: 0 });
  const [selectedRecording, setSelectedRecording] = useState<TimelineRecording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch camera list on mount, then set default camera
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/recordings/cameras", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch cameras");
        return res.json();
      })
      .then((data: string[]) => {
        setCameras(data);
        const saved = localStorage.getItem(CAMERA_STORAGE_KEY);
        if (saved && data.includes(saved)) {
          setCamera(saved);
        } else if (data.length > 0) {
          setCamera(data[0]);
        }
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") {
          console.warn("[timeline] camera list unavailable:", err.message);
        }
      });
    return () => controller.abort();
  }, []);

  // Persist camera selection
  useEffect(() => {
    if (camera) {
      localStorage.setItem(CAMERA_STORAGE_KEY, camera);
    }
  }, [camera]);

  // Fetch timeline recordings and counts when params change
  const fetchData = useCallback(async () => {
    if (!camera) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      camera,
      from: timeRange.from.toISOString(),
      to: timeRange.to.toISOString(),
    });
    if (eventType) params.set("eventType", eventType);

    const countParams = new URLSearchParams({
      camera,
      from: timeRange.from.toISOString(),
      to: timeRange.to.toISOString(),
    });

    try {
      const [timelineRes, countsRes] = await Promise.all([
        fetch(`/api/recordings/timeline?${params}`, { signal: controller.signal }),
        fetch(`/api/recordings/counts?${countParams}`, { signal: controller.signal }),
      ]);

      if (!timelineRes.ok) throw new Error("Failed to fetch timeline data");
      if (!countsRes.ok) throw new Error("Failed to fetch counts");

      const [timelineData, countsData] = await Promise.all([
        timelineRes.json() as Promise<TimelineRecording[]>,
        countsRes.json() as Promise<RecordingCounts>,
      ]);

      if (!controller.signal.aborted) {
        setRecordings(timelineData);
        setCounts(countsData);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
        setRecordings([]);
        setCounts({ motion: 0, doorbell: 0, total: 0 });
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [camera, timeRange, eventType]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  return {
    recordings,
    loading,
    error,
    selectedRecording,
    setSelectedRecording,
    timeRange,
    setTimeRange,
    counts,
    cameras,
    camera,
    setCamera,
    eventType,
    setEventType,
    reload: fetchData,
  };
}
