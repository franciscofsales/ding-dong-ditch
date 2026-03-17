import { useState, useEffect, useRef } from "react";
import { api } from "../hooks/useApi";
import { useToast } from "../contexts/ToastContext";
import PageHeader from "./PageHeader";

type MqttEventFilter = 'all' | 'motion' | 'doorbell';

interface Config {
  recordingDuration: number;
  cooldownSeconds: number;
  retentionDays: number;
  mqttEventFilter: MqttEventFilter;
}

export default function SettingsTab() {
  const [duration, setDuration] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [retention, setRetention] = useState(0);
  const [mqttEventFilter, setMqttEventFilter] = useState<MqttEventFilter>('all');
  const [hasChanges, setHasChanges] = useState(false);
  const initialValues = useRef<Config | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await api<Config>("/api/config");
        setDuration(data.recordingDuration);
        setCooldown(data.cooldownSeconds);
        setRetention(data.retentionDays);
        setMqttEventFilter(data.mqttEventFilter ?? 'all');
        initialValues.current = data;
      } catch {
        // silently fail
      }
    }
    loadSettings();
  }, []);

  useEffect(() => {
    if (!initialValues.current) return;
    const changed =
      duration !== initialValues.current.recordingDuration ||
      cooldown !== initialValues.current.cooldownSeconds ||
      retention !== initialValues.current.retentionDays ||
      mqttEventFilter !== (initialValues.current.mqttEventFilter ?? 'all');
    setHasChanges(changed);
  }, [duration, cooldown, retention, mqttEventFilter]);

  async function handleSave() {
    try {
      await api("/api/config", {
        method: "PUT",
        body: JSON.stringify({
          recordingDuration: duration,
          cooldownSeconds: cooldown,
          retentionDays: retention,
          mqttEventFilter,
        }),
      });
      initialValues.current = { recordingDuration: duration, cooldownSeconds: cooldown, retentionDays: retention, mqttEventFilter };
      setHasChanges(false);
      showToast("Settings saved.", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure default recording behavior for all cameras" />

      <div className="settings-section">
        <div className="card">
          <h3 className="settings-section__title">Recording Defaults</h3>
          <p className="settings-section__desc">These settings apply to all cameras unless overridden individually.</p>

          <div className="settings-section__fields">
            <div className="settings-section__field">
              <label htmlFor="default-duration">Recording Duration (seconds)</label>
              <input
                type="number"
                id="default-duration"
                min={10}
                max={600}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
              />
              <p className="settings-section__helper">How long to record after motion is detected</p>
            </div>
            <div className="settings-section__field">
              <label htmlFor="default-cooldown">Cooldown (seconds)</label>
              <input
                type="number"
                id="default-cooldown"
                min={0}
                max={600}
                value={cooldown}
                onChange={(e) => setCooldown(parseInt(e.target.value, 10) || 0)}
              />
              <p className="settings-section__helper">Wait time before starting a new recording</p>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: "var(--space-4)" }}>
          <h3 className="settings-section__title">Storage</h3>
          <p className="settings-section__desc">Manage how long recordings are retained.</p>

          <div className="settings-section__fields">
            <div className="settings-section__field">
              <label htmlFor="default-retention">Retention (days)</label>
              <input
                type="number"
                id="default-retention"
                min={0}
                value={retention}
                onChange={(e) => setRetention(parseInt(e.target.value, 10) || 0)}
              />
              <p className="settings-section__helper">Set to 0 to keep recordings forever</p>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: "var(--space-4)" }}>
          <h3 className="settings-section__title">Home Assistant Notifications</h3>
          <p className="settings-section__desc">Control which events are published to MQTT and trigger Home Assistant automations.</p>

          <div className="settings-section__fields">
            <div className="settings-section__field">
              <label htmlFor="mqtt-event-filter">Publish events for</label>
              <select
                id="mqtt-event-filter"
                value={mqttEventFilter}
                onChange={(e) => setMqttEventFilter(e.target.value as MqttEventFilter)}
              >
                <option value="all">All events (motion &amp; doorbell)</option>
                <option value="doorbell">Doorbell only</option>
                <option value="motion">Motion only</option>
              </select>
              <p className="settings-section__helper">
                Motion events trigger when your camera detects movement. Doorbell events trigger when someone presses the doorbell button.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "var(--space-5)" }}>
        <button className="btn btn-primary" onClick={handleSave} style={{ position: "relative" }}>
          Save Settings
          {hasChanges && (
            <span
              style={{
                position: "absolute",
                top: "-3px",
                right: "-3px",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--color-fg-accent)",
              }}
              aria-label="Unsaved changes"
            />
          )}
        </button>
      </div>
    </div>
  );
}
