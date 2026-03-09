# Architecture Plan: Autonomous Consultant Agent

## Stack & Repository Decisions
- **Repository**: EHG_Engineer (backend pipeline)
- **Runtime**: Node.js scripts invoked manually or triggered by EVA intake pipeline (scheduler decision deferred until pipeline is validated)
- **LLM**: Claude Haiku for classification/pattern detection, Claude Sonnet for recommendation synthesis. Uses existing `client-factory.js` for LLM routing with tier-based model selection.
- **Database**: Supabase (PostgreSQL) — extends existing schema
- **Existing Infrastructure (Fully Reusable)**: `todoist-sync.js`, `playlist-sync.js`, `eva-sync-state` circuit breaker, `intake-classifier.js` (3D taxonomy: App + Aspects + Intent), `wave-clusterer.js` (grouping logic), `client-factory.js` (LLM routing)
- **Partially Reusable**: `deeper-analysis-router.js` (routing patterns), `post-processor.js` (archival lifecycle pattern)

## Legacy Deprecation Plan
N/A — greenfield capability. Extends existing EVA intake pipeline without replacing any current functionality.

## Route & Component Structure
- `scripts/eva/eva-trend-snapshot.mjs` — Phase 0 validation script: batch aggregation of classified items (no LLM needed)
- `scripts/eva/consultant-agent.mjs` — Main orchestrator (sync → detect → recommend)
- `lib/integrations/trend-detector.js` — Pattern detection across recent wave items with data freshness tracking
- `lib/integrations/recommendation-engine.js` — Generates actionable recommendations from detected patterns; batch processing to control LLM costs
- `lib/integrations/data-freshness-monitor.js` — Tracks last-sync timestamps per source, flags degraded confidence when sources go stale (>72 hours)
- `scripts/eva/consultant-digest.mjs` — Formats and delivers chairman digest with freshness indicators

## Data Layer
### New Tables
- `eva_consultant_snapshots` — Phase 0 trend snapshots (no LLM needed)
  - `id` (uuid), `snapshot_date` (date), `source_counts` (jsonb — items per source)
  - `top_aspects_by_app` (jsonb), `top_intents` (jsonb), `new_item_velocity` (jsonb — items/week vs prior 4-week avg)
  - `raw_cluster_data` (jsonb — aggregate statistics for manual review)

- `eva_consultant_recommendations` — Stores generated recommendations with confidence scores
  - `id` (uuid), `title`, `description`, `confidence_score` (0-100), `urgency` (low/medium/high)
  - `source_items` (jsonb — references to wave items, todoist tasks, etc.)
  - `recommendation_type` (trend, opportunity, risk, connection)
  - `status` (pending, accepted, dismissed, expired)
  - `chairman_response` (jsonb — action taken, feedback, usefulness_rating 1-5)
  - `data_freshness` (jsonb — per-source staleness at time of generation)

- `eva_source_health` — Data freshness tracking per source
  - `id` (uuid), `source_name` (text), `last_sync_at` (timestamptz), `last_item_count` (int)
  - `status` (healthy/degraded/stale), `degraded_since` (timestamptz)

### Existing Tables Used
- `roadmap_wave_items` — Source data for pattern detection
- `eva_todoist_intake` — Classified items from Todoist sync
- `eva_youtube_intake` — Classified items from YouTube sync
- `strategic_directives_v2` — Active work context for relevance scoring

### RLS
- Service role only (backend pipeline) — no user-facing RLS needed

## API Surface
- No REST endpoints needed (internal pipeline)
- RPC: `get_recent_recommendations(limit, status)` — for chairman view integration
- RPC: `respond_to_recommendation(id, response)` — chairman accept/dismiss

## Implementation Phases
- **Phase 0** (1-2 days): Validation — `eva_consultant_snapshots` table + `eva-trend-snapshot.mjs` script. Aggregate classified item statistics without LLM. Run manually for 2 weeks to validate hypothesis before investing in LLM-powered generation. Also create `eva_source_health` table for data freshness tracking.
- **Phase 1** (2-3 days): Trend detector — LLM-assisted pattern detection across recent classified items with data freshness monitoring. Batch processing pattern (one big prompt per run, parse one JSON response) following `wave-clusterer.js` template to control costs.
- **Phase 2** (2-3 days): Recommendation engine — generate actionable recommendations from detected trends with confidence scores, chairman feedback loop (accept/dismiss/rate), and degraded-confidence flagging for stale sources.
- **Phase 3** (1-2 days): Chairman digest — formatted output for chairman view consumption with source freshness indicators. Auto-SD generation for high-confidence recommendations.

## Testing Strategy
- Unit tests for trend detection algorithms (pattern matching, clustering)
- Integration tests for recommendation pipeline (mock data → recommendations)
- Manual validation: chairman reviews first batch of recommendations for quality calibration

## Risk Mitigation
- **Recommendation fatigue**: Start with max 3 recommendations per digest cycle; quality over quantity
- **False patterns**: Require minimum 3 corroborating signals before surfacing a trend. At 400 items across mixed topics, many "trends" will be noise — the confidence threshold must be high initially.
- **LLM cost drift**: Use Haiku for classification, Sonnet only for final synthesis. Batch aggressively — follow the `wave-clusterer.js` pattern of "build one big prompt, parse one JSON response" rather than per-item Sonnet calls. Estimated <$1.50/day; monitor monthly.
- **Stale recommendations**: Auto-expire after 14 days if not acted on
- **Data source degradation**: YouTube Data API has been progressively restricted by Google (watch history scope limitations). The system must gracefully degrade when a source becomes unavailable — continue operating on remaining sources with explicit confidence adjustments, never present single-source analysis as "cross-source."
- **Source heterogeneity**: Todoist tasks are structured/actionable; YouTube content is noisy/ambiguous. Weight sources differently in pattern detection. Don't treat a YouTube video about a topic the same as a Todoist task to investigate that topic.
- **Foundation dependency**: The EVA intake redesign (3D classification) must be production-ready before Phase 1. Phase 0 (snapshots) can run on existing raw data.
- **No feedback = no learning**: Without the chairman feedback loop (Phase 2), the system cannot improve. Phase 2 must ship before the digest becomes a routine notification.
