import * as fs from "fs";
import * as path from "path";
import { config } from "./config";

const SETTINGS_FILE = path.join(process.cwd(), "settings.json");

interface PersistedSettings {
  solAmount?: number;
  chonkyAmount?: number;
  rangeLowerPct?: number;
  rangeUpperPct?: number;
  ilThresholdPct?: number;
  priceAlertPct?: number;
  emergencyWithdrawPct?: number;
  baseSpreadPct?: number;
  volMultiplier?: number;
  rangeScaleEnabled?: boolean;
  rebalanceIntervalMs?: number;
  profitSweepPct?: number;
}

export function loadPersistedSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
      const saved: PersistedSettings = JSON.parse(raw);
      // Override config with persisted values
      if (saved.solAmount !== undefined) config.solAmount = saved.solAmount;
      if (saved.chonkyAmount !== undefined) config.chonkyAmount = saved.chonkyAmount;
      if (saved.rangeLowerPct !== undefined) config.rangeLowerPct = saved.rangeLowerPct;
      if (saved.rangeUpperPct !== undefined) config.rangeUpperPct = saved.rangeUpperPct;
      if (saved.ilThresholdPct !== undefined) config.ilThresholdPct = saved.ilThresholdPct;
      if (saved.priceAlertPct !== undefined) config.priceAlertPct = saved.priceAlertPct;
      if (saved.emergencyWithdrawPct !== undefined) config.emergencyWithdrawPct = saved.emergencyWithdrawPct;
      if (saved.baseSpreadPct !== undefined) config.baseSpreadPct = saved.baseSpreadPct;
      if (saved.volMultiplier !== undefined) config.volMultiplier = saved.volMultiplier;
      if (saved.rangeScaleEnabled !== undefined) config.rangeScaleEnabled = saved.rangeScaleEnabled;
      if (saved.rebalanceIntervalMs !== undefined) config.rebalanceIntervalMs = saved.rebalanceIntervalMs;
      if (saved.profitSweepPct !== undefined) config.profitSweepPct = saved.profitSweepPct;
      console.log("[Settings] Loaded persisted settings from settings.json");
    }
  } catch (err) {
    console.log("[Settings] No persisted settings found, using env vars");
  }
}

export function saveSettings() {
  try {
    const settings: PersistedSettings = {
      solAmount: config.solAmount,
      chonkyAmount: config.chonkyAmount,
      rangeLowerPct: config.rangeLowerPct,
      rangeUpperPct: config.rangeUpperPct,
      ilThresholdPct: config.ilThresholdPct,
      priceAlertPct: config.priceAlertPct,
      emergencyWithdrawPct: config.emergencyWithdrawPct,
      baseSpreadPct: config.baseSpreadPct,
      volMultiplier: config.volMultiplier,
      rangeScaleEnabled: config.rangeScaleEnabled,
      rebalanceIntervalMs: config.rebalanceIntervalMs,
      profitSweepPct: config.profitSweepPct,
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("[Settings] Failed to persist settings:", err);
  }
}
