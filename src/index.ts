// CHONKY Market Maker Bot v1.2
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import { loadPersistedSettings } from "./persist";
import { getChonkyPrice } from "./price";
import { assessRisk } from "./risk";
import { getPositionInfo, withdrawPosition, depositPosition, harvestFees, sweepProfitToTreasury } from "./meteora";
import { log, getActivityFeed } from "./logger";
import { botState } from "./state";
import { startApiServer } from "./api";

function loadWallet(): Keypair {
  const secret = bs58.decode(config.botWalletPrivateKey);
  return Keypair.fromSecretKey(secret);
}

async function getWalletBalances(connection: Connection, wallet: Keypair): Promise<{ sol: number; chonky: number }> {
  const solBalance = await connection.getBalance(wallet.publicKey);
  const sol = solBalance / LAMPORTS_PER_SOL;
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
      mint: new PublicKey(config.chonkyMint),
    });
    const chonky = tokenAccounts.value.length > 0
      ? tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0
      : 0;
    return { sol, chonky };
  } catch {
    return { sol, chonky: 0 };
  }
}

let emergencyWithdrawPending = false;
process.on("SIGUSR1" as any, () => { emergencyWithdrawPending = true; });

async function runBotCycle(connection: Connection, wallet: Keypair) {
  if (!botState.enabled && !emergencyWithdrawPending) return;

  try {
    // 1. Get current price
    const priceData = await getChonkyPrice();
    botState.currentPrice = priceData.price;
    botState.priceChange1h = priceData.priceChange1h;
    botState.priceChange24h = priceData.priceChange24h;
    botState.volume24h = priceData.volume24h;
    botState.liquidity = priceData.liquidity;
    if (botState.entryPrice === 0) botState.entryPrice = priceData.price;

    // 2. Get wallet balances
    const balances = await getWalletBalances(connection, wallet);
    botState.idleSolBalance = balances.sol;
    botState.idleChonkyBalance = balances.chonky;

    // 3. Get position info
    const position = await getPositionInfo(connection, wallet, priceData.price);
    botState.hasPosition = position.hasPosition;
    botState.positionAddress = position.positionAddress || "";
    botState.pooledSol = position.pooledSol;
    botState.pooledChonky = position.pooledChonky;
    botState.positionValueUsd = position.positionValueUsd;
    botState.lowerPrice = position.lowerPrice;
    botState.upperPrice = position.upperPrice;
    botState.activeBins = position.activeBins;
    botState.totalBins = position.totalBins;
    botState.pendingFeesSol = position.pendingFeesSol;
    botState.pendingFeesChonky = position.pendingFeesChonky;

    // 4. Emergency withdraw
    if (emergencyWithdrawPending) {
      log("🚨 Executing emergency withdraw", "alert");
      await withdrawPosition(connection, wallet);
      emergencyWithdrawPending = false;
      botState.status = "EMERGENCY";
      botState.enabled = false;
      botState.activityFeed = getActivityFeed();
      botState.lastUpdated = Date.now();
      return;
    }

    // 5. Assess risk — uses live config values (from persist or env)
    const risk = assessRisk(
      priceData.price, botState.entryPrice,
      position.lowerPrice, position.upperPrice,
      position.pooledSol, position.pooledChonky,
      config.solAmount, config.chonkyAmount
    );

    botState.ilEstimate = risk.ilEstimate;
    botState.volatility = risk.volatility;
    botState.dynamicSpread = risk.dynamicSpread;
    botState.dynamicUpperPct = risk.dynamicUpperPct;
    botState.dynamicLowerPct = risk.dynamicLowerPct;

    // 6. Act on risk
    if (risk.shouldEmergencyWithdraw) {
      await withdrawPosition(connection, wallet);
      botState.status = "EMERGENCY";
      botState.enabled = false;
      log(`🚨 Auto emergency withdraw: ${risk.reason}`, "alert");
    } else if (risk.shouldPause) {
      if (position.hasPosition) await withdrawPosition(connection, wallet);
      botState.status = "PAUSED";
      botState.enabled = false;
      log(`⏸ Auto-paused: ${risk.reason}`, "pause");
    } else if (risk.shouldRebalance && position.hasPosition) {
      log(`🔄 Rebalancing: ${risk.reason}`, "rebalance");
      await harvestFees(connection, wallet);
      await withdrawPosition(connection, wallet);
      await new Promise((r) => setTimeout(r, 3000));

      const freshBalances = await getWalletBalances(connection, wallet);

      // Use live config values — respects dashboard saves
      const solToDeposit = Math.min(freshBalances.sol * 0.95, config.solAmount);
      const chonkyToDeposit = Math.min(freshBalances.chonky, config.chonkyAmount);

      await depositPosition(
        connection, wallet, priceData.price,
        config.rangeUpperPct, config.rangeLowerPct,
        BigInt(Math.floor(solToDeposit * LAMPORTS_PER_SOL)),
        BigInt(Math.floor(chonkyToDeposit * 1e6))
      );

      // Sweep profits after rebalance
      const postBalances = await getWalletBalances(connection, wallet);
      await sweepProfitToTreasury(connection, wallet, postBalances.sol);

      botState.entryPrice = priceData.price;
      botState.rebalanceCount++;
      botState.lastRebalanceAt = Date.now();
      botState.status = "ACTIVE";
    } else if (!position.hasPosition && botState.enabled && balances.sol >= 0.1) {
      log("📍 Creating initial position", "deposit");

      // Use live config values
      const solToDeposit = Math.min(balances.sol * 0.95, config.solAmount);
      const chonkyToDeposit = Math.min(balances.chonky, config.chonkyAmount);

      await depositPosition(
        connection, wallet, priceData.price,
        config.rangeUpperPct, config.rangeLowerPct,
        BigInt(Math.floor(solToDeposit * LAMPORTS_PER_SOL)),
        BigInt(Math.floor(chonkyToDeposit * 1e6))
      );

      botState.entryPrice = priceData.price;
      botState.status = "ACTIVE";
    } else {
      botState.status = "ACTIVE";
    }

    // Auto-harvest fees every ~4 hours
    const pendingFeesUsd = position.pendingFeesSol * 82 + position.pendingFeesChonky * priceData.price;
    if (pendingFeesUsd > 5 && botState.rebalanceCount % 16 === 0 && botState.rebalanceCount > 0) {
      await harvestFees(connection, wallet);
    }

  } catch (err) {
    log(`❌ Bot cycle error: ${err}`, "alert");
  } finally {
    botState.activityFeed = getActivityFeed();
    botState.lastUpdated = Date.now();
  }
}

