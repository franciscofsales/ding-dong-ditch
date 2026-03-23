export interface TimeRange {
  from: Date;
  to: Date;
}

export interface TimelineRecording {
  id: number;
  timestamp: string;
  event_type: string | null;
  snapshot_key: string | null;
  path: string;
}

export interface HitTestResult {
  recording: TimelineRecording;
  offsetRatio: number;
}

/**
 * Convert a pixel x-offset within the timeline container to a Date.
 * Values are clamped to the time range boundaries.
 */
export function pixelToTime(
  xOffset: number,
  containerWidth: number,
  timeRange: TimeRange,
): Date {
  if (containerWidth <= 0) return new Date(timeRange.from);

  const ratio = Math.max(0, Math.min(1, xOffset / containerWidth));
  const fromMs = timeRange.from.getTime();
  const toMs = timeRange.to.getTime();
  return new Date(fromMs + ratio * (toMs - fromMs));
}

/**
 * Hit-test a timestamp against a sorted list of recordings.
 * If the timestamp falls within a recording's duration window, returns
 * the recording and the proportional offset within it.
 * If in a gap, returns the nearest recording with offsetRatio = 0.
 * Returns null for an empty recordings array.
 *
 * @param timestamp - The time to test (Date or ms since epoch)
 * @param recordings - Array of recordings (need not be pre-sorted)
 * @param durationMs - Duration of each recording in ms (default 30 000)
 */
export function hitTestRecording(
  timestamp: Date | number,
  recordings: TimelineRecording[],
  durationMs: number = 30_000,
): HitTestResult | null {
  if (recordings.length === 0) return null;

  const targetMs = typeof timestamp === "number" ? timestamp : timestamp.getTime();

  // Sort by timestamp ascending
  const sorted = [...recordings].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  let nearest: TimelineRecording | null = null;
  let nearestDistance = Infinity;

  for (const rec of sorted) {
    const recStart = new Date(rec.timestamp).getTime();
    const recEnd = recStart + durationMs;

    // Within this recording's duration window
    if (targetMs >= recStart && targetMs <= recEnd) {
      const offsetRatio = (targetMs - recStart) / durationMs;
      return { recording: rec, offsetRatio };
    }

    const distance = Math.min(
      Math.abs(targetMs - recStart),
      Math.abs(targetMs - recEnd),
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = rec;
    }
  }

  return nearest ? { recording: nearest, offsetRatio: 0 } : null;
}

/**
 * Format a Date for tooltip display. The format adapts to the zoom level
 * (range in ms):
 * - < 1 hour: show seconds (HH:MM:SS)
 * - < 1 day: show hours + minutes (HH:MM)
 * - >= 1 day: show date + time (MMM D, HH:MM)
 */
export function formatTooltipTime(date: Date, rangeMs: number): string {
  if (rangeMs < 60 * 60 * 1000) {
    // Sub-hour: include seconds
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  if (rangeMs < 24 * 60 * 60 * 1000) {
    // Sub-day: hours + minutes
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  // Multi-day: date + time
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
