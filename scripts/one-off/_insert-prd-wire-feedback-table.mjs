// One-off: insert PRD for SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 (LEAD-validated rescope, audit trail).
// Persists PRD JSON via supabase service role.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_UUID = 'd5f9ebbd-c6e8-4681-a7bf-a532ae4a5585';
const PRD_ID = 'PRD-SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001';

const functional_requirements = [
  {
    id: 'FR-1',
    title: 'Auto-resolve linked feedback row on QF completion (commit-message footer parse)',
    priority: 'HIGH',
    requirement: 'Add a NEW helper lib/governance/resolve-feedback.js exporting `resolveFeedback({ supabase, feedbackId, quickFixId, strategicDirectiveId, notes })`. Idempotent (UPDATE WHERE status != \'resolved\'). Sets status=\'resolved\', resolved_at=NOW(), and optionally feedback.quick_fix_id (FK column EXISTS — confirmed by risk-agent). Wire into scripts/modules/complete-quick-fix/orchestrator.js post-merge step. PARSE the merge commit message for footers `Closes feedback <uuid>` or `Closes harness backlog <uuid>` (case-insensitive, multi-line, multi-match). For each parsed UUID, call resolveFeedback() with quickFixId=qf.id and notes=`Shipped via QF-${qf.id} PR #${prNumber}`. NOTE: quick_fixes.metadata column DOES NOT EXIST (risk-agent confirmation) — commit-message footer parse is the ONLY viable link path. Fail-soft: ANY DB error in this path emits console.warn with full stack BUT does NOT throw / exitCode the QF completion (post-merge resolve is informational, not blocking). Env opt-out: RESOLVE_FEEDBACK_ON_QF_COMPLETE=0 disables the entire post-merge resolve step.',
    implementation_context: 'Files: lib/governance/resolve-feedback.js (NEW, ~30-50 LOC). scripts/modules/complete-quick-fix/orchestrator.js (~20-30 LOC delta in/around the post-merge step — locate after mergeToMain success branch). Tests: tests/unit/governance/resolve-feedback.test.js (NEW, ~70 LOC: idempotent skip, FK linkage, notes shape, no-row case). tests/unit/complete-quick-fix/footer-parse.test.js (NEW, ~60 LOC: parse single+multiple+missing+invalid-uuid footers, case-insensitivity).'
  },
  {
    id: 'FR-2',
    title: 'Auto-fill metadata.deferred_from_sd_key in emit-feedback.js from active claim',
    priority: 'HIGH',
    requirement: 'In lib/governance/emit-feedback.js::emitFeedback(), BEFORE the dedup-hash compute (around line 60), check whether `metadata.deferred_from_sd_key` is set. If NOT set, query the lib/session-identity-sot.js active-session helper (NOT raw lib/session-manager.mjs::getClaimedSessions which is fleet-wide — validation-agent recommendation). When the helper returns exactly ONE active session row, copy its `sd_key` into `metadata.deferred_from_sd_key`. Resolution order (explicit precedence): caller-supplied `metadata.deferred_from_sd_key` ALWAYS wins over auto-fill. Edge cases: (a) NO active claim → leave field unset (no failure); (b) MORE THAN ONE active claim for the same identity → leave field unset, emit single console.warn(`[emit-feedback] auto-fill skipped: ${n} active claims for current identity`); (c) DB error reading active session → leave field unset, emit single console.warn (do NOT fail emitFeedback — symmetry with PA-5 dual-write fallthrough at emit-feedback.js:128). Env opt-out: AUTO_FILL_DEFERRED_FROM_SD_KEY=0 disables auto-fill (caller-supplied metadata still flows through). Affects BOTH emitFeedback callers (scripts/log-harness-bug.js CLI + lib/eva/lifecycle-sd-bridge.js PA-5 capability suppression) without per-caller modification.',
    implementation_context: 'Files: lib/governance/emit-feedback.js (~25-40 LOC delta inserted around line 60, before dedup-hash compute). lib/session-identity-sot.js (READ ONLY, helper to call). Tests: tests/unit/governance/emit-feedback-auto-fill.test.js (NEW, ~120 LOC: active=1 fills, active=0 unset, active>1 unset+warn, explicit-precedence wins, env-opt-out, DB-error fail-soft). Verify lib/eva/lifecycle-sd-bridge.js does NOT pre-fill metadata.deferred_from_sd_key (validation-agent W#5).'
  },
  {
    id: 'FR-3',
    title: 'Static-guard regression pin: prevent 16th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 drift',
    priority: 'MEDIUM',
    requirement: 'Add a vitest static-guard test that scans scripts/modules/complete-quick-fix/orchestrator.js (read-as-string, no module load) and asserts: (a) `import { resolveFeedback }` (or equivalent destructured import) is present from a path ending in `lib/governance/resolve-feedback.js`, AND (b) at least one call site `resolveFeedback(` exists at module body level (not commented). The test exists to catch FUTURE drift where someone deletes the wire-in (regressing this SD\'s value) without adding a replacement. Independently, add a vitest test that scans lib/governance/emit-feedback.js for a literal `deferred_from_sd_key` reference (string regex), asserting the auto-fill code stays present. Both guards live in tests/unit/regression-pins/wire-feedback-table-pins.test.js. Per validation-agent recommendation #4 — closes the FR-1 / FR-2 surface against silent removal.',
    implementation_context: 'Files: tests/unit/regression-pins/wire-feedback-table-pins.test.js (NEW, ~40-60 LOC, no mocking — fs.readFileSync + regex). Reference pattern: scripts/modules/sd-next/data-loaders.js LEGACY_HARNESS_BACKLOG_FALLBACK is currently pinned in tests/unit/sd-next/harness-backlog-parser.test.js (read for shape).'
  }
];

