import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SD_ID = 'ece35968-e155-4b25-bbda-c438ff783cb3'; // canonical strategic_directives_v2.id for SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001
const SD_KEY = 'SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001';

const retrospective = {
  sd_id: SD_ID,
  project_name: 'Stage-0 alpha — ENGINE FAIL-CLOSED: synthesis failure can never emit maturity=ready; real component counting replaces the hardcoded 15/15 gauge; seeded-defect canary proves the gate catches total failure',
  retro_type: 'SD_COMPLETION',
  title: `${SD_KEY} Retrospective — Fail-Closed Stage-0 Synthesis Engine`,
  description: 'Tier-3 infra fix closing Bravo ledger finding 1 (docs/audit/stage-zero-flaw-ledger-bravo.md): every one of 15 synthesis components in lib/eva/stage-zero/synthesis/index.js runSynthesis() fail-soft to a zeroed fallback object indistinguishable from a real result, and components_run/components_total were hardcoded to 15/15 regardless of real outcomes. Worse, a chairman_constraints failure fell through to maturity=\'ready\' because its catch set verdict:\'review\' (not \'fail\'), so a run where ALL 15 components threw could still stamp maturity:\'ready\' — a venture could be selected on a "ready" stamp reflecting zero successful synthesis. Fixed with real per-component failure tracking, computed run/total counts, and a new fail-closed maturity branch.',
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['DESIGN', 'SECURITY', 'RISK', 'DATABASE', 'STORIES', 'TESTING', 'VALIDATION', 'REGRESSION'],
  human_participants: ['LEAD'],
  what_went_well: [
    {
      achievement: `LEAD→PLAN: LEAD phase complete for ${SD_ID}. Strategic validation passed with 90% completeness (gate score 94%). SD approved for PLAN phase PRD creation.`,
      is_boilerplate: false
    },
    {
      achievement: `PLAN→EXEC: PRD created and validated (gate score 97%). All pre-EXEC requirements met. EXEC implementation authorized.`,
      is_boilerplate: false
    },
    {
      achievement: `EXEC→PLAN: Implementation complete (gate score 94%). All deliverables met, tests passing.`,
      is_boilerplate: false
    },
    {
      achievement: 'Added _failed:true to 14 of 15 catch-block fallback objects in runSynthesis(); the 15th (mentalModelAnalysis) deliberately kept its pre-existing fail-to-null contract rather than being forced into the _failed shape, avoiding an unnecessary breaking change to an established advisory-component contract — the counting logic (c === null || c?._failed === true) already treats null as failure, so all 15 components are correctly incorporated without touching mentalModelAnalysis\'s code.',
      is_boilerplate: false
    },
    {
      achievement: 'Replaced hardcoded components_run:15/components_total:15 with values computed from real per-module outcomes (lib/eva/stage-zero/synthesis/index.js:213-229), removing the invisible-failure gauge at the root of the finding.',
      is_boilerplate: false
    },
    {
      achievement: 'Added a fail-closed maturity branch (any component failure -> \'blocked\') at a specific, deliberate precedence: constraints.verdict===\'fail\' (unchanged, highest priority) > anyComponentFailed (NEW) > park_and_build_later -> nursery (unchanged) > ready. Confirmed safe by the REGRESSION sub-agent: no consumer assumes always-ready, and \'blocked\' is a pre-existing first-class enum value already handled everywhere.',
      is_boilerplate: false
    },
    {
      achievement: 'TESTING sub-agent ran a genuine mutation test — reverted the fix, re-ran the new fail-closed tests, confirmed they FAIL against the pre-fix mutant (proving they exercise real behavior, not tautological assertions) — before restoring the real fix.',
      is_boilerplate: false
    },
    {
      achievement: 'Added the seeded-defect canary + partial-failure + zero-failure regression tests required by the spec\'s own R8/R10.2 acceptance criteria (tests/unit/eva/stage-zero/synthesis/synthesis-fail-closed.test.js, 173 new lines).',
      is_boilerplate: false
    }
  ],
  what_needs_improvement: [
    'Discovered mid-EXEC: two components in the pre-existing test file (synthesis-engine.test.js) — attention-capital.js and mental-model-analysis.js — were never mocked, so the suite was silently running their real, environment-dependent implementations. This was invisible under the old hardcoded 15/15 stamp and only surfaced as real test failures once the fix made component failures actually count; had to add the missing mocks to restore the intended "all components succeed" baseline.',
    'The fail+park interaction (a component failure occurring simultaneously with time_horizon=park_and_build_later) is not explicitly covered by a dedicated test. REGRESSION sub-agent flagged this as a LOW, non-blocking gap since the resulting precedence (fail-closed dominates park/nursery) is intentional, documented in the PRD, and strictly safer than pre-fix behavior — but it remains an untested branch.',
    'VISION_FIDELITY sub-agent execution is still PENDING as of PLAN-TO-LEAD — evidence row exists but verdict not yet resolved; should be confirmed before final closure rather than assumed benign by default.'
  ],
  action_items: [
    {
      action: 'Add an explicit regression test for the fail+park precedence interaction (component failure AND time_horizon=park_and_build_later simultaneously) to close the REGRESSION sub-agent\'s flagged LOW gap.',
      category: 'testing'
    },
    {
      action: 'Audit other Stage-0 synthesis-adjacent test suites for the same unmocked-real-implementation pattern found in synthesis-engine.test.js (attention-capital.js, mental-model-analysis.js) — a stricter invariant elsewhere may surface more latent test-isolation gaps.',
      category: 'technical_debt'
    },
    {
      action: 'Confirm VISION_FIDELITY sub-agent verdict resolves (currently PENDING) before treating this SD as fully closed.',
      category: 'process'
    },
    {
      action: 'Proceed with sibling findings from the same Bravo ledger (beta/delta/epsilon waves targeting R4/R2/R3/R5/R6) now that the alpha fail-closed pattern is established and Solomon-adjudicated.',
      category: 'process'
    }
  ],
  key_learnings: [
    {
      learning: 'A fail-soft catch block that returns a zeroed-but-shape-valid fallback object is indistinguishable from a real result to any downstream counter or gauge — the corruption is silent precisely because the shape never changes, only the semantics. Fail-closed systems need an explicit failure marker (_failed:true / null) on every catch path, not just a valid-looking default.',
      is_boilerplate: false
    },
    {
      learning: 'A hardcoded components_run/components_total gauge (15/15) is a distinct defect from the fail-soft fallback itself — even with per-component failure tracking added, a hardcoded count would still lie about how many components actually ran. Both had to be fixed together; fixing only one leaves the other as a residual false-positive source.',
      is_boilerplate: false
    },
    {
      learning: 'Maturity/verdict derivation logic must be checked for what happens on the catch path, not just the happy path: chairman_constraints\' catch set verdict:\'review\' (not \'fail\'), which silently satisfied the "not fail -> proceed toward ready" condition even when constraints synthesis itself had thrown. A component that fails should never resolve to a verdict value that reads as "did not fail."',
      is_boilerplate: false
    },
    {
      learning: 'Fail-closed precedence should be evaluated explicitly against every existing branch, not just added as a new independent check: this fix places anyComponentFailed above park_and_build_later (fail-closed dominates the nursery/park branch), the more conservative and correct-by-design choice for a fail-closed system — a run with both a failed component and park_and_build_later now resolves to \'blocked\', not \'nursery\'. This interaction was reasoned through and confirmed safe by REGRESSION rather than left as an accidental emergent behavior.',
      is_boilerplate: false
    },
    {
      learning: 'Stricter invariants can retroactively expose latent test-isolation gaps: two components in the pre-existing test suite were never mocked and were silently running real, environment-dependent implementations. Under the old hardcoded 15/15 stamp this was invisible; the fail-closed fix made it a visible test failure, forcing the missing mocks to be added. Treat "an old test starts failing right after a stricter invariant ships" as a signal to check for masked test-isolation debt, not just a regression to revert.',
      is_boilerplate: false
    },
    {
      learning: 'A genuine mutation test (revert the fix, confirm new tests fail against the pre-fix mutant, then restore the fix) is a strong, reusable verification pattern for fail-closed / gate-integrity SDs — it proves the new tests exercise real behavior rather than being tautological assertions that would pass against either version of the code.',
      is_boilerplate: false
    }
  ],
  quality_score: 88,
  team_satisfaction: 9,
  business_value_delivered: 'Closes a confirmed gate-integrity defect where Stage-0 venture-selection synthesis could stamp maturity:\'ready\' on a venture despite total synthesis failure (all 15 components erroring), which could have led to venture selection decisions made on zero real synthesis evidence. Restores the maturity gate as a trustworthy fail-closed signal.',
  customer_impact: 'Prevents ventures from being auto-advanced/selected on a false "ready" signal when Stage-0 synthesis has actually failed; chairman-facing maturity stamps now reflect real component outcomes instead of a hardcoded always-15/15 gauge.',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 3,
  bugs_resolved: 3,
  tests_added: 1,
  code_coverage_delta: null,
  performance_impact: 'Standard',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  success_patterns: [
    'LEAD→PLAN gate score: 94%',
    'PLAN→EXEC gate score: 97%',
    'EXEC→PLAN gate score: 94%',
    'Mutation-test verification pattern (revert fix -> confirm new tests fail against pre-fix mutant -> restore fix) used to prove non-tautological test coverage',
    'Fail-closed precedence deliberately evaluated against every existing maturity branch (constraints-fail > component-failure > park/nursery > ready) rather than bolted on as an independent check',
    'Self-claimed directly off the belt per a coordinator dispatch flag anticipating the claim (metadata.dispatch_note), first ("alpha") of a Solomon-adjudicated wave of sibling SDs targeting the same Bravo ledger'
  ],
  failure_patterns: [
    'All 15 synthesis components fail-soft to a zeroed fallback object indistinguishable in shape from a real result; components_run/components_total were hardcoded to 15/15 regardless of real per-component outcomes.',
    'chairman_constraints\' catch block set verdict:\'review\' rather than \'fail\' on error, so a run where ALL 15 components threw an error could still fall through to maturity:\'ready\' — the exact scenario a fail-closed gate exists to prevent.',
    'Two components (attention-capital.js, mental-model-analysis.js) in the pre-existing synthesis-engine.test.js suite were never mocked, silently exercising real environment-dependent implementations — invisible under the old hardcoded 15/15 stamp, only surfaced as failures once the fix made real outcomes count.'
  ],
  improvement_areas: [
    'Discovered mid-EXEC: two components in the pre-existing test file (synthesis-engine.test.js) — attention-capital.js and mental-model-analysis.js — were never mocked, so the suite was silently running their real, environment-dependent implementations. This was invisible under the old hardcoded 15/15 stamp and only surfaced as real test failures once the fix made component failures actually count; had to add the missing mocks to restore the intended "all components succeed" baseline.',
    'The fail+park interaction (a component failure occurring simultaneously with time_horizon=park_and_build_later) is not explicitly covered by a dedicated test. REGRESSION sub-agent flagged this as a LOW, non-blocking gap since the resulting precedence (fail-closed dominates park/nursery) is intentional, documented in the PRD, and strictly safer than pre-fix behavior — but it remains an untested branch.',
    'VISION_FIDELITY sub-agent execution is still PENDING as of PLAN-TO-LEAD — evidence row exists but verdict not yet resolved; should be confirmed before final closure rather than assumed benign by default.'
  ],
  generated_by: 'MANUAL',
  trigger_event: 'SD_STATUS_COMPLETED',
  status: 'PUBLISHED',
  target_application: 'EHG_Engineer',
  learning_category: 'APPLICATION_ISSUE',
  applies_to_all_apps: false,
  related_files: [
    'lib/eva/stage-zero/synthesis/index.js',
    'tests/unit/eva/stage-zero/synthesis/synthesis-engine.test.js',
    'tests/unit/eva/stage-zero/synthesis/synthesis-fail-closed.test.js',
    'docs/audit/stage-zero-flaw-ledger-bravo.md'
  ],
  related_commits: ['c814ebd1afc5775ae6164b05c58981f374d7c9a4'],
  related_prs: [],
  affected_components: [
    'lib/eva/stage-zero/synthesis/index.js (runSynthesis)',
    'Stage-0 venture-selection synthesis engine',
    'chairman_constraints synthesis component'
  ],
  tags: ['fail-closed', 'stage-0', 'synthesis-engine', 'gate-integrity', 'bravo-ledger'],
  metadata: {
    bravo_ledger_finding: 1,
    bravo_ledger_doc: 'docs/audit/stage-zero-flaw-ledger-bravo.md',
    wave_position: 'alpha',
    sibling_targets: 'beta/delta/epsilon -> R4/R2/R3/R5/R6'
  }
};

const { data: inserted, error } = await supabase
  .from('retrospectives')
  .insert(retrospective)
  .select();

if (error) {
  console.error('INSERT ERROR', JSON.stringify(error, null, 2));
  process.exit(1);
}

console.log('INSERTED', inserted[0].id, 'quality_score', inserted[0].quality_score, 'retro_type', inserted[0].retro_type, 'retrospective_type', inserted[0].retrospective_type, 'created_at', inserted[0].created_at);
