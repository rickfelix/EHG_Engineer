// SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-3 + FR-4.
//
// THE DEFECT THIS REPLACES WAS AN INVERSION, NOT A GAP. adam-register.cjs and solomon-register.cjs
// answered "was the contract read?" from `status.lastReadWasPartial` — a boolean about the MOST
// RECENT call. On a contract larger than the 25k-token Read cap that gets the answer exactly
// backwards:
//   a no-offset Read TRUNCATES at ~line 166 of 421 and records lastReadWasPartial=false -> "read"
//   a diligent paginated full read records lastReadWasPartial=true on its last page  -> "partial"
// The reader who did the least was recorded complete; the reader who did the work was recorded
// incomplete. Filed as feedback 39c3d27d on 2026-07-19 and mis-titled as a capability gap, which is
// why it sat for ten days: the capability was already there.
//
// *** THIS LIVES AT THE CONSUMER, DELIBERATELY, AND THAT IS THE MOST IMPORTANT LINE IN THE FILE. ***
// The obvious fix is to redefine partial-ness inside protocol-file-tracker.cjs. Do not. That same
// stamp is read by protocol-file-read-gate.js:159, which is wired into ALL FOUR handoff executors —
// so changing its meaning would alter handoff gating for CLAUDE_LEAD/PLAN/EXEC.md fleet-wide in order
// to fix a defect affecting two role contracts. Fixing it here contains the blast radius to the
// roles that have the problem, and leaves the tracker's per-call stamp accurate as what it actually
// is: a fact about ONE call. The bug was ever using it to answer a whole-file question.
//
// FR-4: the union-of-ranges maths is IMPORTED, not reauthored. A correct implementation already
// existed and was wired to nothing. NOTE THE NARROW IMPORT — only unionRangeCoverage. Its sibling
// computeCoveragePercent carries a `no_limit_final_read` fallback that reproduces the very
// truncation bug this SD exists to close, and it ignores its caller's projectDir. "Import rather
// than reauthor" was right in spirit and wrong if applied wholesale.
const path = require('path');
const fs = require('fs');

// require(esm) — stable since Node 22.12; this fleet runs 24. Verified this file has no top-level
// await, which is the one thing that would make it throw ERR_REQUIRE_ASYNC_MODULE.
const { unionRangeCoverage } = require('../../scripts/modules/sd-key-generator.js');

/** Coverage at or above this counts as a full read. Matches the imported implementation's own bar. */
const FULL_COVERAGE_PCT = 95;

/** Line count of a contract on disk, or null when it cannot be determined. */
function contractLineCount(root, contractFile) {
  try {
    const raw = fs.readFileSync(path.join(root, contractFile), 'utf8');
    return raw.split('\n').length;
  } catch {
    return null;
  }
}

/**
 * Decide whether a role contract was genuinely read, from evidence rather than from a stale boolean.
 *
 * Precedence is deliberate — strongest evidence first:
 *   1. lastDelivered  — what the read ACTUALLY returned (FR-5). The only signal that can see a
 *      silently-truncated no-argument read, because such a read sets no limit/offset and therefore
 *      never enters ranges[] at all.
 *   2. ranges[]       — union coverage across paginated reads. Catches the diligent reader the old
 *      boolean punished.
 *   3. readCount      — last resort, and it is EXPLICITLY NOT treated as proof of a full read.
 *
 * @returns {{read: boolean, fully_read: boolean, coverage_pct: number|null, basis: string}}
 */
function contractReadVerdict(status, totalLines) {
  if (!status || !(status.readCount > 0)) {
    return { read: false, fully_read: false, coverage_pct: null, basis: 'no_read_recorded' };
  }

  // 1. Delivered evidence wins outright when present.
  const d = status.lastDelivered;
  if (d && Number.isFinite(Number(d.totalLines)) && Number.isFinite(Number(d.numLines))) {
    const covered = d.coveredWholeFile === true || Number(d.numLines) >= Number(d.totalLines);
    return {
      read: true,
      fully_read: covered,
      coverage_pct: Number(d.totalLines) > 0 ? Math.round((Number(d.numLines) / Number(d.totalLines)) * 100) : null,
      basis: 'delivered_lines'
    };
  }

  // 2. Union coverage across recorded ranges.
  if (Array.isArray(status.ranges) && status.ranges.length > 0 && Number.isFinite(totalLines) && totalLines > 0) {
    // unionRangeCoverage returns { covered, uncovered } — NOT a bare number. Destructuring matters:
    // treating the object as a number yields NaN, and NaN >= 95 is false, so the bug would have
    // presented as "no read ever counts as full" rather than as a crash. Caught by the diligent-
    // reader test on its first run, which is the case that assertion exists for.
    const { covered } = unionRangeCoverage(status.ranges, totalLines);
    const pct = Math.round((Number(covered) / totalLines) * 100);
    if (!Number.isFinite(pct)) return { read: true, fully_read: false, coverage_pct: null, basis: 'unknown_coverage' };
    return { read: true, fully_read: pct >= FULL_COVERAGE_PCT, coverage_pct: pct, basis: 'union_ranges' };
  }

  // 3. A read happened and we cannot say how much of the file it covered.
  //
  // NOT TREATED AS FULL, AND THAT IS THE WHOLE POINT. The old code reached exactly this state and
  // answered "fully read" whenever the last call carried no limit/offset — which is precisely the
  // truncated read. Absence of evidence is reported as absence, never promoted to completeness.
  return { read: true, fully_read: false, coverage_pct: null, basis: 'unknown_coverage' };
}

module.exports = { contractReadVerdict, contractLineCount, FULL_COVERAGE_PCT };
