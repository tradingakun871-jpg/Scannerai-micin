# MICIN RADAR — AI Meme Coin Early Gem Hunter V2.0

Production-oriented dashboard and discovery scanner for Solana, Ethereum, BNB Chain and Base, built to preserve the locked Blueprint V2.0.

## Safety first
- No invented BUY signals, holder counts, social metrics, bundler/sniper results or TP probabilities.
- Token discovery works with public GeckoTerminal APIs immediately.
- BUY stays WAIT/UNVERIFIED until contract security, holder concentration, LP status, social evidence and bundler/sniper verification are complete.
- Liquidity $100k–$1m requires **unlocked** (high risk); over $1m requires **locked/burned**; single non-system holder / proven same-control cluster <=2.5%.
- This service never executes trades.

## Deployment
Deploy this repository on Railway as a Node service. The server listens on `process.env.PORT` and serves the dashboard and API. Optional PostgreSQL provides persistent scan snapshots and AI review logs.

Run: `npm install && npm start`

### Railway environment variables (set later)
```env
PORT=3000
DATABASE_URL=
DASHBOARD_ADMIN_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=AISCANER
AI_PROVIDER=anthropic
HELIUS_API_KEY=
ALCHEMY_API_KEY=
ROUTESCAN_API_KEY=
GOPLUS_ACCESS_TOKEN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```
Only set secrets in Railway Variables. Never commit actual keys.

## Built-in workflow
- Every 5 minutes: discover trending and newly created pools via GeckoTerminal across four chains, cache and snapshot results, report provider errors explicitly.
- Public GET `/api/overview`, `/api/health`, `/api/history` (read-only).
- Protected POST `/api/scan` and `/api/ai/analyze` require `X-Admin-Key` matching `DASHBOARD_ADMIN_KEY`.
- Claude AI analysis accepts verified market snapshots and produces commentary; **the AI cannot override validation rules**.
- Signal execution is disabled pending complete verification modules and integration credentials.

## Status
Dashboard and market scanner are deployable without API keys. Chain holder indexing, LP verification, sniper/bundler tracing, social intelligence, verified AI TP probabilities and Telegram delivery are marked integration-pending rather than simulated.
