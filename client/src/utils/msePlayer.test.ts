import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMsePlayer, type MsePlayer } from "./msePlayer";

// ---------------------------------------------------------------------------
// Mocks for browser MediaSource / SourceBuffer APIs
// ---------------------------------------------------------------------------

class MockSourceBuffer extends EventTarget {
  updating = false;
  private _onUpdateEnd: (() => void) | null = null;

  appendBuffer = vi.fn((data: ArrayBuffer) => {
    void data;
    this.updating = true;
    // Simulate async update completing on next microtask.
    queueMicrotask(() => {
      this.updating = false;
      this.dispatchEvent(new Event("updateend"));
    });
  });

  abort = vi.fn();

  remove = vi.fn((_start: number, _end: number) => {
    this.updating = true;
    queueMicrotask(() => {
      this.updating = false;
      this.dispatchEvent(new Event("updateend"));
    });
  });
}

class MockMediaSource extends EventTarget {
  readyState: "closed" | "open" | "ended" = "closed";
  sourceBuffers: MockSourceBuffer[] = [];
  private _sourceBuffer: MockSourceBuffer | null = null;

  addSourceBuffer = vi.fn((_codec: string): MockSourceBuffer => {
    const sb = new MockSourceBuffer();
    this._sourceBuffer = sb;
    this.sourceBuffers.push(sb);
    return sb as unknown as MockSourceBuffer;
  });

  removeSourceBuffer = vi.fn((_sb: MockSourceBuffer) => {
    this.sourceBuffers = this.sourceBuffers.filter((s) => s !== _sb);
  });

  endOfStream = vi.fn(() => {
    this.readyState = "ended";
  });

  // Helper to simulate sourceopen
  _open(): void {
    this.readyState = "open";
    this.dispatchEvent(new Event("sourceopen"));
  }
}

// Keep a reference to the last created MockMediaSource so tests can trigger sourceopen.
let lastMediaSource: MockMediaSource;

function installMocks(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).MediaSource = class extends MockMediaSource {
    constructor() {
      super();
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      lastMediaSource = this;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:mock-url");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).URL.revokeObjectURL = vi.fn();
}

function createMockVideo(): HTMLVideoElement {
  return {
    src: "",
    currentTime: 0,
  } as unknown as HTMLVideoElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createMsePlayer", () => {
  beforeEach(() => {
    installMocks();
  });

  async function setup(
    codec = 'video/mp4; codecs="avc1.42E01E"',
  ): Promise<{ player: MsePlayer; video: ReturnType<typeof createMockVideo>; ms: MockMediaSource; sb: MockSourceBuffer }> {
    const video = createMockVideo();
    const playerPromise = createMsePlayer(video, codec);

    // Trigger sourceopen so the promise resolves.
    lastMediaSource._open();

    const player = await playerPromise;
    const ms = lastMediaSource;
    const sb = ms.sourceBuffers[0];
    return { player, video, ms, sb };
  }

  it("resolves once MediaSource is open", async () => {
    const { player } = await setup();
    expect(player.isReady).toBe(true);
  });

  it("sets video.src to an object URL", async () => {
    const { video } = await setup();
    expect(video.src).toBe("blob:mock-url");
  });

  it("creates a SourceBuffer with the given codec", async () => {
    const codec = 'video/mp4; codecs="avc1.42E01E"';
    const { ms } = await setup(codec);
    expect(ms.addSourceBuffer).toHaveBeenCalledWith(codec);
  });

  it("appends a single chunk to the SourceBuffer", async () => {
    const { player, sb } = await setup();
    const chunk = new ArrayBuffer(8);
    player.appendChunk(chunk);
    expect(sb.appendBuffer).toHaveBeenCalledWith(chunk);
  });

  it("queues chunks while SourceBuffer is updating", async () => {
    const { player, sb } = await setup();

    // First chunk starts updating.
    const chunk1 = new ArrayBuffer(1);
    const chunk2 = new ArrayBuffer(2);
    const chunk3 = new ArrayBuffer(3);

    // Make appendBuffer set updating but NOT auto-resolve.
    sb.appendBuffer = vi.fn(() => {
      sb.updating = true;
    });

    player.appendChunk(chunk1);
    expect(sb.appendBuffer).toHaveBeenCalledTimes(1);

    // Second and third chunks should be queued.
    player.appendChunk(chunk2);
    player.appendChunk(chunk3);
    expect(sb.appendBuffer).toHaveBeenCalledTimes(1);

    // Simulate updateend — should flush next queued chunk.
    sb.updating = false;
    sb.dispatchEvent(new Event("updateend"));
    expect(sb.appendBuffer).toHaveBeenCalledTimes(2);
    expect(sb.appendBuffer).toHaveBeenCalledWith(chunk2);

    // Another updateend flushes the last chunk.
    sb.updating = false;
    sb.dispatchEvent(new Event("updateend"));
    expect(sb.appendBuffer).toHaveBeenCalledTimes(3);
    expect(sb.appendBuffer).toHaveBeenCalledWith(chunk3);
  });

  it("handles QuotaExceededError by trimming old buffer", async () => {
    const { player, sb, video } = await setup();
    video.currentTime = 60;

    let firstCall = true;
    sb.appendBuffer = vi.fn((_data: ArrayBuffer) => {
      if (firstCall) {
        firstCall = false;
        const err = new DOMException("Quota exceeded", "QuotaExceededError");
        throw err;
      }
      sb.updating = true;
    });

    const chunk = new ArrayBuffer(8);
    player.appendChunk(chunk);

    // remove() should have been called to trim old data.
    // removeEnd = max(0, 60 - 30) = 30
    expect(sb.remove).toHaveBeenCalledWith(0, 30);

    // After the trim's updateend, the chunk should be retried.
    sb.updating = false;
    sb.dispatchEvent(new Event("updateend"));
    expect(sb.appendBuffer).toHaveBeenCalledTimes(2);
  });

  it("ignores appendChunk calls after destroy", async () => {
    const { player, sb } = await setup();
    player.destroy();

    const chunk = new ArrayBuffer(8);
    player.appendChunk(chunk);
    expect(sb.appendBuffer).not.toHaveBeenCalled();
  });

  it("destroy cleans up MediaSource and revokes object URL", async () => {
    const { player, ms } = await setup();
    const sb = ms.sourceBuffers[0];

    player.destroy();

    expect(sb.abort).toHaveBeenCalled();
    expect(ms.removeSourceBuffer).toHaveBeenCalledWith(sb);
    expect(ms.endOfStream).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(player.isReady).toBe(false);
  });

  it("destroy is idempotent", async () => {
    const { player, ms } = await setup();
    player.destroy();
    player.destroy();
    expect(ms.endOfStream).toHaveBeenCalledTimes(1);
  });

  it("handles destroy when MediaSource is already closed", async () => {
    const { player, ms } = await setup();
    ms.readyState = "ended";

    // Should not throw.
    expect(() => player.destroy()).not.toThrow();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
