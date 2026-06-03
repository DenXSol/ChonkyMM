import { useState, useEffect, useCallback } from "react";
import Head from "next/head";

const SOL_PRICE = 82;

interface CurrentConfig {
  solAmount: number;
  chonkyAmount: number;
  rangeLowerPct: number;
  rangeUpperPct: number;
  ilThresholdPct: number;
  priceAlertPct: number;
  emergencyWithdrawPct: number;
  baseSpreadPct: number;
  volMultiplier: number;
  rangeScaleEnabled: boolean;
  rebalanceIntervalMs: number;
  profitSweepPct: number;
}

interface BotState {
  enabled: boolean;
  status: "ACTIVE" | "PAUSED" | "EMERGENCY" | "INITIALIZING";
  statusReason: string;
  lastUpdated: number;
  botWalletAddress: string;
  idleSolBalance: number;
  idleChonkyBalance: number;
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
  currentPrice: number;
  entryPrice: number;
  priceChange1h: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  ilEstimate: number;
  volatility: "LOW" | "MED" | "HIGH";
  dynamicSpread: number;
  dynamicUpperPct: number;
  dynamicLowerPct: number;
  activityFeed: Array<{ timestamp: number; type: string; message: string; value?: string }>;
  rebalanceCount: number;
  lastRebalanceAt: number | null;
  currentConfig: CurrentConfig;
}