const technical_requirements = [
  { id: 'TR-1', requirement: 'lib/governance/resolve-feedback.js MUST be idempotent — UPDATE WHERE status != \'resolved\' (do NOT skip the write entirely; the WHERE clause is the safety net). Re-run is expected (complete-quick-fix.js retries on intermittent merge failures); zero-row update logs at info level, not warn.' },
  { id: 'TR-2', requirement: 'Commit-message footer parse regex: case-insensitive `/^Closes (?:feedback|harness backlog) ([0-9a-f-]{36})$/gim` applied to merge commit message body (multiline). Validate parsed strings via UUID regex before passing to resolveFeedback() — discard malformed inputs with single console.warn.' },
  { id: 'TR-3', requirement: 'FR-2 MUST use lib/session-identity-sot.js (the single-source-of-truth wrapper) to resolve the current session, not direct queries against v_active_sessions or claude_sessions. Rationale: SOT layer enforces identity-drift gates added by SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001 (PR #3665).' },
  { id: 'TR-4', requirement: 'Both FR-1 and FR-2 paths MUST be wrapped in try/catch with console.warn on failure. NO throws, NO process.exit, NO altering exit codes from these paths. The QF completion / feedback emit must succeed even if the new auto-* behavior errors.' },
  { id: 'TR-5', requirement: 'Backfill of 204 historical rows lacking deferred_from_sd_key is OUT OF SCOPE — attribution archaeology is impossible. Document in PRD + JSDoc that FR-2 is forward-only.' }
];

