import { useState, useRef, useCallback, useEffect } from "react";
import { createMsePlayer, type MsePlayer } from "../utils/msePlayer";

export type LiveState = "idle" | "connecting" | "buffering" | "live" | "error" | "paused";

export interface UseLiveStreamReturn {
  start: (cameraId: number) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  state: LiveState;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export function useLiveStream(): UseLiveStreamReturn {
  const [state, setState] = useState<LiveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<MsePlayer | null>(null);
  const pausedRef = useRef(false);
  const receivedFirstChunkRef = useRef(false);
  const stoppedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    pausedRef.current = false;
    receivedFirstChunkRef.current = false;
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    cleanup();
    setState("idle");
    setError(null);
  }, [cleanup]);

  const start = useCallback(
    (cameraId: number) => {
      // Clean up any existing connection
      cleanup();
      stoppedRef.current = false;
      receivedFirstChunkRef.current = false;

      setState("connecting");
      setError(null);

      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/api/cameras/${cameraId}/live`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      let metadataReceived = false;

      ws.onopen = () => {
        // Wait for the first message (metadata)
      };

      ws.onmessage = (event: MessageEvent) => {
        if (stoppedRef.current) return;

        // JSON messages (text)
        if (typeof event.data === "string") {
          let msg: { type: string; codec?: string; message?: string };
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }

          switch (msg.type) {
            case "metadata": {
              if (!metadataReceived && msg.codec && videoRef.current) {
                metadataReceived = true;
                const player = createMsePlayer(videoRef.current, msg.codec);
                playerRef.current = player;
                setState("buffering");
              }
              break;
            }
            case "reconnecting": {
              setState("buffering");
              break;
            }
            case "reconnected": {
              if (receivedFirstChunkRef.current && !pausedRef.current) {
                setState("live");
              }
              break;
            }
            case "error": {
              setState("error");
              setError(msg.message ?? "Server error");
              break;
            }
          }
          return;
        }

        // Binary messages (fMP4 chunks)
        if (event.data instanceof ArrayBuffer) {
          if (pausedRef.current) return;

          if (playerRef.current) {
            playerRef.current.appendChunk(event.data);

            if (!receivedFirstChunkRef.current) {
              receivedFirstChunkRef.current = true;
              setState("live");
            }
          }
        }
      };

      ws.onclose = (event: CloseEvent) => {
        if (stoppedRef.current) return;
        setState("error");
        setError(event.reason || "Connection closed unexpectedly");
      };

      ws.onerror = () => {
        if (stoppedRef.current) return;
        setState("error");
        setError("WebSocket connection error");
      };
    },
    [cleanup],
  );

  const pause = useCallback(() => {
    pausedRef.current = true;
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setState(receivedFirstChunkRef.current ? "live" : "buffering");
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  return { start, stop, pause, resume, state, error, videoRef };
}
