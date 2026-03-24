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

describe("LiveSessionManager", () => {
  let manager: LiveSessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new LiveSessionManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("startSession", () => {
    it("should start a new session for a valid camera", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      const session = await manager.startSession(123);

      expect(session.cameraId).toBe(123);
      expect(session.clients.size).toBe(0);
      expect(session.liveCall).toBe(cam._mockLiveCall);
      expect(session.pipeline).not.toBeNull();
      expect(cam.startLiveCall).toHaveBeenCalledOnce();
      expect(vi.mocked(createFfmpegPipeline)).toHaveBeenCalledWith(cam._mockLiveCall);
    });

    it("should return existing session if already active", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      const session1 = await manager.startSession(123);
      const session2 = await manager.startSession(123);

      expect(session1).toBe(session2);
      expect(cam.startLiveCall).toHaveBeenCalledOnce();
    });

    it("should throw if camera is not found", async () => {
      vi.mocked(getCameras).mockReturnValue([]);

      await expect(manager.startSession(999)).rejects.toThrow("Camera 999 not found");
    });
  });

  describe("joinSession", () => {
    it("should add a client to an existing session", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws = createMockWs();
      const session = manager.joinSession(123, ws);

      expect(session).not.toBeNull();
      expect(session!.clients.size).toBe(1);
      expect(session!.clients.has(ws)).toBe(true);
    });

    it("should return null for a non-existent session", () => {
      const ws = createMockWs();
      const session = manager.joinSession(999, ws);

      expect(session).toBeNull();
    });

    it("should clear grace timer when a client joins", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);

      const ws1 = createMockWs();
      manager.joinSession(123, ws1);
      manager.leaveSession(123, ws1);

      // Grace timer is now running, join with a new client
      const ws2 = createMockWs();
      manager.joinSession(123, ws2);

      // Advance past the grace period - session should still be active
      vi.advanceTimersByTime(15_000);

      const status = manager.getSession(123);
      expect(status).not.toBeNull();
      expect(status!.clients).toBe(1);
    });
  });

  describe("leaveSession", () => {
    it("should remove a client from the session", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws = createMockWs();
      manager.joinSession(123, ws);
      manager.leaveSession(123, ws);

      const status = manager.getSession(123);
      expect(status).not.toBeNull();
      expect(status!.clients).toBe(0);
    });

    it("should stop session after grace period when no clients remain", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws = createMockWs();
      manager.joinSession(123, ws);
      manager.leaveSession(123, ws);

      // Session still active during grace period
      vi.advanceTimersByTime(5_000);
      expect(manager.getSession(123)).not.toBeNull();

      // Session gone after grace period (10s)
      vi.advanceTimersByTime(6_000);
      expect(manager.getSession(123)).toBeNull();
      expect(cam._mockLiveCall.stop).toHaveBeenCalled();
    });

    it("should be a no-op for non-existent session", () => {
      const ws = createMockWs();
      expect(() => manager.leaveSession(999, ws)).not.toThrow();
    });
  });

  describe("getSession", () => {
    it("should return null for non-existent session", () => {
      expect(manager.getSession(999)).toBeNull();
    });

    it("should return session status", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws = createMockWs();
      manager.joinSession(123, ws);

      vi.advanceTimersByTime(5_000);

      const status = manager.getSession(123);
      expect(status).toEqual({
        active: true,
        clients: 1,
        uptimeMs: 5_000,
      });
    });
  });

  describe("stopSession", () => {
    it("should stop and clean up the session", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);
      const ws = createMockWs();
      manager.joinSession(123, ws);

      await manager.stopSession(123);

      expect(manager.getSession(123)).toBeNull();
      expect(cam._mockLiveCall.stop).toHaveBeenCalled();
      expect(ws.close).toHaveBeenCalledWith(1000, "session ended");
    });

    it("should be a no-op for non-existent session", async () => {
      await expect(manager.stopSession(999)).resolves.toBeUndefined();
    });
  });

  describe("broadcastChunk", () => {
    it("should send data to all connected clients", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);

      const ws1 = createMockWs(1);
      const ws2 = createMockWs(1);
      manager.joinSession(123, ws1);
      manager.joinSession(123, ws2);

      const chunk = Buffer.from("test-data");
      manager.broadcastChunk(123, chunk);

      expect(ws1.send).toHaveBeenCalledWith(chunk);
      expect(ws2.send).toHaveBeenCalledWith(chunk);
    });

    it("should skip clients that are not open", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);

      const wsOpen = createMockWs(1);
      const wsClosed = createMockWs(3); // CLOSED
      manager.joinSession(123, wsOpen);
      manager.joinSession(123, wsClosed);

      const chunk = Buffer.from("test-data");
      manager.broadcastChunk(123, chunk);

      expect(wsOpen.send).toHaveBeenCalledWith(chunk);
      expect(wsClosed.send).not.toHaveBeenCalled();
    });

    it("should be a no-op for non-existent session", () => {
      expect(() => manager.broadcastChunk(999, Buffer.from("test"))).not.toThrow();
    });
  });

  describe("idle timeout", () => {
    it("should stop session after idle timeout", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);

      // Advance past idle timeout (5 minutes)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      expect(manager.getSession(123)).toBeNull();
    });

    it("should reset idle timer when client joins", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      await manager.startSession(123);

      // Advance 4 minutes
      vi.advanceTimersByTime(4 * 60 * 1000);

      // Join resets timer
      const ws = createMockWs();
      manager.joinSession(123, ws);

      // Advance another 4 minutes - should still be active
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(manager.getSession(123)).not.toBeNull();

      // Advance to full idle timeout from last join
      vi.advanceTimersByTime(1 * 60 * 1000 + 1);
      expect(manager.getSession(123)).toBeNull();
    });
  });

  describe("only one session per camera", () => {
    it("should not create duplicate sessions", async () => {
      const cam = createMockCamera(123);
      vi.mocked(getCameras).mockReturnValue([cam] as any);

      const [s1, s2] = await Promise.all([
        manager.startSession(123),
        manager.startSession(123),
      ]);

      // Both should resolve to the same session object (first one wins)
      expect(cam.startLiveCall).toHaveBeenCalledOnce();
    });
  });
});
