/**
 * QF-20260902-588: fetchInFlightItems' population and clock, both defective on day one of
 * SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C. Population read every non-completed/cancelled/draft
 * status (deferred/on_hold/pending_approval included), and the clock ran from created_at
 * (queue-wait time, not work time) -- 23 of 24 breach lines in a live tick were parked
 * status=deferred rows, some waiting since July.
 *
 * fetchInFlightItems itself needs a live DB (Promise.all with fetchDurationsByType), so these
 * pin the three pure predicates it composes instead: hasEnforcedHold, firstClaimAtMs,
 * resolveWorkClock. WORK_UNDERWAY_STATUSES is exercised indirectly via the population comment
 * in fetchInFlightItems (active/in_progress only) -- Amendment (Solomon STEP-0 CONCUR ca033f21).
 */
import { describe, it, expect } from 'vitest';
import { hasEnforcedHold, firstClaimAtMs, resolveWorkClock, fetchInFlightItems } from '../../../scripts/adam-quiet-tick.mjs';

function sbWithRows(rows) {
  const b = {
    select: () => b,
    not: () => b,
    is: () => b,
    limit: () => b,
    then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return { from: () => b };
}

describe('QF-20260902-588 hasEnforcedHold', () => {
  it('true for metadata.needs_coordinator_review === true, even on an "active"-shaped row', () => {
    expect(hasEnforcedHold({ status: 'active', metadata: { needs_coordinator_review: true } })).toBe(true);
  });
  it('true for a truthy metadata.requires_human_action', () => {
    expect(hasEnforcedHold({ status: 'active', metadata: { requires_human_action: true } })).toBe(true);
  });
  it('false when neither hold field is set', () => {
    expect(hasEnforcedHold({ status: 'active', metadata: { claim_history: [{ claimed_at: '2026-08-01T00:00:00Z' }] } })).toBe(false);
    expect(hasEnforcedHold({ status: 'active', metadata: null })).toBe(false);
    expect(hasEnforcedHold({ status: 'active' })).toBe(false);
  });
});

describe('QF-20260902-588 firstClaimAtMs / resolveWorkClock', () => {
  it('a claimed row measures elapsed from its first claim stamp, not created_at', () => {
    const row = { metadata: { claim_history: [{ claimed_at: '2026-08-25T00:00:00Z' }, { claimed_at: '2026-08-30T00:00:00Z' }] } };
    const createdAtMs = Date.parse('2026-07-01T00:00:00Z'); // weeks before the first claim
    expect(firstClaimAtMs(row)).toBe(Date.parse('2026-08-25T00:00:00Z'));
    expect(resolveWorkClock(row, createdAtMs)).toEqual({ startMs: Date.parse('2026-08-25T00:00:00Z'), clockSource: 'first_claim' });
  });

  it('a row with no work stamp falls back to created_at, labelled clock=created_at', () => {
    const row = { metadata: {} };
    const createdAtMs = Date.parse('2026-07-01T00:00:00Z');
    expect(firstClaimAtMs(row)).toBeNull();
    expect(resolveWorkClock(row, createdAtMs)).toEqual({ startMs: createdAtMs, clockSource: 'created_at' });
  });

  it('a row with no metadata at all falls back to created_at without throwing', () => {
    const createdAtMs = Date.parse('2026-07-01T00:00:00Z');
    expect(resolveWorkClock({}, createdAtMs)).toEqual({ startMs: createdAtMs, clockSource: 'created_at' });
  });
});

describe('QF-20260902-588 fetchInFlightItems population', () => {
  it('a status=deferred row (the live incident: 23/24 breach lines) is excluded from the population', async () => {
    const sb = sbWithRows([
      { sd_key: 'SD-DEFERRED-001', sd_type: 'bugfix', status: 'deferred', created_at: '2026-07-20T00:00:00Z', metadata: {} },
    ]);
    expect(await fetchInFlightItems(sb)).toEqual([]);
  });

  it('a row carrying an enforced hold field is excluded even when status is active (the 24th line)', async () => {
    const sb = sbWithRows([
      { sd_key: 'SD-HELD-001', sd_type: 'feature', status: 'active', created_at: '2026-07-20T00:00:00Z', metadata: { requires_human_action: true } },
    ]);
    expect(await fetchInFlightItems(sb)).toEqual([]);
  });

  it('a claimed active row with no hold is included, with elapsed measured from the claim stamp', async () => {
    const sb = sbWithRows([
      { sd_key: 'SD-WORKING-001', sd_type: 'feature', status: 'in_progress', created_at: '2026-07-01T00:00:00Z', metadata: { claim_history: [{ claimed_at: '2026-08-25T00:00:00Z' }] } },
    ]);
    expect(await fetchInFlightItems(sb)).toEqual([
      { sd_key: 'SD-WORKING-001', sd_type: 'feature', workStartMs: Date.parse('2026-08-25T00:00:00Z'), clockSource: 'first_claim' },
    ]);
  });
});
