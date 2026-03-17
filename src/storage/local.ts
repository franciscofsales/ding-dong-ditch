import fs from "fs";
import path from "path";
import type { Response } from "express";
import type { StorageBackend } from "./backend.js";
import { log } from "../logger.js";

export class LocalStorageBackend implements StorageBackend {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async persist(localPath: string, key: string): Promise<void> {
    const dest = path.join(this.basePath, key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.renameSync(localPath, dest);
    } catch {
      // Cross-device move: fall back to copy + unlink
      fs.copyFileSync(localPath, dest);
      fs.unlinkSync(localPath);
    }
  }

  async serve(key: string, res: Response): Promise<void> {
    const filePath = path.join(this.basePath, key);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.sendFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
    if (!fs.existsSync(filePath)) return;

    fs.unlinkSync(filePath);

    // Clean up empty parent directories
    const parts = key.split("/");
    if (parts.length >= 2) {
      const camDir = path.join(this.basePath, parts[0], parts[1]);
      if (fs.existsSync(camDir) && fs.readdirSync(camDir).length === 0) {
        fs.rmdirSync(camDir);
        const dateDir = path.join(this.basePath, parts[0]);
        if (fs.existsSync(dateDir) && fs.readdirSync(dateDir).length === 0) {
          fs.rmdirSync(dateDir);
        }
      }
    }
  }

  async getLocalPath(key: string): Promise<string> {
    return path.join(this.basePath, key);
  }

  async deleteOlderThan(cutoffDate: string): Promise<void> {
    try {
      const entries = fs.readdirSync(this.basePath);
      for (const entry of entries) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;
        if (entry < cutoffDate) {
          const dirPath = path.join(this.basePath, entry);
          fs.rmSync(dirPath, { recursive: true, force: true });
          log.info(`[cleanup] deleted ${dirPath}`);
        }
      }
    } catch (e) {
      log.error("[cleanup] error:", (e as Error).message);
    }
  }
}
