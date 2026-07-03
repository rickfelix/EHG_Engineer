/**
 * QF-20260702-241 — filterStaleLeanDecisions: exclude stale/cancelled-venture/superseded pending
 * decisions from the chairman's LEAN decision email. Verified live 2026-07-02: 12 pending rows, only
 * 2 genuine — 9 rode along on cancelled/test-fixture ventures, 1 was a superseded stage-12 escalation
 * on a venture already at stage 19.
 */
import { describe, it, expect } from 'vitest';
import { filterStaleLeanDecisions, DEAD_VENTURE_STATUSES } from '../../lib/chairman/decision-layman.mjs';

const row = (id, { ventureId = null, stage = null } = {}) => ({
  id, decision_type: 'chairman_approval', venture_id: ventureId, lifecycle_stage: stage,
  created_at: new Date().toISOString(),
});

describe('filterStaleLeanDecisions', () => {
  it('drops rows whose venture is dead (in deadVentureIds)', () => {
    const rows = [row('a', { ventureId: 'v-dead' }), row('b', { ventureId: 'v-live' })];
    const { kept, excludedCount } = filterStaleLeanDecisions(rows, { deadVentureIds: new Set(['v-dead']) });
    expect(kept.map((r) => r.id)).toEqual(['b']);
    expect(excludedCount).toBe(1);
  });

  it('drops an earlier-stage row when a later-stage row exists for the SAME venture', () => {
    const rows = [
      row('stage-12', { ventureId: 'v-1', stage: 12 }),
      row('stage-19', { ventureId: 'v-1', stage: 19 }),
    ];
    const { kept, excludedCount } = filterStaleLeanDecisions(rows, {});
    expect(kept.map((r) => r.id)).toEqual(['stage-19']);
    expect(excludedCount).toBe(1);
  });

  it('NEVER drops the primary row, even if it is on a dead venture or superseded', () => {
    const rows = [
      row('primary', { ventureId: 'v-dead', stage: 3 }),
      row('other', { ventureId: 'v-live' }),
    ];
    const { kept, excludedCount } = filterStaleLeanDecisions(rows, { deadVentureIds: new Set(['v-dead']), primaryId: 'primary' });
    expect(kept.map((r) => r.id)).toEqual(['primary', 'other']);
    expect(excludedCount).toBe(0);
  });

  it('keeps rows with no venture_id (non-venture decisions) untouched', () => {
    const rows = [row('session-q', {})];
    const { kept, excludedCount } = filterStaleLeanDecisions(rows, {});
    expect(kept.map((r) => r.id)).toEqual(['session-q']);
    expect(excludedCount).toBe(0);
  });

  it('keeps distinct ventures independent — dead/superseded status on one never affects another', () => {
    const rows = [
      row('dead-v', { ventureId: 'v-dead' }),
      row('live-v-early', { ventureId: 'v-live', stage: 5 }),
      row('live-v-late', { ventureId: 'v-live', stage: 10 }),
    ];
    const { kept, excludedCount } = filterStaleLeanDecisions(rows, { deadVentureIds: new Set(['v-dead']) });
    expect(kept.map((r) => r.id)).toEqual(['live-v-late']);
    expect(excludedCount).toBe(2);
  });

  it('reflects the live incident: DEAD_VENTURE_STATUSES covers cancelled ventures', () => {
    expect(DEAD_VENTURE_STATUSES.has('cancelled')).toBe(true);
  });
});
