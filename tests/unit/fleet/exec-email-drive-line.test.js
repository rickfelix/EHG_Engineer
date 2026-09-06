/**
 * SD-FDBK-INFRA-ENCODE-DRIVE-SIX-GOAL-001 — lib/fleet/exec-email-drive-line.mjs.
 *
 * This is THE shared query + composition both chairman surfaces (morning-brief SMS,
 * exec-summary email) call — see the cross-surface wiring block at the bottom, which is the
 * FR-8 "can't render two different drive numbers from two different rows in one morning" check.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  driveBreakdownFactsFromReport, selectTopLeverLeg, composeDriveLine, driveFlatnessClause,
  RATIFIED_POSSIBLE, TRAILING_WINDOW,
} from '../../../lib/fleet/exec-email-drive-line.mjs';
import { RATIFIED_LEG_IDS } from '../../../lib/drive-loop/score/drive-score-legs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const scoreFixture = (legs, extra = {}) => ({
  score: { value: legs.reduce((s, l) => s + (l.value ?? 0), 0) },
  possible: legs.length * 2,
  measured_legs: legs.map((l) => ({ leg: l.leg, value: l.value, table: 't', predicate: 'p' })),
  unavailable_legs: [],
  ...extra,
});

describe('RATIFIED_POSSIBLE — the fixed standing-goal denominator', () => {
  it('is 6 (3 ratified legs x 2 points), never the aggregate\'s own run-scoped possible', () => {
    expect(RATIFIED_POSSIBLE).toBe(6);
  });
});

describe('driveBreakdownFactsFromReport — converts a drive_reports row into formatter input', () => {
  it('a fully-measured row produces all 3 ratified legs with their values, possible fixed at 6', () => {
    const report = { drive_score: scoreFixture([
      { leg: 'leg1_landed', value: 2 }, { leg: 'leg2_uptake', value: 1 }, { leg: 'leg4_capacity', value: 1 },
    ]) };
    const facts = driveBreakdownFactsFromReport(report);
    expect(facts.score).toBe(4);
    expect(facts.possible).toBe(6);
    expect(facts.legs).toEqual([
      { id: 'leg1_landed', value: 2 }, { id: 'leg2_uptake', value: 1 }, { id: 'leg4_capacity', value: 1 },
    ]);
    expect(RATIFIED_LEG_IDS).toContain(facts.topLeverLeg);
  });

  it('a leg ABSENT from measured_legs renders as value:null (unavailable), never fabricated 0', () => {
    const report = { drive_score: scoreFixture([{ leg: 'leg1_landed', value: 2 }, { leg: 'leg2_uptake', value: 1 }]) };
    const facts = driveBreakdownFactsFromReport(report);
    const byId = Object.fromEntries(facts.legs.map((l) => [l.id, l.value]));
    expect(byId.leg1_landed).toBe(2);
    expect(byId.leg2_uptake).toBe(1);
    expect(byId.leg4_capacity).toBeNull(); // absent from measured_legs -> null, not 0
  });

  it('possible is ALWAYS 6, even when the aggregate\'s own possible shrank (a leg was unavailable)', () => {
    // aggregate.js's own possible would be 4 here (2 measured legs x 2) -- the chairman-facing
    // fact must stay framed against the FIXED standing goal, not that shrunken number.
    const report = { drive_score: scoreFixture([{ leg: 'leg1_landed', value: 2 }, { leg: 'leg2_uptake', value: 1 }], { possible: 4 }) };
    const facts = driveBreakdownFactsFromReport(report);
    expect(facts.possible).toBe(6);
  });

  it('returns null when the row score is unreadable (old-shape / corrupt / missing)', () => {
    expect(driveBreakdownFactsFromReport(null)).toBeNull();
    expect(driveBreakdownFactsFromReport({})).toBeNull();
    expect(driveBreakdownFactsFromReport({ drive_score: {} })).toBeNull();
    expect(driveBreakdownFactsFromReport({ drive_score: { score: { value: -1 }, possible: 6 } })).toBeNull();
  });

  it('returns null when NOTHING is measured — an old-shape row (bare-string measured_legs) or a genuinely empty run', () => {
    // Old-shape rows carry measured_legs as bare strings (pre this SD); `.leg` on a string is
    // undefined, so nothing matches any ratified id and every leg ends up null.
    const oldShape = { drive_score: { score: { value: 0 }, possible: 0, measured_legs: ['leg1_landed'], unavailable_legs: [] } };
    expect(driveBreakdownFactsFromReport(oldShape)).toBeNull();

    const nothingMeasured = { drive_score: { score: { value: 0 }, possible: 0, measured_legs: [], unavailable_legs: RATIFIED_LEG_IDS.map((leg) => ({ leg, reason: 'x' })) } };
    expect(driveBreakdownFactsFromReport(nothingMeasured)).toBeNull();
  });

  it('a MEASURED zero is a real 0 leg, not treated as unavailable', () => {
    const report = { drive_score: scoreFixture([{ leg: 'leg1_landed', value: 0 }, { leg: 'leg2_uptake', value: 1 }]) };
    const facts = driveBreakdownFactsFromReport(report);
    const byId = Object.fromEntries(facts.legs.map((l) => [l.id, l.value]));
    expect(byId.leg1_landed).toBe(0);
  });
});

describe('selectTopLeverLeg', () => {
  it('picks the leg with the largest remaining gap among MEASURED legs', () => {
    const legs = [{ id: 'leg1_landed', value: 2 }, { id: 'leg2_uptake', value: 0 }, { id: 'leg4_capacity', value: 1 }];
    expect(selectTopLeverLeg(legs)).toBe('leg2_uptake'); // gap 2, largest
  });

  it('an UNAVAILABLE leg wins over every measured leg, regardless of numeric gaps', () => {
    const legs = [{ id: 'leg1_landed', value: 2 }, { id: 'leg2_uptake', value: null }, { id: 'leg4_capacity', value: 2 }];
    expect(selectTopLeverLeg(legs)).toBe('leg2_uptake');
  });

  it('multiple unavailable legs resolve deterministically to the first in ratified id order', () => {
    const legs = [{ id: 'leg1_landed', value: null }, { id: 'leg2_uptake', value: null }, { id: 'leg4_capacity', value: 2 }];
    expect(selectTopLeverLeg(legs)).toBe('leg1_landed');
  });

  it('ties among measured legs resolve to the first in list order', () => {
    const legs = [{ id: 'leg1_landed', value: 1 }, { id: 'leg2_uptake', value: 1 }, { id: 'leg4_capacity', value: 2 }];
    expect(selectTopLeverLeg(legs)).toBe('leg1_landed');
  });

  it('empty/invalid input returns null rather than throwing', () => {
    expect(selectTopLeverLeg([])).toBeNull();
    expect(selectTopLeverLeg(null)).toBeNull();
  });
});

// ── composeDriveLine: the shared query ──────────────────────────────────────────────────────

/** Minimal chainable fake, matching the convention already used by chairman-morning-review-sweep.test.js. */
function makeDriveSupabase(rows = null, { error = null, throwOnQuery = false } = {}) {
  const calls = [];
  function from(table) {
    const q = { table, ops: [] };
    const rec = (m, args) => { q.ops.push({ m, args }); return api; };
    const api = {
      select: (...a) => rec('select', a),
      order: (...a) => rec('order', a),
      limit: (...a) => rec('limit', a),
      then: (resolve, reject) => {
        calls.push(q);
        if (throwOnQuery) return Promise.reject(new Error('connection reset')).then(resolve, reject);
        return Promise.resolve({ data: rows, error }).then(resolve, reject);
      },
    };
    return api;
  }
  return { from, _calls: calls };
}

