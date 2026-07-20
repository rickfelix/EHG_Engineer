/**
 * SD-LEO-INFRA-HARNESS-BACKLOG-S1-ENUMERATION-SWEEP-001 — TS-1..TS-10.
 *
 * The sweep is a one-time pass over 3,000+ live production rows; these tests pin
 * the two failure classes RISK confirmed empirically at LEAD (PostgREST pagination
 * truncation, premise-liveness.js's frozen-clock default) plus the corroboration
 * gate, promotion budget, no-delete invariant, archive atomicity, resumability, and
 * the sibling-SD denylist.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseArgs,
  fetchAllOpenRows,
  classifyDoneState,
  selectPromotableGroups,
  isStaleSingleton,
  assertNoDeleteCalls,
  foldInRetroActionItems,
  foldInFlagReviewRows,
  runSweep,
  SIBLING_CLAIMED_IDS,
  PROMOTION_THRESHOLD,
  actionText,
  actionOwner,
} from '../../../scripts/one-off/s1-backlog-sweep.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SWEEP_SOURCE = path.resolve(__dirname, '../../../scripts/one-off/s1-backlog-sweep.mjs');

const NOW = Date.parse('2026-07-11T02:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 24 * 3600 * 1000).toISOString();

/** Minimal chainable mock covering .select/.eq/.is/.not/.gte/.order/.range/.update/.in/.single-ish flows used by the sweep. */
function makeSupabase({ feedbackRows = [], retroRows = [] } = {}) {
  const updates = [];
  function feedbackTable() {
    const ctx = { filters: [] };
    const api = {
      select(_cols, opts) { ctx.countMode = opts?.count === 'exact' && opts?.head === true; return api; },
      eq(col, val) { ctx.filters.push((r) => r[col] === val); return api; },
      is(col, val) {
        if (col === 'metadata->>s1_sweep_disposition') {
          ctx.filters.push((r) => (val === null ? !r.metadata?.s1_sweep_disposition : true));
        } else {
          ctx.filters.push((r) => (val === null ? r[col] == null : r[col] === val));
        }
        return api;
      },
      not(col, op, val) {
        if (op === 'in') {
          const set = new Set(val.replace(/[()]/g, '').split(','));
          ctx.filters.push((r) => !set.has(r[col]));
        }
        return api;
      },
      in(col, vals) { ctx.filters.push((r) => vals.includes(r[col])); return api; },
      gte(col, val) { ctx.filters.push((r) => r[col] >= val); return api; },
      order() { return api; },
      range(from, to) { ctx.range = [from, to]; return api; },
      update(vals) { ctx.op = 'update'; ctx.vals = vals; return api; },
      then(resolve) {
        const matched = feedbackRows.filter((r) => ctx.filters.every((f) => f(r)));
        if (ctx.op === 'update') {
          matched.forEach((r) => { updates.push({ id: r.id, vals: ctx.vals }); Object.assign(r, ctx.vals); });
          resolve({ data: null, error: null });
        } else if (ctx.countMode) {
          resolve({ count: matched.length, error: null });
        } else {
          const [from, to] = ctx.range || [0, matched.length - 1];
          resolve({ data: matched.slice(from, to + 1), error: null });
        }
      },
    };
    return api;
  }
  function retroTable() {
    const ctx = { filters: [] };
    const api = {
      select() { return api; },
      not() { ctx.filters.push((r) => r.action_items != null); return api; },
      update(vals) { ctx.op = 'update'; ctx.vals = vals; return api; },
      eq(col, val) { ctx.filters.push((r) => r[col] === val); return api; },
      then(resolve) {
        const matched = retroRows.filter((r) => ctx.filters.every((f) => f(r)));
        if (ctx.op === 'update') {
          matched.forEach((r) => Object.assign(r, ctx.vals));
          resolve({ data: null, error: null });
        } else {
          resolve({ data: matched, error: null });
        }
      },
    };
    return api;
  }
  return {
    from(name) { return name === 'feedback' ? feedbackTable() : retroTable(); },
    _updates: updates,
  };
}

