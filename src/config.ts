export const config = {
  // RPC & APIs
  heliumRpcUrl: process.env.HELIUS_RPC_URL!,
  birdeyeApiKey: process.env.BIRDEYE_API_KEY!,

  // Wallet
  botWalletPrivateKey: process.env.BOT_WALLET_PRIVATE_KEY!,

  // Token & Pool
  chonkyMint: process.env.CHONKY_MINT || "2MwjFE1zbXyNKw6VjzGWa3BhPtFcs8htuX2xwRAtbonk",
  poolAddress: process.env.POOL_ADDRESS || "65kgwwvhxxapiajbr2th2lxafqjj7tkxrztewqeexvzf",

  // Position sizing
  solAmount: parseFloat(process.env.SOL_AMOUNT || "1.5"),
  chonkyAmount: parseFloat(process.env.CHONKY_AMOUNT || "3000000"),

  // Bin range (percentages)
  rangeLowerPct: parseFloat(process.env.RANGE_LOWER_PCT || "15"),
  rangeUpperPct: parseFloat(process.env.RANGE_UPPER_PCT || "40"),
  feeBps: parseInt(process.env.FEE_BPS || "200"),

  // Risk controls
  ilThresholdPct: parseFloat(process.env.IL_THRESHOLD_PCT || "5"),
  priceAlertPct: parseFloat(process.env.PRICE_ALERT_PCT || "20"),
  emergencyWithdrawPct: parseFloat(process.env.EMERGENCY_WITHDRAW_PCT || "30"),
  volatilityWindow: parseInt(process.env.VOLATILITY_WINDOW || "10"),
  baseSpreadPct: parseFloat(process.env.BASE_SPREAD_PCT || "2"),
  volMultiplier: parseFloat(process.env.VOL_MULTIPLIER || "1.5"),
  rangeScaleEnabled: process.env.RANGE_SCALE_ENABLED !== "false",
  rangeScaleFactor: parseFloat(process.env.RANGE_SCALE_FACTOR || "1.2"),

  // Profit sweep
  treasuryWallet: process.env.TREASURY_WALLET || "",
  profitSweepPct: parseFloat(process.env.PROFIT_SWEEP_PCT || "10"),

  // Bot control
  botEnabled: process.env.BOT_ENABLED !== "false",
  rebalanceIntervalMs: parseInt(process.env.REBALANCE_INTERVAL_MS || "900000"),

  // API server (for dashboard)
  apiPort: parseInt(process.env.API_PORT || "3001"),
  apiSecret: process.env.API_SECRET || "changeme",
};