const test_scenarios = [
  { id: 'T1', scenario: 'FR-1 unit: resolveFeedback({status=\'new\'}) → row updated (status=\'resolved\', resolved_at, quick_fix_id), returns {updated:true,id}', test_type: 'unit' },
  { id: 'T2', scenario: 'FR-1 unit: resolveFeedback({status=\'resolved\'}) → idempotent no-op, returns {updated:false,reason:\'already_resolved\'}, no error', test_type: 'unit' },
  { id: 'T3', scenario: 'FR-1 unit: resolveFeedback({nonexistent UUID}) → returns {updated:false,reason:\'no_row\'}, no error', test_type: 'unit' },
  { id: 'T4', scenario: 'FR-1 unit: footer-parser handles `Closes feedback <uuid>` AND `Closes harness backlog <uuid>` AND multiple footers in one commit; rejects malformed UUIDs', test_type: 'unit' },
  { id: 'T5', scenario: 'FR-1 integration: complete-quick-fix orchestrator with mock supabase + commit msg containing valid footer → resolveFeedback called with extracted UUID; QF completion proceeds even if resolveFeedback throws', test_type: 'integration' },
  { id: 'T6', scenario: 'FR-2 unit: emitFeedback with metadata.deferred_from_sd_key UNSET + 1 active claim → row inserted with auto-filled value matching active sd_key', test_type: 'unit' },
  { id: 'T7', scenario: 'FR-2 unit: emitFeedback with metadata.deferred_from_sd_key SET to \'SD-X\' + 1 active claim for \'SD-Y\' → row inserted with explicit value \'SD-X\' (caller wins, no auto-fill)', test_type: 'unit' },
  { id: 'T8', scenario: 'FR-2 unit: emitFeedback with 0 active claims → row inserted with metadata.deferred_from_sd_key UNSET (no failure)', test_type: 'unit' },
  { id: 'T9', scenario: 'FR-2 unit: emitFeedback with >1 active claims for same identity → row inserted UNSET, single console.warn captured matching `auto-fill skipped: \\d+ active claims`', test_type: 'unit' },
  { id: 'T10', scenario: 'FR-2 unit: emitFeedback when active-session helper throws → row inserted UNSET, single console.warn, emitFeedback returns {id,deduped:false} successfully', test_type: 'unit' },
  { id: 'T11', scenario: 'FR-2 unit: emitFeedback with AUTO_FILL_DEFERRED_FROM_SD_KEY=0 + 1 active claim → row inserted UNSET (env disable wins)', test_type: 'unit' },
  { id: 'T12', scenario: 'FR-1 unit: complete-quick-fix orchestrator with RESOLVE_FEEDBACK_ON_QF_COMPLETE=0 + valid footer → resolveFeedback NOT called (env disable wins)', test_type: 'unit' },
  { id: 'T13', scenario: 'Static guard: regression-pin scanning scripts/modules/complete-quick-fix/orchestrator.js for resolveFeedback import + invocation after merge step (prevent 16th-witness drift)', test_type: 'static-guard' },
  { id: 'T14', scenario: 'Smoke: log-harness-bug.js \"smoke test auto-fill\" while a claim is active → row has metadata.deferred_from_sd_key matching the active SD key', test_type: 'smoke' }
];

const acceptance_criteria = [
  'AC-1: lib/governance/resolve-feedback.js exports resolveFeedback({supabase, feedbackId, quickFixId, strategicDirectiveId, notes}) returning Promise<{updated:boolean, id?:string, reason?:string}>',
  'AC-2: scripts/modules/complete-quick-fix/orchestrator.js post-merge step parses commit message for `Closes (feedback|harness backlog) <uuid>` footers and calls resolveFeedback once per parsed UUID',
  'AC-3: AC-2 path is gated by env RESOLVE_FEEDBACK_ON_QF_COMPLETE !== \'0\' (default ON)',
  'AC-4: AC-2 path is wrapped in try/catch — DB errors warn but do NOT fail QF completion',
  'AC-5: lib/governance/emit-feedback.js auto-fills metadata.deferred_from_sd_key from lib/session-identity-sot.js active-session helper when caller did not set it AND exactly 1 active claim is found',
  'AC-6: AC-5 leaves field unset (with single console.warn) when 0 OR >1 active claims found',
  'AC-7: AC-5 is gated by env AUTO_FILL_DEFERRED_FROM_SD_KEY !== \'0\' (default ON)',
  'AC-8: AC-5 path errors do NOT throw to emitFeedback caller — best-effort enrichment',
  'AC-9: All 14 test_scenarios pass; pre-existing tests in tests/unit/governance/ and tests/unit/complete-quick-fix/ pass with zero regression',
  'AC-10: PRD explicitly documents that backfill of 204 historical harness_backlog rows lacking deferred_from_sd_key is OUT OF SCOPE (forward-only)',
  'AC-11: Static guard test (T13) PINs the resolveFeedback import + invocation in complete-quick-fix orchestrator',
  'AC-12: Self-validating ship: this SD\'s OWN merge commit MUST include `Closes feedback 6639e063-b269-4dd0-bfef-fabd8ef0fc09` footer (Gap #2 source feedback row), and after merge the row\'s status MUST be \'resolved\' with quick_fix_id (or sd_id) populated',
  'AC-13: After ship, the empirical fill rate of metadata.deferred_from_sd_key on NEW status=\'new\' harness_backlog rows shifts from 26% baseline to >80% within 7 days (verifiable via DB query)'
];

