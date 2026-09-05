#!/usr/bin/env node
// PLAN-phase correction to PRD-SD-LEO-FIX-GATE-PLAN-EXEC-001, incorporating TESTING sub-agent
// findings (sub_agent_execution_results d4676393-9dc8-4ecd-9065-cbea28dc2c23, CONDITIONAL_PASS/82):
// the original test_scenarios had a fixture collision (TS-1 vs FR-3), a vacuous scenario (TS-3,
// unreachable without mocking), an unobservable assertion point for FR-1 (normalizeResult supplies
// its own max_score default, masking whether the gate constructs one), a brittle TS-5, a
// conflated TS-4, and FR-4's "reconciliation" claim overclaimed -- two real divergences (the
// refactor_brief carve-out, and validatePRDForHandoff's leniency applying to BOTH paths in the
// legacy check vs gate-1's heuristic-only scope) were never acknowledged.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-FIX-GATE-PLAN-EXEC-001';

const { data, error } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, test_scenarios, acceptance_criteria')
  .eq('id', PRD_ID)
  .single();

if (error) { console.error('❌ Fetch failed:', error.message); process.exit(1); }

const frs = data.functional_requirements;

// --- FR-1: make the assertion point explicit (spy on normalizeResult's INPUT, not just output) ---
const fr1 = frs.find((f) => f.id === 'FR-1');
fr1.acceptance_criteria = [
  "AC-1: A heuristic-path PRD whose only issue is in a non-unconditional-block class (placeholder/boilerplate requirements, NOT insufficient-count) and scores 85 yields `passed === true` from the gate after registry.normalizeResult (Test TS-1).",
  'AC-2: The object the gate PASSES INTO registry.normalizeResult (not merely the final output, which normalizeResult itself defaults via `max_score ?? 100`) always includes an explicit `passed` boolean and `max_score: 100` field -- asserted via `vi.spyOn(registry, \'normalizeResult\')` capturing its call argument, per TESTING finding (sub_agent_execution_results d4676393-9dc8-4ecd-9065-cbea28dc2c23): normalizeResult\'s own fallback chain can make an unmodified gate LOOK fixed on output alone.',
  'AC-3: Unit test asserts the spied normalizeResult call argument never omits `passed` when score >= the applicable threshold.'
];

// --- FR-3: AC-2 must detect THIS gate's usage, not just import presence (already true on main) ---
const fr3 = frs.find((f) => f.id === 'FR-3');
fr3.acceptance_criteria[1] =
  "AC-2: gate-1-plan-to-exec.js's prdQualityValidation registration (not merely the file's existing import, which per TESTING is already present at line 10 for an unrelated gate) calls getStoryMinimumScoreByCategory and uses its return value as the pass threshold -- asserted by a test that varies sd.category/sd.sd_type and observes the threshold actually applied (e.g. Infrastructure=50 vs Security=68), not by an import-presence check.";

// --- FR-4: acknowledge the two real divergences TESTING found, instead of overclaiming full reconciliation ---
const fr4 = frs.find((f) => f.id === 'FR-4');
fr4.requirement =
  "Document the coexistence of gate-1's registry check and the legacy PlanToExecVerifier.js:339 PRD_BOILERPLATE check for the same PLAN-TO-EXEC handoff, sharing the same threshold-derivation function (FR-3) while EXPLICITLY ACKNOWLEDGING two divergences that remain -- this is a documented, partial alignment, not a full reconciliation.";
fr4.description =
  "Both checks run live for the same handoff (confirmed: executors/plan-to-exec/index.js:389-392). Merging or removing either check is a larger consolidation out of scope for this bugfix. Both now derive their NUMERIC threshold from the same getStoryMinimumScoreByCategory call (FR-3), closing the original 50-vs-55 mismatch this SD was filed over. TESTING (sub_agent_execution_results d4676393-9dc8-4ecd-9065-cbea28dc2c23) found this alignment is still PARTIAL, and the PRD must say so rather than imply full parity: (1) PlanToExecVerifier.js:336 has an `isRefactorBrief ? 50 : ...` carve-out that gate-1's fix does not replicate; (2) the legacy check's validatePRDForHandoff leniency applies to BOTH the heuristic and AI-rubric paths, whereas gate-1's FR-2 fix is deliberately heuristic-only (by design, per this SD's scope) -- so the two checks can still disagree on an AI-rubric-path PRD with issues at a borderline score. Both divergences are ACCEPTED, not fixed, by this SD; they are recorded here so a future reader does not mistake 'shares a threshold function' for 'behaves identically'.";
