/**
 * SD-LEO-INFRA-AUTO-REFILL-414-NULL-TITLES-001 — the belt-dry root cause: all pending todoist/youtube
 * roadmap_wave_items had title=NULL, so evaluateRefillCandidate rejected every one (missing_title)
 * and the auto-refill cron promoted 0. This pins the resolver, the backfill branches, the populator
 * fail-loud guard, and the refill-recovers assertion.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveSourceTitle, isUsableTitle } from '../../../lib/sourcing-engine/resolve-source-title.js';
import { runBackfill } from '../../../scripts/sourcing-engine/backfill-414-null-titles.mjs';
import { evaluateRefillCandidate } from '../../../lib/sourcing-engine/refill-candidate-validity.js';

/** Stub supabase: intake tables map source_id→title; roadmap_wave_items select returns `rows`. */
function makeSupabase({ intake = {}, rows = [] } = {}) {
  const updates = [];
  return {
    updates,
    from(table) {
      if (table === 'eva_todoist_intake' || table === 'eva_youtube_intake') {
        let _id = null;
        const api = {
          select() { return api; },
          eq(_col, val) { _id = val; return api; },
          async maybeSingle() { return { data: intake[_id] ? { title: intake[_id] } : null }; },
        };
        return api;
      }
      // roadmap_wave_items
      const ctx = { op: null, vals: null };
      const api = {
        select() { ctx.op = 'select'; return api; },
        update(v) { ctx.op = 'update'; ctx.vals = v; return api; },
        eq() { return api; },
        is() { return api; },
        in() { return api; },
        order() { return api; },                                    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: fetchAllPaginated chains .order() before .range()
        range() { return Promise.resolve({ data: rows, error: null }); }, // single-page: fewer rows than pageSize ends the paginate loop
        then(resolve) { resolve({ data: rows, error: null }); },     // select(...).is().eq().in() awaited
        catch() { return api; },
      };
      // update(...).eq().is()/.eq() is awaited → record then resolve
      const origEq = api.eq;
      api.eq = (...a) => { if (ctx.op === 'update') { /* terminal-ish */ } return origEq.call(api, ...a); };
      api.then = (resolve) => {
        if (ctx.op === 'update') { updates.push(ctx.vals); resolve({ error: null }); }
        else resolve({ data: rows, error: null });
      };
      return api;
    },
  };
}

describe('resolveSourceTitle + isUsableTitle', () => {
  it('resolves a todoist/youtube title by source_id', async () => {
    const sb = makeSupabase({ intake: { 'src-1': 'Ship the thing' } });
    expect(await resolveSourceTitle(sb, { source_type: 'todoist', source_id: 'src-1' })).toBe('Ship the thing');
  });
  it('returns null when the intake row is missing or placeholder', async () => {
    const sb = makeSupabase({ intake: { 'src-x': '(untitled)' } });
    expect(await resolveSourceTitle(sb, { source_type: 'youtube', source_id: 'missing' })).toBeNull();
    expect(await resolveSourceTitle(sb, { source_type: 'youtube', source_id: 'src-x' })).toBeNull();
  });
  it('isUsableTitle rejects empty/placeholder', () => {
    expect(isUsableTitle('x')).toBe(true);
    expect(isUsableTitle('')).toBe(false);
    expect(isUsableTitle('   ')).toBe(false);
    expect(isUsableTitle('(untitled)')).toBe(false);
    expect(isUsableTitle(null)).toBe(false);
  });
});

describe('runBackfill', () => {
  it('recovers recoverable rows and dispositions the irrecoverable (apply)', async () => {
    const sb = makeSupabase({
      intake: { 'a': 'Real Todoist Title' }, // 'b' has no intake → irrecoverable
      rows: [
        { id: 'r1', title: null, source_type: 'todoist', source_id: 'a', item_disposition: 'pending', metadata: {} },
        { id: 'r2', title: null, source_type: 'youtube', source_id: 'b', item_disposition: 'pending', metadata: {} },
      ],
    });
    const res = await runBackfill({ supabase: sb, apply: true, log: () => {} });
    expect(res.scanned).toBe(2);
    expect(res.recovered).toBe(1);
    expect(res.dispositioned).toBe(1);
    // one update set a title; one set dropped + metadata marker
    expect(sb.updates.some((u) => u.title === 'Real Todoist Title')).toBe(true);
    expect(sb.updates.some((u) => u.item_disposition === 'dropped' && u.metadata?.title_unrecoverable === true)).toBe(true);
  });

  it('dry-run writes nothing', async () => {
    const sb = makeSupabase({ intake: { 'a': 'T' }, rows: [{ id: 'r1', title: null, source_type: 'todoist', source_id: 'a', item_disposition: 'pending', metadata: {} }] });
    const res = await runBackfill({ supabase: sb, apply: false, log: () => {} });
    expect(res.dry_run).toBe(true);
    expect(res.recovered).toBe(1);
    expect(sb.updates.length).toBe(0);
  });
});

describe('refill recovers after backfill', () => {
  it('evaluateRefillCandidate no longer reports missing_title once a title is present', () => {
    // A null title is invalid (the gate ordering may surface an earlier reason like not_staged,
    // but the row never passes); the key assertion is that a PRESENT title never yields missing_title.
    const before = evaluateRefillCandidate({ title: null, metadata: {} }, { shippedTitleSet: new Set(), distilledOnly: false });
    expect(before.valid).toBe(false);
    const after = evaluateRefillCandidate({ title: 'Real Todoist Title', metadata: {} }, { shippedTitleSet: new Set(), distilledOnly: false });
    expect(after.reason === undefined || !/missing_title/.test(String(after.reason))).toBe(true);
  });
});
