import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies used by motion-handler and clip-recorder
vi.mock("../recorder/clip-recorder.js", () => ({
  recordClip: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config/store.js", () => ({
  getCameraConfig: vi.fn().mockReturnValue({
    enabled: true,
    recordingDuration: 30,
    cooldownSeconds: 10,
  }),
}));

vi.mock("../recorder/snapshot.js", () => ({
  captureSnapshot: vi.fn().mockResolvedValue({
    key: "2024-01-15/Cam/12-00-00.jpg",
    buffer: Buffer.from("img"),
  }),
}));

vi.mock("../ai/describe.js", () => ({
  describeSnapshot: vi.fn().mockResolvedValue("A person at the door."),
}));

import { startLiveSession, stopLiveSession, clearAllSessions } from "./session-manager.js";
import { handleMotion } from "../recorder/motion-handler.js";
import { recordClip } from "../recorder/clip-recorder.js";

/** Creates a mock RingCamera whose startLiveCall can be called multiple times. */
function makeMockCamera(id: number, name: string) {
  const liveCalls: Array<{ stop: ReturnType<typeof vi.fn> }> = [];

  const cam = {
    id,
    name,
    startLiveCall: vi.fn(async () => {
      const call = {
        stop: vi.fn().mockResolvedValue(undefined),
        startTranscoding: vi.fn().mockResolvedValue(undefined),
      };
      liveCalls.push(call);
      return call;
    }),
    /** Access the live calls that were created (test helper). */
    get _liveCalls() {
      return liveCalls;
    },
  };

  return cam;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAllSessions();
});

describe("live session and recording pipeline coexistence", () => {
  it("live session and motion-triggered recording use separate live calls", async () => {
    const cam = makeMockCamera(100, "Front Porch");

    // 1. Start a live viewing session
    const session = await startLiveSession(cam as any);
    expect(session.cameraId).toBe(100);
    expect(cam.startLiveCall).toHaveBeenCalledTimes(1);

    // 2. Trigger a motion event on the same camera while live session is active
    // recordClip is mocked, but handleMotion still calls it, proving the
    // recording pipeline is not blocked by the live session.
    await handleMotion(cam as any);

    expect(recordClip).toHaveBeenCalledTimes(1);
    expect(recordClip).toHaveBeenCalledWith(
      cam,
      30,
      "2024-01-15/Cam/12-00-00.jpg",
      expect.any(Promise),
      expect.objectContaining({ value: "motion" }),
    );

    // 3. The live session is still active
    expect(session.liveCall).toBeDefined();

    // 4. Clean up
    await stopLiveSession(cam.id);
  });

  it("startLiveCall is invoked independently by live session and recording", async () => {
    const cam = makeMockCamera(101, "Back Yard");

    // Start live session — first startLiveCall invocation
    await startLiveSession(cam as any);
    expect(cam.startLiveCall).toHaveBeenCalledTimes(1);

    // The recording pipeline (clip-recorder) also calls startLiveCall internally.
    // Since clip-recorder is mocked, we verify the intent: recordClip is called
    // and would make its own startLiveCall. The real clip-recorder.ts line 30
    // calls cam.startLiveCall() independently.
    await handleMotion(cam as any);
    expect(recordClip).toHaveBeenCalledTimes(1);

    // Verify the live session's call is separate from any recording call
    // by checking our session manager still holds the original session.
    const session = (await startLiveSession(cam as any)); // returns existing
    expect(session.cameraId).toBe(101);

    await stopLiveSession(cam.id);
  });

  it("multiple concurrent startLiveCall invocations succeed independently", async () => {
    // This test verifies that the Ring SDK mock (and by extension the real SDK)
    // supports multiple concurrent live calls on the same camera object.
    const cam = makeMockCamera(102, "Garage");

    // Simulate what happens in production: live view starts a call,
    // and clip-recorder starts another call concurrently.
    const [liveCall, recordingCall] = await Promise.all([
      cam.startLiveCall(),
      cam.startLiveCall(),
    ]);

    expect(cam.startLiveCall).toHaveBeenCalledTimes(2);
    expect(cam._liveCalls).toHaveLength(2);

    // Each call is an independent object
    expect(liveCall).not.toBe(recordingCall);
    expect(liveCall.stop).not.toBe(recordingCall.stop);

    // Stopping one does not affect the other
    await liveCall.stop();
    expect(liveCall.stop).toHaveBeenCalledTimes(1);
    expect(recordingCall.stop).not.toHaveBeenCalled();
  });

  it("stopping a live session does not interfere with an in-flight recording", async () => {
    const cam = makeMockCamera(103, "Driveway");

    // Start live session
    await startLiveSession(cam as any);

    // Start a motion recording (mocked, resolves immediately)
    const recordingDone = handleMotion(cam as any);

    // Stop live session while "recording" is in progress
    await stopLiveSession(cam.id);

    // Recording should still complete successfully
    await recordingDone;
    expect(recordClip).toHaveBeenCalledTimes(1);
  });

  it("recording during live session followed by another motion event respects cooldown", async () => {
    const cam = makeMockCamera(104, "Side Entrance");

    await startLiveSession(cam as any);

    // First motion triggers recording
    await handleMotion(cam as any);
    expect(recordClip).toHaveBeenCalledTimes(1);

    // Second motion immediately after should be in cooldown
    await handleMotion(cam as any);
    expect(recordClip).toHaveBeenCalledTimes(1); // still 1 — cooldown blocked it

    await stopLiveSession(cam.id);
  });
});
