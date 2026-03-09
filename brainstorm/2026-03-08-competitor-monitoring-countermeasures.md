# Brainstorm: Continuous Competitor Monitoring + Countermeasures

## Metadata
- **Date**: 2026-03-08
- **Domain**: Integration
- **Phase**: MVP (extending existing competitor intelligence with continuous monitoring)
- **Mode**: Conversational (autonomous — chairman asleep, EVA proceeding)
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: EHG_Engineer (competitive intelligence infrastructure)
- **Source**: Chairman final cut — item retained from SD-RESEARCH-COMPETITIVE_INTEL-20260309-006

---

## Problem Statement
EHG operates a venture factory with multiple products in competitive markets, but competitor analysis is ad-hoc — performed manually during brainstorm sessions. For a multi-venture operation, the surface area of competitors to monitor scales multiplicatively, making manual tracking unsustainable. Time-sensitive competitive signals (pricing changes, feature launches) are perishable and lose strategic value when discovered weeks later.

## Discovery Summary

### Existing Infrastructure (Key Finding)
The Pragmatist's codebase exploration revealed significant existing infrastructure:
- **`lib/discovery/opportunity-discovery-service.js`** — Full orchestrator: scan → analyze → score → blueprint → synthesis
- **`lib/research/competitor-intelligence.js`** — Competitor URL analysis (axios-based)
- **`lib/discovery/gap-analyzer.js`** — 6-dimension gap analysis
- **`competitors` table** — Already exists, linked to ventures via `venture_id`
- **`app_rankings` table** — Already exists with indices for apple_appstore, google_play, product_hunt
- **`opportunity_scans` table** — Scan tracking with status lifecycle
- **Prior brainstorm** — `brainstorm/2026-02-21-ranking-data-pipeline-sources-poc-integration.md` has detailed implementation plan (~395 LOC, validated, marked "Ready for SD")
- **Dependencies present**: `axios`, `puppeteer`, `playwright` all in `package.json`

### What Must Be Built
- Ranking data pollers (Apple RSS, Google Play, Product Hunt)
- Change detection engine (temporal diff of snapshots)
- Significance scoring (what changes matter vs noise)
- Countermeasure routing (competitor change → venture-specific recommendation)
- Source health monitoring

## Analysis

### Arguments For
- Existing infrastructure reduces implementation effort by ~60% — tables, scoring, analysis all exist
- Multi-venture competitive graph is a proprietary asset no single-product company can replicate
- Prior brainstorm provides detailed, validated implementation plan ready for SD creation
- Low ongoing cost (~$5/month LLM, free-tier APIs)
- Cross-venture pattern library creates compound value over time

### Arguments Against
- Legal/ethical risk from automated scraping — each source has distinct ToS implications
- Signal-to-noise ratio at scale (multiple ventures × multiple competitors × multiple sources) may be catastrophic without heavy curation
- Counter-intelligence risk: automated scraping patterns can reveal strategic interests to competitors
- Continuous monitoring may be overkill — most ventures need periodic deep analysis at key decision points, not real-time alerts
- Countermeasure quality depends on deep product-market understanding that pattern detection may lack

## Integration: Data Quality/Coverage Analysis

| Dimension | Score |
|-----------|-------|
| Data Quality | 6/10 (Tier 1 sources stable; Tier 2-3 fragile) |
| Coverage | 5/10 (3 sources cover app rankings well; missing pricing, features, marketing) |
| Edge Cases | 4 identified |

**Edge Cases**:
1. **Google Play HTML changes** (Common, every 2-4 months) — scraper breaks, returns stale/wrong data
2. **G2/Capterra Cloudflare blocking** (Common) — anti-bot measures make scraping unreliable. Deferred.
3. **Bulk ranking fluctuations** (Common) — app store algorithms cause temporary ranking changes that aren't meaningful competitive signals
4. **Competitor website redesigns** (Moderate) — page structure changes break any URL-based analysis

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Legal exposure from automated scraping is jurisdiction-dependent and non-trivial — LinkedIn and Meta have sued scrapers successfully; (2) Signal-to-noise ratio will be catastrophic at scale without heavy curation and months of labeled training data; (3) No consideration of counter-intelligence — scraping reveals strategic interest areas
- **Assumptions at Risk**: (1) Competitor data is machine-readable and stable — in reality, competitors redesign pages, A/B test pricing, use client-side rendering; (2) Continuous monitoring adds more value than periodic manual analysis — most ventures need deep dives at decision points, not continuous alerts; (3) EVA can meaningfully act on competitor signals — contextualizing competitive moves requires deep product-market understanding
- **Worst Case**: Fragile scraping pipelines consume engineering cycles to maintain, generate low-quality alerts nobody trusts, and a significant competitor move gets buried in noise. Leadership reverts to ad-hoc analysis with a maintenance burden.

### Visionary
- **Opportunities**: (1) Cross-venture competitive graph as proprietary asset — patterns from one market inform strategy in adjacent markets; (2) Event-driven countermeasure triggers with real-time response windows — transform monitoring from reporting into operational reflex; (3) Multi-source triangulation — correlate job postings + patent filings + pricing changes for high-confidence intelligence
- **Synergies**: EVA recommendation engine (market-aware strategic advisor), SD/PRD pipeline (auto-generate draft SDs from countermeasures), cross-venture pattern library (reusable strategic playbooks)
- **Upside Scenario**: Competitive intelligence platform becomes a core reason ventures want to be part of EHG portfolio. Competitive response time drops from weeks to hours. Pattern library enables pre-emptive positioning.

### Pragmatist
- **Feasibility**: 6/10 — internal pipeline is largely built; external data ingestion carries all the integration risk
- **Resource Requirements**: 3-4 weeks to continuous monitoring, 6-8 weeks to countermeasures (including data accumulation). ~$5/month ongoing.
- **Constraints**: (1) Web scraping is inherently fragile — defer G2/Capterra; (2) No cron/scheduler infrastructure exists; (3) Countermeasure layer (delta detection + routing) is highest-value, highest-complexity new work requiring temporal data that doesn't exist yet
- **Recommended Path**: Build ranking pollers first (Phase 1), let data accumulate 2-3 weeks, then build countermeasure engine. Prior brainstorm at `2026-02-21-ranking-data-pipeline-sources-poc-integration.md` has exact implementation plan ready for SD creation.

### Synthesis
- **Consensus Points**: (1) Existing infrastructure significantly reduces new work (all 3 agree); (2) Start with reliable data sources only — Apple RSS, Product Hunt, Google Play (Challenger + Pragmatist); (3) Validate before heavy automation investment (Challenger + Pragmatist)
- **Tension Points**: (1) Visionary sees real-time event-driven architecture vs Pragmatist recommends batch; (2) Challenger questions whether continuous monitoring adds value over periodic analysis
- **Composite Risk**: Medium — strong existing infrastructure, but data source fragility and signal-to-noise ratio require careful management

## Open Questions
- Should Phase 0 manual experiment be required, or can we skip to polling given existing infrastructure?
- What significance thresholds should be used for ranking changes? (5+ positions? 10+?)
- Should countermeasures be fully automated (auto-generate draft SDs) or require human review?

## Suggested Next Steps
1. Create SD(s) from this brainstorm with vision-key and arch-key linkage
2. Architecture suggests 3 implementation phases (pollers → pipeline → countermeasures) — could be orchestrator with children
3. Phase 1 can build on validated prior brainstorm implementation plan
