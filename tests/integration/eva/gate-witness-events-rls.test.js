/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-C: proves gate_witness_events writes are
 * RLS-restricted to the service-role connection -- a real permission proof, not a
 * convention. An anon-key client has only a SELECT policy; no INSERT policy exists for
 * it, so RLS default-denies the write.
 */

import { describe, it, expect } from 'vitest';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceClient = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anonClient = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe('gate_witness_events RLS permission proof (live)', () => {
  it('rejects an INSERT from an anon-key connection', async () => {
    const { data, error } = await anonClient.from('gate_witness_events').insert({
      gate_id: 'TEST_RLS_PROOF_GATE',
      witness_session_id: 'anon-attempt-witness',
      judged_session_id: 'anon-attempt-judged',
      verdict: 'witnessed',
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('allows an INSERT from the service-role connection (control case)', async () => {
    const witnessSessionId = `rls-proof-witness-${Date.now()}`;
    const judgedSessionId = `rls-proof-judged-${Date.now()}`;

    const { data, error } = await serviceClient
      .from('gate_witness_events')
      .insert({
        gate_id: 'TEST_RLS_PROOF_GATE',
        witness_session_id: witnessSessionId,
        judged_session_id: judgedSessionId,
        verdict: 'witnessed',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data.gate_id).toBe('TEST_RLS_PROOF_GATE');

    // Cleanup
    await serviceClient.from('gate_witness_events').delete().eq('id', data.id);
  });

  it('allows anon-key SELECT (read policy is intentionally permissive)', async () => {
    const { error } = await anonClient.from('gate_witness_events').select('id').limit(1);
    expect(error).toBeNull();
  });
});
