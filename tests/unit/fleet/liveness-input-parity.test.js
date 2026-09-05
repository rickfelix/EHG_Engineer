/**
 * SD-LEO-INFRA-STALE-SESSION-SWEEP-001 FR-5 — PRODUCER/CONSUMER FIELD-SET PARITY.
 *
 * WHY THIS TEST AND NOT A SCENARIO REPLAY. The 2026-07-27 eviction was not a logic bug — the guard
 * was never wrong, it was STARVED. shouldHoldClaim() delegates to isSessionAlive(), which reads five
 * rungs; the sweep's query supplied the columns for two of them. So the guard dutifully answered
 * "not alive" about a session the sweep's own classifier had, in the same row, called
 * ALIVE_SOURCE_SIDE. A replay test proves only the one case you thought of. A field-set contract
 * test is route-independent: it fails again for ANY future rung whose column someone forgets.
 *
 * IT WOULD HAVE BEEN RED BEFORE THE INCIDENT, NOT AFTER IT. The contract was already written down in
 * the shouldHoldClaim JSDoc, and two of the five call sites already implemented it — both hooks
 * carry the comment "select the liveness fields the guard reads". The three sweep seams silently did
 * not. The contract was documented, honoured at 2/5, dropped at 3/5, by the same SD that introduced
 * the guard. Prose cannot fail a build.
 *
 * THIS TEST IS TWO-SIDED ON PURPOSE. It asserts the sweep satisfies the contract (the side that was
 * RED before the fix) AND that the two reference hooks satisfy it (the side that was already GREEN).
 * If a future edit weakens the assertion into something everything passes, the hook cases keep
 * proving the check still discriminates — a one-sided version could be satisfied by an empty group
 * list and nobody would notice.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');

const { LIVENESS_INPUT_FIELDS } = require(path.join(REPO, 'lib/fleet/session-liveness.cjs'));
const { SESSION_SELECT_COLUMNS } = require(path.join(REPO, 'scripts/stale-session-sweep.cjs'));

/** Split a postgrest .select() column list into a Set of bare column names. */
function columnsOf(selectString) {
  return new Set(String(selectString).split(',').map((c) => c.trim()).filter(Boolean));
}

/** Which OR-groups are NOT satisfied by this column set. Empty array => contract met. */
function unsatisfiedGroups(cols) {
  return LIVENESS_INPUT_FIELDS.filter((group) => !group.some((f) => cols.has(f))).map((g) => g.join('|'));
}

/**
 * The two call sites that already honour the contract. Their select strings are read out of source
 * because they are hooks, not importable modules — but the assertion is about the COLUMN SET sent to
 * the database, i.e. data, not about the shape of the code that produces it.
 */
const REFERENCE_SITES = [
  { file: 'scripts/hooks/reclaim-sd-after-compaction.cjs', sd: 'SD-LEO-INFRA-STALE-SWEEP-PID-LIVENESS-GUARD-001' },
  { file: 'scripts/hooks/session-state-sync.cjs', sd: 'SD-LEO-INFRA-STALE-SWEEP-PID-LIVENESS-GUARD-001' },
];

function referenceSelect(relPath) {
  const src = readFileSync(path.join(REPO, relPath), 'utf8');
  // The select immediately following the documented comment is the guard-feeding one.
  const m = src.match(/select the liveness fields the guard reads\.?\s*\n\s*\.select\('([^']+)'\)/);
  return m ? m[1] : null;
}

