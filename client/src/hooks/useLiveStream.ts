import { useCallback, useRef, useState } from "react";

export type LiveStreamState =
  | "idle"
  | "connecting"
  | "buffering"
  | "live"
  | "paused"
  | "error";

export interface LiveStream {
  state: LiveStreamState;
  start: (camera: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  /** The camera currently associated with this live session */
  camera: string | null;
  /** The WebSocket instance (exposed for LivePlayer to consume the stream) */
  ws: WebSocket | null;
}

/**
 * Hook that manages a live camera stream over WebSocket.
 *
 * State machine:
 *   idle -> connecting -> buffering -> live
 *   live -> paused (WS stays open)
 *   paused -> live (resume)
 *   paused -> error (WS died while paused)
 *   any -> idle (stop)
 *   any -> error (WS error / unexpected close)
 */
export function useLiveStream(): LiveStream {
  const [state, setState] = useState<LiveStreamState>("idle");
  const [camera, setCamera] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const start = useCallback(
    (cam: string) => {
      cleanup();
      setCamera(cam);
      setState("connecting");

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/live/${encodeURIComponent(cam)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setState("buffering");
      };

      ws.onmessage = () => {
        // First message indicates stream data is flowing
        setState((prev) => (prev === "buffering" ? "live" : prev));
      };

      ws.onerror = () => {
        setState("error");
      };

      ws.onclose = () => {
        setState((prev) => {
          // If we were paused when the WS closed, transition to error
          // so the return-to-live handler knows to start a new session.
          if (prev === "paused") return "error";
          // If already idle (explicit stop), stay idle
          if (prev === "idle") return "idle";
          return "error";
        });
        wsRef.current = null;
      };
    },
    [cleanup],
  );

  const stop = useCallback(() => {
    cleanup();
    setState("idle");
    setCamera(null);
  }, [cleanup]);

  const pause = useCallback(() => {
    setState((prev) => {
      if (prev === "live" || prev === "buffering" || prev === "connecting") {
        return "paused";
      }
      return prev;
    });
  }, []);

  const resume = useCallback(() => {
    setState((prev) => {
      if (prev === "paused") return "live";
      return prev;
    });
  }, []);

  return {
    state,
    start,
    stop,
    pause,
    resume,
    camera,
    ws: wsRef.current,
  };
}
