import { Router } from "express";
import { getCameras, restart } from "../recorder/manager.js";
import { getCameraConfig, setCameraConfig } from "../config/store.js";

const router = Router();

// List cameras with their config
router.get("/", (req, res) => {
  const cams = getCameras().map((c) => ({
    id: c.id,
    name: c.name,
    model: c.model,
    hasLight: c.hasLight,
    hasSiren: c.hasSiren,
    hasBattery: c.hasBattery,
    config: getCameraConfig(c.id),
  }));
  res.json(cams);
});

// Update camera config
router.put("/:id/config", async (req, res) => {
  const { id } = req.params;
  const { enabled, recordingDuration, cooldownSeconds } = req.body;

  const update = {};
  if (typeof enabled === "boolean") update.enabled = enabled;
  if (typeof recordingDuration === "number" && recordingDuration > 0)
    update.recordingDuration = recordingDuration;
  if (typeof cooldownSeconds === "number" && cooldownSeconds >= 0)
    update.cooldownSeconds = cooldownSeconds;

  const cfg = setCameraConfig(id, update);
  await restart();
  res.json(cfg);
});

export default router;
