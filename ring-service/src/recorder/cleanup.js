import fs from "fs";
import path from "path";
import { getConfig } from "../config/store.js";

const RECORDINGS_PATH = process.env.RECORDINGS_PATH || "/recordings";
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

function cleanup() {
  const { retentionDays } = getConfig().defaults;
  if (!retentionDays || retentionDays <= 0) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  try {
    const entries = fs.readdirSync(RECORDINGS_PATH);
    for (const entry of entries) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;
      if (entry < cutoffStr) {
        const dirPath = path.join(RECORDINGS_PATH, entry);
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`[cleanup] deleted ${dirPath} (older than ${retentionDays} days)`);
      }
    }
  } catch (e) {
    console.error("[cleanup] error:", e.message);
  }
}

export function startCleanup() {
  cleanup();
  setInterval(cleanup, CLEANUP_INTERVAL);
  console.log(`[cleanup] running every hour`);
}
