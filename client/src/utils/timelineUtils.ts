import type { TimeRange, TimelineRecording } from "../components/timeline/TimelineBar";

export interface HitTestResult {
  type: "recording" | "gap";
  recording?: TimelineRecording;
  time: Date;
}

/**
 * Convert a pixel position on the timeline track to a timestamp.
 * Pure arithmetic — O(1).
 */
export function pixelToTime(
  pixelX: number,
  trackWidthPx: number,
  timeRange: TimeRange,
): Date {
  const rangeMs = timeRange.to.getTime() - timeRange.from.getTime();
  const fraction = Math.max(0, Math.min(1, pixelX / trackWidthPx));
  return new Date(timeRange.from.getTime() + fraction * rangeMs);
}

/**
 * Hit-test a timestamp against a sorted list of recordings.
 * Returns the closest recording within `toleranceMs`, or a gap result.
 * Uses binary search — O(log n).
 */
export function hitTestRecording(
  time: Date,
  recordings: TimelineRecording[],
  toleranceMs: number = 30_000,
): HitTestResult {
  const targetMs = time.getTime();

  if (recordings.length === 0) {
    return { type: "gap", time };
  }

  // Binary search for the closest recording
  let lo = 0;
  let hi = recordings.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const midMs = new Date(recordings[mid].timestamp).getTime();
    if (midMs < targetMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Check lo and lo-1 for the closest match
  let bestIdx = lo;
  let bestDist = Math.abs(new Date(recordings[lo].timestamp).getTime() - targetMs);

  if (lo > 0) {
    const prevDist = Math.abs(new Date(recordings[lo - 1].timestamp).getTime() - targetMs);
    if (prevDist < bestDist) {
      bestIdx = lo - 1;
      bestDist = prevDist;
    }
  }

  if (bestDist <= toleranceMs) {
    return { type: "recording", recording: recordings[bestIdx], time };
  }

  return { type: "gap", time };
}

export type ZoomLevel = "minutes" | "hours" | "days";

/**
 * Determine the zoom level category from a time range.
 */
export function getZoomLevel(timeRange: TimeRange): ZoomLevel {
  const rangeMs = timeRange.to.getTime() - timeRange.from.getTime();
  const rangeHours = rangeMs / (1000 * 60 * 60);
  if (rangeHours <= 2) return "minutes";
  if (rangeHours <= 48) return "hours";
  return "days";
}

/**
 * Format a timestamp for display in a tooltip, adapting detail based on zoom level.
 * - minutes zoom: "3:45:12 PM" (includes seconds)
 * - hours zoom: "3:45 PM"
 * - days zoom: "Mar 15, 3:45 PM"
 */
export function formatTooltipTime(time: Date, zoomLevel: ZoomLevel): string {
  switch (zoomLevel) {
    case "minutes":
      return time.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
    case "hours":
      return time.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    case "days":
      return time.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
  }
}
