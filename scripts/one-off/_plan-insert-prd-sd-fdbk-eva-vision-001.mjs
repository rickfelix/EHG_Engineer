#!/usr/bin/env node
/**
 * One-off: PLAN-phase PRD insertion for SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001.
 *
 * Sub-agent evidence already on file:
 * - LEAD validation b74ae6e3 (WARNING but PASS under Option A NARROWED)
 * - LEAD risk        d8f2c253 (PASS, 92%)
 * - PLAN risk        4daeaa87 (LOW 2.33/10, run by add-prd-to-database.js)
 *
 * Scope-locked at LEAD as Option A NARROWED:
 *   IN SCOPE: scripts/eva/vision-scorer.js loadVisionDimensions/loadArchDimensions
 *             SELECT projection adds quality_checked + quality_issues; warn-once
 *             [VisionScorer][QC-WARN] in scoreSD(); test coverage in scripts/eva/
 *             vision-scorer.test.js (extend, do not modify) + tests/unit/eva/
 *             vision-scorer.test.js.
 *   OUT OF SCOPE: trigger reconciliation (Option B), trigger drops (Option C),
 *                 production data migration on the 52 qc=false rows,
 *                 lib/eva consumer changes (already wired correctly).
 *
 * Idempotent: ON CONFLICT (id) DO UPDATE on most fields.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE_URL/KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SD_KEY = 'SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001';
const SD_UUID = 'be5d6fbf-571a-47a6-86e6-acc3dba9e044';
const PRD_ID = `PRD-${SD_KEY}`;

const FUNCTIONAL_REQUIREMENTS = [
  {
    id: "FR-1",
    title: "Vision dimension SELECT projection includes quality_checked + quality_issues",
    priority: "high",
    description: "Modify scripts/eva/vision-scorer.js loadVisionDimensions() (currently at line ~67) to add 'quality_checked, quality_issues' to the .select() call. The current SELECT is .select('id, vision_key, extracted_dimensions, status'); the change must preserve order/positioning of existing fields and add the two new columns at the end. The function continues to return {id, dimensions} unchanged — the new fields enter the returned data row but are not propagated to caller scoring logic in FR-1 (only observed in FR-3)."
  },
  {
    id: "FR-2",
    title: "Architecture dimension SELECT projection includes quality_checked + quality_issues",
    priority: "high",
    description: "Modify scripts/eva/vision-scorer.js loadArchDimensions() (currently at line ~85) to add 'quality_checked, quality_issues' to the .select() call. Currently .select('id, plan_key, extracted_dimensions, status'). Symmetric change to FR-1 for arch documents. Preserve {id, dimensions} return shape."
  },
  {
    id: "FR-3",
    title: "Single-emission [VisionScorer][QC-WARN] when quality_checked=false rows observed",
    priority: "high",
    description: "In scoreSD() (entry around scripts/eva/vision-scorer.js line ~314), after both loadVisionDimensions() and loadArchDimensions() return, inspect the loaded vision row + arch row for quality_checked === false. If EITHER is false, emit exactly ONE console.warn() line with format: '[VisionScorer][QC-WARN] sd_key=<sd_key> vision_qc=<bool> arch_qc=<bool>'. The warning is operator-CLI text only — no audit_log INSERT, no event-bus emit, no return-shape change. The warning is emitted at most once per scoreSD() invocation regardless of how many qc=false rows were observed (per-call dedup, not per-row)."
  },
  {
    id: "FR-4",
    title: "Warning suppressed when both vision and arch rows have quality_checked=true",
    priority: "high",
    description: "Per FR-3, the [VisionScorer][QC-WARN] line is emitted ONLY when at least one of the two loaded rows has quality_checked === false. When both rows are qc=true, no QC-WARN line is logged — preserving the existing operator-log signal-to-noise ratio for healthy rows. Verified by FR-5 test."
  },
  {
    id: "FR-5",
    title: "Test coverage for FR-1 through FR-4 (regression-pinned)",
    priority: "high",
    description: "Extend the existing vision-scorer test suite at scripts/eva/vision-scorer.test.js (137 LOC, 7 cases — 'extend, do not modify' per LEAD risk-agent guidance) AND/OR tests/unit/eva/vision-scorer.test.js with at minimum: (a) test asserting loadVisionDimensions().select() string contains 'quality_checked' and 'quality_issues' (regression-pin against accidental SELECT-projection drift); (b) test asserting loadArchDimensions().select() string contains 'quality_checked' and 'quality_issues'; (c) test asserting [VisionScorer][QC-WARN] is logged exactly once when scoreSD() is called with mocked qc=false vision row; (d) test asserting [VisionScorer][QC-WARN] is NOT logged when both loaded rows have qc=true. All 7 existing test cases must continue to pass (zero regressions)."
  }
];

const ACCEPTANCE_CRITERIA = [
  { criterion: "AC-1.1: scripts/eva/vision-scorer.js:loadVisionDimensions's .select() string literally contains the substrings 'quality_checked' and 'quality_issues' (case-sensitive). Verified by static-string assertion in unit test.", requirement_id: "FR-1" },
  { criterion: "AC-2.1: scripts/eva/vision-scorer.js:loadArchDimensions's .select() string literally contains the substrings 'quality_checked' and 'quality_issues' (case-sensitive). Verified by static-string assertion in unit test.", requirement_id: "FR-2" },
  { criterion: "AC-3.1: When scoreSD() is invoked with mocked Supabase returning vision row {quality_checked: false} OR arch row {quality_checked: false}, console.warn is called exactly once with the [VisionScorer][QC-WARN] prefix and the matching sd_key/vision_qc/arch_qc payload.", requirement_id: "FR-3" },
  { criterion: "AC-3.2: When scoreSD() observes 1 vision row + 1 arch row both with quality_checked=false in a single invocation, console.warn is still called exactly ONCE (per-call dedup), not twice — verified by spy-on-warn count assertion.", requirement_id: "FR-3" },
  { criterion: "AC-4.1: When scoreSD() is invoked with mocked Supabase returning BOTH vision and arch rows {quality_checked: true}, console.warn is NOT called with the [VisionScorer][QC-WARN] prefix (zero invocations matching the prefix substring).", requirement_id: "FR-4" },
  { criterion: "AC-5.1: All 7 existing test cases in scripts/eva/vision-scorer.test.js continue to pass after edits — zero regressions on existing threshold/scoring/persistence behavior.", requirement_id: "FR-5" },
  { criterion: "AC-5.2: At minimum 4 new test cases (one per FR-1/FR-2/FR-3/FR-4) are added; new total test count >= 11.", requirement_id: "FR-5" },
  { criterion: "AC-6.1: PR diff (git diff --name-only origin/main...HEAD) shows ZERO files under database/migrations/ — confirms no schema-migration scope creep into Option B/C territory.", requirement_id: "FR-1" },
  { criterion: "AC-6.2: Total source LOC delta (excluding tests) <= 30 LOC per LEAD scope-lock; total PR LOC <= 150 (Tier-2 infra ceiling).", requirement_id: "FR-1" }
];

const TECHNICAL_REQUIREMENTS = [
  { id: "TR-1", title: "Read-only Supabase access", description: "All DB interactions in this PR are .select() calls. No INSERT, UPDATE, DELETE, RPC, or migration. The two columns (quality_checked, quality_issues) already exist in eva_vision_documents and eva_architecture_plans schemas — no DDL needed.", rationale: "Per LEAD scope-lock: production data state on the 52 qc=false rows must remain untouched (5 are chairman_approved=true bypass-lineage). Read-only path eliminates accidental write-side effects." },
  { id: "TR-2", title: "No new dependencies", description: "Implementation uses only modules already imported in scripts/eva/vision-scorer.js: createSupabaseServiceClient (already), console.warn (Node built-in). No package.json changes.", rationale: "Tier-2 infra PRs benefit from minimal blast radius. Adding a logger dependency would require dependency-agent review; console.warn is sufficient for operator-CLI signal." },
  { id: "TR-3", title: "Per-invocation warning dedup is in-memory and stateless", description: "The 'at most once per scoreSD() invocation' constraint (FR-3) is implemented via a single boolean local variable inside scoreSD(), not a module-level flag. No module-level state, no cache, no closure across invocations.", rationale: "Module-level dedup leaks across invocations and creates test-isolation problems. Per-invocation dedup matches scope and is naturally regression-safe." },
  { id: "TR-4", title: "Return shapes are an additive superset (non-breaking)", description: "loadVisionDimensions() and loadArchDimensions() return shape is an ADDITIVE SUPERSET of {id, dimensions}: existing fields preserved by reference, new {qualityChecked, qualityIssues} appended so the FR-3 warn-helper can observe them without a second SELECT or extra destructuring round-trip. No external caller depends on the new keys; the only existing caller (intra-module scoreSD) reads {id, dimensions} unchanged. Per risk-agent recommendation #1 (R-6) at LEAD-prospective: this is a technical superset extension, materially non-breaking, and the most direct path to FR-3 dedup-emission.", rationale: "A strict {id, dimensions} return would force scoreSD to re-fetch quality_checked via a separate awaited destructuring before the helper call — extra LOC, extra read indirection, no actual contract benefit. The additive superset preserves backward compatibility (only intra-module scoreSD callers) AND keeps the Tier-2 effort estimate intact." }
];

const TEST_SCENARIOS = [
  { id: "TS-1", scenario: "Happy path: scoreSD with both qc=true rows", test_type: "unit", given: "Mocked Supabase returns vision row {quality_checked: true} and arch row {quality_checked: true}", when: "scoreSD() is invoked", then: "console.warn is NOT called with '[VisionScorer][QC-WARN]' prefix; existing scoring path executes unchanged" },
  { id: "TS-2", scenario: "Vision-only qc=false: warn once", test_type: "unit", given: "Mocked Supabase returns vision row {quality_checked: false} and arch row {quality_checked: true}", when: "scoreSD() is invoked", then: "console.warn is called exactly once with prefix '[VisionScorer][QC-WARN]' and payload includes vision_qc=false arch_qc=true" },
  { id: "TS-3", scenario: "Both qc=false: still warn once (dedup)", test_type: "unit", given: "Mocked Supabase returns vision row {quality_checked: false} AND arch row {quality_checked: false}", when: "scoreSD() is invoked", then: "console.warn is called exactly ONCE (not twice) with prefix '[VisionScorer][QC-WARN]'" },
  { id: "TS-4", scenario: "SELECT projection regression-pin: vision", test_type: "unit", given: "Mocked Supabase client tracks the .select() string used by loadVisionDimensions()", when: "loadVisionDimensions(supabase, 'VISION-X') is invoked", then: "The .select() string literally contains both 'quality_checked' and 'quality_issues' as substrings" },
  { id: "TS-5", scenario: "SELECT projection regression-pin: arch", test_type: "unit", given: "Mocked Supabase client tracks the .select() string used by loadArchDimensions()", when: "loadArchDimensions(supabase, 'ARCH-X') is invoked", then: "The .select() string literally contains both 'quality_checked' and 'quality_issues' as substrings" },
  { id: "TS-6", scenario: "Existing scoring tests still pass (zero regression)", test_type: "regression", given: "All 7 existing scripts/eva/vision-scorer.test.js cases", when: "test runner executes the full scorer test suite after edits", then: "All 7 existing cases pass with no skipped tests; new total >= 11 cases" }
];

const RISKS = [
  { id: "R-1", risk: "Log noise saturation in production hot paths", probability: "LOW", impact: "LOW", mitigation: "Per-invocation dedup (TR-3) bounds output to 1 line per scoreSD() call. Today scoreSD() is one-SD-per-invocation; even with 10 SDs scored sequentially the worst case is 10 warning lines.", rollback_plan: "Single-commit revert; no DB to unwind." },
  { id: "R-2", risk: "Duplicate signaling vs already-wired lib/eva consumers", probability: "LOW", impact: "LOW", mitigation: "vision-repair-loop / stage-17-doc-generation / vision-upsert / archplan-upsert read quality_checked but operate at DIFFERENT layers (DB write side, repair loop, doc generation). Adding scorer-side warn is operator-CLI only, NOT event-bus emit, NOT audit_log write — no subscriber collision.", rollback_plan: "Revert; existing consumers unaffected because their reads are independent." },
  { id: "R-3", risk: "Scope creep to Option B/C trigger reconciliation", probability: "MEDIUM", impact: "HIGH", mitigation: "AC-6.1 enforces zero migration files in PR diff. LEAD scope-lock document is in SD.scope field. Reviewer pre-merge checks that database/migrations/ is empty in the diff.", rollback_plan: "If trigger work creeps in, revert entire PR; file separate SD with its own LEAD validation." },
  { id: "R-4", risk: "Test mocking doesn't reflect real Supabase behavior (false-positive pass)", probability: "LOW", impact: "MEDIUM", mitigation: "Static-string assertions on .select() literal (TS-4, TS-5) are mocking-independent — they assert what the code passes to Supabase, not what Supabase returns. Behavior tests (TS-1/2/3) use spy-on-console.warn.", rollback_plan: "If tests pass but production fails, the gap is in the .select() string content — easy to add an integration test in a follow-up." }
];

const SYSTEM_ARCHITECTURE = JSON.stringify({
  overview: "Two-call read-side wiring: loadVisionDimensions and loadArchDimensions in scripts/eva/vision-scorer.js extend their .select() projections to include quality_checked + quality_issues. scoreSD() observes the loaded values and emits a single console.warn line when at least one is qc=false. Zero schema changes, zero new dependencies, zero side-effects beyond stdout/stderr.",
  components: [
    { name: "scripts/eva/vision-scorer.js", role: "MODIFIED — loadVisionDimensions (line ~67), loadArchDimensions (line ~85), scoreSD (line ~314) get quality_checked-aware projection + warn logic" },
    { name: "scripts/eva/vision-scorer.test.js", role: "EXTENDED — 4 new test cases per FR-5 (extend, do not modify per LEAD risk-agent recommendation)" },
    { name: "tests/unit/eva/vision-scorer.test.js", role: "POTENTIALLY EXTENDED — secondary test location identified by Explore agent; either-or with above is acceptable" },
    { name: "eva_vision_documents.quality_checked", role: "OBSERVED (read-side) — column already exists, no DDL" },
    { name: "eva_architecture_plans.quality_checked", role: "OBSERVED (read-side) — column already exists, no DDL" }
  ],
  data_flow: "SD-key -> scoreSD(sd_key) -> loadVisionDimensions(supabase, vision_key) [SELECT now includes qc] -> loadArchDimensions(supabase, arch_key) [SELECT now includes qc] -> single console.warn iff qc=false on either -> existing scoring loop -> eva_vision_scores INSERT (UNCHANGED)",
  out_of_scope: [
    "Trigger reconciliation (auto_validate_vision_quality 5000-char vs trg_eva_vision_quality_check 500-char)",
    "Trigger drops",
    "Production data migration on 52 qc=false rows (5 chairman_approved=true)",
    "lib/eva consumer changes (already wired correctly per validation-agent)",
    "audit_log emission (Q4 ZERO check confirmed warning is theoretical, console-only is sufficient first step)"
  ],
  rollback: "Single-commit git revert. No DB to unwind, no consumer signature change, no dependency to remove."
}, null, 2);

const METADATA = {
  sd_key: SD_KEY,
  sd_type: 'infrastructure',
  loc_estimate: { source: 30, tests: 50, total: 80, ceiling: 150 },
  scope_lock: 'option_a_narrowed',
  sub_agent_evidence: {
    lead_validation: 'b74ae6e3-edcf-42e9-93bf-475b90a536ce',
    lead_risk: 'd8f2c253-56e6-4944-a8e2-49b02c26b9b2',
    plan_risk: '4daeaa87-c30a-4352-98c8-4405213257a9'
  },
  target_application: 'EHG_Engineer',
  out_of_scope_seeds: [
    { name: 'Option B - trigger reconciliation', reason: 'Q4 ZERO check + 52 prod rows make this high-risk for theoretical premise' },
    { name: 'Option C - trigger drops', reason: 'Same as Option B; would require full audit of 5 chairman_approved=true bypass rows' }
  ]
};

const PRD = {
  id: PRD_ID,
  sd_id: SD_UUID,
  directive_id: SD_KEY,
  document_type: 'prd',
  status: 'draft',
  phase: 'PLAN_DESIGN',
  category: 'infrastructure',
  priority: 'medium',
  title: 'eva_vision_documents quality_checked: wire into vision-scorer (Option A NARROWED)',
  executive_summary: 'Wire eva_vision_documents.quality_checked + quality_issues into the read-side of scripts/eva/vision-scorer.js (loadVisionDimensions + loadArchDimensions SELECT projections) and emit a single operator-CLI warning per scoreSD() invocation when qc=false is observed. Closes the witnessed gap (scorer was structurally non-consumer of qc) without touching the 52 production qc=false rows or the 3 trigger functions. Estimated ~30 LOC source + ~50 LOC tests = ~80 LOC PR (well under 150 Tier-2 infra ceiling).',
  goal_summary: 'Make the EVA vision-scoring pipeline observability-aware of the database-side quality flag without changing enforcement semantics.',
  business_context: 'Database-agent surfaces quality_checked=false warnings on new vision rows that the scoring stack (scripts/eva/) was structurally incapable of acting on. lib/eva/ already consumes qc correctly. This PRD closes the scripts/eva/ gap with read-side wiring + operator log, deferring trigger reconciliation (Option B/C) to a separate SD if witnessed.',
  functional_requirements: FUNCTIONAL_REQUIREMENTS,
  acceptance_criteria: ACCEPTANCE_CRITERIA,
  technical_requirements: TECHNICAL_REQUIREMENTS,
  test_scenarios: TEST_SCENARIOS,
  risks: RISKS,
  system_architecture: SYSTEM_ARCHITECTURE,
  technology_stack: ['Node.js ESM', 'Supabase JS client (existing)', 'vitest (existing)', 'console.warn (Node built-in)'],
  dependencies: ['eva_vision_documents.quality_checked column (exists since 2026-03-14)', 'eva_architecture_plans.quality_checked column (exists since 2026-03-14)', 'scripts/eva/vision-scorer.js exports unchanged (loadVisionDimensions, loadArchDimensions, scoreSD)'],
  exploration_summary: JSON.stringify({
    files_read: [
      'scripts/eva/vision-scorer.js (lines 1-100)',
      'tests/unit/eva/vision-scorer.test.js (74 LOC)',
      'scripts/eva/vision-scorer.test.js (137 LOC, 7 cases)',
      'lib/eva/vision-repair-loop.js (332 LOC purpose-built consumer)',
      'lib/eva/vision-upsert.js (line 54 RETURNING)',
      'lib/eva/archplan-upsert.js (line 113 RETURNING)',
      'lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js (line 155, 250, 258 quality enforcement gate)',
      'database/migrations/20260314_quality_validation_vision_docs.sql (auto_validate_vision_quality, 5000-char threshold)',
      'database/migrations/20260314_quality_checked_enforcement_triggers.sql (trg_enforce_vision_quality_advancement RAISES EXCEPTION)'
    ],
    key_findings: [
      'lib/eva already consumes qc correctly — SD premise was wrong about "structurally incapable"',
      '52 prod rows have qc=false including 5 chairman_approved=true (bypass-lineage from SD-VISION-QUALITY-GATE-BYPASS-ORCH-001)',
      'Q4 audit_log shows ZERO vision_quality_check_* events all-time — premise is theoretical',
      'Last-fired-wins between two setter triggers (alphabetical) — 500-char wins, 5000-char is shadowed',
      '3rd trigger trg_enforce_vision_quality_advancement is the actual enforcement layer (RAISES EXCEPTION)'
    ],
    existing_patterns_followed: [
      'Read-side observability without enforcement (similar to scripts/modules/governance/ patterns)',
      'Single-emission warning with greppable prefix (similar to [VisionScorer][...] elsewhere)',
      'Static-string SELECT projection assertions (used in lib/multi-repo stderr-leak guard, PR #3658)'
    ]
  }, null, 2),
  metadata: METADATA,
  version: '1.0.0',
  created_by: 'PLAN-PHASE-INLINE-MODE-CC-706af506'
};

async function main() {
  // Pre-check: is the SD claim valid for this session?
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('current_phase, status, claiming_session_id')
    .eq('sd_key', SD_KEY)
    .single();
  if (!sd) { console.error('SD not found'); process.exit(2); }
  if (sd.current_phase !== 'PLAN_PRD') {
    console.error('SD not in PLAN_PRD (got ' + sd.current_phase + ')');
    process.exit(3);
  }

  // Idempotent UPSERT
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .upsert(PRD, { onConflict: 'id' })
    .select('id, sd_id, status, phase, document_type')
    .single();
  if (error) { console.error('Insert failed:', error.message); console.error(error); process.exit(4); }

  console.log('PRD inserted:');
  console.log('  id:', data.id);
  console.log('  sd_id:', data.sd_id);
  console.log('  status:', data.status, '/ phase:', data.phase, '/ document_type:', data.document_type);
  console.log('  FR count:', PRD.functional_requirements.length);
  console.log('  AC count:', PRD.acceptance_criteria.length);
  console.log('  TR count:', PRD.technical_requirements.length);
  console.log('  TS count:', PRD.test_scenarios.length);
  console.log('  Risks count:', PRD.risks.length);
}

main().catch(err => { console.error('FATAL', err); process.exit(99); });
