/**
 * The pure functions this SD added must stay WIRED to their call sites.
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1f — adversarial testing review, Finding 2.
 *
 * THE GAP THIS CLOSES. FR-1c, FR-4 and FR-5 each shipped a well-tested pure function and left the
 * WIRING unpinned. The auditor proved all three green-with-defect, and the numbers are the point:
 *   - delete orderSolomonInboxRows(...) from drainInbox  -> 2199 tests pass. FR-5 becomes dead code.
 *   - add a 30-minute window to the lane query in the tick -> 2199 pass. Rebuilds the EXACT FR-4
 *     defect that ARM (c) exists to catch, and ARM (c) cannot see it, because ARM (c) tests the
 *     SUMMARIZER while the defect moves into the QUERY.
 *   - revert isLive to status IN ('active','idle') in the drain -> 2199 pass. The FR-1c oracle
 *     becomes decoration while its own unit tests stay green.
 * FR-2 and FR-6 DID pin their wiring with static guards. The methodology was applied unevenly, and
 * unevenness is the finding: a test suite that proves a function correct while its caller can drop
 * it certifies a component, not a behaviour.
 *
 * WHY STATIC RATHER THAN BEHAVIOURAL. The call sites live in long-running CLI scripts whose
 * entrypoints are unexported and which reach the network on import. Pinning the wire statically is
 * what is available today without restructuring three scripts; it is weaker than an integration
 * test and is not pretending otherwise. Each assertion therefore names the exact defect it blocks,
 * so a future reader can tell what is and is not covered.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

/** Strip comments so a guard is never satisfied by prose describing the thing it requires. */
const code = (src) => src
  .split('\n')
  .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*'))
  .join('\n');

