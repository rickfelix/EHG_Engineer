/**
 * QF-20260829-484 — roadmap_waves must roll up (progress_pct + terminal status) whenever a
 * promoted item's target SD's status changes, via the roadmap_wave_rollup_on_sd_status
 * trigger (database/migrations/20260829_roadmap_wave_completion_rollup.sql).
 *
 * Live-DB integration test, gated like the other tests/database suites so CI skips cleanly
 * without service-role creds. Scenario is a dedicated scratch roadmap/wave/2 items/2 SDs,
 * deleted in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const RUN_SUFFIX = `${process.pid}-${Date.now().toString(36)}`;
const SD1 = `SD-TEST-WAVE-ROLLUP-1-${RUN_SUFFIX}`.toUpperCase();
const SD2 = `SD-TEST-WAVE-ROLLUP-2-${RUN_SUFFIX}`.toUpperCase();

let roadmapId = null;
let waveId = null;

describe.skipIf(!HAS_REAL_DB)('roadmap_wave_rollup trigger (QF-20260829-484)', () => {
  beforeAll(async () => {
    for (const key of [SD1, SD2]) {
      await supabase.from('strategic_directives_v2').insert({
        sd_key: key, id: key,
        title: `TEST FIXTURE (QF-20260829-484): wave rollup scenario — safe to delete`,
        description: 'Scratch SD created by tests/database/roadmap-wave-completion-rollup.test.js; deleted in afterAll.',
        rationale: 'Test fixture for QF-20260829-484 — auto-cleaned',
        status: 'draft', sd_type: 'bugfix', category: 'test_fixture', priority: 'low',
      });
    }

    const { data: roadmap } = await supabase.from('strategic_roadmaps').insert({
      title: `TEST FIXTURE (QF-20260829-484): wave rollup roadmap — safe to delete`,
      status: 'draft',
    }).select('id').single();
    roadmapId = roadmap.id;

    const { data: wave } = await supabase.from('roadmap_waves').insert({
      roadmap_id: roadmapId, sequence_rank: 1, title: 'TEST wave', status: 'approved', progress_pct: 0,
    }).select('id').single();
    waveId = wave.id;

    for (const [key, sourceId] of [[SD1, '11111111-1111-1111-1111-111111111111'], [SD2, '22222222-2222-2222-2222-222222222222']]) {
      await supabase.from('roadmap_wave_items').insert({
        wave_id: waveId, source_type: 'todoist', source_id: sourceId, title: key, promoted_to_sd_key: key,
      });
    }
  });

  afterAll(async () => {
    if (waveId) await supabase.from('roadmap_wave_items').delete().eq('wave_id', waveId);
    if (waveId) await supabase.from('roadmap_waves').delete().eq('id', waveId);
    if (roadmapId) await supabase.from('strategic_roadmaps').delete().eq('id', roadmapId);
    await supabase.from('strategic_directives_v2').delete().in('sd_key', [SD1, SD2]);
  });

  it('advances progress_pct but not status when only some items are complete', async () => {
    await supabase.from('strategic_directives_v2').update({ status: 'completed' }).eq('sd_key', SD1);

    const { data: wave } = await supabase.from('roadmap_waves').select('progress_pct, status').eq('id', waveId).single();
    expect(Number(wave.progress_pct)).toBe(50);
    expect(wave.status).toBe('approved');
  });

  it('flips status to completed once every item is complete', async () => {
    await supabase.from('strategic_directives_v2').update({ status: 'completed' }).eq('sd_key', SD2);

    const { data: wave } = await supabase.from('roadmap_waves').select('progress_pct, status').eq('id', waveId).single();
    expect(Number(wave.progress_pct)).toBe(100);
    expect(wave.status).toBe('completed');
  });

  it('never regresses an archived wave', async () => {
    await supabase.from('roadmap_waves').update({ status: 'archived', progress_pct: 100 }).eq('id', waveId);
    await supabase.from('strategic_directives_v2').update({ status: 'in_progress' }).eq('sd_key', SD1);
    await supabase.from('strategic_directives_v2').update({ status: 'completed' }).eq('sd_key', SD1);

    const { data: wave } = await supabase.from('roadmap_waves').select('progress_pct, status').eq('id', waveId).single();
    expect(wave.status).toBe('archived');
    expect(Number(wave.progress_pct)).toBe(100);
  });
});
