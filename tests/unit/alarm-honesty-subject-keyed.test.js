/**
 * SD-LEO-INFRA-ALARM-HONESTY-001 — subject-keyed predicates for proxy-keyed alarms.
 * Incorporates the PLAN TESTING gaps (evidence d02d4a1c):
 *  GAP-3: the genuine sibling has consult_purpose ABSENT (three arms in one run);
 *  GAP-4: the negative control models the REJECTED not.eq three-valued-logic form and shows
 *         it drops the key-absent genuine row — proving the JS post-filter is the right gate;
 *  GAP-5: repo-wide single-definition pin (a file-scoped pin can't see a third copy);
 *  GAP-1/2: fail-open asserts POSITIVE dispatch, driven through the REAL hasRecentReminder
 *         with a rejecting supabase (not a stubbed-throwing probe);
 *  GAP-6: Adam-leg parity against literal pre-refactor constants incl. no-live/dry-run arms;
 *  GAP-7: dedup-skip log content + the probe bound into BOTH legs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require2 = createRequire(import.meta.url);
const { isPreSendCc, findOverdueReplyNeeded, checkAndPingOverdueReplies } = require2('../../lib/coordinator/reply-class.cjs');
const { dispatchAdamReminder, dispatchSolomonReminder, hasRecentReminder, REMINDER_DEDUP_WINDOW_MS, ADAM_REMINDER } = require2('../../scripts/coordinator-hourly-review.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const PAST = new Date(NOW - 60_000).toISOString();

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

// ── FR-1: ping_on_silence CC-exclusion ──────────────────────────────────────

function rowShape(id, payloadExtra) {
  return {
    id, target_session: 'solomon-uuid', subject: '[SOLOMON_CONSULT] pre-send', body: 'b', created_at: PAST,
    payload: { kind: 'solomon_consult', reply_class: 'reply-needed', reply_expected_by: PAST, correlation_id: 'corr-' + id, ...payloadExtra },
  };
}

function makeSweepSupabase(rows) {
  // Mirrors the sweep select shape: resolves rows for the sender-scoped query, and an empty
  // answered set. update() records ping_sent_at stamps.
  const updates = [];
  const chain = (result) => {
    const c = {};
    for (const m of ['select', 'eq', 'is', 'gte', 'not', 'or', 'limit', 'order']) c[m] = () => c;
    c.then = (res) => res(result);
    return c;
  };
  return {
    _updates: updates,
    from(table) {
      return {
        select: () => chain({ data: table === 'session_coordination' ? rows : [], error: null }),
        update: (patch) => ({ eq: async (_c, id) => { updates.push({ id, patch }); return { error: null }; } }),
      };
    },
  };
}

describe('FR-1: isPreSendCc — the reply-owed-by-addressee exclusion (three arms, one run)', () => {
  it('excludes the incident-shaped CC, pings the key-ABSENT genuine sibling, pings an other-valued row', async () => {
    const ccRow = rowShape('cc', { consult_purpose: 'pre_send' });         // the measured false-dun shape
    const genuineAbsent = rowShape('genuine', {});                          // ABSENT key = genuine (GAP-3)
    const otherValue = rowShape('other', { consult_purpose: 'follow_up' }); // non-pre_send stays genuine
    const inserts = [];
    const sb = makeSweepSupabase([ccRow, genuineAbsent, otherValue]);
    const res = await checkAndPingOverdueReplies(sb, {
      sessionId: 'adam-uuid', senderType: 'adam', now: NOW,
      insert: async (_sb, row) => { inserts.push(row); return { data: { id: 'p' }, error: null }; },
    });
    const pingedCorrs = inserts.map((r) => r.payload.correlation_id).sort();
    expect(pingedCorrs).toEqual(['corr-genuine', 'corr-other']); // CC excluded, both genuine arms pinged
    expect(res.pinged).toBe(2);
  });

  it('predicate semantics: only the literal pre_send exempts; absent/other/null-safe', () => {
    expect(isPreSendCc({ payload: { consult_purpose: 'pre_send' } })).toBe(true);
    expect(isPreSendCc({ payload: {} })).toBe(false);
    expect(isPreSendCc({ payload: { consult_purpose: 'follow_up' } })).toBe(false);
    expect(isPreSendCc({})).toBe(false);
    expect(isPreSendCc(null)).toBe(false);
  });

  it('NEGATIVE CONTROL (GAP-4): the rejected not.eq three-valued form drops the key-absent genuine row', () => {
    // Model SQL: NOT (consult_purpose = 'pre_send') with consult_purpose NULL evaluates NULL → row excluded.
    const sqlNotEq = (r) => {
      const v = r.payload.consult_purpose;
      if (v === undefined || v === null) return null; // three-valued: unknown
      return v !== 'pre_send';
    };
    const survives = (r) => sqlNotEq(r) === true; // SQL keeps only TRUE rows
    const genuineAbsent = rowShape('genuine', {});
    const ccRow = rowShape('cc', { consult_purpose: 'pre_send' });
    // The rejected form drops the GENUINE row (the inversion the PRD forbids) …
    expect(survives(genuineAbsent)).toBe(false);
    expect(survives(ccRow)).toBe(false);
    // … while the shipped JS predicate keeps it.
    expect(!isPreSendCc(genuineAbsent)).toBe(true);
  });

  it('findOverdueReplyNeeded stays UNTOUCHED by the exclusion (second consumer inbox-sla unaffected)', () => {
    const ccRow = rowShape('cc', { consult_purpose: 'pre_send' });
    const out = findOverdueReplyNeeded([ccRow], NOW, new Set());
    expect(out).toHaveLength(1); // the pure classifier still reports it overdue; only the ping seam excludes
  });

  it('a suppressed CC RETIRES from the sweep: stamped ping_suppressed_at, and the fetch excludes stamped rows (PR #6942 WARNING)', async () => {
    // Without retirement, excluded CCs match the unordered limit-200 fetch forever and can
    // starve genuine consults out of the window once a CC-heavy sender accumulates >200.
    const ccRow = rowShape('cc', { consult_purpose: 'pre_send' });
    const sb = makeSweepSupabase([ccRow]);
    await checkAndPingOverdueReplies(sb, {
      sessionId: 'adam-uuid', senderType: 'adam', now: NOW,
      insert: async () => ({ data: { id: 'p' }, error: null }),
    });
    // The CC was not pinged, but it WAS retired with the honestly-named stamp.
    expect(sb._updates).toHaveLength(1);
    expect(sb._updates[0].id).toBe('cc');
    expect(sb._updates[0].patch.payload.ping_suppressed_at).toBe(new Date(NOW).toISOString());
    expect(sb._updates[0].patch.payload.ping_sent_at).toBeUndefined(); // never a fake ping stamp
  });
});

describe('FR-1: one isPreSendCc representation repo-wide (GAP-5)', () => {
  it('exactly one definition; solomon-advisory imports it and keeps no local copy', () => {
    const replyClass = fs.readFileSync(path.resolve(__dirname, '../../lib/coordinator/reply-class.cjs'), 'utf-8');
    const solomonAdv = fs.readFileSync(path.resolve(__dirname, '../../scripts/solomon-advisory.cjs'), 'utf-8');
    expect(replyClass).toMatch(/function isPreSendCc/);
    expect(solomonAdv).not.toMatch(/const isPreSendCc\s*=/);
    expect(solomonAdv).toMatch(/isPreSendCc,?\s*\n?\}?\s*=\s*require\(.*reply-class/s);
    const defCount = (src) => (src.match(/function isPreSendCc|const isPreSendCc\s*=/g) || []).length;
    expect(defCount(replyClass)).toBe(1);
    expect(defCount(solomonAdv)).toBe(0);
  });

  it('REPO-WIDE census: no third definition anywhere in lib/ or scripts/ (a two-file pin cannot see a third copy)', () => {
    // TESTING GAP-5 (evidence 94c7c9af): walk the trees the predicate could plausibly land in,
    // so a third copy in ANY file turns this red — not just the two named ones.
    const roots = ['lib', 'scripts'].map((d) => path.resolve(__dirname, '../../' + d));
    const defs = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        // one-off excluded: untracked scratch evidence-writers QUOTE predicate source in
        // findings text — they are records about the code, not definitions of it.
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'archive' || entry.name === 'one-off') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(cjs|mjs|js)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf-8');
          if (/function isPreSendCc|const isPreSendCc\s*=/.test(src)) defs.push(full);
        }
      }
    };
    roots.forEach(walk);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatch(/reply-class\.cjs$/);
  });
});

// ── FR-2: hourly reminder dedup ─────────────────────────────────────────────

// Literal pre-refactor constants (GAP-6): these are the exact values the inline Adam leg
// carried before extraction — the baseline must not be re-derived from the refactored code.
const ADAM_ROW_LITERALS = {
  sender_type: 'coordinator',
  message_type: 'INFO',
  subject: 'Hourly: review your Adam responsibilities',
  payload_kind: 'coordinator_reminder',
  payload_topic: 'adam_responsibilities',
  expires_ms: 90 * 60 * 1000,
};

function makeDedupSupabase({ recentRows = [], readError = null, reject = false } = {}) {
  // FILTER-RECORDING mock (adversarial review PR #6942): the previous no-op chain could not
  // see a DROPPED clause — the SEC-3/4 edit silently replaced .gte(created_at) and every
  // test stayed green while one delivered reminder suppressed the channel forever. Every
  // chain call is recorded so the query SHAPE is assertable, not just its result.
  const calls = [];
  const c = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'limit']) {
    c[m] = (...args) => { calls.push({ m, args }); return c; };
  }
  c.then = (res, rej) => {
    if (reject) return rej(new Error('connection reset'));
    return res({ data: recentRows, error: readError });
  };
  return { from: () => c, _calls: calls };
}

describe('FR-2: hasRecentReminder — three outcomes, fail-open (GAP-1/GAP-2)', () => {
  it('returns the row when a reminder was delivered within the window', async () => {
    const sb = makeDedupSupabase({ recentRows: [{ id: 'r1', created_at: PAST }] });
    const out = await hasRecentReminder(sb, { target: 't', topic: 'adam_responsibilities', now: NOW });
    expect(out).toEqual({ id: 'r1', created_at: PAST });
  });
  it('returns false (measured-absent) when none in window', async () => {
    const out = await hasRecentReminder(makeDedupSupabase({}), { target: 't', topic: 'x', now: NOW });
    expect(out).toBe(false);
  });

  it('THE QUERY SHAPE ITSELF: window clause present with the computed sinceIso, sender-narrowed, newest-first (PR #6942 CRITICAL)', async () => {
    const sb = makeDedupSupabase({});
    await hasRecentReminder(sb, { target: 't1', topic: 'adam_responsibilities', now: NOW, windowMs: 55 * 60 * 1000 });
    const expectSince = new Date(NOW - 55 * 60 * 1000).toISOString();
    // The dropped-clause regression: one delivered reminder suppressed the channel forever
    // because sinceIso was computed but never applied. This pin makes the WINDOW clause a
    // test-visible contract, not an implementation detail a refactor can silently drop.
    expect(sb._calls).toContainEqual({ m: 'gte', args: ['created_at', expectSince] });
    expect(sb._calls).toContainEqual({ m: 'eq', args: ['sender_type', 'coordinator'] });
    expect(sb._calls).toContainEqual({ m: 'order', args: ['created_at', { ascending: false }] });
    expect(sb._calls).toContainEqual({ m: 'eq', args: ['payload->>topic', 'adam_responsibilities'] });
  });
  it('returns null (could-not-look) on a query error AND on a thrown rejection — never a suppressing value', async () => {
    expect(await hasRecentReminder(makeDedupSupabase({ readError: { message: 'boom' } }), { target: 't', topic: 'x', now: NOW })).toBe(null);
    expect(await hasRecentReminder(makeDedupSupabase({ reject: true }), { target: 't', topic: 'x', now: NOW })).toBe(null);
  });
});

describe('FR-2: dispatchAdamReminder — parity, dedup two-sided, fail-open positive dispatch', () => {
  const adam = { id: 'adam-uuid-1234', ageS: 30 };
  const mkOpts = (over = {}) => ({
    dryRun: false,
    resolveAdam: async () => adam,
    insert: over.insert,
    checkRecent: over.checkRecent,
    now: NOW,
    ...over,
  });

  it('row-shape parity against the literal pre-refactor constants (GAP-6)', async () => {
    const inserts = [];
    const before = Date.now();
    const res = await dispatchAdamReminder({}, mkOpts({ insert: async (_sb, row) => { inserts.push(row); }, checkRecent: async () => false }));
    expect(res).toEqual({ dispatched: true, target: adam.id });
    const row = inserts[0];
    expect(row.sender_type).toBe(ADAM_ROW_LITERALS.sender_type);
    expect(row.message_type).toBe(ADAM_ROW_LITERALS.message_type);
    expect(row.subject).toBe(ADAM_ROW_LITERALS.subject);
    expect(row.target_session).toBe(adam.id);
    expect(row.body).toBe(ADAM_REMINDER);
    expect(row.payload.kind).toBe(ADAM_ROW_LITERALS.payload_kind);
    expect(row.payload.topic).toBe(ADAM_ROW_LITERALS.payload_topic);
    const ttl = Date.parse(row.expires_at) - before;
    expect(ttl).toBeGreaterThan(ADAM_ROW_LITERALS.expires_ms - 10_000);
    expect(ttl).toBeLessThan(ADAM_ROW_LITERALS.expires_ms + 10_000);
  });

  it('no-live-Adam and dry-run arms return the verdicts main() early-returns on (GAP-6)', async () => {
    expect(await dispatchAdamReminder({}, mkOpts({ resolveAdam: async () => null }))).toEqual({ dispatched: false, reason: 'no_live_adam' });
    expect(await dispatchAdamReminder({}, mkOpts({ dryRun: true }))).toEqual({ dispatched: false, reason: 'dry_run', target: adam.id });
  });

  it('dedup two-sided: within-window skips (naming the row), beyond-window dispatches', async () => {
    const inserts = [];
    const insert = async (_sb, row) => { inserts.push(row); };
    const skip = await dispatchAdamReminder({}, mkOpts({ insert, checkRecent: async () => ({ id: 'prev-row-id', created_at: PAST }) }));
    expect(skip).toEqual({ dispatched: false, reason: 'dedup_recent', target: adam.id, recentId: 'prev-row-id' });
    expect(inserts).toHaveLength(0);
    const logCalls = console.log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logCalls).toMatch(/dedup skip/);
    expect(logCalls).toMatch(/prev-row/); // GAP-7: the skip names the last-delivered row
    const go = await dispatchAdamReminder({}, mkOpts({ insert, checkRecent: async () => false }));
    expect(go.dispatched).toBe(true);
    expect(inserts).toHaveLength(1);
  });

  it('FAIL-OPEN asserts the POSITIVE (GAP-1/2): a rejecting supabase through the REAL probe still dispatches', async () => {
    const inserts = [];
    const rejectingSb = makeDedupSupabase({ reject: true });
    // checkRecent deliberately NOT stubbed — the REAL hasRecentReminder runs against the
    // rejecting client, exercising the actual could-not-look path end to end.
    const res = await dispatchAdamReminder(rejectingSb, mkOpts({ insert: async (_sb, row) => { inserts.push(row); } }));
    expect(res.dispatched).toBe(true);   // the positive assertion, not merely no-throw
    expect(inserts).toHaveLength(1);
  });
});

describe('FR-2: the Solomon leg shares the same probe (GAP-7 both-legs binding)', () => {
  it('dedup-skips with the same three-outcome contract', async () => {
    const inserts = [];
    const res = await dispatchSolomonReminder({}, {
      dryRun: false,
      resolveSolomon: async () => 'solomon-uuid-1',
      insert: async (_sb, row) => { inserts.push(row); },
      buildFoundations: async () => 'pointer',
      checkRecent: async () => ({ id: 'prev-sol', created_at: PAST }),
      now: NOW,
    });
    expect(res).toEqual({ dispatched: false, reason: 'dedup_recent', target: 'solomon-uuid-1', recentId: 'prev-sol' });
    expect(inserts).toHaveLength(0);
  });
});
