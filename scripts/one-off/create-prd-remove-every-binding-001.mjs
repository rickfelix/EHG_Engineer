#!/usr/bin/env node
// SD-LEO-INFRA-REMOVE-EVERY-BINDING-001 -- PLAN phase PRD creation.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createPRDWithValidatedContent } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-REMOVE-EVERY-BINDING-001';
const SD_UUID = 'ddc88223-479a-4d73-8c3e-1341c8feda6e';
const PRD_ID = 'PRD-SD-LEO-INFRA-REMOVE-EVERY-BINDING-001';
const PRD_TITLE = 'Remove every binding of venture AI agents to pre-go-live workflow stages';

const llmContent = {
  executive_summary: 'Chairman ruling deb0818c: no venture AI agent is bound to, owns, or advances a pre-go-live venture workflow stage -- the factory runs the stages, the organization runs the live business. STANDARD_VENTURE_TEMPLATE (lib/agents/venture-ceo-factory.js) carries stage_ownership on 6 VP roles and the CEO has can_advance_stage:true + a requires_advisory_approval stage-number list. Removes all 3 fields, re-expresses each role\'s live-business mandate without stage-number anchors, updates the 2 tests that hard-assert these fields, and adds a new lint guarding against reintroduction.',

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Remove stage_ownership from all 6 role definitions that carry it in STANDARD_VENTURE_TEMPLATE (VP_STRATEGY, VP_PRODUCT, VP_TECH, VP_GROWTH, VP_MARKETING, VP_CUSTOMER)',
      description: 'Deletes the field entirely (not just emptying the array) -- an empty array is still a stage-shaped field name reintroducible with values; deleting the key closes it structurally. Applies uniformly whether the role\'s array was populated (VP_STRATEGY [1-9], VP_PRODUCT [10-12], VP_TECH [13-21], VP_GROWTH [22-26]) or already empty (VP_MARKETING, VP_CUSTOMER).',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: grep for "stage_ownership" in lib/agents/venture-ceo-factory.js returns zero matches',
        'AC-2: every other field on each of the 6 roles (capabilities, tools, token_budget, honest_idle, duty_cycle) is unchanged'
      ]
    },
    {
      id: 'FR-2',
      requirement: 'Remove can_advance_stage and requires_advisory_approval from the CEO role\'s delegation_authority',
      description: 'Both fields sit inside ceo.delegation_authority alongside can_create_agents, can_allocate_budget, and max_budget_per_vp_usd, which are NOT stage-binding and must be preserved untouched. can_advance_stage/requires_advisory_approval are the only 2 keys removed.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: ceo.delegation_authority no longer has can_advance_stage or requires_advisory_approval keys',
        'AC-2: can_create_agents, can_allocate_budget, max_budget_per_vp_usd are byte-identical to before'
      ]
    },
    {
      id: 'FR-3',
      requirement: 'Re-express post_stage_mandate on VP_PRODUCT, VP_TECH, VP_GROWTH without embedded stage-number anchors (S12, S21, S26)',
      description: 'Current prose anchors the mandate\'s trigger condition to a stage ordinal ("live-iteration past S12", "keep-live/SRE past S21", "post-launch acquisition/analytics past S26"). Re-express the SAME trigger condition (the venture has gone live) using a launch/deploy-state description instead of a stage number -- the underlying meaning (this mandate activates once the venture is live, not before) is preserved; only the stage-ordinal anchor is removed.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: none of the 3 post_stage_mandate strings contain a stage-number token (S\\d+ pattern or a bare venture-stage ordinal)',
        'AC-2: each mandate\'s described trigger condition and subsequent duties are semantically unchanged -- only the stage-number anchor is replaced with a launch/live-state description'
      ]
    },
    {
      id: 'FR-4',
      requirement: 'Remove the stage_ownership case from lib/org/role-registry-resolver.mjs\'s ROLE_FIELD_KEYS and splitRoleLayers()',
      description: 'This module has zero live callers (a pure, DB-independent round-trip-proof pair for a chairman-gated, not-yet-applied registry design), but leaving a reader for a field that no longer exists on the template is a dangling reference that would silently no-op rather than error -- removed cleanly rather than left stale.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1: ROLE_FIELD_KEYS no longer lists stage_ownership; splitRoleLayers()\'s switch no longer has a stage_ownership case',
        'AC-2: templateToBaseRows()/resolveVentureRoles() still function correctly for every OTHER field they handle -- verified by the existing round-trip equivalence test (updated per FR-6)'
      ]
    },
    {
      id: 'FR-5',
      requirement: 'The CEO\'s agent_registry.delegation_authority stops persisting can_advance_stage/requires_advisory_approval for every newly-created venture',
      description: 'A natural consequence of FR-2, not a separate code change: venture-ceo-factory.js:364 passes template.ceo.delegation_authority straight through into the agent_registry insert, so removing the 2 fields from the template means new CEO rows never carry them. Confirmed zero existing readers of these 2 fields off agent_registry.delegation_authority anywhere in the repo, so no other code needs updating for this to be safe.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1: a newly-instantiated venture CEO\'s agent_registry.delegation_authority JSONB does not contain can_advance_stage or requires_advisory_approval keys'
      ]
    },
    {
      id: 'FR-6',
      requirement: 'Update tests/unit/venture-ceo-factory.test.js to remove/adjust its 6+ hard value assertions on .stage_ownership',
      description: 'Lines asserting stage_ownership values (VP_MARKETING empty array, per-VP expected-shape literals, VP_TECH/VP_GROWTH continuity assertions) must be removed or rewritten to assert the field\'s ABSENCE instead, since the underlying capability (each VP\'s capabilities/tools/token_budget) is unchanged and still needs coverage.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: no assertion in this file references .stage_ownership',
        'AC-2: a new assertion confirms stage_ownership is absent (not undefined-but-present, genuinely not a key) on at least one previously stage-bound VP and the CEO\'s delegation_authority'
      ]
    },
    {
      id: 'FR-7',
      requirement: 'Fix tests/unit/org/role-registry-equivalence.test.mjs\'s negative-control seeded-defect test, which silently stops testing anything once stage_ownership no longer exists on the template',
      description: 'The test currently deletes vpRow.structure.stage_ownership to seed a defect and asserts the divergence is observable. Once the field is removed from the source template, templateToBaseRows() (guarded by "if (!(key in roleEntry)) continue") never populates that key in the first place, making the delete a no-op and the assertion meaningless. Fix: seed the defect against a DIFFERENT field the resolver still handles (e.g. capabilities or token_budget) so the negative-control property keeps meaning.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: the negative-control test seeds its defect against a field that still exists post-FR-1/FR-4, and the test genuinely fails if that seeding is removed (verified by temporarily removing the seed and confirming the test goes red, then restoring it)'
      ]
    },
    {
      id: 'FR-8',
      requirement: 'New CI lint: a venture role definition must never carry stage_ownership/can_advance_stage/requires_advisory_approval as an object key, or a stage-number token inside post_stage_mandate/honest_idle/duty_cycle string values',
      description: 'No existing lint covers this pattern (eva-stage-literal-lint.mjs is scoped to lib/eva only and explicitly documents array-literal stage numbers as an out-of-scope blind spot; gate-stage-hardcoded-literal-lint.mjs matches only 4 unrelated identifier names; stage-advancement-chokepoint-lint.mjs matches only current_lifecycle_stage writes). New lint cloned from this repo\'s established diff-scoped+JSON-allowlist+inline-pragma lint family (matching this SD\'s own success criterion: "a CI lint fails on a role definition that names a venture workflow stage").',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: the lint fails on a deliberately-reintroduced stage_ownership/can_advance_stage/requires_advisory_approval key anywhere in lib/agents/venture-ceo-factory.js',
        'AC-2: the lint fails on a stage-number token (e.g. "S12", "stage 12") inside a post_stage_mandate/honest_idle/duty_cycle string value',
        'AC-3: the lint passes cleanly against the post-FR-1/FR-2/FR-3 state of venture-ceo-factory.js',
        'AC-4: the lint is wired into a GitHub Actions workflow so it runs on every PR touching lib/agents/venture-ceo-factory.js'
      ]
    }
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'FR-1/FR-2 delete object keys entirely, never merely empty an array or set a field to null/false',
      rationale: 'An empty array or a false-valued field is still a reintroducible, stage-shaped hook (a future edit could just fill it back in); a deleted key requires the lint (FR-8) to actively reject re-adding it, matching the SD\'s own scope text "remove those fields and any reader of them."'
    },
    {
      id: 'TR-2',
      requirement: 'The new lint (FR-8) follows this repo\'s established lint-family conventions: diff-scoped by default (only new/changed lines block), a JSON allowlist for genuine exceptions, and an inline disable-pragma for single-line intentional cases',
      rationale: 'Matches eva-stage-literal-lint.mjs/gate-stage-hardcoded-literal-lint.mjs/stage-advancement-chokepoint-lint.mjs\'s shared design, keeping the lint family internally consistent rather than introducing a fourth, differently-shaped mechanism for a closely related problem.'
    },
    {
      id: 'TR-3',
      requirement: 'The docs/reference/vision/specs/06-hierarchical-agent-architecture.md design-spec document (an older, already-divergent draft with different stage numbers) is explicitly OUT of this SD\'s scope',
      rationale: 'Not live code, not imported anywhere, already stale relative to the live template independent of this SD. This SD\'s own risk register states it "owns only its own exit predicate" -- touching a documentation artifact with its own independent staleness is scope creep into the wider Solomon design, reserved for a separate item.'
    }
  ],

  system_architecture: {
    overview: 'A single source-of-truth object (STANDARD_VENTURE_TEMPLATE) currently mixes two concerns: each role\'s permanent capabilities/tools/budget, and a now-prohibited binding to specific pre-go-live workflow stages. This SD strips the second concern out entirely, re-expresses the live-business mandate in stage-number-free terms, and adds a lint that keeps the two concerns from re-merging.',
    components: [
      { name: 'STANDARD_VENTURE_TEMPLATE', responsibility: 'Source of truth for all venture role definitions -- stage-binding fields removed, post_stage_mandate re-expressed', technology: 'lib/agents/venture-ceo-factory.js (existing, edited)' },
      { name: 'role-registry-resolver.mjs', responsibility: 'Round-trip equivalence proof between the template and the (not-yet-applied) versioned role registry -- stage_ownership handling removed', technology: 'lib/org/role-registry-resolver.mjs (existing, edited)' },
      { name: 'Stage-binding reintroduction lint', responsibility: 'CI gate rejecting any new stage_ownership/can_advance_stage/requires_advisory_approval key or stage-number token in role-definition prose', technology: 'New scripts/lint/*.mjs file, cloned from the established diff-scoped lint family, wired into a GitHub Actions workflow' }
    ],
    data_flow: 'A venture is instantiated -> VentureFactory.instantiateVenture()/instantiateSharedOperators() reads STANDARD_VENTURE_TEMPLATE -> _createAgent() inserts into agent_registry (CEO\'s delegation_authority persisted verbatim, VPs\' curated subset persisted) -> recordIdentityForAgent() persists a narrower context_profile subset (agent_registry_id, agent_type, hierarchy_path, capabilities) that never included the removed fields to begin with. Post-SD, no stage-binding data exists anywhere in this flow; the new lint runs on every PR touching the template file to keep it that way.',
    integration_points: [
      'lib/agents/venture-ceo-factory.js (STANDARD_VENTURE_TEMPLATE, edited)',
      'lib/org/role-registry-resolver.mjs (edited)',
      'tests/unit/venture-ceo-factory.test.js (edited)',
      'tests/unit/org/role-registry-equivalence.test.mjs (edited)',
      'New lint script + GitHub Actions workflow wiring'
    ]
  },

  test_scenarios: [
    { id: 'TS-1', scenario: 'No role definition carries any of the 3 removed fields', test_type: 'unit', given: 'STANDARD_VENTURE_TEMPLATE post-FR-1/FR-2', when: 'Every role object is inspected', then: 'stage_ownership, can_advance_stage, requires_advisory_approval are absent as keys on every role, including previously-empty-array VPs' },
    { id: 'TS-2', scenario: 'post_stage_mandate prose contains no stage-number token', test_type: 'unit', given: 'VP_PRODUCT, VP_TECH, VP_GROWTH post_stage_mandate strings', when: 'Scanned for a stage-number pattern (S\\d+ or bare ordinal)', then: 'Zero matches; each mandate\'s trigger condition is re-expressed in launch/live-state terms' },
    { id: 'TS-3', scenario: 'A newly-instantiated venture CEO never persists the removed delegation_authority fields', test_type: 'integration', given: 'A real or mocked instantiateVenture() call', when: 'The resulting agent_registry row for the CEO is inspected', then: 'delegation_authority has no can_advance_stage/requires_advisory_approval keys; can_create_agents/can_allocate_budget/max_budget_per_vp_usd are unchanged' },
    { id: 'TS-4', scenario: 'role-registry-resolver.mjs\'s round-trip equivalence still holds for every remaining field', test_type: 'unit', given: 'The updated resolver and template (stage_ownership case removed)', when: 'templateToBaseRows()/resolveVentureRoles() round-trip is exercised', then: 'Equivalence holds for every field the resolver still handles; the negative-control seeded-defect test (FR-7) genuinely detects its (new, non-stage_ownership) seeded defect' },
    { id: 'TS-5', scenario: 'The new lint fails on a reintroduced stage binding', test_type: 'integration', given: 'A deliberately-reintroduced stage_ownership key (or a stage-number token in post_stage_mandate) in a throwaway diff', when: 'The lint runs in --diff mode', then: 'It fails, naming the exact file:line, matching the diff-scoped convention of its sibling lints' },
    { id: 'TS-6', scenario: 'The lint passes cleanly against the shipped state', test_type: 'integration', given: 'The post-SD state of lib/agents/venture-ceo-factory.js', when: 'The lint runs in full-sweep mode', then: 'Zero violations' },
    { id: 'TS-7', scenario: 'The org test suite (venture-ceo-factory.test.js, factory-identity-fold tests, the 2 real-DB org e2e suites) passes unchanged', test_type: 'unit', given: 'All updated test files', when: 'The full suite runs', then: 'All pass -- the SD\'s own literal success criterion ("the org test suite passes unchanged")' }
  ],

  acceptance_criteria: [
    'A repo scan finds zero stage_ownership, can_advance_stage, or requires_advisory_approval keys on any venture role definition (the SD\'s own literal success criterion)',
    'A CI lint fails on a role definition that names a venture workflow stage, either as a removed field key or a stage-number token in mandate prose (the SD\'s own literal success criterion)',
    'The org test suite passes unchanged (the SD\'s own literal success criterion)',
    'Every non-stage-binding field on every role (capabilities, tools, token_budget, can_create_agents, can_allocate_budget, max_budget_per_vp_usd, honest_idle, duty_cycle) is unchanged'
  ],

  risks: [
    {
      risk: 'Rewriting post_stage_mandate prose could accidentally change the ACTUAL trigger condition (e.g. shifting from "after the venture has gone live" to some other condition), not just remove the stage-number anchor',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'FR-3\'s acceptance criteria explicitly require the described trigger condition and subsequent duties to remain semantically unchanged -- reviewed side-by-side against the original prose, not freely rewritten',
      rollback_plan: 'Revert the 3 prose edits independently of the field-removal commits -- they touch only string values, no structural change'
    },
    {
      risk: 'FR-7\'s fix to the negative-control test could itself become a stale/meaningless test if the newly-chosen seed field is later also removed by an unrelated future SD',
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'Choose a seed field (capabilities or token_budget) that is core to every role\'s definition and has no independent removal pressure, unlike stage_ownership which was removed by THIS SD for a specific chairman-ruled reason',
      rollback_plan: 'N/A -- test-only risk, no production code affected'
    },
    {
      risk: 'A new lint scoped only to lib/agents/venture-ceo-factory.js could miss a stage binding reintroduced in a DIFFERENT file (e.g. a future per-venture role-overlay table or script)',
      probability: 'MEDIUM',
      impact: 'LOW',
      mitigation: 'Scope the lint to the field names themselves (stage_ownership/can_advance_stage/requires_advisory_approval as object keys) across the same RUNTIME_DIRS convention the sibling lints already use (lib/, scripts/), not narrowly to one file -- catches a reintroduction anywhere those field names appear, not just in the template file',
      rollback_plan: 'Widen or narrow the lint\'s scanned directories independently of the field-removal work -- purely a lint-config change'
    }
  ],

  implementation_approach: {
    phases: [
      { phase: 'Phase 1: Remove the fields', description: 'FR-1, FR-2: delete stage_ownership, can_advance_stage, requires_advisory_approval from STANDARD_VENTURE_TEMPLATE.' },
      { phase: 'Phase 2: Re-express mandates', description: 'FR-3: rewrite post_stage_mandate prose without stage-number anchors.' },
      { phase: 'Phase 3: Clean up the dangling reader', description: 'FR-4, FR-5: remove role-registry-resolver.mjs\'s stage_ownership handling; confirm delegation_authority persistence naturally stops carrying the removed fields.' },
      { phase: 'Phase 4: Fix tests', description: 'FR-6, FR-7: update venture-ceo-factory.test.js and role-registry-equivalence.test.mjs.' },
      { phase: 'Phase 5: Add the guard', description: 'FR-8: new lint + CI wiring, so the pattern cannot be reintroduced silently.' }
    ],
    testing_strategy: 'Unit tests for the template shape and mandate prose (TS-1, TS-2), an integration check on live persistence (TS-3), the existing round-trip equivalence suite updated and re-verified (TS-4), and the new lint\'s own positive/negative tests (TS-5, TS-6). The full pre-existing org test suite (TS-7) is the final regression gate.',
    deployment_strategy: 'Standard PR merge; no migration required (STANDARD_VENTURE_TEMPLATE is a JS object, not a DB table) and no chairman ceremony required beyond the ruling that already authorizes this change (deb0818c).'
  },

  exploration_summary: 'LEAD-phase Explore investigation (sub_agent_execution_results 46e8b56c) confirmed exactly 2 live readers of the 3 target fields (lib/org/role-registry-resolver.mjs, itself uncalled anywhere, and 2 test files with hard assertions), confirmed context_profile never persists these fields for VPs while the CEO\'s delegation_authority does persist can_advance_stage/requires_advisory_approval verbatim today with zero downstream readers, confirmed post_stage_mandate embeds stage-number anchors requiring a second layer of rewriting beyond the field deletion, and confirmed no existing lint covers this pattern -- a new one is needed, modeled on 3 existing sibling lints\' shared diff-scoped+allowlist+pragma design.'
};

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: sdData, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, scope, sd_type')
    .eq('id', SD_UUID)
    .single();
  if (sdErr) throw new Error(`fetch SD failed: ${sdErr.message}`);

  const stakeholderPersonas = ['Chairman (Solo Entrepreneur)', 'EVA (AI Chief of Staff)', 'DevOps Engineer'];

  const prd = await createPRDWithValidatedContent(
    supabase,
    PRD_ID,
    SD_KEY,
    SD_UUID,
    PRD_TITLE,
    sdData,
    llmContent,
    stakeholderPersonas
  );

  console.log('PRD created/updated:', prd.id, '| status:', prd.status, '| progress:', prd.progress);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
