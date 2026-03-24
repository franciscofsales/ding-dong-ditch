import type { WebSocket } from "ws";
import type { RingCamera } from "ring-client-api";

type StreamingSession = Awaited<ReturnType<RingCamera["startLiveCall"]>>;
import { getCameras } from "../recorder/manager.js";
import { log } from "../logger.js";
import { createFfmpegPipeline, type FfmpegPipeline } from "./ffmpeg-pipeline.js";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const GRACE_PERIOD_MS = 10 * 1000; // 10 seconds

export interface LiveSession {
  cameraId: number;
  clients: Set<WebSocket>;
  liveCall: StreamingSession | null;
  pipeline: FfmpegPipeline | null;
  startedAt: Date;
  graceTimer: NodeJS.Timeout | null;
  idleTimer: NodeJS.Timeout | null;
  reconnectAttempted: boolean;
}

export interface SessionStatus {
  active: boolean;
  clients: number;
  uptimeMs: number;
}

export class LiveSessionManager {
  private sessions: Map<number, LiveSession> = new Map();
  private pending: Map<number, Promise<LiveSession>> = new Map();

  async startSession(cameraId: number): Promise<LiveSession> {
    const existing = this.sessions.get(cameraId);
    if (existing) {
      log.info(`[live] camera ${cameraId}: session already active`);
      return existing;
    }

    // Deduplicate concurrent startSession calls for the same camera
    const pendingStart = this.pending.get(cameraId);
    if (pendingStart) {
      return pendingStart;
    }

    const promise = this.doStartSession(cameraId);
    this.pending.set(cameraId, promise);

    try {
      return await promise;
    } finally {
      this.pending.delete(cameraId);
    }
  }

  private async doStartSession(cameraId: number): Promise<LiveSession> {

    const camera = this.findCamera(cameraId);
    if (!camera) {
      throw new Error(`Camera ${cameraId} not found`);
    }

    log.info(`[live] camera ${cameraId}: starting live session`);

    const liveCall = await camera.startLiveCall();

    const session: LiveSession = {
      cameraId,
      clients: new Set(),
      liveCall,
      pipeline: null,
      startedAt: new Date(),
      graceTimer: null,
      idleTimer: null,
      reconnectAttempted: false,
    };

    this.sessions.set(cameraId, session);

    const pipeline = await createFfmpegPipeline(liveCall);
    session.pipeline = pipeline;

    pipeline.onData((data: Buffer) => {
      this.broadcastChunk(cameraId, data);
    });

    liveCall.onCallEnded.subscribe(() => {
      this.handleCallEnded(cameraId);
    });

    this.resetIdleTimer(session);

    log.info(`[live] camera ${cameraId}: live session started`);
    return session;
  }

  joinSession(cameraId: number, ws: WebSocket): LiveSession | null {
    const session = this.sessions.get(cameraId);
    if (!session) {
      return null;
    }

    session.clients.add(ws);

    if (session.graceTimer) {
      clearTimeout(session.graceTimer);
      session.graceTimer = null;
    }

    this.resetIdleTimer(session);

    log.info(`[live] camera ${cameraId}: client joined (${session.clients.size} total)`);
    return session;
  }

  leaveSession(cameraId: number, ws: WebSocket): void {
    const session = this.sessions.get(cameraId);
    if (!session) {
      return;
    }

    session.clients.delete(ws);
    log.info(`[live] camera ${cameraId}: client left (${session.clients.size} remaining)`);

    if (session.clients.size === 0) {
      session.graceTimer = setTimeout(() => {
        session.graceTimer = null;
        if (session.clients.size === 0) {
          log.info(`[live] camera ${cameraId}: grace period expired, stopping session`);
          this.stopSession(cameraId);
        }
      }, GRACE_PERIOD_MS);
    }
  }

  getSession(cameraId: number): SessionStatus | null {
    const session = this.sessions.get(cameraId);
    if (!session) {
      return null;
    }

    return {
      active: true,
      clients: session.clients.size,
      uptimeMs: Date.now() - session.startedAt.getTime(),
    };
  }