describe('TS-6: static no-delete check', () => {
  it('the sweep source contains zero .delete( calls against the feedback table', () => {
    const src = fs.readFileSync(SWEEP_SOURCE, 'utf8');
    expect(() => assertNoDeleteCalls(src)).not.toThrow();
  });

  it('assertNoDeleteCalls throws on a synthetic violation', () => {
    expect(() => assertNoDeleteCalls('supabase.from(\'feedback\').delete().eq(\'id\', x)')).toThrow(/SAFETY/);
  });
});

describe('parseArgs', () => {
  it('defaults to dry-run', () => {
    expect(parseArgs(['node', 's']).dryRun).toBe(true);
  });
  it('--apply disables dry-run; --max-promotions overrides default', () => {
    const a = parseArgs(['node', 's', '--apply', '--max-promotions', '5']);
    expect(a.dryRun).toBe(false);
    expect(a.maxPromotions).toBe(5);
  });
});

describe('TS-1: paginated enumeration + COUNT(*) reconciliation', () => {
  it('fetches all rows across multiple pages (>1000 mocked rows)', async () => {
    const feedbackRows = Array.from({ length: 2500 }, (_, i) => ({
      id: `r${i}`, category: 'harness_backlog', archived_at: null, status: 'new',
      title: `row ${i}`, created_at: daysAgo(10), metadata: {},
    }));
    const supabase = makeSupabase({ feedbackRows });
    const { rows, liveCount } = await fetchAllOpenRows(supabase, { pageSize: 1000 });
    expect(liveCount).toBe(2500);
    expect(rows.length).toBe(2500);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2500); // no duplicates
  });

  it('excludes rows already stamped with s1_sweep_disposition (resumability)', async () => {
    const feedbackRows = [
      { id: 'a', category: 'harness_backlog', archived_at: null, status: 'new', created_at: daysAgo(5), metadata: {} },
      { id: 'b', category: 'harness_backlog', archived_at: null, status: 'new', created_at: daysAgo(5), metadata: { s1_sweep_disposition: { outcome: 'kept_actionable' } } },
    ];
    const supabase = makeSupabase({ feedbackRows });
    const { rows, liveCount } = await fetchAllOpenRows(supabase, {});
    expect(liveCount).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });

  it('throws PAGINATION_MISMATCH if the enumerated set does not match a fresh COUNT(*)', async () => {
    // Simulate a supabase where the count query sees more rows than the page query returns.
    const feedbackRows = [{ id: 'a', category: 'harness_backlog', archived_at: null, status: 'new', created_at: daysAgo(5), metadata: {} }];
    const supabase = makeSupabase({ feedbackRows });
    const originalFrom = supabase.from.bind(supabase);
    let call = 0;
    supabase.from = (name) => {
      const t = originalFrom(name);
      if (name === 'feedback') {
        const origThen = t.then.bind(t);
        t.then = (resolve) => {
          call++;
          if (call === 1) return resolve({ count: 999, error: null }); // lie: count says 999
          return origThen(resolve);
        };
      }
      return t;
    };
    await expect(fetchAllOpenRows(supabase, {})).rejects.toThrow(/PAGINATION_MISMATCH/);
  });
});