describe('FR-5: liveness input parity — every shouldHoldClaim producer supplies what the guard reads', () => {
  it('the contract itself is non-empty and well-formed (guards the guard)', () => {
    // Without this, a future edit to LIVENESS_INPUT_FIELDS could empty the contract and every
    // assertion below would pass vacuously.
    expect(Array.isArray(LIVENESS_INPUT_FIELDS)).toBe(true);
    expect(LIVENESS_INPUT_FIELDS.length).toBeGreaterThanOrEqual(5);
    for (const group of LIVENESS_INPUT_FIELDS) {
      expect(Array.isArray(group)).toBe(true);
      expect(group.length).toBeGreaterThan(0);
    }
    // The rungs these groups exist for, named so a deletion is obvious in the diff.
    const flat = LIVENESS_INPUT_FIELDS.flat();
    for (const required of ['is_alive', 'process_alive_at', 'expected_silence_until']) {
      expect(flat).toContain(required);
    }
  });

  it('the detector actually detects — a deliberately starved column set is reported unsatisfied', () => {
    // POSITIVE CONTROL. This is the pre-fix sweep column set, verbatim. If unsatisfiedGroups() ever
    // returns [] for this input, the checks below are meaningless and this test says so first.
    const preFix = columnsOf(
      'session_id, sd_key, sd_title, heartbeat_age_seconds, heartbeat_age_human, computed_status, '
      + 'hostname, tty, pid, track, is_virtual, parent_session_id, terminal_id, current_branch',
    );
    const missing = unsatisfiedGroups(preFix);
    expect(missing).toContain('is_alive');
    expect(missing).toContain('status');
    expect(missing).toContain('process_alive_at');
    expect(missing).toContain('expected_silence_until');
    expect(missing).toHaveLength(4);
  });

  it('the sweep query supplies every rung the guard reads, EXCEPT the one deliberately withheld', () => {
    // THE ASSERTION THAT WAS RED BEFORE THIS SD. All three sweep release seams (completed-SD,
    // orphaned-claim, conflict eviction) filter the same `classified` array built from this one
    // query, so this single check covers all three.
    //
    // is_alive IS WITHHELD ON PURPOSE — not an oversight, and it must not be "fixed" by adding it.
    // MEASURED: 6 of 6 claim-holding rows carry is_alive=true, and raw_is_alive is rung 1, which
    // short-circuits before every other rung. Selecting it here would hold every row at every seam
    // and turn the sweep into a silent no-op, killing genuine conflict eviction. The flag is also
    // sticky (2075 rows true with heartbeats 3-170 days old; nothing clears it on release), so it is
    // the one liveness input that cannot expire. Withholding it keeps rung 1 exactly as inert at the
    // sweep as it is today — a narrower, more reversible lever than overriding the guard's verdict
    // downstream, which broke two ratified guard-rail tests when that was attempted.
    //
    // SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E added a ['status'] group (FR-2: raw_is_alive is denied for
    // a released/stale row). status is moot wherever is_alive itself is withheld — rung 1 can never
    // fire without is_alive present, so there is nothing for TERMINAL_STATUSES_DENY_RAW_ALIVE to
    // deny. The exemption widens to this NAMED PAIR; any OTHER missing rung still fails this assertion.
    expect(unsatisfiedGroups(columnsOf(SESSION_SELECT_COLUMNS))).toEqual(['is_alive', 'status']);
  });

  it.each(REFERENCE_SITES)('$file already honoured the contract and still does', ({ file }) => {
    // These were GREEN before this SD and must stay green: they are the reference implementation,
    // not collateral. A change that "fixes" the sweep by weakening the contract breaks these first.
    const select = referenceSelect(file);
    expect(select, `could not locate the guard-feeding select in ${file}`).toBeTruthy();
    expect(unsatisfiedGroups(columnsOf(select))).toEqual([]);
  });

  // testing-agent EXEC review (688ca3f5): a 5th isSessionAlive producer this SD's own original FR-2
  // sweep missed -- scripts/worker-checkin.cjs's foreignSessionForSd(), which feeds
  // isForeignSessionLive() and foreignClaimantBlocksSteal(). Not exported (an internal helper), so
  // read the same way REFERENCE_SITES above reads the two hook files: from source.
  it("worker-checkin.cjs's foreignSessionForSd now supplies status too (the 5th missed producer)", () => {
    const src = readFileSync(path.join(REPO, 'scripts/worker-checkin.cjs'), 'utf8');
    const m = src.match(/from\('v_active_sessions'\)\s*\.select\('([^']+)'\)/);
    expect(m, 'could not locate foreignSessionForSd\'s v_active_sessions select').toBeTruthy();
    // is_alive IS present here (unlike the sweep's deliberate withholding above) -- this producer
    // does not have that same rung-1-inertness rationale, so status must stand on its own.
    expect(unsatisfiedGroups(columnsOf(m[1]))).toEqual([]);
  });

  it('the detector would have caught the pre-fix foreignSessionForSd column set (negative control)', () => {
    const preFix = columnsOf(
      'session_id, is_alive, heartbeat_at, heartbeat_age_seconds, terminal_id, current_branch, process_alive_at, expected_silence_until',
    );
    expect(unsatisfiedGroups(preFix)).toEqual(['status']);
  });

  // PLAN-phase VALIDATION review (e1352308): 2 of the ORIGINAL 4 FR-2 producers had zero
  // regression protection in THIS file -- scripts/stale-session-sweep.cjs:1281's holderRows query
  // is covered separately (tests/unit/fleet/session-liveness.test.js's TS-4 end-to-end block) and
  // scripts/hooks/coordination-inbox.cjs:927 is covered separately
  // (tests/unit/claim-ownership-vs-liveness-precedence.test.js), but scripts/fleet-rollcall.cjs:83
  // and lib/worktree-reaper/live-claim-guard.js:29 had NO test anywhere verifying their select
  // includes `status` -- exactly the column this SD exists to institutionalise, at 2 of its own
  // named call sites. Closing that gap here, same source-read pattern as REFERENCE_SITES above.
  it("fleet-rollcall.cjs's holderRows-equivalent select supplies status too (originally-named producer #3)", () => {
    const src = readFileSync(path.join(REPO, 'scripts/fleet-rollcall.cjs'), 'utf8');
    const m = src.match(/from\('claude_sessions'\)\s*\.select\('([^']+)'\)/);
    expect(m, 'could not locate fleet-rollcall.cjs\'s claude_sessions select').toBeTruthy();
    expect(unsatisfiedGroups(columnsOf(m[1]))).toEqual([]);
  });

  it('the detector would have caught the pre-fix fleet-rollcall.cjs column set (negative control)', () => {
    const preFix = columnsOf(
      'session_id, sd_key, updated_at, heartbeat_at, is_alive, terminal_id, process_alive_at, expected_silence_until, metadata',
    );
    expect(unsatisfiedGroups(preFix)).toEqual(['status']);
  });

  // KNOWN LIMITATION (pre-existing, out of this SD's FR-2 scope): live-claim-guard.js's
  // SESSION_FIELDS never selected process_alive_at or expected_silence_until at all -- this
  // producer starves the tick/armed-silence rungs regardless of this SD's fix. That gap predates
  // this SD and is NOT what FR-2 promised to close here; only assert on the `status` group this
  // SD actually added, not the full 5-group contract.
  it("live-claim-guard.js's SESSION_FIELDS supplies status too (originally-named producer #4)", () => {
    const src = readFileSync(path.join(REPO, 'lib/worktree-reaper/live-claim-guard.js'), 'utf8');
    const m = src.match(/SESSION_FIELDS\s*=\s*'([^']+)'/);
    expect(m, 'could not locate live-claim-guard.js\'s SESSION_FIELDS constant').toBeTruthy();
    expect(unsatisfiedGroups(columnsOf(m[1]))).not.toContain('status');
  });

  it('the detector would have caught the pre-fix live-claim-guard.js column set (negative control)', () => {
    const preFix = columnsOf('session_id, is_alive, heartbeat_at, heartbeat_age_seconds, terminal_id, current_branch');
    expect(unsatisfiedGroups(preFix)).toContain('status');
  });

  it('the heartbeat and pid groups accept EITHER alternative, so neither producer shape is penalised', () => {
    // hasFreshHeartbeat reads heartbeat_age_seconds first and falls back to heartbeat_at; hasPidAlive
    // resolves from terminal_id OR session_id. A flat "all fields present" contract would wrongly
    // fail both the view-shaped sweep row AND the base-table-shaped hook row.
    const viewShape = columnsOf('is_alive, status, heartbeat_age_seconds, terminal_id, process_alive_at, expected_silence_until');
    const tableShape = columnsOf('is_alive, status, heartbeat_at, session_id, process_alive_at, expected_silence_until');
    expect(unsatisfiedGroups(viewShape)).toEqual([]);
    expect(unsatisfiedGroups(tableShape)).toEqual([]);
  });
});