describe('FR-5 wiring: the Solomon drain must CALL the ordering helper', () => {
  const src = () => code(read('scripts/solomon-advisory.cjs'));

  it('drainInbox calls orderSolomonInboxRows', () => {
    // Removing this call leaves every ordering unit test green while pre-send CCs go back to
    // holding real consults behind them — the helper becomes dead code, correctly tested.
    expect(src()).toMatch(/orderSolomonInboxRows\s*\(/);
  });

  it('the call wraps the row set, not something incidental', () => {
    expect(src()).toMatch(/const\s+rows\s*=\s*orderSolomonInboxRows\s*\(/);
  });
});

describe('FR-1c wiring: the drain must decide liveness via the heartbeat oracle', () => {
  const src = () => code(read('scripts/drain-dead-letter-coordination.mjs'));

  it('isLive delegates to isSessionLive', () => {
    expect(src()).toMatch(/isLive\s*=\s*\(sid\)\s*=>\s*isSessionLive\s*\(/);
  });

  it('the drain does NOT decide liveness from status or is_alive', () => {
    // The exact reverted form the auditor used: status IN ('active','idle'). Both fields were
    // measured wrong in BOTH directions, and the dominant dead target held 91.6% of the backlog
    // while reporting status='active' with a 45h-stale heartbeat.
    const s = src();
    expect(s).not.toMatch(/status\s*===\s*['"]active['"]/);
    expect(s).not.toMatch(/\[\s*['"]active['"]\s*,\s*['"]idle['"]\s*\]\s*\.includes/);
    expect(s).not.toMatch(/\.is_alive\b/);
  });

  it('it SELECTs the heartbeat columns the oracle needs', () => {
    // The oracle fails closed on absent timestamps, so dropping these columns from the select
    // would silently mark the entire fleet dead — a wiring failure that looks like a data failure.
    expect(src()).toMatch(/heartbeat_at/);
    expect(src()).toMatch(/last_tool_at/);
  });
});

/**
 * The FR-4 lane query span: from the session_coordination query that feeds the pending gauge, up
 * to the summarizer call it feeds. Anchored on both ends so it selects the query itself rather
 * than "whatever happens to sit nearby".
 */
function laneQuerySpan(src) {
  // Anchor on the ASSIGNMENT, not on from('session_coordination'): the paginating wrapper sits
  // OUTSIDE the query builder, so a span starting at from(...) excludes the very call it is meant
  // to check. Caught by the guard failing on correct code — which is the cheap direction to fail.
  const start = src.indexOf('const laneRows');
  const end = src.indexOf('summarizePendingLane', start);
  if (start === -1 || end === -1) return '';
  return src.slice(start, end);
}

describe('FR-4 wiring: the tick must feed the gauge an UNWINDOWED, uncapped lane query', () => {
  const src = () => code(read('scripts/coordinator-quiet-tick.mjs'));

  it('the lane query span is locatable (guard is not vacuous)', () => {
    // If the anchors stop matching, every assertion below would inspect an empty string and pass.
    expect(laneQuerySpan(src()).length).toBeGreaterThan(0);
  });

  it('the tick calls summarizePendingLane', () => {
    expect(src()).toMatch(/summarizePendingLane\s*\(/);
  });

  it('the lane query is PAGINATED, not capped with .limit()', () => {
    // A capped fetch measures the CAP, not the population — the exact under-reporting shape FR-4
    // exists to fix. Shipping it inside FR-4's own remedy would be the defect rebuilt in its cure.
    //
    // ANCHORED, not a fixed-size lookbehind. The first version sliced 900 chars backwards from the
    // summarizer call and grabbed unrelated code — the same proximity-instead-of-structure mistake
    // that made the adam pre-send guard fail on a comment. A guard that breaks on edits it does not
    // care about teaches readers to ignore it, which is how a real regression gets waved through.
    expect(laneQuerySpan(src())).toMatch(/fetchAllPaginated/);
    expect(laneQuerySpan(src())).not.toMatch(/\.limit\(\s*\d+\s*\)/);
  });

  it('the lane query applies NO created_at window', () => {
    // THE ASSERTION ARM (c) COULD NOT MAKE. ARM (c) proves the SUMMARIZER counts a 24h-old row;
    // it cannot see a window added to the QUERY, because a windowed query never hands the
    // summarizer the old row at all. The defect simply moves one layer up and goes invisible.
    const laneQuery = laneQuerySpan(src());
    expect(laneQuery.length).toBeGreaterThan(0);
    expect(laneQuery).not.toMatch(/\.gte\(\s*['"]created_at['"]/);
    expect(laneQuery).not.toMatch(/\.lt\(\s*['"]created_at['"]/);
  });
});

/**
 * SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 FR-3 wiring. TESTING sub-agent finding T-1
 * (evidence 4b0ec75d): scripts/coordinator-quiet-tick.mjs's main() is unexported and
 * uncallable from a unit test, so the FR-3 call site is invisible to behavioural
 * coverage — the parent SD's FR-7 shipped with the exact same shape and computeLoadedAndQuiet()
 * sat at zero production callers while all 50 predicate tests stayed green. This guard
 * pins the ORDERING (computed fresh, immediately before decideCadence) that no unit test
 * of decideCadence or computeLoadedAndQuiet alone can see.
 */
function loadedAndQuietSpan(src) {
  // Anchor on the ASSIGNMENT (the fresh-read call site), through to the decideCadence
  // call it must feed — anchored on both ends per the FR-4 lane-query precedent above.
  const start = src.indexOf('const loadedAndQuiet');
  const end = src.indexOf('decideCadence(', start);
  if (start === -1 || end === -1) return '';
  return src.slice(start, end);
}

describe('FR-3 wiring: the coordinator tick must compute loadedAndQuiet fresh and feed it to decideCadence', () => {
  const src = () => code(read('scripts/coordinator-quiet-tick.mjs'));

  it('the loadedAndQuiet span is locatable (guard is not vacuous)', () => {
    expect(loadedAndQuietSpan(src()).length).toBeGreaterThan(0);
  });

  it('main() calls resolveLoadedAndQuiet(), not a hand-rolled predicate', () => {
    expect(loadedAndQuietSpan(src())).toMatch(/resolveLoadedAndQuiet\s*\(/);
  });

  it('resolveLoadedAndQuiet calls computeLoadedAndQuiet (not reimplemented inline)', () => {
    const s = src();
    const fnStart = s.indexOf('async function resolveLoadedAndQuiet');
    const fnEnd = s.indexOf('\n}', fnStart);
    expect(fnStart).toBeGreaterThan(-1);
    expect(s.slice(fnStart, fnEnd)).toMatch(/computeLoadedAndQuiet\s*\(/);
  });

  it('resolveLoadedAndQuiet calls gatherCapacityInputs (not a hand-rolled Supabase query)', () => {
    const s = src();
    const fnStart = s.indexOf('async function resolveLoadedAndQuiet');
    const fnEnd = s.indexOf('\n}', fnStart);
    expect(s.slice(fnStart, fnEnd)).toMatch(/gatherCapacityInputs\s*\(/);
  });

  it('decideCadence receives loadedAndQuiet in its input object', () => {
    const s = src();
    const start = s.indexOf('const delaySeconds = decideCadence(');
    const end = s.indexOf(');', start);
    expect(start).toBeGreaterThan(-1);
    expect(s.slice(start, end)).toMatch(/loadedAndQuiet/);
  });

  it('the loadedAndQuiet computation is NOT reused from the tick-start assessFleetActivity() read (ARM-time freshness)', () => {
    // The defect this blocks: computing loadedAndQuiet near assessFleetActivity() (~line 389,
    // tick start) instead of immediately before decideCadence() (~line 478) would be stale by
    // construction (the same staleness class the coordinator voided twice on unrelated
    // predictive-deficit caps). Anchor: the loadedAndQuiet assignment must appear AFTER the
    // unactionedDirective/undeliveredEscalation Promise.all resolves, not before it.
    const s = src();
    const promiseAllIdx = s.indexOf('const [sessionDirective, chairmanDirective, undeliveredEscalation]');
    const loadedIdx = s.indexOf('const loadedAndQuiet = await resolveLoadedAndQuiet');
    expect(promiseAllIdx).toBeGreaterThan(-1);
    expect(loadedIdx).toBeGreaterThan(promiseAllIdx);
  });
});

describe('controls — these guards must be able to fail', () => {
  it('CONTROL: comment-stripping means prose cannot satisfy a wiring requirement', () => {
    const prose = '  // this file used to call orderSolomonInboxRows(rows) before it was removed';
    expect(code(prose)).not.toMatch(/orderSolomonInboxRows\s*\(/);
  });

  it('CONTROL: a status-based liveness check is detectable', () => {
    const reverted = "  const isLive = (sid) => ['active','idle'].includes((byId.get(sid)||{}).status);";
    expect(code(reverted)).toMatch(/\[\s*['"]active['"]\s*,\s*['"]idle['"]\s*\]\s*\.includes/);
  });

  it('CONTROL: a created_at window on a query is detectable', () => {
    const windowed = "      .gte('created_at', new Date(Date.now() - 1800000).toISOString())";
    expect(code(windowed)).toMatch(/\.gte\(\s*['"]created_at['"]/);
  });
});
