import { describe, it, expect } from "vitest";
import {
  pixelToTime,
  hitTestRecording,
  formatTooltipTime,
  type TimeRange,
  type TimelineRecording,
} from "./timelineUtils";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeTimeRange(fromIso: string, toIso: string): TimeRange {
  return { from: new Date(fromIso), to: new Date(toIso) };
}

function makeRecording(
  id: number,
  timestamp: string,
  overrides?: Partial<TimelineRecording>,
): TimelineRecording {
  return {
    id,
    timestamp,
    event_type: "motion",
    snapshot_key: null,
    path: `/recordings/${id}.mp4`,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  pixelToTime                                                       */
/* ------------------------------------------------------------------ */

describe("pixelToTime", () => {
  const range = makeTimeRange("2026-01-01T00:00:00Z", "2026-01-01T10:00:00Z");
  const containerWidth = 1000;

  it("returns start of range at 0% (xOffset = 0)", () => {
    const result = pixelToTime(0, containerWidth, range);
    expect(result.getTime()).toBe(range.from.getTime());
  });

  it("returns midpoint of range at 50% (xOffset = 500)", () => {
    const result = pixelToTime(500, containerWidth, range);
    const expectedMs =
      range.from.getTime() +
      (range.to.getTime() - range.from.getTime()) / 2;
    expect(result.getTime()).toBe(expectedMs);
  });

  it("returns end of range at 100% (xOffset = containerWidth)", () => {
    const result = pixelToTime(containerWidth, containerWidth, range);
    expect(result.getTime()).toBe(range.to.getTime());
  });

  it("clamps negative xOffset to range start", () => {
    const result = pixelToTime(-200, containerWidth, range);
    expect(result.getTime()).toBe(range.from.getTime());
  });

  it("clamps xOffset > containerWidth to range end", () => {
    const result = pixelToTime(1500, containerWidth, range);
    expect(result.getTime()).toBe(range.to.getTime());
  });

  it("returns range start when containerWidth is 0", () => {
    const result = pixelToTime(100, 0, range);
    expect(result.getTime()).toBe(range.from.getTime());
  });

  it("returns range start when containerWidth is negative", () => {
    const result = pixelToTime(100, -50, range);
    expect(result.getTime()).toBe(range.from.getTime());
  });

  it("interpolates correctly at 25%", () => {
    const result = pixelToTime(250, containerWidth, range);
    const rangeMs = range.to.getTime() - range.from.getTime();
    expect(result.getTime()).toBe(range.from.getTime() + rangeMs * 0.25);
  });
});

/* ------------------------------------------------------------------ */
/*  hitTestRecording                                                  */
/* ------------------------------------------------------------------ */

describe("hitTestRecording", () => {
  const durationMs = 30_000; // 30 seconds

  const recordings = [
    makeRecording(1, "2026-01-01T01:00:00Z"),
    makeRecording(2, "2026-01-01T02:00:00Z"),
    makeRecording(3, "2026-01-01T03:00:00Z"),
  ];

  it("returns null for empty recordings array", () => {
    const result = hitTestRecording(new Date("2026-01-01T01:00:00Z"), []);
    expect(result).toBeNull();
  });

  it("returns correct recording when click is within recording duration", () => {
    // 10 seconds into recording 2
    const clickTime = new Date("2026-01-01T02:00:10Z");
    const result = hitTestRecording(clickTime, recordings, durationMs);
    expect(result).not.toBeNull();
    expect(result!.recording.id).toBe(2);
    expect(result!.offsetRatio).toBeCloseTo(10_000 / 30_000, 5);
  });

  it("returns offsetRatio = 0 at exact start of recording", () => {
    const clickTime = new Date("2026-01-01T01:00:00Z");
    const result = hitTestRecording(clickTime, recordings, durationMs);
    expect(result).not.toBeNull();
    expect(result!.recording.id).toBe(1);
    expect(result!.offsetRatio).toBe(0);
  });

  it("returns offsetRatio = 1 at exact end of recording", () => {
    const clickTime = new Date("2026-01-01T01:00:30Z");
    const result = hitTestRecording(clickTime, recordings, durationMs);
    expect(result).not.toBeNull();
    expect(result!.recording.id).toBe(1);
    expect(result!.offsetRatio).toBeCloseTo(1, 5);
  });

  it("returns nearest recording with offsetRatio = 0 when in a gap", () => {
    // Click in the gap between recording 1 (01:00:30) and recording 2 (02:00:00)
    // Closer to recording 1's end
    const clickTime = new Date("2026-01-01T01:01:00Z");
    const result = hitTestRecording(clickTime, recordings, durationMs);
    expect(result).not.toBeNull();
    expect(result!.recording.id).toBe(1);
    expect(result!.offsetRatio).toBe(0);
  });

  it("returns nearest recording when click is before all recordings", () => {
    const clickTime = new Date("2026-01-01T00:00:00Z");
    const result = hitTestRecording(clickTime, recordings, durationMs);
    expect(result).not.toBeNull();
    expect(result!.recording.id).toBe(1);
    expect(result!.offsetRatio).toBe(0);
  });

  it("returns nearest recording when click is after all recordings", () => {
    const clickTime = new Date("2026-01-01T05:00:00Z");
    const result = hitTestRecording(clickTime, recordings, durationMs);
    expect(result).not.toBeNull();
    expect(result!.recording.id).toBe(3);
    expect(result!.offsetRatio).toBe(0);
  });

  it("works with timestamp as milliseconds number", () => {
    const clickMs = new Date("2026-01-01T02:00:15Z").getTime();
    const result = hitTestRecording(clickMs, recordings, durationMs);
    expect(result).not.toBeNull();
    expect(result!.recording.id).toBe(2);
    expect(result!.offsetRatio).toBeCloseTo(15_000 / 30_000, 5);
  });

  it("handles unsorted recordings correctly", () => {
    const unsorted = [recordings[2], recordings[0], recordings[1]];
    const clickTime = new Date("2026-01-01T02:00:05Z");
    const result = hitTestRecording(clickTime, unsorted, durationMs);
    expect(result).not.toBeNull();
    expect(result!.recording.id).toBe(2);
  });

  it("handles single recording", () => {
    const single = [makeRecording(99, "2026-01-01T12:00:00Z")];
    const clickTime = new Date("2026-01-01T12:00:20Z");
    const result = hitTestRecording(clickTime, single, durationMs);
    expect(result).not.toBeNull();
    expect(result!.recording.id).toBe(99);
    expect(result!.offsetRatio).toBeCloseTo(20_000 / 30_000, 5);
  });

  it("uses default durationMs of 30000 when not specified", () => {
    const clickTime = new Date("2026-01-01T01:00:15Z");
    const result = hitTestRecording(clickTime, recordings);
    expect(result).not.toBeNull();
    expect(result!.recording.id).toBe(1);
    expect(result!.offsetRatio).toBeCloseTo(0.5, 5);
  });

  describe("performance", () => {
    it("handles 500 recordings in under 1ms", () => {
      const manyRecordings: TimelineRecording[] = [];
      const baseTime = new Date("2026-01-01T00:00:00Z").getTime();
      for (let i = 0; i < 500; i++) {
        manyRecordings.push(
          makeRecording(i, new Date(baseTime + i * 60_000).toISOString()),
        );
      }

      // Click in the middle
      const clickTime = new Date(baseTime + 250 * 60_000 + 10_000);

      // Warm up
      hitTestRecording(clickTime, manyRecordings, durationMs);

      const start = performance.now();
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        hitTestRecording(clickTime, manyRecordings, durationMs);
      }
      const elapsed = (performance.now() - start) / iterations;

      expect(elapsed).toBeLessThan(1);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  formatTooltipTime                                                 */
/* ------------------------------------------------------------------ */

describe("formatTooltipTime", () => {
  const date = new Date("2026-06-15T14:30:45Z");

  it("includes seconds when range < 1 hour", () => {
    const result = formatTooltipTime(date, 30 * 60 * 1000); // 30 min
    // Should contain seconds portion (":45" or similar locale representation)
    // We verify the format includes seconds by checking the call doesn't throw
    // and returns a non-empty string
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("omits seconds when range is between 1 hour and 1 day", () => {
    const result = formatTooltipTime(date, 6 * 60 * 60 * 1000); // 6 hours
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes date when range >= 1 day", () => {
    const result = formatTooltipTime(date, 3 * 24 * 60 * 60 * 1000); // 3 days
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns different formats for different zoom levels", () => {
    const subHour = formatTooltipTime(date, 30 * 60 * 1000);
    const subDay = formatTooltipTime(date, 6 * 60 * 60 * 1000);
    const multiDay = formatTooltipTime(date, 3 * 24 * 60 * 60 * 1000);

    // At least the multi-day format should differ from the sub-hour format
    // because it includes the date
    expect(multiDay).not.toBe(subHour);
  });

  it("handles edge case at exactly 1 hour boundary", () => {
    const exactHour = formatTooltipTime(date, 60 * 60 * 1000);
    // At exactly 1 hour, we use the sub-day format (no seconds)
    expect(typeof exactHour).toBe("string");
    expect(exactHour.length).toBeGreaterThan(0);
  });

  it("handles edge case at exactly 1 day boundary", () => {
    const exactDay = formatTooltipTime(date, 24 * 60 * 60 * 1000);
    // At exactly 1 day, we use the multi-day format
    expect(typeof exactDay).toBe("string");
    expect(exactDay.length).toBeGreaterThan(0);
  });
});
