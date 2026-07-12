/**
 * Integration test (live DB) for SD-LEO-INFRA-PHASE-SCOPED-FENCE-001.
 * Self-skips without a real DB (describeDb).
 *
 * TS-1/TS-2 (e2e-in-spec, fence-family doctrine): a real fixture SD row is set to
 * exec_boundary_hold=true, and the EXEC_BOUNDARY_HOLD gate (the exact function the
 * real PLAN-TO-EXEC executor registers) is run against the FETCHED row -- proving the
 * gate reads a genuine strategic_directives_v2.metadata shape, not just a synthetic
 * mock. It returns a named WAIT. The flag is then cleared and the same gate re-run
 * against the re-fetched row, proving it now passes with no other change.
 *
 * Complements (does not duplicate) tests/unit/fleet/exec-boundary-hold-claim-eligibility.test.js
 * (claim-allowed) and scripts/modules/handoff/executors/plan-to-exec/gates/
 * exec-boundary-hold.test.js (pure gate unit tests against synthetic ctx.sd).
 */
import { afterAll, beforeAll, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { describeDb, itDb, HAS_REAL_DB } from '../helpers/db-available.js';
import { createExecBoundaryHoldGate } from '../../scripts/modules/handoff/executors/plan-to-exec/gates/exec-boundary-hold.js';
import { classifyAllDispatchIneligibility } from '../../lib/fleet/claim-eligibility.cjs';

const db = HAS_REAL_DB ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;
let fixtureSdKey;

describeDb('SD-LEO-INFRA-PHASE-SCOPED-FENCE-001: exec_boundary_hold full lifecycle (real DB row)', () => {
  beforeAll(async () => {
    // Deliberately NOT prefixed SD-TEST-/SD-DEMO- (TEST_FIXTURE_KEY_RE in
    // claim-eligibility.cjs would exclude it via the UNRELATED test_fixture_key axis,
    // which would falsely satisfy the "claim-allowed" assertion below for the wrong
    // reason). SD-FIXTURE- is still an obvious disposable-fixture key.
    fixtureSdKey = `SD-FIXTURE-EXEC-BOUNDARY-HOLD-${randomUUID().slice(0, 8)}`;
    const { error } = await db.from('strategic_directives_v2').insert({
      id: fixtureSdKey,
      sd_key: fixtureSdKey,
      title: 'exec_boundary_hold lifecycle fixture',
      status: 'in_progress',
      category: 'Infrastructure',
      priority: 'low',
      sd_type: 'infrastructure',
      description: 'disposable fixture for SD-LEO-INFRA-PHASE-SCOPED-FENCE-001 e2e test',
      rationale: 'disposable fixture',
      scope: 'disposable fixture',
      sequence_rank: 999999,
      metadata: { exec_boundary_hold: true, exec_boundary_hold_reason: 'e2e test — parked behind fixture dependency' },
    });
    if (error) throw error;
  });

  afterAll(async () => {
    if (!fixtureSdKey) return;
    await db.from('strategic_directives_v2').delete().eq('sd_key', fixtureSdKey);
  });

  itDb('TS-1: gate returns a named WAIT against the real fetched row, and claim eligibility is unaffected', async () => {
    const { data: sd, error } = await db.from('strategic_directives_v2').select('*').eq('sd_key', fixtureSdKey).single();
    if (error) throw error;

    const gate = createExecBoundaryHoldGate();
    const result = await gate.validator({ sd });
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(true);
    expect(result.wait_reason).toContain('parked behind fixture dependency');

    // claim-allowed: the SAME real row must be fully claimable on this axis.
    expect(classifyAllDispatchIneligibility(sd)).toEqual([]);
  });

  itDb('TS-2: clearing the flag on the same row unblocks the gate with no other change', async () => {
    const { error: updateError } = await db
      .from('strategic_directives_v2')
      .update({
        metadata: {
          exec_boundary_hold: false,
          exec_boundary_hold_reason: 'e2e test — parked behind fixture dependency',
          exec_boundary_hold_cleared_at: new Date().toISOString(),
          exec_boundary_hold_cleared_by: 'exec-boundary-hold-lifecycle.db.test.js',
        },
      })
      .eq('sd_key', fixtureSdKey);
    if (updateError) throw updateError;

    const { data: sd, error } = await db.from('strategic_directives_v2').select('*').eq('sd_key', fixtureSdKey).single();
    if (error) throw error;

    const gate = createExecBoundaryHoldGate();
    const result = await gate.validator({ sd });
    expect(result.passed).toBe(true);
  });
});
