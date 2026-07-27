/**
 * SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-2d)
 *
 * THE DEFECT THIS PINS. lib/fleet/session-liveness.cjs is the read-time liveness SSOT and its
 * ladder is:  is_alive OR fresh_heartbeat OR hasPidAlive OR hasTickAlive OR hasExpectedSilence.
 * Two of those five rungs read columns v_active_sessions never selected — process_alive_at
 * (hasTickAlive) and expected_silence_until (hasExpectedSilence). On a view row those fields are
 * simply `undefined`, so both rungs return false WITHOUT EVER EVALUATING THEIR THRESHOLD. The rung
 * did not fail; it was never asked. Every view-backed consumer therefore ran a silently DEGRADED
 * ladder — and until this SD's C2 child landed, hasPidAlive resolved 0 of 12 rows, leaving
 * `is_alive OR fresh_heartbeat`, i.e. only the forgeable legs, as the entire ladder.
 *
 * WHY THE OBVIOUS TEST IS WORTHLESS. "Assert the view verdict equals the table verdict" passes
 * VACUOUSLY: nearly every live row has is_alive===true, which short-circuits at rung 1, so both
 * sides agree no matter how many columns the view hides. A check that compares a value to itself
 * cannot fail. So this file leads with a NEGATIVE CONTROL that proves the four columns are
 * load-bearing — the same row, with and without them, must reach OPPOSITE verdicts — and only then
 * asserts parity against the live view.
 *
 * Structure:
 *   1. NEGATIVE CONTROL (hermetic) — strip the columns, prove the verdict FLIPS alive -> dead.
 *      If this ever stops flipping, the parity assertion below has gone vacuous and must be fixed,
 *      not deleted.
 *   2. MIGRATION TEXT (hermetic) — the DDL actually selects all four through the _cs outer join.
 *   3. LIVE PARITY (skipIf no DB) — field-level equality for all four columns AND verdict equality,
 *      over the whole population, STATING THE ROW COUNT. Zero rows examined is a FAIL, not a pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const { isSessionAlive } = require('../../../lib/fleet/session-liveness.cjs');

// The exact columns FR-2d adds. Named once so every assertion below tests the same set.
const LADDER_COLUMNS = ['process_alive_at', 'updated_at', 'expected_silence_until', 'pid_validated_at'];

const MIGRATION = path.join(
  REPO_ROOT,
  'database/migrations/20260727_v_active_sessions_expose_tick_and_silence.sql'
);

const HAS_REAL_DB = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe('FR-2d negative control — the four columns are load-bearing', () => {
  // A session that is alive ONLY via the tick rung: raw flag false, heartbeat long stale, no
  // terminal_id/session_id so the PID rung abstains. process_alive_at is the sole thing keeping
  // it alive. This is precisely the row shape the hidden columns misclassify.
  const nowMs = Date.parse('2026-07-27T12:00:00.000Z');
  const tickOnlyRow = {
    session_id: null,
    terminal_id: null,
    is_alive: false,
    heartbeat_at: new Date(nowMs - 60 * 60 * 1000).toISOString(), // 1h stale
    process_alive_at: new Date(nowMs - 10 * 1000).toISOString(),  // 10s fresh
    expected_silence_until: null,
  };

  it('a tick-fresh row reads ALIVE when the tick column is present', () => {
    const v = isSessionAlive(tickOnlyRow, { nowMs });
    expect(v).toEqual({ alive: true, reason: 'process_tick' });
  });

  it('THE CONTROL: the SAME row reads DEAD once process_alive_at is hidden', () => {
    const { process_alive_at, ...viewShapedRow } = tickOnlyRow;
    const v = isSessionAlive(viewShapedRow, { nowMs });
    // Not "a different reason" — a flat-out opposite verdict. This is the degradation the
    // pre-FR-2d view inflicted on every consumer that read through it.
    expect(v.alive).toBe(false);
  });

  it('THE CONTROL, silence rung: an armed-silence row also flips when the column is hidden', () => {
    const parkedRow = {
      session_id: null,
      terminal_id: null,
      is_alive: false,
      heartbeat_at: new Date(nowMs - 60 * 60 * 1000).toISOString(),
      process_alive_at: null,
      expected_silence_until: new Date(nowMs + 10 * 60 * 1000).toISOString(), // parked 10min out
    };
    expect(isSessionAlive(parkedRow, { nowMs })).toEqual({ alive: true, reason: 'armed_silence' });

    const { expected_silence_until, ...viewShapedRow } = parkedRow;
    expect(isSessionAlive(viewShapedRow, { nowMs }).alive).toBe(false);
    // A parked /loop worker read as dead is the exact false-DEAD failure claim-release-guard
    // converts straight into a claim release. Hiding the column caused it.
  });
});

describe('FR-2d migration exposes every ladder input', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');

  it.each(LADDER_COLUMNS)('selects _cs.%s through the outer join', (col) => {
    expect(sql).toMatch(new RegExp(`_cs\\.${col}\\b`));
  });

  it('preserves the pre-existing passthrough columns (strictly additive, no drop)', () => {
    for (const col of ['loop_state', 'is_alive', 'has_uncommitted_changes']) {
      expect(sql).toMatch(new RegExp(`_cs\\.${col}\\b`));
    }
  });
});

describe.skipIf(!HAS_REAL_DB)('FR-2d live parity — view row vs table row', () => {
  it('every ladder column is present and equal, and the verdicts match', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: viewRows, error: vErr } = await db
      .from('v_active_sessions')
      .select('*');
    expect(vErr, `v_active_sessions read failed: ${vErr?.message}`).toBeNull();

    // STATE THE ROW COUNT. An empty population is a FAIL, not an empty pass — a parity test that
    // examined nothing is indistinguishable from one that passed, and this SD exists because five
    // prior builds shipped exactly that.
    const examined = viewRows?.length ?? 0;
    // eslint-disable-next-line no-console
    console.log(`[FR-2d] live parity examined ${examined} v_active_sessions row(s)`);
    expect(examined, 'zero rows examined — the parity check proved nothing').toBeGreaterThan(0);

    // Mirror the view's own WHERE clause rather than passing every id through .in() — a
    // session-id list long enough to cover the fleet overruns PostgREST's URL limit and comes
    // back as a bare "Bad Request", which would look like a parity failure but is a query bug.
    const { data: tableRows, error: tErr } = await db
      .from('claude_sessions')
      .select('*')
      .neq('status', 'released');
    expect(tErr, `claude_sessions read failed: ${tErr?.message}`).toBeNull();

    const byId = new Map(tableRows.map((r) => [r.session_id, r]));
    const nowMs = Date.now();
    const columnMismatches = [];
    const verdictMismatches = [];

    for (const viewRow of viewRows) {
      // The columns must EXIST on the view row, not merely happen to be null.
      for (const col of LADDER_COLUMNS) {
        if (!(col in viewRow)) columnMismatches.push(`${viewRow.session_id}: view row missing ${col}`);
      }
      const tableRow = byId.get(viewRow.session_id);
      if (!tableRow) continue;
      for (const col of LADDER_COLUMNS) {
        if (viewRow[col] !== tableRow[col]) {
          columnMismatches.push(`${viewRow.session_id}.${col}: view=${viewRow[col]} table=${tableRow[col]}`);
        }
      }
      // Pin aliveCcPids to an empty set on BOTH sides so the PID rung is deterministic and the
      // comparison isolates the columns this FR added rather than racing the live process table.
      const opts = { nowMs, aliveCcPids: new Set() };
      const vv = isSessionAlive(viewRow, opts);
      const tv = isSessionAlive(tableRow, opts);
      if (vv.alive !== tv.alive || vv.reason !== tv.reason) {
        verdictMismatches.push(
          `${viewRow.session_id}: view=${vv.alive}/${vv.reason} table=${tv.alive}/${tv.reason}`
        );
      }
    }

    expect(columnMismatches, columnMismatches.join('\n')).toEqual([]);
    expect(verdictMismatches, verdictMismatches.join('\n')).toEqual([]);
  });
});