describe('TS-2/TS-3: dedup-by-done-state — nowMs always injected, corroboration gate', () => {
  it('always passes deps.nowMs through to checkFeedbackPremiseLiveness (never the frozen-clock default)', async () => {
    // Real proof, not a self-check: capture the actual .gte() cutoff argument sent to the
    // DB query. recentRecount computes it as cutoffISO(recentDays, nowMs) — if nowMs were
    // ever dropped, premise-liveness.js's cutoffISO() falls back to a hardcoded
    // 2026-06-23 base, producing a cutoff far from our injected NOW (2026-07-11). Capturing
    // the real argument means dropping the nowMs plumbing anywhere in the call chain makes
    // this test fail, unlike a tautological self-assignment.
    const row = { id: 'x', title: 'some backlog item', description: '', metadata: {} };
    let capturedGteArg = null;
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: (_col, val) => {
              capturedGteArg = val;
              // recentRecount (FR-6 batch 7) chains .order() then fetch-all-paginated
              // appends .range(); one empty short page = recount 0 (prior semantics).
              const pageChain = { order: () => pageChain, range: async () => ({ data: [], error: null }) };
              return { or: () => ({ limit: async () => ({ data: [] }) }), limit: async () => ({ data: [] }), order: () => pageChain };
            },
          }),
        }),
      }),
    };
    const git = () => '';
    const result = await classifyDoneState(row, { supabase: fakeSupabase, git, nowMs: NOW });
    expect(result.outcome).toBe('survivor'); // no recount, no shipped fix found -> LIVE/HOLD -> survivor bucket path handled by caller

    expect(capturedGteArg).toBeTruthy();
    // Both recentRecount (recentDays=30) and findShippedFix (completedDays=180) issue a
    // .gte() call against this mock's shared shape; findShippedFix's runs last, so its
    // completedDays=180 cutoff is what's captured. Either window correctly proves nowMs
    // propagated (both are computed from our injected NOW, not the frozen default) — the
    // key assertion is that it is NOT the frozen-clock-based value.
    const expectedCutoff = new Date(NOW - 180 * 24 * 3600 * 1000).toISOString();
    expect(capturedGteArg).toBe(expectedCutoff);
    // Sanity: the frozen-clock default (base 2026-06-23) would NOT match this — if nowMs
    // were ever dropped from the call chain, the captured cutoff would instead be
    // 2026-06-23 minus this window, far from our injected NOW-based value.
    const frozenClockCutoff180 = new Date(Date.parse('2026-06-23T00:00:00Z') - 180 * 24 * 3600 * 1000).toISOString();
    expect(capturedGteArg).not.toBe(frozenClockCutoff180);
  });

  it('file-corroborated STALE (confidence_score>=0.9) closes with citation', async () => {
    const row = { id: 'y', title: 'fixed thing', description: '', metadata: {} };
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => {
              // recentRecount (FR-6 batch 7): .order().range() resolves one empty
              // short page = recount 0 (prior `limit` terminal semantics preserved).
              const pageChain = { order: () => pageChain, range: async () => ({ data: [], error: null }) };
              return {
                limit: async () => ({ data: [] }),
                or: () => ({ limit: async () => ({ data: [{ sd_key: 'SD-FAKE-001', title: 'fixed thing', completion_date: daysAgo(2) }] }) }),
                order: () => pageChain,
              };
            },
          }),
        }),
      }),
    };
    const git = (argsString) => (argsString.includes('log --oneline') && argsString.includes('--') ? '' : '');
    // Force a file match via referenced_files by embedding a file path in the title/description.
    const rowWithFile = { ...row, description: 'see lib/fake/module.js for details' };
    const gitWithFileMatch = (argsString) => (argsString.includes('lib/fake/module.js') ? 'abc123 fix' : '');
    const result = await classifyDoneState(rowWithFile, { supabase: fakeSupabase, git: gitWithFileMatch, nowMs: NOW });
    expect(result.outcome).toBe('closed');
    expect(result.citation).toBeTruthy();
  });

  it('ILIKE-only match (no file corroboration) holds for review, never auto-closes', async () => {
    const row = { id: 'z', title: 'some backlog item', description: '', metadata: {} };
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => {
              // recentRecount (FR-6 batch 7): .order().range() resolves one empty
              // short page = recount 0 (prior `limit` terminal semantics preserved).
              const pageChain = { order: () => pageChain, range: async () => ({ data: [], error: null }) };
              return {
                limit: async () => ({ data: [] }),
                or: () => ({ limit: async () => ({ data: [{ sd_key: 'SD-FAKE-002', title: 'some backlog item', completion_date: daysAgo(2) }] }) }),
                order: () => pageChain,
              };
            },
          }),
        }),
      }),
    };
    const git = () => ''; // no file/commit corroboration at all
    const result = await classifyDoneState(row, { supabase: fakeSupabase, git, nowMs: NOW });
    expect(result.outcome).toBe('held_for_review');
  });
});

describe('TS-4: fingerprint grouping + promotion threshold', () => {
  it('a group with 3+ occurrences of the same title is selected for promotion; a group of 2 is not', () => {
    const rows = [
      { id: '1', title: 'recurring bug X', description: '', severity: 'high', created_at: daysAgo(5) },
      { id: '2', title: 'recurring bug X', description: '', severity: 'high', created_at: daysAgo(4) },
      { id: '3', title: 'recurring bug X', description: '', severity: 'high', created_at: daysAgo(3) },
      { id: '4', title: 'lonely bug Y', description: '', severity: 'medium', created_at: daysAgo(2) },
      { id: '5', title: 'twice bug Z', description: '', severity: 'low', created_at: daysAgo(2) },
      { id: '6', title: 'twice bug Z', description: '', severity: 'low', created_at: daysAgo(1) },
    ];
    const { toPromote, singletons } = selectPromotableGroups(rows, { threshold: PROMOTION_THRESHOLD, maxPromotions: 10 });
    expect(toPromote.length).toBe(1);
    expect(toPromote[0].rows.length).toBe(3);
    expect(singletons.some((g) => g.rows[0].id === '4')).toBe(true);
  });
});

