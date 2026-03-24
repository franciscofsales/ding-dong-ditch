import type { RingCamera } from "ring-client-api";
import { createFfmpegPipeline, type FfmpegPipeline } from "./ffmpeg-pipeline.js";
import { log } from "../logger.js";

/** Minimal WebSocket interface used by the session manager. */
export interface LiveWebSocket {
  readonly readyState: number;
  readonly OPEN: number;
  send(data: string | Buffer): void;
  close(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

interface LiveSession {
  cameraId: number;
  camera: RingCamera;
  clients: Set<LiveWebSocket>;
  pipeline: FfmpegPipeline | null;
  reconnectAttempted: boolean;
}

export class LiveSessionManager {
  private sessions = new Map<number, LiveSession>();

  /**
   * Start a live session for a camera.  If a session already exists,
   * the new client is added to the existing viewer set.
   */
  async startSession(camera: RingCamera, client: LiveWebSocket): Promise<void> {
    const existing = this.sessions.get(camera.id);
    if (existing) {
      existing.clients.add(client);
      this.bindClientClose(camera.id, client);
      return;
    }

    const session: LiveSession = {
      cameraId: camera.id,
      camera,
      clients: new Set([client]),
      pipeline: null,
      reconnectAttempted: false,
    };
    this.sessions.set(camera.id, session);
    this.bindClientClose(camera.id, client);

    await this.doStartSession(session);
  }

  /**
   * Remove a client from a session.  If no clients remain, stop the session.
   */
  removeClient(cameraId: number, client: LiveWebSocket): void {
    const session = this.sessions.get(cameraId);
    if (!session) return;

    session.clients.delete(client);
    if (session.clients.size === 0) {
      this.stopSession(cameraId);
    }
  }

  /**
   * Stop and clean up a live session entirely.
   */
  stopSession(cameraId: number): void {
    const session = this.sessions.get(cameraId);
    if (!session) return;

    session.pipeline?.stop();
    session.pipeline = null;
    this.sessions.delete(cameraId);

    for (const ws of session.clients) {
      try {
        if (ws.readyState === ws.OPEN) {
          ws.close();
        }
      } catch {
        /* ignore */
      }
    }
    session.clients.clear();
    log.info(`[live] camera ${cameraId}: session stopped`);
  }

  /**
   * Broadcast a JSON message to all clients watching a camera.
   */
  broadcastMessage(cameraId: number, message: object): void {
    const session = this.sessions.get(cameraId);
    if (!session) return;

    const payload = JSON.stringify(message);
    for (const ws of session.clients) {
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(payload);
        }
      } catch {
        /* ignore send errors */
      }
    }
  }

  /**
   * Broadcast a binary chunk to all clients watching a camera.
   */
  broadcastChunk(cameraId: number, chunk: Buffer): void {
    const session = this.sessions.get(cameraId);
    if (!session) return;

    for (const ws of session.clients) {
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(chunk);
        }
      } catch {
        /* ignore send errors */
      }
    }
  }

  /** Visible for testing. */
  getSession(cameraId: number): LiveSession | undefined {
    return this.sessions.get(cameraId);
  }

  // ----------------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------------

  private async doStartSession(session: LiveSession): Promise<void> {
    const { camera, cameraId } = session;

    try {
      const liveCall = await camera.startLiveCall();

      const pipeline = createFfmpegPipeline({
        onChunk: (chunk: Buffer) => this.broadcastChunk(cameraId, chunk),
      });
      session.pipeline = pipeline;

      await pipeline.start(liveCall);

      log.info(`[live] camera ${cameraId}: session started`);

      // Subscribe to call-ended for auto-reconnect
      liveCall.onCallEnded.subscribe({
        next: () => this.handleCallEnded(session),
      });
    } catch (err) {
      log.error(
        `[live] camera ${cameraId}: failed to start session: ${(err as Error).message}`,
      );
      this.broadcastMessage(cameraId, {
        type: "error",
        message: "Camera disconnected",
      });
      this.stopSession(cameraId);
    }
  }

  private async handleCallEnded(session: LiveSession): Promise<void> {
    const { cameraId } = session;

    // Only reconnect if we haven't already tried
    if (session.reconnectAttempted) {
      log.warn(`[live] camera ${cameraId}: call ended after reconnect attempt, giving up`);
      this.broadcastMessage(cameraId, {
        type: "error",
        message: "Camera disconnected",
      });
      this.stopSession(cameraId);
      return;
    }

    session.reconnectAttempted = true;
    log.info(`[live] camera ${cameraId}: call ended, attempting reconnect`);

    // Notify clients we're reconnecting
    this.broadcastMessage(cameraId, { type: "reconnecting" });

    // Stop the current pipeline
    session.pipeline?.stop();
    session.pipeline = null;

    try {
      const liveCall = await session.camera.startLiveCall();

      const pipeline = createFfmpegPipeline({
        onChunk: (chunk: Buffer) => this.broadcastChunk(cameraId, chunk),
      });
      session.pipeline = pipeline;

      await pipeline.start(liveCall);

      log.info(`[live] camera ${cameraId}: reconnected successfully`);
      this.broadcastMessage(cameraId, { type: "reconnected" });

      // Subscribe to call-ended again for the new call
      liveCall.onCallEnded.subscribe({
        next: () => this.handleCallEnded(session),
      });
    } catch (err) {
      log.error(
        `[live] camera ${cameraId}: reconnect failed: ${(err as Error).message}`,
      );
      this.broadcastMessage(cameraId, {
        type: "error",
        message: "Camera disconnected",
      });
      this.stopSession(cameraId);
    }
  }

  private bindClientClose(cameraId: number, client: LiveWebSocket): void {
    client.on("close", () => this.removeClient(cameraId, client));
    client.on("error", () => this.removeClient(cameraId, client));
  }
}
