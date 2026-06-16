/**
 * SD-LEO-INFRA-SWEEP-DEP-RESOLVER-COMPLETED-LOOKUP-001
 *
 * The stale-session-sweep availability/blocked resolver used to build its satisfied-set from the
 * in-memory standalone working set (filtered to draft/in_progress/ready/pending_approval + .limit(20)),
 * which can NEVER contain a completed SD — so completedKeys was effectively empty and ANY SD with a
 * real completed-but-out-of-window dependency was falsely reported BLOCKED. The fix mirrors the
 * canonical coordinator-audit.mjs resolver: a FRESH targeted DB lookup of the exact dependency keys,
 * checked against the TERMINAL set (completed/cancelled/archived/deferred).
 *
 * These tests are network-free: (1) a mirror of the NEW predicate proving terminal-but-out-of-window
 * deps are satisfied, and (2) source-pins proving the real code does the fresh lookup + terminal check
 * and no longer derives the satisfied-set from the non-terminal working set.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseSdDependencies } = require('../../../lib/utils/parse-sd-dependencies.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SWEEP_SRC = readFileSync(path.join(REPO_ROOT, 'scripts/stale-session-sweep.cjs'), 'utf8');

// Mirror of the sweep's NEW predicate (scripts/stale-session-sweep.cjs):
//   SWEEP_DEP_TERMINAL = ['completed','cancelled','archived','deferred']
//   isDepSatisfied(k) = SWEEP_DEP_TERMINAL.includes(depStatusByKey[k])  // unknown/missing = unmet
//   available/blocked use depKeys.every(isDepSatisfied), where depStatusByKey comes from a FRESH
//   DB lookup of the dep keys (not the in-memory non-terminal working set).
const SWEEP_DEP_TERMINAL = ['completed', 'cancelled', 'archived', 'deferred'];
function makeIsDepSatisfied(depStatusByKey) {
  return (k) => SWEEP_DEP_TERMINAL.includes(depStatusByKey[k]);
}
function isBlocked(sd, depStatusByKey) {
  const depKeys = parseSdDependencies(sd.dependencies);
  if (depKeys.length === 0) return false;
  return !depKeys.every(makeIsDepSatisfied(depStatusByKey));
}

describe('sweep dep resolver — completed-but-out-of-window deps are satisfied (network-free predicate)', () => {
  it('a completed dependency (from a FRESH lookup, NOT in the working set) is SATISFIED, not blocked', () => {
    // The dep SD is completed and would NOT appear in the sweep's non-terminal working set.
    const statusByKey = { 'SD-DEP-DONE-001': 'completed' };
    expect(isBlocked({ dependencies: ['SD-DEP-DONE-001'] }, statusByKey)).toBe(false);
  });

  it('treats every TERMINAL status (completed/cancelled/archived/deferred) as satisfied', () => {
    for (const st of SWEEP_DEP_TERMINAL) {
      expect(isBlocked({ dependencies: ['SD-X-001'] }, { 'SD-X-001': st })).toBe(false);
    }
  });

  it('a non-terminal dependency (draft/in_progress) is still BLOCKED', () => {
    expect(isBlocked({ dependencies: ['SD-X-001'] }, { 'SD-X-001': 'in_progress' })).toBe(true);
    expect(isBlocked({ dependencies: ['SD-X-001'] }, { 'SD-X-001': 'draft' })).toBe(true);
  });

  it('an unknown/missing real SD-key dependency still counts as unmet (blocked)', () => {
    expect(isBlocked({ dependencies: ['SD-MISSING-999'] }, {})).toBe(true);
  });

  it('no real SD-key deps => never blocked (prose/object placeholders dropped by the canonical parser)', () => {
    expect(isBlocked({ dependencies: [] }, {})).toBe(false);
    expect(isBlocked({ dependencies: ['scripts/foo.js', 'some prose note'] }, {})).toBe(false);
  });

  it('mixed deps: blocked iff ANY real dep is non-terminal', () => {
    const statusByKey = { 'SD-A-001': 'completed', 'SD-B-001': 'in_progress' };
    expect(isBlocked({ dependencies: ['SD-A-001', 'SD-B-001'] }, statusByKey)).toBe(true);
    expect(isBlocked({ dependencies: ['SD-A-001'] }, statusByKey)).toBe(false);
  });
});

describe('sweep dep resolver — source pins (the real code does the fresh terminal lookup)', () => {
  it('declares the TERMINAL satisfied-set including deferred', () => {
    expect(SWEEP_SRC).toMatch(/SWEEP_DEP_TERMINAL\s*=\s*\[[^\]]*'completed'[^\]]*'cancelled'[^\]]*'archived'[^\]]*'deferred'[^\]]*\]/);
  });
  it('does a FRESH targeted DB lookup of the exact dependency keys (.in(sd_key, allDepKeys))', () => {
    expect(SWEEP_SRC).toMatch(/\.in\(\s*['"]sd_key['"]\s*,\s*allDepKeys\s*\)/);
  });
  it('resolves satisfaction via isDepSatisfied against the terminal status map', () => {
    expect(SWEEP_SRC).toMatch(/const isDepSatisfied\s*=\s*\(k\)\s*=>\s*SWEEP_DEP_TERMINAL\.includes\(depStatusByKey\[k\]\)/);
    expect(SWEEP_SRC).toMatch(/depKeys\.every\(isDepSatisfied\)/);
  });
  it('no longer derives the satisfied-set from the in-memory non-terminal working set', () => {
    // The regressed code declared completedKeys from allSDs.filter(c => c.status === 'completed')
    // and resolved deps via completedKeys.has(k). Assert the DECLARATION + the in-memory build are
    // gone (a historical mention may survive in a comment, so pin the actual code constructs).
    expect(SWEEP_SRC).not.toMatch(/const\s+completedKeys\s*=/);
    expect(SWEEP_SRC).not.toMatch(/new Set\(allSDs\.filter\(c\s*=>\s*c\.status\s*===\s*'completed'\)/);
  });
});