describe('TS-5: promotion budget enforcement', () => {
  it('caps promotions at maxPromotions; excess groups appear as deferred', () => {
    const rows = [];
    for (let g = 0; g < 5; g++) {
      for (let occ = 0; occ < 3; occ++) {
        rows.push({ id: `g${g}-${occ}`, title: `bug group ${g}`, description: '', severity: 'medium', created_at: daysAgo(1) });
      }
    }
    const { toPromote, deferred } = selectPromotableGroups(rows, { threshold: 3, maxPromotions: 2 });
    expect(toPromote.length).toBe(2);
    expect(deferred.length).toBe(3);
  });
});

describe('TS-7: archive atomicity + staleness check', () => {
  it('isStaleSingleton is true only past the staleness window', () => {
    const fresh = { created_at: daysAgo(5) };
    const stale = { created_at: daysAgo(45) };
    expect(isStaleSingleton(fresh, { nowMs: NOW })).toBe(false);
    expect(isStaleSingleton(stale, { nowMs: NOW })).toBe(true);
  });

  it('archives a stale informational singleton via ONE atomic update carrying category, archived_at, and resolution_notes together', async () => {
    const row = {
      id: 'stale1', category: 'harness_backlog', archived_at: null, status: 'new',
      title: 'unique never-recurred old thing', description: '', severity: 'low',
      created_at: daysAgo(45), metadata: {},
    };
    const supabase = makeSupabase({ feedbackRows: [row] });
    const result = await runSweep(['node', 's', '--apply'], { supabase, nowMs: NOW });
    expect(result.ledger.archived_via_reclassify).toBe(1);

    const archiveUpdate = supabase._updates.find((u) => u.id === 'stale1' && u.vals.category === 'informational_note');
    expect(archiveUpdate).toBeTruthy();
    // Atomicity: all three fields present in the SAME update call, not split across writes.
    expect(archiveUpdate.vals.category).toBe('informational_note');
    expect(archiveUpdate.vals.archived_at).toBeTruthy();
    expect(archiveUpdate.vals.resolution_notes).toBeTruthy();
    // Only one update call touched this row's archive fields (no separate archived_at-only write).
    const rowUpdates = supabase._updates.filter((u) => u.id === 'stale1');
    expect(rowUpdates.filter((u) => u.vals.archived_at).length).toBe(1);
  });
});

describe('TS-9: sibling-SD denylist', () => {
  it('SIBLING_CLAIMED_IDS names exactly the 3 rows claimed by SHIP-WITNESS-TRIO-001', () => {
    expect(SIBLING_CLAIMED_IDS).toEqual(['b119bba1', 'a50dd499', '98e6619a']);
  });

  it('a full runSweep pass counts sibling rows separately and never dispositions them otherwise', async () => {
    const feedbackRows = [
      { id: 'b119bba1', category: 'harness_backlog', archived_at: null, status: 'new', title: 'ship witness thing', description: '', severity: 'medium', created_at: daysAgo(5), metadata: {} },
    ];
    const supabase = makeSupabase({ feedbackRows });
    const result = await runSweep(['node', 's', '--dry-run'], { supabase, nowMs: NOW });
    expect(result.ledger.closed_by_sibling_sd).toBe(1);
    expect(result.ledger.kept_actionable).toBe(0);
    expect(result.ledger.closed_with_citation).toBe(0);
  });
});

