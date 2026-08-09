/**
 * SD-LEO-INFRA-DRIVE-STATE-OBSERVABILITY-001 — the store, the duration query, and the drift guard.
 *
 * ROUTED TO THE UNIT TIER DELIBERATELY. A file matching DB_INCLUDE (tests/integration/** or
 * *.db.test.js) that is reachable only by the default config is a member of ZERO PROJECTS here:
 * vitest.config.js:288 excludes those paths from `unit` UNCONDITIONALLY while :172 admits them to
 * `db` only when the gate is open, and the gate is closed (tests/helpers/db-target.js:25
 * DESIGNATED_NON_PROD_REFS is a frozen empty array). Such a file REPORTS GREEN WHILE NEVER RUNNING.
 * So these live in tests/unit/ and exercise a filter-applying fake, and the table's SHAPE is proven
 * separately in the DDL tier against a real postgres.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const { persistDriveState, currentStallSpans, TABLE } = require_('../../../scripts/lib/drive-state-verdict-store.cjs');
const { AXES, STATE, ACTION } = require_('../../../lib/governance/drive-state/contract.cjs');

/** A table-aware capture fake: it records what was inserted and which table it was aimed at, so a
 *  wrong-table write is catchable rather than silently green. */
function captureClient({ failWith = null } = {}) {
  const calls = { table: null, rows: null, selected: false };
  return {
    calls,
    from(table) {
      calls.table = table;
      return {
        insert(rows) {
          calls.rows = rows;
          return {
            select() {
              calls.selected = true;
              return Promise.resolve(failWith ? { data: null, error: failWith } : { data: rows.map((r, i) => ({ id: i + 1, axis: r.axis, state: r.state })), error: null });
            },
          };
        },
      };
    },
  };
}

/** A reading fake that APPLIES order and limit, so an inverted sort is caught rather than assumed. */
function readClient(rows) {
  return {
    from() {
      return {
        select() {
          const state = { rows: [...rows] };
          const api = {
            order(col, { ascending }) {
              state.rows.sort((a, b) => (ascending ? 1 : -1) * String(a[col]).localeCompare(String(b[col])));
              return api;
            },
            limit(n) { state.rows = state.rows.slice(0, n); return Promise.resolve({ data: state.rows, error: null }); },
          };
          return api;
        },
      };
    },
  };
}

const entry = (axis, state, over = {}) => ({
  axis,
  state,
  citation: `${axis} checked`,
  action_taken: ACTION.NONE,
  ...(state === STATE.UNMEASURABLE ? { reason: 'no_cohort' } : {}),
  ...over,
});
const fullVerdict = (stateFor = () => STATE.CLEAR) => AXES.map((a) => entry(a, stateFor(a)));

describe('[CONTROL, asserted first] a well-formed verdict is written as six rows', () => {
  it('writes exactly six rows to drive_state_verdicts, one per axis', async () => {
    // Leads deliberately: a store stuck at "throw" would satisfy every rejection test below while
    // being useless, so the accept path is the control and it goes first.
    const c = captureClient();
    const res = await persistDriveState({ supabase: c, runId: 'run-1', entries: fullVerdict() });
    expect(res.written).toBe(6);
    expect(c.calls.table).toBe(TABLE);
    expect(c.calls.rows.map((r) => r.axis).sort()).toEqual([...AXES].sort());
    expect(c.calls.rows.every((r) => r.run_id === 'run-1')).toBe(true);
  });

  it('[TS-1 amended] carries citation and action_taken per row, and NEVER sends recorded_at', async () => {
    const c = captureClient();
    await persistDriveState({ supabase: c, runId: 'run-1', entries: fullVerdict() });
    expect(c.calls.rows.every((r) => typeof r.citation === 'string' && r.citation.length > 0)).toBe(true);
    expect(c.calls.rows.every((r) => r.action_taken === ACTION.NONE)).toBe(true);
    // The DB clock is the single authority for the one column a duration depends on.
    expect(c.calls.rows.every((r) => !('recorded_at' in r))).toBe(true);
  });
});

describe('[TS-2 amended — two-sided] all three states round-trip distinctly', () => {
  it('CLEAR stays CLEAR, STALLED stays STALLED, UNMEASURABLE stays UNMEASURABLE with its reason', async () => {
    // The original was one-sided: a store writing UNMEASURABLE for EVERY axis would have passed it.
    // All three states appear in ONE verdict, so a constant-writing store cannot survive.
    const mixed = [
      entry(AXES[0], STATE.CLEAR),
      entry(AXES[1], STATE.STALLED),
      entry(AXES[2], STATE.UNMEASURABLE, { reason: 'unmeasurable_until_linkage' }),
      entry(AXES[3], STATE.CLEAR),
      entry(AXES[4], STATE.STALLED),
      entry(AXES[5], STATE.CLEAR),
    ];
    const c = captureClient();
    await persistDriveState({ supabase: c, runId: 'run-1', entries: mixed });
    const byAxis = Object.fromEntries(c.calls.rows.map((r) => [r.axis, r]));
    expect(byAxis[AXES[0]].state).toBe('CLEAR');
    expect(byAxis[AXES[1]].state).toBe('STALLED');
    expect(byAxis[AXES[2]].state).toBe('UNMEASURABLE');
    expect(byAxis[AXES[2]].reason).toBe('unmeasurable_until_linkage');
    // No field collapses the three states into a pass/fail.
    expect(Object.values(byAxis).some((r) => typeof r.state === 'boolean' || typeof r.state === 'number')).toBe(false);
  });

  it('refuses an UNMEASURABLE axis with no reason', async () => {
    const bad = fullVerdict().map((e, i) => (i === 0 ? { ...e, state: STATE.UNMEASURABLE, reason: '  ' } : e));
    await expect(persistDriveState({ supabase: captureClient(), runId: 'r', entries: bad })).rejects.toThrow(/UNMEASURABLE with no reason/);
  });
});

