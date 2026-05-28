// Insert PRD for SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001
// Encodes 3 FRs from plan + 5 design conditions (C1-C5) + 12 risks + validation advisory.

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SD_KEY = 'SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001';
const SD_UUID = '74108dbf-766e-4f4c-958f-786ff1bc16fb';
const PRD_ID = `PRD-${SD_KEY}`;

const PRD = {
  id: PRD_ID,
  sd_id: SD_UUID,
  status: 'approved',
  title: 'Automate Stage 19 -> SD Cascade (vision-approval -> archplan -> orchestrator)',

  executive_summary: 'Background cron-watcher cascades L2 vision approval -> upsertArchPlan -> parent orchestrator SD (no chairman touch). Fixes F3/F5 + adds eva_cascade_errors observability. Mirrors assertVentureVisionReady refusal pattern.',

  functional_requirements: [
    {
      id: 'FR-A',
      requirement: 'Refactor scripts/create-orchestrator-from-plan.js into split library functions; fix F3 (venture-aware target_application) + F5 (populate quality-gate JSONB from vision/arch dimensions).',
      description: 'Extract orchestration logic from CLI main() into lib/eva/create-orchestrator-from-plan.js. Per DESIGN agent C4 (BLOCKING): split into THREE functions, not one fat function: buildOrchestratorSD(visionDoc, archPlan, phases, metrics) (pure), buildChildSD(orchSD, phase, dimensionMap) (pure), insertCascade(supabase, orchSD, childSDs) (DB-touching, mockable). Fix F3: replace target_application=\'EHG_Engineer\' hardcode at L316,L427 with targetApplication parameter (CLI derives from ventures.name via vision.venture_id join). Fix F5: populate dependencies/risks/stakeholders/implementation_guidelines/strategic_objectives/success_criteria from vision.extracted_dimensions + arch.implementation_phases + arch.extracted_dimensions at create time (instead of empty arrays / 1-element placeholders). Per RISK agent Risk-11 (MEDIUM): thread venture_id explicitly through upsertArchPlan({ ventureId }) so auto-path matches manual baseline (ARCH-CRONGENIUS-001 currently has venture_id=NULL; this is a pre-existing bug to fix in scope).',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-A1: lib/eva/create-orchestrator-from-plan.js exports buildOrchestratorSD, buildChildSD, insertCascade as three named functions; CLI in scripts/create-orchestrator-from-plan.js becomes a thin wrapper calling them.',
        'AC-A2: target_application parameter threaded through all three functions; CLI derives default from ventures.name when vision.venture_id is set, else falls back to \'EHG_Engineer\'.',
        'AC-A3: Snapshot regression test confirms ARCH-CRONGENIUS-001 -> SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001 record structure is BYTE-IDENTICAL before vs after refactor for the same inputs (per RISK agent COND-1: capture JSON snapshot of orchestrator+children BEFORE refactor, assert post-refactor matches).',
        'AC-A4: F5 fields populated: orchestrator has >=3 dependencies, >=3 risks with severity, >=3 stakeholders with roles, >=3 implementation_guidelines, success_criteria >=5 as {criterion, measure}, strategic_objectives >=4. Children inherit from orchestrator + add phase-specific items.',
        'AC-A5: venture_id threaded through upsertArchPlan call site; eva_architecture_plans row has venture_id populated when source vision has venture_id (per Risk-11).',
        'AC-A6: Vitest tests cover (i) buildOrchestratorSD pure-function invariants, (ii) buildChildSD non-vertical detector preservation, (iii) insertCascade with mocked supabase, (iv) F3 hardcode replacement, (v) F5 quality-gate field population, (vi) venture_id propagation.'
      ]
    },
    {
      id: 'FR-B',
      requirement: 'Build cascade-watcher one-shot script + archplan-section extractor + refusal-gate symmetry.',
      description: 'New script scripts/cron/cascade-watcher.mjs (one-shot semantics, NOT a daemon — per DESIGN agent C5 BLOCKING — survives crashes, idempotent on every run). Per RISK agent COND-2: first-run safety — refuse to cascade visions whose downstream artifacts already exist with different metadata than the watcher would produce (do not clobber chairman in-flight edits on SD-CRONGENIUS-M1). New library lib/eva/extract-archplan-section.js exporting extractArchPlanSection(visionContent) which parses ## Architectural Plan heading; returns content string or null. Watcher main loop: (1) query eva_vision_documents WHERE level=\'L2\' AND status=\'active\' AND chairman_approved=true AND venture_id IS NOT NULL AND NOT EXISTS (downstream archplan); (2) for each ready vision: extract section -> if null -> write eva_cascade_errors row with remediation_command pointing to manual archplan-command.mjs upsert; if non-null -> call upsertArchPlan({ ventureId }) -> archplan auto-active+approved; (3) query eva_architecture_plans WHERE status=\'active\' AND chairman_approved=true AND vision_key IS NOT NULL AND NOT EXISTS (downstream orchestrator SD) AND first-run-safety-check passes; (4) for each ready archplan: call createOrchestratorFromPlan({ visionKey, archKey, title, autoChildren:true, targetApplication }); (5) write success / refusal rows. Per RISK agent COND-2 + DESIGN agent C1: take PG advisory lock keyed on hash(vision_key||arch_key) before INSERT to close race window between pre-check and INSERT.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-B1: scripts/cron/cascade-watcher.mjs accepts --once (one shot, exit 0/1) and --venture-id <uuid> (scope-limit for safety). No --watch daemon mode — operator schedules via external cron/Task Scheduler.',
        'AC-B2: lib/eva/extract-archplan-section.js exports extractArchPlanSection(visionContent) returning {content, found:boolean, heading_line_number}. Tests cover (i) canonical "## Architectural Plan" heading, (ii) variants "### Architectural Plan", (iii) missing section returns found:false, (iv) malformed markdown returns found:false without throwing.',
        'AC-B3: First-run safety check (per RISK COND-2): when ANY downstream artifact already exists for a candidate vision/arch, watcher checks metadata.auto_generated=true on existing record — if FALSE (i.e., chairman manually created it), watcher writes eva_cascade_errors row labeled MANUAL_OVERRIDE_DETECTED and skips. Idempotency only applies to records the watcher itself owns.',
        'AC-B4: Refusal-gate symmetry mirrors lib/eva/lifecycle-sd-bridge.js:213 pattern — every eva_cascade_errors row has remediation_command column populated with the exact manual CLI invocation chairman should run to unblock.',
        'AC-B5: PG advisory lock acquired via SELECT pg_try_advisory_xact_lock(hashtext(vision_key||COALESCE(arch_key,\'\'))); if lock fails, log "concurrent cron detected" and exit gracefully (next run will pick up).',
        'AC-B6: Vitest tests cover (i) full cascade from VISION fixture -> archplan -> orchestrator with mocked supabase, (ii) refusal when section missing, (iii) refusal when MANUAL_OVERRIDE_DETECTED, (iv) advisory lock contention, (v) idempotent second run produces zero new writes.'
      ]
    },
    {
      id: 'FR-C',
      requirement: 'eva_cascade_errors schema + heartbeat observability + dashboard surface + npm scripts.',
      description: 'Per RISK COND-3 (staged rollout): FR-C migration ships and runs BEFORE FR-B writes any rows (otherwise chicken-egg). Schema: eva_cascade_errors (id uuid pk, vision_id uuid fk, archplan_key text, stage text CHECK (stage IN (\'vision_to_archplan\',\'archplan_to_orchestrator\')), error_code text, error_message text, remediation_command text, created_at timestamptz default now(), resolved_at timestamptz, resolved_by text). Per DESIGN agent C2 (BLOCKING) + RISK COND-6: (a) ADD remediation_command column (as above), (b) heartbeat — new table cascade_watcher_heartbeats (run_id uuid pk, started_at, finished_at, exit_code int, refusal_count int, success_count int) — every watcher run inserts one row; chairman can grep absence (no row within 5min = stuck), (c) daily summary written via existing scripts/log-harness-bug.js channel when refusal_count > 0 on previous day. Per RISK COND-6 rate-limit: UNIQUE (vision_id, stage, error_code) PARTIAL INDEX WHERE resolved_at IS NULL prevents 1440-rows/day spam when one vision stays refused (single open row per error_code; updated_at refreshed each occurrence). Per CLAUDE.md SD type=infrastructure: NO UI on EHG_Engineer dashboard; cascade:status npm script suffices as observability surface for chairman.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-C1: Migration migrations/<timestamp>_eva_cascade_errors.sql creates eva_cascade_errors table with all columns AND cascade_watcher_heartbeats table AND the partial UNIQUE index. Migration applied via database-agent (NOT VALID strategy if existing data; should be greenfield).',
        'AC-C2: package.json adds script "cascade:watch:cron":"node scripts/cron/cascade-watcher.mjs --once" and "cascade:status":"node scripts/cron/cascade-status.mjs". Operator-side cron registration documented in scope notes (NOT auto-registered to leo-cron-monitor — that infra does not exist per DESIGN C5).',
        'AC-C3: scripts/cron/cascade-status.mjs prints (a) last heartbeat age, (b) count of unresolved errors by stage, (c) per-vision_id last error_code+remediation_command, (d) success count last 24h. Exit code 0 if all healthy, 1 if heartbeat >5min stale OR unresolved errors >0.',
        'AC-C4: Daily summary integration: when cascade-watcher.mjs exits with refusal_count>0 AND it is first run after midnight UTC, append a row to feedback table via log-harness-bug.js with category=\'harness_backlog\' and severity proportional to refusal_count.',
        'AC-C5: Heartbeat row inserted at watcher start (started_at, exit_code=NULL) and updated at exit (finished_at, exit_code, refusal_count, success_count). Crashed runs leave finished_at=NULL — cascade:status surfaces these as "abandoned".'
      ]
    },
    {
      id: 'FR-D',
      requirement: 'Documentation: discoverability hooks per P-FAIL-3 (in-scope minimum: package.json entries + README header pointer; full doc-update QF deferred).',
      description: 'P-FAIL-3 from pilot journal explicitly named archplan-command + create-orchestrator-from-plan + /heal vision + vision-repair-loop as invisible to LEAD. Per scope notes the FULL doc fix is deferred to a separate QF (and the doc-drift CAPA QF I already filed touches the same source — leo_protocol_sections rows). MINIMUM here: (a) package.json script entries discoverable via npm run; (b) lib/eva/create-orchestrator-from-plan.js exports include a // PUBLIC LIBRARY comment block at top mentioning when to use it; (c) README.md gets a single line "Auto-cascade: see npm run cascade:status" in the relevant section. Nothing more — full discoverability QF is filed separately and tracked in conversation.',
      priority: 'LOW',
      acceptance_criteria: [
        'AC-D1: Two new npm scripts (cascade:watch:cron, cascade:status) appear in package.json scripts section.',
        'AC-D2: lib/eva/create-orchestrator-from-plan.js has top-of-file JSDoc block declaring "PUBLIC LIBRARY ENTRY" with usage example.',
        'AC-D3: One-line README.md addition pointing to cascade:status.'
      ]
    },
    {
      id: 'FR-E',
      requirement: 'Cleanup: resolve VALIDATION agent MEDIUM advisory (SD description truncated, plan_content has the full text) by ensuring PRD sources match plan_content rather than description.',
      description: 'VALIDATION agent flagged that SD.description was truncated to 1992 chars while SD.metadata.plan_content has the full 11825-char plan. This PRD synthesizes from plan_content directly (this requirement documents that decision). No code change required — this FR is bookkeeping.',
      priority: 'LOW',
      acceptance_criteria: [
        'AC-E1: PRD acknowledges in exploration_summary.key_decisions that synthesis source is SD.metadata.plan_content, NOT SD.description.'
      ]
    }
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'cascade-watcher MUST be a stateless one-shot Node.js script invoked by external scheduler (Windows Task Scheduler / *nix cron / systemd timer). NO daemon mode, NO long-running process.',
      rationale: 'Per DESIGN agent C5 BLOCKING: leo-cron-monitor does not exist; daemonization adds PID file + restart-on-crash + log rotation which are out-of-scope. One-shot semantics survive crashes inherently, are idempotent by design, observable via exit code, and align with existing scripts/cron/*.cjs siblings.'
    },
    {
      id: 'TR-2',
      requirement: 'PG advisory locks (pg_try_advisory_xact_lock) for cross-stage atomicity, NOT row-level locks.',
      rationale: 'Per DESIGN agent C1 BLOCKING + RISK agent Risk-4: between pre-check and INSERT there is a TOCTOU window. Advisory locks scoped to txid scope auto-release; hash inputs (vision_key||arch_key) provide deterministic dedup without holding row locks across multiple INSERTs into different tables (eva_architecture_plans + strategic_directives_v2 + strategic_directives_v2 children).'
    },
    {
      id: 'TR-3',
      requirement: 'F3/F5 refactor in scripts/create-orchestrator-from-plan.js MUST preserve byte-identical output for unchanged inputs (regression invariant).',
      rationale: 'Per RISK agent Risk-2 HIGH + COND-1: SD-CRONGENIUS-M1 was created via the current path; downstream PLAN_VERIFICATION is in-flight. Any behavior change to existing-input outputs corrupts in-flight venture work. Snapshot test is the gate.'
    },
    {
      id: 'TR-4',
      requirement: 'eva_cascade_errors UNIQUE PARTIAL INDEX (vision_id, stage, error_code) WHERE resolved_at IS NULL is REQUIRED, not optional.',
      rationale: 'Per RISK agent Risk-9 MEDIUM + COND-6: 60s polling cadence x stuck vision = 1440 rows/day per error_code. Without partial UNIQUE, the table becomes write-amplified noise and the dashboard becomes useless. With partial UNIQUE + ON CONFLICT DO UPDATE refreshing updated_at, one open row per (vision, stage, error_code) tuple is maintained.'
    },
    {
      id: 'TR-5',
      requirement: 'No file paths read or written outside .worktrees/ during watcher operation — all I/O is DB-only.',
      rationale: 'Per /heal vision lesson (SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001): venture-aware code must not assume EHG_Engineer cwd. The cascade reads vision content from DB and writes archplan/orchestrator records to DB; archplan section extraction operates on in-memory string. Naturally worktree-safe.'
    },
    {
      id: 'TR-6',
      requirement: 'Library functions buildOrchestratorSD and buildChildSD MUST be pure (no supabase, no Date.now() side-effects exposed in returns); only insertCascade touches DB.',
      rationale: 'Per DESIGN agent C4 BLOCKING: testability requires separation of construction from persistence. Pure constructors are mockable and snapshot-friendly; impure ones bloat fixtures.'
    }
  ],

  system_architecture: {
    overview: 'Stateless cron-driven watcher polls DB for chairman-approved L2 visions lacking downstream archplans, and approved archplans lacking downstream orchestrator SDs. Each stage uses the existing canonical library (upsertArchPlan, createOrchestratorFromPlan) with new venture-aware wiring (F3/F5 fixes). Refusal-gate symmetry: every refusal writes a structured row to eva_cascade_errors with remediation_command. Observability via heartbeat table + npm cascade:status script.',
    components: [
      { name: 'lib/eva/create-orchestrator-from-plan.js (NEW)', responsibility: 'Pure constructors buildOrchestratorSD, buildChildSD + persistence insertCascade. Refactored from CLI main().', technology: 'Node ESM, @supabase/supabase-js' },
      { name: 'lib/eva/extract-archplan-section.js (NEW)', responsibility: 'Parses ## Architectural Plan section out of L2 vision content. Returns {content, found, heading_line_number}.', technology: 'Node ESM, regex-based markdown heading parser' },
      { name: 'lib/eva/archplan-upsert.js (EXISTING, reused)', responsibility: 'Already exports upsertArchPlan(); idempotent on plan_key; sets status=\'active\' chairman_approved=true. Add ventureId param threading per Risk-11.', technology: 'Node ESM' },
      { name: 'scripts/cron/cascade-watcher.mjs (NEW)', responsibility: 'One-shot orchestration: detect ready visions -> upsertArchPlan; detect ready archplans -> insertCascade. PG advisory lock per (vision,arch). Refusal-gate writes to eva_cascade_errors. Heartbeat row at start/end.', technology: 'Node ESM, one-shot semantics' },
      { name: 'scripts/cron/cascade-status.mjs (NEW)', responsibility: 'CLI observability — last heartbeat age, unresolved errors by stage, last error per vision, success count.', technology: 'Node ESM, table output' },
      { name: 'eva_cascade_errors (NEW table)', responsibility: 'Refusal log with remediation_command + partial UNIQUE index to prevent spam.', technology: 'Postgres' },
      { name: 'cascade_watcher_heartbeats (NEW table)', responsibility: 'Per-run heartbeat with success/refusal counts + exit code; absence-based liveness signal.', technology: 'Postgres' }
    ],
    data_flow: '(1) External scheduler runs `npm run cascade:watch:cron` (one-shot). (2) Watcher inserts heartbeat start row. (3) Acquires PG advisory lock per candidate. (4) Stage 1: SELECT FROM eva_vision_documents WHERE level=\'L2\' AND status=\'active\' AND chairman_approved=true AND venture_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM eva_architecture_plans WHERE vision_id=evd.id). For each: extractArchPlanSection(content); if not found OR auto_generated=false on existing archplan -> INSERT eva_cascade_errors {remediation_command}; if found -> upsertArchPlan({ planKey, visionKey, content, ventureId }). (5) Stage 2: SELECT FROM eva_architecture_plans WHERE status=\'active\' AND chairman_approved=true AND NOT EXISTS (SELECT 1 FROM strategic_directives_v2 WHERE metadata->>\'arch_key\'=plan_key). For each: createOrchestratorFromPlan({ visionKey, archKey, title, autoChildren:true, targetApplication }). (6) Watcher updates heartbeat row with success/refusal counts + exit_code. (7) Operator runs `npm run cascade:status` for observability.',
    integration_points: [
      'eva_vision_documents (read) — approval signal',
      'eva_architecture_plans (read+write via existing upsertArchPlan)',
      'strategic_directives_v2 (read+write via createOrchestratorFromPlan)',
      'ventures (read for venture_id -> name lookup for F3 target_application)',
      'eva_cascade_errors (write, new)',
      'cascade_watcher_heartbeats (write, new)',
      'feedback table via log-harness-bug.js (daily summary)',
      'External scheduler (Windows Task Scheduler / cron / systemd timer) — operator-managed'
    ]
  },

  test_scenarios: [
    { id: 'TS-1', scenario: 'Happy path: chairman-approved L2 vision with venture_id and "## Architectural Plan" section -> auto-creates archplan -> auto-creates orchestrator + children with venture-derived target_application.', test_type: 'integration', given: 'Fresh eva_vision_documents row level=L2 status=active chairman_approved=true venture_id=<test-uuid> content has "## Architectural Plan" section with 5 phases. No downstream archplan. No downstream orchestrator. ventures row has name=\'TestVenture\'.', when: 'cascade-watcher.mjs --once runs', then: 'eva_architecture_plans row created with venture_id=<test-uuid> status=active chairman_approved=true; strategic_directives_v2 orchestrator row created with target_application=\'TestVenture\' (NOT \'EHG_Engineer\'); 5 child SDs created; quality-gate JSONB fields populated (>=3 each); cascade_watcher_heartbeats row has success_count=1 refusal_count=0 exit_code=0.' },
    { id: 'TS-2', scenario: 'Refusal: L2 vision approved but lacks "## Architectural Plan" section -> structured refusal row written with remediation_command.', test_type: 'integration', given: 'Vision row matching watcher predicate but content has no Architectural Plan heading.', when: 'cascade-watcher.mjs --once runs', then: 'No archplan created. eva_cascade_errors row inserted with stage=\'vision_to_archplan\' error_code=\'ARCH_SECTION_NOT_FOUND\' remediation_command containing the exact manual `node scripts/eva/archplan-command.mjs upsert --plan-key <derived> --vision-key <vision-key> --source <path>` invocation. heartbeat exit_code=0 refusal_count=1.' },
    { id: 'TS-3', scenario: 'Idempotency: second watcher run after successful first run produces zero new writes.', test_type: 'integration', given: 'TS-1 has run successfully.', when: 'cascade-watcher.mjs --once runs again with no state change', then: 'No new eva_architecture_plans rows. No new strategic_directives_v2 rows. New heartbeat row with success_count=0 refusal_count=0 exit_code=0.' },
    { id: 'TS-4', scenario: 'Manual-override protection: watcher detects manually-created downstream artifact and refuses to clobber.', test_type: 'integration', given: 'L2 vision approved; eva_architecture_plans row already exists with metadata.auto_generated=false (chairman-created).', when: 'cascade-watcher.mjs --once runs', then: 'No upsert overwrite. eva_cascade_errors row inserted with error_code=\'MANUAL_OVERRIDE_DETECTED\' remediation_command empty (informational only).' },
    { id: 'TS-5', scenario: 'Concurrent cron race: two watcher instances start simultaneously.', test_type: 'integration', given: 'Two cascade-watcher.mjs processes start within 100ms; same ready vision.', when: 'Both attempt INSERT', then: 'Exactly one succeeds (winner of pg_try_advisory_xact_lock); loser logs "concurrent cron detected" and exits 0. eva_architecture_plans has exactly one new row. No duplicate orchestrator.' },
    { id: 'TS-6', scenario: 'Snapshot regression: F3/F5 refactor preserves byte-identical output for existing CronGenius inputs.', test_type: 'unit', given: 'JSON snapshot of SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001 + children -A, -B, -C captured BEFORE refactor.', when: 'buildOrchestratorSD + buildChildSD invoked with same inputs (VISION-CRONGENIUS-API-L2-001 + ARCH-CRONGENIUS-001 + phases)', then: 'Generated objects match snapshot byte-for-byte (except auto-generated UUIDs and timestamps which the test strips).' },
    { id: 'TS-7', scenario: 'F3 venture target_application derivation correctness.', test_type: 'unit', given: 'buildOrchestratorSD called with vision having venture_id, ventures row name=\'AcmeVenture\'.', when: 'Function executes', then: 'Returned orchestrator object has target_application=\'AcmeVenture\'. When venture_id is null, returns target_application=\'EHG_Engineer\' (backward compat).' },
    { id: 'TS-8', scenario: 'F5 quality-gate fields populated from dimensions.', test_type: 'unit', given: 'buildOrchestratorSD called with vision.extracted_dimensions=[5 items] arch.implementation_phases=[7 items] arch.extracted_dimensions=[6 items].', when: 'Function executes', then: 'Orchestrator dependencies length>=3, risks length>=3 with severity, stakeholders length>=3 with roles, implementation_guidelines length>=3, strategic_objectives length>=4, success_criteria length>=5 as {criterion, measure} objects.' },
    { id: 'TS-9', scenario: 'Refusal spam prevention via partial UNIQUE index.', test_type: 'integration', given: 'Vision stuck in refusal state (no Architectural Plan section); watcher runs 1440 times in 24h.', when: 'Each run hits the same refusal', then: 'eva_cascade_errors has exactly 1 open row for (vision_id, stage, error_code); updated_at refreshed each run via ON CONFLICT DO UPDATE.' },
    { id: 'TS-10', scenario: 'cascade-status CLI output and exit code.', test_type: 'integration', given: 'Heartbeat row present from 30s ago with success_count=2 refusal_count=1; 1 unresolved error.', when: '`npm run cascade:status` runs', then: 'Stdout shows heartbeat age=30s, refusals=1, per-vision error+remediation. Exit code=1 (because unresolved errors > 0).' }
  ],

  acceptance_criteria: [
    'AC-1: Manual chairman-approved L2 vision -> orchestrator pipeline completes in <90s without any human intervention for happy-path scenarios; no degradation of manual CLI fallback path.',
    'AC-2: SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001 + its 3 children remain byte-identical structure (per snapshot test TS-6) after F3/F5 refactor; in-flight PLAN_VERIFICATION work is not disrupted.',
    'AC-3: All BLOCKING design conditions resolved: C1 advisory lock implemented (TR-2, AC-B5); C2 remediation_command column + heartbeat table + daily summary (AC-C1..C5); C4 three-function split with pure constructors (AC-A1, TR-6); C5 one-shot semantics + package.json scripts (AC-B1, AC-C2). C3 LOC-sniff verified at EXEC entry.',
    'AC-4: All RISK CONDITIONS resolved: COND-1 snapshot baseline (AC-A3); COND-2 first-run safety (AC-B3); COND-3 staged migration (FR-C ships before FR-B writes); COND-4 venture_id threading (AC-A5); COND-5 archplan-upsert chairman_approved auto-set is documented decision (no change — accepted); COND-6 heartbeat + rate-limit + SLA (TR-4, AC-C3, AC-C5).',
    'AC-5: cascade-watcher.mjs --once exits with code 0 on healthy state, code 1 on system error (advisory lock contention or DB unavailable), and emits a single heartbeat row per run.'
  ],

  risks: [
    { risk: 'Risk-1: Cron fires while chairman is iterating on vision (pre-approval edits).', probability: 'MEDIUM', impact: 'MEDIUM', mitigation: 'Watcher predicate requires chairman_approved=true; drafts/iterations have chairman_approved=false and are skipped. Plus first-run safety check (AC-B3) refuses to clobber non-auto_generated downstream artifacts.', rollback_plan: 'Stop the external cron schedule; manually update eva_architecture_plans / strategic_directives_v2 to revert any erroneous auto-creation; data integrity preserved by idempotency.' },
    { risk: 'Risk-2: F3/F5 refactor breaks SD-CRONGENIUS-M1 in-flight work.', probability: 'MEDIUM', impact: 'HIGH', mitigation: 'Snapshot regression test (TS-6 + COND-1): byte-identical assertion of orchestrator+children structure for unchanged inputs. CRONGENIUS-M1 currently has target_application=\'CronGenius\' (chairman manually overrode hardcode); refactor reaches same result via venture_id derivation.', rollback_plan: 'Revert FR-A commit; CronGenius work resumes on pre-refactor library. Snapshot test prevents accidental rollout.' },
    { risk: 'Risk-3 (raised by RISK agent): Watcher self-crash writes nothing -- recursive observability blind spot.', probability: 'MEDIUM', impact: 'HIGH', mitigation: 'Heartbeat row inserted at watcher START (before any cascade work), so crashed runs leave finished_at=NULL and cascade:status flags them as "abandoned". Operator-side scheduler logs (Task Scheduler / cron syslog) capture stdout/stderr.', rollback_plan: 'Operator stops the scheduler; manual CLI fallback continues to work.' },
    { risk: 'Risk-4: Concurrent cron instances race on same ready row.', probability: 'LOW', impact: 'MEDIUM', mitigation: 'Defense-in-depth: (a) PG advisory lock keyed on hash(vision_key||arch_key); (b) upsertArchPlan onConflict on plan_key; (c) orchestrator key-collision pre-check at create-orchestrator-from-plan.js:259-274. All three layers preserved.', rollback_plan: 'Single-instance scheduling at operator level eliminates concurrency; current cron design is single-run already.' },
    { risk: 'Risk-5: L2 vision content lacks "## Architectural Plan" section.', probability: 'MEDIUM', impact: 'LOW', mitigation: 'Refusal-gate symmetry: write eva_cascade_errors row with remediation_command pointing to manual archplan-command.mjs upsert with explicit --source. Chairman runs the suggested command to unblock.', rollback_plan: 'No rollback needed — refusal is the safe default.' },
    { risk: 'Risk-7 (RISK agent HIGH): First watcher run could clobber SD-CRONGENIUS-M1 in-flight chairman edits.', probability: 'HIGH', impact: 'HIGH', mitigation: 'First-run safety check (AC-B3): watcher checks metadata.auto_generated=true on existing downstream artifact; if FALSE, refuses and writes MANUAL_OVERRIDE_DETECTED. CronGenius existing records were manually created -> metadata.auto_generated=false -> watcher skips them.', rollback_plan: 'Manual --venture-id flag on watcher allows scope-limited testing on a single non-CronGenius venture before opening to all.' },
    { risk: 'Risk-8 (RISK agent MEDIUM): FR-B writes to eva_cascade_errors table that FR-C creates (chicken-egg).', probability: 'HIGH', impact: 'LOW', mitigation: 'Staged rollout (COND-3): FR-C migration ships and is applied BEFORE FR-B watcher runs. EXEC plan orders commits: FR-C migration first, then FR-A refactor, then FR-B watcher.', rollback_plan: 'Migration is greenfield (no data to lose); can be re-applied cleanly.' },
    { risk: 'Risk-9 (RISK agent MEDIUM): Refusal spam writes 1440 rows/day per stuck vision.', probability: 'MEDIUM', impact: 'MEDIUM', mitigation: 'Partial UNIQUE index (TR-4) + ON CONFLICT DO UPDATE updated_at; daily summary surfaces stuck visions to chairman so they get resolved instead of accumulating forever.', rollback_plan: 'TRUNCATE eva_cascade_errors if it gets out of hand; idempotency means watcher repopulates only currently-open issues.' },
    { risk: 'Risk-11 (RISK agent MEDIUM): ARCH-CRONGENIUS-001 has venture_id=NULL while its vision has venture_id; auto-path must thread venture_id explicitly.', probability: 'CERTAIN', impact: 'MEDIUM', mitigation: 'AC-A5: thread venture_id through upsertArchPlan call. Backfill existing CRONGENIUS-001 row as part of EXEC (one-line UPDATE).', rollback_plan: 'UPDATE eva_architecture_plans SET venture_id=NULL WHERE plan_key=\'ARCH-CRONGENIUS-001\' restores prior state if needed.' },
    { risk: 'Risk-12 (RISK agent MEDIUM): archplan-upsert.js:102-103 auto-sets chairman_approved=true; chairman decision required on whether vision-approval alone gates the full cascade.', probability: 'CERTAIN', impact: 'LOW', mitigation: 'COND-5 surfaced to chairman in plan: accepted as-is. Vision approval = full cascade authorization (archplan + orchestrator). If chairman wants explicit archplan-approval gate later, add a new SD; do not block this one.', rollback_plan: 'Add `WHERE archplan.chairman_approved_explicitly=true` filter to FR-B Stage 2 query in a future SD.' }
  ],

  implementation_approach: {
    phases: [
      { phase: 'Phase 1: Schema + observability (FR-C migration)', description: 'Create eva_cascade_errors + cascade_watcher_heartbeats tables with partial UNIQUE index. Add cascade:status + cascade:watch:cron scripts to package.json. Add cascade-status.mjs CLI (read-only; safe to ship first per staged rollout COND-3).', deliverables: ['migrations/<timestamp>_eva_cascade_errors.sql', 'scripts/cron/cascade-status.mjs', 'package.json scripts section update', 'Documentation: scope-notes mention operator-side cron registration steps'] },
      { phase: 'Phase 2: Library refactor + F3/F5 fixes (FR-A)', description: 'Capture JSON snapshot of CRONGENIUS-M1 + 3 children BEFORE refactor. Extract main() logic from scripts/create-orchestrator-from-plan.js into lib/eva/create-orchestrator-from-plan.js with three pure functions. Fix F3 + F5. Add venture_id threading to upsertArchPlan call sites. Vitest unit + snapshot regression tests pass.', deliverables: ['lib/eva/create-orchestrator-from-plan.js (NEW)', 'scripts/create-orchestrator-from-plan.js (thin CLI wrapper)', 'lib/eva/__tests__/create-orchestrator-from-plan.test.js', 'tests/snapshots/crongenius-m1.json', 'lib/eva/archplan-upsert.js (venture_id threading)'] },
      { phase: 'Phase 3: Watcher + extractor + refusal-gate (FR-B)', description: 'Build lib/eva/extract-archplan-section.js + scripts/cron/cascade-watcher.mjs. Implement PG advisory lock, first-run safety, refusal-gate writes. Integration tests using TestContainers or mocked supabase. Verify zero new writes on idempotent second run.', deliverables: ['lib/eva/extract-archplan-section.js (NEW)', 'scripts/cron/cascade-watcher.mjs (NEW)', 'lib/eva/__tests__/extract-archplan-section.test.js', 'scripts/cron/__tests__/cascade-watcher.test.mjs'] },
      { phase: 'Phase 4: Discoverability minimum (FR-D) + bookkeeping (FR-E)', description: 'Add JSDoc PUBLIC LIBRARY block. One-line README addition. PRD source decision documented in exploration_summary.', deliverables: ['README.md +1 line', 'lib/eva/create-orchestrator-from-plan.js JSDoc header'] },
      { phase: 'Phase 5: First-venture validation', description: 'After all 4 phases ship + merge: enable scheduler with --venture-id=<non-CronGenius> for scope-limited dry run. Inspect cascade:status output. Verify zero MANUAL_OVERRIDE_DETECTED noise on existing CronGenius records. Then open to all ventures.', deliverables: ['Operator runbook (in scope-notes, not a new file): scheduler entry, --venture-id scope-limit, cascade:status acceptance check'] }
    ],
    technical_decisions: [
      'One-shot Node script + external scheduler (Windows Task Scheduler / *nix cron / systemd timer) over daemon process — per DESIGN agent C5: avoids PID file / restart-on-crash / log rotation; aligns with existing scripts/cron/*.cjs pattern.',
      'PG advisory locks (pg_try_advisory_xact_lock) over row-level locks — per DESIGN agent C1: locks scope auto-release; avoids holding row locks across multi-table INSERTs.',
      'Three pure functions (buildOrchestratorSD + buildChildSD + insertCascade) over one fat function — per DESIGN agent C4: testability and mockability.',
      'Partial UNIQUE index for refusal de-dup over no index — per RISK agent Risk-9: 1440 rows/day/key is unacceptable; one open row per (vision, stage, error_code) is the right shape.',
      'venture_id threading through upsertArchPlan + create-orchestrator path — per Risk-11: existing CRONGENIUS arch has venture_id=NULL which is a pre-existing bug now fixable in scope.',
      'No leo-cron-monitor integration (does not exist) — per DESIGN agent C5: operator-side scheduler is the canonical surface; npm run cascade:watch:cron is the invocation.'
    ]
  },

  integration_operationalization: {
    consumers: [
      { name: 'Chairman (Solo Entrepreneur)', interaction: 'Approves L2 vision via SQL UPDATE or future dashboard; runs `npm run cascade:status` for observability; reads daily-summary harness-backlog entries when refusals occur.', frequency: 'Per-venture (low volume — once at L2 approval time, observability ad-hoc).' },
      { name: 'External scheduler (Windows Task Scheduler / cron)', interaction: 'Invokes `npm run cascade:watch:cron` every 60s.', frequency: '1440x/day.' },
      { name: 'EVA / future dashboard surfaces', interaction: 'Reads cascade_watcher_heartbeats + eva_cascade_errors for dashboard widgets (out of scope this SD).', frequency: 'Polled on dashboard load (future).' }
    ],
    dependencies: [
      { name: 'eva_vision_documents (read)', type: 'upstream', contract: 'level=L2, status=active, chairman_approved=true, venture_id NOT NULL, sections / content present', failure_handling: 'No-op if predicate not satisfied; never throws.' },
      { name: 'lib/eva/archplan-upsert.js (call site)', type: 'downstream', contract: 'upsertArchPlan({ supabase, planKey, visionKey, content, ventureId, brainstormId, createdBy })', failure_handling: 'Catches; writes eva_cascade_errors with error_code=ARCHPLAN_UPSERT_FAILED + error_message; does not propagate.' },
      { name: 'lib/eva/create-orchestrator-from-plan.js (NEW, downstream)', type: 'downstream', contract: 'createOrchestratorFromPlan({ supabase, visionKey, archKey, title, autoChildren, targetApplication })', failure_handling: 'Catches; writes eva_cascade_errors with error_code=ORCHESTRATOR_CREATE_FAILED.' },
      { name: 'ventures (read for F3 target_application)', type: 'upstream', contract: 'ventures.name lookup via venture_id; ventures table read-only.', failure_handling: 'If ventures row missing, fall back to target_application=\'EHG_Engineer\' + log WARN (does not block cascade).' },
      { name: 'PG (advisory locks)', type: 'upstream', contract: 'pg_try_advisory_xact_lock(int) returns bool', failure_handling: 'On false (lock contention), watcher exits 0 with structured log; next run picks up.' }
    ],
    data_contracts: [
      { contract_name: 'eva_cascade_errors row shape', schema: '{id uuid, vision_id uuid, archplan_key text, stage CHECK IN (vision_to_archplan,archplan_to_orchestrator), error_code text, error_message text, remediation_command text, created_at, resolved_at, resolved_by}', validation: 'CHECK constraint on stage; partial UNIQUE on (vision_id, stage, error_code) WHERE resolved_at IS NULL', versioning: 'Initial v1; future additions via additive migrations only.' },
      { contract_name: 'cascade_watcher_heartbeats row shape', schema: '{run_id uuid pk, started_at, finished_at, exit_code int, refusal_count int, success_count int, hostname text}', validation: 'started_at NOT NULL; finished_at NULL until run completes (crash detection signal)', versioning: 'Initial v1.' },
      { contract_name: 'Watcher exit codes', schema: '0=healthy run (success_count+refusal_count>=0); 1=system error (lock contention is NOT an error, advisory lock fail still exits 0); 2=fatal misconfiguration', validation: 'CLI integration test verifies exit code matches state', versioning: 'Stable.' }
    ],
    runtime_config: {
      environment_variables: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CASCADE_WATCHER_VENTURE_ID (optional scope-limit)'],
      feature_flags: ['CASCADE_WATCHER_DRY_RUN=true — skip all writes, log what would happen (for first-venture validation in Phase 5)'],
      deployment_considerations: 'External scheduler is operator-managed; package.json provides the canonical invocation. NOT integrated with non-existent leo-cron-monitor. Runtime is Node.js — same as rest of EHG_Engineer.'
    },
    observability_rollout: {
      monitoring: ['cascade_watcher_heartbeats.finished_at age (>5min stale = stuck)', 'eva_cascade_errors.created_at rate (spike indicates degradation)', 'success_count vs refusal_count ratio per day'],
      alerts: ['Heartbeat absence >5min', 'New unresolved errors in eva_cascade_errors (chairman polls cascade:status)', 'Daily summary via log-harness-bug.js when refusal_count > 0 on previous day'],
      rollout_strategy: 'Phased: Phase 5 enables scheduler with --venture-id=<non-CronGenius> for scope-limited validation before opening to all ventures.',
      rollback_trigger: 'Detected clobber of manual records (MANUAL_OVERRIDE_DETECTED should NOT cause writes; if it did, immediate stop scheduler).',
      rollback_procedure: 'Disable external scheduler entry (single config change); manual CLI fallback continues to function; revert FR-A commit if F3/F5 regression detected via snapshot test.'
    }
  },

  exploration_summary: {
    files_read: [
      'lib/eva/lifecycle-sd-bridge.js (refusal-gate precedent at L181-235)',
      'scripts/eva/brainstorm-to-vision.mjs (chairman_approved=false initial state confirmed)',
      'scripts/eva/archplan-command.mjs (upsert subcommand + library entry point delegation)',
      'lib/eva/archplan-upsert.js (clean library API; auto-sets active+approved; missing venture_id propagation)',
      'scripts/create-orchestrator-from-plan.js (CLI main(); F3 hardcodes at L316,L427; F5 empty arrays; key-collision idempotency at L258-274)',
      'CLAUDE_LEAD_DIGEST.md + CLAUDE_PLAN_DIGEST.md (phase requirements)',
      'project_crongenius_first_venture_pilot_2026_05_27.md (P-FAIL-3 source + F2/F3/F5/F9/O4 catalog)',
      '.rca/RCA-ENF-SD-CREATE-SKILL-DOC-DRIFT-2026-05-27.md (sibling RCA filed this session)',
      'docs/plans/archived/sd-leo-orch-automate-stage-cascade-001-plan.md (this SD plan_content source)'
    ],
    patterns_identified: [
      'Refusal-gate symmetry: structured error message includes literal remediation command (lib/eva/lifecycle-sd-bridge.js:213-220 pattern)',
      'Idempotent DB writes: ON CONFLICT DO NOTHING or upsert via onConflict + pre-check; PG advisory locks close TOCTOU windows',
      'Three-tier separation in pure libs: builders (no I/O) + persisters (DB only) — testability via mocking persistence boundary',
      'One-shot Node script over daemon: align with scripts/cron/*.cjs siblings; external scheduler is operator-owned',
      'Partial UNIQUE index for de-dup of open issues: WHERE resolved_at IS NULL keeps one row per error key',
      'venture_id propagation: read upstream from eva_vision_documents.venture_id; threaded through every downstream call (archplan, orchestrator, children)',
      'Heartbeat tables for absence-based liveness: start row at script entry, update at exit; crashed runs leave finished_at NULL'
    ],
    key_decisions: [
      'PRD synthesized from SD.metadata.plan_content (per VALIDATION agent MEDIUM advisory) — SD.description was truncated to 1992 chars; full 11825-char plan lives in metadata',
      'Option C (cron watcher) over Options A (DB trigger + queue) and B (approval-action library) — chairman picked 2026-05-27',
      'Three FRs (A/B/C) treated as internal phases of ONE infrastructure SD per LEO-INFRA precedent (SD-LEO-INFRA-UNIFY-VENTURE-NON-001 model) rather than separate child SDs (avoids orchestrator-type guardrail that requires arch_key in metadata)',
      'F2 (LLM extraction enrichment), F9 (sd_type list inconsistency), O4 (vision pre-screen 15s timeout), and full discoverability doc-fix are DEFERRED to follow-up SDs / QFs per Q8 scope reduction (25%)',
      'leo-cron-monitor integration removed (does NOT exist per DESIGN agent C5); replaced with operator-side scheduler + package.json scripts',
      'One-fat-function design REFUTED; split into three pure functions per DESIGN agent C4',
      'eva_cascade_errors ships BEFORE FR-B writes anything (staged rollout per RISK agent COND-3)'
    ],
    exploration_date: new Date().toISOString()
  }
};