  async stopSession(cameraId: number): Promise<void> {
    const session = this.sessions.get(cameraId);
    if (!session) {
      return;
    }

    log.info(`[live] camera ${cameraId}: stopping session`);

    if (session.pipeline) {
      session.pipeline.stop();
      session.pipeline = null;
    }

    if (session.liveCall) {
      try {
        session.liveCall.stop();
      } catch {
        /* ignore */
      }
    }

    this.cleanupSession(cameraId);
  }

  broadcastChunk(cameraId: number, data: Buffer): void {
    const session = this.sessions.get(cameraId);
    if (!session) {
      return;
    }

    for (const client of session.clients) {
      if (client.readyState === 1 /* WebSocket.OPEN */) {
        client.send(data);
      }
    }
  }

  broadcastMessage(cameraId: number, message: object): void {
    const session = this.sessions.get(cameraId);
    if (!session) return;

    const json = JSON.stringify(message);
    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(json);
      }
    }
  }

  private async handleCallEnded(cameraId: number): Promise<void> {
    const session = this.sessions.get(cameraId);
    if (!session) return;

    if (session.reconnectAttempted) {
      log.info(`[live] camera ${cameraId}: call ended again after reconnect, giving up`);
      this.broadcastMessage(cameraId, { type: "error", message: "Camera disconnected" });
      this.stopSession(cameraId);
      return;
    }

    session.reconnectAttempted = true;
    log.info(`[live] camera ${cameraId}: call ended, attempting reconnect`);
    this.broadcastMessage(cameraId, { type: "reconnecting" });

    // Stop current pipeline
    if (session.pipeline) {
      session.pipeline.stop();
      session.pipeline = null;
    }

    try {
      const camera = this.findCamera(cameraId);
      if (!camera) throw new Error("Camera not found");

      const newLiveCall = await camera.startLiveCall();
      session.liveCall = newLiveCall;

      const newPipeline = await createFfmpegPipeline(newLiveCall);
      session.pipeline = newPipeline;

      newPipeline.onData((data: Buffer) => {
        this.broadcastChunk(cameraId, data);
      });

      newLiveCall.onCallEnded.subscribe(() => {
        this.handleCallEnded(cameraId);
      });

      this.broadcastMessage(cameraId, { type: "reconnected" });
      log.info(`[live] camera ${cameraId}: reconnected successfully`);
    } catch (err) {
      log.error(`[live] camera ${cameraId}: reconnect failed`, err);
      this.broadcastMessage(cameraId, { type: "error", message: "Camera disconnected" });
      this.stopSession(cameraId);
    }
  }

  private cleanupSession(cameraId: number): void {
    const session = this.sessions.get(cameraId);
    if (!session) {
      return;
    }

    if (session.graceTimer) {
      clearTimeout(session.graceTimer);
      session.graceTimer = null;
    }

    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }

    // Close all connected clients
    for (const client of session.clients) {
      try {
        client.close(1000, "session ended");
      } catch {
        /* ignore */
      }
    }
    session.clients.clear();

    this.sessions.delete(cameraId);
    log.info(`[live] camera ${cameraId}: session cleaned up`);
  }

  private resetIdleTimer(session: LiveSession): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
    }

    session.idleTimer = setTimeout(() => {
      session.idleTimer = null;
      log.info(`[live] camera ${session.cameraId}: idle timeout, stopping session`);
      this.stopSession(session.cameraId);
    }, IDLE_TIMEOUT_MS);
  }

  private findCamera(cameraId: number): RingCamera | undefined {
    return getCameras().find((c) => c.id === cameraId);
  }

  /**
   * Resolve a camera identifier (numeric ID or name) to a numeric Ring camera ID.
   * Returns null if no matching camera is found.
   */
  resolveCamera(identifier: string | number): number | null {
    const cameras = getCameras();

    // Try numeric ID first
    const numId = typeof identifier === "number" ? identifier : parseInt(identifier, 10);
    if (!isNaN(numId) && cameras.some((c) => c.id === numId)) {
      return numId;
    }

    // Try by name (camera names use underscores for spaces in paths)
    const name = String(identifier).replace(/_/g, " ");
    const byName = cameras.find(
      (c) => c.name === name || c.name === String(identifier),
    );
    if (byName) return byName.id;

    return null;
  }
}

export const liveSessionManager = new LiveSessionManager();
