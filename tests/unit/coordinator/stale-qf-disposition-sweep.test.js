/**
 * SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 — TS-1..TS-10.
 *
 * emit-feedback.js is mocked at the module level: its real implementation does its own
 * Supabase round-trips (dedup pre-check, v_active_sessions auto-fill, audience routing) that
 * are already covered by lib/governance's own test suite. Mocking it here keeps this file
 * focused on the sweep's OWN decision logic (dedupe, citation routing, batching, TTL) and lets
 * assertions inspect exactly what the sweep passed to it (status, dedup_key, description).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

vi.mock('../../../lib/governance/emit-feedback.js', () => ({
  emitFeedback: vi.fn().mockResolvedValue({ id: 'fake-feedback-id', deduped: false }),
}));

import { emitFeedback } from '../../../lib/governance/emit-feedback.js';
import {
  parseArgs,
  isColumnAbsentError,
  ensureDispositionColumnsExist,
  staleClockMs,
  assertNoRawGreatest,
  selectDuplicateClosures,
  applyBatchingCap,
  composeChairmanLine,
  runSweep,
  REVERIFIED_FILE_THRESHOLD,
} from '../../../scripts/coordinator-stale-qf-disposition-sweep.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SWEEP_SOURCE = path.resolve(__dirname, '../../../scripts/coordinator-stale-qf-disposition-sweep.mjs');

const NOW = Date.parse('2026-08-16T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 24 * 3600 * 1000).toISOString();

let FIXTURE_ROOT;
beforeAll(() => {
  FIXTURE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sqds-'));
  fs.mkdirSync(path.join(FIXTURE_ROOT, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'tests', 'passing.test.js'), '// fixture');
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'tests', 'failing.test.js'), '// fixture');
});
afterAll(() => fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true }));
beforeEach(() => emitFeedback.mockClear());

const runTestStub = (testPath) => (testPath.includes('passing') ? 'PASS' : 'FAIL');

/** TABLE-AWARE fake covering quick_fixes (select/eq/is/order/range/limit/update) + claude_sessions. */
function makeSupabase({ rows = [], columnsExist = true, claudeSessionsCount = 5 } = {}) {
  const updates = [];
  const POST_MIGRATION_COLS = ['disposition', 'disposition_reason_code', 'disposed_at', 'disposed_by', 'verified_at', 'duplicate_of_id'];

  function quickFixesTable() {
    const ctx = { filters: [] };
    const api = {
      select(colsStr, opts) {
        ctx.cols = colsStr || '';
        ctx.countMode = opts?.count === 'exact' && opts?.head === true;
        if (!columnsExist && POST_MIGRATION_COLS.some((c) => ctx.cols.includes(c))) {
          ctx.columnError = { code: '42703', message: 'column quick_fixes.disposition does not exist' };
        }
        return api;
      },
      eq(col, val) { ctx.filters.push((r) => r[col] === val); return api; },
      is(col, val) { ctx.filters.push((r) => (val === null ? (r[col] === null || r[col] === undefined) : r[col] === val)); return api; },
      order() { return api; },
      range(from, to) { ctx.range = [from, to]; return api; },
      limit(n) { ctx.limit = n; return api; },
      update(vals) { ctx.op = 'update'; ctx.vals = vals; return api; },
      then(resolve) {
        if (ctx.columnError) { resolve({ data: null, error: ctx.columnError, count: null }); return; }
        const matched = rows.filter((r) => ctx.filters.every((f) => f(r)));
        if (ctx.op === 'update') {
          matched.forEach((r) => { updates.push({ id: r.id, vals: { ...ctx.vals } }); Object.assign(r, ctx.vals); });
          resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
          return;
        }
        if (ctx.countMode) { resolve({ count: matched.length, error: null }); return; }
        if (typeof ctx.limit === 'number') { resolve({ data: matched.slice(0, ctx.limit), error: null }); return; }
        const [from, to] = ctx.range || [0, matched.length - 1];
        resolve({ data: matched.slice(from, to + 1), error: null });
      },
    };
    return api;
  }

  function claudeSessionsTable() {
    const api = { select() { return api; }, eq() { return api; }, gte() { return api; }, then(resolve) { resolve({ count: claudeSessionsCount, error: null }); } };
    return api;
  }

  return {
    from(name) {
      if (name === 'quick_fixes') return quickFixesTable();
      if (name === 'claude_sessions') return claudeSessionsTable();
      throw new Error(`unexpected table in mock: ${name}`);
    },
    _updates: updates,
  };
}

