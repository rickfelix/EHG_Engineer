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

  it('a parked worker inside the liveness window still holds its SD', () => {
    const justInside = new Date(NOW - (SESSION_LIVENESS_WINDOW_MS - 1000)).toISOString();
    const out = selectAvailableSds([{ sd_key: 'SD-PARKED' }], [{ sd_key: 'SD-PARKED', heartbeat_at: justInside }], { nowMs: NOW });
    expect(out).toEqual([]);
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
    expect(src).toMatch(/const claimable = selectAvailableSds\(availableSDs, liveSessions\)/);
    expect(src).toMatch(/emitAutoClaimDirective\(\s*claimable\[0\]\.sd_key/);
  });
});
