/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-D: proves the observe-only
 * enforcement rung actually records a live gate_witness_events row (Child C)
 * for a wrapped gate, using the fixed 'gate-harness' witness identity, without
 * altering the gate's own pass/fail result.
 */
import { describe, it, expect, afterEach } from 'vitest';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { withObserveOnlyWitness } from '../../../lib/eva/observe-gate-witness.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const insertedIds = [];

afterEach(async () => {
  if (insertedIds.length) {
    await supabase.from('gate_witness_events').delete().in('id', insertedIds);
    insertedIds.length = 0;
  }
});

describe('observe-only enforcement rung (live)', () => {
  it('records a witnessed verdict for a passing gate, without altering the result', async () => {
    const judgedSessionId = `observe-only-pass-${Date.now()}`;
    const gate = {
      name: 'TEST_OBSERVE_ONLY_GATE',
      validator: async () => ({ passed: true, score: 100, max_score: 100, issues: [], warnings: [] }),
      required: true,
    };
    const wrapped = withObserveOnlyWitness('TEST_OBSERVE_ONLY_GATE', gate);

    const result = await wrapped.validator({ sd: { claiming_session_id: judgedSessionId } });
    expect(result).toEqual({ passed: true, score: 100, max_score: 100, issues: [], warnings: [] });

    const { data, error } = await supabase
      .from('gate_witness_events')
      .select('*')
      .eq('gate_id', 'TEST_OBSERVE_ONLY_GATE')
      .eq('judged_session_id', judgedSessionId)
      .single();

    expect(error).toBeNull();
    expect(data.witness_session_id).toBe('gate-harness');
    expect(data.verdict).toBe('witnessed');
    insertedIds.push(data.id);
  });

  it('records a rejected verdict for a failing gate ("pass" shape, not "passed")', async () => {
    const judgedSessionId = `observe-only-fail-${Date.now()}`;
    const gate = {
      name: 'TEST_OBSERVE_ONLY_GATE',
      validator: async () => ({ pass: false, score: 0, issues: ['missing deliverable'], warnings: [] }),
      required: true,
    };
    const wrapped = withObserveOnlyWitness('TEST_OBSERVE_ONLY_GATE', gate);

    const result = await wrapped.validator({ sd: { claiming_session_id: judgedSessionId } });
    expect(result.pass).toBe(false);

    const { data, error } = await supabase
      .from('gate_witness_events')
      .select('*')
      .eq('gate_id', 'TEST_OBSERVE_ONLY_GATE')
      .eq('judged_session_id', judgedSessionId)
      .single();

    expect(error).toBeNull();
    expect(data.witness_session_id).toBe('gate-harness');
    expect(data.verdict).toBe('rejected');
    insertedIds.push(data.id);
  });

  it('silently records nothing (no throw) when ctx.sd.claiming_session_id is absent', async () => {
    const gate = {
      name: 'TEST_OBSERVE_ONLY_GATE',
      validator: async () => ({ passed: true }),
      required: true,
    };
    const wrapped = withObserveOnlyWitness('TEST_OBSERVE_ONLY_GATE', gate);

    await expect(wrapped.validator({})).resolves.toEqual({ passed: true });
  });

  // SD-LEO-INFRA-GATE-WITNESS-STRENGTH-001 FR-4/TS-5: prove the registry lookup-and-stamp
  // change reaches the D-wrapper path for a REAL wired gate_id (registry-corrected to
  // already_witnessed/cross_actor/convention by this SD) without any change to
  // observe-gate-witness.js itself.
  it('stamps enforcement_strength=convention and is_downgrade=true for the real RETROSPECTIVE_EXISTS gate_id', async () => {
    const judgedSessionId = `observe-only-strength-${Date.now()}`;
    const gate = {
      name: 'RETROSPECTIVE_EXISTS',
      validator: async () => ({ passed: true, score: 100, max_score: 100, issues: [], warnings: [] }),
      required: true,
    };
    const wrapped = withObserveOnlyWitness('RETROSPECTIVE_EXISTS', gate);

    await wrapped.validator({ sd: { claiming_session_id: judgedSessionId } });

    const { data, error } = await supabase
      .from('gate_witness_events')
      .select('*')
      .eq('gate_id', 'RETROSPECTIVE_EXISTS')
      .eq('judged_session_id', judgedSessionId)
      .single();

    expect(error).toBeNull();
    expect(data.enforcement_strength).toBe('convention');
    expect(data.witness_mechanism).toBe('cross_actor');
    expect(data.is_downgrade).toBe(true);
    insertedIds.push(data.id);
  });
});
