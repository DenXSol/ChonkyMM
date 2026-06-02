import { config } from "./config";
import { getVolatility, calculateDynamicSpread, calculateDynamicRange } from "./price";
import { log } from "./logger";

export interface RiskAssessment {
  shouldPause: boolean;
  shouldEmergencyWithdraw: boolean;
  shouldRebalance: boolean;
  reason: string;
  dynamicSpread: number;
  dynamicUpperPct: number;
  dynamicLowerPct: number;
  volatility: "LOW" | "MED" | "HIGH";
  ilEstimate: number;
}

export function assessRisk(
  currentPrice: number,
  entryPrice: number,
  positionLowerPrice: number,
  positionUpperPrice: number,
  pooledSol: number,
  pooledChonky: number,
  initialSol: number,
  initialChonky: number
): RiskAssessment {
  const volatility = getVolatility();
  const dynamicSpread = calculateDynamicSpread(config.baseSpreadPct, volatility);
  const priceMovePct = ((currentPrice - entryPrice) / entryPrice) * 100;

  const { upper: dynamicUpperPct, lower: dynamicLowerPct } = calculateDynamicRange(
    config.rangeUpperPct,
    config.rangeLowerPct,
    priceMovePct
  );

  // IL estimate (simplified)
  const ilEstimate = estimateIL(currentPrice, entryPrice);

  // Check emergency withdraw: price dropped > emergencyWithdrawPct
  const priceDrop = ((entryPrice - currentPrice) / entryPrice) * 100;
  if (priceDrop > config.emergencyWithdrawPct) {
    log(`🚨 Emergency withdraw triggered: price dropped ${priceDrop.toFixed(1)}%`);
    return {
      shouldPause: true,
      shouldEmergencyWithdraw: true,
      shouldRebalance: false,
      reason: `Price dropped ${priceDrop.toFixed(1)}% — emergency withdraw`,
      dynamicSpread,
      dynamicUpperPct,
      dynamicLowerPct,
      volatility,
      ilEstimate,
    };
  }

  // Check IL threshold
  if (Math.abs(ilEstimate) > config.ilThresholdPct) {
    log(`⚠️ IL threshold breached: ${ilEstimate.toFixed(2)}%`);
    return {
      shouldPause: true,
      shouldEmergencyWithdraw: false,
      shouldRebalance: false,
      reason: `IL ${ilEstimate.toFixed(2)}% exceeds threshold ${config.ilThresholdPct}%`,
      dynamicSpread,
      dynamicUpperPct,
      dynamicLowerPct,
      volatility,
      ilEstimate,
    };
  }

  // Check if price has moved outside current bin range
  const outOfRange =
    currentPrice < positionLowerPrice || currentPrice > positionUpperPrice;

  // Check dramatic price move (> priceAlertPct)
  const absPriceMove = Math.abs(priceMovePct);
  if (absPriceMove > config.priceAlertPct) {
    log(`⚡ Dramatic price move detected: ${priceMovePct.toFixed(1)}%`);
    return {
      shouldPause: false,
      shouldEmergencyWithdraw: false,
      shouldRebalance: true,
      reason: `Price moved ${priceMovePct.toFixed(1)}% — rebalancing range`,
      dynamicSpread,
      dynamicUpperPct,
      dynamicLowerPct,
      volatility,
      ilEstimate,
    };
  }

  return {
    shouldPause: false,
    shouldEmergencyWithdraw: false,
    shouldRebalance: outOfRange,
    reason: outOfRange ? "Price out of bin range" : "Position healthy",
    dynamicSpread,
    dynamicUpperPct,
    dynamicLowerPct,
    volatility,
    ilEstimate,
  };
}

function estimateIL(currentPrice: number, entryPrice: number): number {
  // Standard IL formula for 50/50 AMM position
  const priceRatio = currentPrice / entryPrice;
  const il = 2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1;
  return il * 100; // as percentage
}
