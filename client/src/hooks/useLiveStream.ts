import { useCallback, useRef, useState } from "react";

export type LiveStreamState = "idle" | "connecting" | "buffering" | "live" | "error" | "paused";

interface UseLiveStreamReturn {
  start: (cameraId: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  state: LiveStreamState;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export function useLiveStream(): UseLiveStreamReturn {
  const [state, setState] = useState<LiveStreamState>("idle");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const pendingBuffers = useRef<ArrayBuffer[]>([]);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    if (mediaSourceRef.current && mediaSourceRef.current.readyState === "open") {
      try {
        mediaSourceRef.current.endOfStream();
      } catch {
        // ignore if already ended
      }
    }
    mediaSourceRef.current = null;
    sourceBufferRef.current = null;
    pendingBuffers.current = [];

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute("src");
    }
  }, []);

  const appendBuffer = useCallback((data: ArrayBuffer) => {
    const sb = sourceBufferRef.current;
    if (!sb) return;

    if (sb.updating) {
      pendingBuffers.current.push(data);
    } else {
      try {
        sb.appendBuffer(data);
      } catch {
        // buffer full or source removed
      }
    }
  }, []);

  const start = useCallback((cameraId: string) => {
    cleanup();
    setError(null);
    setState("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/live/${cameraId}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    let receivedFirstData = false;

    ws.onopen = () => {
      // Set up MediaSource for streaming
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;

      if (videoRef.current) {
        videoRef.current.src = URL.createObjectURL(mediaSource);
      }

      mediaSource.addEventListener("sourceopen", () => {
        try {
          const sb = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
          sourceBufferRef.current = sb;

          sb.addEventListener("updateend", () => {
            if (pendingBuffers.current.length > 0) {
              const next = pendingBuffers.current.shift()!;
              try {
                sb.appendBuffer(next);
              } catch {
                // ignore
              }
            }
          });
        } catch {
          setState("error");
          setError("Browser does not support this video format");
        }
      });
    };

    ws.onmessage = (event) => {
      if (!receivedFirstData) {
        receivedFirstData = true;
        setState("buffering");
      }

      if (event.data instanceof ArrayBuffer) {
        appendBuffer(event.data);
      }

      // Transition to live once video is playing
      if (videoRef.current && !videoRef.current.paused && videoRef.current.readyState >= 2) {
        setState((prev) => (prev === "buffering" ? "live" : prev));
      }
    };

    ws.onerror = () => {
      setState("error");
      setError("Connection failed");
    };

    ws.onclose = (event) => {
      if (state !== "idle") {
        setState("error");
        setError(event.wasClean ? "Stream ended" : "Connection lost");
      }
    };

    // Listen for video playing to transition from buffering to live
    if (videoRef.current) {
      const video = videoRef.current;
      const onPlaying = () => {
        setState((prev) => (prev === "buffering" || prev === "connecting" ? "live" : prev));
        video.removeEventListener("playing", onPlaying);
      };
      video.addEventListener("playing", onPlaying);
    }
  }, [cleanup, appendBuffer]);

  const stop = useCallback(() => {
    cleanup();
    setState("idle");
    setError(null);
  }, [cleanup]);

  const pause = useCallback(() => {
    if (videoRef.current && state === "live") {
      videoRef.current.pause();
      setState("paused");
    }
  }, [state]);

  const resume = useCallback(() => {
    if (videoRef.current && state === "paused") {
      videoRef.current.play().catch(() => {
        // autoplay blocked
      });
      setState("live");
    }
  }, [state]);

  return { start, stop, pause, resume, state, error, videoRef };
}
