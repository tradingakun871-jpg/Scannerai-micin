# Blueprint V2.0 — LOCKED

All implementation changes must preserve these user-approved rules. This document is a **specification**, not a claim all integrations are complete.

## Discovery
- Solana, Ethereum, BNB Chain and Base.
- Poll every five minutes; monitor trending pools over 24h and newly created pools.
- Favor early accumulation and early breakout, but identify distribution and extreme pump risk.
- Market data must be fresh; provider failures must be shown, never replaced with fake tokens.

## Liquidity
- $100,000–$1,000,000: only **UNLOCKED**, and always flagged HIGH RISK.
- Above $1,000,000: only **LOCKED or BURNED**.
- Below $100,000: REJECT.
- Missing verifiable LP ownership or lock state: WAIT / UNVERIFIED (not BUY).
- LP state depends on AMM/pool design; no API label alone proves a lock.

## Holder concentration
- Maximum 2.5% of total supply for any non-system holder.
- Aggregate proven same-control clusters before applying 2.5% cap.
- Distinguish verified burn/LP/system addresses, and document evidence.
- Incomplete holder indexing cannot pass the gate.

## Safety
- Honeypot, sell restriction/tax, mint/freeze authority, developer concentration and withdrawals.
- **Bundler** verification mandatory: launch transactions, common funding, developer connection, current supply, coordinated selling.
- **Sniper** verification mandatory: early buys, ongoing balances, distribution and sell pressure.
- Bundling/sniping is not automatically wrongdoing; same-block alone is not proof of same ownership.
- Critical security risks -> NO BUY; incomplete checks -> WAIT.

## Analysis
- Technical: M5, M15, H1, H4; support/resistance, supply/demand, breakout/retest, consolidation, price action and volume.
- Social: StockGeist, Telegram, Reddit, ApeWisdom + optional alternatives, with missing data marked insufficient.
- Smart money: wallet accumulation, developer distribution and related transfers.
- Opportunity score weights (when data complete): momentum 25%, volume/buy pressure 25%, holder 20%, social 20%, smart money 10%.
- Security score is **separate** from opportunity score.

## BUY and Take Profit
- Candidate needs all mandatory checks complete, no critical risk, Opportunity Score >=80 and a valid entry zone.
- BUY / BUY SPECULATIVE (unlocked LP) / WAIT / WATCHLIST / NO BUY / CANCEL.
- Entry, structure-based SL, AI-recommended multiplier TP in X, target price and expiration.
- TP multiplier is **chosen dynamically**, not fixed; probability requires a specific horizon and separate out-of-sample calibration.
- Never show an unvalidated model guess as an actual probability. Never execute trades automatically.

## Journal and learning
- Store the detection snapshot, first eligible price, entry hit, TP/SL, cancellation, price extremes and liquidity changes.
- Review 1h, 6h, 12h, 24h, 7d, and 30d.
- Evaluate rug pulls, fees, slippage, execution feasibility and negative cases.
- No silent reinterpretation of prior signals and no auto-promotion of ML models on tiny samples.

## Current implementation status
The production V2.0 dashboard uses GeckoTerminal market scanning, conservative WAIT gating, integration presence monitoring, Claude/9Router optional **research-only** reviews, and optional PostgreSQL scan/review history. **On-chain LP/holder/security/sniper/bundler/social verification and calibrated TP probabilities are not implemented yet; the software intentionally does not issue BUY.**
