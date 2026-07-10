/**
 * SD_COMPLETION retrospective insert for
 * SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001
 *
 * Follows the schema/field conventions observed in the most recent
 * SD_COMPLETION retrospective (SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001,
 * quality_score=100) and validated against scripts/modules/handoff/retro-filters.js
 * getFilteredRetrospective() invariants:
 *   1. retro_type = 'SD_COMPLETION'
 *   2. retrospective_type IS NULL (not a handoff-time retro)
 *   3. created_at > LEAD-TO-PLAN accepted_at (2026-07-10T16:06:44.475106Z for this SD)
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = '537227ac-8954-4e53-b9c4-67e4d13858f3';
const SD_KEY = 'SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001';

const retrospective = {
  sd_id: SD_ID,
  retro_type: 'SD_COMPLETION',
  title: `${SD_KEY}: required_capabilities reach across all 5 discovery strategies + `
    + 'traversability-gate invocation on all 4 Stage-0 entry paths',
  description: 'Closed Solomon/Charlie ledger finding CH-6 -- the Stage-0 traversability gate '
    + '(lib/eva/stage-zero/traversability-gate.js, shipped by SD-LEO-INFRA-STAGE0-TRAVERSABILITY-GATE-001) '
    + 'was mechanically sound but its REACH was partial: required_capabilities was prompted in only 1 of '
    + '5 discovery strategies (trend_scanner), and the gate was invoked on only 1 of 4 Stage-0 entry paths '
    + '(discovery_mode). A candidate entering via blueprint_browse, competitor_teardown, or '
    + 'seeded_from_venture skipped the capability check entirely. Delivered: required_capabilities prompted '
    + 'in the 3 previously-silent discovery strategies (mirroring trend_scanner\'s wording verbatim) plus '
    + 'carry-forward logic for nursery_reeval; required_capabilities sourced in the 2 hybrid paths with a '
    + 'natural data source (competitor_teardown\'s LLM prompt, seeded_from_venture\'s carry-forward); '
    + 'traversability-gate invocation wired into all 3 previously-ungated paths '
    + '(blueprint-browse.js, competitor-teardown.js, venture-reseeding.js), mirroring discovery-mode.js\'s '
    + 'existing Step 3.5 pattern with a single candidate wrapped in a 1-element array; and new ALL-PATHS '
    + 'enumeration tests independently mutation-verified on three different paths by three different actors.',
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['DESIGN', 'RISK', 'DATABASE', 'STORIES', 'TESTING', 'VALIDATION', 'REGRESSION'],
  human_participants: ['LEAD'],

  what_went_well: [
    'required_capabilities prompt field added verbatim (mirroring trend_scanner\'s existing wording) to '
      + 'the 3 previously-silent discovery strategies -- democratization_finder, capability_overhang, '
      + 'simple_venture -- in lib/eva/stage-zero/paths/discovery-mode.js, closing CH-6\'s "prompted in only '
      + '1 of 5 strategies" gap without inventing 5 different prompt dialects. nursery_reeval instead gets '
      + 'carry-forward logic that copies the field from the original parked venture_nursery record\'s '
      + 'metadata rather than re-prompting.',
    'required_capabilities sourced from a natural existing data source in the 2 hybrid entry paths that '
      + 'have one: competitor_teardown\'s deconstructToFirstPrinciples LLM prompt now asks for it directly, '
      + 'and seeded_from_venture carries it forward from the reseeded source venture\'s '
      + 'metadata.stage_zero -- no synthetic sourcing was invented where a real one didn\'t exist.',
    'Traversability-gate invocation (loadCapabilityEnvelope -> checkTraversability -> parkFailedCandidate '
      + 'on failure -> return null) added to all 3 previously-ungated paths -- blueprint-browse.js, '
      + 'competitor-teardown.js, venture-reseeding.js -- mirroring discovery-mode.js\'s existing "Step 3.5" '
      + 'pattern exactly, with each path\'s single candidate wrapped in a 1-element array since these paths '
      + 'don\'t rank an array like discovery_mode does. blueprint_browse deliberately gets NO capability '
      + 'sourcing (opportunity_blueprints has no existing data source for it) and correctly falls through '
      + 'to the gate\'s pre-existing honest no_requirements_declared auto-pass.',
    'New ALL-PATHS enumeration tests: 8 new tests in tests/unit/eva/stage-zero/paths/traversability-reach.test.js '
      + '(pass / fail / fail-closed-propagation cases across the 3 newly-gated paths) plus a new 6-test '
      + 'describe block in discovery-mode.test.js (test.each across 4 strategies + 2 nursery_reeval '
      + 'carry-forward cases) -- 81/81 tests green across the 6 touched suites, 0 regressions.',
    'Unusually thorough mutation coverage for a single SD: THREE different paths independently '
      + 'mutation-verified by THREE different actors -- the implementer verified blueprint_browse, the '
      + 'TESTING sub-agent independently verified venture-reseeding, and the VALIDATION sub-agent '
      + 'independently verified competitor_teardown.',
  ],

  what_needs_improvement: [
    'Discovered during PLAN-phase file-by-file comparison that gate-invocation wiring on these 3 '
      + 'single-candidate paths required a different checkTraversability() call shape than '
      + 'discovery_mode\'s array-ranking pattern -- each path wraps its one candidate in a 1-element array. '
      + 'This wasn\'t documented anywhere before this SD and cost investigation time to re-derive from '
      + 'source.',
    'Wiring the gate into blueprint_browse/competitor_teardown/venture_reseeding surfaced a LATENT '
      + 'test-isolation gap in 3 pre-existing test files: their supabase mocks had never needed to answer '
      + 'a v_unified_capabilities query before (the gate was never invoked there), so all their existing '
      + 'tests broke the moment the gate was wired in. Extended (not weakened) each mock to handle the new '
      + 'query.',
    'More significantly, 2 pre-existing tests in tests/unit/stage-zero.test.js were making REAL, '
      + 'unmocked, network-dependent LLM calls -- a latent flakiness/determinism risk that had been '
      + 'invisible because the old code never gated on the LLM\'s actual response content. Adding the '
      + 'required_capabilities prompt made the real LLM\'s real answer start mattering, silently breaking '
      + '`expect(customSynthesize).toHaveBeenCalled()`. Fixed by injecting a deterministic llmClient mock '
      + 'into both tests -- this also cut that test file\'s run time from ~15-25s (real network '
      + 'round-trips) to under 2s, a nice side benefit.',
    'Confirmed via direct code read that nursery_reeval is currently DEAD IN PRODUCTION (a separate, '
      + 'already-flagged, out-of-scope schema-drift bug: its venture_nursery SELECT reads columns that '
      + 'don\'t exist on the live table). The FR-1 carry-forward logic added for it is correct-in-code and '
      + 'unit-tested, but won\'t execute in prod until that unrelated seam defect is fixed by someone else '
      + '-- noted, not fixed here (explicitly out of scope).',
    'The sourcing SD rationale cited a specific Solomon advisory ID (a8eafc72) and PR/issue reference '
      + '(#5815) that could not be located as either a repo file or via a quick DB lookup against '
      + 'solomon_advice_outcome_ledger. This is the THIRD unverifiable Solomon-derived citation this '
      + 'session (see the SWEEP-LEGACY-KILL-SWITCH-RETIRE-001 retro from the same session for the second) '
      + '-- did not invalidate the core finding, which was independently confirmed by direct code read, '
      + 'but worth flagging upstream now that the pattern has recurred a third time.',
  ],

  action_items: [
    {
      title: 'Fix the nursery_reeval venture_nursery schema-drift bug so FR-1\'s carry-forward logic can run',
      priority: 'low',
      owner_role: 'PLAN',
      description: 'nursery_reeval\'s venture_nursery SELECT reads columns that don\'t exist on the live '
        + 'table -- a pre-existing, separately-tracked defect confirmed via direct code read during this '
        + 'SD. The required_capabilities carry-forward logic added here for nursery_reeval is '
        + 'correct-in-code and unit-tested but is unreachable in production until that schema-drift bug is '
        + 'fixed. Out of scope for this SD; should be picked up as a fast-follow.',
    },
    {
      title: 'Repo-wide sweep for unmocked real-LLM-call instances in unit tests',
      priority: 'medium',
      owner_role: 'PLAN',
      description: 'This SD found 2 pre-existing tests in tests/unit/stage-zero.test.js making real, '
        + 'unmocked, network-dependent LLM calls -- invisible latent flakiness that only surfaced once an '
        + 'unrelated change (required_capabilities prompting) started making the real response content '
        + 'matter to a test assertion. This class of defect likely exists elsewhere in the suite and is '
        + 'easy to miss until something downstream starts depending on the real response. Worth a targeted '
        + 'sweep for other instances.',
    },
    {
      title: 'Independently spot-check Solomon-sourced SD rationale citations at LEAD phase',
      priority: 'medium',
      owner_role: 'LEAD',
      description: 'This SD\'s sourcing rationale cited a Solomon advisory ID (a8eafc72) and PR/issue '
        + 'reference (#5815) that could not be located in the repo or via a solomon_advice_outcome_ledger '
        + 'lookup. This is the third occurrence this session of an unverifiable Solomon-derived citation '
        + '(see the SWEEP-LEGACY-KILL-SWITCH-RETIRE-001 retro), though never one that invalidated the '
        + 'underlying finding. Flag upstream to Solomon\'s advisory-generation path now that the pattern '
        + 'has recurred a third time in a single session.',
    },
  ],

  key_learnings: [
    'Single-candidate gate-invocation paths need a different checkTraversability() call shape (1-element '
      + 'array wrap) than discovery_mode\'s array-ranking pattern -- worth documenting explicitly in '
      + 'traversability-gate.js so the next path-author doesn\'t have to re-derive it from source the way '
      + 'this SD had to.',
    'Wiring a previously-uninvoked gate into a path is a reliable way to surface latent test-isolation '
      + 'debt: 3 pre-existing test files\' supabase mocks had never needed to answer a v_unified_capabilities '
      + 'query, and broke immediately once the gate started firing -- the correct fix is to extend the '
      + 'mock to answer the new query, not to weaken the new gate call to avoid triggering it.',
    'Prompting a real field (required_capabilities) into an LLM call can transform a previously-inert '
      + 'unmocked test call into a source of real nondeterminism: 2 tests in stage-zero.test.js had been '
      + 'silently hitting the network the whole time, invisible until the real LLM\'s real answer started '
      + 'mattering to a downstream assertion. Any change that makes an LLM response content-sensitive is a '
      + 'trigger to check whether the test invoking it is actually mocked.',
    'Not every Stage-0 entry path needs (or should get) required_capabilities sourcing -- blueprint_browse '
      + 'has no natural data source for it, so the correct fix was NOT to invent a synthetic one but to let '
      + 'it fall through to the gate\'s existing honest no_requirements_declared auto-pass. Forcing a '
      + 'sourcing mechanism where none naturally exists would have produced a fabricated signal, which is '
      + 'worse than an honest absence.',
    'Confirming a target\'s dead-in-production status via direct code read (rather than trusting the SD\'s '
      + 'framing) prevented wasted effort trying to make nursery_reeval\'s carry-forward logic "work" '
      + 'against live data -- it is correct-in-code, unit-tested, and provably unreachable until a separate '
      + 'schema-drift bug is fixed by someone else.',
  ],

  quality_score: 94,
  team_satisfaction: 9,
  business_value_delivered: 'Closes Solomon/Charlie ledger finding CH-6 in full: required_capabilities is '
    + 'now prompted or sourced on all 5 discovery strategies and the traversability gate is invoked on all '
    + '4 Stage-0 entry paths, eliminating the silent-skip gap where a candidate entering via '
    + 'blueprint_browse, competitor_teardown, or seeded_from_venture bypassed the capability check '
    + 'entirely. Also surfaced and fixed 2 latent unmocked-LLM-call determinism risks as a byproduct.',
  customer_impact: 'Indirect: internal EVA Stage-0 venture-discovery infrastructure only. Ensures every '
    + 'venture candidate entering the pipeline -- regardless of entry path -- is subject to the same '
    + 'capability-traversability check before reaching ranking/review, preventing capability-gap ventures '
    + 'from silently bypassing the gate via a less-common entry path.',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 1,
  bugs_resolved: 0,
  tests_added: 14,
  objectives_met: true,
  on_schedule: true,
  within_scope: true,

  success_patterns: [
    'Mirroring an existing pattern\'s exact wording (trend_scanner\'s required_capabilities prompt phrase) '
      + 'across 3 new call sites instead of inventing new dialects -- keeps prompt behavior consistent and '
      + 'auditable',
    'Sourcing required_capabilities only where a natural data source exists (competitor_teardown\'s LLM '
      + 'prompt, seeded_from_venture\'s carry-forward) and deliberately declining to source it where none '
      + 'exists (blueprint_browse) rather than fabricating one',
    'Three independent mutation-verifications across three different actors on three different paths -- an '
      + 'unusually strong evidentiary pattern for a single SD',
    'Extending (not weakening) 3 pre-existing test files\' mocks to handle a newly-fired '
      + 'v_unified_capabilities query once the latent test-isolation gap surfaced',
    'Injecting a deterministic llmClient mock to remove two unmocked, network-dependent LLM calls from a '
      + 'test file, with a measured ~15-25s -> <2s runtime side benefit',
  ],
  failure_patterns: [
    'Latent test-isolation debt (3 pre-existing files never having to mock v_unified_capabilities) was '
      + 'invisible until the gate wiring exposed it -- the gap existed before this SD and only surfaced as '
      + 'a byproduct of unrelated work',
    '2 unmocked, network-dependent LLM calls sat undetected in tests/unit/stage-zero.test.js and only '
      + 'became a determinism risk once required_capabilities made the real response content start '
      + 'mattering',
    'Third unverifiable Solomon-derived citation this session (advisory a8eafc72 / PR #5815) -- did not '
      + 'invalidate the finding, but is now a recurring enough pattern to flag upstream',
  ],
  improvement_areas: [
    JSON.stringify({
      area: 'nursery_reeval FR-1 carry-forward logic correct-in-code but unreachable in production',
      analysis: 'nursery_reeval\'s venture_nursery SELECT reads columns that don\'t exist on the live '
        + 'table -- confirmed via direct code read during this SD as a pre-existing, separately-tracked '
        + 'schema-drift defect (out of scope to fix here). The required_capabilities carry-forward logic '
        + 'added for nursery_reeval in this SD is correct and unit-tested, but the path itself never '
        + 'successfully queries live venture_nursery rows in production, so the new logic cannot currently '
        + 'execute.',
      prevention: 'Tracked as a low-priority action item above. The schema-drift bug should be fixed by a '
        + 'future SD, at which point FR-1\'s carry-forward logic will begin executing without further '
        + 'changes.',
    }),
    JSON.stringify({
      area: 'Latent unmocked real-LLM-call risk class in unit tests',
      analysis: '2 pre-existing tests in tests/unit/stage-zero.test.js were making real, unmocked, '
        + 'network-dependent LLM calls. This was invisible before this SD because the old code never '
        + 'gated on the LLM\'s actual response content -- adding the required_capabilities prompt made '
        + 'the real answer start mattering, silently breaking a `toHaveBeenCalled()` assertion. Fixed by '
        + 'injecting a deterministic llmClient mock (also cut the file\'s runtime from ~15-25s to <2s).',
      prevention: 'Tracked as a medium-priority action item above: a repo-wide sweep for other instances '
        + 'of this failure class (unmocked real-LLM-call in a unit test) is worth doing before another '
        + 'unrelated change makes a different real response start mattering.',
    }),
    JSON.stringify({
      area: 'Solomon-advisory citation accuracy (third occurrence this session)',
      analysis: 'This SD\'s sourcing rationale cited a Solomon advisory ID (a8eafc72) and PR/issue '
        + 'reference (#5815) that could not be located as either a repo file or via a quick DB lookup '
        + 'against solomon_advice_outcome_ledger. The underlying CH-6 finding was independently confirmed '
        + 'via direct code read (1-of-5 strategies, 1-of-4 paths), so the citation issue did not '
        + 'invalidate the SD -- but this is the third unverifiable Solomon-derived citation encountered '
        + 'this session.',
      prevention: 'Flagged as a medium-priority action item (independently spot-check Solomon-sourced '
        + 'citations at LEAD phase) -- worth escalating to the advisory-generation path itself now that '
        + 'the pattern has recurred a third time.',
    }),
  ],

  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  target_application: 'EHG_Engineer',
  learning_category: 'PROCESS_IMPROVEMENT',
  applies_to_all_apps: false,

  related_files: [
    'lib/eva/stage-zero/paths/discovery-mode.js',
    'lib/eva/stage-zero/paths/blueprint-browse.js',
    'lib/eva/stage-zero/paths/competitor-teardown.js',
    'lib/eva/stage-zero/paths/venture-reseeding.js',
    'lib/eva/stage-zero/traversability-gate.js',
    'tests/unit/eva/stage-zero/paths/traversability-reach.test.js',
    'tests/unit/eva/stage-zero/paths/discovery-mode.test.js',
    'tests/unit/eva/stage-zero/paths/blueprint-browse.test.js',
    'tests/unit/eva/stage-zero/paths/competitor-teardown.test.js',
    'tests/unit/eva/stage-zero/paths/venture-reseeding.test.js',
    'tests/unit/stage-zero.test.js',
  ],
  related_commits: [],
  related_prs: [],
  affected_components: [
    'lib/eva/stage-zero/paths/discovery-mode.js',
    'lib/eva/stage-zero/paths/blueprint-browse.js',
    'lib/eva/stage-zero/paths/competitor-teardown.js',
    'lib/eva/stage-zero/paths/venture-reseeding.js',
  ],
  tags: ['stage-zero', 'traversability-gate', 'eva', 'capability-envelope', 'infrastructure', 'ch-6'],

  metadata: {
    sd_key: SD_KEY,
    sd_type: 'infrastructure',
    migrations: 0,
    ledger_finding: 'CH-6 (Solomon/Charlie ledger)',
    predecessor_sd: 'SD-LEO-INFRA-STAGE0-TRAVERSABILITY-GATE-001',
    gated_paths_before: 1,
    gated_paths_after: 4,
    strategies_prompting_before: 1,
    strategies_prompting_after: 5,
    handoffs_completed: [
      'LEAD-TO-PLAN (93%)',
      'PLAN-TO-EXEC (97%)',
      'EXEC-TO-PLAN (94%)',
    ],
    sub_agent_evidence: {
      DESIGN: { phase: 'LEAD', verdict: 'PASS', confidence: 95 },
      RISK: { phase: 'LEAD', verdict: 'PASS', confidence: 85 },
      DATABASE: { phase: 'LEAD', verdict: 'PASS', confidence: 100 },
      STORIES: { phase: 'LEAD', verdict: 'PASS', confidence: 95 },
      TESTING: { phase: 'EXEC', verdict: 'PASS', confidence: 95 },
      VALIDATION: { phase: 'PLAN_VERIFICATION', verdict: 'PASS', confidence: 95 },
      REGRESSION: { phase: 'PLAN_VERIFICATION', verdict: 'PASS', confidence: 93 },
    },
    tests_targeted_suite: '14 new (8 in traversability-reach.test.js; 4 test.each + 2 nursery_reeval in '
      + 'discovery-mode.test.js); 6 files / 81 tests total across touched Stage-0 suites, 0 regressions',
    mutation_verifications: [
      'Implementer: verified blueprint_browse gate-invocation path via targeted mutation, fail-then-clean-revert',
      'TESTING sub-agent: independently mutation-verified venture-reseeding gate-invocation path',
      'VALIDATION sub-agent: independently mutation-verified competitor_teardown gate-invocation path',
    ],
    latent_defects_surfaced: [
      'nursery_reeval dead-in-production: venture_nursery SELECT reads columns that do not exist on the '
        + 'live table (pre-existing, separately-tracked, out of scope for this SD)',
      '2 unmocked, network-dependent real-LLM-call tests in tests/unit/stage-zero.test.js, fixed with a '
        + 'deterministic llmClient mock (also cut runtime ~15-25s -> <2s)',
    ],
    unverifiable_citations: [
      'Solomon advisory a8eafc72 and PR/issue #5815 cited in the sourcing rationale could not be located '
        + 'as a repo file or via a solomon_advice_outcome_ledger lookup -- third unverifiable '
        + 'Solomon-derived citation this session; core CH-6 finding independently confirmed regardless',
    ],
  },
};

const { data, error } = await supabase
  .from('retrospectives')
  .insert(retrospective)
  .select('id, sd_id, retro_type, retrospective_type, quality_score, created_at, status');

if (error) {
  console.error('INSERT FAILED:', error);
  process.exit(1);
}

console.log('Retrospective inserted:');
console.log(JSON.stringify(data[0], null, 2));
