import fs from "fs";
import path from "path";
import type { AppConfig, CameraConfig } from "../types.js";

const CONFIG_DIR = process.env.CONFIG_PATH || path.join(process.cwd(), "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: AppConfig = {
  refreshToken: null,
  cameras: {},
  defaults: {
    recordingDuration: 120,
    cooldownSeconds: 20,
    retentionDays: 30,
    mqttEventFilter: 'all' as const,
  },
};

function load(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

let config = load();

export function getConfig(): AppConfig {
  return config;
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  config = { ...config, ...partial };
  save();
  return config;
}

export function getToken(): string | null {
  return config.refreshToken;
}

export function setToken(token: string): void {
  config.refreshToken = token;
  save();
}

export function getCameraConfig(id: string | number): CameraConfig {
  return config.cameras[id] || {
    enabled: true,
    recordingDuration: config.defaults.recordingDuration,
    cooldownSeconds: config.defaults.cooldownSeconds,
  };
}

export function setCameraConfig(id: string | number, partial: Partial<CameraConfig>): CameraConfig {
  config.cameras[id] = { ...getCameraConfig(id), ...partial };
  save();
  return config.cameras[id];
}

function save(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = CONFIG_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
}