const risks = [
  { risk: 'getClaimedSessions returns >1 row (multi-claim under same identity, e.g. cascade-rolled state or parallel-session window) — wrong-attribution risk if FR-2 picks first', impact: 'medium', likelihood: 'medium', mitigation: 'FR-2 explicit: when count > 1, leave field UNSET + emit single console.warn. Do NOT pick first or aggregate. T9 enforces.' },
  { risk: 'commit-message footer parser false-positive on commits that mention `Closes feedback X` outside intended UUID format', impact: 'low', likelihood: 'low', mitigation: 'Strict UUID regex in TR-2; parser ignores non-matching strings. Idempotent-WHERE clause means false UUIDs simply update zero rows.' },
  { risk: 'resolveFeedback DB error during QF post-merge step blocks /ship completion', impact: 'high', likelihood: 'low', mitigation: 'TR-4 mandates try/catch + console.warn (no throw). T5 integration test verifies QF completion proceeds even when resolveFeedback throws.' },
  { risk: 'lib/eva/lifecycle-sd-bridge.js already pre-fills metadata.deferred_from_sd_key, conflicting with auto-fill in shared emit-feedback.js', impact: 'low', likelihood: 'low', mitigation: 'EXEC must grep lib/eva/lifecycle-sd-bridge.js for deferred_from_sd_key writes (validation-agent W#5). If found, document caller-precedence behavior in JSDoc.' },
  { risk: 'Active-session helper from lib/session-identity-sot.js does not exist or has different API than expected', impact: 'medium', likelihood: 'low', mitigation: 'EXEC step 0: read lib/session-identity-sot.js fully and confirm helper name + signature before writing FR-2 code. If helper is incompatible, fall back to lib/session-manager.mjs::getClaimedSessions filtered by identity (still safer than fleet-wide).' }
];

const plan_checklist = [
  { text: 'PRD created and saved', checked: true },
  { text: 'Sub-agent evidence (validation, risk) attached at LEAD', checked: true },
  { text: 'SD requirements mapped to 2 FRs after rescope (Gap #1 dropped)', checked: true },
  { text: 'Test scenarios cover happy path, idempotency, env-opt-outs, fail-soft, multi-claim edge', checked: true },
  { text: 'Acceptance criteria are testable and traceable', checked: true },
  { text: 'Risk mitigations explicit for each risk', checked: true },
  { text: 'Out-of-scope (backfill, Gap #1) explicitly documented', checked: true },
  { text: 'Schema gotchas (quick_fixes.metadata MISSING, feedback.quick_fix_id EXISTS) propagated to TR/FR', checked: true }
];

const exec_checklist = [
  { text: 'Read lib/session-identity-sot.js fully — confirm active-session helper API', checked: false },
  { text: 'Implement lib/governance/resolve-feedback.js with idempotent UPDATE', checked: false },
  { text: 'Wire resolveFeedback into scripts/modules/complete-quick-fix/orchestrator.js post-merge step + footer parser', checked: false },
  { text: 'Implement metadata.deferred_from_sd_key auto-fill in lib/governance/emit-feedback.js', checked: false },
  { text: 'Write unit tests (resolve-feedback.test.js + emit-feedback-auto-fill.test.js + footer-parse.test.js + static-guard)', checked: false },
  { text: 'Run full test suite (npm test) — verify zero regression in lib/governance, complete-quick-fix, lib/eva', checked: false }
];

const validation_checklist = [
  { text: 'AC-1 to AC-13 verified manually or via tests', checked: false },
  { text: 'Smoke test (T14) confirmed: log-harness-bug.js auto-fills deferred_from_sd_key', checked: false },
  { text: 'Self-validating: this PR\'s commit footer closes Gap #2 source feedback row 6639e063 + Gap #4 (no specific feedback row, but 14% baseline metric improves on next QF)', checked: false },
  { text: 'Sub-agent evidence captured for EXEC-TO-PLAN handoff (testing-agent + database-agent)', checked: false },
  { text: 'Static guard regression-pin pinned in CI', checked: false }
];

const system_architecture = `Two surgical wire-ins. NO new schema, NO new tables.

FR-1 (resolve-feedback.js NEW + complete-quick-fix orchestrator wire-in):
  [orchestrator.js post-merge] →parse commit msg→ ['Closes feedback <uuid>' UUIDs]
                                                  ↓
                                  resolveFeedback() per UUID (try/catch, fail-soft)
                                                  ↓
                                   UPDATE feedback SET status='resolved' WHERE id=:uuid AND status != 'resolved'

FR-2 (emit-feedback.js auto-fill):
  emitFeedback({metadata: {deferred_from_sd_key: undefined}})
                                  ↓
       lib/session-identity-sot.js active-session helper
                                  ↓
              count == 1 ? metadata.deferred_from_sd_key = sd_key : leave unset
                                  ↓
              SHA-256 dedup_hash + INSERT as before

Single canonical write path preserved (PA-5 invariant). Both auto-* paths are env-gated (RESOLVE_FEEDBACK_ON_QF_COMPLETE, AUTO_FILL_DEFERRED_FROM_SD_KEY). Both fail-soft (try/catch + console.warn).`;

