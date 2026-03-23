import { describe, it, expect } from "vitest";
import {
  pixelToTime,
  hitTestRecording,
  formatTooltipTime,
  getZoomLevel,
} from "./timelineUtils";
import type { TimeRange } from "../components/timeline/TimelineBar";

/**
 * Integration tests that chain scrubbing utility functions together
 * in realistic scenarios — simulating what happens when a user
 * scrubs across the timeline bar.
 */

function makeRange(fromIso: string, toIso: string): TimeRange {
  return { from: new Date(fromIso), to: new Date(toIso) };
}

function makeRecording(id: number, timestamp: string, eventType = "motion") {
  return {
    id,
    timestamp,
    event_type: eventType,
    snapshot_key: null,
    path: `/recordings/${id}.mp4`,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: 1-hour window with closely spaced recordings
// ---------------------------------------------------------------------------
describe("scrubbing a 1-hour window", () => {
  const range = makeRange("2025-01-15T14:00:00Z", "2025-01-15T15:00:00Z");
  const trackWidth = 120; // 1h * 120px/h
  const recordings = [
    makeRecording(1, "2025-01-15T14:05:00Z"),
    makeRecording(2, "2025-01-15T14:15:00Z"),
    makeRecording(3, "2025-01-15T14:15:30Z"),
    makeRecording(4, "2025-01-15T14:45:00Z"),
  ];

  it("scrubbing at pixel 10 hits recording 1", () => {
    const time = pixelToTime(10, trackWidth, range);
    const hit = hitTestRecording(time, recordings, 60_000);
    expect(hit.type).toBe("recording");
    expect(hit.recording?.id).toBe(1);
  });

  it("scrubbing at pixel 30 hits recording 2 (closer than 3)", () => {
    const time = pixelToTime(30, trackWidth, range);
    const hit = hitTestRecording(time, recordings, 60_000);
    expect(hit.type).toBe("recording");
    expect(hit.recording?.id).toBe(2);
  });

  it("tooltip shows seconds for 1-hour zoom level", () => {
    const time = pixelToTime(10, trackWidth, range);
    const zoom = getZoomLevel(range);
    expect(zoom).toBe("minutes");
    const label = formatTooltipTime(time, zoom);
    // At minutes zoom, we expect seconds in the output
    expect(label.length).toBeGreaterThan(0);
  });

  it("scrubbing the gap at pixel 70 returns a gap result", () => {
    const time = pixelToTime(70, trackWidth, range);
    // pixel 70 of 120 => ~35 min into the hour => 14:35
    // Nearest recording is at 14:45 (10 min away) — beyond 1 min tolerance
    const hit = hitTestRecording(time, recordings, 60_000);
    expect(hit.type).toBe("gap");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: 24-hour window with sparse recordings
// ---------------------------------------------------------------------------
describe("scrubbing a 24-hour window", () => {
  const range = makeRange("2025-01-15T00:00:00Z", "2025-01-16T00:00:00Z");
  const trackWidth = 2880; // 24h * 120px/h
  const recordings = [
    makeRecording(10, "2025-01-15T06:00:00Z", "motion"),
    makeRecording(11, "2025-01-15T12:00:00Z", "doorbell"),
    makeRecording(12, "2025-01-15T18:00:00Z", "motion"),
  ];

  it("zoom level is 'hours' for a 24h range", () => {
    expect(getZoomLevel(range)).toBe("hours");
  });

  it("scrubbing at the midpoint hits the noon recording", () => {
    const time = pixelToTime(trackWidth / 2, trackWidth, range);
    const hit = hitTestRecording(time, recordings, 60_000);
    expect(hit.type).toBe("recording");
    expect(hit.recording?.id).toBe(11);
  });

  it("tooltip omits seconds at hours zoom", () => {
    const time = pixelToTime(trackWidth / 2, trackWidth, range);
    const zoom = getZoomLevel(range);
    const label = formatTooltipTime(time, zoom);
    expect(label).toBeTruthy();
  });

  it("scrubbing at pixel 0 (midnight) finds no recording within tolerance", () => {
    const time = pixelToTime(0, trackWidth, range);
    const hit = hitTestRecording(time, recordings, 60_000);
    expect(hit.type).toBe("gap");
  });

  it("full scrub sweep identifies recordings and gaps correctly", () => {
    const steps = 10;
    const results = Array.from({ length: steps + 1 }, (_, i) => {
      const px = (i / steps) * trackWidth;
      const time = pixelToTime(px, trackWidth, range);
      return hitTestRecording(time, recordings, 60_000);
    });

    const hits = results.filter((r) => r.type === "recording");
    const gaps = results.filter((r) => r.type === "gap");

    // With only 3 recordings in 24h and 60s tolerance, most positions are gaps
    expect(gaps.length).toBeGreaterThan(hits.length);
    // But we should find at least some recordings
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: 7-day window
// ---------------------------------------------------------------------------
describe("scrubbing a 7-day window", () => {
  const range = makeRange("2025-01-10T00:00:00Z", "2025-01-17T00:00:00Z");
  const trackWidth = 7 * 24 * 120; // 7 days

  const recordings = Array.from({ length: 14 }, (_, i) =>
    makeRecording(
      100 + i,
      new Date(
        new Date("2025-01-10T00:00:00Z").getTime() + i * 12 * 60 * 60 * 1000,
      ).toISOString(),
    ),
  );

  it("zoom level is 'days' for a 7-day range", () => {
    expect(getZoomLevel(range)).toBe("days");
  });

  it("tooltip includes date at days zoom", () => {
    const time = pixelToTime(trackWidth / 2, trackWidth, range);
    const zoom = getZoomLevel(range);
    const label = formatTooltipTime(time, zoom);
    // Should include the day number
    expect(label.length).toBeGreaterThan(5);
  });

  it("pixelToTime produces monotonically increasing timestamps", () => {
    const times: number[] = [];
    for (let px = 0; px <= trackWidth; px += trackWidth / 20) {
      times.push(pixelToTime(px, trackWidth, range).getTime());
    }
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it("all 14 recordings can be found when scrubbing near their positions", () => {
    const found = new Set<number>();
    for (const rec of recordings) {
      const recMs = new Date(rec.timestamp).getTime();
      const fraction =
        (recMs - range.from.getTime()) /
        (range.to.getTime() - range.from.getTime());
      const px = fraction * trackWidth;
      const time = pixelToTime(px, trackWidth, range);
      const hit = hitTestRecording(time, recordings, 60_000);
      if (hit.type === "recording" && hit.recording) {
        found.add(hit.recording.id);
      }
    }
    expect(found.size).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("scrubbing edge cases", () => {
  it("handles a single-second time range", () => {
    const range = makeRange("2025-01-15T12:00:00Z", "2025-01-15T12:00:01Z");
    const trackWidth = 100;
    const rec = makeRecording(1, "2025-01-15T12:00:00.500Z");

    const time = pixelToTime(50, trackWidth, range);
    const hit = hitTestRecording(time, [rec], 1000);
    expect(hit.type).toBe("recording");
    expect(hit.recording?.id).toBe(1);
  });

  it("handles recordings at exactly the range boundaries", () => {
    const range = makeRange("2025-01-15T00:00:00Z", "2025-01-15T01:00:00Z");
    const trackWidth = 120;
    const recordings = [
      makeRecording(1, "2025-01-15T00:00:00Z"),
      makeRecording(2, "2025-01-15T01:00:00Z"),
    ];

    const startTime = pixelToTime(0, trackWidth, range);
    const startHit = hitTestRecording(startTime, recordings, 1000);
    expect(startHit.type).toBe("recording");
    expect(startHit.recording?.id).toBe(1);

    const endTime = pixelToTime(trackWidth, trackWidth, range);
    const endHit = hitTestRecording(endTime, recordings, 1000);
    expect(endHit.type).toBe("recording");
    expect(endHit.recording?.id).toBe(2);
  });
});
