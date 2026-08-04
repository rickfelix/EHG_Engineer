// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D (FR-1) — the Adam branch in session-role-orient.cjs.
//
// EVERY TEST HERE DRIVES decide() END-TO-END. None of them call adamLines() or isAdamSeat() to
// establish the behaviour under test, and that is deliberate rather than stylistic.
//
// THE FAILURE MODE THIS SUITE EXISTS TO CATCH: the Adam branch must sit ABOVE the general ROLE rung
// (`verdictFromMetadata(meta) === ROLE_VERDICT.ROLE`). That rung is a BROAD match which a live Adam
// seat satisfies, so a branch placed after it is UNREACHABLE — and it would be DEAD CODE THAT TESTS
// GREEN for any suite that calls the branch function directly. A test that exercises the unit
// cannot see that the path never arrives. So the unit is never the subject; decide() is.
//
// THE OTHER FAILURE MODE, measured rather than imagined: over 108 sessions with a 14d heartbeat,
// metadata.role is adam_retired:6, adam:1, solomon:1, coordinator:1. Retired seats OUTNUMBER the
// live one 6:1, so a predicate written the obvious way (startsWith('adam') / /adam/) passes the
// positive test while leaking Adam-only content to six dead seats. With one live Adam session in
// the whole fleet, the positive arm has a population of 1 — the NEGATIVE arm carries the proof.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const hook = require_('../../../scripts/hooks/session-role-orient.cjs');
const { decide, roleLines, SOLO, COORDINATOR, isAdamSeat } = hook;

const HEADLINE = 'Wave 3 gate blocked on chairman review';
const DRIVE_LINE = /\[ROLE\] DRIVE REPORT —/;

// No coordinator file and a session id that matches nothing: isolates the role axis so a test can
// never pass because it accidentally landed on the COORDINATOR or WORKER rung.
const run = (meta, headline = null) => decide('sess-under-test', meta, null, headline);

describe('FR-1 — the live Adam seat gets the Drive Report headline', () => {
  it('decide() routes an adam seat to Adam content, headline included', () => {
    const lines = run({ role: 'adam', non_fleet: true }, HEADLINE);
    expect(lines.join('\n')).toMatch(DRIVE_LINE);
    expect(lines.join('\n')).toContain(HEADLINE);
  });

  it('REACHABILITY — an adam seat does NOT fall through to the generic ROLE rung', () => {
    // THE PLACEMENT ASSERTION. If the Adam branch is moved below
    // `verdictFromMetadata(meta) === ROLE_VERDICT.ROLE`, decide() returns plain roleLines('adam')
    // and this goes red — while a test that called adamLines() directly would still pass.
    const lines = run({ role: 'adam', non_fleet: true }, HEADLINE);
    expect(lines).not.toEqual(roleLines('adam'));
    expect(lines.length).toBe(roleLines('adam').length + 1);
  });

  it('states the absence plainly when no headline is readable', () => {
    // Today this is the LIVE path: drive_reports does not exist until PR #6784 lands. A seat that
    // sees nothing cannot tell "no report today" from "the injection is broken", so the line is
    // emitted either way.
    const lines = run({ role: 'adam', non_fleet: true }, null);
    expect(lines.join('\n')).toMatch(DRIVE_LINE);
    expect(lines.join('\n')).toMatch(/unavailable this session/);
  });

  it('keeps the general role contract rather than replacing it', () => {
    // Adam IS a role seat. Everything roleLines says about a non-fleet seat is still true of him,
    // so a future edit to the role contract must not silently miss this seat.
    const lines = run({ role: 'adam', non_fleet: true }, HEADLINE);
    for (const l of roleLines('adam')) expect(lines).toContain(l);
  });
});

describe('FR-1 negative controls — the arm that actually carries the proof', () => {
  it('adam_retired gets the GENERIC role lines and NO Drive Report', () => {
    // THE LOAD-BEARING TEST. adam_retired satisfies the same broad ROLE verdict as adam, and there
    // are SIX of them against one live seat. startsWith('adam') and /adam/ both pass the positive
    // test above and FAIL here — leaking Adam-only content to dead seats.
    const lines = run({ role: 'adam_retired', non_fleet: true }, HEADLINE);
    expect(lines).toEqual(roleLines('adam_retired'));
    expect(lines.join('\n')).not.toMatch(DRIVE_LINE);
    expect(lines.join('\n')).not.toContain(HEADLINE);
  });

  it('solomon is byte-identical to its pre-change output', () => {
    // Solomon shares the very ROLE rung this change inserts into, which makes it the most likely
    // collateral of the edit. Asserted here, on the leg actively changing the ladder, rather than
    // appended to a completed SD's shipped surface.
    const lines = run({ role: 'solomon', non_fleet: true }, HEADLINE);
    expect(lines).toEqual(roleLines('solomon'));
    expect(lines.join('\n')).not.toMatch(DRIVE_LINE);
  });

  it('coordinator and SOLO seats are untouched', () => {
    expect(decide('s', { is_coordinator: true, role: 'adam' }, null, HEADLINE)).toEqual(COORDINATOR);
    expect(run(null, HEADLINE)).toEqual(SOLO);
  });

  it('a worker seat still reaches the worker rung', () => {
    const lines = decide('sess-worker', { callsign: 'Alpha-9' }, { session_id: 'coord-1' }, HEADLINE);
    expect(lines.join('\n')).toMatch(/\[ROLE\] WORKER/);
    expect(lines.join('\n')).not.toMatch(DRIVE_LINE);
  });

  it('the headline never leaks to a non-adam seat even when one is supplied', () => {
    // Two-sided: the fetch is gated on isAdamSeat in main(), but decide() must not depend on the
    // caller having gated correctly.
    for (const meta of [{ role: 'adam_retired' }, { role: 'solomon' }, { callsign: 'x' }, null]) {
      expect(decide('s', meta, { session_id: 'c' }, HEADLINE).join('\n')).not.toContain(HEADLINE);
    }
  });
});

describe('isAdamSeat — exact equality, and the near-misses that must not match', () => {
  it('matches only the exact role string', () => {
    expect(isAdamSeat({ role: 'adam' })).toBe(true);
    for (const role of ['adam_retired', 'ADAM', 'adam ', 'adam-2', 'adamant', 'solomon', '', null, undefined]) {
      expect(isAdamSeat({ role })).toBe(false);
    }
    expect(isAdamSeat(null)).toBe(false);
    expect(isAdamSeat({})).toBe(false);
  });
});
