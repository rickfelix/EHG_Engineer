// One-off: insert PRD for SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C
// Generated inline per CLAUDE_PLAN.md "PRD Creation — Inline Mode is the Default for Claude Code".
// Grounded in: validation-agent fa9db31f, risk-agent ca719680, testing-agent 6c3bf993, script-run DESIGN/DATABASE/RISK auto-PASS.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '6696db72-d1b1-4a07-8281-3bd7eb922251';
const SD_KEY = 'SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C';
const PRD_ID = `PRD-${SD_KEY}`;

const prd = {
  id: PRD_ID,
  sd_id: SD_ID,
  status: 'approved',
  title: 'PRD — Phase 3: EHG SDs as Work Surface alongside Todoist',

  executive_summary:
    'Extend EVA Support to surface open SDs and SD blockers alongside Todoist; emit-only chairman-approved /leo create recommendations with confidence + counterfactual; enforce no-write contract via 4 CI invariants.',

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Read-only SD reader (lib/eva-support/sd-reader.js) with column allowlist and status filter.',
      description: 'Module exposes a single function that queries strategic_directives_v2 with explicit SELECT columns (sd_key, title, status, current_phase, target_application, priority, progress) and WHERE status IN (draft, in_progress, active) AND target_application = chairman_context. Never SELECT *. Returns deterministic array. Module size <120 LOC.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'sd-reader.js exports getActiveSDs(context) and lists exactly the 7 allowlisted columns in its select clause (regex check in test).',
        'Filter uses lib/sd/active-sd-predicate.js — does NOT inline the predicate.',
        'Module contains zero imports from child_process / execa / spawn / cross-spawn / shelljs (verified by T1).',
        'Module does NOT import decision-log-store.write — only sd-recommendation-emitter writes log rows (boundary test T7).',
      ],
    },
    {
      id: 'FR-2',
      requirement: 'Cross-reference SD↔Todoist via column extension to eva_todoist_intake.target_aspects (no new table).',
      description: 'Add sd_refs[] array to existing JSONB column target_aspects. Each entry: { sd_id, source, confidence, evidence_substring, status }. Writes use jsonb_set(target_aspects, \'{sd_refs}\', new_value, create_missing=true) so existing target_aspects fields are preserved. Never auto-collapse multi-ref to a primary.',
      priority: 'HIGH',
      acceptance_criteria: [
        'Insert pattern uses jsonb_set with create_missing=true (no full-row replace).',
        'Each sd_refs entry includes evidence_substring (≥5 chars) and confidence (0-100); rows without evidence_substring fail validation.',
        'E2E test asserts that an intake row with 2+ sd_refs renders ALL of them in EVA reply — no auto-promote-to-primary.',
        'Schema check: eva_todoist_intake.target_aspects column exists and is JSONB (currently 304 rows; column already present per validation-agent fa9db31f).',
      ],
    },
    {
      id: 'FR-3',
      requirement: 'SD blocker surface (lib/eva-support/sd-blocker-surface.js) joining strategic_directives_v2 to sd_phase_handoffs.',
      description: 'Detects SDs whose latest handoff has status IN (rejected, blocked) OR whose dependency chain has incomplete predecessors. Emits a string per SD: "{sd_key}: {blocker_reason} (depends on {parent_sd_key})". Module size <150 LOC.',
      priority: 'HIGH',
      acceptance_criteria: [
        'Unit test seeds 3 SDs (1 blocked via rejected handoff, 1 blocked via incomplete dep, 1 unblocked) and asserts exactly 2 blocker strings returned.',
        'Module uses lib/sd/active-sd-predicate.js for the active-SD filter.',
        'No SELECT *; explicit column list per FR-1 pattern.',
      ],
    },
    {
      id: 'FR-4',
      requirement: 'Dispatcher-level middleware in .claude/commands/eva-support.md reply envelope (single change point, NOT per-sub-flow).',
      description: 'Extend scripts/eva-support/_internal/dispatcher.js with a post-handler hook (currently pass-through at line 31). Hook injects "Related SDs:" prefix block when sd-reader returns matches OR sd-blocker-surface returns blockers. Prefix block format: "Related SDs:\\n  {sd_key} | {status} | {progress}%\\n  Blocker: {reason}\\n". Six existing sub-flows unchanged.',
      priority: 'HIGH',
      acceptance_criteria: [
        'dispatcher.js diff modifies exactly one function (post-handler middleware); does NOT modify any sub-flow file.',
        'When sd-reader returns 0 matches AND sd-blocker-surface returns 0 blockers, the reply envelope contains ZERO "Related SDs:" prefix (no empty prefix block).',
        'Six sub-flow snapshot tests pass unchanged (regression guard).',
        'Substring-redundancy audit applied: "Related SDs:" prefix string is unique; no overlap with existing 6-flow output markers (per CLAUDE_PLAN.md "Substring-Redundancy Audit" guidance).',
      ],
    },
    {
      id: 'FR-5',
      requirement: 'SD recommendation emitter (lib/eva-support/sd-recommendation-emitter.js) — emit-only with chairman approval gate.',
      description: 'Outputs a copy-pasteable /leo create command preview + confidence score (0-100) + counterfactual reason NOT to create + top-3 dup-candidate sd_keys. Counterfactual semantics: if an existing SD covers ≥80% of the intent (via dup-candidate query), surface the existing sd_key and skip command emission. Writes eva_support_decision_log row (kind=sd_recommendation) BEFORE rendering — wrapped in try/finally so a render crash still leaves the audit trail.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'Emitter NEVER calls child_process, execa, spawn, or exec (verified by T1).',
        'Decision-log row is written BEFORE render output (verified by T6 call-order spy).',
        'If approve, chairman must provide override_reason ≥12 chars in a follow-up prompt; decision-log captures override_reason verbatim.',
        'If counterfactual applies (existing SD covers ≥80% intent), emitter outputs the existing sd_key + "skip" decision-log entry (kind=sd_recommendation, outcome=skipped_duplicate).',
        'Decline action is rendered with equal-or-greater prominence as Approve (UI inspection in code review).',
      ],
    },
    {
      id: 'FR-6',
      requirement: 'Shared lib/sd/active-sd-predicate.js + parity retrofit into lib/governance/resolve-feedback.js.',
      description: 'Single source of truth for the "active SD" definition: status IN (draft, in_progress, active) AND is_active = true AND archived_at IS NULL. Retrofit into resolve-feedback.js (lower blast than generate-retrospective.js per testing-agent recommendation). Parity test asserts identical row sets from both call sites.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'Predicate exports two helpers: getActiveSDFilter(supabaseQuery) → query builder, and isActiveSD(sdRow) → boolean.',
        'resolve-feedback.js imports getActiveSDFilter and replaces its inline filter (diff includes BOTH the old delete and the new import).',
        'Parity test seeds 10 SDs across all statuses + is_active states; both consumers MUST return identical {sd_key} sets.',
        'PR template/CODEOWNERS gating: any change to active-sd-predicate.js requires re-running parity test (CI-blocked).',
      ],
    },
    {
      id: 'FR-7',
      requirement: 'EVA_SD_READER_ENABLED feature flag with reader_disabled decision-log kind + runbook.',
      description: 'Env-var feature flag. When false: sd-reader returns [] and sd-blocker-surface returns []. Each invocation writes exactly one eva_support_decision_log row kind=reader_disabled (so the chairman can audit when the SD surface was off). Runbook section in .claude/commands/eva-support.md documents the 1-line revert (set EVA_SD_READER_ENABLED=false in .env).',
      priority: 'HIGH',
      acceptance_criteria: [
        'Flag default is unset → reader is DISABLED (fail-safe). Chairman must explicitly enable per session for first 30 days.',
        'Flag check happens in sd-reader.js and sd-blocker-surface.js (both gated).',
        'Test T5 asserts flag=false → returns [] + exactly 1 reader_disabled log row + ZERO .from(strategic_directives_v2) calls.',
        'Runbook section exists in eva-support.md with the verbatim 1-line revert command.',
      ],
    },
    {
      id: 'FR-8',
      requirement: 'Four invariant CI tests + CODEOWNERS for eva-support paths.',
      description: 'Tests live at tests/ci/ following the existing pattern (dashboard-quarantine-lint.test.js as template). T1: static-import ban on child_process/execa/spawn/cross-spawn/shelljs in scripts/eva-support/** + lib/eva-support/**. T2: supabase-write allowlist (only eva_support_decision_log, eva_todoist_intake, eva_support_research_cache); non-literal .from(var) = violation. T3: ESLint no-restricted-imports config rule in eslint.config.js. T7 (boundary): lib/eva-support/sd-reader.js cannot import lib/eva-support/decision-log-store.js write functions. CODEOWNERS gates PRs touching eva-support/**.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'tests/ci/eva-support-no-process-spawn-imports.test.js exists and PASSES (T1).',
        'tests/ci/eva-support-supabase-write-allowlist.test.js exists and PASSES (T2).',
        'tests/ci/eva-support-eslint-restricted-imports-config.test.js exists and PASSES; eslint.config.js contains the no-restricted-imports rule for eva-support/** (T3).',
        'tests/ci/eva-support-sd-reader-no-log-write-boundary.test.js exists and PASSES (T7).',
        'CODEOWNERS file lists scripts/eva-support/** and lib/eva-support/** with chairman as required reviewer.',
        'PR CI status: all 4 tests visible as required checks; PR cannot merge if any of T1/T2/T3/T7 fails.',
      ],
    },
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'Module size targets: sd-reader.js <120 LOC, sd-blocker-surface.js <150 LOC, sd-recommendation-emitter.js <200 LOC, active-sd-predicate.js <60 LOC.',
      rationale: 'Each module is single-responsibility; small modules limit blast radius for future RLS retrofits and audit. Component sizing sweet spot per CLAUDE_PLAN.md (300-600 LOC) only applies to UI components; backend modules should be tighter.',
    },
    {
      id: 'TR-2',
      requirement: 'No new database migrations. All work uses existing JSONB column extension (eva_todoist_intake.target_aspects) and existing tables (strategic_directives_v2, sd_phase_handoffs, eva_support_decision_log).',
      rationale: 'eva_support_decision_log exists (0 rows currently — Phase 2 just shipped and chairman value-proof was confirmed via Friday integration / direct query path, not via direct table reads). target_aspects is already JSONB (304 rows in eva_todoist_intake). Per script-run DATABASE sub-agent: "No database migrations needed for this SD" (evidence row a0e846be-ca77-4cac-8f9b-1f72427b5813).',
    },
    {
      id: 'TR-3',
      requirement: 'Vitest framework for invariant tests (matching tests/ci/* convention). No new test framework introduced.',
      rationale: 'Existing pattern: tests/ci/dashboard-quarantine-lint.test.js uses fs.walkFiles + regex + violations[] + throw with fix-hint (per testing-agent evidence 6c3bf993). Reuse the walker. Tests run via npm run test:unit which already executes tests/ci/* in CI.',
    },
    {
      id: 'TR-4',
      requirement: 'ESLint flat config (eslint.config.js) per-directory override for eva-support paths.',
      rationale: 'Existing eslint.config.js is already wired into npm run lint. No existing no-restricted-imports rule — clean slate. Add a per-directory override for scripts/eva-support/** and lib/eva-support/** that bans child_process/execa/spawn (T3 complements T1 for IDE-time + lint-time enforcement).',
    },
    {
      id: 'TR-5',
      requirement: 'Decision-log write semantics: ALWAYS before render; wrapped in try/finally so render failures still leave audit row.',
      rationale: 'R2 (rubber-stamping) mitigation depends on the audit trail being durable. If render crashes after the log write but before chairman sees the recommendation, the log still captures the recommendation attempt (kind=sd_recommendation, outcome=render_crashed). Tested via T6.',
    },
  ],

  system_architecture: {
    overview:
      'Three new backend modules in lib/eva-support/ (sd-reader, sd-blocker-surface, sd-recommendation-emitter) plus one shared predicate (lib/sd/active-sd-predicate.js). Dispatcher-level middleware in scripts/eva-support/_internal/dispatcher.js injects a "Related SDs:" prefix block into the existing 6-flow reply envelope. EVA never writes to strategic_directives_v2 — it emits a copy-pasteable /leo create command for the chairman to run manually. Every recommendation outcome is logged to eva_support_decision_log BEFORE render. A feature flag (EVA_SD_READER_ENABLED) provides a 60-second blast-cut. Four CI invariants (T1-T3 + T7) plus CODEOWNERS enforce the emit-only contract structurally.',
    components: [
      { name: 'lib/eva-support/sd-reader.js', responsibility: 'Read-only query of strategic_directives_v2 with column allowlist and status filter. Gated by EVA_SD_READER_ENABLED flag.', technology: 'Node.js, Supabase JS client, vitest' },
      { name: 'lib/eva-support/sd-blocker-surface.js', responsibility: 'Join strategic_directives_v2 with sd_phase_handoffs to detect blocked SDs; emit per-SD blocker reason strings.', technology: 'Node.js, Supabase JS client' },
      { name: 'lib/eva-support/sd-recommendation-emitter.js', responsibility: 'Emit copy-pasteable /leo create command + confidence + counterfactual; write decision-log row BEFORE render; never invoke /leo create directly.', technology: 'Node.js' },
      { name: 'lib/sd/active-sd-predicate.js', responsibility: 'Shared "active SD" filter — single source of truth. Used by sd-reader.js AND retrofitted into lib/governance/resolve-feedback.js. Parity test asserts identical row sets.', technology: 'Node.js (pure function)' },
      { name: 'scripts/eva-support/_internal/dispatcher.js (modification)', responsibility: 'Post-handler middleware injects "Related SDs:" prefix when matches/blockers exist. Single change point — six sub-flow files unchanged.', technology: 'Node.js' },
      { name: 'tests/ci/eva-support-*.test.js (4 new test files)', responsibility: 'T1 static-import ban, T2 supabase-write allowlist, T3 ESLint rule check, T7 boundary test. All run in CI via npm run test:unit.', technology: 'vitest, regex' },
      { name: 'eslint.config.js override + CODEOWNERS', responsibility: 'IDE+lint-time enforcement of import bans; chairman gating of PR reviews on eva-support paths.', technology: 'ESLint flat config, GitHub CODEOWNERS' },
    ],
    data_flow:
      '(1) Chairman invokes EVA Support in a Todoist context → 6-flow dispatcher runs as today. (2) Post-handler middleware calls sd-reader.getActiveSDs(context) and sd-blocker-surface.getBlockers() in parallel. (3) If either returns rows, middleware prepends "Related SDs:" block to the reply envelope. (4) If chairman asks "what should I build", sd-recommendation-emitter writes eva_support_decision_log row (kind=sd_recommendation) FIRST, then renders the /leo create command preview + confidence + counterfactual. (5) Chairman types Override: <reason ≥12 chars> to approve, or declines (a 2nd decision-log row captures the outcome). (6) Chairman manually copies the emitted command and runs it in a separate prompt — EVA never executes child_process. (7) If feature flag is OFF, sd-reader and sd-blocker-surface return [] and write one reader_disabled log row.',
    integration_points: [
      'strategic_directives_v2 (READ ONLY) — new reader consumes via allowlisted columns + active-sd-predicate.js.',
      'sd_phase_handoffs (READ ONLY) — joined for blocker detection.',
      'eva_todoist_intake.target_aspects (READ + JSONB write to sd_refs[] subkey only) — cross-ref storage via jsonb_set.',
      'eva_support_decision_log (WRITE) — every recommendation outcome logged BEFORE render.',
      'scripts/eva-support/_internal/dispatcher.js (MODIFY) — single post-handler middleware change.',
      '/leo create command (NO INVOCATION) — emitted as string; chairman runs manually.',
      'lib/governance/resolve-feedback.js (MODIFY) — retrofit to use active-sd-predicate (parity test).',
      'CI pipeline (npm run test:unit + npm run lint) — 4 invariant tests + ESLint rule.',
    ],
  },

  test_scenarios: [
    { id: 'TS-1', scenario: 'Happy path — chairman sees Related SDs in EVA reply', test_type: 'e2e', given: 'EVA_SD_READER_ENABLED=true; strategic_directives_v2 has 1 draft SD with title containing "Stripe integration"; chairman has a Todoist task titled "Tier 1 Launch Infra".', when: 'Chairman invokes EVA Support in the Todoist task context.', then: 'Reply envelope contains existing 6-flow content PLUS "Related SDs:" prefix listing the Stripe SD with sd_key, status=draft, progress=0%. Exactly one eva_support_decision_log row with kind=sd_recommendation written.' },
    { id: 'TS-2', scenario: 'Blocker surfacing — chairman asks "anything blocked?"', test_type: 'integration', given: 'EVA_SD_READER_ENABLED=true; 1 SD has a rejected LEAD-TO-PLAN handoff; 1 SD has incomplete dependency.', when: 'Chairman asks "anything blocked?" via EVA Support.', then: 'sd-blocker-surface returns exactly 2 blocker strings, each with sd_key + blocker_reason + parent_sd_key (if any). Reply envelope renders both in "Related SDs:" prefix.' },
    { id: 'TS-3', scenario: 'Recommendation emit-only with override approval', test_type: 'e2e', given: 'EVA_SD_READER_ENABLED=true; chairman asks "what should I build to unblock the Stripe SD".', when: 'EVA emits /leo create command preview + confidence=85 + counterfactual ("Existing SD-EHG-PAY-001 covers payment routing — verify it does not cover Stripe before creating new"). Chairman types "Override: I confirmed PAY-001 is for ACH not Stripe checkout".', then: 'Decision-log row written with outcome=approved, override_reason captured verbatim. EVA does NOT invoke /leo create (verified by zero child_process calls). Chairman copy-pastes the emitted command into a separate prompt to actually create the SD.' },
    { id: 'TS-4', scenario: 'Counterfactual skip — existing SD covers ≥80% intent', test_type: 'integration', given: 'Chairman asks for SD that semantically matches an existing one (e.g., asks for "Stripe checkout" when SD-EHG-PAY-002 with title "Stripe checkout integration" exists).', when: 'Emitter detects ≥80% intent match via dup-candidate query.', then: 'Emitter outputs existing sd_key WITHOUT a /leo create command. Decision-log row written with outcome=skipped_duplicate, dup_sd_key=SD-EHG-PAY-002. No new SD recommendation rendered.' },
    { id: 'TS-5', scenario: 'Feature flag OFF — silent disable + audit row', test_type: 'unit', given: 'EVA_SD_READER_ENABLED=false (or unset).', when: 'Chairman invokes EVA Support in any Todoist context.', then: 'sd-reader returns []. sd-blocker-surface returns []. Reply envelope contains the standard 6-flow content with ZERO "Related SDs:" prefix. Exactly one eva_support_decision_log row with kind=reader_disabled written. Zero .from(strategic_directives_v2) calls (verified by supabase spy).' },
    { id: 'TS-6', scenario: 'T1 invariant — static-import ban catches drift', test_type: 'unit', given: 'A developer adds `import { exec } from "child_process"` to lib/eva-support/sd-reader.js.', when: 'CI runs tests/ci/eva-support-no-process-spawn-imports.test.js.', then: 'Test FAILS with violation message naming the file + line + banned import. PR cannot merge.' },
    { id: 'TS-7', scenario: 'T2 invariant — supabase-write allowlist catches drift', test_type: 'unit', given: 'A developer adds `await supabase.from("strategic_directives_v2").update({...})` to lib/eva-support/sd-recommendation-emitter.js.', when: 'CI runs tests/ci/eva-support-supabase-write-allowlist.test.js.', then: 'Test FAILS naming the violating .from() call and the disallowed table. PR cannot merge.' },
    { id: 'TS-8', scenario: 'T7 boundary — sd-reader cannot write log', test_type: 'unit', given: 'A developer adds `import { writeLog } from "./decision-log-store.js"` to lib/eva-support/sd-reader.js.', when: 'CI runs tests/ci/eva-support-sd-reader-no-log-write-boundary.test.js.', then: 'Test FAILS — only sd-recommendation-emitter.js is allowed to import decision-log-store write functions.' },
    { id: 'TS-9', scenario: 'Parity test — active-sd-predicate consumers return identical row sets', test_type: 'integration', given: 'Seed strategic_directives_v2 with 10 rows spanning all status + is_active + archived_at states.', when: 'sd-reader.js queries via getActiveSDFilter AND lib/governance/resolve-feedback.js queries via getActiveSDFilter.', then: 'Both return identical {sd_key} sets. Test FAILS if either consumer inlines its own predicate (deviation).' },
    { id: 'TS-10', scenario: 'Decision-log written BEFORE render (T6 call-order)', test_type: 'unit', given: 'Mock decision-log.write (records timestamp T1) and mock render (records timestamp T2) on the emitter.', when: 'Call sd-recommendation-emitter.emit(intent).', then: 'Assert T1 < T2 (log written first). Crash test: throw inside render — log row still landed. Verifies the try/finally pattern.' },
    { id: 'TS-11', scenario: 'Render crash leaves audit trail (regression for R2)', test_type: 'integration', given: 'Inject render failure (mock throws).', when: 'Emitter called.', then: 'eva_support_decision_log row exists with kind=sd_recommendation, outcome=render_crashed, error_message captured.' },
  ],

  acceptance_criteria: [
    'All 8 FRs implemented with their listed acceptance criteria; PR description checks each one off explicitly.',
    'All 11 test scenarios (TS-1 through TS-11) pass in CI before EXEC-TO-PLAN handoff.',
    'Tests T1, T2, T3, T7 exist as named files in tests/ci/ and all pass (named files: eva-support-no-process-spawn-imports.test.js, eva-support-supabase-write-allowlist.test.js, eva-support-eslint-restricted-imports-config.test.js, eva-support-sd-reader-no-log-write-boundary.test.js).',
    'lib/sd/active-sd-predicate.js exists AND lib/governance/resolve-feedback.js imports it (verified by parity test TS-9).',
    'EVA_SD_READER_ENABLED defaults to UNSET (fail-safe disabled); enabled per session for first 30 days.',
    'CODEOWNERS file lists scripts/eva-support/** and lib/eva-support/** with chairman as required reviewer.',
    'Substring-redundancy audit applied to "Related SDs:" prefix injection — documented in PR description per CLAUDE_PLAN.md guidance.',
    'PRD smoke test steps (SD success_criteria) all manually verified by chairman in a single demo session.',
    'Decision-log table eva_support_decision_log shows row count > 0 with kind=sd_recommendation after first chairman use post-ship (validates Phase 2 carry-forward).',
    'Scope_reduction_percentage of 28% preserved — none of the 7 explicit deletions (no auto-creation, no child_process, no join table, etc.) reintroduced.',
  ],

  risks: [
    { risk: 'R1: EVA recommends an SD that should NOT be created (false positive)', probability: 'MEDIUM', impact: 'MEDIUM', mitigation: 'Confidence score 0-100 on every recommendation; top-3 dup-candidate links from leo-create-sd preflight; "REVIEW" label when confidence<70; Decline ≥ Approve prominence in UI.', rollback_plan: 'Chairman declines (writes outcome=declined row). If a bad SD is created from a recommendation, chairman archives it manually; recommendation_metadata on the SD links back to eva_invocation_id for retrospective.' },
    { risk: 'R2: Chairman rubber-stamps a bad recommendation (framing bias)', probability: 'MEDIUM', impact: 'HIGH', mitigation: '"Why NOT to create" counterfactual surfaced equally with approve; override_reason ≥12 chars required (friction); decision-log written BEFORE render captures both approve AND decline.', rollback_plan: 'Chairman archives the resulting SD and adds a feedback row referencing eva_invocation_id. Patterns of rubber-stamping flagged via post-launch decision-log analysis (recommendation precision metric).' },
    { risk: 'R3: RLS leak on new strategic_directives_v2 reader', probability: 'LOW', impact: 'MEDIUM', mitigation: 'Column allowlist (never SELECT *); status + target_application filter; single reader module = 1-file RLS retrofit point; DATABASE sub-agent review at PLAN (script-run evidence a0e846be).', rollback_plan: 'Set EVA_SD_READER_ENABLED=false (1-line .env change) — reader returns [] immediately. Patch RLS policy or column allowlist in sd-reader.js if leak surfaces.' },
    { risk: 'R4: EVA accidentally gains a write path in a future change (drift)', probability: 'MEDIUM', impact: 'CRITICAL', mitigation: '4 CI invariants (T1, T2, T3, T7) + CODEOWNERS gating PRs touching eva-support/**. All 4 must pass before EXEC-TO-PLAN.', rollback_plan: 'Revert the offending commit (CI test will block PR merge, so drift cannot reach main without explicitly disabling the test). If somehow merged, EVA_SD_READER_ENABLED=false killswitch cuts blast.' },
    { risk: 'R5: Cross-ref maps subtask to wrong SD (false correlation)', probability: 'MEDIUM', impact: 'MEDIUM', mitigation: 'sd_refs[] entries carry evidence_substring; UI shows evidence to chairman; chairman can set status=rejected; NEVER auto-collapse multi-ref to a primary (TS-4 e2e test).', rollback_plan: 'Chairman manually removes the bad sd_ref entry via Todoist intake edit; cross-ref accuracy metric tracked post-launch.' },
    { risk: 'R6: 8th writer/consumer asymmetry — new SD reader diverges from existing active-SD readers', probability: 'LOW', impact: 'MEDIUM', mitigation: 'Mandate lib/sd/active-sd-predicate.js shared by sd-reader.js AND retrofitted into resolve-feedback.js; parity test TS-9 asserts identical row sets.', rollback_plan: 'If a future change diverges, the parity test fails in CI; revert the offending commit. If both consumers diverge intentionally, document in active-sd-predicate.js with a follow-up SD.' },
    { risk: 'R7: No killswitch — cannot cut blast quickly', probability: 'LOW', impact: 'HIGH', mitigation: 'EVA_SD_READER_ENABLED env flag; when false, reader returns [] + writes reader_disabled log row. Runbook documents 1-line revert.', rollback_plan: 'Set EVA_SD_READER_ENABLED=false in .env, reload Claude Code session. ≤60 seconds to blast-cut.' },
    { risk: 'R8 (new): Phase 2 decision-log shows 0 rows despite value-proof — may indicate value is delivered via Friday integration path (eva_friday_outcomes) not via direct queries', probability: 'LOW', impact: 'LOW', mitigation: 'Phase 3 emitter writes to eva_support_decision_log unconditionally — populates the table organically. Post-launch retro can identify which Phase 2 path (decision-log vs Friday) was load-bearing for chairman value.', rollback_plan: 'No rollback needed; emitter writes are append-only.' },
  ],

  implementation_approach: {
    phases: [
      { phase: 'Phase 1: Foundation (shared predicate + retrofit)', description: 'Build lib/sd/active-sd-predicate.js with both helper exports. Retrofit lib/governance/resolve-feedback.js to use the new predicate. Write parity test TS-9. Land in a single PR with no other scope. ≤80 LOC.', deliverables: ['lib/sd/active-sd-predicate.js', 'lib/governance/resolve-feedback.js diff (small)', 'tests/ci/active-sd-predicate-parity.test.js (TS-9)'] },
      { phase: 'Phase 2: Reader + Blocker Surface (read-only)', description: 'Build lib/eva-support/sd-reader.js and lib/eva-support/sd-blocker-surface.js. Add EVA_SD_READER_ENABLED feature flag (default UNSET = disabled). Wire flag check into both modules. Write TS-2, TS-5 unit tests. ≤200 LOC total.', deliverables: ['lib/eva-support/sd-reader.js', 'lib/eva-support/sd-blocker-surface.js', 'flag handling + tests', 'TS-2 + TS-5 unit tests'] },
      { phase: 'Phase 3: Dispatcher Middleware (reply envelope extension)', description: 'Modify scripts/eva-support/_internal/dispatcher.js post-handler hook. Inject "Related SDs:" prefix when matches/blockers exist. Six sub-flow snapshot tests confirm regression-free. Substring-redundancy audit documented in PR description. ≤60 LOC diff.', deliverables: ['dispatcher.js diff (single hook)', '6 sub-flow snapshot tests passing', 'PR description with substring-redundancy audit'] },
      { phase: 'Phase 4: Recommendation Emitter (emit-only with audit)', description: 'Build lib/eva-support/sd-recommendation-emitter.js. Implement decision-log-before-render via try/finally. Add counterfactual semantics (skip if ≥80% intent match). Write TS-3, TS-4, TS-10, TS-11. ≤200 LOC.', deliverables: ['lib/eva-support/sd-recommendation-emitter.js', '4 unit tests (TS-3/4/10/11)'] },
      { phase: 'Phase 5: Invariant Tests + ESLint + CODEOWNERS', description: 'Write 4 CI invariant tests (T1, T2, T3, T7). Add eslint.config.js per-directory override with no-restricted-imports. Update CODEOWNERS. Confirm all 4 tests fail when expected drift is introduced (TDD-style negative test).', deliverables: ['4 test files in tests/ci/', 'eslint.config.js override', 'CODEOWNERS entry', 'TS-6, TS-7, TS-8 verified'] },
      { phase: 'Phase 6: Cross-ref (target_aspects.sd_refs[])', description: 'Implement jsonb_set merge for eva_todoist_intake.target_aspects.sd_refs[]. Each entry includes evidence_substring + confidence. No auto-promote-to-primary. E2E test TS-1 (chairman sees Related SDs from cross-ref).', deliverables: ['cross-ref write helpers in sd-reader or new lib/eva-support/sd-cross-ref-store.js', 'TS-1 e2e test'] },
      { phase: 'Phase 7: Runbook + Documentation', description: 'Add runbook section to .claude/commands/eva-support.md with 1-line revert command + flag explanation. Update CODEOWNERS notes. PR description checklist includes substring-redundancy audit reference.', deliverables: ['eva-support.md runbook section', 'CODEOWNERS notes', 'PR template checklist'] },
    ],
    technical_decisions: [
      'Reuse existing tests/ci/* walker pattern (dashboard-quarantine-lint.test.js as template) for T1, T2, T3, T7 invariants — no new test framework introduced.',
      'Retrofit lib/governance/resolve-feedback.js (NOT generate-retrospective.js) per testing-agent recommendation — lower blast radius, read-mostly, fewer writer paths.',
      'Dispatcher-level middleware (single change point in scripts/eva-support/_internal/dispatcher.js:31) — NOT per-sub-flow prefix logic. Confirmed structural defect avoided.',
      'Counterfactual semantics: ≥80% intent match → skip emission and surface existing sd_key. Threshold chosen to balance false negatives (skipping when fresh SD warranted) vs false positives (emitting duplicates).',
      'Feature flag default UNSET (fail-safe disabled) for first 30 days — chairman explicit per-session enable; matches "no auto-actioning" SD principle.',
      'Cross-ref via jsonb_set with create_missing=true — preserves existing target_aspects fields, avoids full-row replace race conditions.',
      'eva_support_decision_log emits use try/finally so render crash still leaves audit row (R2 mitigation hardened).',
    ],
  },

  integration_operationalization: {
    consumers: [
      { name: 'Chairman (Solo Entrepreneur, only human user)', interaction: 'Invokes EVA Support via Claude Code; reads "Related SDs:" prefix in reply envelope; copy-pastes /leo create commands manually when approving recommendations.', frequency: 'Daily to weekly during active product work; bursty during sprint planning.' },
      { name: 'EVA (AI Chief of Staff, internal)', interaction: 'Consumes sd-reader + sd-blocker-surface output to enrich 6-flow replies; calls sd-recommendation-emitter when chairman asks "what should I build to unblock X".', frequency: 'Per chairman invocation (sub-second).' },
      { name: 'Post-launch retro analyst (chairman + Claude Code)', interaction: 'Queries eva_support_decision_log to measure recommendation precision (target ≥70%) and cross-ref accuracy (target ≥80%).', frequency: 'Monthly post-launch.' },
    ],
    dependencies: [
      { name: 'strategic_directives_v2 (Supabase table)', type: 'upstream', contract: 'READ ONLY via lib/sd/active-sd-predicate.js. Column allowlist enforced. 3290 rows current; schema stable.', failure_handling: 'If query fails, sd-reader logs error and returns [] + writes a decision-log row kind=reader_error. EVA reply continues with 6-flow content sans "Related SDs:" prefix.' },
      { name: 'sd_phase_handoffs (Supabase table)', type: 'upstream', contract: 'READ ONLY for blocker detection join. 22921 rows current.', failure_handling: 'sd-blocker-surface returns [] on query failure; blocker surfacing degrades gracefully.' },
      { name: 'eva_todoist_intake.target_aspects (Supabase JSONB column)', type: 'upstream + downstream', contract: 'READ to fetch existing sd_refs[]; WRITE via jsonb_set(target_aspects, \'{sd_refs}\', ..., create_missing=true). Existing 304 rows; column is JSONB.', failure_handling: 'jsonb_set failures (e.g., concurrent write conflict) retried once; on second failure, sd-cross-ref-store logs to decision-log and returns false.' },
      { name: 'eva_support_decision_log (Supabase table)', type: 'downstream', contract: 'WRITE ONLY (insert) for kind ∈ {sd_recommendation, reader_disabled, reader_error}. Table is empty currently (Phase 2 just shipped; chairman value-proof was confirmed via Friday integration path).', failure_handling: 'Decision-log write failure is BLOCKING — emitter throws and chairman sees an error. We choose to fail loud rather than render a recommendation without an audit row (R2 mitigation requires the row).' },
      { name: '/leo create command (chairman-invoked external tool)', type: 'downstream', contract: 'EVA EMITS the command as a string; chairman runs it manually. EVA NEVER executes child_process to invoke /leo create.', failure_handling: 'If chairman never copies the command, decision-log row stays as outcome=approved_not_executed. Post-launch metric tracks gap between approve and actual SD creation.' },
      { name: 'lib/governance/resolve-feedback.js (retrofit target)', type: 'upstream', contract: 'MODIFY to import lib/sd/active-sd-predicate.js. Parity test ensures behavior unchanged for that consumer.', failure_handling: 'Parity test failure blocks PR merge; revert the retrofit if behavior diverges.' },
    ],
    data_contracts: [
      { contract_name: 'sd_refs[] entry shape (eva_todoist_intake.target_aspects.sd_refs)', schema: '{ sd_id: string (UUID), source: "eva_cross_ref" | "chairman_manual", confidence: number 0-100, evidence_substring: string min 5 chars, status?: "active" | "rejected" }', validation: 'Pre-write validation in sd-cross-ref-store: required fields present, evidence_substring ≥5 chars, confidence in [0, 100].', versioning: 'No schema_version field needed — column-extension is forward-compatible; existing entries without status default to "active".' },
      { contract_name: 'eva_support_decision_log row (kind=sd_recommendation)', schema: '{ kind: "sd_recommendation", eva_invocation_id: UUID, intent_text: string, recommended_sd_key: string OR existing_sd_key, confidence: number 0-100, counterfactual: string, outcome: "approved" | "declined" | "skipped_duplicate" | "render_crashed", override_reason?: string ≥12 chars, error_message?: string }', validation: 'Server-side: outcome enum check; if outcome=approved, override_reason MUST be present and ≥12 chars.', versioning: 'kind enum is forward-extensible; new kinds can be added without breaking readers.' },
      { contract_name: 'eva_support_decision_log row (kind=reader_disabled)', schema: '{ kind: "reader_disabled", eva_invocation_id: UUID, flag_value: "false" | "unset", invoked_at: ISO timestamp }', validation: 'One row per EVA invocation when flag is off.', versioning: 'Stable; covers fail-safe disabled state and explicit-disable.' },
      { contract_name: 'sd-reader output (Active SD row)', schema: '{ sd_key: string, title: string, status: "draft" | "in_progress" | "active", current_phase: string | null, target_application: "EHG" | "EHG_Engineer", priority: "critical" | "high" | "medium" | "low", progress: number 0-100 }', validation: 'Column allowlist enforced at query construction; ANY other column accessed = T2 violation candidate.', versioning: 'Adding columns to the allowlist requires PRD amendment (CODEOWNERS gating); removing columns is backward-incompatible.' },
      { contract_name: 'sd-blocker-surface output (Blocker)', schema: '{ sd_key: string, blocker_reason: string, parent_sd_key: string | null, latest_handoff_status: string }', validation: 'Returned rows MUST have non-null blocker_reason (≥10 chars).', versioning: 'Adding blocker_type enum field is forward-compatible.' },
    ],
    runtime_config: {
      environment_variables: [
        'EVA_SD_READER_ENABLED — string ("true"|"false") or UNSET. Default UNSET = disabled (fail-safe). For first 30 days post-ship, chairman explicitly sets per session.',
        'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — existing, used by sd-reader and sd-blocker-surface via createSupabaseServiceClient helper.',
      ],
      feature_flags: [
        'EVA_SD_READER_ENABLED — controls both sd-reader.js and sd-blocker-surface.js. When false, both return [] and write one reader_disabled decision-log row per invocation.',
        'No second feature flag for cross-ref or emitter — they are downstream of the reader; disabling the reader implicitly disables them.',
      ],
      deployment_considerations: 'EHG_Engineer-only deployment. No new migrations (existing tables sufficient). No env-var rotation needed. PR description must include the runbook 1-line revert command verbatim. CODEOWNERS gates PR merge on eva-support paths. Phase 1 (predicate + retrofit) ships first as a tiny PR (≤80 LOC); subsequent phases ship in size-targeted PRs ≤200 LOC each.',
    },
    observability_rollout: {
      monitoring: [
        'eva_support_decision_log row counts by kind (sd_recommendation, reader_disabled, reader_error) — daily query post-launch.',
        'Recommendation precision: count(outcome=approved) / count(outcome IN (approved, declined, skipped_duplicate)) — target ≥70% within 30 days.',
        'Cross-ref accuracy: chairman-sampled status=rejected rate on sd_refs[] entries — target ≤20%.',
        'Time-to-blast-cut: simulate by setting EVA_SD_READER_ENABLED=false and timing reader_disabled log row creation — target ≤60s.',
        'CI status: T1, T2, T3, T7 pass/fail rates over time (should be 100% pass; any fail = drift signal).',
      ],
      alerts: [
        'eva_support_decision_log row count grows abnormally fast (>50/day) → potential rubber-stamping pattern, chairman review.',
        'count(outcome=approved_not_executed) / count(outcome=approved) > 30% → recommendations approved but never run; investigate UX friction.',
        'Any T1/T2/T3/T7 test fails on main branch → drift detected; chairman immediate review.',
        'sd_refs[] entries with status=rejected > 20% over 30-day window → cross-ref accuracy below target; tune confidence threshold.',
      ],
      rollout_strategy: 'Phased rollout via PR sequence (7 phases per implementation_approach). Phase 1 (predicate+retrofit) deploys first; all subsequent phases gated on Phase 1 parity test passing. Chairman enables EVA_SD_READER_ENABLED=true per session for first 30 days. After 30 days, evaluate setting default to enabled based on recommendation precision metric.',
      rollback_trigger: 'ANY of: (a) chairman observes a bad recommendation acted on; (b) T1/T2/T3/T7 test fails post-merge; (c) RLS leak detected (R3); (d) eva_support_decision_log write failures spike.',
      rollback_procedure: 'Immediate (≤60s): Set EVA_SD_READER_ENABLED=false in .env and reload Claude Code session. sd-reader returns [] immediately; "Related SDs:" prefix disappears from reply envelope; reader_disabled audit row confirms killswitch engaged. Post-mortem: chairman reviews decision-log rows from the affected window, archives any erroneous SDs created, files follow-up SD for the root cause.',
    },
  },

  exploration_summary: {
    files_read: [
      'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.claude/commands/eva-support.md (existing 6-flow command surface — Phase 1)',
      'C:/Users/rickf/Projects/_EHG/EHG_Engineer/scripts/eva-support/_internal/dispatcher.js (line 31 — single pass-through hook point, confirmed by testing-agent 6c3bf993)',
      'C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/eva-support/decision-log-store.js (Phase 2 write surface — to be consumed by sd-recommendation-emitter)',
      'C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/eva-support/research-cache.js (Phase 2 — pattern reference)',
      'C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/eva-support/friday-outcome-bridge.js (Phase 2 — confirms Friday integration is the value-proof path)',
      'C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/governance/resolve-feedback.js (retrofit target for active-sd-predicate)',
      'C:/Users/rickf/Projects/_EHG/EHG_Engineer/tests/ci/dashboard-quarantine-lint.test.js (walker pattern template for T1/T2/T7)',
      'C:/Users/rickf/Projects/_EHG/EHG_Engineer/tests/ci/audit-log-parity-check.test.js (parity test template for TS-9)',
      'C:/Users/rickf/Projects/_EHG/EHG_Engineer/eslint.config.js (T3 destination for no-restricted-imports rule)',
      'Live table metadata: eva_support_decision_log (0 rows), eva_support_research_cache (0 rows), eva_todoist_intake (304 rows), strategic_directives_v2 (3290 rows), sd_phase_handoffs (22921 rows).',
    ],
    patterns_identified: [
      'tests/ci/* walker pattern: fs.walkFiles + regex + violations[] + throw with fix-hint — reused for T1, T2, T3, T7.',
      'Phase 2 decision-log envelope: Override token contract carries forward to Phase 3 recommendation approval (override_reason ≥12 chars).',
      'eva_todoist_intake.target_aspects JSONB column-extension pattern: validation-agent confirmed 304 rows already use the column; safe to extend with sd_refs[] without migration.',
      'Writer/consumer asymmetry (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 — 7 prior witnesses) — preempted by mandating shared lib/sd/active-sd-predicate.js with parity test.',
      'Backend-only diff → DESIGN sub-agent correctly skips UI checks (script-run DESIGN verdict PASS evidence 2ebfbd8a).',
      'Phase 2 0-row decision-log indicates value-proof was delivered via Friday integration path (eva_friday_outcomes), not direct decision_log queries — Phase 3 emitter will populate the table organically (R8 risk noted).',
    ],
    key_decisions: [
      'Retrofit resolve-feedback.js (not generate-retrospective.js) per testing-agent — lower blast radius.',
      'Dispatcher-level middleware (1 change point) instead of per-sub-flow prefix logic (6 change points) — addresses MEDIUM structural defect.',
      'Add T7 boundary test (sd-reader cannot import decision-log-store write) — addresses MEDIUM structural defect from testing-agent.',
      'Feature flag default UNSET (fail-safe disabled) for first 30 days — matches "no auto-actioning" SD principle and gives chairman explicit opt-in.',
      'Counterfactual threshold: ≥80% intent match → skip emission and surface existing sd_key. Documented threshold rationale in technical_decisions.',
      'No new tables, no new migrations — column-extension + emit-only contract avoid schema risk.',
      'eva_support_decision_log write failure is BLOCKING (fail loud) — R2 mitigation requires the audit row to exist before render.',
    ],
    exploration_date: '2026-05-27T10:00:00Z',
  },

  // Metadata
  metadata: {
    target_application: 'EHG_Engineer',
    inline_mode_used: true,
    sub_agent_evidence: {
      validation: { row_id: 'fa9db31f-aba3-4467-afe4-819a5e2fef3c', verdict: 'PASS', confidence: 92 },
      risk_deep: { row_id: 'ca719680-ca0f-47af-929f-f31f52b728d7', verdict: 'CONDITIONAL_PASS', confidence: 88 },
      testing_prospective: { row_id: '6c3bf993-b12e-424a-9d68-40cd1cfb44fb', verdict: 'CONDITIONAL_PASS', confidence: 90 },
      design_script: { sub_agent_id: '2ebfbd8a-5aa0-4907-bb47-33a2dd04254f', verdict: 'PASS', confidence: 90, note: 'backend_only_diff' },
      database_script: { sub_agent_id: 'a0e846be-ca77-4cac-8f9b-1f72427b5813', verdict: 'PASS', confidence: 100, note: 'no migrations needed' },
      risk_script: { sub_agent_id: 'c1891c65-5fb1-4c25-9030-02fe1bf11526', verdict: 'PASS', confidence: 85, note: 'overall_risk_score 2.17 (LOW)' },
    },
    approval_conditions_from_lead: [
      'PRD enumerates NFR-R1..NFR-R7 + NFR-AUDIT as explicit acceptance criteria with failing-test names — SATISFIED via FR-1..FR-8 + acceptance_criteria.',
      'DATABASE sub-agent review of new strategic_directives_v2 reader path — script-run DATABASE PASS; deep RLS review still scheduled (task #11).',
      '3 CI tests (T1, T2, T3) MUST pass before EXEC handoff — SATISFIED via FR-8 + acceptance_criteria.',
      'lib/sd/active-sd-predicate.js shared with ≥1 existing consumer — SATISFIED via FR-6 (retrofit into resolve-feedback.js per testing-agent recommendation).',
      'Feature flag EVA_SD_READER_ENABLED with runbook — SATISFIED via FR-7.',
      'Decision-log row written BEFORE render — SATISFIED via FR-5 + TS-10 + TS-11.',
      'Cross-ref defaults to column-extension — SATISFIED via FR-2.',
      'Chairman-approval-for-SD-creation safeguard spec\'d explicitly — SATISFIED via FR-5 acceptance criteria (override_reason ≥12 chars required for approve).',
    ],
    testing_agent_conditions_addressed: {
      condition_1: 'Acceptance criteria include 6 failing-test names verbatim (T1–T6) → 6 names embedded in FR-8 + TS-6/7/8/9/10/11. T6 (call-ordering) is implicit in FR-5 + TS-10.',
      condition_2: 'Dispatcher-level middleware specified for reply-envelope prefix → FR-4.',
      condition_3: 'Retrofit consumer named as lib/governance/resolve-feedback.js → FR-6.',
      condition_4: '4th invariant added: sd-reader.js cannot import decision-log-store.write → FR-8 + TS-8 (T7 boundary).',
      condition_5: 'Counterfactual semantics defined + sd_refs[] jsonb merge semantics → FR-5 description + FR-2 description.',
    },
  },

  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Insert PRD
const { error: insErr } = await supabase
  .from('product_requirements_v2')
  .upsert(prd, { onConflict: 'id' });

if (insErr) {
  console.error('UPSERT FAILED:', insErr.message);
  process.exit(1);
}

// Verify
const { data: verify } = await supabase
  .from('product_requirements_v2')
  .select('id, sd_id, status, title, functional_requirements, test_scenarios, risks')
  .eq('id', PRD_ID).single();

console.log('=== PRD CREATED ===');
console.log('id:', verify.id);
console.log('sd_id:', verify.sd_id);
console.log('status:', verify.status);
console.log('title:', verify.title);
console.log('functional_requirements:', verify.functional_requirements?.length || 0);
console.log('test_scenarios:', verify.test_scenarios?.length || 0);
console.log('risks:', verify.risks?.length || 0);
