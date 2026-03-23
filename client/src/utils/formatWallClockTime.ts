/**
 * Compute the wall-clock time for a given position within a recording.
 *
 * @param recordingTimestamp - ISO-8601 timestamp when the recording started
 * @param currentTime - Playback position in seconds (from the video element)
 * @returns A formatted wall-clock time string, e.g. "2:34:05 PM"
 */
export function formatWallClockTime(
  recordingTimestamp: string,
  currentTime: number,
): string {
  const start = new Date(recordingTimestamp);
  if (isNaN(start.getTime())) return "--:--";

  const wallMs = start.getTime() + currentTime * 1000;
  const wall = new Date(wallMs);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(wall);
}
