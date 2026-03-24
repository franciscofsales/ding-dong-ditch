import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveSessionManager } from "./session-manager.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("./ffmpeg-pipeline.js", () => ({
  createFfmpegPipeline: vi.fn(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  })),
}));

vi.mock("../logger.js", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

type CallEndedHandler = () => void;

function createMockLiveCall() {
  const handlers: CallEndedHandler[] = [];
  return {
    onCallEnded: {
      subscribe: vi.fn(({ next }: { next: CallEndedHandler }) => {
        handlers.push(next);
      }),
    },
    startTranscoding: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    _fireCallEnded() {
      for (const h of handlers) h();
    },
  };
}

function createMockCamera(id: number, liveCallFactory?: () => ReturnType<typeof createMockLiveCall>) {
  const defaultCall = createMockLiveCall();
  return {
    id,
    name: `Camera ${id}`,
    startLiveCall: liveCallFactory
      ? vi.fn(liveCallFactory)
      : vi.fn().mockResolvedValue(defaultCall),
    _defaultCall: defaultCall,
  };
}

function createMockWs() {
  return {
    readyState: 1, // OPEN
    OPEN: 1,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LiveSessionManager", () => {
  let manager: LiveSessionManager;

  beforeEach(() => {
    manager = new LiveSessionManager();
    vi.clearAllMocks();
  });

  describe("startSession", () => {
    it("should start a new session and subscribe to onCallEnded", async () => {
      const camera = createMockCamera(1);
      const ws = createMockWs();

      await manager.startSession(camera as any, ws as any);

      expect(camera.startLiveCall).toHaveBeenCalledOnce();
      expect(camera._defaultCall.onCallEnded.subscribe).toHaveBeenCalledOnce();

      const session = manager.getSession(1);
      expect(session).toBeDefined();
      expect(session!.clients.has(ws as any)).toBe(true);
      expect(session!.reconnectAttempted).toBe(false);
    });

    it("should add a second client to an existing session without starting a new call", async () => {
      const camera = createMockCamera(1);
      const ws1 = createMockWs();
      const ws2 = createMockWs();

      await manager.startSession(camera as any, ws1 as any);
      await manager.startSession(camera as any, ws2 as any);

      expect(camera.startLiveCall).toHaveBeenCalledOnce();

      const session = manager.getSession(1);
      expect(session!.clients.size).toBe(2);
    });
  });

  describe("broadcastMessage", () => {
    it("should send JSON to all connected clients", async () => {
      const camera = createMockCamera(1);
      const ws1 = createMockWs();
      const ws2 = createMockWs();

      await manager.startSession(camera as any, ws1 as any);
      await manager.startSession(camera as any, ws2 as any);

      manager.broadcastMessage(1, { type: "reconnecting" });

      const expected = JSON.stringify({ type: "reconnecting" });
      expect(ws1.send).toHaveBeenCalledWith(expected);
      expect(ws2.send).toHaveBeenCalledWith(expected);
    });

    it("should skip clients that are not open", async () => {
      const camera = createMockCamera(1);
      const ws = createMockWs();
      ws.readyState = 3; // CLOSED

      await manager.startSession(camera as any, ws as any);
      manager.broadcastMessage(1, { type: "test" });

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe("auto-reconnect on call ended", () => {
    it("should broadcast reconnecting, then reconnected on success", async () => {
      const call1 = createMockLiveCall();
      const call2 = createMockLiveCall();
      let callCount = 0;
      const camera = createMockCamera(1, () => {
        callCount++;
        return callCount === 1 ? call1 : call2;
      });
      const ws = createMockWs();

      await manager.startSession(camera as any, ws as any);

      // Simulate call ending
      call1._fireCallEnded();

      // Allow async reconnect to complete
      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalledWith(
          JSON.stringify({ type: "reconnected" }),
        );
      });

      // Should have sent reconnecting first, then reconnected
      const calls = ws.send.mock.calls.map((c: any[]) => c[0]).filter((c: any) => typeof c === "string");
      expect(calls).toContain(JSON.stringify({ type: "reconnecting" }));
      expect(calls).toContain(JSON.stringify({ type: "reconnected" }));

      // Session should still exist
      expect(manager.getSession(1)).toBeDefined();
      expect(manager.getSession(1)!.reconnectAttempted).toBe(true);
    });

    it("should broadcast error and stop session on reconnect failure", async () => {
      const call1 = createMockLiveCall();
      let callCount = 0;
      const camera = createMockCamera(1, () => {
        callCount++;
        if (callCount === 1) return call1;
        throw new Error("Connection refused");
      });
      const ws = createMockWs();

      await manager.startSession(camera as any, ws as any);

      // Simulate call ending
      call1._fireCallEnded();

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalledWith(
          JSON.stringify({ type: "error", message: "Camera disconnected" }),
        );
      });

      const calls = ws.send.mock.calls.map((c: any[]) => c[0]).filter((c: any) => typeof c === "string");
      expect(calls).toContain(JSON.stringify({ type: "reconnecting" }));

      // Session should be cleaned up
      expect(manager.getSession(1)).toBeUndefined();
    });

    it("should only attempt reconnect once", async () => {
      const call1 = createMockLiveCall();
      const call2 = createMockLiveCall();
      let callCount = 0;
      const camera = createMockCamera(1, () => {
        callCount++;
        return callCount === 1 ? call1 : call2;
      });
      const ws = createMockWs();

      await manager.startSession(camera as any, ws as any);

      // First disconnect -> reconnect succeeds
      call1._fireCallEnded();
      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalledWith(
          JSON.stringify({ type: "reconnected" }),
        );
      });

      // Second disconnect -> should give up
      call2._fireCallEnded();
      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalledWith(
          JSON.stringify({ type: "error", message: "Camera disconnected" }),
        );
      });

      // Session should be cleaned up after second disconnect
      expect(manager.getSession(1)).toBeUndefined();
    });
  });

  describe("stopSession", () => {
    it("should stop pipeline and close all clients", async () => {
      const camera = createMockCamera(1);
      const ws = createMockWs();

      await manager.startSession(camera as any, ws as any);
      manager.stopSession(1);

      expect(ws.close).toHaveBeenCalled();
      expect(manager.getSession(1)).toBeUndefined();
    });
  });

  describe("removeClient", () => {
    it("should stop session when last client disconnects", async () => {
      const camera = createMockCamera(1);
      const ws = createMockWs();

      await manager.startSession(camera as any, ws as any);
      manager.removeClient(1, ws as any);

      expect(manager.getSession(1)).toBeUndefined();
    });

    it("should keep session alive when other clients remain", async () => {
      const camera = createMockCamera(1);
      const ws1 = createMockWs();
      const ws2 = createMockWs();

      await manager.startSession(camera as any, ws1 as any);
      await manager.startSession(camera as any, ws2 as any);

      manager.removeClient(1, ws1 as any);

      const session = manager.getSession(1);
      expect(session).toBeDefined();
      expect(session!.clients.size).toBe(1);
    });
  });
});
