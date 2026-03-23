import type { TimelineRecording } from "../types/timeline";

/**
 * Find the most recent recording by timestamp.
 *
 * @param recordings - Array of timeline recordings (may be empty)
 * @returns The recording with the latest timestamp, or null if empty
 */
export function findLatestRecording(
  recordings: TimelineRecording[],
): TimelineRecording | null {
  if (recordings.length === 0) return null;

  return recordings.reduce((latest, rec) =>
    new Date(rec.timestamp).getTime() > new Date(latest.timestamp).getTime()
      ? rec
      : latest,
  );
}

/**
 * Resolve the auto-jump target for the timeline view.
 *
 * On first invocation (when `current` is null and `hasJumped` is false),
 * returns the latest recording so the player auto-selects it.
 * On subsequent calls (or when a recording is already selected), preserves
 * the current selection to avoid hijacking user navigation.
 *
 * @param recordings - Available recordings
 * @param current - Currently selected recording (null if none)
 * @param hasJumped - Whether auto-jump has already occurred
 * @returns The recording to select, or null
 */
export function resolveAutoJump(
  recordings: TimelineRecording[],
  current: TimelineRecording | null,
  hasJumped: boolean,
): TimelineRecording | null {
  // If user already has a selection, preserve it
  if (current !== null) return current;

  // If auto-jump already fired, don't re-jump
  if (hasJumped) return null;

  // First load: jump to the latest recording
  return findLatestRecording(recordings);
}
