# Architecture Plan: Continuous Competitor Monitoring + Countermeasures

## Stack & Repository Decisions
- **Repository**: EHG_Engineer (backend pipeline)
- **Runtime**: Node.js scripts, periodic batch execution (daily or weekly)
- **LLM**: Claude Haiku for change classification, Claude Sonnet for countermeasure synthesis. Uses existing `client-factory.js` for LLM routing.
- **Database**: Supabase (PostgreSQL) — extends existing schema
- **Existing Infrastructure (Fully Reusable)**: `lib/discovery/opportunity-discovery-service.js` (scan→analyze→score→blueprint), `lib/research/competitor-intelligence.js` (competitor URL analysis via axios), `lib/discovery/gap-analyzer.js` (6-dimension gap analysis), `competitors` table (venture-linked), `app_rankings` table (apple/gplay/producthunt sources), `opportunity_scans` table
- **Existing Dependencies**: `axios`, `puppeteer`, `playwright` (all in `package.json`)
- **New Dependencies**: `google-play-scraper` npm package
- **Prior Design Work**: `brainstorm/2026-02-21-ranking-data-pipeline-sources-poc-integration.md` (detailed implementation plan, ~395 LOC, validated)

## Legacy Deprecation Plan
N/A — extends existing competitive intelligence infrastructure. The current `competitor-intelligence.js` remains as the analysis engine; this adds data polling and change detection layers.

## Route & Component Structure
- `scripts/eva/ranking-poller-apple.mjs` — Apple App Store RSS feed poller
- `scripts/eva/ranking-poller-gplay.mjs` — Google Play scraper using `google-play-scraper` npm
- `scripts/eva/ranking-poller-producthunt.mjs` — Product Hunt GraphQL API poller
- `scripts/eva/competitor-change-detector.mjs` — Temporal diff engine: compares current vs previous `app_rankings` snapshots
- `lib/discovery/countermeasure-engine.js` — Maps significant competitor changes to actionable countermeasure recommendations
- `lib/integrations/competitor-source-health.js` — Tracks poller health and data freshness per source

## Data Layer
### New Tables
- `competitor_events` — Detected changes with significance scores
  - `id` (uuid), `competitor_id` (fk → competitors), `venture_id` (fk → ventures)
  - `event_type` (ranking_change, pricing_change, feature_launch, market_entry)
  - `significance_score` (0-100), `raw_data` (jsonb — before/after snapshots)
  - `countermeasure_status` (pending, generated, accepted, dismissed)
  - `detected_at` (timestamptz), `source` (text)

- `competitor_source_health` — Poller health tracking
  - `id` (uuid), `source_name` (text), `last_poll_at` (timestamptz)
  - `last_success` (bool), `consecutive_failures` (int), `status` (healthy/degraded/stale)

### Existing Tables Used
- `competitors` — Competitor profiles linked to ventures via `venture_id`
- `app_rankings` — Historical ranking data (already has apple/gplay/producthunt sources with indices)
- `opportunity_scans` — Scan tracking with status lifecycle
- `ventures` — Venture context for routing countermeasures

### RLS
- Service role only (backend pipeline) — no user-facing RLS needed

## API Surface
- No REST endpoints needed (internal pipeline)
- RPC: `get_competitor_events(venture_id, since_date)` — for chairman view integration
- RPC: `get_ranking_trends(competitor_id, period)` — temporal ranking analysis
- The existing `opportunity-discovery-service.js` orchestrator handles the internal API

## Implementation Phases
- **Phase 0** (4 weeks, manual): Manual competitive brief — 2 hours/week monitoring top 3 competitors for most mature venture. Validates whether competitive intelligence drives strategic decisions before automating.
- **Phase 1** (1 week): Ranking data pollers — Apple RSS + Google Play + Product Hunt → `app_rankings` table. Enhance `discovery-mode.js` and `competitor-teardown.js` to consume ranking data (~30 LOC modifications each per prior brainstorm analysis).
- **Phase 2** (1-2 weeks): Pipeline orchestrator + scheduling — connect pollers → trend scanner → auto-teardown → synthesis. Choose cron mechanism (GitHub Actions recommended for zero-infrastructure cost).
- **Phase 3** (2-3 weeks, after 2-3 weeks of data accumulation): Countermeasure engine — temporal comparison of `app_rankings` snapshots, change significance scoring, routing logic via `competitors.venture_id`, integration with EVA recommendation engine.

## Testing Strategy
- Unit tests for each poller (mock API responses)
- Integration tests for change detection (known before/after snapshots → expected events)
- Poller health monitoring: automated alerts when consecutive_failures > 3
- Manual validation: chairman reviews first batch of competitor events for significance calibration
- Legal review: verify all data sources comply with terms of service

## Risk Mitigation
- **Scraping fragility**: Tier data sources by reliability. Apple RSS (stable) and Product Hunt (GraphQL API) first. Google Play scraper breaks every 2-4 months — budget for maintenance. Defer G2/Capterra entirely (Cloudflare protection makes them unreliable).
- **Signal-to-noise**: Aggressive significance thresholds — only surface ranking drops >5 positions, pricing changes >10%, or new features in core product areas. Start conservative, loosen based on chairman feedback.
- **Legal exposure**: Use only public APIs and RSS feeds. No scraping behind authentication. No ToS violations. Standard user agents and rate limiting.
- **Counter-intelligence**: Distribute polling timing (not all at midnight), use standard user agents, rotate request patterns. Don't reveal strategic interest areas through scraping patterns.
- **Cost control**: Haiku for change classification, Sonnet only for countermeasure synthesis. Estimated <$5/month LLM cost. Batch processing to minimize API calls.
- **No data = bad countermeasures**: The countermeasure engine (Phase 3) must wait until 2-3 weeks of `app_rankings` data accumulates. Temporal comparison requires history.
- **Validation-first**: Phase 0 manual experiment must produce at least 1 strategic decision before proceeding to automation. If manual review isn't useful, automation won't be either.
