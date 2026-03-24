import type { RingCamera } from "ring-client-api";
import { log } from "../logger.js";

interface LiveSession {
  cameraId: number;
  cameraName: string;
  liveCall: { stop: () => Promise<void> };
  startedAt: number;
}

/**
 * Manages live viewing sessions for Ring cameras.
 *
 * IMPORTANT — Recording pipeline coexistence:
 * Each call to `camera.startLiveCall()` opens an independent SIP/WebRTC session
 * with the Ring cloud. The Ring SDK supports multiple concurrent live calls on
 * the same camera (e.g. one for live view, one for recording). The live session
 * managed here does NOT interfere with the recording pipeline in
 * `clip-recorder.ts`, because each creates its own live call instance.
 *
 * Known limitation: Ring hardware imposes a cap on concurrent streams (typically
 * 2-3 depending on camera model). If the camera is already at its stream limit
 * (e.g. live view + recording + another viewer), additional `startLiveCall()`
 * calls may fail. In practice this is rare for the 2-stream case (live + record).
 */
const sessions = new Map<number, LiveSession>();

export async function startLiveSession(cam: RingCamera): Promise<LiveSession> {
  if (sessions.has(cam.id)) {
    log.info(`[live] ${cam.name}: session already active`);
    return sessions.get(cam.id)!;
  }

  log.info(`[live] ${cam.name}: starting live session`);
  const liveCall = await cam.startLiveCall();

  const session: LiveSession = {
    cameraId: cam.id,
    cameraName: cam.name,
    liveCall,
    startedAt: Date.now(),
  };

  sessions.set(cam.id, session);
  return session;
}

export async function stopLiveSession(cameraId: number): Promise<void> {
  const session = sessions.get(cameraId);
  if (!session) {
    log.info(`[live] camera ${cameraId}: no active session to stop`);
    return;
  }

  log.info(`[live] ${session.cameraName}: stopping live session`);
  try {
    await session.liveCall.stop();
  } catch (e) {
    log.error(`[live] ${session.cameraName}: error stopping session:`, (e as Error).message);
  } finally {
    sessions.delete(cameraId);
  }
}

export function getActiveSession(cameraId: number): LiveSession | undefined {
  return sessions.get(cameraId);
}

export function getActiveSessions(): LiveSession[] {
  return Array.from(sessions.values());
}

/** Clear all sessions (useful for testing). */
export function clearAllSessions(): void {
  sessions.clear();
}
