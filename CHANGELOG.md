# Changelog

## 2026-01-02

### Portfolio Glide Path Dashboard
- **SD-VS-GLIDE-PATH-001**: Documented portfolio glide path dashboard
  - Glide Path phase indicator (Vending Machine → Micro-SaaS → Platform → Portfolio)
  - Phase transition recommendations based on chairman_settings thresholds
  - Risk/reward visualization for current venture portfolio
  - Trend tracking for scoring dimensions over time
  - Integration points: venture_opportunity_scores, chairman_settings tables

### Research Arm Pipeline
- **SD-VS-RESEARCH-ARM-001**: Documented research pipeline integration
  - Research pipeline trigger hooks via API endpoints
  - Weekly research digest automation (scheduled Monday runs)
  - CrewAI research results feed into scoring engine
  - Queue status tracking for research jobs
  - Error handling and retry logic for failed research jobs
  - Integration points: chairman_settings, venture_opportunity_scores tables

### Venture Scoring Engine
- **SD-VS-SCORING-RUBRIC-001**: Documented venture opportunity scoring rubric
  - Scoring dimensions use existing chairman_settings columns
  - Weighted scoring: Feedback Speed (25%), Pattern Match (20%), Market Demand (20%)
  - Additional weights: Unit Economics (15%), Distribution Fit (10%), Strategic Unlock (10%)
  - Scores calculated from: pattern_threshold, feedback_speed, risk_tolerance parameters

### Scaffold Patterns
- **SD-VS-PATTERN-UNLOCK-001**: Added 4 priority patterns to scaffold_patterns table
  - `StripeService` (service) - Billing, subscriptions, metering, webhooks integration
  - `RBACMiddleware` (service) - Role-based access control, permissions, RLS integration
  - `useCRUD` (hook) - Generic CRUD hook for Supabase table bindings with React Query
  - `BackgroundJob` (service) - Job queue with status tracking, retry logic, failure handling
- Pattern count increased from 45 to 49

## 2025-09-22

### Refactoring
- **database-loader.js**: Split 1503-line monolithic file into 6 modular components (PR #4)
  - `connections.js` (45 lines) - Supabase client management
  - `strategic-loaders.js` (422 lines) - SD/PRD/EES loading
  - `submissions.js` (308 lines) - SDIP submission handling
  - `pr-reviews.js` (188 lines) - PR review tracking
  - `utilities.js` (215 lines) - Shared helpers
  - `index.js` (182 lines) - Main orchestrator
  - Created 26-line backward-compatible shim maintaining all exports
  - Zero behavior changes, 100% backward compatibility

### Housekeeping & CI
- Implemented self-contained CI with ephemeral PostgreSQL for staging validation
- Added file bloat detection with path-aware thresholds
- Created production promotion workflow with safety checks
- Added schema drift detection and weekly reporting
- Configured daily/weekly automation schedules

### EHG_Engineering
- Added governance metadata + slug/UUID keys for SDs (`202509221300__eng_sd_metadata.sql`).
- Realigned PRD contract with completeness/risk constraints and UUID linkage (`202509221305__eng_prd_contract.sql`).
- Normalized backlog data into `eng_backlog` with QA gating (`202509221310__eng_backlog_contract.sql`).
- Archived legacy Directive Lab table (`202509221315__eng_archive_legacy.sql`).
- Linked PRD storage to canonical PRDs with QA threshold (`202509221320__eng_fix_prd_storage_fk.sql`).
- Added commit/PR linkage metadata (`202509221325__eng_commit_pr_linkage.sql`).

### EHG (Venture App)
- Renamed venture tables to `vh_*` namespace (`202509221330__vh_namespace_core.sql`).
- Added governance trace columns to ventures (`202509221335__vh_trace_columns.sql`).
- Published read-only ingest views for governance exports (`202509221340__vh_ingest_governance_views.sql`).
- Added staging apply/run-check/backfill scripts under `ops/` (staging_apply.sh, run_checks.sh, run_backfills.sh).
- Created VH governance ingestion job (`apps/ingest/vh_governance_ingest.ts`) with audit logging + feature flag.
- Introduced CI guardrails (`.github/workflows/db-verify.yml`, `.github/workflows/boundary-lint.yml`).

See `ops/audit/2025-09-22.md` for detailed traceability and rollback guidance.
