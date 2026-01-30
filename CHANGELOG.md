# Changelog

## 2026-01-29

### Bugfix
- **Post-Completion Validator False Positive** - PR #685
  - **Issue**: Stop hook post-completion validator blocking AUTO-PROCEED with "Missing SHIP" even when PR merged
  - **Root Cause**: SD query missing `completion_date` field, causing validator to incorrectly check git diff after branch deletion
  - **Fix**:
    - Added `completion_date` to SD select query (`scripts/hooks/stop-subagent-enforcement/index.js:178`)
    - Changed catch block to log info instead of blocking when `git diff` fails
  - **Impact**: Resolved AUTO-PROCEED blocking after SD completion, enabling continuous workflow execution
  - **Files Modified**:
    - `scripts/hooks/stop-subagent-enforcement/index.js` - Added completion_date to query
    - `scripts/hooks/stop-subagent-enforcement/post-completion-validator.js` - Fixed git diff catch block
  - **Documentation**: Updated `docs/06_deployment/stop-hook-operations.md` with troubleshooting entry
  - **Related**: SD-LEO-INFRA-HARDENING-001 (orchestrator parent)

## 2026-01-26

### Infrastructure
- **SD-LEO-INFRA-FORMALIZE-ORCHESTRATOR-WORKFLOW-001: Formalize Orchestrator SD Workflow Pattern** - PR #675
  - **Purpose**: Codify orchestrator SD workflow pattern discovered during SD-LEO-GEN-RENAME-COLUMNS-SELF-001 execution
  - **Changes**:
    - Enhanced CLAUDE_CORE.md with "Orchestrator SD Workflow Pattern" section (lines 818-948)
    - Added "Orchestrator SD Decision Guide" to CLAUDE.md with decision table and artifacts
    - Enhanced `orchestrator-preflight.js` to v2.0.0 with auto-detection, JSON output (--json), validation mode (--validate)
    - Created `docs/reference/parent-prd-derivation-guide.md` with complete PRD template and traceability mapping
    - Added `.github/workflows/orchestrator-preflight.yml` CI enforcement for orchestrator compliance
  - **Key Features**:
    - Three detection methods: explicit metadata, database children, heuristic content analysis
    - Artifact validation: children exist, parent PRD derivation, status checks, protocol references
    - JSON mode for programmatic integration, validation mode for CI/CD gates
  - **Impact**: Orchestrator SDs now have formal workflow documentation, automated preflight validation, and CI enforcement
  - **Files Modified**: 5 files, +826/-34 lines
  - **Pattern Origin**: SD-LEO-GEN-RENAME-COLUMNS-SELF-001

- **SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Remove legacy_id Column References** - PR #673
  - **Root Cause**: Code still referencing `legacy_id` column after it was dropped from `strategic_directives_v2` table on 2026-01-24
  - **Patterns Resolved**:
    - PAT-EXECSQL-001: exec_sql function missing (verified migration already applied)
    - PAT-LEGACYID-001: legacy_id column references in active code
  - **Fix**: Updated 7 files to use `sd_key` instead of `legacy_id`:
    - `lib/sub-agents/github.js` - SD lookup for CI validation
    - `lib/sub-agents/testing/index.js` - SD type check for non-UI tests
    - `lib/sub-agents/retro/db-operations.js` - Retrospective SD lookup
    - `lib/sub-agents/retro/action-items.js` - SD key fallback chain
    - `lib/sub-agents/retro/generators.js` - SD key fallback chain
    - `lib/templates/prd-template.js` - PRD ID generation and metadata
    - `lib/utils/sd-type-guard.js` - SD audit and update functions
  - **Database Cleanup**: Verified migrations already applied, no further database changes needed
  - **Impact**: Prevents runtime errors from referencing dropped columns, improves code correctness
  - **Source**: Auto-created by `/learn` command based on retrospective patterns

