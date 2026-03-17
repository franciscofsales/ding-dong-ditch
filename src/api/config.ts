import { Router, type Request, type Response } from "express";
import { getConfig, updateConfig } from "../config/store.js";
import type { DefaultsConfig } from "../types.js";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  const { defaults } = getConfig();
  res.json(defaults);
});

router.put("/", (req: Request, res: Response) => {
  const { recordingDuration, cooldownSeconds, retentionDays, mqttEventFilter } = req.body;
  const update: Partial<DefaultsConfig> = {};
  if (typeof recordingDuration === "number" && recordingDuration > 0)
    update.recordingDuration = recordingDuration;
  if (typeof cooldownSeconds === "number" && cooldownSeconds >= 0)
    update.cooldownSeconds = cooldownSeconds;
  if (typeof retentionDays === "number" && retentionDays >= 0)
    update.retentionDays = retentionDays;
  if (mqttEventFilter === 'all' || mqttEventFilter === 'motion' || mqttEventFilter === 'doorbell')
    update.mqttEventFilter = mqttEventFilter;

  const cfg = updateConfig({ defaults: { ...getConfig().defaults, ...update } });
  res.json(cfg.defaults);
});

export default router;
