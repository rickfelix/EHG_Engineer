/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-C: proves the self-judge rejection is a
 * real DB-enforced constraint, not a convention -- a same-session insert is rejected
 * at both the application layer (recordWitnessEvent) and the DB layer (raw insert
 * bypassing the helper), while a distinct-session insert succeeds.
 */

import { describe, it, expect } from 'vitest';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { recordWitnessEvent } from '../../../lib/eva/record-witness-event.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('gate_witness_events self-judge rejection proof (live)', () => {
  it('recordWitnessEvent() rejects witness_session_id === judged_session_id at the application layer', async () => {
    const sessionId = `self-judge-app-${Date.now()}`;
    await expect(
      recordWitnessEvent(supabase, {
        gateId: 'TEST_SELF_JUDGE_GATE',
        witnessSessionId: sessionId,
        judgedSessionId: sessionId,
        verdict: 'witnessed',
      })
    ).rejects.toThrow(/cannot witness its own work/);
  });

  it('a raw same-session INSERT (bypassing the helper) is rejected by the DB CHECK constraint', async () => {
    const sessionId = `self-judge-db-${Date.now()}`;
    const { data, error } = await supabase.from('gate_witness_events').insert({
      gate_id: 'TEST_SELF_JUDGE_GATE',
      witness_session_id: sessionId,
      judged_session_id: sessionId,
      verdict: 'witnessed',
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/chk_witness_not_self_judged|constraint/i);
  });

  it('recordWitnessEvent() succeeds when witness_session_id !== judged_session_id', async () => {
    const row = await recordWitnessEvent(supabase, {
      gateId: 'TEST_SELF_JUDGE_GATE',
      witnessSessionId: `self-judge-witness-${Date.now()}`,
      judgedSessionId: `self-judge-judged-${Date.now()}`,
      verdict: 'witnessed',
    });

    expect(row.gate_id).toBe('TEST_SELF_JUDGE_GATE');
    expect(row.witness_session_id).not.toBe(row.judged_session_id);

    // Cleanup
    await supabase.from('gate_witness_events').delete().eq('id', row.id);
  });

  it('recordWitnessEvent() rejects an invalid verdict', async () => {
    await expect(
      recordWitnessEvent(supabase, {
        gateId: 'TEST_SELF_JUDGE_GATE',
        witnessSessionId: 'v-witness',
        judgedSessionId: 'v-judged',
        verdict: 'maybe',
      })
    ).rejects.toThrow(/verdict must be/);
  });
});
