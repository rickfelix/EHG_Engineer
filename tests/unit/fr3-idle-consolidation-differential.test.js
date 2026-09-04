/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D FR-3 (TS-1..TS-8-adjacent): the frozen-population
 * differential harness. See lib/fleet/fr3-idle-consolidation-differential.mjs for the full
 * design rationale (why PRE-migration functions are, wherever possible, the REAL still-live
 * pre-migration functions rather than reimplementations, and where a verbatim git-history
 * snapshot was unavoidable).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDifferential, FROZEN_POPULATION, MATRIX, CONSUMERS, changeExpected } from '../../lib/fleet/fr3-idle-consolidation-differential.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

function findRow(results, fixtureId, consumer) {
  const row = results.find((r) => r.fixtureId === fixtureId && r.consumer === consumer);
  if (!row) throw new Error(`no row for ${fixtureId} x ${consumer}`);
  return row;
}

describe('FR-3 AC#3/AC#4: every observed verdict change matches the per-consumer x per-reason matrix', () => {
  const results = runDifferential(FROZEN_POPULATION);

  it('produces one row per fixture x consumer', () => {
    expect(results.length).toBe(FROZEN_POPULATION.length * CONSUMERS.length);
  });

  it('every row matches its matrix cell -- a change not in the matrix, or a matrix cell firing for the wrong consumer, fails', () => {
    const mismatches = results.filter((r) => !r.matches);
    expect(mismatches).toEqual([]);
  });

  it('the matrix names only the six FR-3 reasons plus the two EXEC-review-added is-coordinator reasons (no undeclared reason sneaks in)', () => {
    // stale-is-coordinator-bool/-string were added after an EXEC-phase TESTING review
    // (sub_agent_execution_results cf105d66-1f03-4e93-9389-ce22df2f581a) found the original
    // six-reason-only population hid this SD's own headline fix (fleet-dashboard never checked
    // is_coordinator at all) -- see the FR-3 headline-fix describe block below.
    const KNOWN_REASONS = new Set([
      'fixture-session', 'directed-work', 'qf-holder-authoritative', 'released-shell', 'spin-up-grace', 'stale-sd_key-mirror',
      'stale-is-coordinator-bool', 'stale-is-coordinator-string',
    ]);
    for (const consumer of CONSUMERS) {
      for (const reason of Object.keys(MATRIX[consumer] || {})) {
        expect(KNOWN_REASONS.has(reason)).toBe(true);
      }
    }
  });
});

describe('FR-3 AC#5: must-CHANGE shapes, individually asserted with concrete pre/post verdicts', () => {
  const results = runDifferential(FROZEN_POPULATION);

  it('TS-1-style: fixture-session flips on coordinator-idle-qf-hint (never fixture-checked before)', () => {
    const row = findRow(results, 'fixture-session', 'coordinator-idle-qf-hint');
    expect(row.pre).toBe(true);   // wrongly counted idle before
    expect(row.post).toBe(false); // correctly excluded after
  });

  it('fixture-session flips on adam-quiet-tick (isBuildForbiddenSession is metadata-only, blind to session_id)', () => {
    const row = findRow(results, 'fixture-session', 'adam-quiet-tick');
    expect(row.pre).toBe(true);
    expect(row.post).toBe(false);
  });

  it('QF-holder-newly-excluded flips on adam-quiet-tick only', () => {
    const row = findRow(results, 'qf-holder-authoritative', 'adam-quiet-tick');
    expect(row.pre).toBe(true);
    expect(row.post).toBe(false);
    for (const consumer of ['coordinator-idle-qf-hint', 'capacity-inputs', 'fleet-dashboard']) {
      expect(changeExpected(consumer, 'qf-holder-authoritative')).toBe(false);
    }
  });

  it('directed-work-newly-excluded flips on adam-quiet-tick only', () => {
    const row = findRow(results, 'directed-work', 'adam-quiet-tick');
    expect(row.pre).toBe(true);
    expect(row.post).toBe(false);
  });

  it('spin-up-grace flips on adam-quiet-tick only', () => {
    const row = findRow(results, 'spin-up-grace', 'adam-quiet-tick');
    expect(row.pre).toBe(true);
    expect(row.post).toBe(false);
  });
});

