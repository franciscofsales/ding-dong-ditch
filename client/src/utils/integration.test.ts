import { describe, it, expect } from "vitest";
import { formatWallClockTime } from "./formatWallClockTime";
import { findLatestRecording, resolveAutoJump } from "./timeline";
import type { TimelineRecording } from "../types/timeline";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecording(
  overrides: Partial<TimelineRecording> & { id: number; timestamp: string },
): TimelineRecording {
  return {
    event_type: "motion",
    snapshot_key: null,
    path: `2026-03-23/front_door/12-00-00.mp4`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatWallClockTime
// ---------------------------------------------------------------------------

describe("formatWallClockTime", () => {
  it("returns formatted wall-clock time at playback start (currentTime=0)", () => {
    // 2026-03-23T14:30:00Z  →  the wall-clock time should match the recording start
    const result = formatWallClockTime("2026-03-23T14:30:00Z", 0);
    // We cannot assert exact locale output (TZ-dependent), but it should contain "30"
    // for the minutes and "00" for the seconds.
    expect(result).toContain("30");
    expect(result).toContain("00");
  });

  it("advances wall-clock time by the currentTime offset", () => {
    const result = formatWallClockTime("2026-03-23T14:30:00Z", 90); // +1:30
    // Should now show :31:30
    expect(result).toContain("31");
    expect(result).toContain("30");
  });

  it("handles fractional seconds gracefully", () => {
    const result = formatWallClockTime("2026-03-23T14:30:00Z", 0.5);
    // Still in the :30:00 second; the formatter truncates sub-seconds
    expect(result).toContain("30");
  });

  it("returns placeholder for invalid timestamps", () => {
    expect(formatWallClockTime("not-a-date", 10)).toBe("--:--");
  });

  it("works with realistic recording timestamps from different times of day", () => {
    // Early morning recording
    const morning = formatWallClockTime("2026-03-23T06:15:00Z", 30);
    expect(morning).toContain("15");
    expect(morning).toContain("30");

    // Late night recording
    const night = formatWallClockTime("2026-03-23T23:59:00Z", 120); // +2 min → crosses midnight
    // After adding 2 minutes to 23:59, we get 00:01 next day
    expect(night).toContain("01");
  });
});

// ---------------------------------------------------------------------------
// findLatestRecording
// ---------------------------------------------------------------------------

describe("findLatestRecording", () => {
  it("returns null for an empty array", () => {
    expect(findLatestRecording([])).toBeNull();
  });

  it("returns the single recording when array has one element", () => {
    const rec = makeRecording({ id: 1, timestamp: "2026-03-23T10:00:00Z" });
    expect(findLatestRecording([rec])).toBe(rec);
  });

  it("returns the recording with the latest timestamp", () => {
    const old = makeRecording({ id: 1, timestamp: "2026-03-22T08:00:00Z" });
    const mid = makeRecording({ id: 2, timestamp: "2026-03-23T12:00:00Z" });
    const latest = makeRecording({ id: 3, timestamp: "2026-03-23T18:00:00Z" });

    // Pass in non-chronological order to ensure sorting works
    expect(findLatestRecording([mid, latest, old])).toBe(latest);
  });

  it("returns the first encountered when timestamps are identical", () => {
    const a = makeRecording({ id: 1, timestamp: "2026-03-23T10:00:00Z" });
    const b = makeRecording({ id: 2, timestamp: "2026-03-23T10:00:00Z" });

    // reduce keeps the current "latest" when equal, so the first one wins
    expect(findLatestRecording([a, b])).toBe(a);
  });

  it("handles recordings spanning multiple days", () => {
    const recs = [
      makeRecording({ id: 1, timestamp: "2026-03-20T23:59:59Z" }),
      makeRecording({ id: 2, timestamp: "2026-03-21T00:00:01Z" }),
      makeRecording({ id: 3, timestamp: "2026-03-19T12:00:00Z" }),
    ];
    expect(findLatestRecording(recs)!.id).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// resolveAutoJump
// ---------------------------------------------------------------------------

describe("resolveAutoJump", () => {
  const recordings = [
    makeRecording({ id: 1, timestamp: "2026-03-23T08:00:00Z" }),
    makeRecording({ id: 2, timestamp: "2026-03-23T12:00:00Z" }),
    makeRecording({ id: 3, timestamp: "2026-03-23T18:00:00Z" }),
  ];

  it("auto-jumps to the latest recording on first load", () => {
    const result = resolveAutoJump(recordings, null, false);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(3); // latest
  });

  it("preserves existing selection even if not the latest", () => {
    const current = recordings[0]; // oldest
    const result = resolveAutoJump(recordings, current, false);
    expect(result).toBe(current);
  });

  it("does not re-jump after auto-jump has already occurred", () => {
    const result = resolveAutoJump(recordings, null, true);
    expect(result).toBeNull();
  });

  it("returns null when recordings are empty", () => {
    expect(resolveAutoJump([], null, false)).toBeNull();
  });

  it("returns null when recordings are empty and hasJumped is true", () => {
    expect(resolveAutoJump([], null, true)).toBeNull();
  });

  it("preserves selection even after hasJumped is true", () => {
    const current = recordings[1];
    const result = resolveAutoJump(recordings, current, true);
    expect(result).toBe(current);
  });
});
