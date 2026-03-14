<!-- Archived from: docs/plans/automated-codebase-health-scoring-architecture.md -->
<!-- SD Key: SD-LEO-ORCH-AUTOMATED-CODEBASE-HEALTH-001 -->
<!-- Archived at: 2026-03-12T12:13:44.415Z -->

# Architecture Plan: Automated Codebase Health Scoring

## Stack & Repository Decisions

- **Repository**: EHG_Engineer (this repo) — all scanner logic, EVA integration, and priority scorer modifications live here
- **Language**: JavaScript (ESM) — consistent with existing EVA scripts
- **Database**: Supabase (existing) — new table for health snapshots, reuse existing EVA tables
- **Static analysis**: `escomplex` (npm) for cyclomatic complexity; native Node.js fs/path for file scanning; Jest coverage JSON for test trends
- **No new external services**: All analysis is local static analysis with database storage

## Legacy Deprecation Plan

N/A — greenfield capability. No existing systems are replaced. The health scanner is additive:
- Adds a new signal source to the existing EVA trend detection pipeline
- Adds a new scoring dimension to the existing priority scorer
- Adds a new database table for snapshot storage

Existing manual health review remains available — this augments, not replaces.

## Route & Component Structure

### New Scripts
```
scripts/eva/codebase-health-scan.mjs          # Main scanner orchestrator
scripts/eva/health-dimensions/
  dead-code-scanner.mjs                        # Dimension 1: file bloat, unused exports
  coverage-trend-tracker.mjs                   # Dimension 2: Jest coverage trend analysis
  complexity-scorer.mjs                        # Dimension 3: cyclomatic complexity, file size
scripts/eva/health-config.mjs                  # Threshold configuration (DB-backed)
```

### Modified Scripts
```
scripts/lib/priority-scorer.js                 # Add health-urgency dimension
scripts/sd-next.js                             # Add pre-session health check hook
scripts/eva/trend-detector.mjs                 # Register codebase_health as signal source
```

### Module Organization
- Health dimensions are separate modules under `scripts/eva/health-dimensions/` — each is independently deployable and testable
- The orchestrator (`codebase-health-scan.mjs`) runs all enabled dimensions and writes snapshots
- Threshold config lives in DB (`codebase_health_config` table) for runtime adjustment without code changes

## Data Layer

### New Table: `codebase_health_snapshots`
```sql
CREATE TABLE codebase_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension TEXT NOT NULL,              -- 'dead_code', 'test_coverage', 'module_complexity'
  score NUMERIC(5,2) NOT NULL,          -- 0-100 normalized score (higher = healthier)
  details JSONB NOT NULL DEFAULT '{}',  -- dimension-specific breakdown
  trend_direction TEXT,                 -- 'improving', 'stable', 'declining'
  threshold_breached BOOLEAN DEFAULT FALSE,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'           -- git ref, scan duration, etc.
);

CREATE INDEX idx_health_snapshots_dimension_time
  ON codebase_health_snapshots(dimension, scanned_at DESC);
```

### New Table: `codebase_health_config`
```sql
CREATE TABLE codebase_health_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension TEXT NOT NULL UNIQUE,
  threshold_warning NUMERIC(5,2) NOT NULL,   -- score below this = advisory
  threshold_critical NUMERIC(5,2) NOT NULL,  -- score below this = generate SD
  min_occurrences INTEGER DEFAULT 2,         -- consecutive breaches before SD generation
  max_sds_per_cycle INTEGER DEFAULT 2,       -- rate limit per scan
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Existing Table Integration
- `eva_consultant_trends` — health findings inserted as `trend_type: 'codebase_health'`, `trend_source: 'health_scanner'`
- `strategic_directives_v2` — auto-generated SDs with `metadata.origin: 'codebase_health'`, using existing SD types (refactor/infrastructure)

### Queries
- **Snapshot trend**: `SELECT * FROM codebase_health_snapshots WHERE dimension = $1 ORDER BY scanned_at DESC LIMIT 10` — used for trend direction calculation
- **Threshold check**: `SELECT * FROM codebase_health_config WHERE dimension = $1 AND enabled = TRUE` — loaded at scan time
- **Breach history**: `SELECT COUNT(*) FROM codebase_health_snapshots WHERE dimension = $1 AND threshold_breached = TRUE AND scanned_at > NOW() - INTERVAL '7 days'` — for min_occurrences check

### RLS
- Health snapshots are system-generated, read-only for clients. Service role writes.

## API Surface

### CLI Commands
```bash
# Full health scan (all enabled dimensions)
node scripts/eva/codebase-health-scan.mjs

# Single dimension scan
node scripts/eva/codebase-health-scan.mjs --dimension dead_code

# View current health scores
node scripts/eva/codebase-health-scan.mjs --report