describe('[TS-3 amended] a write failure THROWS rather than being swallowed', () => {
  it('propagates the error so the caller can print a visible banner', async () => {
    const c = captureClient({ failWith: { code: '23505', message: 'duplicate key' } });
    await expect(persistDriveState({ supabase: c, runId: 'r', entries: fullVerdict() })).rejects.toThrow(/durable write failed/);
  });
});

describe('the store refuses a verdict that would become a durable half-truth', () => {
  it('refuses a SHORT verdict — five rows renders identically to six on anything that does not count', async () => {
    const short = fullVerdict().slice(0, 5);
    await expect(persistDriveState({ supabase: captureClient(), runId: 'r', entries: short })).rejects.toThrow(/expected 6 axis entries, got 5/);
  });
  it('refuses an unrecognised axis', async () => {
    const bad = [...fullVerdict().slice(0, 5), entry('not_an_axis', STATE.CLEAR)];
    await expect(persistDriveState({ supabase: captureClient(), runId: 'r', entries: bad })).rejects.toThrow(/unrecognised axis/);
  });
  it('refuses an empty runId — rows without it cannot be reassembled into a history', async () => {
    await expect(persistDriveState({ supabase: captureClient(), runId: '  ', entries: fullVerdict() })).rejects.toThrow(/runId must be a non-empty string/);
  });
});

describe('[TS-5 / TS-7] the duration query, and contiguity', () => {
  const R = (axis, state, t) => ({ axis, state, recorded_at: t, run_id: t });

  it('[THE POINT] an axis STALLED in two consecutive runs reports a span with its first-seen time', async () => {
    const c = readClient([R('fleet_health', STATE.STALLED, '2026-08-08T10:00:00Z'), R('fleet_health', STATE.STALLED, '2026-08-08T11:00:00Z')]);
    const spans = await currentStallSpans({ supabase: c });
    expect(spans).toHaveLength(1);
    expect(spans[0].axis).toBe('fleet_health');
    expect(spans[0].since).toBe('2026-08-08T10:00:00Z');
    expect(spans[0].runs).toBe(2);
  });

  it('[THE OTHER SIDE] an axis STALLED in only one run, then CLEAR, returns NOTHING', async () => {
    const c = readClient([R('fleet_health', STATE.STALLED, '2026-08-08T10:00:00Z'), R('fleet_health', STATE.CLEAR, '2026-08-08T11:00:00Z')]);
    expect(await currentStallSpans({ supabase: c })).toEqual([]);
  });

  it('[TS-7 CONTIGUITY] STALLED / CLEAR / STALLED is TWO short stalls, never one long one', async () => {
    // A naive count of STALLED rows would report a span reaching back across the RECOVERY —
    // a silently wrong duration, which is the exact class this SD exists to stop producing.
    const c = readClient([
      R('roadmap_motion', STATE.STALLED, '2026-08-08T09:00:00Z'),
      R('roadmap_motion', STATE.CLEAR, '2026-08-08T10:00:00Z'),
      R('roadmap_motion', STATE.STALLED, '2026-08-08T11:00:00Z'),
    ]);
    const spans = await currentStallSpans({ supabase: c });
    expect(spans).toHaveLength(1);
    expect(spans[0].runs).toBe(1);
    // The span starts at the SECOND stall, not the first.
    expect(spans[0].since).toBe('2026-08-08T11:00:00Z');
  });

  it('an UNMEASURABLE reading breaks the span too — it is not a STALLED reading', async () => {
    const c = readClient([
      R('learning_conversion', STATE.STALLED, '2026-08-08T09:00:00Z'),
      R('learning_conversion', STATE.UNMEASURABLE, '2026-08-08T10:00:00Z'),
      R('learning_conversion', STATE.STALLED, '2026-08-08T11:00:00Z'),
    ]);
    expect((await currentStallSpans({ supabase: c }))[0].runs).toBe(1);
  });
});

