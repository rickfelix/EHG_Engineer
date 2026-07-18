/**
 * SD-LEO-INFRA-UNIFY-BELT-REFILL-001 (FR-3 / TS-4, TS-6) — scope refill-cron to the ACTIVE roadmap.
 *
 * Before this SD the candidate query had NO roadmap filter, so 1,415 pending items from draft/archived
 * EVA-Intake roadmaps were eligible belt candidates. resolveActiveWaveIds resolves the plan-of-record's
 * wave ids (strategic_roadmaps.status='active' -> roadmap_waves.roadmap_id) that the cron then applies via
 * .in('wave_id', ...). FAIL-CLOSED: on any error / no active roadmap / zero active waves it returns []
 * (the caller promotes NOTHING — never a full-corpus fallback).
 */
import { describe, it, expect } from 'vitest';
import { resolveActiveWaveIds } from '../../../scripts/sourcing-engine/refill-cron.mjs';

// Mock supabase: strategic_roadmaps.select('id').eq('status','active') is awaited directly, and
// roadmap_waves.select('id').in('roadmap_id', ids) is awaited directly.
function makeSb({ roadmaps = [], waves = [], roadmapErr = null, waveErr = null } = {}) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq() {
          return Promise.resolve(
            table === 'strategic_roadmaps'
              ? { data: roadmapErr ? null : roadmaps, error: roadmapErr }
              : { data: [], error: null },
          );
        },
        in() {
          return Promise.resolve(
            table === 'roadmap_waves'
              ? { data: waveErr ? null : waves, error: waveErr }
              : { data: [], error: null },
          );
        },
      };
    },
  };
}

describe('resolveActiveWaveIds', () => {
  it('returns the active roadmap wave ids (TS-4 mechanism)', async () => {
    const sb = makeSb({ roadmaps: [{ id: 'r-active' }], waves: [{ id: 'w1' }, { id: 'w2' }] });
    expect(await resolveActiveWaveIds(sb)).toEqual(['w1', 'w2']);
  });

  it('fail-closed: no active roadmap -> [] (promote nothing, no full-corpus fallback) (TS-6)', async () => {
    const sb = makeSb({ roadmaps: [] });
    expect(await resolveActiveWaveIds(sb)).toEqual([]);
  });

  it('fail-closed: active roadmap but zero waves -> []', async () => {
    const sb = makeSb({ roadmaps: [{ id: 'r-active' }], waves: [] });
    expect(await resolveActiveWaveIds(sb)).toEqual([]);
  });

  it('fail-closed: a roadmap-lookup error -> []', async () => {
    const sb = makeSb({ roadmapErr: { message: 'db down' } });
    expect(await resolveActiveWaveIds(sb)).toEqual([]);
  });

  it('fail-closed: a wave-lookup error -> []', async () => {
    const sb = makeSb({ roadmaps: [{ id: 'r-active' }], waveErr: { message: 'db down' } });
    expect(await resolveActiveWaveIds(sb)).toEqual([]);
  });

  it('only the active roadmap ids drive the wave lookup (non-active roadmaps excluded)', async () => {
    // The mock only returns the active roadmaps we inject; a draft/archived roadmap is never passed in
    // because the .eq('status','active') predicate excludes it at the source query.
    let receivedRoadmapIds = null;
    const sb = {
      from() {
        return {
          select() { return this; },
          eq() { return Promise.resolve({ data: [{ id: 'r-active' }], error: null }); },
          in(_col, ids) { receivedRoadmapIds = ids; return Promise.resolve({ data: [{ id: 'w1' }], error: null }); },
        };
      },
    };
    await resolveActiveWaveIds(sb);
    expect(receivedRoadmapIds).toEqual(['r-active']);
  });
});
