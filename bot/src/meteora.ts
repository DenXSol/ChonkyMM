import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { config } from "./config";
import { log } from "./logger";

export interface PositionInfo {
  hasPosition: boolean;
  positionAddress?: string;
  pooledSol: number;
  pooledChonky: number;
  positionValueUsd: number;
  lowerPrice: number;
  upperPrice: number;
  activeBins: number;
  totalBins: number;
  pendingFeesSol: number;
  pendingFeesChonky: number;
}

export interface SweepResult {
  swept: boolean;
  solSwept: number;
  totalSweptAllTime: number;
}

// Running total of all SOL swept to treasury this session
let totalSweptSol = 0;
// Track SOL balance before/after to detect sell fills
let lastKnownSolBalance = 0;

export async function getDlmmPool(connection: Connection): Promise<DLMM> {
  return await DLMM.create(connection, new PublicKey(config.poolAddress));
}

// ─── PROFIT SWEEP ────────────────────────────────────────────────────────────
// Called after every rebalance cycle. Compares current SOL balance to last
// known balance — if it went UP (sell fill happened), sweeps the configured
// % of the gain to the treasury wallet.

export async function sweepProfitToTreasury(
  connection: Connection,
  wallet: Keypair,
  currentSolBalance: number
): Promise<SweepResult> {
  // Skip if treasury not configured
  if (!config.treasuryWallet || !config.profitSweepPct || config.profitSweepPct <= 0) {
    lastKnownSolBalance = currentSolBalance;
    return { swept: false, solSwept: 0, totalSweptAllTime: totalSweptSol };
  }

  // First run — just record baseline, don't sweep
  if (lastKnownSolBalance === 0) {
    lastKnownSolBalance = currentSolBalance;
    return { swept: false, solSwept: 0, totalSweptAllTime: totalSweptSol };
  }

  const solGain = currentSolBalance - lastKnownSolBalance;

  // Only sweep if SOL balance increased (sell fill occurred)
  if (solGain <= 0.001) {
    lastKnownSolBalance = currentSolBalance;
    return { swept: false, solSwept: 0, totalSweptAllTime: totalSweptSol };
  }

  const sweepAmount = solGain * (config.profitSweepPct / 100);

  // Keep a minimum SOL buffer in bot wallet for tx fees
  const minBuffer = 0.1;
  const availableToSweep = currentSolBalance - minBuffer;
  if (availableToSweep <= sweepAmount) {
    log(`⚠️ Skipping sweep — SOL balance too low to sweep safely (balance: ${currentSolBalance.toFixed(4)} SOL)`, "info");
    lastKnownSolBalance = currentSolBalance;
    return { swept: false, solSwept: 0, totalSweptAllTime: totalSweptSol };
  }

  try {
    const lamports = Math.floor(sweepAmount * LAMPORTS_PER_SOL);
    const treasuryPubkey = new PublicKey(config.treasuryWallet);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: treasuryPubkey,
        lamports,
      })
    );

    await sendAndConfirmTransaction(connection, tx, [wallet], {
      commitment: "confirmed",
    });

    totalSweptSol += sweepAmount;
    lastKnownSolBalance = currentSolBalance - sweepAmount;

    log(
      `💸 Profit sweep: ${sweepAmount.toFixed(4)} SOL (${config.profitSweepPct}% of +${solGain.toFixed(4)} SOL gain) → treasury`,
      "harvest",
      `Total swept all time: ${totalSweptSol.toFixed(4)} SOL`
    );

    return {
      swept: true,
      solSwept: sweepAmount,
      totalSweptAllTime: totalSweptSol,
    };
  } catch (err) {
    log(`❌ Profit sweep failed: ${err}`, "alert");
    lastKnownSolBalance = currentSolBalance;
    return { swept: false, solSwept: 0, totalSweptAllTime: totalSweptSol };
  }
}

export function getTotalSweptSol(): number {
  return totalSweptSol;
}

// ─── POSITION INFO ────────────────────────────────────────────────────────────