describe('[TS-4 / FR-4] vocabulary drift between the schema CHECK and contract.cjs AXES', () => {
  const MIGRATION = path.resolve(__dirname, '../../../database/migrations/20260808_drive_state_verdicts.sql');

  /** Parse the axis CHECK out of the real migration text. Returns null when absent. */
  function parseAxisCheck(sql) {
    const m = /axis\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*axis\s+IN\s*\(([^)]*)\)/i.exec(sql);
    if (!m) return null;
    return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }

  it('[PARSER CONTROL — without this every assertion below is vacuously true] the parser finds the real constraint AND returns null when there is none', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    expect(parseAxisCheck(sql)).not.toBeNull();
    // A silently-null parser would make set-equality trivially pass on both sides.
    expect(parseAxisCheck('CREATE TABLE x (axis TEXT NOT NULL);')).toBeNull();
  });

  it('the schema vocabulary EQUALS contract.cjs AXES', () => {
    const parsed = parseAxisCheck(fs.readFileSync(MIGRATION, 'utf8'));
    expect([...parsed].sort()).toEqual([...AXES].sort());
  });

  it('[BOTH DIRECTIONS, by mutating the REAL parsed pair] an extra schema axis fails, and a missing one fails', () => {
    // Mutating the real pair, not comparing two synthetic lists — a synthetic comparison tests the
    // comparator, not schema-vs-contract.
    const parsed = parseAxisCheck(fs.readFileSync(MIGRATION, 'utf8'));
    expect([...parsed, 'rogue_axis'].sort()).not.toEqual([...AXES].sort());
    expect([...parsed].slice(0, -1).sort()).not.toEqual([...AXES].sort());
  });

  /**
   * The DDL only — comments STRIPPED.
   *
   * This exists because the first version of the assertion below scanned raw file text and FAILED
   * on its own documentation: the migration header explains why the codebase_health_snapshots
   * idiom was REJECTED (quoting its `score NUMERIC NOT NULL`), and the COMMENT ON says the table
   * has "no boolean or numeric health column". Both are prose ABOUT the absence, and a raw scan
   * read them as the presence. A scanner is a filter over a shape you assumed — assume the DDL,
   * and strip everything that is not DDL first.
   */
  function ddlOnly(sql) {
    return sql
      .replace(/--[^\n]*/g, '')                    // line comments
      .replace(/COMMENT\s+ON[\s\S]*?;/gi, '');     // COMMENT ON ... ; statements
  }

  it('[CONTROL for the stripper] comment text is removed, and the real column definitions survive', () => {
    const stripped = ddlOnly(fs.readFileSync(MIGRATION, 'utf8'));
    // If the stripper ate everything, every assertion below would pass vacuously.
    expect(/CREATE TABLE/i.test(stripped)).toBe(true);
    expect(/run_id\s+TEXT NOT NULL/i.test(stripped)).toBe(true);
    expect(stripped.includes('codebase_health_snapshots')).toBe(false); // prose gone
  });

  it('the migration declares UNIQUE (run_id, axis) and no boolean/numeric health column', () => {
    const ddl = ddlOnly(fs.readFileSync(MIGRATION, 'utf8'));
    expect(/UNIQUE\s*\(\s*run_id\s*,\s*axis\s*\)/i.test(ddl)).toBe(true);
    // Scoped to NON-KEY columns: a bare numeric scan false-positives on `id BIGSERIAL`.
    const body = ddl.slice(ddl.indexOf('run_id'));
    expect(/\b(score|health|value)\s+(numeric|integer|real|double)/i.test(body)).toBe(false);
    expect(/\bBOOLEAN\b/i.test(body)).toBe(false);
  });

  it('[POSITIVE CONTROL] the same assertion DOES fire on a table that has those columns', () => {
    // Proves the check can fail, rather than being a regex that never matches anything.
    const bad = ddlOnly('CREATE TABLE t (\n  run_id TEXT NOT NULL,\n  score NUMERIC NOT NULL,\n  ok BOOLEAN\n);');
    const body = bad.slice(bad.indexOf('run_id'));
    expect(/\b(score|health|value)\s+(numeric|integer|real|double)/i.test(body)).toBe(true);
    expect(/\bBOOLEAN\b/i.test(body)).toBe(true);
  });
});

describe('[TS-8] the single-writer decision is enforced, not just documented', () => {
  it('adam-pm-board does NOT persist — a second writer would double-count one instant', () => {
    const board = fs.readFileSync(path.resolve(__dirname, '../../../scripts/adam-pm-board.mjs'), 'utf8');
    expect(board.includes('drive-state-verdict-store')).toBe(false);
    expect(/persistDriveState/.test(board)).toBe(false);
  });

  it('coordinator-hourly-review DOES persist, and reads the verdict field that actually exists', () => {
    const review = fs.readFileSync(path.resolve(__dirname, '../../../scripts/coordinator-hourly-review.cjs'), 'utf8');
    expect(review.includes('drive-state-verdict-store')).toBe(true);
    // verdict.axes is the real field (index.cjs:70). Guarding on verdict.entries would make the
    // whole persist a silent no-op that looks fine — this pins the field name.
    expect(/Array\.isArray\(verdict\.axes\)/.test(review)).toBe(true);
  });
});