fr4.acceptance_criteria = [
  fr4.acceptance_criteria[0],
  fr4.acceptance_criteria[1],
  "AC-3: The leo_validation_rules.validator_function column for the prdQualityValidation row is updated (still validatePRDQuality, since gate-1 still calls it) -- the row's criteria.min_score stale/inert value (confirmed non-authoritative per ValidationOrchestrator.js:1062) is annotated as non-authoritative via a CODE comment at the gate-1 call site, NOT a database migration -- no schema/DB change is needed for a JSONB field annotation, consistent with this PRD's runtime_config stating no migration is required.",
  "AC-4: A code comment at gate-1-plan-to-exec.js's prdQualityValidation registration explicitly names BOTH accepted divergences from PlanToExecVerifier.js (the refactor_brief carve-out, and the heuristic-only vs both-paths leniency scope) -- not just the threshold-source alignment. A test (TS-6b) documents/pins the refactor_brief divergence so a future change to either check surfaces it rather than silently drifting further."
];

const updatedFrs = frs; // mutated in place above

// --- test_scenarios: fix TS-1/TS-3/TS-4/TS-5, add TS-6 (sd absent), TS-7 (category/type divergence),
// TS-6b (refactor_brief divergence pinned), TS-8 (criteria.min_score inertness) ---
const newTestScenarios = [
  {
    id: 'TS-1',
    scenario: 'Heuristic-path PRD whose ONLY issue is a placeholder/boilerplate-requirements flag (a non-unconditional-block class) and scores 85 passes the fixed gate.',
    test_type: 'unit',
    given: 'A PRD with 3+ functional_requirements (one containing placeholder/boilerplate text, -10), 3+ acceptance_criteria, a short executive_summary (-5), for sdType=bugfix -- deliberately NOT triggering the insufficient-functional-requirements or insufficient-acceptance-criteria unconditional-block classes (those must stay blocking per FR-3/AC-3, and would collide with this scenario if mixed in, per TESTING finding d4676393-9dc8-4ecd-9065-cbea28dc2c23)',
    when: 'The fixed prdQualityValidation validator processes this context via a real (unmocked) validatePRDQuality/validatePRDHeuristic call, and the result is passed through registry.normalizeResult',
    then: 'The final normalized result has passed===true, the placeholder-requirements issue is present in warnings (not issues), and the object passed INTO normalizeResult (spied) explicitly carries max_score:100'
  },
  {
    id: 'TS-2',
    scenario: 'A truthy-but-empty {} PRD does not throw a TypeError.',
    test_type: 'unit',
    given: 'context.prd = {} (passes the existing `if (!prd)` guard since {} is truthy; validatePRDQuality\'s empty-PRD fast-fail returns no `details` key at all -- confirmed live by TESTING)',
    when: 'The fixed prdQualityValidation validator processes this context',
    then: 'It returns a normal {passed:false, score:0, issues:["...PRD is empty or missing"]} result without throwing, and max_score===100 is still present'
  },
  {
    id: 'TS-3',
    scenario: 'An AI-rubric-path PRD\'s own passed verdict is preserved unchanged (proves the leniency scoping does not leak into the AI path) -- MOCKED, since the real AI branch is unreachable offline.',
    test_type: 'unit',
    given: 'validatePRDQuality is mocked via vi.mock (per TESTING\'s confirmed pattern, matching tests/unit/implementation-fidelity/gate2-section-a-non-ui-skip.test.js\'s module-mock convention) to return {passed:false, score:72, issues:["semantic gap flagged by rubric"], warnings:[]} with NO `details` key (matching prd-quality-rubric.js\'s real return shape, which never sets details.method)',
    when: 'The fixed prdQualityValidation validator processes this mocked context',
    then: 'The final normalized result has passed===false (unchanged from the mocked rubric verdict) -- the reclassification branch is never entered because details?.method !== "heuristic", proving the AI path is untouched by this fix'
  },
  {
    id: 'TS-4a',
    scenario: 'A totally-empty PRD for a reduced-penalty SD type fails the gate on the SCORE alone (pure threshold failure, isolated from the unconditional-block classes).',
    test_type: 'unit',
    given: 'validatePRDQuality is stubbed to return score=53 (the measured empty-PRD score for bugfix) with issues limited to NON-unconditional-block classes only (e.g. missing system_architecture / missing risks warnings promoted to a stubbed issue, not insufficient-functional-requirements), for sd.category="Fix" (threshold 55 via getStoryMinimumScoreByCategory)',
    when: 'The fixed prdQualityValidation validator processes this context',
    then: 'The final normalized result has passed===false because 53 < 55 -- isolating that the THRESHOLD itself is a binding constraint, independent of the unconditional-block enforcement covered separately by TS-4b'
  },
  {
    id: 'TS-4b',
    scenario: 'A PRD with insufficient functional_requirements or insufficient acceptance_criteria fails the gate regardless of an otherwise-high score (unconditional-block classes stay blocking even under leniency).',
    test_type: 'unit',
    given: 'validatePRDQuality is stubbed to return a high score (e.g. 90) but with an issue in the insufficient-functional-requirements or insufficient-acceptance-criteria class',
    when: 'The fixed prdQualityValidation validator processes this context',
    then: 'The final normalized result has passed===false -- proving the leniency reclassification (FR-2) never overrides the unconditional-block issue classes (FR-3/AC-3), regardless of score'
  },
  {
    id: 'TS-5',
    scenario: 'Boundary test: a heuristic PRD scoring exactly at getStoryMinimumScoreByCategory\'s threshold for its category, with one non-unconditional-block issue, passes; scoring one point below, fails. STUBBED score (per TESTING finding: hand-constructing an exact real-scorer boundary is brittle/unreliable).',
    test_type: 'unit',
    given: 'validatePRDQuality is stubbed to return two results for sd.category="Fix" (threshold 55) with one non-unconditional-block issue each: one with score:55, one with score:54',
    when: 'Both are processed by the fixed prdQualityValidation validator',
    then: 'The score-55 result normalizes to passed===true (issue reclassified to warning); the score-54 result normalizes to passed===false (issue remains blocking) -- proving the category-derived threshold binds precisely'
  },
  {
    id: 'TS-6',
    scenario: 'context.sd is absent/undefined: the threshold falls back to getStoryMinimumScoreByCategory\'s own default (70), not silently to a lower/undefined value.',
    test_type: 'unit',
    given: 'context = {prd: <a valid heuristic PRD scoring 65>, sd: undefined}',
    when: 'The fixed prdQualityValidation validator processes this context',
    then: 'getStoryMinimumScoreByCategory(undefined, undefined) resolves to 70 (measured by TESTING) and the score-65 PRD correctly FAILS the gate at that default threshold -- proving sd-absence does not silently open a lower-threshold hole (an optional-chaining access point per FR-5)'
  },
  {
    id: 'TS-6b',
    scenario: 'The refactor_brief carve-out divergence between gate-1 and PlanToExecVerifier is pinned (documented, not fixed) so a future change to either surfaces it rather than silently drifting further.',
    test_type: 'unit',
    given: 'A PRD with document_type="refactor_brief" and sd.category values where PlanToExecVerifier.js:336 would apply its `isRefactorBrief ? 50 : ...` carve-out',
    when: 'The fixed gate-1 validator computes its threshold via getStoryMinimumScoreByCategory (which has no refactor_brief awareness) for the same inputs',
    then: 'The test asserts the two thresholds MAY legitimately differ in this case and documents why (gate-1 intentionally does not replicate the refactor_brief carve-out, per FR-4\'s accepted-divergence note) -- a regression in this test signals someone silently tried to "fully reconcile" the checks, which is explicitly out of this SD\'s scope'
  },
  {
    id: 'TS-7',
    scenario: 'Category/sd_type divergence: different (category, sd_type) pairs correctly resolve to different live thresholds (50 / 55 / 68 / 70), proving the fix is genuinely category-aware, not a disguised new flat constant.',
    test_type: 'unit',
    given: 'Four PRDs with identical content/score but sd = {category:"Infrastructure", sd_type:"bugfix"} / {category:"Fix", sd_type:"bugfix"} / {category:"Security", sd_type:"bugfix"} / {category: undefined, sd_type: undefined}',
    when: 'Each is processed by the fixed prdQualityValidation validator',
    then: 'The applied thresholds are 50 / 55 / 68 / 70 respectively (measured live by TESTING), each PRD\'s pass/fail outcome differing accordingly at a score chosen to straddle these four values'
  },
  {
    id: 'TS-8',
    scenario: 'leo_validation_rules.criteria.min_score remains inert (unread by the validator context) -- a regression test for the truth-drift annotation (FR-4/AC-3), not a behavior change.',
    test_type: 'unit',
    given: 'The live leo_validation_rules row for gate="prdQualityValidation" (criteria.min_score=50, confirmed via ValidationOrchestrator.js:1062 to be placed on gate.meta only, never the validator context)',
    when: 'ValidationOrchestrator dispatches this rule to gate-1\'s validator',
    then: 'The validator\'s actual threshold comes from getStoryMinimumScoreByCategory (FR-3), NOT from criteria.min_score -- this test documents/pins that the DB field stays cosmetic so a future well-intentioned "wire up criteria.min_score" change does not silently override the category-derived threshold without a deliberate design decision'
  }
];

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: updatedFrs, test_scenarios: newTestScenarios })
  .eq('id', PRD_ID);

if (updateErr) { console.error('❌ Update failed:', updateErr.message); process.exit(1); }

console.log('✅ PRD corrected per TESTING evidence d4676393-9dc8-4ecd-9065-cbea28dc2c23:');
console.log('   - FR-1 AC rewritten (spy on normalizeResult INPUT, not just output)');
console.log('   - FR-3 AC-2 rewritten (detect actual usage, not mere import presence)');
console.log('   - FR-4 rewritten (partial alignment, 2 accepted divergences documented, not overclaimed)');
console.log('   - test_scenarios: TS-1 (fixture collision fixed), TS-3 (mocked, no longer vacuous),');
console.log('     TS-4 split into TS-4a/TS-4b, TS-5 (stubbed, no longer brittle),');
console.log('     added TS-6 (sd absent), TS-6b (refactor_brief divergence pinned),');
console.log('     TS-7 (category/type divergence), TS-8 (min_score inertness) --', newTestScenarios.length, 'total scenarios');