// User stories — each maps to one or more FRs/ACs
const USER_STORIES = [
  {
    sd_id: SD_UUID,
    prd_id: PRD_ID,
    title: 'As a chairman, my approved L2 vision auto-cascades to a claim-ready orchestrator SD without manual CLI steps',
    description: 'When I set chairman_approved=true on an L2 vision with a venture_id, within 60 seconds the system creates the archplan + orchestrator SD + children automatically. I never type `archplan-command.mjs upsert` or `create-orchestrator-from-plan.js --auto-children` again.',
    acceptance_criteria: ['Vision approval -> orchestrator readiness in <90s (AC-1)', 'No manual chairman action between approval and LEAD claim availability', 'Manual CLI fallback continues to work unchanged'],
    priority: 'CRITICAL',
    status: 'pending',
    implementation_context: {
      sd_key: SD_KEY,
      mapped_frs: ['FR-A', 'FR-B'],
      mapped_acs: ['AC-1', 'AC-A1', 'AC-A2', 'AC-B1'],
      mapped_tests: ['TS-1'],
      complexity_score: 'high',
      estimated_loc: 260
    }
  },
  {
    sd_id: SD_UUID,
    prd_id: PRD_ID,
    title: 'As a chairman, refused cascades are visible with exact remediation steps',
    description: 'When the auto-cascade refuses (missing Architectural Plan section, manual override detected, etc.), eva_cascade_errors captures the refusal with a remediation_command field naming the exact CLI invocation I can run to unblock.',
    acceptance_criteria: ['Every refusal row has remediation_command populated (AC-B4)', 'cascade:status CLI surfaces unresolved refusals (AC-C3)', 'Daily summary delivered via existing harness-backlog channel (AC-C4)'],
    priority: 'HIGH',
    status: 'pending',
    implementation_context: {
      sd_key: SD_KEY,
      mapped_frs: ['FR-B', 'FR-C'],
      mapped_acs: ['AC-B4', 'AC-C3', 'AC-C4'],
      mapped_tests: ['TS-2', 'TS-10'],
      complexity_score: 'medium',
      estimated_loc: 80
    }
  },
  {
    sd_id: SD_UUID,
    prd_id: PRD_ID,
    title: 'As a chairman with in-flight CronGenius work, my manual edits are never clobbered by the cron watcher',
    description: 'SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001 is currently in PLAN_VERIFICATION with manual data I entered. The watcher detects this (metadata.auto_generated=false) and refuses to overwrite my work — writing a MANUAL_OVERRIDE_DETECTED row instead.',
    acceptance_criteria: ['Watcher checks metadata.auto_generated on existing downstream artifacts (AC-B3)', 'CronGenius records remain untouched on first watcher run', 'Snapshot regression test guarantees byte-identical structure (AC-2)'],
    priority: 'CRITICAL',
    status: 'pending',
    implementation_context: {
      sd_key: SD_KEY,
      mapped_frs: ['FR-A', 'FR-B'],
      mapped_acs: ['AC-2', 'AC-A3', 'AC-B3'],
      mapped_tests: ['TS-4', 'TS-6'],
      complexity_score: 'high',
      estimated_loc: 60
    }
  },
  {
    sd_id: SD_UUID,
    prd_id: PRD_ID,
    title: 'As an operator, the watcher runs reliably under external scheduling and provides absence-based liveness signal',
    description: 'I register `npm run cascade:watch:cron` with my Task Scheduler / cron. The watcher uses one-shot semantics so crashes self-recover at next tick. cascade_watcher_heartbeats table provides liveness signal — absence of recent heartbeat = stuck.',
    acceptance_criteria: ['One-shot script semantics; no daemon (AC-B1, TR-1)', 'Heartbeat row at start + update at end (AC-C5)', 'Exit codes encode health state', 'Operator runbook in scope-notes'],
    priority: 'HIGH',
    status: 'pending',
    implementation_context: {
      sd_key: SD_KEY,
      mapped_frs: ['FR-B', 'FR-C'],
      mapped_acs: ['AC-B1', 'AC-C5'],
      mapped_tests: ['TS-3', 'TS-5'],
      complexity_score: 'medium',
      estimated_loc: 70
    }
  },
  {
    sd_id: SD_UUID,
    prd_id: PRD_ID,
    title: 'As a future venture LEAD, the canonical pipeline is discoverable from package.json + library JSDoc',
    description: 'Per P-FAIL-3, the canonical pipeline (archplan-command, create-orchestrator-from-plan, /heal vision, vision-repair-loop) is invisible to new LEADs. This SD ships the minimum discoverability hooks (package.json entries, JSDoc PUBLIC LIBRARY block, one-line README) and defers full doc-fix to a separate QF (already filed).',
    acceptance_criteria: ['npm run cascade:status discoverable (AC-D1)', 'JSDoc PUBLIC LIBRARY ENTRY block at top of lib/eva/create-orchestrator-from-plan.js (AC-D2)', 'README +1 line pointer (AC-D3)'],
    priority: 'LOW',
    status: 'pending',
    implementation_context: {
      sd_key: SD_KEY,
      mapped_frs: ['FR-D'],
      mapped_acs: ['AC-D1', 'AC-D2', 'AC-D3'],
      mapped_tests: [],
      complexity_score: 'low',
      estimated_loc: 10
    }
  }
];

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Insert PRD
  const { data: prd, error: prdErr } = await supabase
    .from('product_requirements_v2')
    .upsert(PRD, { onConflict: 'id' })
    .select('id, status, sd_id, title')
    .single();

  if (prdErr) {
    console.error('PRD insert failed:', prdErr.message);
    process.exit(1);
  }
  console.log('PRD upserted:', prd.id, '| status:', prd.status, '| sd_id:', prd.sd_id);

  // Insert user stories
  for (const story of USER_STORIES) {
    const { data: us, error: usErr } = await supabase
      .from('user_stories')
      .insert(story)
      .select('id, title')
      .single();
    if (usErr) {
      console.error('User story insert failed:', usErr.message, '| title:', story.title);
      // Continue with others; mark non-fatal
      continue;
    }
    console.log('  US:', us.id, '|', us.title?.slice(0, 60));
  }

  console.log('\nDONE.');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
