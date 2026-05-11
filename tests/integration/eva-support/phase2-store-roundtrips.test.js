/**
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / TEST-4, TEST-5, TEST-7, TEST-10, US-003, US-004, US-006
 *
 * End-to-end integration test against the real Supabase DB. Exercises every
 * Phase 2 store helper:
 *   - decision-log-store.insertEntry / recentEntries / entriesForTask
 *   - research-cache.set / get / purgeByQueryHash
 *   - friday-outcome-bridge.writeOutcome / surfacePending CAS
 *
 * Tests are idempotent — every test cleans up its inserted rows in afterAll.
 *
 * Requires:
 *   - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 *   - All 3 migrations applied (eva_support_decision_log, eva_support_research_cache, eva_friday_outcomes)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { insertEntry, recentEntries, entriesForTask } from '../../../lib/eva-support/decision-log-store.js';
import { get, set, hashQuery, purgeByQueryHash } from '../../../lib/eva-support/research-cache.js';
import { surfacePending, writeOutcome } from '../../../lib/eva-support/friday-outcome-bridge.js';

const TEST_TASK_ID_PREFIX = 'integration-test-' + Date.now() + '-';
const TEST_QUERY_PREFIX = 'integration-test-query-' + Date.now() + '-';
const TEST_AGENDA_PREFIX = 'integration-test-agenda-' + Date.now() + '-';

let supabase;

beforeAll(() => {
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
});

afterAll(async () => {
  // Clean up: remove test rows from all 3 tables.
  await supabase.from('eva_support_decision_log').delete().like('task_id', `${TEST_TASK_ID_PREFIX}%`);
  // research_cache: identified by query_text prefix
  const { data: cacheRows } = await supabase
    .from('eva_support_research_cache')
    .select('query_hash')
    .like('query_text', `${TEST_QUERY_PREFIX.toLowerCase()}%`);
  for (const r of cacheRows || []) {
    await supabase.from('eva_support_research_cache').delete().eq('query_hash', r.query_hash);
  }
  await supabase.from('eva_friday_outcomes').delete().like('agenda_item_ref', `${TEST_AGENDA_PREFIX}%`);
});

function envelope(overrides = {}) {
  // Build base envelope, then apply non-task_id overrides via spread, then set
  // the prefixed task_id last so a `task_id` override is used as a SUFFIX only.
  const { task_id: suffix, ...rest } = overrides;
  return {
    schema_version: '1.0',
    task_id: TEST_TASK_ID_PREFIX + (suffix || 't1'),
    sequence: 1,
    timestamp: new Date().toISOString(),
    flow: 'decision',
    eva_reply_summary: 'pick option A',
    operator_input_summary: 'A or B?',
    override_reason: null,
    model: 'claude-opus-4-7',
    tokens_in: 50,
    tokens_out: 25,
    references: [],
    ...rest,
  };
}

describe('decision-log-store integration (real DB)', () => {
  it('inserts an entry, reads it back via entriesForTask, recentEntries surfaces it', async () => {
    const e = envelope({ task_id: 'roundtrip-1' });
    const insertResult = await insertEntry(e);
    expect(insertResult.inserted).toBe(true);
    expect(insertResult.verified).toBe(true);

    const fetched = await entriesForTask(e.task_id);
    expect(fetched).toHaveLength(1);
    expect(fetched[0].eva_reply_summary).toBe('pick option A');
    expect(fetched[0].schema_version).toBe('1.0');

    const recent = await recentEntries({ since: new Date(Date.now() - 3600000), limit: 50 });
    expect(recent.some((r) => r.task_id === e.task_id)).toBe(true);
  });

  it('returns inserted:false on duplicate (task_id, sequence) — idempotent', async () => {
    const e = envelope({ task_id: 'idempotent-1' });
    const first = await insertEntry(e);
    expect(first.inserted).toBe(true);

    const second = await insertEntry(e);
    expect(second.inserted).toBe(false);
    expect(second.verified).toBe(true);
  });

  it('preserves schema_version=1.0 CHECK constraint — rejects other values', async () => {
    const bad = envelope({ task_id: 'schema-version-check', schema_version: '2.0' });
    await expect(insertEntry(bad)).rejects.toThrow();
  });
});

describe('research-cache integration (real DB)', () => {
  it('set → get round-trip returns the cached response', async () => {
    const q = TEST_QUERY_PREFIX + 'roundtrip query';
    const written = await set(q, 'the response text', { references: ['ref1'] });
    expect(written.written).toBe(true);

    const got = await get(q);
    expect(got.hit).toBe(true);
    expect(got.response).toBe('the response text');
    expect(got.references).toEqual(['ref1']);
    expect(got.hash).toBe(hashQuery(q));
  });

  it('hash normalization makes case + whitespace variants resolve to same cache entry', async () => {
    const q1 = TEST_QUERY_PREFIX + 'CASE TEST';
    const q2 = TEST_QUERY_PREFIX + 'case test';

    await set(q1, 'cached body');
    const got = await get('  ' + TEST_QUERY_PREFIX.toLowerCase() + 'CASE   TEST  ');
    expect(got.hit).toBe(true);
    expect(got.response).toBe('cached body');
  });

  it('purgeByQueryHash removes a specific entry', async () => {
    const q = TEST_QUERY_PREFIX + 'purge target';
    await set(q, 'will be deleted');
    const hash = hashQuery(q);

    const before = await get(q);
    expect(before.hit).toBe(true);

    const { deleted } = await purgeByQueryHash(hash);
    expect(deleted).toBe(1);

    const after = await get(q);
    expect(after.hit).toBe(false);
  });
});

describe('friday-outcome-bridge integration (real DB)', () => {
  it('writeOutcome → surfacePending CAS round-trip', async () => {
    const ref = TEST_AGENDA_PREFIX + 'cas-1';
    const written = await writeOutcome({
      agendaItemRef: ref,
      outcome: 'accepted',
      chairmanFeedback: 'go for it',
      meetingDate: '2026-05-09',
    });
    expect(written.written).toBe(true);
    expect(written.outcome_id).toBeTruthy();

    // Surface should pick it up and CAS-mark consumed.
    const surfaced = await surfacePending({ limit: 100 });
    const ours = surfaced.find((r) => r.agenda_item_ref === ref);
    expect(ours).toBeTruthy();
    expect(ours.outcome).toBe('accepted');

    // Second surface call: our row should NOT reappear (consumed_at set by CAS).
    const surfacedAgain = await surfacePending({ limit: 100 });
    expect(surfacedAgain.some((r) => r.agenda_item_ref === ref)).toBe(false);
  });

  it('rejects invalid outcome enum', async () => {
    const result = await writeOutcome({
      agendaItemRef: TEST_AGENDA_PREFIX + 'bad-enum',
      outcome: 'invalid',
      meetingDate: '2026-05-09',
    });
    expect(result.written).toBe(false);
    expect(result.error.code).toBe('BAD_OUTCOME');
  });
});

describe('RLS posture (TEST-10 security)', () => {
  it('anon client cannot SELECT from eva_support_decision_log', async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    const { data, error } = await anon.from('eva_support_decision_log').select('task_id').limit(1);
    // Either: error (denied) OR empty data (RLS filtered out). Both satisfy denial posture.
    expect(error !== null || (Array.isArray(data) && data.length === 0)).toBe(true);
  });

  it('anon client cannot SELECT from eva_support_research_cache', async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    const { data, error } = await anon.from('eva_support_research_cache').select('query_hash').limit(1);
    expect(error !== null || (Array.isArray(data) && data.length === 0)).toBe(true);
  });

  it('anon client cannot SELECT from eva_friday_outcomes', async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    const { data, error } = await anon.from('eva_friday_outcomes').select('outcome_id').limit(1);
    expect(error !== null || (Array.isArray(data) && data.length === 0)).toBe(true);
  });
});
