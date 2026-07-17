/**
 * Live-DB integration test for the Fable-suitability map writer/reader
 * (SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-A, TS-4).
 *
 * Defeats the mocked-seam trap: the unit tests (tests/unit/fable-suitability/map-writer.test.js)
 * prove the code's control flow against a fake supabase, but they cannot prove the SQL contract —
 * that the UNIQUE(region_key, repo, score_version) key actually preserves history, that the
 * region_key CHECK actually rejects a drifting key, and that v_fable_suitability_map_current
 * actually returns latest-per-region. This suite exercises the REAL table.
 *
 * Two-state design around the STAGED chairman-gate:
 *   - Before the chairman apply ceremony, the table does not exist → the writer returns
 *     CEREMONY_PENDING. We assert THAT typed state (proves the 42P01 seam against a real absent
 *     table, not a mock).
 *   - After apply, the same suite asserts the full history-preserving + current-view behavior.
 * The `describeDb` guard skips the whole suite cleanly in the no-DB `unit` vitest project.
 */
import { afterAll, beforeAll, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeDb } from '../helpers/db-available.js';
import { upsertRegionScore, EVIDENCE_SCHEMA_VERSION } from '../../lib/fable-suitability/map-writer.mjs';
import { readCurrentMap, readRegionHistory } from '../../lib/fable-suitability/map-reader.mjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TEST_REGION = 'ehg_engineer/__test__/fable-suitability-ts4';

function evidence() {
  return {
    evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
    axes: {
      impact: { score: 4, inputs: {}, rationale: 'ts4 impact' },
      opportunity: { score: 3, inputs: {}, rationale: 'ts4 opportunity' },
      reasoning_depth: { score: 5, inputs: {}, rationale: 'ts4 reasoning' },
    },
    recurrence: { weight: 1, count: 1, source_ids: ['ts4'] },
    scored_by: 'ts4-integration-test',
    computed_at: '2026-07-17T00:00:00.000Z',
  };
}

async function tableExists() {
  const { error } = await supabase.from('fable_suitability_map').select('id').limit(1);
  return !error;
}

describeDb('fable_suitability_map — live persistence contract (TS-4)', () => {
  let applied = false;

  beforeAll(async () => {
    applied = await tableExists();
    if (applied) {
      await supabase.from('fable_suitability_map').delete().eq('region_key', TEST_REGION);
    }
  });

  afterAll(async () => {
    if (applied) {
      await supabase.from('fable_suitability_map').delete().eq('region_key', TEST_REGION);
    }
  });

  it('writer returns CEREMONY_PENDING while the STAGED table is unapplied', async () => {
    if (applied) return; // covered by the post-apply cases below
    const res = await upsertRegionScore(supabase, {
      region_key: TEST_REGION,
      repo: 'EHG_Engineer',
      score_version: 1,
      duty_cluster: 'harness-depth',
      evidence: evidence(),
    });
    expect(res.status).toBe('CEREMONY_PENDING');
  });

  it('history-preserving: a version bump appends; current view shows the latest', async () => {
    if (!applied) return; // table not yet ceremonially applied
    const v1 = await upsertRegionScore(supabase, {
      region_key: TEST_REGION, repo: 'EHG_Engineer', score_version: 1,
      duty_cluster: 'harness-depth', composite_score: 40, evidence: evidence(),
    });
    const v2 = await upsertRegionScore(supabase, {
      region_key: TEST_REGION, repo: 'EHG_Engineer', score_version: 2,
      duty_cluster: 'harness-depth', composite_score: 75, evidence: evidence(),
    });
    expect(v1.status).toBe('ok');
    expect(v2.status).toBe('ok');

    const history = await readRegionHistory(supabase, { regionKey: TEST_REGION, repo: 'EHG_Engineer' });
    expect(history.status).toBe('ok');
    expect(history.rows.length).toBe(2); // BOTH versions preserved

    const current = await readCurrentMap(supabase, { dutyCluster: 'harness-depth' });
    expect(current.status).toBe('ok');
    const mine = current.rows.filter((r) => r.region_key === TEST_REGION);
    expect(mine).toHaveLength(1); // exactly one row per region
    expect(mine[0].score_version).toBe(2); // the latest
  });

  it('region_key CHECK rejects a drifting/path-derived key at the DB', async () => {
    if (!applied) return;
    // Bypass the app-layer normalizeRegionKey to prove the DB CHECK itself rejects a bad key.
    const { error } = await supabase.from('fable_suitability_map').insert({
      region_key: 'C:\\abs\\path', repo: 'EHG_Engineer', score_version: 1,
      duty_cluster: 'harness-depth', evidence: evidence(),
    });
    expect(error).toBeTruthy(); // CHECK constraint refuses it
  });
});
