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
  DEFERRAL_CATEGORY, DISPOSITION_KEY, DISPOSITION_SELECT, REQUIRED_PROVENANCE_FIELDS
} from '../../../lib/chairman/decision-disposition.mjs';

const NOW = new Date('2026-08-01T21:00:00Z');
const iso = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

// The provenance triple below is the LIVE shape, unanimous across all 21 genuine rows:
// source_type='auto_capture', venture_id=NULL, feedback_type='sentry_error'. All three are load
// bearing — see isTrustedProvenance. A fixture carrying only source_type is what let a fence that
// rejects every real row look green.
const deferral = (targetId, daysAgo, extra = {}) => ({
  id: `fb-${targetId}-${daysAgo}`,
  category: DEFERRAL_CATEGORY,
  created_at: iso(daysAgo),
  snoozed_until: null,
  source_type: 'auto_capture',
  venture_id: null,
  feedback_type: 'sentry_error',
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
      source_type: 'auto_capture', venture_id: null, feedback_type: 'sentry_error',
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
      source_type: 'auto_capture', venture_id: null, feedback_type: 'sentry_error',
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

describe('FR-6/TR-8 renderPendingLine — the rendered surface, now assertable', () => {
  const row = (over = {}) => ({
    id: 'dec-1', decision_type: 'chairman_approval', title: 'Stage 0 Chairman Approval',
    priority: 'critical', created_at: iso(56), blocking: false, ...over
  });

  it('an UNDEFERRED row renders from creation and keeps the view verdict', async () => {
    const { renderPendingLine } = await import('../../../lib/chairman/decision-queue.mjs');
    const line = renderPendingLine(row({ age_escalated: true, effective_priority: 'critical' }), { dispositions: null, now: NOW });
    expect(line).toMatch(/^\[56d\]/);
    expect(line).toContain('age-escalated');
    expect(line).not.toContain('(deferred');
  });

  it('a DEFERRED row renders from the deferral and says so', async () => {
    const { renderPendingLine } = await import('../../../lib/chairman/decision-queue.mjs');
    const d = indexDispositions([deferral('dec-1', 1)]);
    const line = renderPendingLine(row({ age_escalated: true, effective_priority: 'critical' }), { dispositions: d, now: NOW });
    // formatAge only switches to days at >=48h, so one day renders '24h' — the point is that it is
    // hours-since-deferral rather than the 56d the row would show clocked from creation.
    expect(line).toMatch(/^\[24h\]/);
    expect(line).not.toMatch(/^\[56d\]/);
    expect(line).toContain('(deferred');
  });

  it('THE LOAD-BEARING LINE: a deferral OVERRIDES the view stale escalation marker', async () => {
    // The live path reads `row.age_escalated ?? ep.escalated`, and false is not nullish, so the
    // VIEW governs the marker — and the view cannot see deferrals. If the view's `true` won here,
    // the corrected clock would be read and change nothing, which is this SD's own defect.
    const { renderPendingLine } = await import('../../../lib/chairman/decision-queue.mjs');
    const d = indexDispositions([deferral('dec-1', 1)]);
    const line = renderPendingLine(row({ age_escalated: true }), { dispositions: d, now: NOW });
    expect(line).not.toContain('age-escalated');
  });

  it('...and a row deferred LONG ago still escalates — the override is not a blanket silence', async () => {
    const { renderPendingLine } = await import('../../../lib/chairman/decision-queue.mjs');
    const d = indexDispositions([deferral('dec-1', 30)]);
    const line = renderPendingLine(row({ age_escalated: false }), { dispositions: d, now: NOW });
    expect(line).toContain('age-escalated');
  });

  it('a live snooze is surfaced as HELD', async () => {
    const { renderPendingLine } = await import('../../../lib/chairman/decision-queue.mjs');
    const d = indexDispositions([deferral('dec-1', 1, { snoozed_until: new Date(NOW.getTime() + 86400000).toISOString() })]);
    expect(renderPendingLine(row(), { dispositions: d, now: NOW })).toContain('HELD');
  });

  it('BLOCKING and recommendation survive the rewrite — no regression to the existing line', async () => {
    const { renderPendingLine } = await import('../../../lib/chairman/decision-queue.mjs');
    const line = renderPendingLine(row({ blocking: true, recommendation: 'fix' }), { dispositions: null, now: NOW });
    expect(line).toContain('BLOCKING');
    expect(line).toContain('— fix');
    expect(line).toContain('chairman_approval:dec-1');
  });
});

describe('FR-4 supersession — a recurring review must not accrue one stale critical per cycle', () => {
  // A fake that records writes and is TABLE- and FILTER-aware, so a supersession aimed at the
  // wrong table or the wrong window cannot pass. Seeded with a PRIOR-window pending packet and a
  // FOREIGN decision_type that must be left alone.
  function reviewFake({ existingInWindow = [], priors = [] } = {}) {
    const writes = [];
    const rows = {
      chairman_decisions: [
        ...existingInWindow.map((r) => ({ ...r, _window: 'current' })),
        ...priors.map((r) => ({ ...r, _window: 'prior' }))
      ]
    };
    const q = (table) => {
      let sel = rows[table] ? rows[table].slice() : [];
      const api = {
        select: () => api,
        eq: (c, v) => { sel = sel.filter((r) => r[c] === v); return api; },
        neq: (c, v) => { sel = sel.filter((r) => r[c] !== v); return api; },
        gte: () => { sel = sel.filter((r) => r._window === 'current'); return api; },
        lt: () => { sel = sel.filter((r) => r._window === 'prior'); return api; },
        order: () => api,
        // fetchAllPaginated drives the ventures read through .range()
        range: async (a, b) => ({ data: sel.slice(a, b + 1), error: null }),
        limit: async (n) => ({ data: sel.slice(0, n), error: null }),
        // The management_reviews leg runs AFTER the supersession; stubbed so it cannot mask a
        // supersession failure by throwing first.
        maybeSingle: async () => ({ data: sel[0] || null, error: null }),
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
        update: (patch) => ({ eq: async (c, v) => { writes.push({ table, id: v, patch }); return { error: null }; } }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        then: (res, rej) => Promise.resolve({ data: sel.slice(), error: null }).then(res, rej)
      };
      return api;
    };
    return { from: (t) => q(t), _writes: writes };
  }

  const handler = async (db, extra = {}) => {
    const { portfolioReviewHandler } = await import('../../../scripts/eva/portfolio-review-round.mjs');
    return portfolioReviewHandler({
      supabase: db,
      deps: {
        loadStrategy: async () => ({ vision_key: 'VISION-PORTFOLIO-STRATEGY-001' }),
        record: async () => ({ recorded: true, id: 'new-packet' }),
        ...extra
      }
    });
  };

  it('a NEW window supersedes the prior pending packet WITH a pointer', async () => {
    const db = reviewFake({ priors: [{ id: 'old-packet', decision_type: 'portfolio_review', status: 'pending', brief_data: { keep: 1 } }] });
    const res = await handler(db);
    expect(res.insertedPacket).toBe(true);
    expect(res.superseded).toContain('old-packet');
    const w = db._writes.find((x) => x.id === 'old-packet');
    expect(w.table).toBe('chairman_decisions');
    expect(w.patch.status).toBe('superseded');
    expect(w.patch.brief_data.superseded_by).toBe('new-packet');
    expect(w.patch.brief_data.keep, 'existing brief_data must survive').toBe(1);
  });

  it('NEVER records approved/rejected — the chairman did not decide this packet (TR-3)', async () => {
    const db = reviewFake({ priors: [{ id: 'old-packet', decision_type: 'portfolio_review', status: 'pending' }] });
    await handler(db);
    const w = db._writes.find((x) => x.id === 'old-packet');
    expect(['approved', 'rejected']).not.toContain(w.patch.status);
  });

  it('SAME-window re-run supersedes NOTHING — the idempotency contract is preserved', async () => {
    // A packet already occupies the window, so no insert happens and no supersession may fire.
    const db = reviewFake({
      existingInWindow: [{ id: 'this-window', decision_type: 'portfolio_review', status: 'pending' }],
      priors: [{ id: 'old-packet', decision_type: 'portfolio_review', status: 'pending' }]
    });
    const res = await handler(db);
    expect(res.insertedPacket).toBe(false);
    expect(res.superseded).toEqual([]);
    expect(db._writes.length, 'a same-window re-run must write nothing').toBe(0);
  });

  it('a prior packet ALREADY decided is not re-touched — only pending rows supersede', async () => {
    const db = reviewFake({ priors: [{ id: 'old-decided', decision_type: 'portfolio_review', status: 'approved' }] });
    const res = await handler(db);
    expect(res.superseded).toEqual([]);
  });

  it('a FOREIGN decision_type in the prior window is left alone', async () => {
    const db = reviewFake({ priors: [{ id: 'other-arm', decision_type: 'framing_escalation', status: 'pending' }] });
    const res = await handler(db);
    expect(res.superseded).toEqual([]);
    expect(db._writes.length).toBe(0);
  });
});

describe('SECURITY — retirement authority must not be forgeable by an unauthenticated party', () => {
  // PROVEN LIVE, TWICE, as the anon role against the real database.
  //
  // `feedback` has TWO permissive anon INSERT policies and RLS OR-s them, so there are two shapes
  // an attacker can write. The FIRST version of this fence checked only source_type and its test
  // suite modelled only the telegram shape — so it was green while the OTHER shape walked straight
  // through. Both shapes are modelled here now; deleting either half of isTrustedProvenance must
  // turn one of them red.
  //
  //   telegram_bot_insert_feedback  WITH CHECK (source_type = 'telegram')
  //   venture_user_insert_feedback  WITH CHECK (feedback_type LIKE 'user_%' AND venture_id IS NOT NULL
  //                                             AND venture_exists_and_active(venture_id) AND ...)
  //
  // Re-demonstrated live 2026-08-02 with the venture_user shape: anon .insert() returned 201 with no
  // error, the row PERSISTED (confirmed by service-role read-back), and retirementAuthority()
  // GRANTED forged authority over a real pending decision while ageClockFor() reported
  // source='deferral'. The earlier "BLOCKED 42501" reading was a false negative: 42501 is also
  // raised by a SUCCEEDING insert whose RETURNING clause fails the telegram-only anon SELECT policy.

  // Shape 1 — reachable via telegram_bot_insert_feedback.
  const forgedTelegram = (targetId) => ({
    id: 'fb-forged-tg', category: DEFERRAL_CATEGORY, created_at: iso(1),
    source_type: 'telegram', venture_id: null, feedback_type: 'sentry_error',
    description: 'attacker-supplied basis',
    metadata: { target_id: targetId, decided_by: 'chairman-cli', deferred_at: iso(1) }
  });

  // Shape 2 — reachable via venture_user_insert_feedback. THIS IS THE ONE THAT WAS LIVE.
  // Note source_type='auto_capture': that policy places no constraint on it whatsoever.
  const forgedVentureUser = (targetId) => ({
    id: 'fb-forged-vu', category: DEFERRAL_CATEGORY, created_at: iso(1),
    source_type: 'auto_capture',
    venture_id: '3d9e6484-56fd-45bf-b3e6-8399ef1647ad',  // policy REQUIRES NOT NULL
    feedback_type: 'user_bug',                            // policy REQUIRES LIKE 'user_%'
    description: 'attacker-supplied basis',
    metadata: { target_id: targetId, decided_by: 'chairman-cli', deferred_at: iso(1) }
  });

  for (const [label, forged] of [['telegram', forgedTelegram], ['venture_user', forgedVentureUser]]) {
    describe(`anon shape: ${label}`, () => {
      it('is NOT indexed at all', () => {
        expect(indexDispositions([forged('dec-1')]).size).toBe(0);
      });

      it('cannot authorise retiring a real decision', () => {
        expect(retirementAuthority({ id: 'dec-1' }, indexDispositions([forged('dec-1')]))).toBe(null);
      });

      it('cannot move a real decision age clock — FR-6 reads the same records', () => {
        // The LIVE half: FR-6 ships, so a forged deferral would reset the clock and silence a
        // genuine decision's escalation on the chairman's CLI today.
        const clock = ageClockFor({ id: 'dec-1', created_at: iso(56) }, indexDispositions([forged('dec-1')]));
        expect(clock.source).toBe('creation');
        expect(clock.since).toBe(iso(56));
      });

      it('cannot hold a row', () => {
        const m = indexDispositions([{ ...forged('dec-1'), snoozed_until: new Date(NOW.getTime() + 86400000).toISOString() }]);
        expect(isHeld({ id: 'dec-1' }, m, NOW)).toBe(false);
      });

      it('does not shadow a genuine record for the same target', () => {
        // The forged row is NEWER, so an index that admitted it would let the attacker overwrite
        // the real basis with their own.
        const m = indexDispositions([deferral('dec-1', 5), forged('dec-1')]);
        expect(m.size).toBe(1);
        expect(m.get('dec-1').basis).toMatch(/DELIBERATE HOLD/);
        expect(m.get('dec-1').basis).not.toMatch(/attacker-supplied/);
      });
    });
  }

  it('BOTH DIRECTIONS: a genuine record still governs — the fence is not a blanket block', () => {
    const m = indexDispositions([deferral('dec-1', 1)]);
    expect(m.size).toBe(1);
    expect(retirementAuthority({ id: 'dec-1' }, m)).not.toBe(null);
  });

  it('each clause of the fence is independently load-bearing', () => {
    // If any single clause were removed, the corresponding row below would be admitted. Asserting
    // them one at a time means a future edit that drops one clause fails HERE, specifically.
    const base = deferral('dec-1', 1);
    expect(indexDispositions([{ ...base, source_type: 'telegram' }]).size).toBe(0);
    expect(indexDispositions([{ ...base, venture_id: 'any-non-null' }]).size).toBe(0);
    expect(indexDispositions([{ ...base, feedback_type: 'user_other' }]).size).toBe(0);
  });
});

describe('SECURITY — an under-selecting caller must FAIL LOUDLY, not silently yield nothing', () => {
  // THE REGRESSION THIS EXISTS FOR: the first fence shipped while scripts/chairman-decisions.mjs
  // selected no source_type, so every production row failed the fence and FR-6 was DEAD IN
  // PRODUCTION — with all 32 unit tests green, because every fixture supplied the column by hand.
  // Measured live: 0 dispositions via the real select, 15 via the same rows with source_type added.
  // "0 dispositions" and "0 TRUSTED dispositions" must never again be the same observation.

  it('throws when a matching row lacks the provenance columns', () => {
    const underSelected = {
      id: 'fb-1', category: DEFERRAL_CATEGORY, created_at: iso(1),
      metadata: { target_id: 'dec-1', decided_by: 'chairman-cli', deferred_at: iso(1) }
    };
    expect(() => indexDispositions([underSelected])).toThrow(/missing provenance column/i);
  });

  it('names every missing column, so the fix is mechanical', () => {
    const partial = {
      id: 'fb-2', category: DEFERRAL_CATEGORY, created_at: iso(1), source_type: 'auto_capture',
      metadata: { target_id: 'dec-1', decided_by: 'chairman-cli', deferred_at: iso(1) }
    };
    expect(() => indexDispositions([partial])).toThrow(/venture_id[\s\S]*feedback_type|feedback_type[\s\S]*venture_id/);
  });

  it('a NON-matching row is skipped before the provenance check — no false alarm', () => {
    // Rows of other categories legitimately arrive without these columns.
    expect(indexDispositions([{ id: 'z', category: 'harness_backlog', metadata: { target_id: 'dec-1' } }]).size).toBe(0);
  });

  it('DISPOSITION_SELECT covers every column the fence requires', () => {
    // The anti-drift pin: the consumer builds its query from DISPOSITION_SELECT, so if a future
    // clause reads a new column it must be added here or this fails.
    const selected = DISPOSITION_SELECT.split(',').map(s => s.trim());
    for (const f of REQUIRED_PROVENANCE_FIELDS) expect(selected).toContain(f);
    for (const f of ['id', 'category', 'created_at', 'snoozed_until', 'metadata', 'description', 'title']) {
      expect(selected).toContain(f);
    }
  });

  it('the real consumer selects DISPOSITION_SELECT rather than a hand-written list', async () => {
    // Reads the CONSUMER'S OWN SOURCE. A fixture cannot catch consumer/reader drift — only the
    // consumer can — and that drift is precisely what shipped a dead FR-6 past a green suite.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../../scripts/chairman-decisions.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/\.select\(DISPOSITION_SELECT\)/);
    expect(src).toContain('DISPOSITION_SELECT');
  });
});
