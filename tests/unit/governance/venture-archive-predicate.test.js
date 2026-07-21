/**
 * Unit tests for the pinned reversible archive predicate + the one-time soft-archive
 * script's pure guardrail/selection logic.
 * SD-LEO-INFRA-VENTURES-DATA-HYGIENE-001 (FR-5).
 *
 * These pin PRECISION OVER RECALL: a real venture row must NEVER be selected for
 * archival. They RED against a naive "archive all cancelled" or "archive everything
 * not explicitly is_demo=false" predicate (both would select the real cancelled row
 * below) and GREEN with the precision-first one that delegates to the canonical
 * fixture classifier and hard-excludes the canary. No live DB — plain arrays only.
 */
import { describe, test, expect } from 'vitest';
import {
  isArchivableFixtureVenture, CANARY_NAME,
} from '../../../lib/governance/venture-archive-predicate.mjs';
import {
  selectCandidates, checkGuardrails, parseArgs, whyMatched, DEFAULT_CEILING,
} from '../../../scripts/archive/one-time/soft-archive-fixture-ventures.mjs';

describe('isArchivableFixtureVenture — precision over recall (FR-1)', () => {
  test('is_demo=true fixture row → true', () => {
    expect(isArchivableFixtureVenture({ name: 'Some Seed', is_demo: true })).toBe(true);
  });

  test('fixture-name rows → true', () => {
    for (const name of ['parity-test-cli-1234567890', 'TEST-HARNESS-S20-x', '__e2e_foo', 'ZZZ_seed', 'test-stub-a']) {
      expect(isArchivableFixtureVenture({ name, is_demo: false }), name).toBe(true);
    }
  });

  test('real cancelled row → FALSE (status=cancelled alone must never select)', () => {
    // A naive "archive all cancelled" / "archive all non-(is_demo=false)" predicate
    // would select this — the fatal failure mode. Precision-first returns FALSE.
    expect(isArchivableFixtureVenture({ name: 'Market Modeling SaaS', is_demo: false, status: 'cancelled' })).toBe(false);
  });

  test('sanctioned canary → FALSE even though is_demo=true (hard exclusion, checked first)', () => {
    expect(isArchivableFixtureVenture({ name: CANARY_NAME, is_demo: true })).toBe(false);
    expect(isArchivableFixtureVenture({ name: 'Canary Venture Probe', is_demo: true, status: 'active' })).toBe(false);
  });

  test('unclassifiable rows fail open → FALSE', () => {
    expect(isArchivableFixtureVenture({ name: null })).toBe(false);           // null name, no flag
    expect(isArchivableFixtureVenture({ name: undefined, is_demo: false })).toBe(false);
    expect(isArchivableFixtureVenture({})).toBe(false);
    expect(isArchivableFixtureVenture(null)).toBe(false);
    expect(isArchivableFixtureVenture({ name: 'Testify Analytics', is_demo: false })).toBe(false); // real name, no separator
  });
});

describe('selectCandidates — pure selection over plain arrays (FR-5)', () => {
  test('keeps only positively-classified fixtures; drops real + canary', () => {
    const rows = [
      { id: 'r1', name: 'Market Modeling SaaS', is_demo: false, status: 'cancelled' }, // real
      { id: 'r2', name: 'CronGenius', is_demo: false },                                // real
      { id: 'f1', name: '__e2e_probe', is_demo: false },                               // fixture
      { id: 'f2', name: 'Seed', is_demo: true },                                       // fixture flag
      { id: 'c1', name: CANARY_NAME, is_demo: true },                                  // canary — excluded
    ];
    const ids = selectCandidates(rows).map((v) => v.id);
    expect(ids).toEqual(['f1', 'f2']);
  });

  test('whyMatched distinguishes is_demo from name-pattern', () => {
    expect(whyMatched({ is_demo: true })).toBe('is_demo');
    expect(whyMatched({ name: '__e2e_x', is_demo: false })).toBe('name-pattern');
  });
});

describe('checkGuardrails — abort tripwires (FR-2)', () => {
  test('applications-row candidate → abort with offending ids', () => {
    const g = checkGuardrails([{ id: 'v1', name: '__e2e' }, { id: 'v2', name: 'TEST-x' }], ['v1'], DEFAULT_CEILING);
    expect(g.ok).toBe(false);
    expect(g.abortReason).toBe('applications_overlap');
    expect(g.offendingIds).toEqual(['v1']);
  });

  test('over-ceiling → abort', () => {
    const candidates = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const g = checkGuardrails(candidates, [], 2);
    expect(g.ok).toBe(false);
    expect(g.abortReason).toBe('over_ceiling');
  });

  test('empty set → explicit no-op (not a hard abort)', () => {
    const g = checkGuardrails([], [], DEFAULT_CEILING);
    expect(g.ok).toBe(false);
    expect(g.abortReason).toBe('empty');
    expect(g.offendingIds).toEqual([]);
  });

  test('clean set under ceiling with no applications overlap → ok', () => {
    const g = checkGuardrails([{ id: 'v1', name: '__e2e' }], ['other-venture'], DEFAULT_CEILING);
    expect(g.ok).toBe(true);
    expect(g.abortReason).toBeNull();
  });

  test('applications overlap takes precedence over ceiling', () => {
    const candidates = [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }];
    const g = checkGuardrails(candidates, ['v2'], 1); // both would trip; applications wins
    expect(g.abortReason).toBe('applications_overlap');
  });
});

describe('parseArgs — CLI defaults to dry-run (FR-2)', () => {
  test('no args → dry-run, default ceiling', () => {
    expect(parseArgs([])).toEqual({ apply: false, ceiling: DEFAULT_CEILING });
  });

  test('--apply flips to apply', () => {
    expect(parseArgs(['--apply']).apply).toBe(true);
  });

  test('--ceiling N overrides; invalid ignored', () => {
    expect(parseArgs(['--ceiling', '50']).ceiling).toBe(50);
    expect(parseArgs(['--ceiling', '-5']).ceiling).toBe(DEFAULT_CEILING);
    expect(parseArgs(['--ceiling']).ceiling).toBe(DEFAULT_CEILING);
  });
});
