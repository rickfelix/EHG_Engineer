/**
 * REAL, DB-backed regression test for lib/eva/deviation-ledger.js.
 *
 * SD: SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A
 *
 * Adversarial /ship review found that recordDeviation() always inserted with
 * is_current:true — colliding with the LIVE partial unique index
 * idx_unique_current_artifact (venture_id, lifecycle_stage, artifact_type,
 * COALESCE(metadata->>'screenId','__no_screen__')) WHERE is_current=true, since
 * every call shared the same (ventureId, 19, BUILD_DEVIATION_RECORD, '__no_screen__')
 * key. The mocked unit test (tests/unit/eva/deviation-ledger.test.js) cannot catch
 * this — it fakes success on every insert with no persisted state, so a real
 * uniqueness collision is invisible to it by construction. This test proves the
 * fix (is_current:false) against the REAL constraint: multiple deviations for the
 * SAME venture, including the SAME artifactRef, must all succeed.
 *
 * Uses real Supabase service-role connection (requires .env). Skipped if no real DB.
 * Creates a disposable venture; all rows cleaned up in afterAll -> zero residue.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { describeDb } from '../../helpers/db-available.js';
import { recordDeviation, readDeviations } from '../../../lib/eva/deviation-ledger.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ts = Date.now();
let ventureId;

describeDb('deviation-ledger (real DB)', () => {
  beforeAll(async () => {
    const { data, error } = await supabase
      .from('ventures')
      .insert({
        name: `__e2e_deviation_ledger_${ts}__`,
        problem_statement: 'Disposable venture for SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A real-DB ledger test',
        current_lifecycle_stage: 19,
        is_demo: false,
        status: 'active',
      })
      .select('id')
      .single();
    if (error) throw new Error(`Failed to create venture: ${error.message}`);
    ventureId = data.id;
  });

  afterAll(async () => {
    if (!ventureId) return;
    await supabase.from('venture_artifacts').delete().eq('venture_id', ventureId);
    await supabase.from('ventures').delete().eq('id', ventureId);
  });

  it('a SECOND recordDeviation() for the SAME artifactRef on the SAME venture does not collide', async () => {
    const artifactRef = 'blueprint_user_story_pack:story-regression-test';
    const id1 = await recordDeviation(supabase, {
      ventureId, artifactRef, weight: 'minor', why: 'First deviation record',
    });
    const id2 = await recordDeviation(supabase, {
      ventureId, artifactRef, weight: 'moderate', why: 'Second deviation record for the same claim',
    });
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('recordDeviation() for a DIFFERENT artifactRef on the SAME venture does not collide', async () => {
    const id = await recordDeviation(supabase, {
      ventureId, artifactRef: 'blueprint_data_model:entity-x', weight: 'critical', why: 'Unrelated deviation on a different claim',
    });
    expect(id).toBeTruthy();
  });

  it('readDeviations() returns all records for one artifactRef in creation order, unaffected by other records', async () => {
    const artifactRef = 'blueprint_technical_architecture:component-y';
    await recordDeviation(supabase, { ventureId, artifactRef, weight: 'minor', why: 'First' });
    await recordDeviation(supabase, { ventureId, artifactRef, weight: 'declared-descope', why: 'Second, descoped' });

    const results = await readDeviations(supabase, { ventureId, artifactRef });
    expect(results).toHaveLength(2);
    expect(results[0].why).toBe('First');
    expect(results[1].why).toBe('Second, descoped');
    expect(results[1].weight).toBe('declared-descope');
  });

  it('inserted rows are is_current:false (outside the partial unique index, by design)', async () => {
    const artifactRef = 'blueprint_schema_spec:table-z';
    await recordDeviation(supabase, { ventureId, artifactRef, weight: 'minor', why: 'Check is_current flag' });

    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('is_current')
      .eq('venture_id', ventureId)
      .contains('artifact_data', { artifact_ref: artifactRef })
      .single();
    expect(error).toBeNull();
    expect(data.is_current).toBe(false);
  });
});