const baseRow = (over = {}) => ({
  status: 'open', claiming_session_id: null, pr_url: null, commit_sha: null,
  severity: 'medium', created_at: daysAgo(10), target_application: 'EHG_Engineer',
  title: 'x', description: 'no citation here at all', ...over,
});

describe('parseArgs', () => {
  it('defaults to dry-run', () => {
    expect(parseArgs(['node', 's']).apply).toBe(false);
  });
  it('--apply sets apply true; --h2-confirmed captures the date; --seat-count captures the number', () => {
    const a = parseArgs(['node', 's', '--apply', '--h2-confirmed=2026-08-16', '--seat-count', '7']);
    expect(a.apply).toBe(true);
    expect(a.h2Confirmed).toBe('2026-08-16');
    expect(a.seatCount).toBe(7);
  });
});

describe('TS-9: FR-2 column-absence predicate — 42703/PGRST204-specific, never any-error', () => {
  it('recognizes 42703 (SELECT-path) and PGRST204 (INSERT-path) as column-absent', () => {
    expect(isColumnAbsentError({ code: '42703' })).toBe(true);
    expect(isColumnAbsentError({ code: 'PGRST204' })).toBe(true);
  });
  it('does NOT conflate an unrelated error (42501 permission-denied) with column-absent', () => {
    expect(isColumnAbsentError({ code: '42501', message: 'permission denied' })).toBe(false);
  });
  it('ensureDispositionColumnsExist returns false on column-absent, true when present, throws on unrelated error', async () => {
    await expect(ensureDispositionColumnsExist(makeSupabase({ columnsExist: false }))).resolves.toBe(false);
    await expect(ensureDispositionColumnsExist(makeSupabase({ columnsExist: true }))).resolves.toBe(true);
    const throwingSupabase = { from: () => ({ select: () => ({ limit: () => Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied' } }) }) }) };
    await expect(ensureDispositionColumnsExist(throwingSupabase)).rejects.toBeTruthy();
  });
  it('--apply refuses when disposition columns are absent', async () => {
    const supabase = makeSupabase({ rows: [], columnsExist: false });
    await expect(runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], { supabase, nowMs: NOW, seatCount: 3 }))
      .rejects.toThrow(/DISPOSITION_COLUMNS_NOT_YET_APPLIED/);
  });
  it('dry-run succeeds identically whether or not the migration has landed', async () => {
    const pre = makeSupabase({ rows: [], columnsExist: false });
    const post = makeSupabase({ rows: [], columnsExist: true });
    await expect(runSweep(['node', 'sweep'], { supabase: pre, nowMs: NOW, seatCount: 3 })).resolves.toBeTruthy();
    await expect(runSweep(['node', 'sweep'], { supabase: post, nowMs: NOW, seatCount: 3 })).resolves.toBeTruthy();
  });
});

describe('TS-8: H2 CLI gate + positive control via the REAL citation checker', () => {
  it('--apply without --h2-confirmed refuses', async () => {
    const supabase = makeSupabase({ rows: [], columnsExist: true });
    await expect(runSweep(['node', 'sweep', '--apply'], { supabase, nowMs: NOW, seatCount: 3 }))
      .rejects.toThrow(/H2_NOT_CONFIRMED/);
  });
  it('--apply --h2-confirmed=<date> proceeds', async () => {
    const supabase = makeSupabase({ rows: [], columnsExist: true });
    await expect(runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], { supabase, nowMs: NOW, seatCount: 3 }))
      .resolves.toBeTruthy();
  });
  it('--h2-confirmed with a non-date value refuses (SECURITY sub-agent finding: a non-empty check alone accepted any string)', async () => {
    const supabase = makeSupabase({ rows: [], columnsExist: true });
    await expect(runSweep(['node', 'sweep', '--apply', '--h2-confirmed=yes'], { supabase, nowMs: NOW, seatCount: 3 }))
      .rejects.toThrow(/H2_NOT_CONFIRMED/);
  });
  it('a seeded past-fence positive-control fixture run through the REAL citation checker resolves STILL_PRESENT, never premise_resolved', async () => {
    const row = baseRow({ id: 'QF-POSCTRL', severity: 'high', description: 'covered by tests/failing.test.js' });
    const supabase = makeSupabase({ rows: [row], columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 3, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.counts.resolved).toBe(0);
    expect(result.counts.reVerified + result.counts.promoted).toBe(1);
  });
});

describe('TS-10: chairman count-line exact format', () => {
  it('composes the exact string format', () => {
    expect(composeChairmanLine({ duplicates: 2, unverifiedStale: 5, reVerified: 1, promoted: 1, resolved: 3 }))
      .toBe('2 duplicates, 5 unverified-stale, 1 re-verified, 1 promoted, 3 resolved');
  });
  it('defaults missing counts to 0', () => {
    expect(composeChairmanLine({})).toBe('0 duplicates, 0 unverified-stale, 0 re-verified, 0 promoted, 0 resolved');
  });
});

describe('TS-1: dedupe-before-verify ordering + empty-body negative control', () => {
  it('an 8-row near-duplicate fixture collapses to exactly 1 survivor + 7 duplicate_of dispositions', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => baseRow({
      id: `QF-DUP-${i}`,
      title: i % 2 === 0 ? 'The Gate Never Consults Cache' : 'the gate never consults cache',
      description: '  Symptom:   stale reads observed  ',
    }));
    const supabase = makeSupabase({ rows, columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 5, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.counts.duplicates).toBe(7);
    const closedAsDuplicate = supabase._updates.filter((u) => u.vals.disposition === 'duplicate_of');
    expect(closedAsDuplicate.length).toBe(7);
    const survivorIds = new Set(closedAsDuplicate.map((u) => u.vals.duplicate_of_id));
    expect(survivorIds.size).toBe(1);
    // Ordering: every loser's ONLY write is duplicate_of -- never overwritten by a later
    // citation-check disposition, proving the survivor's citation check never ran on them.
    const loserIds = new Set(closedAsDuplicate.map((u) => u.id));
    for (const id of loserIds) {
      const writesForId = supabase._updates.filter((u) => u.id === id);
      expect(writesForId).toHaveLength(1);
      expect(writesForId[0].vals.disposition).toBe('duplicate_of');
    }
  });

  it('NEGATIVE CONTROL: N rows all lacking extractable content each become their own singleton, never one false cluster', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => baseRow({
      id: `QF-EMPTY-${i}`, title: null, description: null, target_application: null,
    }));
    const supabase = makeSupabase({ rows, columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 5, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.counts.duplicates).toBe(0);
  });

  it('pure selectDuplicateClosures: empty-body rows never collapse into one cluster, real content does', () => {
    const empties = Array.from({ length: 4 }, (_, i) => baseRow({ id: `QF-E${i}`, title: null, description: null, target_application: null }));
    const { survivors, duplicateClosures } = selectDuplicateClosures(empties);
    expect(survivors).toHaveLength(4);
    expect(duplicateClosures).toHaveLength(0);

    const dupes = [baseRow({ id: 'QF-A', title: 'Same Symptom', description: 'x' }), baseRow({ id: 'QF-B', title: 'same symptom', description: 'x' })];
    const { survivors: s2, duplicateClosures: d2 } = selectDuplicateClosures(dupes);
    expect(s2).toHaveLength(1);
    expect(d2).toHaveLength(1);
  });
});

