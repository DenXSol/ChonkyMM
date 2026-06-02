# CHONKY Market Maker

Automated market making bot for $CHONKY on Solana using Meteora DLMM.

## Structure

```
chonky-mm/
├── bot/          → Railway service (the actual bot)
└── dashboard/    → Vercel service (mm.chonky.com UI)
```

---

## Bot Setup (Railway)

### 1. Create new Railway project
- New Project → Deploy from GitHub → select `DenXSol/chonky-mm`
- Set root directory to `/bot`

### 2. Set environment variables in Railway

```
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
BIRDEYE_API_KEY=your_birdeye_key
BOT_WALLET_PRIVATE_KEY=your_phantom_bot_wallet_base58_key
CHONKY_MINT=2MwjFE1zbXyNKw6VjzGWa3BhPtFcs8htuX2xwRAtbonk
POOL_ADDRESS=65kgwwvhxxapiajbr2th2lxafqjj7tkxrztewqeexvzf
SOL_AMOUNT=1.5
CHONKY_AMOUNT=3000000
API_SECRET=pick_a_random_secret_string
API_PORT=3001

# Risk settings (optional - these are defaults)
RANGE_LOWER_PCT=15
RANGE_UPPER_PCT=40
FEE_BPS=200
IL_THRESHOLD_PCT=5
PRICE_ALERT_PCT=20
EMERGENCY_WITHDRAW_PCT=30
BASE_SPREAD_PCT=2
VOL_MULTIPLIER=1.5
RANGE_SCALE_ENABLED=true
REBALANCE_INTERVAL_MS=900000
```

### 3. Fund bot wallet
From Phantom, send to your bot wallet address:
- 1.5 SOL (for LP position + ~0.1 SOL buffer for tx fees)  
- 3,000,000 CHONKY

### 4. Deploy
Railway will auto-deploy on push. Check logs for:
```
🐱 CHONKY Market Maker Bot starting...
[API] Bot API server running on port 3001
📍 Creating initial position
✅ Position deposited
```

---

## Dashboard Setup (Vercel → mm.chonky.com)

### 1. Create new Vercel project
- New Project → Import from GitHub → select `DenXSol/chonky-mm`
- Set root directory to `/dashboard`

### 2. Set environment variables in Vercel

```
DASHBOARD_PASSWORD=your_password_here
BOT_API_URL=https://your-railway-app.railway.app
BOT_API_SECRET=same_secret_as_railway_API_SECRET
```

### 3. Set custom domain
- Vercel → Settings → Domains → Add `mm.chonky.com`
- In Cloudflare DNS: CNAME `mm` → `cname.vercel-dns.com`

---

## Risk Controls

| Setting | Default | Description |
|---|---|---|
| IL_THRESHOLD_PCT | 5% | Pause bot if impermanent loss exceeds this |
| PRICE_ALERT_PCT | 20% | Rebalance immediately if price moves this much |
| EMERGENCY_WITHDRAW_PCT | 30% | Auto-withdraw all liquidity if price drops this much |
| BASE_SPREAD_PCT | 2% | Default spread in calm markets |
| VOL_MULTIPLIER | 1.5x | Spread widens by this on HIGH volatility |
| RANGE_SCALE_ENABLED | true | Expand upper range as price pumps |

All settings can also be updated live from the dashboard without redeployment.

---

## Position Strategy

- **Bin strategy:** BidAsk (skewed CHONKY-heavy toward ask side)
- **Range:** -15% (SOL bids) / +40% (CHONKY asks)
- **Fee tier:** 2%
- **Rebalance:** Every 15 minutes or on significant price move
- **Auto-harvest:** When pending fees > $5 USD

---

## Emergency Procedures

**Manual pause:** Dashboard → PAUSE button (withdraws nothing, just stops rebalancing)

**Emergency withdraw:** Dashboard → EMERGENCY button (pulls ALL liquidity back to bot wallet immediately)

**Kill the bot:** Railway → Suspend service (tokens stay in bot wallet, safe)