export async function getPositionInfo(
  connection: Connection,
  wallet: Keypair,
  currentPrice: number
): Promise<PositionInfo> {
  try {
    const dlmmPool = await getDlmmPool(connection);
    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);

    if (!userPositions || userPositions.length === 0) {
      return {
        hasPosition: false,
        pooledSol: 0,
        pooledChonky: 0,
        positionValueUsd: 0,
        lowerPrice: 0,
        upperPrice: 0,
        activeBins: 0,
        totalBins: 0,
        pendingFeesSol: 0,
        pendingFeesChonky: 0,
      };
    }

    const position = userPositions[0];
    const posData = position.positionData;

    const pooledSol = Number(posData.totalXAmount) / 1e9;
    const pooledChonky = Number(posData.totalYAmount) / 1e6;
    const pendingFeesSol = Number(posData.feeX) / 1e9;
    const pendingFeesChonky = Number(posData.feeY) / 1e6;

    const positionValueUsd = pooledSol * 82 + pooledChonky * currentPrice;

    const activeBin = await dlmmPool.getActiveBin();
    const lowerPrice = Number(posData.lowerBinId) * 0.0001;
    const upperPrice = Number(posData.upperBinId) * 0.0001;

    return {
      hasPosition: true,
      positionAddress: position.publicKey.toString(),
      pooledSol,
      pooledChonky,
      positionValueUsd,
      lowerPrice,
      upperPrice,
      activeBins: posData.positionBinData?.filter(
        (b: any) => Number(b.binXAmount) > 0 || Number(b.binYAmount) > 0
      ).length || 0,
      totalBins: posData.positionBinData?.length || 0,
      pendingFeesSol,
      pendingFeesChonky,
    };
  } catch (err) {
    log(`Error fetching position: ${err}`, "alert");
    return {
      hasPosition: false,
      pooledSol: 0,
      pooledChonky: 0,
      positionValueUsd: 0,
      lowerPrice: 0,
      upperPrice: 0,
      activeBins: 0,
      totalBins: 0,
      pendingFeesSol: 0,
      pendingFeesChonky: 0,
    };
  }
}

// ─── WITHDRAW ─────────────────────────────────────────────────────────────────

export async function withdrawPosition(
  connection: Connection,
  wallet: Keypair
): Promise<boolean> {
  try {
    log("Withdrawing position from pool...", "withdraw");
    const dlmmPool = await getDlmmPool(connection);
    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);

    if (!userPositions || userPositions.length === 0) {
      log("No position to withdraw", "info");
      return false;
    }

    for (const position of userPositions) {
      const binData = position.positionData.positionBinData;
      const binIdsToRemove = binData.map((b: any) => b.binId);

      const removeTx = await dlmmPool.removeLiquidity({
        position: position.publicKey,
        user: wallet.publicKey,
        binIds: binIdsToRemove,
        bps: new BN(10000), // 100%
        shouldClaimAndClose: true,
      });

      const txs = Array.isArray(removeTx) ? removeTx : [removeTx];
      for (const tx of txs) {
        await sendAndConfirmTransaction(connection, tx, [wallet], {
          skipPreflight: false,
          commitment: "confirmed",
        });
      }
    }

    log("✅ Position withdrawn successfully", "withdraw");
    return true;
  } catch (err) {
    log(`❌ Withdraw failed: ${err}`, "alert");
    return false;
  }
}

// ─── DEPOSIT ──────────────────────────────────────────────────────────────────

export async function depositPosition(
  connection: Connection,
  wallet: Keypair,
  currentPrice: number,
  upperPct: number,
  lowerPct: number,
  solLamports: bigint,
  chonkyUnits: bigint
): Promise<boolean> {
  try {
    log(`Depositing position: range -${lowerPct.toFixed(1)}% / +${upperPct.toFixed(1)}%`, "deposit");
    const dlmmPool = await getDlmmPool(connection);
    const activeBin = await dlmmPool.getActiveBin();
    const binStep = dlmmPool.lbPair.binStep;

    const binsBelow = Math.floor(Math.log(1 - lowerPct / 100) / Math.log(1 + binStep / 10000));
    const binsAbove = Math.ceil(Math.log(1 + upperPct / 100) / Math.log(1 + binStep / 10000));

    const minBinId = activeBin.binId + binsBelow;
    const maxBinId = activeBin.binId + binsAbove;

    const newPosition = Keypair.generate();

    const createTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: newPosition.publicKey,
      user: wallet.publicKey,
      totalXAmount: new BN(solLamports.toString()),
      totalYAmount: new BN(chonkyUnits.toString()),
      strategy: {
        maxBinId,
        minBinId,
        strategyType: StrategyType.BidAsk,
      },
    });

    const txs = Array.isArray(createTx) ? createTx : [createTx];
    for (const tx of txs) {
      await sendAndConfirmTransaction(connection, tx, [wallet, newPosition], {
        skipPreflight: false,
        commitment: "confirmed",
      });
    }

    log(`✅ Position deposited: bins ${minBinId} → ${maxBinId}`, "deposit");
    return true;
  } catch (err) {
    log(`❌ Deposit failed: ${err}`, "alert");
    return false;
  }
}

// ─── HARVEST FEES ─────────────────────────────────────────────────────────────

export async function harvestFees(
  connection: Connection,
  wallet: Keypair
): Promise<boolean> {
  try {
    const dlmmPool = await getDlmmPool(connection);
    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);
    if (!userPositions || userPositions.length === 0) return false;

    const claimTx = await dlmmPool.claimAllRewards({
      owner: wallet.publicKey,
      positions: userPositions,
    });

    const txs = Array.isArray(claimTx) ? claimTx : [claimTx];
    for (const tx of txs) {
      await sendAndConfirmTransaction(connection, tx, [wallet], {
        commitment: "confirmed",
      });
    }

    log("✅ Fees harvested", "harvest");
    return true;
  } catch (err) {
    log(`❌ Harvest failed: ${err}`, "alert");
    return false;
  }
}