describe('TS-3: premise_unverified_stale preserves signal via a feedback row, no dedup_hash collisions', () => {
  it('every INCONCLUSIVE closure produces exactly one feedback row; two different QFs produce two distinct dedup_keys', async () => {
    const rows = [
      baseRow({ id: 'QF-INC-1', description: 'no citation here at all row one' }),
      baseRow({ id: 'QF-INC-2', description: 'no citation here at all row two' }),
    ];
    const supabase = makeSupabase({ rows, columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 3, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.counts.unverifiedStale).toBe(2);
    expect(emitFeedback).toHaveBeenCalledTimes(2);
    const dedupKeys = emitFeedback.mock.calls.map((c) => c[0].dedup_key);
    expect(new Set(dedupKeys).size).toBe(2);
    for (const call of emitFeedback.mock.calls) {
      // status:'resolved' is the actual lever that excludes this row from
      // feedback-fingerprint-promoter.mjs's own re-promotion candidate query.
      expect(call[0].status).toBe('resolved');
      expect(call[0].category).toBe('harness_backlog');
    }
  });

  it('closes disposition=premise_unverified_stale, status=closed on the quick_fixes row itself, with the citation checker\'s own reason code (VALIDATION sub-agent finding G3 -- was NULL before)', async () => {
    const rows = [baseRow({ id: 'QF-INC-3', description: 'no citation at all here either' })];
    const supabase = makeSupabase({ rows, columnsExist: true });
    await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], { supabase, nowMs: NOW, seatCount: 3, repoRoot: FIXTURE_ROOT, runTest: runTestStub });
    const update = supabase._updates.find((u) => u.id === 'QF-INC-3');
    expect(update.vals.disposition).toBe('premise_unverified_stale');
    expect(update.vals.status).toBe('closed');
    expect(update.vals.disposition_reason_code).toBe('no_deterministic_signal');
  });
});