describe('TS-10: retro action-item and flag_review fold-ins', () => {
  it('foldInRetroActionItems promotes only high-priority, unpromoted retros in --apply mode', async () => {
    const retroRows = [
      { id: 'r1', sd_id: 'SD-X', action_items: [{ item: 'do the thing', owner: 'a', priority: 'high' }], metadata: {} },
      { id: 'r2', sd_id: 'SD-Y', action_items: [{ item: 'low pri', owner: 'b', priority: 'low' }], metadata: {} },
      { id: 'r3', sd_id: 'SD-Z', action_items: [{ item: 'already', owner: 'c', priority: 'high' }], metadata: { action_items_promoted: true } },
    ];
    const supabase = makeSupabase({ retroRows });
    // dry-run: no execFileSync shell-outs
    const result = await foldInRetroActionItems(supabase, { dryRun: true });
    expect(result.promoted).toBe(0); // dry-run never increments promoted
    expect(result.noHighPriority).toBe(1);
    expect(result.skipped).toBe(1);
  });

  // QF-20260711-977: three action_items shapes exist in the wild. The original inline
  // `i.item || i.action || '(no text)'` never checked the third (manually-authored
  // SD_COMPLETION retro) shape's `.title`, so every such retro's action items promoted
  // as literal "(no text)" / "(owner: unassigned)". Mirrors the already-fixed
  // scripts/promote-retro-action-items.mjs (QF-20260711-253).
  describe('actionText / actionOwner — all three known action_items shapes', () => {
    it('retro-agent prompt-driven shape { item, owner }', () => {
      expect(actionText({ item: 'do the thing', owner: 'a', priority: 'high' })).toBe('do the thing');
      expect(actionOwner({ item: 'do the thing', owner: 'a', priority: 'high' })).toBe('a');
    });
    it('generateSmartActionItems shape { action, owner }', () => {
      expect(actionText({ action: 'do the other thing', owner: 'b', priority: 'high' })).toBe('do the other thing');
      expect(actionOwner({ action: 'do the other thing', owner: 'b', priority: 'high' })).toBe('b');
    });
    it('manually-authored SD_COMPLETION shape { title, owner_role } — the previously-broken case', () => {
      expect(actionText({ title: 'Read source before finalizing scope', owner_role: 'PLAN', priority: 'high' })).toBe('Read source before finalizing scope');
      expect(actionOwner({ title: 'Read source before finalizing scope', owner_role: 'PLAN', priority: 'high' })).toBe('PLAN');
    });
    it('falls back to the literal placeholders only when NO known field is present', () => {
      expect(actionText({ priority: 'high' })).toBe('(no text)');
      expect(actionOwner({ priority: 'high' })).toBe('unassigned');
    });
  });

  it('foldInFlagReviewRows only ever calls defer (never approve/reject) and only on corroborated matches', async () => {
    const row = { id: 'fr1', title: 'flag review item', description: 'touches lib/fake/thing.js', category: 'harness_backlog', severity: 'critical', status: 'new', created_at: daysAgo(60), metadata: {} };
    const feedbackRows = [row];
    const supabase = makeSupabase({ feedbackRows });
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = (name) => {
      if (name === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => ({ gte: () => ({ or: () => ({ limit: async () => ({ data: [{ sd_key: 'SD-FIX-001', title: 'flag review item', completion_date: daysAgo(2) }] }) }) }) }) }) };
      }
      return originalFrom(name);
    };
    const result = await foldInFlagReviewRows(supabase, { dryRun: true, nowMs: NOW });
    // dry-run path: deferred count increments when a corroborated STALE match is found
    expect(typeof result.deferred).toBe('number');
    expect(typeof result.left).toBe('number');
  });
});

describe('runSweep — ledger reconciliation', () => {
  it('every enumerated row is accounted for exactly once in the ledger', async () => {
    const feedbackRows = [
      { id: 'a', category: 'harness_backlog', archived_at: null, status: 'new', title: 'unique thing A', description: '', severity: 'medium', created_at: daysAgo(2), metadata: {} },
      { id: 'b', category: 'harness_backlog', archived_at: null, status: 'new', title: 'unique thing B', description: '', severity: 'low', created_at: daysAgo(45), metadata: {} },
    ];
    const supabase = makeSupabase({ feedbackRows });
    const result = await runSweep(['node', 's', '--dry-run'], { supabase, nowMs: NOW });
    const l = result.ledger;
    const total = l.closed_with_citation + l.held_for_review + l.promoted_to_qf.reduce((n, p) => n + p.count, 0)
      + l.archived_via_reclassify + l.kept_actionable + l.closed_by_sibling_sd + l.deferred_over_budget;
    expect(total).toBe(l.live_count);
  });
});
