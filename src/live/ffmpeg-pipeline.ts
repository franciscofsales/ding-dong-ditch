/**
 * Minimal type aliases for the Ring SDK streaming session.
 * The ring-client-api package does not re-export these from its main entry.
 */
type SpawnInput = string | number;

interface RingFfmpegOptions {
  input?: SpawnInput[];
  video?: SpawnInput[] | false;
  audio?: SpawnInput[];
  stdoutCallback?: (data: Buffer) => void;
  output: SpawnInput[];
}

interface RingStreamingSession {
  startTranscoding(options: RingFfmpegOptions): Promise<void>;
}

export interface FfmpegPipeline {
  start(session: RingStreamingSession): Promise<void>;
  stop(): void;
}

export interface FfmpegPipelineOptions {
  onChunk: (chunk: Buffer) => void;
}

/**
 * Creates an ffmpeg pipeline that transcodes a Ring live call to
 * fragmented MP4 and delivers chunks via callback.
 */
export function createFfmpegPipeline(
  options: FfmpegPipelineOptions,
): FfmpegPipeline {
  let stopped = false;

  return {
    async start(session: RingStreamingSession): Promise<void> {
      if (stopped) return;

      const ffmpegOptions: RingFfmpegOptions = {
        output: [
          "-f", "mp4",
          "-movflags", "frag_keyframe+empty_moov+default_base_moof",
          "-pix_fmt", "yuv420p",
          "pipe:1",
        ],
        stdoutCallback: (data: Buffer) => {
          if (!stopped) {
            options.onChunk(data);
          }
        },
      };

      await session.startTranscoding(ffmpegOptions);
    },

    stop() {
      stopped = true;
    },
  };
}
