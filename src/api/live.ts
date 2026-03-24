import type { Server as HttpServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import type { IncomingMessage } from "http";
import crypto from "crypto";
import { liveSessionManager } from "../live/session-manager.js";
import { log } from "../logger.js";

const UI_PASSWORD = process.env.UI_PASSWORD || "";
const AUTH_TOKEN = UI_PASSWORD
  ? crypto.createHmac("sha256", "dingdongditch").update(UI_PASSWORD).digest("hex")
  : "";

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

function isAuthorized(req: IncomingMessage): boolean {
  if (!UI_PASSWORD) return true;

  // Check cookie auth
  const token = parseCookie(req.headers.cookie, "auth_token");
  if (token && token === AUTH_TOKEN) return true;

  // Check query string token (?token=...)
  const url = new URL(req.url || "/", "http://localhost");
  const queryToken = url.searchParams.get("token");
  if (queryToken && queryToken === AUTH_TOKEN) return true;

  return false;
}

export interface LiveWsMessage {
  type: "start" | "stop";
  cameraId: number;
}

export function attachLiveWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/api/live/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    if (!isAuthorized(req)) {
      log.warn("[live-ws] unauthorized connection attempt");
      ws.send(JSON.stringify({ type: "error", message: "unauthorized" }));
      ws.close(4401, "unauthorized");
      return;
    }

    log.info("[live-ws] client connected");

    ws.on("message", async (raw) => {
      try {
        const msg: LiveWsMessage = JSON.parse(raw.toString());

        if (msg.type === "start" && typeof msg.cameraId === "number") {
          await liveSessionManager.startSession(msg.cameraId);
          liveSessionManager.joinSession(msg.cameraId, ws);
          ws.send(JSON.stringify({ type: "started", cameraId: msg.cameraId }));
        } else if (msg.type === "stop" && typeof msg.cameraId === "number") {
          liveSessionManager.leaveSession(msg.cameraId, ws);
          ws.send(JSON.stringify({ type: "stopped", cameraId: msg.cameraId }));
        }
      } catch (err) {
        log.error("[live-ws] message error:", (err as Error).message);
        ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
      }
    });

    ws.on("close", () => {
      log.info("[live-ws] client disconnected");
    });
  });

  return wss;
}

export { isAuthorized };
