import express from "express";
import cors from "cors";
import { config } from "./config";
import { botState } from "./state";
import { log } from "./logger";

const app = express();
app.use(cors());
app.use(express.json());

// Auth middleware
function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const secret = req.headers["x-api-secret"];
  if (secret !== config.apiSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// GET /status — full bot state for dashboard
app.get("/status", auth, (req, res) => {
  res.json(botState);
});

// POST /control — pause, resume, emergency withdraw
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
      // Signal main loop to withdraw on next tick
      process.emit("SIGUSR1" as any);
      break;
    default:
      return res.status(400).json({ error: "Unknown action" });
  }

  res.json({ success: true, status: botState.status });
});

// POST /settings — update risk params live
app.post("/settings", auth, (req, res) => {
  const { ilThreshold, priceAlert, baseSpread, volMultiplier, rangeScale } = req.body;

  if (ilThreshold !== undefined) config.ilThresholdPct = ilThreshold;
  if (priceAlert !== undefined) config.priceAlertPct = priceAlert;
  if (baseSpread !== undefined) config.baseSpreadPct = baseSpread;
  if (volMultiplier !== undefined) config.volMultiplier = volMultiplier;
  if (rangeScale !== undefined) config.rangeScaleEnabled = rangeScale;

  log(`⚙️ Settings updated via dashboard`, "info");
  res.json({ success: true });
});

export function startApiServer() {
  app.listen(config.apiPort, () => {
    console.log(`[API] Bot API server running on port ${config.apiPort}`);
  });
}