describe('TS-4: re_verified vs promoted threshold (3 files)', () => {
  it('<=3 extracted paths -> re_verified, status stays open, verified_at stamped, disposed_by set', async () => {
    const row = baseRow({ id: 'QF-3PATH', description: 'covered by tests/failing.test.js and lib/a.js and lib/b.js' });
    const supabase = makeSupabase({ rows: [row], columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 3, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.counts.reVerified).toBe(1);
    expect(result.counts.promoted).toBe(0);
    const update = supabase._updates.find((u) => u.id === 'QF-3PATH');
    expect(update.vals.status).toBeUndefined();
    expect(update.vals.disposition).toBe('re_verified');
    expect(update.vals.verified_at).toBeTruthy();
    expect(update.vals.disposed_by).toBeTruthy();
  });

  it('BOUNDARY: exactly 3 paths -> re_verified; 4 paths -> promoted', async () => {
    const row3 = baseRow({ id: 'QF-EXACT3', description: 'covered by tests/failing.test.js and lib/a.js and lib/b.js' });
    const row4 = baseRow({ id: 'QF-EXACT4', description: 'covered by tests/failing.test.js and lib/a.js and lib/b.js and lib/c.js' });
    const supabase = makeSupabase({ rows: [row3, row4], columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 5, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.counts.reVerified).toBe(1);
    expect(result.counts.promoted).toBe(1);
    expect(supabase._updates.find((u) => u.id === 'QF-EXACT3').vals.disposition).toBe('re_verified');
    expect(supabase._updates.find((u) => u.id === 'QF-EXACT4').vals.disposition).toBe('promoted');
  });

  it('>3 extracted paths -> promoted, status=escalated, escalation_reason set (reuses existing CHECK)', async () => {
    const row = baseRow({ id: 'QF-4PATH', description: 'covered by tests/failing.test.js and lib/a.js and lib/b.js and lib/c.js' });
    const supabase = makeSupabase({ rows: [row], columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 3, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.counts.promoted).toBe(1);
    const update = supabase._updates.find((u) => u.id === 'QF-4PATH');
    expect(update.vals.status).toBe('escalated');
    expect(update.vals.escalation_reason).toBeTruthy();
  });
});

describe('TS-5 / FR-6: status-flip design — (disposition, status) pairing for all 5 values', () => {
  it('premise_resolved -> closed', async () => {
    const row = baseRow({ id: 'QF-ABSENT', description: 'covered by tests/passing.test.js' });
    const supabase = makeSupabase({ rows: [row], columnsExist: true });
    await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], { supabase, nowMs: NOW, seatCount: 3, repoRoot: FIXTURE_ROOT, runTest: runTestStub });
    const u = supabase._updates.find((x) => x.id === 'QF-ABSENT');
    expect(u.vals.disposition).toBe('premise_resolved');
    expect(u.vals.status).toBe('closed');
    expect(u.vals.disposition_reason_code).toBeTruthy();
  });

  it('duplicate_of -> closed', async () => {
    const rows = [baseRow({ id: 'QF-SURV', title: 'Same', description: 'y' }), baseRow({ id: 'QF-DUP', title: 'same', description: 'y' })];
    const supabase = makeSupabase({ rows, columnsExist: true });
    await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], { supabase, nowMs: NOW, seatCount: 3, repoRoot: FIXTURE_ROOT, runTest: runTestStub });
    const loser = supabase._updates.find((x) => x.vals.disposition === 'duplicate_of');
    expect(loser.vals.status).toBe('closed');
  });

  // FR-6 AC-5 (TESTING sub-agent finding, EXEC-TO-PLAN): the PRD's literal AC asks for a
  // before/after fixture-driven count check on fleet-dashboard.cjs and data-loaders.js -- both
  // unedited by this SD. A full functional integration test for two files this SD does not touch
  // is out of scope; this is the narrower, honest substitute: a source-pin regression proving the
  // SPECIFIC clauses that make closed/escalated invisible by construction are still there. If a
  // future edit ever widens either to include 'closed' or 'escalated', this fails loudly instead
  // of the drop silently regressing.
  it('source-pin: the two unedited belt/gauge readers still exclude closed/escalated by construction', () => {
    const dataLoadersSrc = fs.readFileSync(path.resolve(__dirname, '../../../scripts/modules/sd-next/data-loaders.js'), 'utf8');
    const fleetDashboardSrc = fs.readFileSync(path.resolve(__dirname, '../../../scripts/fleet-dashboard.cjs'), 'utf8');
    // Both known QF-status-filtering call sites the TESTING sub-agent verified read
    // .in('status', ['open', 'in_progress']) -- neither substring 'closed' nor 'escalated' may
    // appear inside that specific array literal.
    const clause = /\.in\(\s*'status'\s*,\s*\[\s*'open'\s*,\s*'in_progress'\s*\]\s*\)/g;
    const dataLoadersMatches = dataLoadersSrc.match(clause) || [];
    const fleetDashboardMatches = fleetDashboardSrc.match(clause) || [];
    // EXACT counts, not >=1 (TESTING sub-agent re-verification residual): data-loaders.js has TWO
    // qualifying call sites (:449, :555) -- an >=1 bound would miss one of them silently
    // regressing while the other still passes. Pinned to the counts measured live at review time.
    expect(dataLoadersMatches.length).toBe(2);
    expect(fleetDashboardMatches.length).toBe(1);
  });
});

