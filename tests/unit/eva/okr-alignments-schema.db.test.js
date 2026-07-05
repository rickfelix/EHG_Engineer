import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { HAS_REAL_DB } from '../../helpers/db-available.js';
import { loadIntelligenceSignals } from '../../../lib/eva/intelligence-loader.js';

/**
 * Live-DB schema-contract regression test for okr_alignments.
 * SD-LEO-INFRA-PROVISION-OKR-ALIGNMENTS-001.
 *
 * Verifies lib/eva/intelligence-loader.js's _loadOkrImpact query
 * (id, key_result_id, contribution_type, impact_weight filtered by sd_id)
 * matches the live migration (20260704_okr_alignments_provision.sql), and
 * that a real SD with an alignment row flows through loadIntelligenceSignals
 * end-to-end with zero degradation. Fails loudly if a future change drops a
 * column the loader depends on.
 *
 * Skips cleanly when no service-role key is present (CI without DB access).
 * Uses a dedicated sentinel SD row and hard-deletes everything it creates in
 * afterAll — never touches real strategic_directives_v2/key_results rows.
 */
const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE = HAS_REAL_DB;

const SENTINEL_SD_KEY = 'ZZZ_OKR_ALIGNMENTS_SCHEMA_TEST_SD';
const supabase = LIVE ? createClient(URL, KEY) : null;

let sentinelSdId = null;

async function cleanup() {
  if (!supabase) return;
  // Look up by sd_key (unique), not sentinelSdId -- sentinelSdId is null on the
  // pre-insert cleanup() call, so keying off it silently no-ops the exact case
  // this exists for: reaping an orphaned row left by a prior crashed/concurrent run.
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SENTINEL_SD_KEY);

  for (const row of existing || []) {
    await supabase.from('okr_alignments').delete().eq('sd_id', row.id);
    await supabase.from('strategic_directives_v2').delete().eq('id', row.id);
  }
}

describe.skipIf(!LIVE)('okr_alignments schema contract (live DB)', () => {
  beforeAll(async () => {
    await cleanup();

    // strategic_directives_v2.id is `character varying` with NO default -- must be supplied
    // explicitly (confirmed via information_schema; this is the same real column
    // okr_alignments.sd_id references, despite storing UUID-formatted strings).
    sentinelSdId = randomUUID();
    const { error: sdError } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: sentinelSdId,
        sd_key: SENTINEL_SD_KEY,
        title: 'Sentinel SD for okr_alignments schema test',
        status: 'draft',
        sd_type: 'infrastructure',
        category: 'Infrastructure',
        priority: 'low',
        target_application: 'EHG_Engineer',
        description: 'Sentinel row, deleted in afterAll.',
        rationale: 'Test fixture.',
        scope: 'Test fixture.',
      });
    expect(sdError).toBeNull();
  });

  afterAll(cleanup);

  it('the table exists with the columns the loader selects', async () => {
    const { data, error } = await supabase
      .from('okr_alignments')
      .select('id, key_result_id, contribution_type, impact_weight')
      .eq('sd_id', sentinelSdId);

    expect(error).toBeNull();
    expect(data).toEqual([]); // no rows yet -- proves the query succeeds, not that data exists
  });

  it('an inserted alignment row round-trips through the exact loader shape', async () => {
    const { data: krRow, error: krError } = await supabase
      .from('key_results')
      .select('id')
      .limit(1)
      .maybeSingle();
    expect(krError).toBeNull();

    let keyResultIdForInsert = null;
    if (krRow) {
      keyResultIdForInsert = krRow.id; // reuse an existing KR row (FK requires a real one)
    }

    const { data: inserted, error: insertError } = await supabase
      .from('okr_alignments')
      .insert({
        sd_id: sentinelSdId,
        key_result_id: keyResultIdForInsert,
        contribution_type: 'direct',
        impact_weight: 2,
      })
      .select('id, key_result_id')
      .single();
    expect(insertError).toBeNull();
    expect(inserted.key_result_id).toBe(keyResultIdForInsert);

    const { data, error } = await supabase
      .from('okr_alignments')
      .select('id, key_result_id, contribution_type, impact_weight')
      .eq('sd_id', sentinelSdId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].contribution_type).toBe('direct');
    expect(Number(data[0].impact_weight)).toBe(2);
  });

  it('impact_weight defaults to 1.0 when omitted', async () => {
    const { data, error } = await supabase
      .from('okr_alignments')
      .insert({ sd_id: sentinelSdId })
      .select('impact_weight')
      .single();

    expect(error).toBeNull();
    expect(Number(data.impact_weight)).toBe(1);
  });

  it('loadIntelligenceSignals() runs end-to-end with zero okr-related degradation', async () => {
    const result = await loadIntelligenceSignals(supabase, SENTINEL_SD_KEY, { sdUuid: sentinelSdId });

    expect(result.meta.errors.filter((e) => e.startsWith('okr:'))).toEqual([]);
    expect(result.okrImpact).not.toBeNull();
    expect(result.okrImpact.totalScore).toBeGreaterThan(0);
  });
});
