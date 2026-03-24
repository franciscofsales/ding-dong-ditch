import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFfmpegPipeline, type FfmpegPipeline } from "./ffmpeg-pipeline.js";

vi.mock("../logger.js", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

import { log } from "../logger.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";
import { Subject } from "rxjs";

function createMockLiveCall(options?: { failStartTranscoding?: boolean }) {
  const mockCall = {
    startTranscoding: vi.fn(),
    onVideoRtp: new Subject(),
    onAudioRtp: new Subject(),
    stop: vi.fn(),
    onCallEnded: new Subject(),
  };

  if (options?.failStartTranscoding) {
    mockCall.startTranscoding.mockRejectedValue(new Error("stdout not supported"));
  } else {
    mockCall.startTranscoding.mockResolvedValue(undefined);
  }

  return mockCall;
}

function createMockChildProcess() {
  const proc = new EventEmitter() as any;
  proc.stdin = { write: vi.fn(), destroyed: false };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

describe("createFfmpegPipeline", () => {
  let activePipeline: FfmpegPipeline | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (activePipeline) {
      activePipeline.stop();
      activePipeline = null;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("primary path (Ring SDK startTranscoding)", () => {
    it("should call startTranscoding with correct fMP4 output flags", async () => {
      const liveCall = createMockLiveCall();
      await createFfmpegPipeline(liveCall as any);

      expect(liveCall.startTranscoding).toHaveBeenCalledWith({
        output: [
          "-f", "mp4",
          "-movflags", "frag_keyframe+empty_moov+default_base_moof",
          "-c:v", "copy",
          "-c:a", "aac",
          "-",
        ],
        stdoutCallback: expect.any(Function),
      });
    });

    it("should emit data from stdoutCallback to registered listeners", async () => {
      const liveCall = createMockLiveCall();
      let capturedStdoutCallback: (data: Buffer) => void = () => {};

      liveCall.startTranscoding.mockImplementation(async (opts: any) => {
        capturedStdoutCallback = opts.stdoutCallback;
      });

      const pipeline = await createFfmpegPipeline(liveCall as any);

      const receivedChunks: Buffer[] = [];
      pipeline.onData((chunk) => receivedChunks.push(chunk));

      const testData = Buffer.from("fmp4-init-segment");
      capturedStdoutCallback(testData);

      expect(receivedChunks).toEqual([testData]);
    });

    it("should support multiple onData listeners", async () => {
      const liveCall = createMockLiveCall();
      let capturedStdoutCallback: (data: Buffer) => void = () => {};

      liveCall.startTranscoding.mockImplementation(async (opts: any) => {
        capturedStdoutCallback = opts.stdoutCallback;
      });

      const pipeline = await createFfmpegPipeline(liveCall as any);

      const chunks1: Buffer[] = [];
      const chunks2: Buffer[] = [];
      pipeline.onData((chunk) => chunks1.push(chunk));
      pipeline.onData((chunk) => chunks2.push(chunk));

      const data = Buffer.from("test");
      capturedStdoutCallback(data);

      expect(chunks1).toEqual([data]);
      expect(chunks2).toEqual([data]);
    });

    it("should not emit data after stop()", async () => {
      const liveCall = createMockLiveCall();
      let capturedStdoutCallback: (data: Buffer) => void = () => {};

      liveCall.startTranscoding.mockImplementation(async (opts: any) => {
        capturedStdoutCallback = opts.stdoutCallback;
      });

      const pipeline = await createFfmpegPipeline(liveCall as any);

      const receivedChunks: Buffer[] = [];
      pipeline.onData((chunk) => receivedChunks.push(chunk));

      pipeline.stop();

      capturedStdoutCallback(Buffer.from("should-not-be-received"));
      expect(receivedChunks).toEqual([]);
    });

    it("should log info on successful start", async () => {
      const liveCall = createMockLiveCall();
      await createFfmpegPipeline(liveCall as any);

      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining("primary transcoding started"),
      );
    });
  });

  describe("data timeout", () => {
    it("should log error if no data received within timeout", async () => {
      const liveCall = createMockLiveCall();
      await createFfmpegPipeline(liveCall as any);

      vi.advanceTimersByTime(10_001);

      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining("no data received within timeout"),
      );
    });

    it("should reset timeout when data is received", async () => {
      const liveCall = createMockLiveCall();
      let capturedStdoutCallback: (data: Buffer) => void = () => {};

      liveCall.startTranscoding.mockImplementation(async (opts: any) => {
        capturedStdoutCallback = opts.stdoutCallback;
      });

      const pipeline = await createFfmpegPipeline(liveCall as any);
      pipeline.onData(() => {});

      // Advance 9 seconds, then send data
      vi.advanceTimersByTime(9_000);
      capturedStdoutCallback(Buffer.from("data"));

      // Advance another 9 seconds - should not trigger timeout since data reset it
      vi.advanceTimersByTime(9_000);
      expect(log.error).not.toHaveBeenCalledWith(
        expect.stringContaining("no data received within timeout"),
      );

      // Advance past the new timeout
      vi.advanceTimersByTime(2_000);
      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining("no data received within timeout"),
      );
    });

    it("should not log timeout error after stop()", async () => {
      const liveCall = createMockLiveCall();
      const pipeline = await createFfmpegPipeline(liveCall as any);

      pipeline.stop();

      vi.advanceTimersByTime(15_000);

      expect(log.error).not.toHaveBeenCalledWith(
        expect.stringContaining("no data received within timeout"),
      );
    });
  });

  describe("fallback path (manual ffmpeg spawn)", () => {
    it("should spawn ffmpeg when startTranscoding fails", async () => {
      const liveCall = createMockLiveCall({ failStartTranscoding: true });
      const mockProc = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      await createFfmpegPipeline(liveCall as any);

      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining("primary startTranscoding failed"),
      );
      expect(spawn).toHaveBeenCalledWith(
        "ffmpeg",
        expect.arrayContaining(["-i", "pipe:0", "-f", "mp4"]),
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
      );
    });

    it("should emit data from fallback ffmpeg stdout", async () => {
      const liveCall = createMockLiveCall({ failStartTranscoding: true });
      const mockProc = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const pipeline = await createFfmpegPipeline(liveCall as any);

      const receivedChunks: Buffer[] = [];
      pipeline.onData((chunk) => receivedChunks.push(chunk));

      const testData = Buffer.from("fallback-fmp4-data");
      mockProc.stdout.emit("data", testData);

      expect(receivedChunks).toEqual([testData]);
    });

    it("should pipe video RTP packets to fallback ffmpeg stdin", async () => {
      const liveCall = createMockLiveCall({ failStartTranscoding: true });
      const mockProc = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      await createFfmpegPipeline(liveCall as any);

      const mockPacket = { serialize: vi.fn().mockReturnValue(Buffer.from("rtp-video")) };
      liveCall.onVideoRtp.next(mockPacket as any);

      expect(mockProc.stdin.write).toHaveBeenCalledWith(Buffer.from("rtp-video"));
    });

    it("should pipe audio RTP packets to fallback ffmpeg stdin", async () => {
      const liveCall = createMockLiveCall({ failStartTranscoding: true });
      const mockProc = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      await createFfmpegPipeline(liveCall as any);

      const mockPacket = { serialize: vi.fn().mockReturnValue(Buffer.from("rtp-audio")) };
      liveCall.onAudioRtp.next(mockPacket as any);

      expect(mockProc.stdin.write).toHaveBeenCalledWith(Buffer.from("rtp-audio"));
    });

    it("should kill fallback ffmpeg process on stop()", async () => {
      const liveCall = createMockLiveCall({ failStartTranscoding: true });
      const mockProc = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const pipeline = await createFfmpegPipeline(liveCall as any);
      pipeline.stop();

      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("should log ffmpeg stderr for debugging", async () => {
      const liveCall = createMockLiveCall({ failStartTranscoding: true });
      const mockProc = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      await createFfmpegPipeline(liveCall as any);

      mockProc.stderr.emit("data", Buffer.from("some debug info\n"));

      expect(log.debug).toHaveBeenCalledWith(
        expect.stringContaining("some debug info"),
      );
    });

    it("should log error on ffmpeg non-zero exit", async () => {
      const liveCall = createMockLiveCall({ failStartTranscoding: true });
      const mockProc = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      await createFfmpegPipeline(liveCall as any);

      mockProc.emit("exit", 1, null);

      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining("ffmpeg exited with code 1"),
      );
    });

    it("should log info on ffmpeg killed by signal", async () => {
      const liveCall = createMockLiveCall({ failStartTranscoding: true });
      const mockProc = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      await createFfmpegPipeline(liveCall as any);

      mockProc.emit("exit", null, "SIGTERM");

      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining("ffmpeg killed with signal SIGTERM"),
      );
    });

    it("should log error on ffmpeg process error", async () => {
      const liveCall = createMockLiveCall({ failStartTranscoding: true });
      const mockProc = createMockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      await createFfmpegPipeline(liveCall as any);

      mockProc.emit("error", new Error("ENOENT"));

      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining("ffmpeg process error: ENOENT"),
      );
    });
  });

  describe("stop()", () => {
    it("should be idempotent", async () => {
      const liveCall = createMockLiveCall();
      const pipeline = await createFfmpegPipeline(liveCall as any);

      pipeline.stop();
      pipeline.stop(); // second call should not throw

      expect(log.info).toHaveBeenCalledWith("[ffmpeg-pipeline] stopped");
    });
  });
});
