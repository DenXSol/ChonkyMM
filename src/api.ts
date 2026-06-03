import express from "express";
import cors from "cors";
import { config } from "./config";
import { botState } from "./state";
import { log } from "./logger";

const app = express();
app.use(cors());
app.use(express.json());

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const secret = req.headers["x-api-secret"];
  if (secret !== config.apiSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// GET /status
app.get("/status", auth, (req, res) => {
  res.json({
    ...botState,
    // Also expose current config so dashboard can show current values
    currentConfig: {
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
    }
  });
});

// POST /control
app.post("/control", auth, (req, res) => {
  const { action } = req.body;
  switch (action) {
    case "pause":
      botState.enabled = false;
      botState.status = "PAUSED";
      botState.statusReason = "Manually paused";
      log("⏸ Bot paused via dashboard", "pause");
      break;
    case "resume":
      botState.enabled = true;
      botState.status = "ACTIVE";
      botState.statusReason = "Resumed";
      log("▶️ Bot resumed via dashboard", "resume");
      break;
    case "emergency":
      botState.enabled = false;
      botState.status = "EMERGENCY";
      botState.statusReason = "Emergency withdraw triggered";
      log("🚨 Emergency withdraw triggered via dashboard", "alert");
      process.emit("SIGUSR1" as any);
      break;
    default:
      return res.status(400).json({ error: "Unknown action" });
  }
  res.json({ success: true, status: botState.status });
});

// POST /settings — update ALL configurable params live
app.post("/settings", auth, (req, res) => {
  const {
    // Position sizing
    solAmount, chonkyAmount,
    // Range
    rangeLowerPct, rangeUpperPct,
    // Risk
    ilThreshold, priceAlert, emergencyWithdrawPct,
    baseSpread, volMultiplier, rangeScale,
    // Timing
    rebalanceIntervalMinutes,
    // Profit
    profitSweepPct,
  } = req.body;

  if (solAmount !== undefined) config.solAmount = parseFloat(solAmount);
  if (chonkyAmount !== undefined) config.chonkyAmount = parseFloat(chonkyAmount);
  if (rangeLowerPct !== undefined) config.rangeLowerPct = parseFloat(rangeLowerPct);
  if (rangeUpperPct !== undefined) config.rangeUpperPct = parseFloat(rangeUpperPct);
  if (ilThreshold !== undefined) config.ilThresholdPct = parseFloat(ilThreshold);
  if (priceAlert !== undefined) config.priceAlertPct = parseFloat(priceAlert);
  if (emergencyWithdrawPct !== undefined) config.emergencyWithdrawPct = parseFloat(emergencyWithdrawPct);
  if (baseSpread !== undefined) config.baseSpreadPct = parseFloat(baseSpread);
  if (volMultiplier !== undefined) config.volMultiplier = parseFloat(volMultiplier);
  if (rangeScale !== undefined) config.rangeScaleEnabled = rangeScale === true || rangeScale === "true";
  if (rebalanceIntervalMinutes !== undefined) config.rebalanceIntervalMs = parseFloat(rebalanceIntervalMinutes) * 60 * 1000;
  if (profitSweepPct !== undefined) config.profitSweepPct = parseFloat(profitSweepPct);

  log(`⚙️ Settings updated via dashboard`, "info");
  res.json({ success: true, currentConfig: {
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
  }});
});

export function startApiServer() {
  app.listen(config.apiPort, () => {
    console.log(`[API] Bot API server running on port ${config.apiPort}`);
  });
}