### Bugfix
- **SD-LEO-FIX-PARENT-BLOCK-001: Fix Parent SD Metadata Synchronization** - PR #669
  - **Root Cause**: Database trigger only set `sd_type='orchestrator'` but NOT `metadata.is_parent=true`, causing OrchestratorCompletionGuardian to fail silently
  - **Fix**: Updated trigger to set BOTH flags atomically when parent_sd_id is assigned
  - **Backfill**: Migrated 6 existing parent SDs missing `is_parent` flag:
    - SD-INDUSTRIAL-2025-001, SD-LEO-REFACTOR-LARGE-FILES-001/002, SD-NAV-CMD-001, SD-STAGE-ARCH-001, SD-UNIFIED-PATH-2.1
  - **Guardian Logic**: Implemented triple-check parent detection (sd_type OR is_parent OR has_children) with improved error propagation
  - **Files Modified**:
    - `database/migrations/20260126_fix_parent_sd_metadata.sql` - Trigger fix and backfill
    - `scripts/modules/orchestrator-completion-guardian.js` - Robust detection logic
    - `scripts/modules/handoff/orchestrator-completion-guardian.js` - Same robust detection
    - `scripts/modules/parent-orchestrator-handler.js` - Updated isParentOrchestrator()
  - **Impact**: Parent SDs now correctly block child SD completion when orchestrator is incomplete
  - **Testing**: TESTING sub-agent verified PASS (90% confidence), all handoffs passed (EXEC-TO-PLAN 96%, LEAD-FINAL-APPROVAL 92%)

## 2026-01-23

### Infrastructure
- **SD-AEGIS-GOVERNANCE-001: AEGIS Unified Governance System** - PRs #506, #508
  - **Complete Implementation** consolidating 7 fragmented governance frameworks into unified database-first system:
    - Database schema: `aegis_constitutions`, `aegis_rules`, `aegis_violations` tables with RLS policies
    - Core enforcement engine: `AegisEnforcer`, `AegisRuleLoader`, `AegisViolationRecorder`
    - 6 validator types: FieldCheck, Threshold, RoleForbidden, CountLimit, Custom, Base
    - 7 governance framework adapters:
      - `ConstitutionAdapter` - Protocol Constitution (9 rules)
      - `FourOathsAdapter` - Agent behavior governance
      - `DoctrineAdapter` - EXEC phase restrictions (Law 1)
      - `HardHaltAdapter` - Dead-man switch protocol
      - `ManifestoModeAdapter` - EVA manifesto enforcement
      - `CrewGovernanceAdapter` - Budget and PRD validation
      - `ComplianceAdapter` - PII, retention, audit logging
    - CLI commands: `node scripts/governance.js list|validate|violations|stats|constitutions`
    - REST API endpoints: `/api/aegis/rules`, `/api/aegis/violations`, `/api/aegis/stats`, `/api/aegis/constitutions`
    - Performance: Multi-layer caching (in-memory + 5min TTL) minimizes database queries
    - 62 passing tests across all phases
  - Impact: Runtime rule updates without code deployment, centralized audit trail, backward compatibility via adapters
  - Documentation: Complete system overview, API docs, database schema, and CLI guide in `docs/01_architecture/`, `docs/02_api/`, `docs/database/`, `docs/reference/`

- **SD-LEO-GATE0-001: Gate 0 Workflow Entry Enforcement** (Orchestrator with 6 children)
  - **Purpose**: Prevent code shipping when SDs have not properly entered the LEO Protocol workflow
  - **Root Cause Addressed**: Protocol had excellent gates ONCE in workflow, but no gate preventing work OUTSIDE the workflow
  - **6 Child SDs Completed**:
    - `SD-LEO-GATE0-PRECOMMIT-001`: Pre-commit hook for SD phase validation
    - `SD-LEO-GATE0-CLAUDEEXEC-001`: CLAUDE_EXEC.md mandatory sd:status check
    - `SD-LEO-GATE0-LOCTHRESHOLD-001`: LOC threshold trigger (>500 LOC)
    - `SD-LEO-GATE0-VERIFYSCRIPT-001`: verify-sd-phase.js script (Gate 0)
    - `SD-LEO-GATE0-GHACTION-001`: GitHub Action for PR merge SD validation
    - `SD-LEO-GATE0-ORCHPROGRESS-001`: Orchestrator progress calculation fix
  - **Enforcement Points**:
    - Pre-commit: Validates SD is in active workflow phase before allowing commits
    - PR Merge: GitHub Action checks SD phase status before merge
    - LOC Threshold: Triggers workflow entry when changes exceed 500 LOC
  - **Impact**: Prevents protocol bypass, ensures SD workflow activation before implementation
  - **Capabilities Registered**: `gate0-workflow-enforcement`, `pre-commit-validation`, `pr-merge-validation`

