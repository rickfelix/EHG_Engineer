# Brainstorm: Automated Ranking Data Pipeline — Stage 0 Integration

## Metadata
- **Date**: 2026-02-21
- **Domain**: Venture
- **Phase**: Validation
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Inherited from parent brainstorm (3/3 perspectives)
- **Related Ventures**: All (cross-portfolio capability)
- **Related SDs**: SD-LEO-FEAT-STAND-RESEARCH-DEPARTMENT-001, SD-LEO-FIX-CLOSE-DOMAIN-INTELLIGENCE-001
- **Parent Brainstorm**: brainstorm/2026-02-21-app-ranking-data-replication-targeting.md
- **Key Constraint**: $0 budget — no paid data providers
- **Key Files**:
  - `lib/eva/stage-zero/paths/discovery-mode.js` — Trend Scanner (to enhance)
  - `lib/eva/stage-zero/paths/competitor-teardown.js` — Competitor Teardown (to enhance)
  - `lib/eva/stage-zero/stage-zero-orchestrator.js` — Stage 0 orchestrator
  - `lib/eva/stage-zero/synthesis/index.js` — Synthesis engine (10 components, already built)

---

## Problem Statement

EHG's Stage 0 venture ideation pipeline has two paths that operate blind:

1. **Trend Scanner** (`discovery-mode.js:133-159`) asks an LLM to "scan for trending products" using only its stale training data. No real-time market signals are injected.
2. **Competitor Teardown** (`competitor-teardown.js:95-99`) analyzes competitors "based on what you know about this URL/company" — it doesn't even fetch the URL. Pure LLM memory.

Meanwhile, the downstream pipeline (synthesis engine, financial forecasting, chairman review, persistence) is fully built and operational. The only missing piece is **real-time market data at the top of the funnel**.

Application ranking data from free sources (App Store, Google Play, Product Hunt, G2) can ground both paths in actual market reality, and more importantly, **unify them into a single fully automated pipeline** that requires zero human input until the chairman review gate.

---

## Data Source Landscape

### Free Stack ($0/month)

| Source | What You Get | Format | Freshness | Limitation |
|--------|-------------|--------|-----------|------------|
| **Apple RSS feeds** | Top 100 per chart/category (free, paid, grossing) for any country | JSON/XML REST | ~Daily | No download counts or revenue estimates |
| **Google Play scraper** | App details, ratings, reviews, download count ranges, top charts | Node.js library (`google-play-scraper`) | Real-time | Can break if Google changes HTML; needs proxy at scale |
| **Product Hunt API** | Products, votes, launches, descriptions, topics | GraphQL (free, non-commercial) | Real-time | Maker identity fields redacted since Feb 2023 |
| **G2** | Reviews, ratings, category grids, product profiles | Public web (scraping required) | Continuous | Cloudflare protection; no official API |
| **Capterra** | Product listings, reviews, ratings, comparisons | Public web (scraping required) | Continuous | Rate limits, CAPTCHAs at scale |