describe('TS-2: FR-2 refusal gate uses the correct 42703/PGRST204 predicate, not table-absence codes', () => {
  it('a PGRST204 (INSERT-path) column-absence error also triggers the --apply refusal', async () => {
    const supabase = { from: () => ({ select: () => ({ limit: () => Promise.resolve({ data: null, error: { code: 'PGRST204', message: "Could not find the 'disposition' column" } }) }) }) };
    await expect(runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], { supabase, nowMs: NOW, seatCount: 3 }))
      .rejects.toThrow(/DISPOSITION_COLUMNS_NOT_YET_APPLIED/);
  });

  it('a table-absence code (42P01/PGRST205) is NOT treated as column-absent -- propagates as a genuine error', () => {
    expect(isColumnAbsentError({ code: '42P01' })).toBe(false);
    expect(isColumnAbsentError({ code: 'PGRST205' })).toBe(false);
  });
});

describe('TS-7: batching cap respects an injected live seat count', () => {
  it('never marks more than deps.seatCount of re_verified/promoted rows per run; the rest are left untouched', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => baseRow({
      id: `QF-BATCH-${i}`, severity: i === 0 ? 'critical' : 'medium', created_at: daysAgo(10 + i),
      description: `covered by tests/failing.test.js and lib/${i}.js`,
    }));
    const supabase = makeSupabase({ rows, columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 2, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.counts.reVerified + result.counts.promoted).toBe(2);
    expect(result.counts.deferredOverSeatCount).toBe(3);
    const dispositioned = supabase._updates.filter((u) => ['re_verified', 'promoted'].includes(u.vals.disposition));
    expect(dispositioned).toHaveLength(2);
    // remaining candidates are left disposition=NULL -- never written at all this run.
    const untouchedIds = rows.map((r) => r.id).filter((id) => !dispositioned.some((u) => u.id === id));
    expect(untouchedIds).toHaveLength(3);
    for (const id of untouchedIds) {
      expect(supabase._updates.some((u) => u.id === id)).toBe(false);
    }
  });

  it('pure applyBatchingCap: caps at seatCount, oldest-high-severity-first, defers the remainder', () => {
    const candidates = [
      { qf: { severity: 'medium', created_at: daysAgo(5) }, result: { extractedPathCount: 1 } },
      { qf: { severity: 'critical', created_at: daysAgo(1) }, result: { extractedPathCount: 1 } },
      { qf: { severity: 'medium', created_at: daysAgo(20) }, result: { extractedPathCount: 1 } },
    ];
    const { toDispose, deferred } = applyBatchingCap(candidates, 2);
    expect(toDispose).toHaveLength(2);
    expect(deferred).toHaveLength(1);
    expect(toDispose[0].qf.severity).toBe('critical'); // highest severity first
  });

  it('a seatCount of 0 defers everything', () => {
    const candidates = [{ qf: { severity: 'high', created_at: daysAgo(5) }, result: { extractedPathCount: 1 } }];
    const { toDispose, deferred } = applyBatchingCap(candidates, 0);
    expect(toDispose).toHaveLength(0);
    expect(deferred).toHaveLength(1);
  });
});

