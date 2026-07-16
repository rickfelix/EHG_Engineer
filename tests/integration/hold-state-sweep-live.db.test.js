/**
 * Live-DB integration test (SD-LEO-INFRA-HOLD-STATE-CONTRACT-001, FR-6, TS-5).
 * Self-skips without a real DB (describeDb).
 *
 * TESTING sub-agent evidence explicitly called for "a live test that the sweep
 * actually surfaced a real overdue hold, not just a unit-tested predicate" —
 * this test writes a real fixture row with an overdue park_review_at, runs the
 * EXACT query shape the gauge-runner.mjs resolver uses, and asserts the real
 * fetched row is detected by findOverdueHolds().
 *
 * Disposable SD-FIXTURE- row, deleted in afterAll (mirrors
 * exec-boundary-hold-lifecycle.db.test.js's cleanup convention).
 */
import { afterAll, beforeAll, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { describeDb, itDb, HAS_REAL_DB } from '../helpers/db-available.js';
import { findOverdueHolds } from '../../lib/governance/hold-state-sweep.js';

const db = HAS_REAL_DB ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;
let fixtureSdKey;

describeDb('SD-LEO-INFRA-HOLD-STATE-CONTRACT-001: hold-state sweep (real DB row)', () => {
  beforeAll(async () => {
    fixtureSdKey = `SD-FIXTURE-HOLD-SWEEP-${randomUUID().slice(0, 8)}`;
    const { error } = await db.from('strategic_directives_v2').insert({
      id: fixtureSdKey,
      sd_key: fixtureSdKey,
      title: 'hold-state sweep fixture',
      status: 'deferred',
      category: 'Infrastructure',
      priority: 'low',
      sd_type: 'infrastructure',
      description: 'disposable fixture for SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 live sweep test',
      rationale: 'disposable fixture',
      scope: 'disposable fixture',
      sequence_rank: 999999,
      metadata: {
        park_reason: 'live sweep fixture', parked_by: 'hold-state-sweep-live.db.test.js',
        park_review_at: '2020-01-01T00:00:00Z', // deliberately far in the past
      },
    });
    if (error) throw error;
  });

  afterAll(async () => {
    if (!fixtureSdKey) return;
    await db.from('strategic_directives_v2').delete().eq('sd_key', fixtureSdKey);
  });

  itDb('TS-5: the real fetched row is detected as overdue by the exact resolver query shape', async () => {
    const { data, error } = await db
      .from('strategic_directives_v2')
      .select('sd_key, status, metadata')
      .or('metadata->>park_review_at.not.is.null,metadata->>exec_boundary_hold_review_at.not.is.null,metadata->>min_tier_rank_review_at.not.is.null')
      .limit(5000);
    if (error) throw error;

    const { count, overdue } = findOverdueHolds(data, Date.now());
    expect(count).toBeGreaterThan(0);
    const mine = overdue.find((o) => o.sd_key === fixtureSdKey);
    expect(mine).toMatchObject({ sd_key: fixtureSdKey, surface: 'sd_park', review_at: '2020-01-01T00:00:00Z' });
  });

  itDb('unparking the fixture removes it from the next sweep', async () => {
    const { error: updateError } = await db
      .from('strategic_directives_v2')
      .update({ status: 'draft', metadata: {} })
      .eq('sd_key', fixtureSdKey);
    if (updateError) throw updateError;

    const { data, error } = await db
      .from('strategic_directives_v2')
      .select('sd_key, status, metadata')
      .eq('sd_key', fixtureSdKey);
    if (error) throw error;

    const { overdue } = findOverdueHolds(data, Date.now());
    expect(overdue.find((o) => o.sd_key === fixtureSdKey)).toBeUndefined();
  });
});
