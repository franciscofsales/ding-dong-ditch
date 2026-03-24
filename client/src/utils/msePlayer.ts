/**
 * MSE fMP4 player utility.
 *
 * Initializes a MediaSource, creates a SourceBuffer for a given codec,
 * queues incoming binary fMP4 chunks, and handles QuotaExceededError
 * by trimming old buffer data.
 */

/** Seconds of buffered data to retain when trimming after QuotaExceededError. */
const BUFFER_TRIM_KEEP_SECONDS = 30;

export interface MsePlayer {
  /** Append an fMP4 chunk (init segment or media segment). */
  appendChunk(data: ArrayBuffer): void;
  /** Tear down MediaSource, SourceBuffer, and object URL. */
  destroy(): void;
  /** True once MediaSource is open and SourceBuffer is ready. */
  readonly isReady: boolean;
}

/**
 * Create an MSE-backed fMP4 player attached to the given `<video>` element.
 *
 * The returned promise resolves once the MediaSource is open and the
 * SourceBuffer has been created — i.e. when the player is ready to
 * receive chunks via `appendChunk`.
 */
export function createMsePlayer(
  video: HTMLVideoElement,
  codec: string,
): Promise<MsePlayer> {
  return new Promise<MsePlayer>((resolve, reject) => {
    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    video.src = objectUrl;

    let sourceBuffer: SourceBuffer | null = null;
    let ready = false;
    let destroyed = false;
    const queue: ArrayBuffer[] = [];

    // --- helpers -----------------------------------------------------------

    function flushQueue(): void {
      if (destroyed || !sourceBuffer || sourceBuffer.updating || queue.length === 0) {
        return;
      }

      const chunk = queue.shift()!;
      try {
        sourceBuffer.appendBuffer(chunk);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "QuotaExceededError") {
          trimBuffer();
          // Re-queue the chunk so it will be retried after the trim completes.
          queue.unshift(chunk);
        } else {
          throw err;
        }
      }
    }

    function trimBuffer(): void {
      if (!sourceBuffer || sourceBuffer.updating || destroyed) {
        return;
      }

      const currentTime = video.currentTime;
      const removeEnd = Math.max(0, currentTime - BUFFER_TRIM_KEEP_SECONDS);
      if (removeEnd <= 0) {
        return;
      }

      try {
        sourceBuffer.remove(0, removeEnd);
      } catch {
        // MediaSource may already be closed — ignore gracefully.
      }
    }

    function onUpdateEnd(): void {
      flushQueue();
    }

    // --- MediaSource lifecycle --------------------------------------------

    function onSourceOpen(): void {
      if (destroyed) return;

      try {
        sourceBuffer = mediaSource.addSourceBuffer(codec);
      } catch (err) {
        reject(err);
        return;
      }

      sourceBuffer.addEventListener("updateend", onUpdateEnd);
      ready = true;

      resolve({
        get isReady() {
          return ready && !destroyed;
        },
        appendChunk,
        destroy,
      });
    }

    function appendChunk(data: ArrayBuffer): void {
      if (destroyed) {
        return;
      }

      queue.push(data);
      flushQueue();
    }

    function destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      ready = false;

      if (sourceBuffer) {
        sourceBuffer.removeEventListener("updateend", onUpdateEnd);

        try {
          if (mediaSource.readyState === "open") {
            sourceBuffer.abort();
            mediaSource.removeSourceBuffer(sourceBuffer);
          }
        } catch {
          // Already detached — ignore.
        }
        sourceBuffer = null;
      }

      try {
        if (mediaSource.readyState === "open") {
          mediaSource.endOfStream();
        }
      } catch {
        // Ignore if already closed.
      }

      URL.revokeObjectURL(objectUrl);

      mediaSource.removeEventListener("sourceopen", onSourceOpen);
    }

    mediaSource.addEventListener("sourceopen", onSourceOpen);
  });
}
