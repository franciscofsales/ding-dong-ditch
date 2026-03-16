import fs from "fs";
import path from "path";

const RECORDINGS_PATH = process.env.RECORDINGS_PATH || "/recordings";

function outPath(cameraName) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, "-");
  const safeName = cameraName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(RECORDINGS_PATH, date, safeName);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${time}.mp4`);
}

export async function recordClip(cam, durationSeconds) {
  const filePath = outPath(cam.name);
  console.log(`[rec] ${cam.name}: recording ${durationSeconds}s → ${filePath}`);

  const liveCall = await cam.startLiveCall();

  try {
    const transcoder = await liveCall.startTranscoding({
      output: [
        "-t", String(durationSeconds),
        "-movflags", "faststart",
        "-pix_fmt", "yuv420p",
        filePath,
      ],
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { transcoder?.kill?.("SIGINT"); } catch {}
        resolve();
      }, (durationSeconds + 5) * 1000);

      transcoder?.on?.("close", () => {
        clearTimeout(timeout);
        resolve();
      });
      transcoder?.on?.("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });
    });

    console.log(`[rec] ${cam.name}: saved ${filePath}`);
  } finally {
    try { await liveCall.stop(); } catch {}
  }
}
