# Railway setup — Scannerai-micin V2.0

Project: **Scannerai-micin**. Web service: `micin-radar-web`; PostgreSQL service: `Postgres`.

## Variables to set in Railway service
Only the first 3 are required to enable the admin-gated Claude analyst; all API integrations may be configured later.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Direct Claude Messages API key, for analyst reviews |
| `ANTHROPIC_MODEL` | Model identifier (e.g. `claude-sonnet-4-5`) |
| `DASHBOARD_ADMIN_KEY` | Strong random secret for manual admin actions |
| `AI_PROVIDER` | `anthropic` or `router` |
| `AI_BASE_URL` | 9Router **HTTPS** API base URL ending in `/v1`, for router mode |
| `AI_API_KEY` | 9Router key (never put in frontend or GitHub) |
| `AI_MODEL` | Router Combo name, e.g. `AISCANER` |
| `DATABASE_URL` | Reference to `${{Postgres.DATABASE_URL}}` |
| `HELIUS_API_KEY` | Solana indexing, integration pending |
| `ROUTESCAN_API_KEY` | EVM token data, integration pending |
| `ALCHEMY_API_KEY` | EVM RPC / indexing, integration pending |
| `GOPLUS_ACCESS_TOKEN` | Security API, integration pending |
| `STOCKGEIST_API_KEY` | Social analysis, integration pending |
| `TELEGRAM_BOT_TOKEN` | Notification worker, integration pending |
| `TELEGRAM_CHAT_ID` | Destination chat, integration pending |

API credentials are **not required** for basic market discovery: GeckoTerminal is public.

## How to use
1. Open the deployed website. The scanner begins automatically within seconds and refreshes approximately every 5 minutes while the web service runs.
2. Visit **API Integrations** to see which keys have been configured. A configured key is **not** proof its full adapter has been implemented.
3. Add `ANTHROPIC_API_KEY` and a strong `DASHBOARD_ADMIN_KEY` via Railway Variables.
4. Go to **Configuration** in dashboard to paste the admin key for the current browser session.
5. Click a token row, then **Analisis Claude**. The AI result is advisory and stays WAIT until verification exists.
6. PostgreSQL automatically stores scanning snapshots and AI reviews, accessible through **AI Learning**.

## Important caveat
- The public dashboard is read-only. Administrator requests require a backend secret.
- 9Router Combo `AISCANER` has Round Robin selection; it may rotate different underlying models, so it cannot be assumed to be only Claude.
- For Claude only, choose Anthropic direct mode with a valid API key, or configure a Claude-only Combo and use router mode.
- Never publish your Windows VPS 9Router dashboard password, API key, or unauthenticated HTTP endpoint.
- Database / hosting usage may incur Railway charges.
