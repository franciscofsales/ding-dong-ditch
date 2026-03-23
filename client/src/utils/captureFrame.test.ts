import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureFrame } from "./captureFrame";

// ---------------------------------------------------------------------------
// Helpers – mock canvas & video
// ---------------------------------------------------------------------------

function makeVideo(
  overrides: Partial<{ videoWidth: number; videoHeight: number }> = {},
): HTMLVideoElement {
  return {
    videoWidth: overrides.videoWidth ?? 640,
    videoHeight: overrides.videoHeight ?? 480,
  } as unknown as HTMLVideoElement;
}

const drawImageSpy = vi.fn();
const toDataURLSpy = vi.fn(() => "data:image/jpeg;base64,AAAA");

beforeEach(() => {
  drawImageSpy.mockClear();
  toDataURLSpy.mockClear();

  // Stub document.createElement so "canvas" returns our mock
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: drawImageSpy }),
        toDataURL: toDataURLSpy,
      } as unknown as HTMLCanvasElement;
    }
    return document.createElement(tag);
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("captureFrame", () => {
  it("returns a valid data URL for a loaded video", () => {
    const video = makeVideo();
    const result = captureFrame(video);

    expect(result).toBe("data:image/jpeg;base64,AAAA");
    expect(drawImageSpy).toHaveBeenCalledWith(video, 0, 0, 640, 480);
    expect(toDataURLSpy).toHaveBeenCalledWith("image/jpeg", 0.7);
  });

  it("passes custom quality to toDataURL", () => {
    const video = makeVideo();
    captureFrame(video, 0.5);

    expect(toDataURLSpy).toHaveBeenCalledWith("image/jpeg", 0.5);
  });

  it("returns null when videoWidth is 0", () => {
    const video = makeVideo({ videoWidth: 0 });
    expect(captureFrame(video)).toBeNull();
  });

  it("returns null when videoHeight is 0", () => {
    const video = makeVideo({ videoHeight: 0 });
    expect(captureFrame(video)).toBeNull();
  });

  it("returns null when both dimensions are 0", () => {
    const video = makeVideo({ videoWidth: 0, videoHeight: 0 });
    expect(captureFrame(video)).toBeNull();
    expect(drawImageSpy).not.toHaveBeenCalled();
  });

  it("returns null when getContext returns null", () => {
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => null,
          toDataURL: toDataURLSpy,
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tag);
    });

    const video = makeVideo();
    expect(captureFrame(video)).toBeNull();
  });

  it("returns null when drawImage throws (CORS tainted canvas)", () => {
    drawImageSpy.mockImplementation(() => {
      throw new DOMException("Tainted canvases may not be exported", "SecurityError");
    });

    const video = makeVideo();
    expect(captureFrame(video)).toBeNull();
  });
});