const executive_summary = `Closes 15th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 across two writer/consumer pairs in the harness_backlog lifecycle. FR-1 wires complete-quick-fix.js to auto-resolve feedback rows when a QF\'s merge commit footer matches Closes (feedback|harness backlog) <uuid> (closes feedback 6639e063 source). FR-2 auto-fills metadata.deferred_from_sd_key on emit-feedback.js writes by querying the SOT active-session helper, raising fill-rate from 14% baseline (32/236 rows; 26% on status=\'new\').

Original Gap #1 (sd:next reads frozen markdown) DROPPED — QF-20260509-818 commit 30b156938d on origin/main already shipped LEGACY_HARNESS_BACKLOG_FALLBACK + _loadHarnessBacklogFromDB. Plan author tested against stale local tree.

Tier-3 SD, ~80-130 LOC across 2 source files (1 NEW, 2 modified) + ~250 LOC of new tests. Sub-agent evidence: validation-agent 655cb2af PASS@88, risk-agent 81ac5e04 PASS@88 MEDIUM. Schema gotchas (quick_fixes.metadata MISSING, feedback.quick_fix_id EXISTS) propagated to TR-1 + TR-2.`;

const prdRow = {
  id: PRD_ID,
  sd_id: SD_UUID,
  title: 'PRD: Wire feedback table for harness_backlog lifecycle (FR-1 auto-resolve + FR-2 auto-fill)',
  version: 'v1',
  status: 'planning',
  document_type: 'prd',
  executive_summary,
  functional_requirements,
  technical_requirements,
  test_scenarios,
  acceptance_criteria,
  risks,
  plan_checklist,
  exec_checklist,
  validation_checklist,
  system_architecture,
  implementation_approach: 'Two surgical wire-ins. Read lib/session-identity-sot.js first to confirm helper API. Add lib/governance/resolve-feedback.js NEW (idempotent UPDATE WHERE status != \'resolved\'). Wire into complete-quick-fix orchestrator post-merge step with footer parser. Edit lib/governance/emit-feedback.js to auto-fill metadata.deferred_from_sd_key from active-session helper. Both paths fail-soft and env-gated. Add 4 new test files. Verify zero regression in lib/governance, complete-quick-fix, lib/eva test suites.',
  metadata: {
    target_application: 'EHG_Engineer',
    validation_method: 'unit_tests',
    validation_mode: 'prospective',
    rescope_traceability: {
      original_gaps: ['Gap #1 (sd:next markdown reader)', 'Gap #2 (complete-quick-fix auto-resolve)', 'Gap #4 (emit-feedback auto-fill)'],
      dropped: ['Gap #1 — already shipped via QF-20260509-818 commit 30b156938d on origin/main'],
      retained: ['Gap #2 (FR-1)', 'Gap #4 (FR-2)']
    },
    sub_agent_evidence_lead: {
      validation_agent: '655cb2af-08ba-46f9-b387-dd8f7d5faaf7',
      risk_agent: '81ac5e04-e649-40f0-bc7d-84c39af9e8ae'
    },
    schema_gotchas: [
      'quick_fixes.metadata column DOES NOT EXIST → FR-1 must use commit-message footer parse',
      'feedback.quick_fix_id direct column EXISTS → use directly, not via metadata',
      'v_active_sessions.sd_key is the active-session helper field for FR-2',
      'validation_mode CHECK constraint on validation_results allows only prospective'
    ],
    estimated_loc: { source: '80-130', tests: '~250', total_diff: '~330-380' },
    closes_feedback: ['6639e063-b269-4dd0-bfef-fabd8ef0fc09']
  }
};

const { data, error } = await sb
  .from('product_requirements_v2')
  .upsert(prdRow, { onConflict: 'id' })
  .select('id, sd_id, status, document_type, title')
  .single();

if (error) {
  console.error('PRD upsert failed:', error);
  process.exit(1);
}

console.log('PRD upserted:', JSON.stringify(data, null, 2));
console.log('FR count:', functional_requirements.length);
console.log('TR count:', technical_requirements.length);
console.log('TS count:', test_scenarios.length);
console.log('AC count:', acceptance_criteria.length);
console.log('Risk count:', risks.length);
