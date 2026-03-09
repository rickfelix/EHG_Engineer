# Vision: Continuous Competitor Monitoring + Countermeasures

## Executive Summary
EHG operates a venture factory model where competitive intelligence is critical across multiple simultaneous ventures. Currently, competitor analysis happens ad-hoc during brainstorm sessions or when threats surface organically. This system transforms competitive intelligence from a reactive, manual process into an automated, continuous pipeline that detects competitor moves and generates countermeasure recommendations — giving EHG asymmetric response times measured in hours, not weeks.

The unique strategic advantage is EHG's multi-venture structure: a competitive intelligence system spanning multiple ventures builds a cross-venture competitive graph that no single-product company can replicate. Patterns observed in one market inform strategy in adjacent markets.

## Problem Statement
EHG launches ventures into competitive markets but lacks continuous visibility into competitor moves. Competitor analysis is performed manually during brainstorm sessions, leading to delayed awareness of pricing changes, feature launches, and market shifts. For a venture factory managing multiple products, the surface area of competitors to monitor scales multiplicatively — manual tracking becomes impossible. Time-sensitive competitive signals (pricing changes, key hire announcements, feature launches) are perishable and lose value when discovered weeks later.

## Personas
- **Chairman (Rick)**: Needs synthesized competitive intelligence across all ventures. Values actionable countermeasure recommendations over raw data. Makes strategic decisions (pricing, positioning, feature priority) based on competitive context.
- **EVA (AI Advisor)**: Acts as the competitive intelligence analyst. Continuously ingests competitor signals, detects significant changes, triangulates across sources for confidence, and generates countermeasure recommendations.
- **Venture Teams**: Consume venture-specific competitive insights. Need to know when a direct competitor makes a move that affects their product positioning.

## Information Architecture
- **Data Sources (Tiered by Reliability)**:
  - Tier 1 (Stable APIs): Apple RSS feeds (app store rankings), Product Hunt GraphQL API
  - Tier 2 (Moderate fragility): Google Play scraper (`google-play-scraper` npm), social media APIs
  - Tier 3 (Fragile/Deferred): G2, Capterra (Cloudflare protection, CAPTCHAs — defer to later phase)
- **Existing Infrastructure**: `competitors` table (venture-linked), `app_rankings` table (apple/gplay/producthunt sources), `opportunity_scans` table, `opportunity-discovery-service.js`, `competitor-intelligence.js`, `gap-analyzer.js`
- **Processing Pipeline**: Poll sources → Detect changes (temporal diff) → Score significance → Triangulate across sources → Generate countermeasures → Route to ventures/EVA
- **Storage**: Rankings history in `app_rankings`, change events in new `competitor_events` table, countermeasures in EVA recommendation pipeline

## Key Decision Points
- **Scraping Legality**: Each data source carries distinct legal risk. Use only public APIs and RSS feeds in initial phases. Avoid scraping behind authentication or Terms of Service violations. No scraping of competitor websites that prohibit automated access.
- **Signal-to-Noise Ratio**: With multiple ventures tracking 5-10 competitors each across 3+ sources, the signal volume will be high. Significance scoring must be aggressive — only surface changes that meet a meaningful threshold (e.g., ranking drop of 5+ positions, pricing change of >10%, new feature in core product area).
- **Counter-Intelligence**: Automated scraping leaves fingerprints (IP patterns, timing). Use standard user agents, rate limiting, and distributed timing to avoid revealing strategic interest areas to competitors.
- **Continuous vs Periodic**: Start with periodic batch runs (daily/weekly), not real-time streaming. Real-time adds infrastructure complexity without proportional value at current scale.
- **Validate Before Automating**: Run a 4-week manual competitive brief experiment before building automation — if a 2-hour/week manual review doesn't drive strategic decisions, automation won't either.

## Integration Patterns
- **EVA Recommendation Engine**: Competitor signals become a new input dimension for EVA's pattern detection, enabling market-aware strategic recommendations
- **SD/PRD Pipeline**: High-confidence countermeasures can auto-generate draft Strategic Directives via `leo-create-sd.js`
- **Existing Discovery Pipeline**: Extends `opportunity-discovery-service.js` (scan → analyze → score → blueprint) with temporal change detection
- **Cross-Venture Pattern Library**: Competitive patterns (e.g., "competitor drops pricing >20% → churn increases in 60 days") become reusable strategic playbooks across ventures
- **Prior Brainstorm**: Builds on validated implementation plan from `brainstorm/2026-02-21-ranking-data-pipeline-sources-poc-integration.md`

## Evolution Plan
- **Phase 0 (Validation)**: 4-week manual experiment — one person, 2 hours/week, monitoring top 3 competitors for most mature venture. If the brief drives strategic decisions, proceed to automation.
- **Phase 1 (Ranking Pollers)**: Apple RSS + Google Play + Product Hunt pollers → `app_rankings` table. Enhance `discovery-mode.js` and `competitor-teardown.js` to consume ranking data.
- **Phase 2 (Pipeline + Scheduling)**: Orchestrator connecting pollers → trend scanner → auto-teardown → synthesis. Choose cron mechanism (GitHub Actions or `node-cron`).
- **Phase 3 (Countermeasures)**: Delta detection (temporal diff of `app_rankings` snapshots), change significance scoring, countermeasure routing logic mapping competitor changes to ventures via `competitors.venture_id`, EVA integration.

## Out of Scope
- Scraping behind authentication or Terms of Service violations
- G2/Capterra integration (Cloudflare-protected — deferred to later phase)
- Real-time streaming architecture (batch is sufficient at current scale)
- Hiring/talent monitoring of competitors
- Direct competitive response automation (human-in-the-loop required for all countermeasures)
- Building new scraping infrastructure from scratch (leverages existing `axios`, `puppeteer`, `playwright` in `package.json`)

## UI/UX Wireframes
N/A — this is primarily a backend/pipeline capability. Competitive insights surface through EVA's recommendation engine and the chairman view.

## Success Criteria
- Ranking data polled and stored for all tracked competitors with <24 hour latency
- Significant competitor changes (pricing, features, rankings) detected within 24 hours
- Countermeasure recommendations have >50% chairman acceptance rate
- Cross-venture competitive patterns identified that inform strategy in at least 2 ventures
- Zero legal/ethical issues from data collection methods
- Manual competitive brief validates the concept before automation investment
- LLM cost for competitive analysis stays under $5/month
