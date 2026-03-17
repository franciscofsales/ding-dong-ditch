import type { Response } from "express";

export interface StorageBackend {
  persist(localPath: string, key: string): Promise<void>;
  serve(key: string, res: Response): Promise<void>;
  delete(key: string): Promise<void>;
  deleteOlderThan(cutoffDate: string): Promise<void>;
  getLocalPath(key: string): Promise<string>;
}
