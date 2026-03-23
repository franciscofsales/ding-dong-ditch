/**
 * LRU cache for video scrub-preview thumbnails.
 *
 * Thumbnails are keyed by recordingPath + offsetRatio (rounded to 1 %
 * granularity) so that repeated seeks to the same position return a
 * cached data-URL without an expensive video decode.
 */
export class ThumbnailCache {
  private cache: Map<string, string>;
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Build a cache key with 1 % granularity.
   *
   * @example
   * ThumbnailCache.makeKey('/rec/abc.mp4', 0.456) // '/rec/abc.mp4:46'
   */
  static makeKey(recordingPath: string, offsetRatio: number): string {
    return `${recordingPath}:${Math.round(offsetRatio * 100)}`;
  }

  /**
   * Return the cached data-URL for `key`, or `null` on a miss.
   *
   * A hit promotes the entry to the most-recently-used position.
   */
  get(key: string): string | null {
    const value = this.cache.get(key);
    if (value === undefined) {
      return null;
    }
    // Move to most-recently-used position (end of Map iteration order).
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Store a thumbnail data-URL.  If the cache is at capacity the
   * least-recently-used entry is evicted first.
   */
  set(key: string, dataUrl: string): void {
    // If the key already exists, delete it first so it moves to the end.
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict the least-recently-used entry (first key in iteration order).
      const lruKey = this.cache.keys().next().value;
      if (lruKey !== undefined) {
        this.cache.delete(lruKey);
      }
    }
    this.cache.set(key, dataUrl);
  }

  /** Current number of cached entries. */
  get size(): number {
    return this.cache.size;
  }

  /** Remove all cached entries. */
  clear(): void {
    this.cache.clear();
  }
}

/** Default singleton – 50-entry LRU cache. */
export const thumbnailCache = new ThumbnailCache(50);
