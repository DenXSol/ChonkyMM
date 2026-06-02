import { ActivityEntry } from "./logger";

export interface BotState {
  enabled: boolean;
  status: "ACTIVE" | "PAUSED" | "EMERGENCY" | "INITIALIZING";
  statusReason: string;
  lastUpdated: number;

  // Wallet
  botWalletAddress: string;
  idleSolBalance: number;
  idleChonkyBalance: number;

  // Position
  hasPosition: boolean;
  positionAddress: string;
  pooledSol: number;
  pooledChonky: number;
  positionValueUsd: number;
  lowerPrice: number;
  upperPrice: number;
  activeBins: number;
  totalBins: number;
  pendingFeesSol: number;
  pendingFeesChonky: number;
  totalFeesHarvestedSol: number;
  totalFeesHarvestedChonky: number;

  // Price
  currentPrice: number;
  entryPrice: number;
  priceChange1h: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;

  // Risk
  ilEstimate: number;
  volatility: "LOW" | "MED" | "HIGH";
  dynamicSpread: number;
  dynamicUpperPct: number;
  dynamicLowerPct: number;

  // Activity
  activityFeed: ActivityEntry[];
  rebalanceCount: number;
  lastRebalanceAt: number | null;
}

export const botState: BotState = {
  enabled: true,
  status: "INITIALIZING",
  statusReason: "Starting up...",
  lastUpdated: Date.now(),

  botWalletAddress: "",
  idleSolBalance: 0,
  idleChonkyBalance: 0,

  hasPosition: false,
  positionAddress: "",
  pooledSol: 0,
  pooledChonky: 0,
  positionValueUsd: 0,
  lowerPrice: 0,
  upperPrice: 0,
  activeBins: 0,
  totalBins: 0,
  pendingFeesSol: 0,
  pendingFeesChonky: 0,
  totalFeesHarvestedSol: 0,
  totalFeesHarvestedChonky: 0,

  currentPrice: 0,
  entryPrice: 0,
  priceChange1h: 0,
  priceChange24h: 0,
  volume24h: 0,
  liquidity: 0,

  ilEstimate: 0,
  volatility: "LOW",
  dynamicSpread: 2,
  dynamicUpperPct: 40,
  dynamicLowerPct: 15,

  activityFeed: [],
  rebalanceCount: 0,
  lastRebalanceAt: null,
};
