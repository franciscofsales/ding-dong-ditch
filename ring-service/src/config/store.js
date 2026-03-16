import fs from "fs";
import path from "path";

const CONFIG_DIR = process.env.CONFIG_PATH || "/app/config";
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG = {
  refreshToken: null,
  cameras: {},
  defaults: {
    recordingDuration: 120,
    cooldownSeconds: 20,
    retentionDays: 30,
  },
};

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

let config = load();

export function getConfig() {
  return config;
}

export function updateConfig(partial) {
  config = { ...config, ...partial };
  save();
  return config;
}

export function getToken() {
  return config.refreshToken;
}

export function setToken(token) {
  config.refreshToken = token;
  save();
}

export function getCameraConfig(id) {
  return config.cameras[id] || {
    enabled: true,
    recordingDuration: config.defaults.recordingDuration,
    cooldownSeconds: config.defaults.cooldownSeconds,
  };
}

export function setCameraConfig(id, partial) {
  config.cameras[id] = { ...getCameraConfig(id), ...partial };
  save();
  return config.cameras[id];
}

function save() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = CONFIG_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
}
