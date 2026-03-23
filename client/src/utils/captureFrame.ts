/**
 * Captures a single frame from an HTMLVideoElement by drawing it onto a
 * temporary canvas and returning the result as a data-URL (JPEG).
 *
 * Returns `null` when the video has no usable dimensions (e.g. not yet loaded)
 * or when the canvas draw fails (e.g. CORS-tainted source).
 */
export function captureFrame(
  video: HTMLVideoElement,
  quality = 0.7,
): string | null {
  const { videoWidth, videoHeight } = video;
  if (videoWidth === 0 || videoHeight === 0) {
    return null;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    // SecurityError from tainted canvas (CORS), or other draw errors
    return null;
  }
}
