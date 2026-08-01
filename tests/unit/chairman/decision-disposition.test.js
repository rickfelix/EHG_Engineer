/**
 * lib/chairman/decision-disposition.mjs — FR-3, the disposition reader.
 * SD-FDBK-INFRA-DECISION-QUEUE-RETIREMENT-001.
 *
 * The fixtures mirror the LIVE shape, measured by a full key census over all 21
 * chairman_decision_deferred rows: target_id / decided_by / deferred_at / decision_type on 21 of 21,
 * flag_id on ZERO, snoozed_until on ZERO. Fixtures invented from the writer's source would have
 * carried flag_id and tested a key the data never uses.
 */
import { describe, it, expect } from 'vitest';
import {
  indexDispositions, ageClockFor, isHeld, retirementAuthority,
  DEFERRAL_CATEGORY, DISPOSITION_KEY
} from '../../../lib/chairman/decision-disposition.mjs';

const NOW = new Date('2026-08-01T21:00:00Z');
const iso = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

const deferral = (targetId, daysAgo, extra = {}) => ({
  id: `fb-${targetId}-${daysAgo}`,
  category: DEFERRAL_CATEGORY,
  created_at: iso(daysAgo),
  snoozed_until: null,
  description: 'Chairman verbal, verbatim: "defer both". REAFFIRMING A DELIBERATE HOLD.',
  metadata: { target_id: targetId, decided_by: 'chairman-cli', deferred_at: iso(daysAgo), decision_type: 'chairman_approval' },
  ...extra
});

describe('FR-3 disposition reader — indexing', () => {
  it('keys on target_id, the key the live data actually uses', () => {
    expect(DISPOSITION_KEY).toBe('target_id');
    const m = indexDispositions([deferral('dec-1', 3)]);
    expect(m.get('dec-1').decidedBy).toBe('chairman-cli');
  });

  it('IGNORES a record keyed only by flag_id — the writer branch this lane never produces', () => {
    // scripts/chairman-decisions.mjs:96 writes metadata.flag_id; :113 writes metadata.target_id.
    // The census says 21 of 21 use target_id and ZERO use flag_id. A flag_id-only record cannot be
    // attributed to a decision, so it must govern nothing rather than silently half-match.
    const m = indexDispositions([{
      id: 'fb-x', category: DEFERRAL_CATEGORY, created_at: iso(1),
      metadata: { flag_id: 'dec-1', decided_by: 'chairman-cli', deferred_at: iso(1) }
    }]);
    expect(m.size).toBe(0);
  });

  it('ignores rows of other categories', () => {
    expect(indexDispositions([{ id: 'z', category: 'harness_backlog', metadata: { target_id: 'dec-1' } }]).size).toBe(0);
  });

  it('a row deferred TWICE is governed by the LATER deferral — three live rows have this shape', () => {
    const m = indexDispositions([deferral('dec-1', 10), deferral('dec-1', 2)]);
    expect(m.size).toBe(1);
    expect(m.get('dec-1').deferredAt).toBe(iso(2));
  });

  it('order of input does not change the winner', () => {
    const a = indexDispositions([deferral('dec-1', 2), deferral('dec-1', 10)]).get('dec-1').deferredAt;
    const b = indexDispositions([deferral('dec-1', 10), deferral('dec-1', 2)]).get('dec-1').deferredAt;
    expect(a).toBe(b);
  });

  it('malformed input yields an empty index rather than throwing', () => {
    expect(indexDispositions(null).size).toBe(0);
    expect(indexDispositions([null, undefined, {}]).size).toBe(0);
  });
});

describe('FR-3/FR-6 age clock — the defect is that the queue ages from creation', () => {
  it('a deferred row clocks from the DEFERRAL, not creation', () => {
    const row = { id: 'dec-1', created_at: iso(56) };            // the live 56-day shape
    const clock = ageClockFor(row, indexDispositions([deferral('dec-1', 4)]));
    expect(clock.source).toBe('deferral');
    expect(clock.since).toBe(iso(4));                             // 4 days, not 56
    expect(clock.disposition.decidedBy).toBe('chairman-cli');
  });

  it('an UNDEFERRED row still clocks from creation — the fix must not reset everything', () => {
    const clock = ageClockFor({ id: 'dec-9', created_at: iso(56) }, indexDispositions([deferral('dec-1', 4)]));
    expect(clock.source).toBe('creation');
    expect(clock.since).toBe(iso(56));
    expect(clock.disposition).toBe(null);
  });
});

describe('FR-3 hold semantics — a deferral is NOT a retirement', () => {
  it('a deferral WITHOUT snoozed_until does not suppress the row', () => {
    // Open-ended "not now" restarts the clock but must not hide the decision forever.
    expect(isHeld({ id: 'dec-1' }, indexDispositions([deferral('dec-1', 2)]), NOW)).toBe(false);
  });

  it('a deferral WITH a future snoozed_until holds the row', () => {
    const m = indexDispositions([deferral('dec-1', 2, { snoozed_until: new Date(NOW.getTime() + 86400000).toISOString() })]);
    expect(isHeld({ id: 'dec-1' }, m, NOW)).toBe(true);
  });

  it('a snooze that has EXPIRED no longer holds — both directions on the same field', () => {
    const m = indexDispositions([deferral('dec-1', 2, { snoozed_until: new Date(NOW.getTime() - 86400000).toISOString() })]);
    expect(isHeld({ id: 'dec-1' }, m, NOW)).toBe(false);
  });
});

describe('FR-3 retirement authority — absence BLOCKS retirement, never defaults it', () => {
  it('a row with no disposition yields NULL authority', () => {
    expect(retirementAuthority({ id: 'dec-9' }, indexDispositions([deferral('dec-1', 2)]))).toBe(null);
  });

  it('a row WITH a disposition yields a citation naming the record, the actor and the basis', () => {
    const auth = retirementAuthority({ id: 'dec-1' }, indexDispositions([deferral('dec-1', 2)]));
    expect(auth).not.toBe(null);
    expect(auth.citedRecord).toBe('fb-dec-1-2');
    expect(auth.decidedBy).toBe('chairman-cli');
    expect(auth.basis).toMatch(/DELIBERATE HOLD/);
    // Never a bare boolean: "retired" without a basis is the unattributable stamp this SD removes.
    expect(typeof auth).toBe('object');
  });

  it('an UNATTRIBUTABLE record authorises nothing even though it is indexed', () => {
    const m = indexDispositions([{
      id: 'fb-y', category: DEFERRAL_CATEGORY, created_at: iso(1),
      metadata: { target_id: 'dec-1', deferred_at: iso(1) }   // no decided_by
    }]);
    expect(m.size).toBe(1);                                    // it IS a record
    expect(retirementAuthority({ id: 'dec-1' }, m)).toBe(null); // but it authorises nothing
  });

  it('mutation changes the verdict — proving the value is READ, not merely fetched', () => {
    // FR-3 AC: "proven by MUTATION, not by a call". A reader that fetched and ignored would pass a
    // call-count assertion; it cannot pass this pair.
    const withActor = retirementAuthority({ id: 'dec-1' }, indexDispositions([deferral('dec-1', 2)]));
    const stripped = deferral('dec-1', 2);
    delete stripped.metadata.decided_by;
    const withoutActor = retirementAuthority({ id: 'dec-1' }, indexDispositions([stripped]));
    expect(withActor).not.toBe(null);
    expect(withoutActor).toBe(null);
  });
});