describe('FR-3 AC#5: must-NOT-change shapes, individually asserted', () => {
  const results = runDifferential(FROZEN_POPULATION);

  it('TS-4-style: stale sd_key mirror naming a completed SD stays idle on every consumer that reads it (unaffected)', () => {
    for (const consumer of CONSUMERS) {
      const row = findRow(results, 'stale-sd-key-mirror-completed', consumer);
      expect(row.changed).toBe(false);
    }
  });

  it('TS-3-style: a QF holder stays not-idle on the consumers that already checked it (coordinator-idle-qf-hint, and via the view-joined qf_id on fleet-dashboard)', () => {
    for (const consumer of ['coordinator-idle-qf-hint', 'fleet-dashboard']) {
      const row = findRow(results, 'qf-holder-authoritative', consumer);
      expect(row.pre).toBe(false);
      expect(row.post).toBe(false);
    }
  });

  it('a directed-work reservation stays not-idle on coordinator-idle-qf-hint (already had this axis, unchanged mechanism)', () => {
    const row = findRow(results, 'directed-work', 'coordinator-idle-qf-hint');
    expect(row.pre).toBe(false);
    expect(row.post).toBe(false);
  });

  it('released-shell semantics are unchanged on every consumer -- each preserves its own distinct rule (not unified by this SD)', () => {
    for (const consumer of CONSUMERS) {
      const row = findRow(results, 'released-shell-recent', consumer);
      expect(row.changed).toBe(false);
    }
  });

  it('capacity-inputs and fleet-dashboard do not adopt qf-holder/directed-work/spin-up-grace in this SD (stated scope boundary, not an oversight)', () => {
    for (const consumer of ['capacity-inputs', 'fleet-dashboard']) {
      for (const reason of ['qf-holder-authoritative', 'directed-work', 'spin-up-grace']) {
        expect(changeExpected(consumer, reason)).toBe(false);
      }
    }
  });
});

describe('FR-3 headline fix, surfaced by EXEC-phase TESTING review: stale is_coordinator', () => {
  // This SD's own stated purpose (isDispatchableFleetMember excludes coordinator/adam/non_fleet/
  // fixture but NOT a stale is_coordinator flag) is fleet-dashboard's flip here -- the single
  // most important delta this SD produces. It was originally left OUT of the matrix-graded
  // population as "not one of the six PRD-named reasons, already covered by TS-2" -- TESTING
  // measured that this hid the fix from the one artifact a gate can actually read. See TS-2 in
  // seat-idle-predicate.test.js for the raw-predicate-level regression guard this complements.
  const results = runDifferential(FROZEN_POPULATION);

  it('fleet-dashboard flips on the boolean is_coordinator shape (isDispatchableFleetMember never checked it)', () => {
    const row = findRow(results, 'stale-is-coordinator-bool', 'fleet-dashboard');
    expect(row.pre).toBe(true);
    expect(row.post).toBe(false);
  });

  it('fleet-dashboard flips on the JSON-string is_coordinator shape', () => {
    const row = findRow(results, 'stale-is-coordinator-string', 'fleet-dashboard');
    expect(row.pre).toBe(true);
    expect(row.post).toBe(false);
  });

  it('adam-quiet-tick flips ONLY on the string shape (isBuildForbiddenSession is boolean-only, per TS-2)', () => {
    expect(findRow(results, 'stale-is-coordinator-bool', 'adam-quiet-tick').changed).toBe(false);
    const stringRow = findRow(results, 'stale-is-coordinator-string', 'adam-quiet-tick');
    expect(stringRow.pre).toBe(true);
    expect(stringRow.post).toBe(false);
  });

  it('coordinator-idle-qf-hint and capacity-inputs are unaffected on both shapes (their upstream identity checks already caught both)', () => {
    for (const consumer of ['coordinator-idle-qf-hint', 'capacity-inputs']) {
      expect(findRow(results, 'stale-is-coordinator-bool', consumer).changed).toBe(false);
      expect(findRow(results, 'stale-is-coordinator-string', consumer).changed).toBe(false);
    }
  });
});

describe('FR-3 AC#6: negative control', () => {
  it('a plain healthy, mid-claim worker reads idle identically on all four consumers before and after', () => {
    const results = runDifferential(FROZEN_POPULATION);
    for (const consumer of CONSUMERS) {
      const row = findRow(results, 'negative-control-healthy-mid-claim', consumer);
      expect(row.changed).toBe(false);
      expect(row.pre).toBe(row.post);
    }
  });
});

describe('FR-3 AC#1: runner-produced JSON artifact', () => {
  // Per CLAUDE.md's gate-evidence provenance rule (and the standing "EVIDENCE=RUNNER-PRODUCED"
  // practice this SD follows throughout): actually EXECUTE the runner as a subprocess and read
  // back the file it wrote, rather than asserting against runDifferential()'s in-process return
  // value a second time -- this is the one test that proves the artifact-producing PATH works,
  // not just the pure comparison logic.
  const artifactPath = resolve(REPO_ROOT, '.artifacts/fr3-idle-consolidation-differential-test.json');

  it('running the runner script writes a PASS-verdict artifact carrying the current commit sha and a content hash', () => {
    if (existsSync(artifactPath)) rmSync(artifactPath);
    execFileSync('node', ['scripts/fr3-idle-consolidation-differential-runner.mjs', '--out', artifactPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(existsSync(artifactPath)).toBe(true);
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    expect(artifact.verdict).toBe('PASS');
    expect(artifact.mismatchCount).toBe(0);
    expect(artifact.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(artifact.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.rowCount).toBe(FROZEN_POPULATION.length * CONSUMERS.length);
    rmSync(artifactPath);
  });
});