describe('composeDriveLine — the ONE query both chairman surfaces share', () => {
  const ROW = {
    run_id: 'drive-2026-08-15', generated_at: '2026-08-15T10:00:00Z',
    drive_score: scoreFixture([{ leg: 'leg1_landed', value: 2 }, { leg: 'leg2_uptake', value: 1 }, { leg: 'leg4_capacity', value: 1 }]),
  };

  it('queries drive_reports ordered by generated_at DESC, limited to TRAILING_WINDOW (FR-8, widened by FR-4)', async () => {
    const sb = makeDriveSupabase([ROW]);
    await composeDriveLine({ supabase: sb });
    expect(sb._calls).toHaveLength(1); // still ONE query — FR-4 widened it rather than adding a second
    const call = sb._calls[0];
    expect(call.table).toBe('drive_reports');
    expect(call.ops.some((o) => o.m === 'order' && o.args[0] === 'generated_at' && o.args[1]?.ascending === false)).toBe(true);
    expect(call.ops.some((o) => o.m === 'limit' && o.args[0] === TRAILING_WINDOW)).toBe(true);
  });

  it('returns the rendered line plus runId/generatedAt for traceability, plus the FR-4 distinct/N clause', async () => {
    const sb = makeDriveSupabase([ROW]);
    const result = await composeDriveLine({ supabase: sb });
    expect(result.runId).toBe('drive-2026-08-15');
    expect(result.generatedAt).toBe('2026-08-15T10:00:00Z');
    expect(result.line).toMatch(/^4\/6 = leg1_landed 2 \+ leg2_uptake 1 \+ leg4_capacity 1; top lever: \w+ \(as of 2026-08-15\) \| distinct\/1 = 1 \(target >= 3\)$/);
  });

  it('fail-soft: no supabase client -> null, never throws', async () => {
    await expect(composeDriveLine({})).resolves.toBeNull();
    await expect(composeDriveLine(null)).resolves.toBeNull();
  });

  it('fail-soft: a query error -> null', async () => {
    const sb = makeDriveSupabase(null, { error: { message: 'relation does not exist' } });
    await expect(composeDriveLine({ supabase: sb })).resolves.toBeNull();
  });

  it('fail-soft: a thrown exception -> null', async () => {
    const sb = makeDriveSupabase(null, { throwOnQuery: true });
    await expect(composeDriveLine({ supabase: sb })).resolves.toBeNull();
  });

  it('fail-soft: no row yet -> null', async () => {
    const sb = makeDriveSupabase([]);
    await expect(composeDriveLine({ supabase: sb })).resolves.toBeNull();
  });

  it('fail-soft: a row with an unreadable score -> null', async () => {
    const sb = makeDriveSupabase([{ run_id: 'r1', generated_at: '2026-08-15T00:00:00Z', drive_score: {} }]);
    await expect(composeDriveLine({ supabase: sb })).resolves.toBeNull();
  });

  // TS-7/TS-8/TS-11 (PRD SD-LEO-FIX-DRIVE-SCORE-GRADIENT-001, FR-4)
  const rowAt = (score, generatedAt) => ({
    run_id: `r-${generatedAt}`,
    generated_at: generatedAt,
    drive_score: scoreFixture([{ leg: 'leg1_landed', value: score }]),
  });

  it('[TS-7] "flat" is present when the newest 6 trailing readings are identical', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => rowAt(3.5, `2026-09-0${i + 1}T00:00:00Z`)).reverse();
    const sb = makeDriveSupabase(rows);
    const result = await composeDriveLine({ supabase: sb });
    expect(result.line).toMatch(/flat/);
    expect(result.line).toMatch(/distinct\/6 = 1 \(target >= 3\)/);
  });

  it('[TS-8] "flat" is absent when at least one of the newest 6 differs; the distinct/N clause is still present', async () => {
    const rows = [
      rowAt(3.9, '2026-09-06T00:00:00Z'), // newest, differs
      ...Array.from({ length: 5 }, (_, i) => rowAt(3.5, `2026-09-0${i + 1}T00:00:00Z`)),
    ];
    const sb = makeDriveSupabase(rows);
    const result = await composeDriveLine({ supabase: sb });
    expect(result.line).not.toMatch(/flat/);
    expect(result.line).toMatch(/distinct\/6 = 2 \(target >= 3\)/);
  });

  it('[TS-11] fewer than 10 (and fewer than 6) rows exist: never throws, denominator is the ACTUAL count, "flat" never asserted', async () => {
    const rows = [rowAt(3.5, '2026-09-05T00:00:00Z'), rowAt(3.5, '2026-09-04T00:00:00Z')];
    const sb = makeDriveSupabase(rows);
    const result = await composeDriveLine({ supabase: sb });
    expect(result).not.toBeNull();
    expect(result.line).not.toMatch(/flat/); // only 2 available, fewer than the 6-reading flat window
    expect(result.line).toMatch(/distinct\/2 = 1 \(target >= 3\)/); // 2, never a false 10
  });
});

