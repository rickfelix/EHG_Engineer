/**
 * SD-LEO-INFRA-PHASE-SCOPED-FENCE-001 FR-3/TS-4 — WAIT-ceiling exemption.
 *
 * ValidationOrchestrator escalates a perpetually-WAITing gate to a real FAIL after
 * WAIT_MAX_ATTEMPTS (10) or WAIT_MAX_WALL_CLOCK_MS (24h), so a transient race window
 * can't loop forever. A gate that opts in via `exemptFromWaitCeiling: true` must NEVER
 * be escalated (exec_boundary_hold is a deliberate, possibly multi-day park) -- while
 * an ordinary WAIT gate (the control) must still escalate exactly as before, proving
 * no global regression.
 */
import { describe, it, expect } from 'vitest';
import { ValidationOrchestrator } from './ValidationOrchestrator.js';
import { buildWaitResult } from '../../../../lib/handoff/wait-verdict.js';

// Constructor requires a truthy supabase client; preloadGateContexts short-circuits
// for gate names that don't map to a known numbered rule (our synthetic names below),
// so a minimal stub is sufficient -- no real DB calls happen on this test path.
const stubSupabase = {};

function alwaysWaitGate(name, extra = {}) {
  return {
    name,
    required: true,
    validator: async () => buildWaitResult({ wait_reason: `${name}: still waiting` }),
    ...extra,
  };
}

describe('SD-LEO-INFRA-PHASE-SCOPED-FENCE-001 FR-3/TS-4: WAIT-ceiling exemption', () => {
  it('an exempt gate stays WAIT even after 11 simulated prior attempts (ceiling would normally trip at 10)', async () => {
    const orchestrator = new ValidationOrchestrator(stubSupabase);
    const gate = alwaysWaitGate('EXEC_BOUNDARY_HOLD_TEST', { exemptFromWaitCeiling: true });
    const context = {
      sd: { sd_type: 'infrastructure' },
      waitStateByGate: { EXEC_BOUNDARY_HOLD_TEST: { wait_attempts: 11, first_wait_at: '2020-01-01T00:00:00Z' } },
    };
    const results = await orchestrator.validateGates([gate], context);
    expect(results.waitVerdict).toBe(true);
    expect(results.waitingGates).toContain('EXEC_BOUNDARY_HOLD_TEST');
    expect(results.failedGate).not.toBe('EXEC_BOUNDARY_HOLD_TEST');
    expect(results.passed).toBe(false); // still blocked -- just not a FAIL
  });

  it('an exempt gate stays WAIT even after >24h simulated elapsed wall-clock', async () => {
    const orchestrator = new ValidationOrchestrator(stubSupabase);
    const gate = alwaysWaitGate('EXEC_BOUNDARY_HOLD_TEST', { exemptFromWaitCeiling: true });
    const context = {
      sd: { sd_type: 'infrastructure' },
      waitStateByGate: { EXEC_BOUNDARY_HOLD_TEST: { wait_attempts: 1, first_wait_at: '2020-01-01T00:00:00Z' } }, // decades ago
    };
    const results = await orchestrator.validateGates([gate], context);
    expect(results.waitVerdict).toBe(true);
    expect(results.failedGate).toBeNull();
  });

  it('CONTROL: a non-exempt gate DOES escalate to FAIL past the same ceiling (no global regression)', async () => {
    const orchestrator = new ValidationOrchestrator(stubSupabase);
    const gate = alwaysWaitGate('ORDINARY_WAIT_GATE_TEST'); // no exemptFromWaitCeiling
    const context = {
      sd: { sd_type: 'infrastructure' },
      waitStateByGate: { ORDINARY_WAIT_GATE_TEST: { wait_attempts: 11, first_wait_at: '2020-01-01T00:00:00Z' } },
    };
    const results = await orchestrator.validateGates([gate], context);
    expect(results.waitVerdict).toBe(false);
    expect(results.failedGate).toBe('ORDINARY_WAIT_GATE_TEST');
    expect(results.issues.some((i) => i.includes('WAIT_LIMIT_EXCEEDED') || i.includes('WAIT_TIMEOUT_EXCEEDED'))).toBe(true);
  });

  it('CONTROL: a non-exempt gate stays WAIT below the ceiling (baseline, byte-identical to pre-SD behavior)', async () => {
    const orchestrator = new ValidationOrchestrator(stubSupabase);
    const gate = alwaysWaitGate('ORDINARY_WAIT_GATE_TEST');
    const context = { sd: { sd_type: 'infrastructure' }, waitStateByGate: {} }; // first wait, attempts=0
    const results = await orchestrator.validateGates([gate], context);
    expect(results.waitVerdict).toBe(true);
    expect(results.failedGate).toBeNull();
  });
});

