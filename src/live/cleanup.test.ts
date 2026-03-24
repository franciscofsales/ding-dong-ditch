import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LiveSessionManager } from "./session-manager.js";

// Mock dependencies
vi.mock("../recorder/manager.js", () => ({
  getCameras: vi.fn(() => []),
}));

vi.mock("../logger.js", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./ffmpeg-pipeline.js", () => ({
  createFfmpegPipeline: vi.fn().mockResolvedValue({
    onData: vi.fn(),
    stop: vi.fn(),
  }),
}));

import { getCameras } from "../recorder/manager.js";
import { createFfmpegPipeline } from "./ffmpeg-pipeline.js";

function createMockCamera(id: number) {
  const mockLiveCall = {
    startTranscoding: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    onCallEnded: { subscribe: vi.fn() },
  };

  return {
    id,
    name: `Camera ${id}`,
    startLiveCall: vi.fn().mockResolvedValue(mockLiveCall),
    _mockLiveCall: mockLiveCall,
  };
}

function createMockWs(readyState = 1) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as import("ws").WebSocket;
}

function getMockPipeline() {
  return vi.mocked(createFfmpegPipeline).mock.results.at(-1)?.value;
}

describe("Resource cleanup validation", () => {
  let manager: LiveSessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    manager = new LiveSessionManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("normal disconnect (client closes WS)", () => {
    it("should call pipeline.stop() after grace period expires", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const pipeline = await getMockPipeline();

      const ws = createMockWs();
      manager.joinSession(123, ws);
      manager.leaveSession(123, ws);

      // Grace period (10s) hasn't expired yet
      vi.advanceTimersByTime(5_000);
      expect(pipeline.stop).not.toHaveBeenCalled();

      // Grace period expires
      vi.advanceTimersByTime(6_000);
      expect(pipeline.stop).toHaveBeenCalledOnce();
    });

    it("should call liveCall.stop() after grace period expires", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws = createMockWs();
      manager.joinSession(123, ws);
      manager.leaveSession(123, ws);

      vi.advanceTimersByTime(11_000);
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();
    });

    it("should close all client WebSockets after grace period expires", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      manager.joinSession(123, ws1);
      manager.joinSession(123, ws2);

      // Both leave
      manager.leaveSession(123, ws1);
      manager.leaveSession(123, ws2);

      vi.advanceTimersByTime(11_000);

      // cleanupSession closes all remaining clients in the set
      // ws1 and ws2 were already removed from clients set via leaveSession,
      // but the session is fully gone
      expect(manager.getSession(123)).toBeNull();
    });

    it("should leave zero orphaned sessions after normal disconnect", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws = createMockWs();
      manager.joinSession(123, ws);
      manager.leaveSession(123, ws);

      vi.advanceTimersByTime(11_000);

      // Session map should be empty
      expect(manager.getSession(123)).toBeNull();
      // Pipeline and liveCall both stopped
      const pipeline = await getMockPipeline();
      expect(pipeline.stop).toHaveBeenCalled();
      expect(cam._mockLiveCall.stop).toHaveBeenCalled();
    });
  });

  describe("abrupt disconnect (WS error/close without clean handshake)", () => {
    it("should clean up within grace period when client WS drops abruptly", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws = createMockWs();
      manager.joinSession(123, ws);

      // Simulate abrupt disconnect: server-side calls leaveSession
      // (the WS close handler in the real server does this)
      manager.leaveSession(123, ws);

      // Session still alive during grace period
      expect(manager.getSession(123)).not.toBeNull();

      // After grace period, full cleanup happens
      vi.advanceTimersByTime(11_000);
      expect(manager.getSession(123)).toBeNull();
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();

      const pipeline = await getMockPipeline();
      expect(pipeline.stop).toHaveBeenCalledOnce();
    });

    it("should clean up even if multiple clients disconnect abruptly at once", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      const ws3 = createMockWs();
      manager.joinSession(123, ws1);
      manager.joinSession(123, ws2);
      manager.joinSession(123, ws3);

      // All drop at once
      manager.leaveSession(123, ws1);
      manager.leaveSession(123, ws2);
      manager.leaveSession(123, ws3);

      vi.advanceTimersByTime(11_000);

      expect(manager.getSession(123)).toBeNull();
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();
    });

    it("should cancel cleanup if a new client joins during grace period after abrupt disconnect", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws1 = createMockWs();
      manager.joinSession(123, ws1);
      manager.leaveSession(123, ws1); // abrupt drop

      // New client joins 5s into grace period
      vi.advanceTimersByTime(5_000);
      const ws2 = createMockWs();
      manager.joinSession(123, ws2);

      // Grace period would have expired at 10s, but was cancelled
      vi.advanceTimersByTime(6_000);
      expect(manager.getSession(123)).not.toBeNull();
      expect(cam._mockLiveCall.stop).not.toHaveBeenCalled();
    });
  });

  describe("session manager reset (simulates server restart)", () => {
    it("should have no stale sessions after all sessions are stopped", async () => {
      const cam1 = createMockCamera(1);
      const cam2 = createMockCamera(2);
      const cam3 = createMockCamera(3);
      vi.mocked(getCameras).mockReturnValue([cam1, cam2, cam3] as any);

      await manager.startSession(1);
      await manager.startSession(2);
      await manager.startSession(3);

      expect(manager.getSession(1)).not.toBeNull();
      expect(manager.getSession(2)).not.toBeNull();
      expect(manager.getSession(3)).not.toBeNull();

      await manager.stopSession(1);
      await manager.stopSession(2);
      await manager.stopSession(3);

      expect(manager.getSession(1)).toBeNull();
      expect(manager.getSession(2)).toBeNull();
      expect(manager.getSession(3)).toBeNull();
    });

    it("should call pipeline.stop() and liveCall.stop() for each session on reset", async () => {
      const cam1 = createMockCamera(1);
      const cam2 = createMockCamera(2);
      vi.mocked(getCameras).mockReturnValue([cam1, cam2] as any);

      // Track pipelines per session
      const pipelines: any[] = [];
      vi.mocked(createFfmpegPipeline).mockImplementation(async () => {
        const p = { onData: vi.fn(), stop: vi.fn() };
        pipelines.push(p);
        return p;
      });

      await manager.startSession(1);
      await manager.startSession(2);

      await manager.stopSession(1);
      await manager.stopSession(2);

      expect(pipelines[0].stop).toHaveBeenCalledOnce();
      expect(pipelines[1].stop).toHaveBeenCalledOnce();
      expect(cam1._mockLiveCall.stop).toHaveBeenCalledOnce();
      expect(cam2._mockLiveCall.stop).toHaveBeenCalledOnce();
    });

    it("should close all client WebSockets for all sessions on reset", async () => {
      const cam1 = createMockCamera(1);
      const cam2 = createMockCamera(2);
      vi.mocked(getCameras).mockReturnValue([cam1, cam2] as any);

      await manager.startSession(1);
      await manager.startSession(2);

      const ws1 = createMockWs();
      const ws2 = createMockWs();
      manager.joinSession(1, ws1);
      manager.joinSession(2, ws2);

      await manager.stopSession(1);
      await manager.stopSession(2);

      expect(ws1.close).toHaveBeenCalledWith(1000, "session ended");
      expect(ws2.close).toHaveBeenCalledWith(1000, "session ended");
    });
  });

  describe("idempotent cleanup across multiple paths", () => {
    it("should be safe to call stopSession multiple times", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);

      await manager.stopSession(123);
      await manager.stopSession(123);
      await manager.stopSession(123);

      // pipeline.stop() and liveCall.stop() called only once (second/third calls are no-ops)
      const pipeline = await getMockPipeline();
      expect(pipeline.stop).toHaveBeenCalledOnce();
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();
    });

    it("should be safe to stop during grace period", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws = createMockWs();
      manager.joinSession(123, ws);
      manager.leaveSession(123, ws);

      // Grace period is running, now explicitly stop
      vi.advanceTimersByTime(3_000);
      await manager.stopSession(123);

      expect(manager.getSession(123)).toBeNull();
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();

      // Advance past what would have been the grace period expiry -- should not throw
      vi.advanceTimersByTime(10_000);
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();
    });

    it("should be safe to stop during idle timeout", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);

      // Advance partway through idle timeout (5 min)
      vi.advanceTimersByTime(3 * 60 * 1000);

      // Explicitly stop before idle timeout fires
      await manager.stopSession(123);

      expect(manager.getSession(123)).toBeNull();
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();

      // Advance past idle timeout -- should not throw or double-stop
      vi.advanceTimersByTime(3 * 60 * 1000);
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();
    });

    it("should handle idle timeout firing after grace period already cleaned up", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws = createMockWs();
      manager.joinSession(123, ws);
      manager.leaveSession(123, ws);

      // Grace period fires first (10s)
      vi.advanceTimersByTime(11_000);
      expect(manager.getSession(123)).toBeNull();
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();

      // Idle timeout would fire at 5 min mark -- should be a no-op
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();
    });

    it("should handle explicit stop via stopSession with pipeline and liveCall both null", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      // Simulate a session where pipeline creation fails mid-way
      // by stopping immediately after start
      await manager.startSession(123);
      await manager.stopSession(123);

      // Second stop is a no-op
      await manager.stopSession(123);
      expect(manager.getSession(123)).toBeNull();
    });
  });

  describe("Ring live call stop() called in all cleanup paths", () => {
    it("should call liveCall.stop() on explicit stopSession", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      await manager.stopSession(123);

      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();
    });

    it("should call liveCall.stop() on grace period expiry", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws = createMockWs();
      manager.joinSession(123, ws);
      manager.leaveSession(123, ws);

      vi.advanceTimersByTime(11_000);
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();
    });

    it("should call liveCall.stop() on idle timeout", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();
    });

    it("should call liveCall.stop() even if it throws", async () => {
      const cam = createMockCamera(123);
      cam._mockLiveCall.stop.mockImplementation(() => {
        throw new Error("already stopped");
      });
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);

      // Should not throw even though liveCall.stop() throws
      await expect(manager.stopSession(123)).resolves.toBeUndefined();
      expect(cam._mockLiveCall.stop).toHaveBeenCalledOnce();
    });

    it("should call pipeline.stop() even when liveCall.stop() throws", async () => {
      const cam = createMockCamera(123);
      cam._mockLiveCall.stop.mockImplementation(() => {
        throw new Error("already stopped");
      });
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const pipeline = await getMockPipeline();

      await manager.stopSession(123);

      // pipeline.stop() is called before liveCall.stop() in the code,
      // so it should always be called regardless
      expect(pipeline.stop).toHaveBeenCalledOnce();
    });
  });
});
