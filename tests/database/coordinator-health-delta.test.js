// AC-6 (recurred-family discipline): the sharpenings exercised on the LIVE path,
// read-only — real DB, real functions, no mocks. Skips cleanly without env.
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  computeOutcomeFlow, fetchStuckWithoutHold, FAILURE_CLASSES,
} from '../../lib/oversight/coordinator-health-sharpenings.mjs';
import { computeSharpenings } from '../../scripts/adam-coordinator-health.mjs';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const live = url && key ? it : it.skip;
const sb = url && key ? createClient(url, key) : null;

describe('coordinator-health delta — live path (read-only)', () => {
  live('computeOutcomeFlow returns a measured or null-shaped reading from real data', async () => {
    const r = await computeOutcomeFlow(sb);
    expect(['measured', 'no_cohort']).toContain(r.status);
    if (r.status === 'measured') {
      expect(r.cohort_size).toBeGreaterThan(0);
      expect(r.conversion).toBeGreaterThanOrEqual(0);
      expect(r.conversion).toBeLessThanOrEqual(1);
    }
  }, 30000);

  live('fetchStuckWithoutHold returns rows that all genuinely lack hold provenance', async () => {
    const rows = await fetchStuckWithoutHold(sb);
    for (const r of rows) {
      expect(r.claiming_session_id).toBeNull();
      expect(r.sd_type).not.toBe('orchestrator');
    }
  }, 30000);

  live('computeSharpenings produces exactly the six classes + a band verdict on live data', async () => {
    const utilization = { idle: 0, dispatchable_backlog_size: 0 };
    const integrity = { integrity_ok: true, divergent_fields: [] };
    const s = await computeSharpenings(sb, { utilization, integrity, gitGrep: () => 'unverifiable' });
    expect(s.failureClasses.map((c) => c.cls)).toEqual([...FAILURE_CLASSES]);
    expect(typeof s.bandVerdict.band_ok).toBe('boolean');
  }, 60000);
});
