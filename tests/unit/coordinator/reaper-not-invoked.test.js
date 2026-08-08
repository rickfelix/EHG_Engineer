/**
 * EXEC SECURITY (medium) — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001.
 *
 * A reaper that never RUNS is exactly as silent as one that refuses, and the refusal streak cannot
 * see it: a reaper that never starts has NO refusal streak, so detectReaperStarvation reports
 * streak_below_threshold forever and the condition stays invisible.
 *
 * THIS SD'S OWN CHANGE WIDENED THE HOLE. FR-1 resolves scripts/worktree-reaper.mjs from the
 * dedicated source tree instead of repoRoot, which makes `script_missing` materially more
 * reachable than it was before. So the fix introduced a new way to reap nothing quietly, and the
 * alarm it shipped could not detect it — the same defect class this SD exists to close.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const {
  detectReaperNotInvoked, detectReaperStarvation, REAPER_NOT_INVOKED_THRESHOLD,
} = require_('../../../lib/coordinator/coordination-events.cjs');
const { readState, writeState } = require_('../../../scripts/fleet/worktree-reaper-tick.cjs');

const T = REAPER_NOT_INVOKED_THRESHOLD;

describe('detectReaperNotInvoked: the reaper is not refusing, it is never starting', () => {
  it('MATCHES at the threshold, under its own distinct kind', () => {
    const r = detectReaperNotInvoked({ consecutiveNotInvoked: T, lastResult: 'script_missing' });
    expect(r.matched).toBe(true);
    expect(r.alertKind).toBe('reaper_not_invoked_alert');
    expect(r.evidence.consecutive_not_invoked).toBe(T);
    // The last result is carried because the three causes have three different first moves.
    expect(r.evidence.last_result).toBe('script_missing');
  });

  it('does NOT match below the threshold — a single missed tick is not an outage', () => {
    expect(detectReaperNotInvoked({ consecutiveNotInvoked: T - 1 }).matched).toBe(false);
  });

  it('THE GAP, stated as a test: the starvation detector is BLIND to this condition', () => {
    // A reaper that never starts has no refusal streak at all. This is why the not-invoked check
    // had to be a separate detector rather than another branch inside the starvation one.
    const notInvoked = { consecutiveRefusals: 0, pool: { used: 27, cap: 28, percent: 96 } };
    expect(detectReaperStarvation(notInvoked).matched).toBe(false);
    expect(detectReaperNotInvoked({ consecutiveNotInvoked: T * 2 }).matched).toBe(true);
  });

  it('the three alarm kinds are mutually distinct', () => {
    // Each de-dupes on its own key; a shared kind would let one condition silence another.
    const kinds = new Set([
      detectReaperNotInvoked({ consecutiveNotInvoked: T }).alertKind,
      detectReaperStarvation({ consecutiveRefusals: 99, pool: { used: 22, cap: 28 } }).alertKind,
      detectReaperStarvation({ consecutiveRefusals: 99, pool: { used: null, cap: 28 } }).alertKind,
    ]);
    expect(kinds.size).toBe(3);
  });

  it('degrades to no-alarm on missing/garbage input rather than throwing', () => {
    expect(detectReaperNotInvoked().matched).toBe(false);
    expect(detectReaperNotInvoked({}).matched).toBe(false);
    expect(detectReaperNotInvoked({ consecutiveNotInvoked: 'many' }).matched).toBe(false);
  });
});

describe('the counter actually SURVIVES a state round-trip', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-ni-')); });
  afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('consecutive_not_invoked is on readState\'s whitelist, so the streak can accumulate', () => {
    // NOT a formality. readState rebuilds the object field-by-field, so a key missing from that
    // whitelist is SILENTLY DROPPED on every read — the streak would reset to 0 every tick and the
    // alarm could never fire at any length. The file's own comment records this trap for
    // consecutive_refusals; this is the executable version of it.
    const p = path.join(tmp, 'state.json');
    writeState(p, { schema_version: 1, sweep_counter: 3, consecutive_not_invoked: 5, last_result: 'script_missing' });
    expect(readState(p).consecutive_not_invoked).toBe(5);
  });

  it('THE CALL SITE consumes non-refusal outcomes — structural, and labelled as such', () => {
    // FR-2's entire lesson was that tick() PUBLISHED consecutive_refusals and the call site threw
    // it away, so the gauge read NO_CONSUMER while the data existed. The identical bug one level
    // down is gating this branch on `=== 'refused_stale_tree'`, which consumes one silent-stop
    // class and discards script_missing / skipped_in_flight / spawn_error.
    //
    // A structural assertion is weaker than a behavioural one — stale-session-sweep.cjs is a
    // 3800-line script with no seam to drive this branch in a fixture — so it is labelled, not
    // dressed up. It fails on exactly the one-line narrowing that would reintroduce the bug.
    const src = fs.readFileSync(
      path.join(process.cwd(), 'scripts', 'stale-session-sweep.cjs'), 'utf8',
    );
    expect(src).toContain("outcome.result !== 'skipped_not_due'");
    // NI-R2: 'disabled' is excluded too, and the exclusion must stay EXPLICIT rather than being
    // quietly folded back in — that path cannot produce a verdict (it returns before the state
    // file is read), so admitting it would look like coverage while alarming never.
    expect(src).toContain("outcome.result !== 'disabled'");
    // The narrow gate must be GONE, not merely supplemented.
    expect(src).not.toContain("} else if (outcome.result === 'refused_stale_tree') {");
    // And the not-invoked branch must actually be reported, or the alarm is emitted into silence.
    expect(src).toContain('REAPER NOT-INVOKED ALARM');
  });

  it('an old state file with no such key reads as 0, not undefined', () => {
    // Backward compatibility: the field is additive, and undefined would make the comparison
    // silently false rather than a clean below-threshold.
    const p = path.join(tmp, 'old.json');
    fs.writeFileSync(p, JSON.stringify({ schema_version: 1, sweep_counter: 9 }));
    expect(readState(p).consecutive_not_invoked).toBe(0);
  });
});
