/**
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 FR-1 / FR-7 — clearAndReopenQf.
 *
 * THE DEFECT. Clearing quick_fixes.claiming_session_id without reverting status leaves the row at
 * status='in_progress' with a NULL claimant: invisible to all five open-only chokepoints, while two
 * supply gauges still count it. The work leaves the belt and the gauge says it is still there.
 *
 * WHY THE FAKE APPLIES PREDICATES INSTEAD OF RECORDING CALLS. A call-recording stub
 * (`expect(update).toHaveBeenCalledWith({status:'open'})`) asserts the ARGUMENT, not the EFFECT. A
 * helper that issues exactly that UPDATE against a predicate matching ZERO rows — say it kept a
 * stale `.not('claiming_session_id','is',null)`, or filtered status='open' instead of
 * 'in_progress' — passes that assertion while mutating nothing, and the row stays stranded. That is
 * PAT-TEST-STUBBED-WRITER-UNVERIFIED-001. So the fake below is a small in-memory matcher that
 * evaluates EVERY recorded predicate against the row and mutates only on a real match.
 *
 * AND WHY EVERY REFUSAL IS PAIRED WITH AN ALLOW. Every assertion in this file is satisfiable by a
 * helper that never changes anything. `changed:false` on a guarded row is exactly what an
 * always-refuse implementation returns — and an always-refuse helper would leave all 7 currently
 * stranded rows stranded while passing every refusal test anyone would think to write. The allow
 * case is the only one that can fail against it.
 *
 * FR-7 asserts REACHABILITY, not update shape: the mutated row is fed to the REAL isAutoStartableQF
 * (scripts/worker-checkin.cjs:575) — the predicate that actually decides whether a worker can pick
 * the row up. A wrong written value ('closed') and a never-matching predicate (row stays
 * 'in_progress') both die on that same line, which is why it is the right instrument.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { clearAndReopenQf } from '../../../lib/fleet/best-effort-release.mjs';

const require_ = createRequire(import.meta.url);
const { isAutoStartableQF } = require_('../../../scripts/worker-checkin.cjs');

/**
 * A realistic stranded row. created_at is REQUIRED and recent: isAutoStartableQF parses it and
 * returns false on NaN or on an age past STALE_QF_DAYS, so a fixture omitting it reports
 * "unreachable" for a reason that has nothing to do with the defect under test — which would make
 * the FR-7 assertion pass for the wrong reason before the fix and fail for the wrong reason after.
 * The other fields are the real eligibility surface (factory_lane, routing_tier, owner, title and
 * description are all read by that predicate) pinned to their permissive values so that status is
 * the ONLY thing standing between this row and claimability.
 */
const STRANDED = () => ({
  id: 'QF-20260726-TEST',
  status: 'in_progress',
  claiming_session_id: null,
  pr_url: null,
  commit_sha: null,
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  factory_lane: false,
  routing_tier: 1,
  owner: null,
  release_condition: null,
  not_before: null,
  title: 'benign fixture',
  description: 'benign fixture body',
});

/**
 * In-memory supabase double. Records the predicate chain, then APPLIES it — so a filter that
 * cannot match anything produces no mutation, exactly as the real database would.
 */
function fakeDb(row) {
  const preds = [];
  let patch = null;
  const builder = {
    update(p) { patch = p; return builder; },
    eq(col, val) { preds.push((r) => r[col] === val); return builder; },
    filter(col, op, val) {
      if (op !== 'eq') throw new Error(`fake supports only eq, got ${op}`);
      preds.push((r) => r[col] === val);
      return builder;
    },
    is(col, val) { preds.push((r) => r[col] === val); return builder; },
    not(col, op, val) {
      if (op !== 'is') throw new Error(`fake supports only not/is, got ${op}`);
      preds.push((r) => r[col] !== val);
      return builder;
    },
    async select() {
      const matched = preds.every((p) => p(row));
      if (!matched) return { data: [], error: null };
      Object.assign(row, patch);           // the real mutation the assertions observe
      return { data: [{ id: row.id }], error: null };
    },
  };
  return { from: () => builder, get predicateCount() { return preds.length; } };
}

