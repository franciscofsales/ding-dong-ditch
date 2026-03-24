export interface LiveSession {
  active: boolean;
  clients: number;
  uptimeMs: number;
}

// In-memory store of active live sessions keyed by camera id
const sessions = new Map<string, { startedAt: number; clients: number }>();

export function registerSession(cameraId: string): void {
  if (!sessions.has(cameraId)) {
    sessions.set(cameraId, { startedAt: Date.now(), clients: 0 });
  }
}

export function removeSession(cameraId: string): void {
  sessions.delete(cameraId);
}

export function addClient(cameraId: string): void {
  const s = sessions.get(cameraId);
  if (s) s.clients++;
}

export function removeClient(cameraId: string): void {
  const s = sessions.get(cameraId);
  if (s && s.clients > 0) s.clients--;
}

export function getSession(cameraId: string): LiveSession | null {
  const s = sessions.get(cameraId);
  if (!s) return null;
  return {
    active: true,
    clients: s.clients,
    uptimeMs: Date.now() - s.startedAt,
  };
}