### Key Strategic Observations
1. **No revenue estimates available for free** — but rankings + review velocity are sufficient proxies for demand validation.
2. **The free stack is entirely automatable** in Node.js + Supabase (EHG's existing stack).
3. **All sources provide URLs** (app store links, website URLs, G2 profile URLs) — these feed directly into Competitor Teardown.

### Paid Options (Rejected, for Reference)

| Tier | Cost | What You'd Get | Why Not Now |
|------|------|---------------|-------------|
| Budget | ~$60/mo | AppFigures API + Crunchbase Pro | Upgrade path if free sources prove insufficient |
| Mid-range | ~$200/mo | Above + SimilarWeb Starter | Overkill for current needs |
| Enterprise | $25K+/yr | Sensor Tower (download/revenue estimates) | Way beyond current needs |

---

## Fully Automated Pipeline Architecture

### The Unified Flow

Currently, Stage 0 has three independent paths (Competitor Teardown, Blueprint Browse, Discovery Mode). With ranking data, **Path 1 and Path 3 merge into a single automated pipeline**:

```
CRON (daily, zero cost)
  ├── apple-rss-poller.js     → app_rankings table
  ├── gplay-scraper.js        → app_rankings table
  ├── producthunt-poller.js   → app_rankings table
  └── g2-scraper.js (weekly)  → app_rankings table
                ↓
ENHANCED TREND SCANNER (discovery-mode.js)
  → Queries app_rankings for real market data
  → Identifies top replication candidates
  → Scores by: market validation, growth momentum,
    vertical gap, EHG capability reuse
  → Extracts app store / website URLs from ranking data
                ↓
AUTO-TRIGGERED COMPETITOR TEARDOWN (competitor-teardown.js)
  → Deep analysis of each top candidate
  → First-principles deconstruction with real market context
  → Gap analysis across similar-ranked apps
  → Enriched with actual ratings, reviews, chart position
                ↓
SYNTHESIS ENGINE (already built, 10 components)
  → Cross-reference intellectual capital
  → Portfolio-aware evaluation
  → Moat architecture analysis
  → Venture archetype recognition
  → Build cost estimation
  → + 8 more components
                ↓
FINANCIAL FORECAST (already built)
  → TAM/SAM/SOM, revenue projections, unit economics
  → Stage-of-death predictor
  → Venture score (0-100)
                ↓
CHAIRMAN REVIEW (already built)
  → Interactive or non-interactive review
  → Decision: ready (Stage 1) or nursery (park)
                ↓
PERSISTENCE (already built)
  → ventures table (if ready)
  → venture_nursery (if parked)
```

### What's Already Built vs. What's New

| Component | Status | LOC to Add/Change |
|-----------|--------|-------------------|
| Apple RSS poller | **NEW** | ~50 lines |
| Google Play scraper | **NEW** | ~60 lines |
| Product Hunt poller | **NEW** | ~50 lines |
| G2 scraper | **NEW** | ~80 lines |
| Normalizer / app_rankings table | **NEW** | ~40 lines + migration |
| Trend Scanner enhancement | **MODIFY** `discovery-mode.js` | ~30 lines |
| Competitor Teardown enhancement | **MODIFY** `competitor-teardown.js` | ~25 lines |
| Pipeline orchestrator (cron → teardown) | **NEW** | ~60 lines |
| Synthesis engine | **ALREADY BUILT** | 0 |
| Financial forecast | **ALREADY BUILT** | 0 |
| Chairman review | **ALREADY BUILT** | 0 |
| Persistence | **ALREADY BUILT** | 0 |
| **TOTAL NEW/MODIFIED** | | **~395 lines** |

---

## Code Changes Detail

### 1. New: Data Collection Pollers

Four scripts in `lib/eva/stage-zero/data-pollers/`:

**apple-rss-poller.js** (~50 LOC)
```js
// Fetches top-grossing and top-free for configured categories
// URL: https://rss.applemarketingtools.com/api/v2/us/apps/top-grossing/100/apps.json
// Categories: Health & Fitness (6013), Finance (6015), Education (6017),
//             Business (6000), Productivity (6007)
// Output: normalized rows → app_rankings table
```

**gplay-scraper.js** (~60 LOC)
```js
// Uses google-play-scraper npm package
// gplay.list({ category, collection: TOP_GROSSING, num: 100 })
// Captures: title, developer, score, ratings, installs range, url, description
// Output: normalized rows → app_rankings table
```

**producthunt-poller.js** (~50 LOC)
```js
// GraphQL API: https://api.producthunt.com/v2/api/graphql
// Queries trending posts by topic (health, finance, education, logistics)
// Captures: name, tagline, votesCount, url, website, launchDate
// Output: normalized rows → app_rankings table
```

**g2-scraper.js** (~80 LOC)
```js
// Careful scraping of G2 category leader pages (weekly frequency)
// Categories: Healthcare Software, Financial Management, Education Technology
// Captures: product name, G2 score, review count, market segment, website URL
// Rate limiting: max 10 requests per run, 5s delay between requests
// Output: normalized rows → app_rankings table
```

### 2. Modify: Enhanced Trend Scanner

In `lib/eva/stage-zero/paths/discovery-mode.js`, modify `runTrendScanner()`:

```js
async function runTrendScanner({ constraints, candidateCount, strategyConfig }, deps = {}) {
  const { supabase, logger = console, llmClient, strategicContext } = deps;
  const client = llmClient || getValidationClient();

  // NEW: Query real ranking data from app_rankings
  const { data: rankings } = await supabase
    .from('app_rankings')
    .select('app_name, category, chart_position, rating, review_count, source, app_url, website_url, developer')
    .gte('scraped_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // last 7 days
    .order('chart_position', { ascending: true })
    .limit(50);

  const rankingContext = rankings?.length
    ? `\nREAL-TIME MARKET DATA (ground your analysis in this actual data):\n${
        rankings.map(r => `- ${r.app_name} [${r.source}/${r.category}] #${r.chart_position} | ★${r.rating} | ${r.review_count} reviews | ${r.app_url || r.website_url || 'no url'}`).join('\n')
      }\n\nUse this data to identify the strongest replication opportunities. Prefer apps with high ratings, high review counts, and positions where vertical-specific versions do not yet exist.`
    : '';

  // Existing prompt, now with real data injected
  const prompt = `You are an AI venture scout for EHG...
${rankingContext}
...`;

  // Rest of existing function unchanged
}
```

### 3. Modify: Enhanced Competitor Teardown

In `lib/eva/stage-zero/paths/competitor-teardown.js`, modify `analyzeCompetitor()`:

```js
async function analyzeCompetitor(url, deps = {}) {
  const { supabase, logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  // NEW: Cross-reference URL against app_rankings for real market data
  let marketContext = '';
  if (supabase) {
    const { data: rankingData } = await supabase
      .from('app_rankings')
      .select('chart_position, rating, review_count, category, source, installs_range, vote_count, g2_grid_score')
      .or(`app_url.eq.${url},website_url.eq.${url}`)
      .order('scraped_at', { ascending: false })
      .limit(5);

    if (rankingData?.length) {
      marketContext = `\nREAL MARKET DATA for this competitor:\n${
        rankingData.map(r => `- [${r.source}/${r.category}] Chart #${r.chart_position} | ★${r.rating} | ${r.review_count} reviews${r.installs_range ? ' | ' + r.installs_range + ' installs' : ''}${r.g2_grid_score ? ' | G2: ' + r.g2_grid_score : ''}`).join('\n')
      }\n`;
    }
  }

  const prompt = `Analyze this competitor business for venture creation purposes.
Competitor URL: ${url}
${marketContext}
...`; // rest of existing prompt
}
```

### 4. New: Pipeline Orchestrator

New file `lib/eva/stage-zero/ranking-pipeline.js` (~60 LOC):

```js
/**
 * Automated Ranking Data Pipeline
 *
 * Orchestrates the full flow:
 * 1. Run all data pollers → app_rankings table
 * 2. Invoke enhanced Trend Scanner with real data
 * 3. For top N candidates, auto-invoke Competitor Teardown
 * 4. Feed results into existing Stage 0 orchestrator
 *
 * Can be triggered by cron or manually.
 */
export async function runRankingPipeline(deps) {
  const { supabase, logger = console } = deps;

  // Step 1: Run pollers
  await runAllPollers(supabase, logger);

  // Step 2: Run enhanced Trend Scanner
  const trendResult = await executeDiscoveryMode(
    { strategy: 'trend_scanner', candidateCount: 10 },
    deps
  );

  // Step 3: Auto-teardown top candidates that have URLs
  const topCandidates = trendResult?.raw_material?.candidates?.slice(0, 5) || [];
  const urlsForTeardown = topCandidates
    .map(c => c.app_url || c.website_url)
    .filter(Boolean);

  if (urlsForTeardown.length > 0) {
    const teardownResult = await executeCompetitorTeardown(
      { urls: urlsForTeardown },
      deps
    );
    // Merge teardown insights into trend candidates
    // Feed combined result into Stage 0 orchestrator
  }

  // Step 4: Feed into synthesis + chairman review via executeStageZero()
  // ...
}
```

---

## Database Schema

### New Table: app_rankings

```sql
CREATE TABLE app_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,           -- 'apple_rss', 'google_play', 'product_hunt', 'g2'
  category TEXT NOT NULL,         -- 'health_fitness', 'finance', 'education', etc.
  app_name TEXT NOT NULL,
  developer TEXT,
  app_url TEXT,                   -- App store URL (for auto-teardown)
  website_url TEXT,               -- Company website (for auto-teardown)
  chart_position INTEGER,
  chart_type TEXT,                -- 'top_grossing', 'top_free', 'trending'
  rating NUMERIC(3,2),
  review_count INTEGER,
  installs_range TEXT,            -- Google Play only (e.g., '1M+')
  vote_count INTEGER,             -- Product Hunt only
  g2_grid_score NUMERIC(4,2),    -- G2 only
  market_segment TEXT,            -- G2: 'smb', 'mid_market', 'enterprise'
  description TEXT,               -- App description/tagline
  raw_data JSONB,                 -- Full API response for future analysis
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for Trend Scanner queries
CREATE INDEX idx_app_rankings_recent ON app_rankings (scraped_at DESC, chart_position ASC);

-- Index for Competitor Teardown URL cross-reference
CREATE INDEX idx_app_rankings_urls ON app_rankings (app_url, website_url);

-- Index for category-based queries
CREATE INDEX idx_app_rankings_category ON app_rankings (source, category, chart_type);
```

### Existing Tables (No Changes Needed)

The downstream pipeline already has all necessary tables:
- `ventures` — Ready ventures (post-chairman approval)
- `venture_nursery` — Parked ideas for re-evaluation
- `discovery_strategies` — Configurable strategy configs (already has `trend_scanner` entry)

---

## Scoring Rubric (Automated via LLM)

The Trend Scanner prompt instructs the LLM to score each candidate from the ranking data:

| Factor | Weight | Signal Sources | Automated? |
|--------|--------|---------------|------------|
| **Market validation** | 30% | Chart position, review volume, rating | Yes — directly from `app_rankings` |
| **Growth momentum** | 25% | Review velocity, rising position, PH votes | Yes — compare current vs. prior `scraped_at` |
| **Vertical specialization gap** | 25% | LLM judgment: does a vertical version exist? | Yes — LLM prompt |
| **EHG capability reuse** | 20% | LLM judgment: overlap with existing ventures | Yes — LLM prompt with portfolio context |

The `rankCandidates()` function in `discovery-mode.js:385-394` already handles scoring and sorting.

---

## Category Configuration

Initial categories aligned to EHG portfolio:

| App Store Category | G2 Category | EHG Venture | Priority |
|-------------------|-------------|-------------|----------|
| Health & Fitness (6013) | Healthcare Software | MedSync | High |
| Finance (6015) | Financial Management | FinTrack | High |
| Education (6017) | Education Technology | EduPath | Medium |
| Business (6000) | Business Intelligence | LogiFlow | Medium |
| Utilities / Energy | Energy Management | Solara Energy | Low |

Categories stored in `discovery_strategies.metadata` for the `trend_scanner` strategy (already configurable via database).

---

## Cron/Scheduler Design

```
Daily (low traffic hours):
  06:00 UTC — Apple RSS poller (all categories, ~5 HTTP requests)
  06:05 UTC — Google Play scraper (all categories, ~5 scrape runs)
  06:15 UTC — Product Hunt API (all topics, ~5 GraphQL queries)

Weekly (Sunday):
  06:00 UTC — G2 scraper (all categories, ~5 pages, 5s delays)

On-demand (triggered after pollers complete, or manually):
  → Ranking Pipeline orchestrator
    → Enhanced Trend Scanner
    → Auto Competitor Teardown
    → Synthesis → Forecast → Chairman Review
```

Implementation options for cron:
- **Supabase Edge Functions** with `pg_cron` (ideal — already in stack)
- **GitHub Actions scheduled workflow** (fallback — free tier supports cron)
- **Node.js `node-cron`** running on the dev machine (simplest for MVP)

---

## Team Perspectives (Inherited from Parent Brainstorm)

### Synthesis
- **Consensus**: Scoring rubric is make-or-break; ranking data alone is a blunt instrument; the value comes from how it's filtered through EHG's lens
- **Key Tension Resolved**: Lagging indicator concern (Challenger) vs. validated demand (Visionary) — resolved by weighting **fastest-rising** higher than top-grossing, and specifically looking for categories where vertical versions don't exist
- **Composite Risk**: Medium — mitigated by the fact that 80% of the downstream pipeline is already built and tested

### Pragmatist's Updated Assessment
- **Original feasibility**: 4/10 (when scoped as standalone Research Dept capability)
- **Updated feasibility**: 7/10 (as Stage 0 enhancement — most infrastructure exists)
- **Original timeline**: 6-10 weeks
- **Updated timeline**: 2-3 weeks (pollers + 2 file modifications + 1 new orchestrator)

---

## Open Questions
- Should `app_rankings` deduplicate across sources (same app on App Store + G2)?
- What's the right frequency for G2 scraping to avoid detection? (weekly proposed)
- Should the pipeline run fully unattended, or should it queue candidates for batch chairman review?
- How should the pipeline handle the Nursery Re-evaluation strategy? (ranking data could trigger re-scoring of parked ventures whose category is now trending)
- What cron infrastructure to use? (Supabase pg_cron vs. GitHub Actions vs. node-cron)

---

## Suggested Next Steps
1. **Create SD** scoped as a Stage 0 enhancement (not Research Dept dependency)
   - ~395 LOC total, borderline Tier 3 — may benefit from being an orchestrator with 2-3 children
2. **Phase A**: `app_rankings` table + 4 pollers (Apple RSS, Google Play, Product Hunt, G2)
3. **Phase B**: Enhance `runTrendScanner()` and `analyzeCompetitor()` to consume ranking data
4. **Phase C**: Pipeline orchestrator connecting pollers → trend scanner → auto-teardown → stage 0
5. **Phase D**: Cron setup for daily/weekly automated runs