function fmt(n: number, d = 2) { return (n ?? 0).toFixed(d); }
function fmtUsd(n: number) { return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtLarge(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return (n ?? 0).toFixed(0);
}
function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function activityIcon(type: string) {
  const icons: Record<string, string> = {
    rebalance: "🔄", withdraw: "⬇️", deposit: "⬆️", harvest: "💰",
    sell_fill: "📤", buy_fill: "📥", pause: "⏸", resume: "▶️", alert: "🚨", info: "ℹ️",
  };
  return icons[type] || "•";
}

const C = {
  red: "#CC2222", gold: "#D4A855", bg: "#0D0D0D", card: "#111111",
  border: "#1E1E1E", goldBorder: "rgba(212,168,85,0.25)", text: "#F5F0E8",
  muted: "#666666", green: "#22CC66",
};

export default function Dashboard() {
  const [state, setState] = useState<BotState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState("");

  // Settings state — all controllable params
  const [settings, setSettings] = useState({
    solAmount: 1.5,
    chonkyAmount: 3000000,
    rangeLowerPct: 15,
    rangeUpperPct: 40,
    ilThreshold: 5,
    priceAlert: 20,
    emergencyWithdrawPct: 30,
    baseSpread: 2,
    volMultiplier: 1.5,
    rangeScale: true,
    rebalanceIntervalMinutes: 15,
    profitSweepPct: 10,
  });

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/bot");
      if (!res.ok) throw new Error("Bot unreachable");
      const data = await res.json();
      setState(data);
      // Sync settings from bot's live config
      if (data.currentConfig) {
        const c = data.currentConfig;
        setSettings({
          solAmount: c.solAmount,
          chonkyAmount: c.chonkyAmount,
          rangeLowerPct: c.rangeLowerPct,
          rangeUpperPct: c.rangeUpperPct,
          ilThreshold: c.ilThresholdPct,
          priceAlert: c.priceAlertPct,
          emergencyWithdrawPct: c.emergencyWithdrawPct,
          baseSpread: c.baseSpreadPct,
          volMultiplier: c.volMultiplier,
          rangeScale: c.rangeScaleEnabled,
          rebalanceIntervalMinutes: Math.round(c.rebalanceIntervalMs / 60000),
          profitSweepPct: c.profitSweepPct,
        });
      }
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 15000);
    return () => clearInterval(interval);
  }, [fetchState]);

  async function control(action: string) {
    await fetch("/api/bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "control", action }),
    });
    await fetchState();
  }

  async function saveSettings() {
    try {
      await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "settings", ...settings }),
      });
      setSaveMsg("✅ Saved");
      setTimeout(() => setSaveMsg(""), 3000);
      await fetchState();
    } catch {
      setSaveMsg("❌ Failed");
    }
  }

  function s(key: string, value: any) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  const statusColor = state?.status === "ACTIVE" ? C.green : state?.status === "PAUSED" ? C.gold : state?.status === "EMERGENCY" ? C.red : C.muted;
  const volColor = state?.volatility === "HIGH" ? C.red : state?.volatility === "MED" ? C.gold : C.green;
  const totalIdleUsd = (state?.idleSolBalance || 0) * SOL_PRICE + (state?.idleChonkyBalance || 0) * (state?.currentPrice || 0);
  const pendingFeesUsd = (state?.pendingFeesSol || 0) * SOL_PRICE + (state?.pendingFeesChonky || 0) * (state?.currentPrice || 0);

  function BinViz() {
    if (!state?.hasPosition || !state.lowerPrice || !state.upperPrice) return null;
    const pct = Math.min(Math.max((state.currentPrice - state.lowerPrice) / (state.upperPrice - state.lowerPrice), 0), 1);
    const bins = 40;
    const activeBin = Math.floor(pct * bins);
    return (
      <div style={{ marginTop: "12px" }}>
        <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          {Array.from({ length: bins }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: i === activeBin ? "20px" : "12px",
              background: i === activeBin ? C.gold : i < activeBin ? "rgba(34,204,102,0.4)" : "rgba(204,34,34,0.4)",
              borderRadius: "1px", transition: "all 0.3s",
            }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "10px", color: C.muted }}>
          <span style={{ color: C.green }}>SOL ← {fmtUsd(state.lowerPrice)}</span>
          <span style={{ color: C.gold }}>NOW {fmtUsd(state.currentPrice)}</span>
          <span style={{ color: C.red }}>{fmtUsd(state.upperPrice)} → CHONKY</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>CHONKY MM</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Bebas+Neue&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; color: ${C.text}; font-family: 'Space Mono', monospace; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.goldBorder}; }
        .card { background: ${C.card}; border: 1px solid ${C.border}; padding: 20px; }
        .card-gold { border-color: ${C.goldBorder}; }
        .label { font-size: 10px; color: ${C.muted}; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
        .value { font-size: 16px; color: ${C.text}; }
        .value-lg { font-size: 22px; color: ${C.gold}; font-family: 'Bebas Neue', sans-serif; letter-spacing: 2px; }
        .row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid ${C.border}; }
        .row:last-child { border-bottom: none; }
        .input { background: #0D0D0D; border: 1px solid #333; color: ${C.text}; padding: 6px 10px; font-family: 'Space Mono', monospace; font-size: 12px; }
        .input:focus { outline: 1px solid ${C.goldBorder}; }
        .input-wide { width: 120px; }
        .input-narrow { width: 80px; }
        select.input { width: 90px; }
        .btn { padding: 8px 16px; border: none; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 11px; letter-spacing: 2px; transition: all 0.2s; }
        .btn:hover { opacity: 0.85; }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-red { background: ${C.red}; color: white; }
        .btn-gold { background: ${C.gold}; color: #0D0D0D; }
        .btn-outline { background: transparent; color: ${C.gold}; border: 1px solid ${C.goldBorder}; }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        a { color: ${C.gold}; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .section-title { font-size: 11px; color: ${C.gold}; letter-spacing: 3px; margin-bottom: 16px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 900px) { .grid-3 { grid-template-columns: 1fr; } .grid-2 { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "32px" }}>🐱</span>
            <div>
              <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "32px", color: C.gold, letterSpacing: "4px" }}>CHONKY MARKET MAKER</h1>
              <div style={{ fontSize: "10px", color: C.muted, letterSpacing: "3px" }}>MM.CHONKY.COM</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div className={state?.status === "ACTIVE" ? "pulse" : ""} style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor }} />
              <span style={{ color: statusColor, fontSize: "12px", letterSpacing: "2px" }}>{state?.status || "LOADING"}</span>
            </div>
            <button className="btn btn-outline" onClick={() => control("pause")} disabled={state?.status !== "ACTIVE"}>PAUSE</button>
            <button className="btn btn-gold" onClick={() => control("resume")} disabled={state?.status === "ACTIVE"}>RESUME</button>
            <button className="btn btn-red" onClick={() => { if (confirm("Emergency withdraw all liquidity?")) control("emergency"); }}>EMERGENCY</button>
          </div>
        </div>

        {error && <div style={{ background: "rgba(204,34,34,0.1)", border: `1px solid ${C.red}`, padding: "12px", marginBottom: "16px", fontSize: "12px", color: C.red }}>⚠️ {error} — Bot may be offline or starting up</div>}
        {loading && !state && <div style={{ textAlign: "center", padding: "60px", color: C.muted, letterSpacing: "3px" }}>CONNECTING TO BOT...</div>}

        {state && (<>
          {/* Price Bar */}
          <div className="card card-gold" style={{ marginBottom: "16px", display: "flex", gap: "32px", flexWrap: "wrap" }}>
            <div><div className="label">CHONKY PRICE</div><div className="value-lg">${state.currentPrice?.toFixed(7)}</div></div>
            <div><div className="label">1H</div><div className="value" style={{ color: state.priceChange1h >= 0 ? C.green : C.red }}>{state.priceChange1h >= 0 ? "+" : ""}{fmt(state.priceChange1h)}%</div></div>
            <div><div className="label">24H</div><div className="value" style={{ color: state.priceChange24h >= 0 ? C.green : C.red }}>{state.priceChange24h >= 0 ? "+" : ""}{fmt(state.priceChange24h)}%</div></div>
            <div><div className="label">VOLUME 24H</div><div className="value">{fmtUsd(state.volume24h)}</div></div>
            <div><div className="label">LIQUIDITY</div><div className="value">{fmtUsd(state.liquidity)}</div></div>
            <div><div className="label">VOLATILITY</div><div className="value" style={{ color: volColor }}>{state.volatility}</div></div>
            <div><div className="label">SPREAD</div><div className="value">{fmt(state.dynamicSpread)}%</div></div>
            <div style={{ marginLeft: "auto" }}><div className="label">UPDATED</div><div className="value" style={{ fontSize: "12px" }}>{timeAgo(state.lastUpdated)}</div></div>
          </div>

          {/* Wallet / Position / Earnings */}
          <div className="grid-3">
            <div className="card">
              <div className="section-title">◆ WALLET</div>
              <div style={{ fontSize: "10px", color: C.muted, marginBottom: "12px", wordBreak: "break-all" }}>
                <a href={`https://solscan.io/account/${state.botWalletAddress}`} target="_blank" rel="noreferrer">{state.botWalletAddress?.slice(0, 8)}...{state.botWalletAddress?.slice(-8)} ↗</a>
              </div>
              <div className="row"><span style={{ fontSize: "12px", color: C.muted }}>SOL (idle)</span><div style={{ textAlign: "right" }}><div style={{ fontSize: "13px" }}>{fmt(state.idleSolBalance, 4)} SOL</div><div style={{ fontSize: "10px", color: C.muted }}>{fmtUsd(state.idleSolBalance * SOL_PRICE)}</div></div></div>
              <div className="row"><span style={{ fontSize: "12px", color: C.muted }}>CHONKY (idle)</span><div style={{ textAlign: "right" }}><div style={{ fontSize: "13px" }}>{fmtLarge(state.idleChonkyBalance)}</div><div style={{ fontSize: "10px", color: C.muted }}>{fmtUsd(state.idleChonkyBalance * state.currentPrice)}</div></div></div>
              <div className="row"><span style={{ fontSize: "12px", color: C.gold }}>TOTAL IDLE</span><span style={{ fontSize: "13px", color: C.gold }}>{fmtUsd(totalIdleUsd)}</span></div>
            </div>

            <div className="card">
              <div className="section-title">◆ POOL POSITION</div>
              {state.hasPosition ? (<>
                <div style={{ fontSize: "10px", color: C.muted, marginBottom: "12px" }}><a href="https://app.meteora.ag" target="_blank" rel="noreferrer">Meteora DLMM ↗</a></div>
                <div className="row"><span style={{ fontSize: "12px", color: C.muted }}>Pooled SOL</span><div style={{ textAlign: "right" }}><div style={{ fontSize: "13px" }}>{fmt(state.pooledSol, 4)} SOL</div><div style={{ fontSize: "10px", color: C.muted }}>{fmtUsd(state.pooledSol * SOL_PRICE)}</div></div></div>
                <div className="row"><span style={{ fontSize: "12px", color: C.muted }}>Pooled CHONKY</span><div style={{ textAlign: "right" }}><div style={{ fontSize: "13px" }}>{fmtLarge(state.pooledChonky)}</div><div style={{ fontSize: "10px", color: C.muted }}>{fmtUsd(state.pooledChonky * state.currentPrice)}</div></div></div>
                <div className="row"><span style={{ fontSize: "12px", color: C.gold }}>POSITION VALUE</span><span style={{ fontSize: "13px", color: C.gold }}>{fmtUsd(state.positionValueUsd)}</span></div>
              </>) : <div style={{ color: C.muted, fontSize: "12px", textAlign: "center", padding: "20px 0" }}>No active position</div>}
            </div>

            <div className="card">
              <div className="section-title">◆ EARNINGS & HEALTH</div>
              <div className="row"><span style={{ fontSize: "12px", color: C.muted }}>Pending Fees</span><span style={{ fontSize: "13px", color: C.green }}>{fmtUsd(pendingFeesUsd)}</span></div>
              <div className="row"><span style={{ fontSize: "12px", color: C.muted }}>Fees (SOL)</span><span style={{ fontSize: "12px" }}>{fmt(state.pendingFeesSol, 4)}</span></div>
              <div className="row"><span style={{ fontSize: "12px", color: C.muted }}>Fees (CHONKY)</span><span style={{ fontSize: "12px" }}>{fmtLarge(state.pendingFeesChonky)}</span></div>
              <div className="row"><span style={{ fontSize: "12px", color: C.muted }}>IL Estimate</span><span style={{ fontSize: "12px", color: Math.abs(state.ilEstimate) > 3 ? C.red : C.green }}>{fmt(state.ilEstimate)}%</span></div>
              <div className="row"><span style={{ fontSize: "12px", color: C.muted }}>Rebalances</span><span style={{ fontSize: "12px" }}>{state.rebalanceCount}</span></div>
            </div>
          </div>

          {/* Bin Range */}
          <div className="card card-gold" style={{ marginBottom: "16px" }}>
            <div className="section-title">◆ BIN RANGE / ORDER VISUALIZATION</div>
            <div style={{ display: "flex", gap: "32px", flexWrap: "wrap", marginBottom: "8px" }}>
              <div><div className="label">LOWER BOUND</div><div className="value" style={{ color: C.green }}>{fmtUsd(state.lowerPrice)} <span style={{ color: C.muted, fontSize: "11px" }}>(-{fmt(state.dynamicLowerPct)}%)</span></div></div>
              <div><div className="label">CURRENT PRICE</div><div className="value" style={{ color: C.gold }}>${state.currentPrice?.toFixed(7)}</div></div>
              <div><div className="label">UPPER BOUND</div><div className="value" style={{ color: C.red }}>{fmtUsd(state.upperPrice)} <span style={{ color: C.muted, fontSize: "11px" }}>(+{fmt(state.dynamicUpperPct)}%)</span></div></div>
              <div><div className="label">ACTIVE BINS</div><div className="value">{state.activeBins} / {state.totalBins}</div></div>
              <div><div className="label">ENTRY PRICE</div><div className="value">${state.entryPrice?.toFixed(7)}</div></div>
            </div>
            <BinViz />
          </div>

          {/* Activity + Settings */}
          <div className="grid-2">
            {/* Activity Feed */}
            <div className="card" style={{ maxHeight: "600px", display: "flex", flexDirection: "column" }}>
              <div className="section-title">◆ ACTIVITY FEED</div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {(!state.activityFeed || state.activityFeed.length === 0) && <div style={{ color: C.muted, fontSize: "12px", textAlign: "center", padding: "20px" }}>No activity yet</div>}
                {state.activityFeed?.map((entry, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: "11px" }}>
                    <span>{activityIcon(entry.type)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.text }}>{entry.message}</div>
                      {entry.value && <div style={{ color: C.gold, fontSize: "10px" }}>{entry.value}</div>}
                    </div>
                    <div style={{ color: C.muted, fontSize: "10px", whiteSpace: "nowrap" }}>{timeAgo(entry.timestamp)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Full Settings Panel */}
            <div className="card" style={{ overflowY: "auto", maxHeight: "600px" }}>
              <div className="section-title">◆ BOT SETTINGS</div>

              {/* Position Size */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "10px", color: C.gold, letterSpacing: "2px", marginBottom: "8px" }}>POSITION SIZE</div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>SOL Amount</span>
                  <input className="input input-narrow" type="number" min="0.1" max="100" step="0.1" value={settings.solAmount} onChange={e => s("solAmount", e.target.value)} />
                </div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>CHONKY Amount</span>
                  <input className="input input-wide" type="number" min="100000" step="100000" value={settings.chonkyAmount} onChange={e => s("chonkyAmount", e.target.value)} />
                </div>
              </div>

              {/* Range */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "10px", color: C.gold, letterSpacing: "2px", marginBottom: "8px" }}>PRICE RANGE</div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>Lower Range %</span>
                  <input className="input input-narrow" type="number" min="5" max="50" step="1" value={settings.rangeLowerPct} onChange={e => s("rangeLowerPct", e.target.value)} />
                </div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>Upper Range %</span>
                  <input className="input input-narrow" type="number" min="5" max="100" step="1" value={settings.rangeUpperPct} onChange={e => s("rangeUpperPct", e.target.value)} />
                </div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>Range Scale</span>
                  <select className="input" value={settings.rangeScale ? "true" : "false"} onChange={e => s("rangeScale", e.target.value === "true")}>
                    <option value="true">ON</option>
                    <option value="false">OFF</option>
                  </select>
                </div>
              </div>

              {/* Risk */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "10px", color: C.gold, letterSpacing: "2px", marginBottom: "8px" }}>RISK CONTROLS</div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>IL Threshold %</span>
                  <input className="input input-narrow" type="number" min="1" max="20" step="0.5" value={settings.ilThreshold} onChange={e => s("ilThreshold", e.target.value)} />
                </div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>Price Alert %</span>
                  <input className="input input-narrow" type="number" min="5" max="50" step="1" value={settings.priceAlert} onChange={e => s("priceAlert", e.target.value)} />
                </div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>Emergency Withdraw %</span>
                  <input className="input input-narrow" type="number" min="10" max="80" step="1" value={settings.emergencyWithdrawPct} onChange={e => s("emergencyWithdrawPct", e.target.value)} />
                </div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>Base Spread %</span>
                  <input className="input input-narrow" type="number" min="0.5" max="5" step="0.1" value={settings.baseSpread} onChange={e => s("baseSpread", e.target.value)} />
                </div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>Vol Multiplier</span>
                  <input className="input input-narrow" type="number" min="1" max="3" step="0.1" value={settings.volMultiplier} onChange={e => s("volMultiplier", e.target.value)} />
                </div>
              </div>

              {/* Timing & Profit */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "10px", color: C.gold, letterSpacing: "2px", marginBottom: "8px" }}>TIMING & PROFIT</div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>Rebalance (mins)</span>
                  <input className="input input-narrow" type="number" min="1" max="60" step="1" value={settings.rebalanceIntervalMinutes} onChange={e => s("rebalanceIntervalMinutes", e.target.value)} />
                </div>
                <div className="row">
                  <span style={{ fontSize: "12px", color: C.muted }}>Profit Sweep %</span>
                  <input className="input input-narrow" type="number" min="0" max="50" step="1" value={settings.profitSweepPct} onChange={e => s("profitSweepPct", e.target.value)} />
                </div>
              </div>

              <button className="btn btn-gold" style={{ width: "100%", marginTop: "8px" }} onClick={saveSettings}>
                SAVE ALL SETTINGS
              </button>
              {saveMsg && <div style={{ textAlign: "center", marginTop: "8px", fontSize: "12px", color: saveMsg.includes("✅") ? C.green : C.red }}>{saveMsg}</div>}

              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${C.border}` }}>
                <div className="label" style={{ marginBottom: "4px" }}>STATUS</div>
                <div style={{ fontSize: "11px", color: C.muted }}>{state.statusReason}</div>
              </div>
            </div>
          </div>
        </>)}
      </div>
    </>
  );
}
