import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  LAMPORTS_PER_SOL, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { config } from "./config";
import { log } from "./logger";

export interface PositionInfo {
  hasPosition: boolean; positionAddress?: string;
  pooledSol: number; pooledChonky: number; positionValueUsd: number;
  lowerPrice: number; upperPrice: number; activeBins: number; totalBins: number;
  pendingFeesSol: number; pendingFeesChonky: number;
}
export interface SweepResult {
  swept: boolean; solSwept: number; totalSweptAllTime: number;
}

let totalSweptSol = 0;
let lastKnownSolBalance = 0;

export async function getDlmmPool(connection: Connection): Promise<DLMM> {
  return await DLMM.create(connection, new PublicKey(config.poolAddress));
}

// Detect token order — pool may be CHONKY/SOL or SOL/CHONKY
async function getTokenOrder(dlmmPool: DLMM): Promise<{ xIsSOL: boolean }> {
  const tokenXMint = dlmmPool.lbPair.tokenXMint.toString();
  // SOL wrapped mint address
  const wrappedSOL = "So11111111111111111111111111111111111111112";
  return { xIsSOL: tokenXMint === wrappedSOL };
}

// ─── PROFIT SWEEP ─────────────────────────────────────────────────────────────
export async function sweepProfitToTreasury(
  connection: Connection, wallet: Keypair, currentSolBalance: number
): Promise<SweepResult> {
  if (!config.treasuryWallet || !config.profitSweepPct || config.profitSweepPct <= 0) {
    lastKnownSolBalance = currentSolBalance;
    return { swept: false, solSwept: 0, totalSweptAllTime: totalSweptSol };
  }
  if (lastKnownSolBalance === 0) {
    lastKnownSolBalance = currentSolBalance;
    return { swept: false, solSwept: 0, totalSweptAllTime: totalSweptSol };
  }
  const solGain = currentSolBalance - lastKnownSolBalance;
  if (solGain <= 0.001) {
    lastKnownSolBalance = currentSolBalance;
    return { swept: false, solSwept: 0, totalSweptAllTime: totalSweptSol };
  }
  const sweepAmount = solGain * (config.profitSweepPct / 100);
  const minBuffer = 0.1;
  if (currentSolBalance - minBuffer <= sweepAmount) {
    lastKnownSolBalance = currentSolBalance;
    return { swept: false, solSwept: 0, totalSweptAllTime: totalSweptSol };
  }
  try {
    const lamports = Math.floor(sweepAmount * LAMPORTS_PER_SOL);
    const tx = new Transaction().add(SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: new PublicKey(config.treasuryWallet),
      lamports,
    }));
    await sendAndConfirmTransaction(connection, tx, [wallet], { commitment: "confirmed" });
    totalSweptSol += sweepAmount;
    lastKnownSolBalance = currentSolBalance - sweepAmount;
    log(`💸 Profit sweep: ${sweepAmount.toFixed(4)} SOL → treasury. Total: ${totalSweptSol.toFixed(4)} SOL`, "harvest");
    return { swept: true, solSwept: sweepAmount, totalSweptAllTime: totalSweptSol };
  } catch (err) {
    log(`❌ Profit sweep failed: ${err}`, "alert");
    lastKnownSolBalance = currentSolBalance;
    return { swept: false, solSwept: 0, totalSweptAllTime: totalSweptSol };
  }
}

export function getTotalSweptSol(): number { return totalSweptSol; }

// ─── POSITION INFO ────────────────────────────────────────────────────────────
export async function getPositionInfo(
  connection: Connection, wallet: Keypair, currentPrice: number
): Promise<PositionInfo> {
  try {
    const dlmmPool = await getDlmmPool(connection);
    const { xIsSOL } = await getTokenOrder(dlmmPool);
    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);

    if (!userPositions || userPositions.length === 0) {
      return { hasPosition: false, pooledSol: 0, pooledChonky: 0, positionValueUsd: 0, lowerPrice: 0, upperPrice: 0, activeBins: 0, totalBins: 0, pendingFeesSol: 0, pendingFeesChonky: 0 };
    }

    const position = userPositions[0];
    const posData = position.positionData;

    // X and Y amounts depend on token order
    const xAmount = Number(posData.totalXAmount);
    const yAmount = Number(posData.totalYAmount);
    const feeX = Number(posData.feeX);
    const feeY = Number(posData.feeY);

    const pooledSol = xIsSOL ? xAmount / 1e9 : yAmount / 1e9;
    const pooledChonky = xIsSOL ? yAmount / 1e6 : xAmount / 1e6;
    const pendingFeesSol = xIsSOL ? feeX / 1e9 : feeY / 1e9;
    const pendingFeesChonky = xIsSOL ? feeY / 1e6 : feeX / 1e6;
    const positionValueUsd = pooledSol * 82 + pooledChonky * currentPrice;

    const lowerPrice = Number(posData.lowerBinId) * 0.0001;
    const upperPrice = Number(posData.upperBinId) * 0.0001;

    return {
      hasPosition: true,
      positionAddress: position.publicKey.toString(),
      pooledSol, pooledChonky, positionValueUsd, lowerPrice, upperPrice,
      activeBins: posData.positionBinData?.filter((b: any) => Number(b.binXAmount) > 0 || Number(b.binYAmount) > 0).length || 0,
      totalBins: posData.positionBinData?.length || 0,
      pendingFeesSol, pendingFeesChonky,
    };
  } catch (err) {
    log(`Error fetching position: ${err}`, "alert");
    return { hasPosition: false, pooledSol: 0, pooledChonky: 0, positionValueUsd: 0, lowerPrice: 0, upperPrice: 0, activeBins: 0, totalBins: 0, pendingFeesSol: 0, pendingFeesChonky: 0 };
  }
}

