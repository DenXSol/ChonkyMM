import { config } from "./config";

export interface PriceData {
  price: number;
  priceChange1h: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  timestamp: number;
}

const priceHistory: { price: number; timestamp: number }[] = [];

export async function getChonkyPrice(): Promise<PriceData> {
  const url = `https://public-api.birdeye.so/defi/token_overview?address=${config.chonkyMint}`;
  const res = await fetch(url, {
    headers: {
      "X-API-KEY": config.birdeyeApiKey,
      "x-chain": "solana",
    },
  });

  if (!res.ok) throw new Error(`Birdeye API error: ${res.status}`);
  const json = await res.json() as { data: Record<string, number> };
  const d = json.data;

  const priceData: PriceData = {
    price: d.price,
    priceChange1h: d.priceChange1hPercent || 0,
    priceChange24h: d.priceChange24hPercent || 0,
    volume24h: d.v24hUSD || 0,
    liquidity: d.liquidity || 0,
    timestamp: Date.now(),
  };

  priceHistory.push({ price: priceData.price, timestamp: priceData.timestamp });
  const cutoff = Date.now() - config.volatilityWindow * 60 * 1000;
  while (priceHistory.length > 0 && priceHistory[0].timestamp < cutoff) {
    priceHistory.shift();
  }

  return priceData;
}

export function getVolatility(): "LOW" | "MED" | "HIGH" {
  if (priceHistory.length < 2) return "LOW";
  const prices = priceHistory.map((p) => p.price);
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const swingPct = ((max - min) / min) * 100;
  if (swingPct > 10) return "HIGH";
  if (swingPct > 4) return "MED";
  return "LOW";
}

export function getPriceMovePct(referencePrice: number, currentPrice: number): number {
  return ((currentPrice - referencePrice) / referencePrice) * 100;
}

export function calculateDynamicSpread(baseSpread: number, volatility: "LOW" | "MED" | "HIGH"): number {
  const multipliers = { LOW: 1.0, MED: 1.3, HIGH: config.volMultiplier };
  return baseSpread * multipliers[volatility];
}

export function calculateDynamicRange(
  baseUpper: number,
  baseLower: number,
  priceMovePct: number
): { upper: number; lower: number } {
  if (!config.rangeScaleEnabled || priceMovePct <= 0) {
    return { upper: baseUpper, lower: baseLower };
  }
  const scaledUpper = baseUpper * Math.pow(config.rangeScaleFactor, priceMovePct / 10);
  const scaledLower = Math.max(baseLower * 0.9, 10);
  return {
    upper: Math.min(scaledUpper, 100),
    lower: scaledLower,
  };
}