- **SD-LEO-REFAC-TESTING-INFRA-001: TESTING & RETRO Sub-Agent Modularization** - PRs #543, #544
  - **TESTING Sub-Agent** refactored from 1,097 LOC monolithic file to modular architecture:
    - Created `lib/sub-agents/testing/phases/` directory with 5 phase modules:
      - `phase1-preflight.js` - Intelligent test analysis, selector validation, navigation flow checks
      - `phase2-generation.js` - Test case generation from user stories
      - `phase3-execution.js` - E2E test execution with caching support
      - `phase4-evidence.js` - Test evidence collection and user story verification
      - `phase5-verdict.js` - Verdict generation with adaptive validation (prospective vs retrospective)
    - Created `lib/sub-agents/testing/utils/troubleshooting.js` - Troubleshooting tactics arsenal (13 patterns)
    - Main file reduced to 550 LOC orchestrator
    - All phase logic preserved, no breaking changes
  - **RETRO Sub-Agent** quality improvements:
    - Fixed `lib/sub-agents/retro/action-items.js` - Preserved SMART action item metadata (was stripping to plain strings)
    - Rewrote `lib/sub-agents/retro/generators.js` - Extract actual SD-specific insights instead of template-based boilerplate
    - New extractors: `extractSubAgentInsights()`, `extractPRDInsights()`, `extractHandoffInsights()`, `extractTestEvidence()`
    - Result: Retrospective quality score improved from 42-46/100 to 90/100 with 16 key learnings
  - **Windows ESM Import Fix**:
    - Fixed `scripts/modules/handoff/executors/exec-to-plan/test-evidence.js` - Proper path resolution using `fileURLToPath()`, `pathToFileURL()`, and `resolve()`
    - Windows ESM requires file:// URLs for dynamic imports with absolute paths
  - Impact: Improved maintainability (<550 LOC per file), enhanced retrospective specificity, eliminated RETROSPECTIVE_QUALITY_GATE failures
  - Documentation: Updated `lib/sub-agents/testing/index.js` header with v3.1 refactoring notes

### Features
- **DATABASE Sub-Agent: Intelligent Migration Execution with Action Trigger Detection** - PR #520
  - Added action intent detection to DATABASE sub-agent for automatic migration execution
  - New `action_triggers` array in `config/domain-keywords.json` with phrases like "apply migration", "run migration", "db push"
  - When users say action phrases, the sub-agent now:
    - Detects action intent from keywords
    - Finds pending migration files in standard locations
    - Displays confirmation preview showing:
      - File names and paths
      - Migration types (CREATE TABLE, ALTER TABLE, RLS, INSERT)
      - Content preview
    - Requires `--confirm-apply` flag to execute (safe by default)
    - Executes `supabase db push` via CLI
  - Implementation files:
    - `lib/sub-agents/database.js`: Added `detectActionIntent()`, `findPendingMigrations()`, `executeMigrations()`
    - `lib/modules/context-aware-selector/domain-keywords.js`: Added `detectActionTrigger()` and `getActionTriggers()` helpers
    - `database/migrations/20260123_add_database_action_triggers.sql`: Migration to persist triggers in `leo_sub_agent_triggers` table
  - Documentation updates:
    - `docs/reference/database-agent-patterns.md`: Added Pattern 7 (Intelligent Migration Execution), updated action trigger keywords section
  - Impact: Reduces manual "run supabase db push" reminders, provides full transparency before execution
  - Safety: No migrations execute without explicit confirmation flag

## 2026-01-20

### Documentation
- **SD-LEO-FIX-PROTOCOL-001: Priority Field Documentation Fix** - Root cause fix for SD creation failures
  - Updated `docs/database/strategic_directives_v2_field_reference.md` with correct lowercase priority values
  - Issue: Documentation showed `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` but database constraint requires `critical`, `high`, `medium`, `low`
  - Root cause (5 Whys): No single source of truth for enum values between docs and DB schema
  - Added warning and explicit constraint values to prevent future mismatch
  - PR: #453

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
- **QF-20260121-001: Fix [object Object] bug in retrospective action items** - Quick-fix for serialization issue
  - Fixed `lib/sub-agents/retro/action-items.js` lines 61-65
  - Issue: SmartAction objects pushed directly to array became `[object Object]` when serialized to database
  - Fix: Extract `.action` string from SmartAction objects before returning
  - Impact: Retrospective action items now display correctly instead of `[object Object]`
  - Related: **SD-LEO-FIX-PROTOCOL-001** (Protocol Improvements from Refactoring Retrospective Analysis)
  - PR: #454
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
