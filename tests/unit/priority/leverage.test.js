import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  UNSCORED,
  buildDependentsMap,
  unlockScore,
  escalatedQfCountFor,
  computeSdLeverage,
  computeQfLeverage,
} from '../../../lib/priority/leverage.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(HERE, '../../fixtures/priority/live-sd-dependency-sample.json');

/**
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-C success_criteria #1: "A test runs both the extracted
 * lib/priority/leverage.js and the original unlockScore() against the same live dependency
 * graph and asserts 100% match on a sampled set of SD keys."
 *
 * The fixture is a real snapshot (captured 2026-09-06, 51 non-terminal strategic_directives_v2
 * rows: sd_key, dependencies, metadata.{blocked_by_sd_key,conditional_note}, status) rather than
 * a live query at test time -- tests/helpers/db-available.js's describeDb fails CLOSED against
 * this repo's only configured Supabase target (production; DESIGNATED_NON_PROD_REFS is
 * deliberately empty), so a live-query test here would permanently skip in every real run. A
 * frozen snapshot of real data keeps the parity claim genuine while staying in the always-run
 * `unit` vitest project.
 *
 * REFERENCE_UNLOCK_SCORE below is a verbatim, independently-maintained copy of the pre-extraction
 * algorithm at scripts/coordinator-backlog-rank.mjs:252-271 (the dependents-map loop + the
 * cycle-safe DFS) -- "the original unlockScore()" the success criterion names. It intentionally
 * does NOT import anything from lib/priority/leverage.js, so a regression in the extraction can
 * never be masked by comparing a function against itself.
 */
const SD_KEY_RE = /^(SD-[A-Z0-9-]+)/;

function buildReferenceDependents(sds) {
  const dependents = new Map();
  for (const d of sds) {
    const keys = [];
    if (Array.isArray(d.dependencies)) {
      for (const dep of d.dependencies) {
        let candidate = null;
        if (typeof dep === 'string') candidate = dep;
        else if (dep && typeof dep === 'object') candidate = dep.sd_key || dep.id || dep.sd_id;
        if (typeof candidate === 'string') {
          const m = candidate.match(SD_KEY_RE);
          if (m) keys.push(m[1]);
        }
      }
    }
    if (d.metadata && typeof d.metadata.blocked_by_sd_key === 'string' && SD_KEY_RE.test(d.metadata.blocked_by_sd_key)) {
      keys.push(d.metadata.blocked_by_sd_key);
    }
    for (const k of keys) {
      if (!dependents.has(k)) dependents.set(k, []);
      dependents.get(k).push(d.sd_key);
    }
  }
  return dependents;
}

function referenceUnlockScore(key, dependents) {
  const seen = new Set();
  const stack = [...(dependents.get(key) || [])];
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k) || k === key) continue;
    seen.add(k);
    stack.push(...(dependents.get(k) || []));
  }
  return seen.size;
}

describe('leverage parity (SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-C FR-1, TS-1)', () => {
  const sds = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const dependentsMap = buildDependentsMap(sds);
  const referenceDependents = buildReferenceDependents(sds);

  it('the fixture actually exercises a non-trivial dependency chain', () => {
    // Guards against a future fixture refresh silently dropping the only real chain in the
    // sample, which would let this suite pass for the wrong reason (nothing to compare).
    const nonZero = sds.filter((d) => unlockScore(d.sd_key, dependentsMap) > 0);
    expect(nonZero.length).toBeGreaterThan(0);
  });

  it('every sampled SD key matches the reference implementation exactly', () => {
    for (const d of sds) {
      expect(unlockScore(d.sd_key, dependentsMap)).toBe(referenceUnlockScore(d.sd_key, referenceDependents));
    }
  });

  it('an unknown key (no dependents) unlocks nothing', () => {
    expect(unlockScore('SD-DOES-NOT-EXIST', dependentsMap)).toBe(0);
  });
});

describe('unlockScore (cycle-safety and DFS correctness)', () => {
  it('a linear chain A<-B<-C unlocks transitively', () => {
    // B depends on A, C depends on B: finishing A unlocks B and (transitively) C.
    // Keys must be SD-key-shaped (SD_KEY_RE) — parseSdDependencies drops anything else.
    const dependentsMap = buildDependentsMap([
      { sd_key: 'SD-B', dependencies: [{ sd_key: 'SD-A' }] },
      { sd_key: 'SD-C', dependencies: [{ sd_key: 'SD-B' }] },
    ]);
    expect(unlockScore('SD-A', dependentsMap)).toBe(2);
    expect(unlockScore('SD-B', dependentsMap)).toBe(1);
    expect(unlockScore('SD-C', dependentsMap)).toBe(0);
  });

  it('a dependency cycle terminates instead of looping forever', () => {
    const dependentsMap = buildDependentsMap([
      { sd_key: 'SD-X', dependencies: [{ sd_key: 'SD-Y' }] },
      { sd_key: 'SD-Y', dependencies: [{ sd_key: 'SD-X' }] },
    ]);
    expect(unlockScore('SD-X', dependentsMap)).toBe(1);
    expect(unlockScore('SD-Y', dependentsMap)).toBe(1);
  });
});

describe('escalatedQfCountFor / computeSdLeverage (FR-2, TS-2, TS-3)', () => {
  const sdId = 'sd-uuid-1';
  const otherSdId = 'sd-uuid-2';

  it('counts only non-terminal QFs escalated into this SD', () => {
    const quickFixes = [
      { id: 'QF-1', escalated_to_sd_id: sdId, status: 'open' },
      { id: 'QF-2', escalated_to_sd_id: sdId, status: 'in_progress' },
      { id: 'QF-3', escalated_to_sd_id: sdId, status: 'completed' }, // terminal, excluded
      { id: 'QF-4', escalated_to_sd_id: otherSdId, status: 'open' }, // different SD, excluded
    ];
    expect(escalatedQfCountFor(sdId, quickFixes)).toBe(2);
  });

  it('an SD with 2 non-terminal escalated QFs outranks an otherwise-equal SD with 0 (TS-2)', () => {
    const dependentsMap = new Map(); // no SD-to-SD dependency edges in this scenario
    const quickFixes = [
      { escalated_to_sd_id: sdId, status: 'open' },
      { escalated_to_sd_id: sdId, status: 'escalated' },
    ];
    const withQfs = computeSdLeverage({ sd_key: 'SD-A', id: sdId }, dependentsMap, quickFixes);
    const withoutQfs = computeSdLeverage({ sd_key: 'SD-B', id: otherSdId }, dependentsMap, quickFixes);
    expect(withQfs).toBeGreaterThan(withoutQfs);
    expect(withQfs).toBe(2);
    expect(withoutQfs).toBe(0);
  });

  it('terminal-status QFs do not inflate leverage (TS-3)', () => {
    const dependentsMap = new Map();
    const quickFixes = [
      { escalated_to_sd_id: sdId, status: 'completed' },
      { escalated_to_sd_id: sdId, status: 'closed' },
      { escalated_to_sd_id: sdId, status: 'cancelled' },
    ];
    expect(computeSdLeverage({ sd_key: 'SD-A', id: sdId }, dependentsMap, quickFixes)).toBe(0);
  });
});

describe('computeQfLeverage (FR-3, TS-4)', () => {
  it('always reads UNSCORED — no schema signal exists for "waits on this QF"', () => {
    expect(computeQfLeverage()).toBe(UNSCORED);
    expect(computeQfLeverage({ id: 'QF-1', severity: 'critical' })).toBe(UNSCORED);
  });
});
