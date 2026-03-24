export interface MsePlayer {
  appendChunk: (data: ArrayBuffer) => void;
  destroy: () => void;
  isReady: () => boolean;
}

/**
 * Creates a Media Source Extensions player that feeds fMP4 chunks
 * into a SourceBuffer attached to the given video element.
 */
export function createMsePlayer(
  video: HTMLVideoElement,
  codec: string,
): MsePlayer {
  const mediaSource = new MediaSource();
  let sourceBuffer: SourceBuffer | null = null;
  let destroyed = false;
  let ready = false;
  const pendingChunks: ArrayBuffer[] = [];

  video.src = URL.createObjectURL(mediaSource);

  mediaSource.addEventListener("sourceopen", () => {
    if (destroyed) return;
    try {
      sourceBuffer = mediaSource.addSourceBuffer(codec);
      sourceBuffer.mode = "segments";
      ready = true;

      sourceBuffer.addEventListener("updateend", () => {
        if (destroyed || !sourceBuffer) return;
        if (pendingChunks.length > 0 && !sourceBuffer.updating) {
          const chunk = pendingChunks.shift()!;
          sourceBuffer.appendBuffer(chunk);
        }
      });

      // Flush any chunks that arrived before sourceopen
      if (pendingChunks.length > 0 && !sourceBuffer.updating) {
        const chunk = pendingChunks.shift()!;
        sourceBuffer.appendBuffer(chunk);
      }
    } catch (err) {
      console.error("[msePlayer] failed to add source buffer:", err);
    }
  });

  function appendChunk(data: ArrayBuffer): void {
    if (destroyed) return;
    if (sourceBuffer && !sourceBuffer.updating) {
      sourceBuffer.appendBuffer(data);
    } else {
      pendingChunks.push(data);
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    ready = false;
    pendingChunks.length = 0;

    try {
      if (sourceBuffer && mediaSource.readyState === "open") {
        sourceBuffer.abort();
        mediaSource.removeSourceBuffer(sourceBuffer);
      }
    } catch {
      // Ignore errors during cleanup
    }

    try {
      if (mediaSource.readyState === "open") {
        mediaSource.endOfStream();
      }
    } catch {
      // Ignore errors during cleanup
    }

    if (video.src) {
      URL.revokeObjectURL(video.src);
      video.src = "";
    }
    sourceBuffer = null;
  }

  function isReady(): boolean {
    return ready && !destroyed;
  }

  return { appendChunk, destroy, isReady };
}
