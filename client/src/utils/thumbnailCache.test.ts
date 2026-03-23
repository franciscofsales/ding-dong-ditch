import { describe, it, expect, beforeEach } from "vitest";
import { ThumbnailCache } from "./thumbnailCache";

describe("ThumbnailCache", () => {
  let cache: ThumbnailCache;

  beforeEach(() => {
    cache = new ThumbnailCache(3); // small size for easier eviction testing
  });

  it("stores and retrieves values", () => {
    cache.set("a", "data:image/jpeg;base64,AAA");
    expect(cache.get("a")).toBe("data:image/jpeg;base64,AAA");
  });

  it("returns null for missing keys", () => {
    expect(cache.get("nonexistent")).toBeNull();
  });

  it("evicts the least-recently-used entry when full", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    // Cache is now full (3/3). Inserting a 4th entry should evict "a".
    cache.set("d", "4");

    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
    expect(cache.get("d")).toBe("4");
    expect(cache.size).toBe(3);
  });

  it("get() promotes entry to most-recently-used position", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");

    // Access "a" to promote it – now "b" is the LRU entry.
    cache.get("a");

    cache.set("d", "4");
    expect(cache.get("b")).toBeNull(); // "b" was evicted, not "a"
    expect(cache.get("a")).toBe("1");
  });

  it("overwrites existing key and moves it to most-recently-used", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");

    // Overwrite "a" – should not increase size.
    cache.set("a", "updated");

    expect(cache.size).toBe(3);
    expect(cache.get("a")).toBe("updated");

    // "b" is now LRU; adding a new entry should evict it.
    cache.set("e", "5");
    expect(cache.get("b")).toBeNull();
  });

  it("clear() removes all entries", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeNull();
  });
});

describe("ThumbnailCache.makeKey", () => {
  it("formats key with 1% granularity", () => {
    expect(ThumbnailCache.makeKey("/rec/abc.mp4", 0.456)).toBe(
      "/rec/abc.mp4:46"
    );
  });

  it("rounds to nearest integer percentage", () => {
    expect(ThumbnailCache.makeKey("/v.mp4", 0)).toBe("/v.mp4:0");
    expect(ThumbnailCache.makeKey("/v.mp4", 0.005)).toBe("/v.mp4:1");
    expect(ThumbnailCache.makeKey("/v.mp4", 0.994)).toBe("/v.mp4:99");
    expect(ThumbnailCache.makeKey("/v.mp4", 1)).toBe("/v.mp4:100");
  });

  it("handles various recording paths", () => {
    expect(ThumbnailCache.makeKey("http://host/rec.mp4", 0.5)).toBe(
      "http://host/rec.mp4:50"
    );
  });
});