describe('SD-LEO-INFRA-FIX-JOURNEY-WALK-001 FR-3: per-wait-REASON exemption (buildWaitResult\'s own flag)', () => {
  // Production-realistic: only ONE gate (e.g. PREREQUISITE_HANDOFF_CHECK) runs, and its
  // wait state is read via the scalar context.waitState -- NOT context.waitStateByGate,
  // which is a test-only fixture shape (TESTING/PLAN finding). Using the scalar here
  // proves the fix works on the shape production actually produces.
  function journeyWalkWaitGate(exemptFromWaitCeiling) {
    return {
      name: 'PREREQUISITE_HANDOFF_CHECK',
      required: true,
      validator: async () => buildWaitResult({
        wait_reason: 'journey walk not yet attempted',
        exemptFromWaitCeiling,
      }),
      // deliberately NO gate.exemptFromWaitCeiling -- the exemption lives on the RESULT only
    };
  }

  it('a WAIT result carrying exemptFromWaitCeiling=true is exempt even past the ceiling (25h old, attempts=1)', async () => {
    const orchestrator = new ValidationOrchestrator(stubSupabase);
    const gate = journeyWalkWaitGate(true);
    const context = {
      sd: { sd_type: 'orchestrator' },
      waitState: { wait_attempts: 1, first_wait_at: '2020-01-01T00:00:00Z' },
    };
    const results = await orchestrator.validateGates([gate], context);
    expect(results.waitVerdict).toBe(true);
    expect(results.failedGate).toBeNull();
  });

  it('NEGATIVE CONTROL: a WAIT result WITHOUT the exemption (e.g. a crashed walk, status=error) still escalates to FAIL at the same ceiling', async () => {
    const orchestrator = new ValidationOrchestrator(stubSupabase);
    const gate = journeyWalkWaitGate(false); // mirrors prerequisite-check.js excluding status='error' from the exemption
    const context = {
      sd: { sd_type: 'orchestrator' },
      waitState: { wait_attempts: 1, first_wait_at: '2020-01-01T00:00:00Z' },
    };
    const results = await orchestrator.validateGates([gate], context);
    expect(results.waitVerdict).toBe(false);
    expect(results.failedGate).toBe('PREREQUISITE_HANDOFF_CHECK');
    expect(results.issues.some((i) => i.includes('WAIT_TIMEOUT_EXCEEDED'))).toBe(true);
  });

  it('NEGATIVE CONTROL: a DIFFERENT wait reason from the same gate name is NOT exempted just because this gate can sometimes emit an exempt result', async () => {
    // Simulates children-incomplete WAIT (no exemptFromWaitCeiling on the result) from the
    // SAME gate name that, on a different call, emits an exempt journey-walk WAIT -- proves
    // the exemption is per-RESULT, not accidentally cached/leaked per-gate-name.
    const orchestrator = new ValidationOrchestrator(stubSupabase);
    const gate = {
      name: 'PREREQUISITE_HANDOFF_CHECK',
      required: true,
      validator: async () => buildWaitResult({ wait_reason: 'children incomplete' }), // no exemption
    };
    const context = {
      sd: { sd_type: 'orchestrator' },
      waitState: { wait_attempts: 1, first_wait_at: '2020-01-01T00:00:00Z' },
    };
    const results = await orchestrator.validateGates([gate], context);
    expect(results.waitVerdict).toBe(false);
    expect(results.failedGate).toBe('PREREQUISITE_HANDOFF_CHECK');
  });
});
