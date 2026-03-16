import { Router } from "express";
import { getConfig, updateConfig } from "../config/store.js";

const router = Router();

router.get("/", (req, res) => {
  const { defaults } = getConfig();
  res.json(defaults);
});

router.put("/", (req, res) => {
  const { recordingDuration, cooldownSeconds, retentionDays } = req.body;
  const update = {};
  if (typeof recordingDuration === "number" && recordingDuration > 0)
    update.recordingDuration = recordingDuration;
  if (typeof cooldownSeconds === "number" && cooldownSeconds >= 0)
    update.cooldownSeconds = cooldownSeconds;
  if (typeof retentionDays === "number" && retentionDays >= 0)
    update.retentionDays = retentionDays;

  const cfg = updateConfig({ defaults: { ...getConfig().defaults, ...update } });
  res.json(cfg.defaults);
});

export default router;
