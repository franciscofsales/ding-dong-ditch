import { describe, it, expect } from "vitest";
import { ThumbnailCache } from "./thumbnailCache";

describe("ThumbnailCache", () => {
  it("stores and retrieves a value", () => {
    const cache = new ThumbnailCache();
    cache.set("a", "data:image/jpeg;base64,A");
    expect(cache.get("a")).toBe("data:image/jpeg;base64,A");
  });

  it("returns undefined for missing keys", () => {
    const cache = new ThumbnailCache();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("returns cached value on second call with same key (cache hit)", () => {
    const cache = new ThumbnailCache();
    cache.set("key1", "value1");
    // First retrieval
    expect(cache.get("key1")).toBe("value1");
    // Second retrieval - same value, no re-computation needed
    expect(cache.get("key1")).toBe("value1");
  });

  it("reports size correctly", () => {
    const cache = new ThumbnailCache(10);
    cache.set("a", "1");
    cache.set("b", "2");
    expect(cache.size).toBe(2);
  });

  it("has() returns true for existing keys and false otherwise", () => {
    const cache = new ThumbnailCache();
    cache.set("x", "val");
    expect(cache.has("x")).toBe(true);
    expect(cache.has("y")).toBe(false);
  });

  it("overwrites value when setting same key twice", () => {
    const cache = new ThumbnailCache();
    cache.set("a", "old");
    cache.set("a", "new");
    expect(cache.get("a")).toBe("new");
    expect(cache.size).toBe(1);
  });

  it("evicts oldest entry when cache is full", () => {
    const cache = new ThumbnailCache(3);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");

    // Cache is now full (3/3). Adding a 4th should evict "a".
    cache.set("d", "4");

    expect(cache.has("a")).toBe(false);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
    expect(cache.get("d")).toBe("4");
    expect(cache.size).toBe(3);
  });

  it("evicts multiple oldest entries as more items are added", () => {
    const cache = new ThumbnailCache(2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3"); // evicts a
    cache.set("d", "4"); // evicts b

    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(false);
    expect(cache.get("c")).toBe("3");
    expect(cache.get("d")).toBe("4");
  });

  it("re-setting an existing key refreshes its position (not evicted early)", () => {
    const cache = new ThumbnailCache(3);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");

    // Re-set "a" to refresh it — now "b" is the oldest
    cache.set("a", "updated");
    cache.set("d", "4"); // should evict "b", not "a"

    expect(cache.has("b")).toBe(false);
    expect(cache.get("a")).toBe("updated");
    expect(cache.get("c")).toBe("3");
    expect(cache.get("d")).toBe("4");
  });

  it("clear() removes all entries", () => {
    const cache = new ThumbnailCache();
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("a")).toBe(false);
  });

  it("uses default maxSize of 200", () => {
    const cache = new ThumbnailCache();
    for (let i = 0; i < 201; i++) {
      cache.set(`key${i}`, `val${i}`);
    }
    expect(cache.size).toBe(200);
    // key0 should have been evicted
    expect(cache.has("key0")).toBe(false);
    expect(cache.has("key1")).toBe(true);
  });
});
