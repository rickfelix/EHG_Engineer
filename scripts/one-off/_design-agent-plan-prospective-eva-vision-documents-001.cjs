#!/usr/bin/env node
/**
 * Write design-agent PLAN-prospective evidence row for
 * SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001.
 *
 * Backend infrastructure SD: NO UI/UX surface. Design review focuses on code
 * architecture, module export hygiene, helper testability, and test design —
 * NOT WCAG/visual concerns.
 *
 * Source under review (uncommitted in worktree):
 *   - scripts/eva/vision-scorer.js (added _emitQualityCheckWarningIfNeeded
 *     helper + extended SELECTs to include quality_checked/quality_issues +
 *     extended return shape with qualityChecked/qualityIssues)
 *   - scripts/eva/vision-scorer.test.js (added FR-1/FR-2 SELECT projection
 *     regression-pin static-string tests + 6 behavior tests for the helper)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SD_UUID = 'be5d6fbf-571a-47a6-86e6-acc3dba9e044';
const SD_KEY = 'SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001';
const PRD_ID = 'PRD-SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001';
const SESSION_ID = '2f6fc904-7ef4-4260-b4e2-2f5017b223a9';

const detailedAnalysis = {
  scope: {
    sd_type: 'infrastructure',
    surface: 'backend tooling (Node CLI + lib module)',
    ui_surface: false,
    wcag_applicable: false,
    visual_review_applicable: false,
    review_focus: 'code architecture, module hygiene, helper testability, test design',
    files_under_review: [
      'scripts/eva/vision-scorer.js (modified — +helper, +SELECT cols, +return shape)',
      'scripts/eva/vision-scorer.test.js (modified — +8 new test cases)',
    ],
    estimated_loc_delta_src: 58,
    estimated_loc_delta_test: 99,
    pr_size_tier: 'Tier 2 (31-75 src LOC; full SD scope incl test)',
  },
  code_architecture: {
    separation_of_concerns: {
      verdict: 'CLEAN',
      detail: 'Helper _emitQualityCheckWarningIfNeeded does ONE thing (decide-and-emit warning). scoreSD() orchestrates; helper is pure-function with injected logger. Loaders (loadVisionDimensions, loadArchDimensions) extended to surface qualityChecked/qualityIssues additively, no behavior shift.',
    },
    single_responsibility: {
      verdict: 'PASS',
      detail: 'Helper: 1 responsibility (warn-or-not). Loaders: 1 responsibility each (fetch one row from one table). scoreSD: orchestrates. No god-functions introduced.',
    },
    pure_function_design: {
      verdict: 'PASS',
      detail: 'Helper is stateless. No module-level dedup state (would leak across invocations). Per-invocation single-emission via single boolean check. Idempotent — calling it twice with same args produces same result.',
    },
    dependency_injection: {
      verdict: 'PASS',
      detail: 'Logger injected with default `console`. Tests use vi.fn() spies via {warn: vi.fn()}. No need to mock global console. Standard JS DI pattern.',
    },
    api_shape_decisions: {
      verdict: 'PASS',
      detail: 'Loader return shape extended additively: {id, dimensions} → {id, dimensions, qualityChecked, qualityIssues}. Existing caller scoreSD reads {id, dimensions} unchanged. Caller-stability preserved. PRD TR-4 ratifies the additive superset.',
    },
  },
  module_export_hygiene: {
    helper_export: {
      verdict: 'PASS',
      detail: 'Exported alongside resolveDefaultKeysFromSD, tierKeysFromSDKey, DEFAULT_VISION_KEY, DEFAULT_ARCH_KEY. Leading-underscore name signals "internal API for testing" — convention used by ~12 lib/ files in repo.',
    },
    consumer_coupling: {
      verdict: 'PASS',
      detail: 'Test imports the named export directly. No coupling to internal scoreSD implementation. Helper can be unit-tested in isolation without spinning the full pipeline (loadVisionDimensions, loadArchDimensions, LLM client, etc.).',
    },
    no_default_export_drift: {
      verdict: 'PASS',
      detail: 'File uses ESM named exports throughout. Consistent with repo convention (lib/eva/* and scripts/eva/* use named exports).',
    },
  },
  documentation_quality: {
    jsdoc_coverage: {
      verdict: 'PASS',
      detail: 'Helper has full JSDoc (5 lines): purpose paragraph, @param × 4, @returns. Comment block above helper explains FR-3 + FR-4 scope and why audit_log/event-bus emit are intentionally absent.',
    },
    sd_key_grep_anchors: {
      verdict: 'PASS',
      detail: 'Three call-sites carry SD-key prefix in comments: loadVisionDimensions (FR-1), loadArchDimensions (FR-2), and the scoreSD call-site (FR-3 + FR-4). Future grep for "SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001" surfaces all change-points. Consistent with repo convention.',
    },
    intent_communicated: {
      verdict: 'PASS',
      detail: 'Comments explain "why" (operator-CLI only, no audit_log, no enforcement, no skip), not just "what". Aligns with FR-3 PRD requirement and prevents future readers from upgrading to audit_log without a separate SD.',
    },
  },
  test_design: {
    coverage_of_frs: {
      verdict: 'PASS',
      detail: '8 new tests cover FR-1 (SELECT projection vision), FR-2 (SELECT projection arch), FR-3 (warn emission, dedup, message format), FR-4 (qc=true suppression). Edge cases: null/undefined sdKey, empty string sdKey, asymmetric qc combinations.',
    },
    static_string_regression_pin: {
      verdict: 'EXEMPLARY',
      detail: 'FR-1/FR-2 tests read source file directly and regex-match the .from(\'eva_vision_documents\').select(\'…\') projection literal. Mocking-independent — would catch a future refactor that silently drops quality_checked from the SELECT. This is the "static guard" pattern proven in QF-20260509-699 (PAT-EXEC-SYNC-STDERR-LEAK-IN-CATCH-001 closure).',
    },
    behavior_tests: {
      verdict: 'PASS',
      detail: '6 behavior tests use injected logger spy via vi.fn(). Tests are fast, deterministic, no I/O. Each test asserts both the boolean return AND the spy call shape (count + message contents).',
    },
    test_isolation: {
      verdict: 'PASS',
      detail: 'Each test creates fresh logger via makeLogger() factory. No shared state between tests. Test for "ONCE not twice" pin asserts toHaveBeenCalledTimes(1), preventing future regression where dedup invariant breaks.',
    },
    fixture_design: {
      verdict: 'PASS',
      detail: 'fakeSupabase factory pattern reused from existing resolveDefaultKeysFromSD tests. Consistent with file conventions. No new mocking machinery introduced.',
    },
  },
  anti_patterns_verified_absent: [
    {
      anti_pattern: 'Module-level state for dedup (would leak across scoreSD invocations)',
      status: 'ABSENT',
      evidence: 'Helper is stateless; per-invocation single-emission via single if/return boolean check inside scoreSD',
    },
    {
      anti_pattern: 'console.warn directly inside scoreSD (untestable)',
      status: 'ABSENT',
      evidence: 'Helper extracted; logger injectable; default console fallback for production CLI',
    },
    {
      anti_pattern: 'Hard-coded sd_key in warning message',
      status: 'ABSENT',
      evidence: 'sdKey passed as param; falls back to "unknown" string when null/empty (FR-3 spec)',
    },
    {
      anti_pattern: 'Coupling between FR-1 (vision SELECT) and FR-3 (warn)',
      status: 'ABSENT',
      evidence: 'FR-1 and FR-2 are SELECT-projection extensions; FR-3/FR-4 is helper + call-site. Symmetric, independent. Either could ship without the other.',
    },
    {
      anti_pattern: 'Eager event-bus / audit_log emit (out-of-scope per LEAD narrowing)',
      status: 'ABSENT',
      evidence: 'No publishVisionEvent or audit_log INSERT in the warn helper. Comment block explicitly notes deferral to a separate SD if witnessed. PRD scope-lock honored.',
    },
    {
      anti_pattern: 'Behavior change in scoreSD when qc=true (silent path mutation)',
      status: 'ABSENT',
      evidence: 'Helper returns false and emits nothing when both qc=true. scoreSD continues unchanged. Read-only observability, no enforcement, no skip.',
    },
  ],
  loc_sweet_spot: {
    vision_scorer_js_pre: 845,
    vision_scorer_js_post: 903,
    delta: 58,
    band_classification: 'Already over the 600 LOC upper limit pre-change; post-change 903 LOC. NOT in optimal band.',
    mitigation: 'File is a CLI orchestrator with three modes (standard, inline, persist) + 4 helpers. Splitting would require an extraction SD of its own (out of scope for this SD which is narrowly observational). The 58-LOC delta is small and additive — does NOT worsen complexity proportionally.',
    recommendation_deferred: 'A future Tier-3 refactor SD could split scripts/eva/vision-scorer.js into: (a) loaders module, (b) scoring orchestrator, (c) CLI entry. NOT a blocker for the current SD.',
    blocker: false,
  },
  edge_cases_covered: [
    'sdKey=null → "sd_key=unknown" in warn message',
    'sdKey="" (empty string) → "sd_key=unknown" in warn message',
    'visionQc=null + archQc=null (unknown / fresh row from migration) → no warn',
    'visionQc=undefined + archQc=undefined (column absent) → no warn',
    'visionQc=null + archQc=true → no warn (one unknown, one good)',
    'visionQc=false + archQc=true → 1 warn',
    'visionQc=true + archQc=false → 1 warn',
    'visionQc=false + archQc=false → 1 warn (NOT 2 — dedup invariant)',
    'visionQc=true + archQc=true → no warn',
  ],
  prd_alignment: {
    prd_id: PRD_ID,
    fr_to_implementation_mapping: [
      { fr: 'FR-1', implementation: 'loadVisionDimensions SELECT extended with quality_checked + quality_issues', verdict: 'IMPLEMENTED' },
      { fr: 'FR-2', implementation: 'loadArchDimensions SELECT extended (symmetric to FR-1)', verdict: 'IMPLEMENTED' },
      { fr: 'FR-3', implementation: '_emitQualityCheckWarningIfNeeded helper called from scoreSD with both visionResult.qualityChecked and archResult.qualityChecked', verdict: 'IMPLEMENTED' },
      { fr: 'FR-4', implementation: 'Helper returns false (no warn) when both qc are non-false', verdict: 'IMPLEMENTED' },
    ],
    tr_4_additive_return_shape: {
      verdict: 'RATIFIED',
      detail: 'PRD TR-4 ratifies the additive {id, dimensions, qualityChecked, qualityIssues} return shape. Existing scoreSD reads {id, dimensions} unchanged.',
    },
    scope_lock_honored: true,
  },
  recommendations: {
    must_have: [],
    should_have: [],
    nice_to_have: [
      'Consider adding a smoke-test that runs scoreSD against a real eva_vision_documents row with qc=false and asserts the warn fires once (integration test, deferred — unit tests already cover the contract).',
      'A future SD could enrich the warn message with quality_issues content (e.g., issue codes) to give operators actionable detail beyond just "qc=false". Out of scope for current SD per LEAD narrowing.',
    ],
  },
  verdict_rationale: {
    pass_factors: [
      'Helper is pure, stateless, single-responsibility, with injected logger — exemplary backend testability',
      'Static-string regression-pin tests would catch future refactors that silently drop quality_checked from the SELECT projection (proven QF-20260509-699 pattern)',
      'Additive return-shape change preserves caller stability (PRD TR-4 ratifies)',
      'JSDoc + SD-key grep anchors aligned with repo conventions',
      '6 anti-patterns explicitly verified absent (module-level state, hardcoded sd_key, FR coupling, eager event-bus emit, etc.)',
      '9 edge cases covered in tests (null/undefined/empty/asymmetric qc combinations)',
      'PRD FR-1..FR-4 implementation 1:1 mapping verified',
      'Scope-lock honored — no audit_log INSERT, no event-bus emit, no enforcement, no skip',
    ],
    warning_factors: [
      'vision-scorer.js was already over 600 LOC pre-change (845 → 903) — file is outside design sweet-spot, but the 58-LOC delta is small and additive; splitting requires a separate refactor SD',
    ],
    blocking_factors: [],
  },
  proactive_learning_query: {
    issue_patterns_consulted: [
      'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (15+ witnesses) — RELEVANT: this SD CLOSES one such consumer (scripts/eva/vision-scorer.js was reading the writer columns without surfacing them). Static-string regression-pin tests align with the prevention checklist.',
      'PAT-STORAGE-MIGRATION-READER-AUDIT-001 (candidate) — RELEVANT: same class. SELECT projection extension audited.',
      'PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001 — NOT APPLICABLE (no phantom tables involved).',
    ],
    prevention_invariants_satisfied: [
      'Tests pin the SELECT projection literal so a future refactor cannot silently drop quality_checked observability',
      'Helper is exported with a leading-underscore convention so test imports are explicit and reviewers see the "internal API for testing" signal',
      'Comment block at the warn call-site documents WHY no audit_log/event-bus emit (prevents drift toward eager wiring without a separate SD)',
    ],
  },
};

const evidenceRow = {
  sd_id: SD_UUID,
  sub_agent_code: 'DESIGN',
  sub_agent_name: 'design-agent',
  phase: 'PLAN',
  verdict: 'PASS',
  validation_mode: 'prospective',
  confidence: 90,
  detailed_analysis: detailedAnalysis,
  metadata: {
    session_id: SESSION_ID,
    sd_key: SD_KEY,
    prd_id: PRD_ID,
    review_mode: 'backend_infrastructure',
    wcag_applicable: false,
    sub_agent_invocation: 'PLAN-prospective design review',
    triggered_by: 'PLAN-TO-EXEC handoff requirement (SUBAGENT_EVIDENCE_MISSING gate)',
  },
};

(async () => {
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .insert(evidenceRow)
    .select('id, sd_id, sub_agent_code, phase, verdict, validation_mode, confidence, created_at')
    .single();

  if (error) {
    console.error('INSERT FAILED:', error.message);
    console.error('Details:', error.details);
    console.error('Hint:', error.hint);
    process.exit(1);
  }

  console.log('✅ Design-agent PLAN-prospective evidence row written:');
  console.log('   ID:        ', data.id);
  console.log('   SD UUID:   ', data.sd_id);
  console.log('   SD key:    ', SD_KEY);
  console.log('   Sub-agent: ', data.sub_agent_code, '/', data.phase);
  console.log('   Verdict:   ', data.verdict, '| Confidence:', data.confidence);
  console.log('   Mode:      ', data.validation_mode);
  console.log('   Created:   ', data.created_at);
})();
