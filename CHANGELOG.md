# Changelog

## 2026-01-20

### Infrastructure
- **SD-LEO-REFACTOR-LARGE-FILES-002: LEO Protocol File Modularization** - Orchestrator SD refactoring large validation files
  - **SD-LEO-REFACTOR-IMPL-FIDELITY-001** (Child 8): Refactored `implementation-fidelity-validation.js` (1,559 LOC → 10 modules)
    - Created `scripts/modules/implementation-fidelity/` directory structure
    - Modules: preflight, utils (git-helpers, repo-detection), sections (design-fidelity, database-fidelity, data-flow-alignment, enhanced-testing)
    - Main file reduced to 20 LOC thin re-export wrapper
    - All exports preserved, no breaking changes
  - **SD-LEO-REFACTOR-VALIDATOR-REG-001** (Child 9): Refactored `ValidatorRegistry.js` (1,234 LOC → 10 modules)
    - Created `scripts/modules/handoff/validation/validator-registry/` directory structure
    - Modules: core.js (157 LOC), gate validators split by type (L, 1, 2, 3, 4, Q, additional)
    - 52 validators registered across 7 gate modules
    - Main file reduced to 21 LOC thin re-export wrapper
  - **SD-LEO-REFACTOR-TRACEABILITY-001** (Child 10): Refactored `traceability-validation.js` (993 LOC → 9 modules)
    - Created `scripts/modules/traceability-validation/` directory structure
    - Modules: utils, preflight, sections (recommendation-adherence, implementation-quality, traceability-mapping, sub-agent-effectiveness, lessons-captured)
    - Phase-aware weighting system (CRITICAL 30pts, MAJOR 25pts, MINOR 10-5pts)
    - Main file reduced to 17 LOC thin re-export wrapper
  - **Impact**: All scripts/modules/ files now under 1000 LOC threshold (largest: ai-quality-evaluator.js at 948 LOC)
  - **Tooling**: Created `create-orchestrator-sd.js` and `create-refactor-orchestrator-002.js` for future orchestrator SD creation
  - **Backward Compatibility**: All original file paths maintained as re-exports, no caller changes required

### Bugfixes
- **SD-FIX-NAV-001: Chairman Sidebar Navigation Architecture Fix** - Orchestrator SD with 4 children completed
  - **SD-FIX-NAV-001-A**: Fixed navigation route database configuration for chairman persona
  - **SD-FIX-NAV-001-B**: Cleaned up legacy routes and standardized analytics path
  - **SD-FIX-NAV-001-C**: Updated documentation references from `/chairman-analytics` to `/chairman/analytics`
  - **SD-FIX-NAV-001-D**: Removed 4 test ventures from database (Critical Attention, Launch Checklist Test, UI/UX Assessment Test, P0 RLS Fix Test) to clean up sidebar display
  - Root cause: Test data pollution in ventures table causing confusing sidebar entries
  - Impact: Cleaner chairman persona navigation, proper route separation

### Known Issues
- **LEAD-FINAL-APPROVAL Validator Bug**: `workflow-roi-validation.js` line 137 checks for `LEAD-FINAL` handoff type which doesn't exist in `sd_phase_handoffs` schema. Schema only allows: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD. Workaround: Manual SD completion via database update after PLAN-TO-LEAD passes.

## 2026-01-18

### Multi-Repository Architecture
- **Centralized Multi-Repo Module**: Created `lib/multi-repo/index.js` consolidating repo discovery and coordination logic
  - Repository discovery and metadata management
  - Git status checking (uncommitted changes, unpushed commits)
  - SD-to-repo mapping (determines affected repos by SD type/keywords)
  - Branch operations (find SD-related branches across repos)
  - Display helpers for console output
  - Reduces duplication across 3 different scripts
- **Multi-Repo Status CLI**: Enhanced `scripts/multi-repo-status.js` to use centralized module
  - Reduced from 330 to 123 lines
  - Added `--sd SD-XXX` flag for SD-specific checks
  - Shows which repos have uncommitted work per SD
- **Ship Workflow Enhancement**: Added Step 0.1 to `/ship` command
  - Automatically checks all repos for uncommitted changes before shipping
  - Prevents shipping backend while frontend changes sit uncommitted
  - Provides actionable recommendations when changes found
- **Phase 1 Refactoring (PR #355)**: Consolidated duplicated repo discovery logic
  - `MultiRepoCoordinator.js`: Removed 70 lines of duplicated discovery code
  - `branch-cleanup-v2.js`: Removed 50 lines of duplicated discovery code
  - Exported config constants from `lib/multi-repo/index.js` for reuse
  - Net reduction: 90 lines, single source of truth for all repo operations
- **Phase 2 SD-Aware Intelligence (PR #357)**: Added multi-repo awareness to LEO Protocol commands
  - `sd-next.js`: Shows MULTI-REPO WARNING banner when uncommitted changes detected
  - `handoff.js`: STEP 0 multi-repo check before phase transitions (precheck and execute)
  - `sd-verify.js`: Verification checklist includes multi-repo status, blocks SD completion if uncommitted
  - SD-aware: Only checks repos affected by SD type (via `getAffectedRepos()`)
  - Prevents forgetting uncommitted work in related repos during critical operations

### Quality Lifecycle System - 100% Completion
- **SD-QUALITY-INT-001**: Completed final integration tasks
  - Risk Router notification for P0/P1 feedback with auto-escalation
  - /learn integration with feedback table (resolved learnings and recurring patterns)
  - Feedback-to-SD promotion API endpoint (POST /api/feedback/:id/promote-to-sd)
- **SD-QUALITY-UI-001**: Completed final UI tasks
  - Added breadcrumb labels (quality, inbox, backlog, releases, patterns)
  - Added "Promote to SD" button in FeedbackDetailPanel
  - Wired onPromoteToSD handler with toast notifications
- **Multi-Repo Ship**: Successfully shipped both EHG (frontend) and EHG_Engineer (backend) changes
  - PR #351 (backend) - Integration and triage engine
  - PR #120 (frontend) - UI components and handlers

### Documentation
- **Multi-Repo Module API Reference**: `docs/reference/multi-repo-module.md`
  - Complete API documentation with examples
  - Configuration reference (KNOWN_REPOS, COMPONENT_REPO_MAP)
  - Usage patterns and integration guide
- **Multi-Repo Architecture**: `docs/01_architecture/multi-repo-architecture.md`
  - EHG ecosystem structure (frontend + backend repos)
  - Coordination patterns and workflows
  - Deployment architecture and future enhancements

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