describe('driveFlatnessClause — PURE helper (FR-4)', () => {
  it('reports the actual count as the denominator, never a hardcoded 10', () => {
    expect(driveFlatnessClause([3.5, 3.5])).toBe('distinct/2 = 1 (target >= 3)');
    expect(driveFlatnessClause([])).toBe('distinct/0 = 0 (target >= 3)');
  });

  it('flags flat only when at least 6 readings exist AND the newest 6 are all identical', () => {
    expect(driveFlatnessClause([3.5, 3.5, 3.5, 3.5, 3.5, 3.5])).toMatch(/flat/);
    expect(driveFlatnessClause([3.5, 3.5, 3.5, 3.5, 3.5])).not.toMatch(/flat/); // only 5, below the window
    expect(driveFlatnessClause([3.9, 3.5, 3.5, 3.5, 3.5, 3.5])).not.toMatch(/flat/); // 6 available, one differs
  });

  it('a longer trailing history is scoped to the newest 6 for flatness, but the full history for distinct/N', () => {
    // 10 readings: newest 6 identical, but two older ones differ -- distinct/10 must still be 2,
    // while flat is still true because it looks ONLY at the newest 6.
    const trailing = [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.9, 3.5, 3.5, 3.5];
    const clause = driveFlatnessClause(trailing);
    expect(clause).toMatch(/flat/);
    expect(clause).toMatch(/distinct\/10 = 2 \(target >= 3\)/);
  });

  it('never throws or produces NaN on non-numeric/missing entries', () => {
    expect(driveFlatnessClause([null, undefined, NaN, -1, 3.5])).toBe('distinct/1 = 1 (target >= 3)');
    expect(driveFlatnessClause(null)).toBe('distinct/0 = 0 (target >= 3)');
    expect(driveFlatnessClause(undefined)).toBe('distinct/0 = 0 (target >= 3)');
  });
});

