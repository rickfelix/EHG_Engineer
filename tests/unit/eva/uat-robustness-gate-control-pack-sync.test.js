/**
 * Regression test for SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001 FR-4.
 *
 * FR-4 keeps lib/eva/uat-robustness-gate.js's reader UNMODIFIED (it already keys correctly on
 * the boolean control_pack_evaluated, per QF-20260830-666) and instead makes the boolean
 * un-stale-able via FR-3's trigger. This test asserts the reader's satisfied/unsatisfied
 * verdict can never independently disagree with what FR-3's trigger predicate would derive,
 * across every control_pack_status shape exercised by the migration's own dry-run proof
 * (database/chairman-gated/20260913_uat_control_pack_evaluated_derive_dry_run.mjs).
 *
 * deriveControlPackEvaluated() below is a pure-JS mirror of the trigger's SQL predicate (all 4
 * required keys present AND none equals 'not_attempted') -- kept here as a fixture generator,
 * not as a second production implementation of the derivation.
 */
import { describe, it, expect, vi } from 'vitest';
import { checkUatRobustnessGate } from '../../../lib/eva/uat-robustness-gate.js';

const REQUIRED_CONTROLS = ['fence_two_sidedness', 'canary_mutation_control', 'live_deployment_binding', 'minimum_assertion_manifest'];

function deriveControlPackEvaluated(status) {
  if (!status || typeof status !== 'object') return false;
  return REQUIRED_CONTROLS.every((k) => Object.prototype.hasOwnProperty.call(status, k) && status[k] !== 'not_attempted');
}

const MARKED_STAGE = { gates: { uat_robustness_required: true } };
const OPTED_IN_VENTURE = { uat_robustness_probe_required: true };

function buildSupabase(run) {
  return {
    from: vi.fn((table) => {
      if (table === 'venture_stages') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: MARKED_STAGE }, error: null }) })) })) };
      }
      if (table === 'ventures') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: OPTED_IN_VENTURE }, error: null }) })) })) };
      }
      if (table === 'uat_test_runs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: run, error: null }) })) })),
              })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

const FIXTURES = [
  {
    name: 'fully evaluated (TS-1 shape)',
    status: { fence_two_sidedness: 'evaluated', canary_mutation_control: 'evaluated', live_deployment_binding: 'evaluated', minimum_assertion_manifest: 'evaluated' },
  },
  {
    name: 'live row 84d310e1 shape (3 of 4 not_attempted)',
    status: { fence_two_sidedness: 'not_attempted', canary_mutation_control: 'not_attempted', live_deployment_binding: 'not_attempted', minimum_assertion_manifest: 'evaluated' },
  },
  {
    name: '1 waived control, others evaluated (TS-2f)',
    status: { fence_two_sidedness: 'waived: chairman-approved', canary_mutation_control: 'evaluated', live_deployment_binding: 'evaluated', minimum_assertion_manifest: 'evaluated' },
  },
  {
    name: '1 of 4 required keys absent (TS-2g)',
    status: { fence_two_sidedness: 'evaluated', canary_mutation_control: 'evaluated', live_deployment_binding: 'evaluated' },
  },
  {
    name: 'control_pack_status absent entirely (TS-2d)',
    status: undefined,
  },
];

describe('uat-robustness-gate reader vs FR-3 trigger predicate agreement', () => {
  for (const fixture of FIXTURES) {
    it(`reader's satisfied verdict matches the trigger-derived value for: ${fixture.name}`, async () => {
      const derivedEvaluated = deriveControlPackEvaluated(fixture.status);
      const run = {
        id: 'run-1',
        status: 'completed',
        metadata: {
          quality_gate: 'GREEN',
          control_pack_evaluated: derivedEvaluated,
          control_pack_status: fixture.status,
        },
      };
      const supabase = buildSupabase(run);
      const result = await checkUatRobustnessGate(supabase, 'venture-1', 20);
      expect(result.satisfied).toBe(derivedEvaluated);
    });
  }

  it('never derives satisfied=true from control_pack_failures alone (the ambiguous field FR-3 deliberately does not read)', async () => {
    // A run with control_pack_failures=null (ambiguous: could mean "all passed" or "never run")
    // but control_pack_evaluated correctly false (per the trigger, since control_pack_status
    // shows incomplete coverage) must NOT satisfy the gate -- proves the reader is not
    // secretly keying off control_pack_failures presence/absence.
    const run = {
      id: 'run-2',
      status: 'completed',
      metadata: {
        quality_gate: 'GREEN',
        control_pack_evaluated: false,
        control_pack_failures: null,
        control_pack_status: { fence_two_sidedness: 'not_attempted', canary_mutation_control: 'not_attempted', live_deployment_binding: 'not_attempted', minimum_assertion_manifest: 'evaluated' },
      },
    };
    const supabase = buildSupabase(run);
    const result = await checkUatRobustnessGate(supabase, 'venture-1', 20);
    expect(result.satisfied).toBe(false);
  });
});
