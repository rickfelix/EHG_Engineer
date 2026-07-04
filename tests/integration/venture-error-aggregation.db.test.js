import { beforeAll, afterAll, afterEach, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'crypto';
import { describeDb, itDb, HAS_REAL_DB } from '../helpers/db-available.js';

// SD-LEO-INFRA-UNIVERSAL-VENTURE-TELEMETRY-001
// TS-3: fingerprint aggregation — many identical errors produce ONE row.
// TS-4: per-venture circuit-breaker on distinct-fingerprint storm.
// TS-5: anon role cannot forge occurrence_count/first_seen/last_seen directly.
// TS-7: ingestion revocation is venture-scoped.
//
// All against the LIVE database (no mocks), per each scenario's acceptance criteria.
// Uses a disposable fixture venture (created in beforeAll, deleted in afterAll) so
// these tests never touch a real production venture's rows.

let svc;
let anon;
let ventureId;
let otherVentureId;

function hash(seed) {
  return createHash('sha256').update(seed).digest('hex');
}

beforeAll(async () => {
  if (!HAS_REAL_DB) return;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  anon = createClient(url, anonKey);

  const { data: v1, error: e1 } = await svc.from('ventures')
    .insert({ name: `TS-fixture-${randomUUID()}`, problem_statement: 'fixture for venture-error-aggregation.db.test.js' })
    .select('id').single();
  if (e1) throw e1;
  ventureId = v1.id;

  const { data: v2, error: e2 } = await svc.from('ventures')
    .insert({ name: `TS-fixture-other-${randomUUID()}`, problem_statement: 'fixture for venture-error-aggregation.db.test.js (revocation-isolation control)' })
    .select('id').single();
  if (e2) throw e2;
  otherVentureId = v2.id;
});

afterEach(async () => {
  if (!HAS_REAL_DB) return;
  await svc.from('feedback').delete().eq('feedback_type', 'venture_error').in('venture_id', [ventureId, otherVentureId]);
});

afterAll(async () => {
  if (!HAS_REAL_DB) return;
  await svc.from('feedback').delete().eq('feedback_type', 'venture_error').in('venture_id', [ventureId, otherVentureId]);
  await svc.from('ventures').delete().in('id', [ventureId, otherVentureId]);
});

describeDb('record_venture_error RPC — live aggregation, storm, security, revocation', () => {
  itDb('TS-3: 500 identical errors produce exactly ONE row with occurrence_count=500', async () => {
    const errorHash = hash(`ts3-${randomUUID()}`);
    for (let i = 0; i < 500; i++) {
      const { error } = await anon.rpc('record_venture_error', {
        p_venture_id: ventureId, p_error_hash: errorHash, p_message: 'repeated error', p_context: {},
      });
      expect(error).toBeNull();
    }
    const { data: rows } = await svc.from('feedback')
      .select('id, occurrence_count')
      .eq('venture_id', ventureId).eq('feedback_type', 'venture_error').eq('error_hash', errorHash);
    expect(rows).toHaveLength(1);
    expect(rows[0].occurrence_count).toBe(500);
  }, 30000);

  itDb('TS-4: a storm of many distinct fingerprints from one venture is capped by the per-venture ceiling', async () => {
    const results = [];
    for (let i = 0; i < 30; i++) {
      const { data } = await anon.rpc('record_venture_error', {
        p_venture_id: ventureId, p_error_hash: hash(`ts4-${i}-${randomUUID()}`), p_message: `distinct error ${i}`, p_context: {},
      });
      results.push(data);
    }
    const created = results.filter(r => r?.action === 'created').length;
    const suppressed = results.filter(r => r?.action === 'storm_suppressed').length;
    // Ceiling is 20 distinct fingerprints/hour (record_venture_error RPC) — the 21st+
    // distinct fingerprint in the window must be suppressed, not inserted as its own row.
    expect(created).toBeLessThanOrEqual(20);
    expect(suppressed).toBeGreaterThan(0);
    expect(created + suppressed).toBe(30);
  }, 30000);

  itDb('TS-5: anon cannot forge occurrence_count/first_seen/last_seen via a raw table write', async () => {
    const errorHash = hash(`ts5-${randomUUID()}`);
    // Legitimate path first, so the row exists.
    await anon.rpc('record_venture_error', { p_venture_id: ventureId, p_error_hash: errorHash, p_message: 'seed row', p_context: {} });

    // Attempt to forge via a raw INSERT (bypassing the RPC entirely).
    const { error: insertError } = await anon.from('feedback').insert({
      venture_id: ventureId, feedback_type: 'venture_error', source_type: 'error_capture',
      error_hash: hash(`ts5-forge-${randomUUID()}`), occurrence_count: 99999,
      title: 'forged', description: 'forged', type: 'issue', status: 'new', severity: 'low',
    });
    expect(insertError).not.toBeNull();

    // Attempt to forge via a raw UPDATE on the legitimate row.
    const { data: before } = await svc.from('feedback').select('id, occurrence_count').eq('venture_id', ventureId).eq('error_hash', errorHash).single();
    const { error: updateError } = await anon.from('feedback').update({ occurrence_count: 99999 }).eq('id', before.id);
    const { data: after } = await svc.from('feedback').select('occurrence_count').eq('id', before.id).single();
    // Either the UPDATE is rejected outright, or (no anon UPDATE policy exists at all so
    // PostgREST silently matches zero rows) the value is provably unchanged.
    expect(after.occurrence_count).toBe(before.occurrence_count);
    void updateError;
  }, 30000);

  itDb('TS-7: disabling ingestion for one venture does not affect another venture', async () => {
    await svc.from('ventures').update({ metadata: { telemetry_ingestion_enabled: false } }).eq('id', ventureId);
    try {
      const { data: disabledResult } = await anon.rpc('record_venture_error', {
        p_venture_id: ventureId, p_error_hash: hash(`ts7-disabled-${randomUUID()}`), p_message: 'should be rejected', p_context: {},
      });
      expect(disabledResult).toEqual({ ok: false, reason: 'venture_not_eligible' });

      const { data: otherResult } = await anon.rpc('record_venture_error', {
        p_venture_id: otherVentureId, p_error_hash: hash(`ts7-other-${randomUUID()}`), p_message: 'should still work', p_context: {},
      });
      expect(otherResult.ok).toBe(true);
      expect(otherResult.action).toBe('created');
    } finally {
      await svc.from('ventures').update({ metadata: {} }).eq('id', ventureId);
    }
  }, 30000);
});
