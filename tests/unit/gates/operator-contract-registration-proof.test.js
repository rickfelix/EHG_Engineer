/**
 * SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001 — REGISTRATION PROOF (TS-7, the top risk).
 *
 * Two gates in this exact space are DEAD CODE: runtime-probe-coverage-gate.js shipped as
 * "the NEW BLOCKING gate" and was never pushed, and integration-smoke-test-gate.js is
 * unregistered AND returns {name, description, category, run} while the pipeline invokes
 * gate.validator(ctx). Both have "tests" — which live under tests/integration/ and therefore
 * execute ZERO times, because vitest.config.js routes that path to the db project and the db
 * project is disabled (assessDbTarget -> no_designated_target).
 *
 * So: file existence is NOT acceptance, and neither is a test that never runs. This file is
 * deliberately UNIT tier so it actually executes, and it asserts the arm is REACHED — present
 * in the real getRequiredGates() output, carrying the interface the pipeline actually calls,
 * and returning a real verdict when invoked.
 *
 * HOLE C is pinned here too: the orchestrator-child early return at plan-to-lead/index.js:259
 * precedes the operator-contract push at :361, so child SDs are structurally excluded. That is
 * recorded as a NAMED miss class (FR-4) rather than silently tolerated — the assertion below
 * fails the moment someone changes it in either direction, forcing a deliberate decision.
 */
import { describe, it, expect } from 'vitest';
import { PlanToLeadExecutor } from '../../../scripts/modules/handoff/executors/plan-to-lead/index.js';

const GATE_NAME_FRAGMENT = /operator[_-]?contract/i;

/** Minimal SD shaped like a normal (non-child) SD. */
const normalSd = () => ({ id: 'sd-uuid', sd_key: 'SD-TEST-001', metadata: {}, target_application: 'EHG_Engineer' });
/** An orchestrator child — the hole-C shape. */
const childSd = () => ({ id: 'sd-uuid-child', sd_key: 'SD-TEST-CHILD-001', metadata: { parent_orchestrator: 'SD-PARENT-001' } });

const supabaseStub = { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) };
const makeExecutor = () => new PlanToLeadExecutor({ supabase: supabaseStub });

const gateNames = (gates) => gates.map((g) => String(g?.name || ''));
const findOperatorGate = (gates) => gates.find((g) => GATE_NAME_FRAGMENT.test(String(g?.name || '')));

describe('TS-7 registration proof — the arm is REACHED, not merely written', () => {
  it('operator-contract is present in the REAL getRequiredGates() output for a normal SD', async () => {
    const gates = await makeExecutor().getRequiredGates(normalSd(), {});
    const found = findOperatorGate(gates);
    expect(found, `operator-contract gate absent from getRequiredGates(); names were: ${gateNames(gates).join(', ')}`).toBeDefined();
  });

  it('it exposes validator(), the method the pipeline actually calls', async () => {
    // THE SINGLE ASSERTION that would have caught integration-smoke-test-gate.js, which
    // exports run() instead — registered-looking, and structurally uncallable.
    const found = findOperatorGate(await makeExecutor().getRequiredGates(normalSd(), {}));
    expect(typeof found.validator).toBe('function');
    expect(found.run, 'a run() method means the wrong interface — the pipeline calls validator()').toBeUndefined();
  });

  it('invoking that validator returns a real verdict shape, not a throw or undefined', async () => {
    // Reached AND callable AND answering. File existence proves none of these three.
    const found = findOperatorGate(await makeExecutor().getRequiredGates(normalSd(), {}));
    const verdict = await found.validator({ sd: normalSd(), sd_id: 'sd-uuid', sdId: 'SD-TEST-001', handoffType: 'PLAN-TO-LEAD' });
    expect(verdict).toBeTypeOf('object');
    expect(verdict).not.toBeNull();
    expect(verdict).toHaveProperty('passed');
  });
});

describe('FR-4 HOLE C — orchestrator children are a NAMED miss class, not a silent gap', () => {
  it('records that child SDs do NOT receive the operator-contract arm', async () => {
    // plan-to-lead/index.js:259 early-returns a reduced gate set for orchestrator children,
    // and that return precedes the push at :361. The arm can be correct, registered, and pass
    // every other test here while never evaluating a large share of the fleet.
    //
    // This assertion DOCUMENTS the exclusion rather than accepting it quietly. If someone moves
    // the push inside the child branch, this test fails and they must delete it deliberately —
    // which is the point: the miss class cannot change without someone noticing.
    const gates = await makeExecutor().getRequiredGates(childSd(), {});
    expect(findOperatorGate(gates), 'HOLE C changed: child SDs now DO get the arm. That may be correct — update FR-4 miss classes and remove this assertion deliberately.').toBeUndefined();
  });

  it('the child gate set is genuinely reduced (guards against the fixture silently not being a child)', async () => {
    // Two-sided: if childSd() stopped being recognised as a child, the test above would pass
    // for the wrong reason. Comparing the two sets proves the branch actually fired.
    const normal = gateNames(await makeExecutor().getRequiredGates(normalSd(), {}));
    const child = gateNames(await makeExecutor().getRequiredGates(childSd(), {}));
    expect(child.length).toBeLessThan(normal.length);
  });
});
