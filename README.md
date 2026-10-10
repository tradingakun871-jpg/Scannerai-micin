# MICIN RADAR — AI Meme Coin Early Gem Hunter V2.0

**Production URL:** https://micin-radar-web-production.up.railway.app/

**Status:** Dashboard/market scanner/forward ledger are live. Blueprint V2.0 is locked. This is a research scanner, **not a completed verified BUY system**; active BUY is blocked until ALL mandatory third-party evidence, smart money/social confirmation and probability calibration are complete.

## Live features in source
- 5-minute background worker while service is running, with duplicate-run guard.
- GeckoTerminal new/trending pools and DEX Screener latest profiles/pool enrichment (four networks).
- Market data rankings, filters, CSV export, responsive dashboard.
- GoPlus token-contract risk flags and LP *holder indications*; Honeypot.is simulated trade on supported EVM DEXes.
- Routescan ERC20 top-holder list and sampled transfer evidence; Helius getTokenAccounts paged census (requires key).
- Bundler/sniper/wallet cluster indicators derived from sampled transfers; **not proof of common control**.
- ApeWisdom Reddit crypto-ticker mention counts; **not contract-authenticated social sentiment**.
- On-demand GeckoTerminal M5 / M15 / H1 / H4 OHLCV calculations and research-only support/SL scenarios.
- Opportunity Score with exact blueprint weights, held as unavailable when components are missing.
- Protected OpenAI / Claude / 9Router commentary, with optional one review per scan and max 48 daily if configured.
- PostgreSQL full token observations, first detection, 1H / 6H / 12H / 24H / 7D / 30D cohorts, risk and AI journals.
- Chronological train/forward empirical 30D multiplier calibration with sample-size and coverage gates. **No verified predictions until data maturity.**
- Telegram sender that refuses to send unverified BUY alerts.
- Syntax and BUY-policy regression tests on Railway startup.

## Blocking validations
1. Liquidity lock must be independently matched to the *exact pool / position*; generic GoPlus LP-holders data is not sufficient for CLMM/V3.
2. Holder 2.5% rule needs reliable full-system-wallet exemptions and proven wallet groupings.
3. Bundler/sniper links and developer-funded coordination need full historical traces, not merely same-block transfer samples.
4. Social evidence needs token-specific verified data; ticker mentions can be spoofed.
5. Smart money profitability requires verified wallet history.
6. OpenAI API key is configured in Railway; API availability and billing must be verified.
7. Statistical TP model needs several hundred **matured 30D** cohorts and independent forward validation; no historical data can be conjured.
8. No auto trade is implemented (intentional).

## Configure in Railway Variables
Service: `micin-radar-web`, project: `Scannerai-micin`. **Never paste API credentials into GitHub or a public frontend.**

```dotenv
DATABASE_URL=${{Postgres.DATABASE_URL}}
DASHBOARD_ADMIN_KEY=your_secret_here
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_key_here
OPENAI_MODEL=gpt-5-mini
# Optional Claude alternative:
ANTHROPIC_API_KEY=your_anthropic_key_here
ANTHROPIC_MODEL=claude-sonnet-4-5
AI_AUTO_REVIEW=true
AI_MAX_DAILY_REVIEWS=48

# Optional 9Router mode:
# AI_PROVIDER=router
# AI_BASE_URL=https://YOUR_SECURE_9ROUTER_DOMAIN/v1
# AI_API_KEY=secret
# AI_MODEL=AISCANER

# Optional integrations:
HELIUS_API_KEY=
ROUTESCAN_API_KEY=
GOPLUS_ACCESS_TOKEN=
ALCHEMY_API_KEY=
STOCKGEIST_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Helius holder census is bounded at four pages (4,000 token accounts) by default to avoid exhausting public-tier credits. Data coverage is disclosed. Routescan supports Ethereum and may not return holder data on every EVM chain/pool.

## HTTP API
- `GET /api/health` — freshness, uptime
- `GET /api/overview` — discovery data with verified/partial flags
- `GET /api/integrations` — readiness (configured is not verified)
- `GET /api/history` — persistent observations & historical cohorts
- `GET /api/model-status` — statistical calibration/readiness state
- `GET /api/inspection?tokenId=...` — cached evidence, no API spending
- `POST /api/inspect` — protected, fetch on-chain evidence
- `POST /api/technical` — protected, fetch MTF OHLCV
- `POST /api/ai/analyze` — protected, call OpenAI, Claude or 9Router
- `POST /api/scan` — protected, trigger scan

Protected calls require `X-Admin-Key` equal to `DASHBOARD_ADMIN_KEY` in Railway.

## Development
```bash
npm install
npm run check
npm test
npm start
```

The application binds `PORT` supplied by Railway and does not require a separate worker, though production scaling to multiple web replicas would need a distributed lease to prevent duplicate scanning.

**Data caveat:** Intraday liquidity, 24-hour volume and chart behavior do not mean a token is safe. No meme coin is guaranteed to appreciate; small-cap assets can lose all value.

## Security Engine Phase 1 (2026-10-10)
- Alchemy RPC examines last 10 blocks of Ethereum/Base/BNB ERC20 Transfer logs, participant `balanceOf`, `totalSupply`, and possible shared funders. This is a **bounded sample**, not a complete ERC20 holder index or a historical sniper classifier.
- For compatible fungible-LP Uniswap-V2-style pools, an exact pool match is required before reading ERC20 LP `totalSupply` and burn-wallet `balanceOf`. Only a fully burned supply of the **exact pool** can independently pass the burn proof for liquidity over $1M; all other LP locker/V3/CLMM states remain UNVERIFIED.
- Helius paginates Solana token accounts with a page cap and aggregates by owner, but excludes neither verified program/system accounts nor correlated clusters without evidence.
- GoPlus security and Honeypot findings remain partial; critical confirmed flags may cause NO BUY.
- Security inspection results cached 12 minutes and persisted to PostgreSQL; the backend cycles across the four chains (two candidates per 5-minute scan) to bound API cost.
- The full 2.5% holder rule, same-controller wallets, bundler/sniper launch tracing, and exact small-pool UNLOCKED proof **do not pass** without authoritative evidence. BUY remains WAIT.