describe('TS-6: staleClockMs TTL clock', () => {
  it('is exported and directly unit-tested (no SQL execution): verified_at wins over an older created_at', () => {
    const row = { verified_at: daysAgo(1), started_at: null, created_at: daysAgo(60) };
    const clock = staleClockMs(row, NOW);
    expect(NOW - clock).toBeLessThan(2 * 24 * 3600 * 1000);
  });

  it('the common case (verified_at/started_at null, created_at present) reflects the real age, never epoch-1970', () => {
    const row = { verified_at: null, started_at: null, created_at: daysAgo(45) };
    const clock = staleClockMs(row, NOW);
    const ageDays = (NOW - clock) / (24 * 3600 * 1000);
    expect(ageDays).toBeCloseTo(45, 0);
  });

  it('ALL-NULL case reads as maximally stale, never as fresh', () => {
    const clock = staleClockMs({ verified_at: null, started_at: null, created_at: null }, NOW);
    expect(NOW - clock).toBe(Infinity);
  });

  describe('BOUNDARY under a pinned non-UTC timezone (30d+2h, inside the measured 4h skew margin)', () => {
    // Mirrors tests/unit/time/pg-timestamp-tz.test.js's pattern. HONEST CAVEAT (that file's own
    // documented limit, reproduced here rather than overclaimed): mutating process.env.TZ in
    // beforeAll is NOT guaranteed to affect Date parsing mid-process on every platform -- measured
    // inert (0h delta) on win32 during this SD's own EXEC-TO-PLAN review. The self-check below
    // reports which is actually true on the CURRENT run rather than assuming it. Regardless of
    // whether the mutation itself took effect, the main assertion below is still meaningful:
    // staleClockMs must be correct on ANY platform, because pgTimestampMs() never consults
    // process.env.TZ at all (it appends Z and lets Date parse an already-explicit-UTC string) --
    // that invariance IS the fix. A NAIVE (no trailing Z) fixture is required for the assertion to
    // mean anything: an already-Z-suffixed string parses identically under any TZ and would pass
    // even under a broken (non-pgTimestampMs) implementation.
    const TZ = 'America/New_York';
    const NAIVE_PROBE = '2026-07-29T05:25:20.028';
    let originalTZ;
    beforeAll(() => { originalTZ = process.env.TZ; process.env.TZ = TZ; });
    afterAll(() => { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; });

    it('self-check: reports whether the TZ mutation is actually in effect on this platform (informational, never fails the suite)', () => {
      // Never asserts -- a platform where the mutation is inert is a KNOWN, already-documented
      // limit (tests/unit/time/pg-timestamp-tz.test.js:48-57), not a defect in this file.
      const shiftHours = (Date.parse(NAIVE_PROBE) - Date.parse(`${NAIVE_PROBE}Z`)) / 3600000;
      // eslint-disable-next-line no-console
      console.log(`[TZ pin self-check] process.env.TZ=${process.env.TZ}, bare Date.parse shift vs UTC = ${shiftHours}h (0 means the mutation is INERT on this platform/Node build)`);
    });

    it('a 30d+2h-old naive created_at ages out past the 30-day TTL, independent of host/pin timezone', () => {
      const boundaryMs = NOW - (30 * 24 + 2) * 3600 * 1000;
      const boundaryNaive = new Date(boundaryMs).toISOString().replace(/Z$/, '');
      const clock = staleClockMs({ verified_at: null, started_at: null, created_at: boundaryNaive }, NOW);
      expect(NOW - clock).toBeGreaterThanOrEqual(30 * 24 * 3600 * 1000);
      // Exact instant, not just "greater than" -- a tz-shifted parse would be off by ~4h,
      // still individually plausible but wrong; pin the precise value too.
      expect(clock).toBe(boundaryMs);
    });

    it('CONTROL: a naive-Date.getTime()-based (broken) implementation WOULD fail this exact fixture on a non-UTC-ambient host', () => {
      // Proves the guard can fire at all (mirrors the two-halves discipline used for
      // assertNoRawGreatest below) -- without this, a silently-inert TZ pin plus an
      // always-passing assertion would be indistinguishable from a real guard.
      const boundaryMs = NOW - (30 * 24 + 2) * 3600 * 1000;
      const boundaryNaive = new Date(boundaryMs).toISOString().replace(/Z$/, '');
      const brokenClock = new Date(boundaryNaive).getTime(); // the naive mistake this SD forbids
      const ambientIsNonUTC = new Date('2026-01-01T00:00:00').getTimezoneOffset() !== 0;
      if (ambientIsNonUTC) {
        expect(brokenClock).not.toBe(boundaryMs);
      } else {
        // eslint-disable-next-line no-console
        console.log('[TZ pin self-check] ambient host is UTC -- the broken-implementation control is not exercisable on this runner.');
      }
    });
  });
});

