/**
 * QF-20260727-363 — the QA FIXES summary must count what was APPLIED, not what was DETECTED.
 *
 * THE DEFECT: every line in the QA FIXES block was printed from a detected array's `.length`, so it
 * could never learn whether the update it described actually happened. The reset line made that
 * permanent and visible — isSweepResetAllowed correctly refuses to reset an SD whose PLAN-TO-LEAD
 * handoff is accepted, the loop `continue`s without touching the row, and the summary still printed
 * "Reset 1 SD(s)" while "QA: skipped reset on <SD>" appeared three lines above it in the SAME run.
 * Verified at the DB after a sweep: the SD was still pending_approval. Observed across ~15
 * consecutive sweeps.
 *
 * WHY THIS IS A SOURCE SCAN. stale-session-sweep.cjs is a ~3700-line CJS script whose QA path is
 * welded to a live PostgREST client; the file's existing guards (builder-catch, dormancy-gate) take
 * the same approach for the same reason. The property being defended is structural — "no summary
 * line may read a detected array" — and a structural property is exactly what a scan can prove for
 * the WHOLE block rather than for the one line someone remembered to cover.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.resolve(__dirname, '../../scripts/stale-session-sweep.cjs'), 'utf8');

/** The QA FIXES print block: from the header line to the blank-line close. */
function qaFixesBlock() {
  const start = SRC.indexOf("console.log('QA FIXES (");
  expect(start, 'the QA FIXES block must still exist').toBeGreaterThan(-1);
  return SRC.slice(start, start + 1600);
}

describe('QF-20260727-363: QA FIXES reports applied repairs, never detections', () => {
  const DETECTED_ARRAYS = ['workingOnCompleted', 'orphanedClaims', 'stuckApproval', 'stuckReset', 'stuckCompleted', 'terminalWithClaims'];

  it('[CONTROL] the scan can see the block and the detected arrays still exist upstream', () => {
    // Without this, a rename that made every assertion below vacuous would pass silently — a scan
    // for something that no longer exists is not a clean result, it is a blind one.
    const block = qaFixesBlock();
    expect(block).toContain('Reset ');
    expect(block).toContain('Released ');
    expect(SRC).toMatch(/const workingOnCompleted = classified\.filter/);
    expect(SRC).toMatch(/const stuckApproval = /);
  });

  it('no repair line in the summary is driven by a detected array length', () => {
    const block = qaFixesBlock();
    const offenders = DETECTED_ARRAYS.filter((name) => new RegExp(`\\b${name}\\b[^\\n]*\\.length`).test(block));
    expect(
      offenders,
      `QA FIXES prints a count from detected set(s): ${offenders.join(', ')}. A detection is not a repair — ` +
      'drive the line from the applied tally, which is incremented only where a write was confirmed.'
    ).toEqual([]);
  });

  it('each repair line reads its own applied counter', () => {
    const block = qaFixesBlock();
    for (const counter of ['a.released', 'a.releasedOrphaned', 'a.completed', 'a.reset', 'a.cleared']) {
      expect(block, `the summary must print ${counter}`).toContain(counter);
    }
    // The HEADER too: an honest itemisation under a lying total is still a lying summary.
    expect(block).toMatch(/QA FIXES \(' \+ qaIssues/);
    expect(SRC).toMatch(/const qaIssues = a\.released \+ a\.releasedOrphaned \+ a\.completed \+ a\.reset \+ a\.cleared/);
  });

  it('every applied counter is incremented only inside a confirmed-write branch', () => {
    // THE LOAD-BEARING ONE. Moving an increment out of its `if (!error)` branch would restore the
    // original defect while leaving all the assertions above green.
    const increments = [...SRC.matchAll(/applied\.(released|releasedOrphaned|completed|reset|cleared)\+\+/g)];
    expect(increments.length, 'all five counters must be incremented somewhere').toBe(5);
    for (const m of increments) {
      const preceding = SRC.slice(Math.max(0, m.index - 400), m.index);
      const lastGuard = preceding.lastIndexOf('if (!error');
      expect(
        lastGuard,
        `applied.${m[1]}++ is not inside an if (!error...) branch — it would count an attempt, not a repair`
      ).toBeGreaterThan(-1);
    }
  });

  it('the pending_approval reset selects its rows, so a zero-row update cannot count as a repair', () => {
    // An UPDATE matching zero rows is NOT an error in PostgREST, so `!error` alone proved nothing.
    // The reset is the one path whose count this QF is about, so it must know a row actually moved.
    const resetIdx = SRC.indexOf("status: 'draft',");
    expect(resetIdx).toBeGreaterThan(-1);
    const resetCall = SRC.slice(resetIdx, resetIdx + 700);
    expect(resetCall).toMatch(/\.select\(['"]sd_key['"]\)/);
    expect(resetCall).toMatch(/resetRows \|\| \[\]\)\.length > 0/);
  });

  it('detected-but-not-repaired is still reported, rather than becoming silence', () => {
    // Before the fix this state was unreachable — it rendered as a QA FIX. After it, the risk flips
    // to the opposite failure: printing nothing and letting a reader conclude nothing was found.
    expect(SRC).toContain('detected, none repaired');
    expect(SRC).toMatch(/} else if \(detected > 0\) {/);
  });

  it('the guard the QF forbids weakening is untouched', () => {
    // The QF is explicit: the counter was wrong, isSweepResetAllowed was RIGHT. An SD with an
    // accepted PLAN-TO-LEAD handoff must not be reset out from under a pending LEAD-FINAL-APPROVAL.
    expect(SRC).toMatch(/if \(!\(await isSweepResetAllowed\(sd\.sd_key, 'LEAD', 'pending_approval-reset'\)\)\) \{\s*\n\s*continue;/);
    expect(SRC).toContain('QA: skipped reset on ');
  });
});
