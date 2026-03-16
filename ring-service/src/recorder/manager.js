import { RingApi } from "ring-client-api";
import { getConfig, setToken, getCameraConfig } from "../config/store.js";
import { handleMotion } from "./motion-handler.js";

let ringApi = null;
let cameras = [];
let subscriptions = [];

export function getRingApi() {
  return ringApi;
}

export function getCameras() {
  return cameras;
}

export async function start() {
  const token = getConfig().refreshToken;
  if (!token) {
    console.log("[ring] no refresh token configured, skipping init");
    return;
  }

  try {
    ringApi = new RingApi({
      refreshToken: token,
      cameraDingsPollingSeconds: 2,
      cameraStatusPollingSeconds: 20,
    });

    ringApi.onRefreshTokenUpdated.subscribe({
      next: (newToken) => {
        console.log("[auth] refresh token updated, persisting");
        setToken(newToken.newRefreshToken);
      },
    });

    cameras = await ringApi.getCameras();
    console.log(`[ring] found ${cameras.length} camera(s): ${cameras.map((c) => c.name).join(", ")}`);

    subscribe();
  } catch (e) {
    console.error("[ring] failed to initialize:", e.message);
    ringApi = null;
    cameras = [];
  }
}

export async function stop() {
  unsubscribe();
  if (ringApi) {
    ringApi.disconnect();
    ringApi = null;
  }
  cameras = [];
}

export async function restart() {
  await stop();
  await start();
}

function subscribe() {
  unsubscribe();

  for (const cam of cameras) {
    const camCfg = getCameraConfig(cam.id);
    if (!camCfg.enabled) {
      console.log(`[ring] ${cam.name}: monitoring disabled, skipping`);
      continue;
    }

    console.log(`[ring] ${cam.name}: subscribing to motion events`);

    if (cam.onMotionDetected) {
      const sub = cam.onMotionDetected.subscribe((active) => {
        if (active) {
          console.log(`[evt] ${cam.name}: motion detected`);
          handleMotion(cam);
        }
      });
      subscriptions.push(sub);
    }

    if (cam.onDoorbellPressed) {
      const sub = cam.onDoorbellPressed.subscribe(() => {
        console.log(`[evt] ${cam.name}: doorbell pressed`);
        handleMotion(cam);
      });
      subscriptions.push(sub);
    }
  }
}

function unsubscribe() {
  for (const sub of subscriptions) {
    try { sub.unsubscribe(); } catch {}
  }
  subscriptions = [];
}