describe('FR-1: clearAndReopenQf reopens a stranded row', () => {
  it('ALLOWS the stranded case — the arm an always-refuse helper fails', () => {
    // Load-bearing. Without this, every other test here passes over `return {changed:false}`,
    // which would leave all 7 live stranded rows stranded and still look correct.
    const row = STRANDED();
    return clearAndReopenQf(fakeDb(row), row.id).then((res) => {
      expect(res).toEqual({ changed: true, reason: 'reopened' });
      expect(row.status).toBe('open');            // effect, observed on the row itself
      expect(row.claiming_session_id).toBeNull();
    });
  });

  it('FR-7 REACHABILITY: the reopened row becomes claimable by the real predicate', async () => {
    // The whole defect in one assertion. Note the row is fed to isAutoStartableQF BEFORE and AFTER
    // — asserting only the "after" would pass on a row that was already claimable.
    const row = STRANDED();
    expect(isAutoStartableQF(row, Date.now())).toBe(false);   // stranded == unreachable
    await clearAndReopenQf(fakeDb(row), row.id);
    expect(isAutoStartableQF(row, Date.now())).toBe(true);    // reachable
  });
});

describe('FR-1: the guard refuses rows it must not touch', () => {
  it('refuses a row carrying a merged PR', async () => {
    const row = { ...STRANDED(), pr_url: 'https://github.com/x/y/pull/1' };
    const res = await clearAndReopenQf(fakeDb(row), row.id);
    expect(res.changed).toBe(false);
    expect(row.status).toBe('in_progress');                  // untouched, not merely unreported
    expect(isAutoStartableQF(row, Date.now())).toBe(false);  // and still not claimable
  });

  it('refuses a row carrying a commit', async () => {
    const row = { ...STRANDED(), commit_sha: 'abc1234' };
    expect((await clearAndReopenQf(fakeDb(row), row.id)).changed).toBe(false);
    expect(row.status).toBe('in_progress');
  });

  it('refuses a row that already has a live claimant', async () => {
    // The concurrency case: another session claimed it between the read and this write.
    const row = { ...STRANDED(), claiming_session_id: 'other-session' };
    expect((await clearAndReopenQf(fakeDb(row), row.id)).changed).toBe(false);
    expect(row.claiming_session_id).toBe('other-session');   // never clobbered
  });

  it('refuses a row that is already terminal (completed)', async () => {
    // Guards the four legitimately-terminal call sites from resurrection.
    const row = { ...STRANDED(), status: 'completed' };
    expect((await clearAndReopenQf(fakeDb(row), row.id)).changed).toBe(false);
    expect(row.status).toBe('completed');
  });

  it('applies ALL FOUR guard predicates, not a subset', async () => {
    // A helper that drops one predicate still passes every case above if the fixture only varies
    // the columns it kept. Pin the count: id + status + claiming_session_id + pr_url + commit_sha.
    const row = STRANDED();
    const db = fakeDb(row);
    await clearAndReopenQf(db, row.id);
    expect(db.predicateCount).toBe(5);
  });
});

describe('FR-1: reports failure instead of hiding it', () => {
  it('is fail-soft on a database error and says why', async () => {
    // A release path must not throw because the reopen half failed — but it must not report
    // success either. Silent success on a failed write is the camouflage this SD removes.
    const db = { from: () => ({
      update: () => db.from(), eq: () => db.from(), filter: () => db.from(), is: () => db.from(),
      select: async () => ({ data: null, error: { message: 'boom' } }),
    }) };
    const res = await clearAndReopenQf(db, 'QF-X');
    expect(res.changed).toBe(false);
    expect(res.reason).toMatch(/^update_failed:/);
  });

  it('refuses missing arguments rather than issuing an unscoped update', async () => {
    expect(await clearAndReopenQf(null, 'QF-X')).toEqual({ changed: false, reason: 'missing_argument' });
    expect(await clearAndReopenQf({}, null)).toEqual({ changed: false, reason: 'missing_argument' });
  });
});