# Dry run (scan but don't generate SDs)
node scripts/eva/codebase-health-scan.mjs --dry-run
```

### NPM Scripts (package.json)
```json
{
  "health:scan": "node scripts/eva/codebase-health-scan.mjs",
  "health:report": "node scripts/eva/codebase-health-scan.mjs --report",
  "health:dry": "node scripts/eva/codebase-health-scan.mjs --dry-run"
}
```

### Internal APIs
- `scanDimension(dimensionName)` → `{ score, details, trend, breached }`
- `writeSnapshot(dimensionName, result)` → stores in codebase_health_snapshots
- `checkThresholdBreach(dimensionName, result)` → evaluates against config, returns whether SD should be generated
- `generateHealthSD(dimensionName, findings)` → feeds into EVA auto-SD generator

## Implementation Phases

### Phase 1: Dead Code / Bloat Scanner (~1 SD, 1-2 sessions)
**Deliverables**:
- `codebase_health_snapshots` and `codebase_health_config` tables (migration)
- `dead-code-scanner.mjs` — detects: tmp-*.cjs files, files not imported by any other file, files with zero test coverage, files older than 90 days with no git activity
- `codebase-health-scan.mjs` orchestrator with --dry-run support
- Wire into `eva_consultant_trends` as new signal source
- npm scripts: health:scan, health:report, health:dry
- Tests: unit tests for scanner logic, integration test for EVA pipeline flow

### Phase 2: Test Coverage Trend Tracker (~1 SD, 1-2 sessions)
**Deliverables**:
- `coverage-trend-tracker.mjs` — parses Jest coverage-summary.json, stores per-module coverage snapshots
- Trend detection: sliding window over last N snapshots, alerts on declining modules
- Threshold: configurable per-module or global floor (e.g., "no module drops below 60%")

### Phase 3: Module Complexity Scorer (~1 SD, 1-2 sessions)
**Deliverables**:
- `complexity-scorer.mjs` — uses escomplex for cyclomatic complexity, plus file size and function count
- Hotspot detection: identifies top-N most complex modules and tracks trend
- Threshold: configurable complexity ceiling (e.g., cyclomatic > 50 per module)

### Phase 4: Priority Scorer Enhancement (~1 SD, 1 session)
**Deliverables**:
- New `health_urgency` dimension in `priority-scorer.js`
- Inputs: number of active health findings, severity (how far past threshold), finding age
- Weight calibration based on Phase 1-3 observations
- Tests: verify health SDs can surface into top-10 when degradation is critical

### Estimated Total: 4 SDs, 5-7 sessions

## Testing Strategy

### Unit Tests
- Each health dimension scanner: given a known file structure, produces expected scores
- Threshold evaluation: given scores and config, correctly determines breach/no-breach
- Trend calculation: given N snapshots, correctly identifies improving/stable/declining
- Priority scorer: health-urgency dimension correctly modifies composite score

### Integration Tests
- Full pipeline: scanner → snapshot → EVA trend → recommendation → draft SD
- Deduplication: running scan twice with same results does not create duplicate SDs
- Rate limiting: scan with 10 breaches respects max_sds_per_cycle=2
- sd:next pre-hook: verify scan triggers when last snapshot is >24h old

### Edge Cases
- Empty codebase (no files to scan) — should produce score=100, no SD
- All dimensions breached simultaneously — rate limiter enforced, most severe first
- Threshold changed between scans — new threshold applies immediately, no retroactive SD generation
- File referenced only in tests (not dead code) — import graph must include test files

## Risk Mitigation

### SD Queue Flooding
**Risk**: First scan generates many SDs from accumulated debt.
**Mitigation**: `max_sds_per_cycle` config (default 2). `min_occurrences` requires 2+ consecutive breaches. --dry-run flag for initial calibration before enabling auto-generation.

### Priority Scorer Distortion
**Risk**: Health-urgency weight is too high, health SDs dominate strategic work.
**Mitigation**: Phase 4 is separate from Phases 1-3. Observe health SD generation for 1+ weeks before modifying the scorer. Initial weight should be conservative (10-15% of max score), tunable via config.

### False Positives
**Risk**: Scanner flags files as dead code that are actually needed (e.g., dynamically imported, used via CLI).
**Mitigation**: Allowlist mechanism in `codebase_health_config` (JSONB `exclusions` field). Dead code scanner checks both static imports AND dynamic import patterns. Manual dismissal of a health SD feeds back as an exclusion.

### Threshold Oscillation
**Risk**: Scores fluctuate around threshold, generating and invalidating SDs repeatedly.
**Mitigation**: Hysteresis via `min_occurrences` — must breach threshold N consecutive times. Additionally, once an SD is generated for a finding, that finding is "claimed" and won't generate another SD until the first is completed or cancelled.
