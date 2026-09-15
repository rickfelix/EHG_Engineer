/**
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 (FR-3): the mock venture -- the suite's clean
 * passing-control fixture. Built via the REAL resolveVentureRoles() resolver (not a hand-typed
 * literal) so the suite stays compatible with the real role registry's actual output shape.
 *
 * Every MAST fixture (lib/org/acceptance-suite/fixtures/mast/*.mjs) clones this baseline via
 * cloneOrganization() and injects exactly one defect -- this file is the single source of what
 * "correctly formed" means for every check in the suite.
 *
 * ORGANIZATION OBJECT SHAPE: {ceo, executives[], crews[], budget_distribution} are REAL fields
 * from resolveVentureRoles() (SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001). `tasks[]`, `handoffs[]`,
 * and `conversation_log[]` are a SYNTHETIC EXTENSION this suite defines -- no live table or
 * runtime backs them; they exist only within suite fixtures/checks (PLAN-TO-EXEC TESTING review
 * finding: the live resolver has no task/handoff concept, so MAST modes about tasks/handoffs
 * (which the design's own taxonomy requires) have no live schema to check against).
 */
import { STANDARD_VENTURE_TEMPLATE } from '../../../agents/venture-ceo-factory.js';
import { templateToBaseRows, resolveVentureRoles } from '../../role-registry-resolver.mjs';

export const MOCK_VENTURE_ID = 'org-acceptance-suite-mock-venture';

function buildPinsForAllRoles(baseRows) {
  return baseRows.map((row) => ({ role_key: row.role_key, base_version: 1, overlay_version: null }));
}

/** Deep clone via structuredClone (Node >=17) -- every fixture mutates a fresh copy. */
export function cloneOrganization(organization) {
  return structuredClone(organization);
}

/**
 * Builds the clean, well-formed mock-venture organization: real ceo/executives/crews resolved
 * from the live role registry's data model, plus a synthetic tasks/handoffs/conversation_log set
 * that satisfies every check in lib/org/acceptance-suite/checks/mast/*.mjs and
 * checks/integrity/*.mjs (the integrity checks don't read this object at all -- they query the
 * live database directly -- so this fixture only needs to satisfy the 14 MAST checks).
 */
export function buildMockVentureOrganization() {
  const baseRows = templateToBaseRows(STANDARD_VENTURE_TEMPLATE);
  const pins = buildPinsForAllRoles(baseRows);
  const { ceo, executives, crews, budget_distribution } = resolveVentureRoles(
    baseRows, [], pins, MOCK_VENTURE_ID, STANDARD_VENTURE_TEMPLATE.budget_distribution,
  );

  const conversation_log = [
    { turn: 1, task_id: 'task-strategy-review', role: 'VP_STRATEGY', content: 'Reviewing market TAM inputs.', refs_prior_turn: null },
    { turn: 2, task_id: 'task-strategy-review', role: 'VP_STRATEGY', content: 'TAM calculation complete, drafting output.', refs_prior_turn: 1 },
  ];

  const tasks = [
    {
      id: 'task-strategy-review',
      owner_role: 'VP_STRATEGY',
      spec: {
        goal_topic: 'market_sizing',
        required_capability: 'tam_calculation',
        expected_output_fields: ['tam_usd', 'methodology'],
        termination_condition: 'tam_usd computed and methodology documented',
        ambiguous_input: false,
        required_context_refs: [1],
        completion_checklist: ['tam_usd_present', 'methodology_present'],
        verification_required_checks: ['tam_usd_is_number', 'methodology_non_empty'],
        reasoning_action_rule: { if_reasoning_contains: 'complete', expected_action: 'submit_output' },
      },
      contributions: [
        { role: 'VP_STRATEGY', input: 'market_data_snapshot' },
        { role: 'VP_PRODUCT', input: 'competitive_positioning_note' },
      ],
      history: [
        { step: 1, description: 'gather_market_data' },
        { step: 2, description: 'compute_tam' },
        { step: 3, description: 'draft_methodology_note' },
      ],
      produced: {
        output: { tam_usd: 42_000_000, methodology: 'top-down category sizing' },
        output_topic: 'market_sizing',
        incorporated_inputs: ['market_data_snapshot', 'competitive_positioning_note'],
        terminated: true,
        termination_condition_met: true,
        completion_status: { tam_usd_present: true, methodology_present: true },
        verification: { claimed_pass: true, actual_pass: true, covers: ['tam_usd_is_number', 'methodology_non_empty'] },
        stated_reasoning: 'Analysis is complete and output meets the acceptance criteria.',
        action_taken: 'submit_output',
      },
    },
  ];

  const handoffs = [
    {
      id: 'handoff-strategy-to-product',
      sender_role: 'VP_STRATEGY',
      receiver_role: 'VP_PRODUCT',
      receiver_declared_needs: ['tam_usd', 'methodology'],
      payload: { tam_usd: 42_000_000, methodology: 'top-down category sizing' },
    },
    {
      id: 'handoff-product-to-tech',
      sender_role: 'VP_PRODUCT',
      receiver_role: 'VP_TECH',
      receiver_declared_needs: ['feature_spec'],
      payload: { feature_spec: 'MVP scope v1' },
    },
  ];

  return { ceo, executives, crews, budget_distribution, tasks, handoffs, conversation_log };
}