async function main() {
  console.log("🐱 CHONKY Market Maker Bot starting...");
  console.log("RPC URL:", process.env.HELIUS_RPC_URL ? "SET ✅" : "MISSING ❌");

  // Load persisted settings FIRST — overrides env vars with last saved dashboard values
  loadPersistedSettings();

  const rpcUrl = process.env.HELIUS_RPC_URL || config.heliumRpcUrl;
  if (!rpcUrl || !rpcUrl.startsWith("http")) {
    console.error("❌ HELIUS_RPC_URL is not set. Value:", rpcUrl);
    await new Promise(r => setTimeout(r, 30000));
    process.exit(1);
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = loadWallet();

  botState.botWalletAddress = wallet.publicKey.toString();
  log(`🚀 Bot started. Wallet: ${wallet.publicKey.toString()}`, "info");
  log(`⚙️ Active config: SOL=${config.solAmount} CHONKY=${config.chonkyAmount} range=${config.rangeLowerPct}%/${config.rangeUpperPct}%`, "info");

  startApiServer();

  // Run first cycle immediately
  await runBotCycle(connection, wallet);

  // Schedule rebalance — reads config.rebalanceIntervalMs which can be updated live
  function scheduleNext() {
    setTimeout(async () => {
      await runBotCycle(connection, wallet);
      scheduleNext();
    }, config.rebalanceIntervalMs);
  }
  scheduleNext();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
