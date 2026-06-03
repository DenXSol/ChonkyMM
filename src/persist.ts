import { config } from "./config";

// Settings are persisted to Railway environment variables via the Railway API
// This means they survive container restarts and redeployments

const RAILWAY_API = "https://backboard.railway.app/graphql/v2";
const RAILWAY_TOKEN = process.env.RAILWAY_API_TOKEN || "";
const RAILWAY_SERVICE_ID = process.env.RAILWAY_SERVICE_ID || "";
const RAILWAY_ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID || "";

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
  // Settings are loaded directly from env vars on startup — Railway persists them
  // Any values set via dashboard get written back to Railway env vars
  // So on next restart, Railway injects the updated values automatically
  console.log("[Settings] Loading from env vars:");
  console.log(`  SOL_AMOUNT=${process.env.SOL_AMOUNT || "default 1.3"}`);
  console.log(`  RANGE_LOWER_PCT=${process.env.RANGE_LOWER_PCT || "default 20"}`);
  console.log(`  RANGE_UPPER_PCT=${process.env.RANGE_UPPER_PCT || "default 60"}`);
  console.log(`  REBALANCE_INTERVAL_MS=${process.env.REBALANCE_INTERVAL_MS || "default 4800000"}`);
}

async function upsertRailwayVariable(name: string, value: string): Promise<void> {
  if (!RAILWAY_TOKEN || !RAILWAY_SERVICE_ID || !RAILWAY_ENVIRONMENT_ID) return;

  try {
    const query = `
      mutation variableUpsert($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }
    `;
    await fetch(RAILWAY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RAILWAY_TOKEN}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          input: {
            serviceId: RAILWAY_SERVICE_ID,
            environmentId: RAILWAY_ENVIRONMENT_ID,
            name,
            value,
          }
        }
      }),
    });
  } catch (err) {
    console.error(`[Settings] Failed to upsert Railway var ${name}:`, err);
  }
}

export async function saveSettings(): Promise<void> {
  // Write all current config values back to Railway env vars
  // so they persist across restarts and redeployments
  const vars: Record<string, string> = {
    SOL_AMOUNT: config.solAmount.toString(),
    CHONKY_AMOUNT: config.chonkyAmount.toString(),
    RANGE_LOWER_PCT: config.rangeLowerPct.toString(),
    RANGE_UPPER_PCT: config.rangeUpperPct.toString(),
    IL_THRESHOLD_PCT: config.ilThresholdPct.toString(),
    PRICE_ALERT_PCT: config.priceAlertPct.toString(),
    EMERGENCY_WITHDRAW_PCT: config.emergencyWithdrawPct.toString(),
    BASE_SPREAD_PCT: config.baseSpreadPct.toString(),
    VOL_MULTIPLIER: config.volMultiplier.toString(),
    RANGE_SCALE_ENABLED: config.rangeScaleEnabled.toString(),
    REBALANCE_INTERVAL_MS: config.rebalanceIntervalMs.toString(),
    PROFIT_SWEEP_PCT: config.profitSweepPct.toString(),
  };

  if (RAILWAY_TOKEN && RAILWAY_SERVICE_ID && RAILWAY_ENVIRONMENT_ID) {
    // Write to Railway API in parallel
    await Promise.all(
      Object.entries(vars).map(([name, value]) => upsertRailwayVariable(name, value))
    );
    console.log("[Settings] Saved to Railway env vars");
  } else {
    // Fallback: log what would be saved (Railway vars not configured)
    console.log("[Settings] Railway API not configured — settings saved in memory only this session");
    console.log("[Settings] To enable persistent saves, add RAILWAY_API_TOKEN, RAILWAY_SERVICE_ID, RAILWAY_ENVIRONMENT_ID to Railway vars");
  }
}
