/**
 * SD-LEO-INFRA-PARKED-WORKER-CLAIM-LAPSE-001 FR-4/FR-7 (TS-4, TS-5).
 *
 * The dispatch-availability seam. Before this SD it was an inline query inside main() that
 * selected SDs on `claiming_session_id IS NULL` with NO session cross-check and NO liveness
 * check, and there was NO test file for this hook at all. That combination is what allowed an
 * SD to be advertised for auto-claim while a live worker was mid-build on it: a transient clear
 * of claiming_session_id (see the sweep root cause, commit 103260605b3) made a busy SD look free.
 *
 * These tests run against the REAL exported predicate. That is the whole point of extracting it —
 * asserting the old inline query would have required mocking the very thing under test, which is
 * the test-masking mode this repo has been bitten by before.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { selectAvailableSds, SESSION_LIVENESS_WINDOW_MS } = require(
  resolve(__dirname, '../../..', 'scripts/hooks/coordination-inbox.cjs')
);

const NOW = Date.parse('2026-07-25T18:00:00.000Z');
const fresh = new Date(NOW - 60_000).toISOString();          // 1 min ago — clearly live
const stale = new Date(NOW - 60 * 60 * 1000).toISOString();  // 1 hour ago — clearly gone

describe('FR-4/TS-4: an SD with a live builder is never advertised', () => {
  it('excludes an SD whose sd_key is held by a live session, even though its claim is NULL', () => {
    const out = selectAvailableSds(
      [{ sd_key: 'SD-BUSY' }, { sd_key: 'SD-FREE' }],
      [{ sd_key: 'SD-BUSY', heartbeat_at: fresh }],
      { nowMs: NOW }
    );
    expect(out.map((s) => s.sd_key)).toEqual(['SD-FREE']);
  });

  it('still offers an SD whose holder is long gone (no claim leak into dispatch starvation)', () => {
    const out = selectAvailableSds(
      [{ sd_key: 'SD-ABANDONED' }],
      [{ sd_key: 'SD-ABANDONED', heartbeat_at: stale }],
      { nowMs: NOW }
    );
    expect(out.map((s) => s.sd_key)).toEqual(['SD-ABANDONED']);
  });

  it('a parked worker is held by its ARMED SILENCE, not by a long heartbeat window', () => {
    // This test previously pinned a heartbeat of (SESSION_LIVENESS_WINDOW_MS - 1s), i.e. ~15min,
    // back when this predicate re-derived liveness locally with its own 900s window. Liveness is
    // now delegated to the lib/fleet/session-liveness.cjs SSOT, whose heartbeat threshold is 300s
    // — so a 15-minute-old heartbeat is correctly NOT a liveness signal on its own. That is not a
    // regression: a parked worker is protected by the signal it actually emits (an armed
    // expected_silence_until), plus the PID/tick/raw signals below, rather than by stretching the
    // heartbeat window to cover a worker that has deliberately stopped heartbeating.
    const staleBeat = new Date(NOW - (SESSION_LIVENESS_WINDOW_MS - 1000)).toISOString();
    const armed = new Date(NOW + 5 * 60 * 1000).toISOString();
    const out = selectAvailableSds(
      [{ sd_key: 'SD-PARKED' }],
      [{ sd_key: 'SD-PARKED', heartbeat_at: staleBeat, expected_silence_until: armed }],
      { nowMs: NOW }
    );
    expect(out).toEqual([]);
  });
});

describe('FR-4 (3rd pass): liveness comes from the SSOT, so ALL its signals count', () => {
  // DEFECT-7. The hand-rolled predicate covered 2 of the SSOT's 5 signals, leaving a worker that
  // is PID-alive or tick-fresh but heartbeat-stale invisible here — its SD was still advertised,
  // which is the COLLISION direction. Each signal below independently holds the SD.
  it('a raw is_alive session holds its SD even with no heartbeat at all', () => {
    const out = selectAvailableSds(
      [{ sd_key: 'SD-RAW' }],
      [{ sd_key: 'SD-RAW', is_alive: true, heartbeat_at: null }],
      { nowMs: NOW }
    );
    expect(out).toEqual([]);
  });

  it('a tick-fresh session holds its SD despite a stale heartbeat (mid sub-agent call)', () => {
    // A worker inside a long Task()/Agent call emits no heartbeat but keeps stamping process_alive_at.
    const out = selectAvailableSds(
      [{ sd_key: 'SD-TICKING' }],
      [{ sd_key: 'SD-TICKING', heartbeat_at: stale, process_alive_at: new Date(NOW - 30_000).toISOString() }],
      { nowMs: NOW }
    );
    expect(out).toEqual([]);
  });

  it('a PID-alive session holds its SD (injected alive-pid set, host-local signal)', () => {
    const out = selectAvailableSds(
      [{ sd_key: 'SD-PID' }],
      [{ sd_key: 'SD-PID', heartbeat_at: stale, terminal_id: 'win-cc-4001-12345' }],
      { nowMs: NOW, aliveCcPids: new Set(['12345']) }
    );
    expect(out).toEqual([]);
  });

  it('a session with NO live signal at all is still released (no claim leak)', () => {
    const out = selectAvailableSds(
      [{ sd_key: 'SD-GONE' }],
      [{ sd_key: 'SD-GONE', heartbeat_at: stale, is_alive: false, terminal_id: 'win-cc-4001-99999', process_alive_at: stale }],
      { nowMs: NOW, aliveCcPids: new Set(['12345']) }
    );
    expect(out.map((s) => s.sd_key)).toEqual(['SD-GONE']);
  });
});

describe('FR-4 (2nd pass): a PARKED worker is live — heartbeat alone is not enough', () => {
  // The SD is named for a PARKED worker. Such a worker deliberately STOPS heartbeating and arms
  // expected_silence_until to say "alive but silent"; the sweep and claim-validity-gate both
  // honour that field. The first pass of this predicate keyed on heartbeat only, which re-created
  // the same blind spot one layer up: this worker's own loop arms wakeups of up to 1800s, well
  // beyond the 900s heartbeat window, so a parked worker's SD was advertised for auto-claim
  // during the back half of every long nap.
  const armed = (msFromNow) => new Date(NOW + msFromNow).toISOString();

  it('holds the SD of a worker whose heartbeat is stale but whose silence window is armed', () => {
    const out = selectAvailableSds(
      [{ sd_key: 'SD-PARKED' }],
      [{ sd_key: 'SD-PARKED', heartbeat_at: stale, expected_silence_until: armed(5 * 60 * 1000) }],
      { nowMs: NOW }
    );
    expect(out).toEqual([]);
  });

  it('covers the 1800s nap that exceeds the 900s heartbeat window (the actual gap)', () => {
    const napStart = new Date(NOW - 1500 * 1000).toISOString(); // last beat 25 min ago
    const out = selectAvailableSds(
      [{ sd_key: 'SD-LONG-NAP' }],
      [{ sd_key: 'SD-LONG-NAP', heartbeat_at: napStart, expected_silence_until: armed(300 * 1000) }],
      { nowMs: NOW }
    );
    expect(out).toEqual([]);
  });

  it('releases once the silence window has EXPIRED (no claim leak)', () => {
    const out = selectAvailableSds(
      [{ sd_key: 'SD-EXPIRED' }],
      [{ sd_key: 'SD-EXPIRED', heartbeat_at: stale, expected_silence_until: armed(-60 * 1000) }],
      { nowMs: NOW }
    );
    expect(out.map((s) => s.sd_key)).toEqual(['SD-EXPIRED']);
  });

  it('does NOT trust a runaway far-future window beyond the cap (crashed worker cannot hold forever)', () => {
    const out = selectAvailableSds(
      [{ sd_key: 'SD-RUNAWAY' }],
      [{ sd_key: 'SD-RUNAWAY', heartbeat_at: stale, expected_silence_until: armed(24 * 60 * 60 * 1000) }],
      { nowMs: NOW }
    );
    expect(out.map((s) => s.sd_key)).toEqual(['SD-RUNAWAY']);
  });

  it('a fresh heartbeat still holds the SD with no silence window at all', () => {
    const out = selectAvailableSds(
      [{ sd_key: 'SD-BUSY' }],
      [{ sd_key: 'SD-BUSY', heartbeat_at: fresh, expected_silence_until: null }],
      { nowMs: NOW }
    );
    expect(out).toEqual([]);
  });

  it('ignores an unparseable silence timestamp rather than treating it as live', () => {
    const out = selectAvailableSds(
      [{ sd_key: 'SD-JUNK' }],
      [{ sd_key: 'SD-JUNK', heartbeat_at: stale, expected_silence_until: 'not-a-date' }],
      { nowMs: NOW }
    );
    expect(out.map((s) => s.sd_key)).toEqual(['SD-JUNK']);
  });
});

describe('TS-5: the guarantee does not depend on SD phase', () => {
  // The two near-misses were caught by worker-checkin isSdInFlight, which blocks self-claim when
  // current_phase is not LEAD/LEAD_APPROVAL. That backstop is PHASE-based and would NOT have held
  // for an SD still in LEAD. This predicate is phase-agnostic by construction: it keys on whether
  // a live session holds the sd_key, nothing else.
  it('excludes a live-held SD regardless of any phase field on the row', () => {
    const rows = [
      { sd_key: 'SD-LEAD', current_phase: 'LEAD' },
      { sd_key: 'SD-EXEC', current_phase: 'EXEC' },
    ];
    const live = [
      { sd_key: 'SD-LEAD', heartbeat_at: fresh },
      { sd_key: 'SD-EXEC', heartbeat_at: fresh },
    ];
    expect(selectAvailableSds(rows, live, { nowMs: NOW })).toEqual([]);
  });
});

describe('fails closed — emptiness is never treated as proof of absence', () => {
  // The root cause of this whole SD was an unchecked query error read as "no rows". If the
  // session cross-check cannot run, advertising every candidate would reproduce that defect here.
  it('returns nothing when the session list is null (cross-check could not run)', () => {
    expect(selectAvailableSds([{ sd_key: 'SD-A' }], null, { nowMs: NOW })).toEqual([]);
  });

  it('returns nothing when the session list is undefined', () => {
    expect(selectAvailableSds([{ sd_key: 'SD-A' }], undefined, { nowMs: NOW })).toEqual([]);
  });

  it('an EMPTY session array is a real answer (nobody is building) and does not block dispatch', () => {
    expect(selectAvailableSds([{ sd_key: 'SD-A' }], [], { nowMs: NOW })).toEqual([{ sd_key: 'SD-A' }]);
  });

  it('ignores session rows with no heartbeat rather than trusting them as live', () => {
    const out = selectAvailableSds([{ sd_key: 'SD-A' }], [{ sd_key: 'SD-A', heartbeat_at: null }], { nowMs: NOW });
    expect(out).toEqual([{ sd_key: 'SD-A' }]);
  });

  it('handles an empty or non-array candidate list without throwing', () => {
    expect(selectAvailableSds([], [], { nowMs: NOW })).toEqual([]);
    expect(selectAvailableSds(null, [], { nowMs: NOW })).toEqual([]);
  });
});

describe('wiring: the call site uses the predicate, not the raw query result', () => {
  it('emitAutoClaimDirective is fed from the cross-checked list', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(resolve(__dirname, '../../..', 'scripts/hooks/coordination-inbox.cjs'), 'utf8');
    // Pinned the exact expression `const claimable = selectAvailableSds(availableSDs, liveSessions)`
    // until a later commit edited the query directly above it; it survived by luck. Exact-syntax and
    // fixed-offset pins have now broken FOUR times inside this SD alone, so this asserts the two
    // semantics instead: the predicate is fed from the raw query result, and the directive is fed
    // from the predicate's output — never from the raw list. Renaming the local or adding an opts
    // argument are both correct refactors and must not fail here.
    expect(src).toMatch(/selectAvailableSds\(\s*availableSDs\s*,\s*liveSessions/);
    expect(src).toMatch(/emitAutoClaimDirective\(\s*claimable\[0\]\.sd_key/);
    // The guard is worthless if the directive can still be fed straight from the unchecked list.
    expect(src).not.toMatch(/emitAutoClaimDirective\(\s*availableSDs\[0\]/);
  });
});
