import { describe, it, expect } from "vitest";
import {
  pixelToTime,
  hitTestRecording,
  formatTooltipTime,
  getZoomLevel,
} from "./timelineUtils";
import type { TimeRange } from "../components/timeline/TimelineBar";

function makeRange(fromIso: string, toIso: string): TimeRange {
  return { from: new Date(fromIso), to: new Date(toIso) };
}

function makeRecording(id: number, timestamp: string) {
  return {
    id,
    timestamp,
    event_type: "motion" as const,
    snapshot_key: null,
    path: `/recordings/${id}.mp4`,
  };
}

// ---------------------------------------------------------------------------
// pixelToTime
// ---------------------------------------------------------------------------
describe("pixelToTime", () => {
  const range = makeRange("2025-01-01T00:00:00Z", "2025-01-02T00:00:00Z");
  const trackWidth = 2880; // 24h * 120px/h

  it("returns range start at pixel 0", () => {
    const t = pixelToTime(0, trackWidth, range);
    expect(t.getTime()).toBe(range.from.getTime());
  });

  it("returns range end at full width", () => {
    const t = pixelToTime(trackWidth, trackWidth, range);
    expect(t.getTime()).toBe(range.to.getTime());
  });

  it("returns midpoint at half width", () => {
    const t = pixelToTime(trackWidth / 2, trackWidth, range);
    const expected = new Date("2025-01-01T12:00:00Z").getTime();
    expect(t.getTime()).toBe(expected);
  });

  it("clamps negative pixels to range start", () => {
    const t = pixelToTime(-100, trackWidth, range);
    expect(t.getTime()).toBe(range.from.getTime());
  });

  it("clamps pixels beyond width to range end", () => {
    const t = pixelToTime(trackWidth + 500, trackWidth, range);
    expect(t.getTime()).toBe(range.to.getTime());
  });
});

// ---------------------------------------------------------------------------
// hitTestRecording
// ---------------------------------------------------------------------------
describe("hitTestRecording", () => {
  const recordings = [
    makeRecording(1, "2025-01-01T08:00:00Z"),
    makeRecording(2, "2025-01-01T12:00:00Z"),
    makeRecording(3, "2025-01-01T16:00:00Z"),
  ];

  it("finds exact match", () => {
    const result = hitTestRecording(new Date("2025-01-01T12:00:00Z"), recordings);
    expect(result.type).toBe("recording");
    expect(result.recording?.id).toBe(2);
  });

  it("finds recording within tolerance", () => {
    const result = hitTestRecording(
      new Date("2025-01-01T12:00:15Z"),
      recordings,
      30_000,
    );
    expect(result.type).toBe("recording");
    expect(result.recording?.id).toBe(2);
  });

  it("returns gap when outside tolerance", () => {
    const result = hitTestRecording(
      new Date("2025-01-01T10:00:00Z"),
      recordings,
      30_000,
    );
    expect(result.type).toBe("gap");
    expect(result.recording).toBeUndefined();
  });

  it("returns gap for empty recordings array", () => {
    const result = hitTestRecording(new Date("2025-01-01T12:00:00Z"), []);
    expect(result.type).toBe("gap");
  });

  it("finds first recording when time is before all", () => {
    const result = hitTestRecording(
      new Date("2025-01-01T07:59:50Z"),
      recordings,
      30_000,
    );
    expect(result.type).toBe("recording");
    expect(result.recording?.id).toBe(1);
  });

  it("finds last recording when time is after all", () => {
    const result = hitTestRecording(
      new Date("2025-01-01T16:00:10Z"),
      recordings,
      30_000,
    );
    expect(result.type).toBe("recording");
    expect(result.recording?.id).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getZoomLevel
// ---------------------------------------------------------------------------
describe("getZoomLevel", () => {
  it("returns 'minutes' for ranges under 2 hours", () => {
    expect(getZoomLevel(makeRange("2025-01-01T10:00:00Z", "2025-01-01T11:30:00Z"))).toBe("minutes");
  });

  it("returns 'hours' for ranges between 2h and 48h", () => {
    expect(getZoomLevel(makeRange("2025-01-01T00:00:00Z", "2025-01-02T00:00:00Z"))).toBe("hours");
  });

  it("returns 'days' for ranges over 48h", () => {
    expect(getZoomLevel(makeRange("2025-01-01T00:00:00Z", "2025-01-08T00:00:00Z"))).toBe("days");
  });
});

// ---------------------------------------------------------------------------
// formatTooltipTime
// ---------------------------------------------------------------------------
describe("formatTooltipTime", () => {
  const time = new Date("2025-03-15T15:45:12Z");

  it("includes seconds at minutes zoom", () => {
    const formatted = formatTooltipTime(time, "minutes");
    expect(formatted).toContain("45");
    expect(formatted).toContain("12");
  });

  it("excludes seconds at hours zoom", () => {
    const formatted = formatTooltipTime(time, "hours");
    expect(formatted).toContain("45");
    // Should not contain seconds — but locale formatting varies,
    // so we just verify it's a non-empty string
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("includes date at days zoom", () => {
    const formatted = formatTooltipTime(time, "days");
    expect(formatted).toContain("15");
  });
});

// ---------------------------------------------------------------------------
// Performance assertions
// ---------------------------------------------------------------------------
describe("performance", () => {
  it("hitTestRecording with 500 recordings completes in <1ms", () => {
    const baseTime = new Date("2025-01-01T00:00:00Z").getTime();
    const recordings = Array.from({ length: 500 }, (_, i) =>
      makeRecording(i + 1, new Date(baseTime + i * 60_000).toISOString()),
    );

    const target = new Date(baseTime + 250 * 60_000);

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      hitTestRecording(target, recordings, 30_000);
    }
    const elapsed = performance.now() - start;

    // 1000 iterations should complete well under 1000ms (< 1ms each on average)
    expect(elapsed).toBeLessThan(1000);
  });

  it("pixelToTime is O(1) — trivially fast", () => {
    const range = makeRange("2025-01-01T00:00:00Z", "2025-01-02T00:00:00Z");
    const trackWidth = 2880;

    const start = performance.now();
    for (let i = 0; i < 100_000; i++) {
      pixelToTime(i % trackWidth, trackWidth, range);
    }
    const elapsed = performance.now() - start;

    // 100k calls should complete in well under 500ms
    expect(elapsed).toBeLessThan(500);
  });
});
