import { spawn, type ChildProcess } from "child_process";
import type { StreamingSession } from "ring-client-api/lib/streaming/streaming-session.js";
import type { Subscription } from "rxjs";
import { log } from "../logger.js";

const DATA_TIMEOUT_MS = 10_000; // 10 seconds without data = stream failed

/**
 * fMP4 output flags for MSE-compatible fragmented MP4.
 * - frag_keyframe: start a new fragment at each keyframe
 * - empty_moov: write an empty moov atom (init segment) at the start
 * - default_base_moof: required for MSE compatibility
 */
const FMPEG_OUTPUT_FLAGS = [
  "-f", "mp4",
  "-movflags", "frag_keyframe+empty_moov+default_base_moof",
  "-c:v", "copy",
  "-c:a", "aac",
  "-",
] as const;

export interface FfmpegPipeline {
  onData: (callback: (chunk: Buffer) => void) => void;
  stop: () => void;
}

/**
 * Create an fMP4 transcoding pipeline from a Ring live call.
 *
 * Primary approach: use the Ring SDK's startTranscoding() with stdoutCallback,
 * which internally spawns ffmpeg and pipes fMP4 data to stdout.
 *
 * Fallback: if stdoutCallback fails to produce data within the timeout,
 * spawns ffmpeg manually and feeds it RTP packets via onVideoRtp/onAudioRtp.
 */
export async function createFfmpegPipeline(
  liveCall: StreamingSession,
): Promise<FfmpegPipeline> {
  const callbacks: Array<(chunk: Buffer) => void> = [];
  let stopped = false;
  let dataTimeoutTimer: NodeJS.Timeout | null = null;
  let receivedData = false;
  let fallbackProcess: ChildProcess | null = null;
  let fallbackSubscriptions: Subscription[] = [];

  function emitData(chunk: Buffer): void {
    if (stopped) return;
    receivedData = true;
    resetDataTimeout();
    for (const cb of callbacks) {
      cb(chunk);
    }
  }

  function resetDataTimeout(): void {
    if (dataTimeoutTimer) {
      clearTimeout(dataTimeoutTimer);
    }
    dataTimeoutTimer = setTimeout(() => {
      if (!stopped) {
        log.error("[ffmpeg-pipeline] no data received within timeout, stream may have failed");
      }
    }, DATA_TIMEOUT_MS);
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;

    if (dataTimeoutTimer) {
      clearTimeout(dataTimeoutTimer);
      dataTimeoutTimer = null;
    }

    for (const sub of fallbackSubscriptions) {
      sub.unsubscribe();
    }
    fallbackSubscriptions = [];

    if (fallbackProcess) {
      fallbackProcess.kill("SIGTERM");
      fallbackProcess = null;
    }

    callbacks.length = 0;
    log.info("[ffmpeg-pipeline] stopped");
  }

  // Start the data timeout before transcoding begins
  resetDataTimeout();

  try {
    await liveCall.startTranscoding({
      output: [...FMPEG_OUTPUT_FLAGS],
      stdoutCallback: (data: Buffer) => {
        emitData(data);
      },
    });

    log.info("[ffmpeg-pipeline] primary transcoding started (Ring SDK stdoutCallback)");
  } catch (err) {
    log.warn(
      `[ffmpeg-pipeline] primary startTranscoding failed: ${(err as Error).message}, trying fallback`,
    );
    startFallbackPipeline(liveCall, emitData, (proc, subs) => {
      fallbackProcess = proc;
      fallbackSubscriptions = subs;
    });
  }

  return {
    onData: (callback: (chunk: Buffer) => void) => {
      callbacks.push(callback);
    },
    stop,
  };
}

/**
 * Fallback: spawn ffmpeg manually and pipe RTP packets from the live call's
 * onVideoRtp / onAudioRtp subjects into ffmpeg's stdin.
 */
function startFallbackPipeline(
  liveCall: StreamingSession,
  emitData: (chunk: Buffer) => void,
  onStarted: (proc: ChildProcess, subs: Subscription[]) => void,
): void {
  log.info("[ffmpeg-pipeline] starting fallback ffmpeg pipeline");

  const proc = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel", "warning",
    // Input from stdin (RTP packets)
    "-i", "pipe:0",
    // Output fMP4 to stdout
    ...FMPEG_OUTPUT_FLAGS,
  ], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const subscriptions: Subscription[] = [];

  // Pipe video RTP packets to ffmpeg stdin
  const videoSub = liveCall.onVideoRtp.subscribe((rtpPacket) => {
    if (proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.write(rtpPacket.serialize());
    }
  });
  subscriptions.push(videoSub);

  // Pipe audio RTP packets to ffmpeg stdin
  const audioSub = liveCall.onAudioRtp.subscribe((rtpPacket) => {
    if (proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.write(rtpPacket.serialize());
    }
  });
  subscriptions.push(audioSub);

  // Capture fMP4 data from stdout
  proc.stdout?.on("data", (chunk: Buffer) => {
    emitData(chunk);
  });

  // Log ffmpeg stderr for debugging
  proc.stderr?.on("data", (data: Buffer) => {
    log.debug(`[ffmpeg-pipeline] ffmpeg stderr: ${data.toString().trimEnd()}`);
  });

  proc.on("error", (err) => {
    log.error(`[ffmpeg-pipeline] ffmpeg process error: ${err.message}`);
  });

  proc.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      log.error(`[ffmpeg-pipeline] ffmpeg exited with code ${code}`);
    } else if (signal) {
      log.info(`[ffmpeg-pipeline] ffmpeg killed with signal ${signal}`);
    }
  });

  onStarted(proc, subscriptions);
  log.info("[ffmpeg-pipeline] fallback ffmpeg pipeline started");
}