describe('TS-6: source-pin guard — no raw SQL GREATEST( in the sweep source (two halves)', () => {
  it('the real sweep source file contains no raw GREATEST( call', () => {
    const src = fs.readFileSync(SWEEP_SOURCE, 'utf8');
    expect(() => assertNoRawGreatest(src)).not.toThrow();
  });
  it('assertNoRawGreatest throws on a synthetic violation', () => {
    expect(() => assertNoRawGreatest('SELECT GREATEST(a, b, c) FROM quick_fixes')).toThrow(/SAFETY/);
  });
});

// SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 (TESTING sub-agent finding, EXEC-TO-PLAN): the
// naive `sum(counts) === candidateCount` identity silently breaks in two real cases a
// seatCount:10-with-zero-relapses fixture never exercises: (a) deferredOverSeatCount is a
// candidate that got NO disposition this run, so it must be added to the sum, not omitted; (b)
// TTL-relapsed rows are sourced from a SEPARATE query (disposition='re_verified'), never members
// of `candidates`, so they must be SUBTRACTED back out of unverifiedStale before comparing
// against candidateCount. The complete, correct invariant covers both.
describe('accounting: every past-fence candidate is accounted for exactly once', () => {
  it('duplicates + resolved + (unverifiedStale - relapsed) + reVerified + promoted + deferred === candidateCount (no deferrals/relapses)', async () => {
    const rows = [
      baseRow({ id: 'QF-A1', title: 'dup', description: 'z' }),
      baseRow({ id: 'QF-A2', title: 'dup', description: 'z' }),
      baseRow({ id: 'QF-B', description: 'covered by tests/passing.test.js' }),
      baseRow({ id: 'QF-C', description: 'covered by tests/failing.test.js and lib/a.js' }),
      baseRow({ id: 'QF-D', description: 'no citation anywhere in this text' }),
    ];
    const supabase = makeSupabase({ rows, columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 10, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.relapsedCount).toBe(0);
    const sum = result.counts.duplicates + result.counts.resolved
      + (result.counts.unverifiedStale - result.relapsedCount)
      + result.counts.reVerified + result.counts.promoted + result.counts.deferredOverSeatCount;
    expect(sum).toBe(result.candidateCount);
  });

  it('holds even when the seat count forces a real deferral (non-zero deferredOverSeatCount)', async () => {
    const rows = Array.from({ length: 4 }, (_, i) => baseRow({
      id: `QF-DEFER-${i}`, created_at: daysAgo(10 + i),
      description: `covered by tests/failing.test.js and lib/${i}.js`,
    }));
    const supabase = makeSupabase({ rows, columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 1, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.counts.deferredOverSeatCount).toBeGreaterThan(0);
    const sum = result.counts.duplicates + result.counts.resolved
      + (result.counts.unverifiedStale - result.relapsedCount)
      + result.counts.reVerified + result.counts.promoted + result.counts.deferredOverSeatCount;
    expect(sum).toBe(result.candidateCount);
  });

  it('holds even when a TTL relapse fires (non-zero relapsedCount, sourced outside candidates)', async () => {
    const staleReverified = baseRow({
      id: 'QF-STALE-REVER', disposition: 're_verified', verified_at: daysAgo(31), started_at: null,
      created_at: daysAgo(90), // older than verified_at too -- staleClockMs must pick verified_at
      // (the more recent of the two), so the TTL clock genuinely reflects the LAST re-verify, not
      // this row's original creation. Both must be past the 30-day TTL for the relapse to fire.
      description: 'covered by tests/failing.test.js',
    });
    // A second, unrelated fresh candidate so candidateCount > 0 independently of the relapse row
    // (which is NOT a member of `candidates` -- it's excluded by the main query's `disposition IS
    // NULL` filter and picked up only by the separate TTL re-lapse query).
    const freshCandidate = baseRow({ id: 'QF-FRESH', description: 'no citation anywhere here' });
    const supabase = makeSupabase({ rows: [staleReverified, freshCandidate], columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 10, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.relapsedCount).toBe(1);
    expect(result.candidateCount).toBe(1); // the re_verified row is NOT a candidate
    const sum = result.counts.duplicates + result.counts.resolved
      + (result.counts.unverifiedStale - result.relapsedCount)
      + result.counts.reVerified + result.counts.promoted + result.counts.deferredOverSeatCount;
    expect(sum).toBe(result.candidateCount);
    // And the relapsed row itself really did close as premise_unverified_stale, with a reason
    // code that distinguishes a TIME-based relapse from a fresh citation-check INCONCLUSIVE
    // (VALIDATION sub-agent finding G3).
    const relapseUpdate = supabase._updates.find((u) => u.id === 'QF-STALE-REVER');
    expect(relapseUpdate.vals.disposition).toBe('premise_unverified_stale');
    expect(relapseUpdate.vals.disposition_reason_code).toMatch(/^ttl_relapsed:/);
  });

  // VALIDATION sub-agent finding G2: the original TTL relapse query filtered ONLY on
  // disposition='re_verified', with no status/claiming_session_id guard, unlike the main
  // candidate query. A re_verified row that gets claimed after its last verify (status flips to
  // 'in_progress', but the claim path never touches disposition) could be closed out from under
  // an active worker once its TTL expired -- violating this SD's explicit DOES NOT and TR-2.
  // Measured reachable in production: the claim path does not stamp started_at, so staleClockMs
  // stays pinned at verified_at and ages out on schedule regardless of the claim.
  it('NEVER relapses a re_verified row that has since been claimed (status=in_progress) -- the exact scope violation VALIDATION found', async () => {
    const claimedReverified = baseRow({
      id: 'QF-CLAIMED-REVER', status: 'in_progress', claiming_session_id: 'sess-active-worker',
      disposition: 're_verified', verified_at: daysAgo(31), started_at: null, created_at: daysAgo(90),
      description: 'covered by tests/failing.test.js',
    });
    const supabase = makeSupabase({ rows: [claimedReverified], columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 10, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.relapsedCount).toBe(0);
    expect(supabase._updates.find((u) => u.id === 'QF-CLAIMED-REVER')).toBeUndefined();
  });

  it('NEVER relapses a re_verified row whose status is no longer open (e.g. already closed some other way)', async () => {
    const closedReverified = baseRow({
      id: 'QF-CLOSED-REVER', status: 'closed', claiming_session_id: null,
      disposition: 're_verified', verified_at: daysAgo(31), started_at: null, created_at: daysAgo(90),
      description: 'covered by tests/failing.test.js',
    });
    const supabase = makeSupabase({ rows: [closedReverified], columnsExist: true });
    const result = await runSweep(['node', 'sweep', '--apply', '--h2-confirmed=2026-08-16'], {
      supabase, nowMs: NOW, seatCount: 10, repoRoot: FIXTURE_ROOT, runTest: runTestStub,
    });
    expect(result.relapsedCount).toBe(0);
    expect(supabase._updates.find((u) => u.id === 'QF-CLOSED-REVER')).toBeUndefined();
  });
});
