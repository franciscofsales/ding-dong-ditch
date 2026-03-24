import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";
import { URL } from "url";
import { liveSessionManager } from "../live/session-manager.js";
import { log } from "../logger.js";

/**
 * Validate auth for a WebSocket connection.
 * Accepts either a cookie-based auth_token or a ?token= query parameter.
 * Returns true if auth is valid (or if UI_PASSWORD is not set).
 */
function validateAuth(
  request: IncomingMessage,
  authToken: string,
): boolean {
  // No password configured — allow all connections
  if (!authToken) return true;

  // Check ?token= query parameter
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const queryToken = url.searchParams.get("token");
  if (queryToken && queryToken === authToken) return true;

  // Check auth_token cookie
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/);
    if (match && match[1] === authToken) return true;
  }

  return false;
}

/**
 * Extract camera identifier from the WebSocket URL path.
 * Expected path: /api/cameras/:id/live
 * The :id can be a numeric Ring camera ID or a camera name (e.g., "Front_Door").
 */
function parseCameraId(url: string): string | null {
  const match = url.match(/\/api\/cameras\/([^/?]+)\/live/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

/**
 * Handle a new WebSocket connection for live camera streaming.
 * Called from the WSS connection event in src/index.ts.
 */
export function handleLiveConnection(
  ws: WebSocket,
  request: IncomingMessage,
  authToken: string,
): void {
  // Validate auth
  if (!validateAuth(request, authToken)) {
    ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
    ws.close(4001, "Unauthorized");
    return;
  }

  // Parse camera identifier from URL and resolve to numeric ID
  const cameraIdentifier = parseCameraId(request.url ?? "");
  if (cameraIdentifier === null) {
    ws.send(JSON.stringify({ type: "error", message: "Invalid camera ID" }));
    ws.close(4002, "Invalid camera ID");
    return;
  }

  const cameraId = liveSessionManager.resolveCamera(cameraIdentifier);
  if (cameraId === null) {
    ws.send(JSON.stringify({ type: "error", message: `Camera not found: ${cameraIdentifier}` }));
    ws.close(4002, "Camera not found");
    return;
  }

  // Start or join a live session
  liveSessionManager
    .startSession(cameraId)
    .then((session) => {
      // Add this client to the session
      liveSessionManager.joinSession(cameraId, ws);

      // Send metadata to the client
      ws.send(
        JSON.stringify({
          type: "metadata",
          codec: 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
        }),
      );

      log.info(`[live-ws] camera ${cameraId}: client connected`);
    })
    .catch((err) => {
      log.error(`[live-ws] camera ${cameraId}: failed to start session: ${(err as Error).message}`);
      ws.send(
        JSON.stringify({ type: "error", message: "Failed to start live session" }),
      );
      ws.close(4003, "Session start failed");
    });

  // Handle client disconnect
  ws.on("close", () => {
    liveSessionManager.leaveSession(cameraId!, ws);
    log.info(`[live-ws] camera ${cameraId}: client disconnected`);
  });

  ws.on("error", (err) => {
    log.error(`[live-ws] camera ${cameraId}: client error: ${err.message}`);
    liveSessionManager.leaveSession(cameraId!, ws);
  });
}