// ── FR-8: cross-surface consistency — both consumers share THIS module, not two copies ────────
describe('[WIRING / FR-8] morning-brief and exec-summary both call THIS shared module', () => {
  const read = (p) => fs.readFileSync(p, 'utf8');
  const MORNING_SWEEP = path.join(repoRoot, 'scripts', 'cron', 'chairman-morning-review-sweep.mjs');
  const EXEC_SUMMARY = path.join(repoRoot, 'scripts', 'adam-exec-summary.mjs');

  it('chairman-morning-review-sweep.mjs imports composeDriveLine from exec-email-drive-line.mjs', () => {
    expect(read(MORNING_SWEEP)).toMatch(/import\s*\{[^}]*composeDriveLine[^}]*\}\s*from\s*['"].*exec-email-drive-line\.mjs['"]/);
  });

  it('adam-exec-summary.mjs imports composeDriveLine from exec-email-drive-line.mjs', () => {
    expect(read(EXEC_SUMMARY)).toMatch(/import\s*\{[^}]*composeDriveLine[^}]*\}\s*from\s*['"].*exec-email-drive-line\.mjs['"]/);
  });

  it('neither consumer re-implements its own drive_reports query — the module owns the ONLY order/limit call site for this table', () => {
    // A second, independent `.from('drive_reports')` in either file would mean the two surfaces
    // COULD diverge even while both also call composeDriveLine -- the wiring assertions above
    // alone would not catch that. Grep is a source-truth check, not a claim about behavior; a
    // relative call `.order(...).limit(1)` next to a `drive_reports` literal in the SAME file is
    // exactly the shape a re-implementation would take.
    for (const file of [MORNING_SWEEP, EXEC_SUMMARY]) {
      const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, `${file} must not name drive_reports directly outside the shared module`).not.toMatch(/from\(['"]drive_reports['"]\)/);
    }
  });
});
