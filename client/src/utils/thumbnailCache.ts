/**
 * Simple LRU-style cache for thumbnail data-URLs, keyed by a string
 * (typically "cameraName:timestamp"). When the cache is full the oldest
 * entry is evicted.
 */
export class ThumbnailCache {
  private readonly maxSize: number;
  private readonly cache = new Map<string, string>();

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: string): void {
    // If the key already exists, delete first so re-insertion moves it to end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entry when at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}