// ─── WITHDRAW ─────────────────────────────────────────────────────────────────
export async function withdrawPosition(connection: Connection, wallet: Keypair): Promise<boolean> {
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
        fromBinId: Math.min(...binIdsToRemove),
        toBinId: Math.max(...binIdsToRemove),
        bps: new BN(10000),
        shouldClaimAndClose: true,
      });
      const txs = Array.isArray(removeTx) ? removeTx : [removeTx];
      for (const tx of txs) {
        await sendAndConfirmTransaction(connection, tx, [wallet], { skipPreflight: false, commitment: "confirmed" });
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
  connection: Connection, wallet: Keypair, currentPrice: number,
  upperPct: number, lowerPct: number, solLamports: bigint, chonkyUnits: bigint
): Promise<boolean> {
  try {
    log(`Depositing position: range -${lowerPct.toFixed(1)}% / +${upperPct.toFixed(1)}%`, "deposit");
    const dlmmPool = await getDlmmPool(connection);
    const { xIsSOL } = await getTokenOrder(dlmmPool);
    const activeBin = await dlmmPool.getActiveBin();
    const binStep = dlmmPool.lbPair.binStep;

    // Calculate bins from percentage range
    // Meteora requires position width between 1 and 69 bins
    const rawBinsBelow = Math.floor(Math.log(1 - lowerPct / 100) / Math.log(1 + binStep / 10000));
    const rawBinsAbove = Math.ceil(Math.log(1 + upperPct / 100) / Math.log(1 + binStep / 10000));

    // Clamp to valid range — max 69 bins total, min 1 bin each side
    const MAX_BINS = 69;
    const binsBelow = Math.max(rawBinsBelow, -(MAX_BINS - 1));
    const binsAbove = Math.min(rawBinsAbove, MAX_BINS - 1);

    // Ensure total width doesnt exceed 69
    const totalBins = binsAbove - binsBelow;
    const scale = totalBins > MAX_BINS ? MAX_BINS / totalBins : 1;
    const finalBinsBelow = Math.floor(binsBelow * scale);
    const finalBinsAbove = Math.ceil(binsAbove * scale);

    const minBinId = activeBin.binId + finalBinsBelow;
    const maxBinId = activeBin.binId + finalBinsAbove;

    log(`Bin calculation: step=${binStep} below=${finalBinsBelow} above=${finalBinsAbove} total=${finalBinsAbove - finalBinsBelow} bins`, "info");

    const newPosition = Keypair.generate();

    // Assign X and Y correctly based on token order
    const totalXAmount = xIsSOL
      ? new BN(solLamports.toString())
      : new BN(chonkyUnits.toString());
    const totalYAmount = xIsSOL
      ? new BN(chonkyUnits.toString())
      : new BN(solLamports.toString());

    log(`Token order: X=${xIsSOL ? "SOL" : "CHONKY"}, Y=${xIsSOL ? "CHONKY" : "SOL"}`, "info");
    log(`Depositing X=${totalXAmount.toString()} Y=${totalYAmount.toString()}`, "info");

    const createTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: newPosition.publicKey,
      user: wallet.publicKey,
      totalXAmount,
      totalYAmount,
      strategy: { maxBinId, minBinId, strategyType: StrategyType.BidAsk },
    });

    const txs = Array.isArray(createTx) ? createTx : [createTx];
    for (const tx of txs) {
      await sendAndConfirmTransaction(connection, tx, [wallet, newPosition], { skipPreflight: false, commitment: "confirmed" });
    }

    log(`✅ Position deposited: bins ${minBinId} → ${maxBinId}`, "deposit");
    return true;
  } catch (err) {
    log(`❌ Deposit failed: ${err}`, "alert");
    return false;
  }
}

// ─── HARVEST FEES ─────────────────────────────────────────────────────────────
export async function harvestFees(connection: Connection, wallet: Keypair): Promise<boolean> {
  try {
    const dlmmPool = await getDlmmPool(connection);
    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey);
    if (!userPositions || userPositions.length === 0) return false;

    const claimTx = await dlmmPool.claimAllRewards({ owner: wallet.publicKey, positions: userPositions });
    const txs = Array.isArray(claimTx) ? claimTx : [claimTx];
    for (const tx of txs) {
      await sendAndConfirmTransaction(connection, tx, [wallet], { commitment: "confirmed" });
    }
    log("✅ Fees harvested", "harvest");
    return true;
  } catch (err) {
    log(`❌ Harvest failed: ${err}`, "alert");
    return false;
  }
}
