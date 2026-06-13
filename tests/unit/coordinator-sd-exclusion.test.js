/**
 * SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001 — backlog-rank exclusion hardening.
 *
 * Pins the shared classifiers AND the production-used predicates that the ranker
 * (coordinator-backlog-rank.mjs) and the forecaster (coordinator-capacity-forecast.mjs)
 * call, so a regression that reverts the regex, removes the bare-shell sort key, or
 * deletes a forecaster exclusion is caught:
 *   - isFixtureSd: epoch-stamped UAT keys + metadata.is_fixture, no mid-word over-match
 *   - isBareShell: stub SDs (description empty or equal to title)
 *   - isExcludedFromBelt / bareShellLastCompare: the REAL functions the scripts call
 * Hardened after adversarial review (the unanchored regex over-excluded LATEST/FASTEST keys,
 * and the prior ranking test re-implemented the sort locally).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isFixtureSd,
  isBareShell,
  isExcludedFromBelt,
  bareShellLastCompare,
  isStartedSd,
  FIXTURE_RE,
} from '../../lib/coordinator/sd-exclusion.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RANKER = resolve(__dirname, '../../scripts/coordinator-backlog-rank.mjs');
const FORECASTER = resolve(__dirname, '../../scripts/coordinator-capacity-forecast.mjs');

describe('isFixtureSd — fixture inclusion', () => {
  it('excludes the witnessed epoch-stamped UAT fixture keys (the b5f21465 gap)', () => {
    expect(isFixtureSd('SD-UAT-FIX-TEST-E2E-1781186358703-001')).toBe(true);
    expect(isFixtureSd('SD-UAT-FIX-TEST-E2E-1781186358703-002')).toBe(true);
  });

  it('still excludes the legacy fixture prefixes', () => {
    expect(isFixtureSd('SD-LEO-FEAT-TEST-E2E-foo')).toBe(true);
    expect(isFixtureSd('SD-TEST-SOMETHING')).toBe(true);
    expect(isFixtureSd('SD-DEMO-X')).toBe(true);
    expect(isFixtureSd('SD-SWITCH-OLD-1')).toBe(true);
  });

  it('honors a STRICT metadata.is_fixture === true marker only', () => {
    expect(isFixtureSd('SD-MAN-INFRA-WHATEVER-001', { is_fixture: true })).toBe(true);
    expect(isFixtureSd('SD-MAN-INFRA-WHATEVER-001', { is_fixture: false })).toBe(false);
    // strict === true is load-bearing: a coincidentally-truthy value must NOT demote real work
    expect(isFixtureSd('SD-MAN-INFRA-WHATEVER-001', { is_fixture: 'true' })).toBe(false);
    expect(isFixtureSd('SD-MAN-INFRA-WHATEVER-001', { is_fixture: 1 })).toBe(false);
    expect(isFixtureSd('SD-MAN-INFRA-WHATEVER-001', { is_fixture: {} })).toBe(false);
  });
});

describe('isFixtureSd — no over-exclusion of real work (adversarial-review hardening)', () => {
  it('does NOT exclude normally-authored SDs', () => {
    expect(isFixtureSd('SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001')).toBe(false);
    expect(isFixtureSd('SD-MAN-INFRA-GATE-BAR-REGIME-001')).toBe(false);
    expect(isFixtureSd('SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-D')).toBe(false);
  });

  it('does NOT match mid-word: a segment ending in TEST followed by E2E-<epoch>', () => {
    // The original unanchored /TEST-E2E-\d{10,}/ wrongly matched the "TEST" tail of these.
    expect(isFixtureSd('SD-FEAT-LATEST-E2E-1718000000')).toBe(false);
    expect(isFixtureSd('SD-PERF-FASTEST-E2E-2026010100')).toBe(false);
    expect(isFixtureSd('SD-FEAT-GREATEST-E2E-1234567890')).toBe(false);
    expect(isFixtureSd('SD-QA-PROTEST-E2E-9999999999')).toBe(false);
    expect(isFixtureSd('SD-QA-CONTEST-E2E-1000000000')).toBe(false);
  });

  it('still matches a STANDALONE epoch-stamped TEST-E2E segment regardless of prefix', () => {
    expect(isFixtureSd('SD-ANYPREFIX-TEST-E2E-1781186358703-001')).toBe(true);
  });

  it('pins the 10-digit epoch floor at the 9/10 seam', () => {
    expect(FIXTURE_RE.test('SD-FEAT-TEST-E2E-2')).toBe(false);              // 1 digit
    expect(isFixtureSd('SD-FEAT-TEST-E2E-123456789-001')).toBe(false);     // 9 digits — below floor
    expect(isFixtureSd('SD-FEAT-TEST-E2E-1234567890-001')).toBe(true);     // 10 digits — at floor
  });

  it('documents the reserved-prefix + case-sensitivity contract', () => {
    // SD-(TEST|DEMO|SWITCH-OLD)-* are RESERVED for fixtures; a real venture must not use them.
    expect(isFixtureSd('SD-DEMO-GRAPH-FEATURE-001')).toBe(true);
    // keys are UPPERCASE by DB convention; the regex is intentionally case-sensitive.
    expect(isFixtureSd('sd-uat-fix-test-e2e-1781186358703-001')).toBe(false);
  });

  it('fails open on malformed input (never excludes real work on a quirk)', () => {
    expect(isFixtureSd(null)).toBe(false);
    expect(isFixtureSd(undefined)).toBe(false);
    expect(isFixtureSd(12345)).toBe(false);
    expect(isFixtureSd('')).toBe(false);
    expect(isFixtureSd('SD-X', null)).toBe(false);
    expect(isFixtureSd('SD-X', 'not-an-object')).toBe(false);
    expect(isFixtureSd('SD-X', 42)).toBe(false);
  });
});

describe('isBareShell', () => {
  it('flags a description equal to the title (the GATE-BAR-REGIME witness)', () => {
    const title = 'backlog-rank exclusion hardening: bare-shell demotion';
    expect(isBareShell({ title, description: title })).toBe(true);
    expect(isBareShell({ title, description: `  ${title}  ` })).toBe(true); // whitespace-only diff
  });

  it('flags an empty or whitespace-only description', () => {
    expect(isBareShell({ title: 'X', description: '' })).toBe(true);
    expect(isBareShell({ title: 'X', description: '   \n\t ' })).toBe(true);
    expect(isBareShell({ title: 'X', description: null })).toBe(true);
    expect(isBareShell({ title: 'X' })).toBe(true);
  });

  it('does NOT flag a genuinely authored SD', () => {
    expect(isBareShell({ title: 'Short title', description: 'A real, distinct, multi-sentence strategic description that is clearly not the title.' })).toBe(false);
  });

  it('fails open on malformed input', () => {
    expect(isBareShell(null)).toBe(false);
    expect(isBareShell(undefined)).toBe(false);
    expect(isBareShell('not an object')).toBe(false);
    expect(isBareShell(42)).toBe(false);
  });
});

describe('bareShellLastCompare — the REAL ranker comparator key', () => {
  const authored = { sd_key: 'SD-A', title: 'A', description: 'A real description.' };
  const shell = { sd_key: 'SD-B', title: 'B', description: 'B' };

  it('sorts a bare-shell SD after an authored SD', () => {
    expect(bareShellLastCompare(authored, shell)).toBeLessThan(0);
    expect(bareShellLastCompare(shell, authored)).toBeGreaterThan(0);
  });

  it('returns 0 when both sides have equal bare-shell status (caller falls through)', () => {
    expect(bareShellLastCompare(authored, { sd_key: 'SD-C', title: 'C', description: 'Another real one.' })).toBe(0);
    expect(bareShellLastCompare(shell, { sd_key: 'SD-D', title: 'D', description: 'D' })).toBe(0);
  });

  it('used as the dominant key, a bare-shell never ranks above an authored SD', () => {
    const ranked = [shell, authored].sort(bareShellLastCompare);
    expect(ranked.map(s => s.sd_key)).toEqual(['SD-A', 'SD-B']);
  });
});

describe('isExcludedFromBelt — the REAL forecaster belt predicate', () => {
  it('excludes fixtures (epoch key or metadata.is_fixture) from belt', () => {
    expect(isExcludedFromBelt({ sd_key: 'SD-UAT-FIX-TEST-E2E-1781186358703-001', metadata: {} })).toBe(true);
    expect(isExcludedFromBelt({ sd_key: 'SD-REAL-001', metadata: { is_fixture: true } })).toBe(true);
  });

  it('excludes bare-shell stubs from belt (they cannot pass LEAD-TO-PLAN)', () => {
    expect(isExcludedFromBelt({ sd_key: 'SD-STUB-001', title: 'Stub', description: 'Stub', metadata: {} })).toBe(true);
    expect(isExcludedFromBelt({ sd_key: 'SD-STUB-002', title: 'Stub', description: '', metadata: {} })).toBe(true);
  });

  it('keeps a real authored, non-fixture SD in belt', () => {
    expect(isExcludedFromBelt({ sd_key: 'SD-REAL-001', title: 'Real', description: 'A genuine description distinct from the title.', metadata: {} })).toBe(false);
  });

  it('fails open on malformed input', () => {
    expect(isExcludedFromBelt(null)).toBe(false);
    expect(isExcludedFromBelt('x')).toBe(false);
  });
});

// SD-FDBK-INFRA-SHARED-FLEET-WORKER-001 (bug d5e59236): in-flight (started) guard.
describe('isStartedSd — the REAL ranker in-flight guard', () => {
  it('flags an SD past the initial LEAD draft as started (must not be fresh-ranked)', () => {
    expect(isStartedSd({ current_phase: 'PLAN_PRD' })).toBe(true);
    expect(isStartedSd({ current_phase: 'EXEC' })).toBe(true);
    expect(isStartedSd({ current_phase: 'PLAN_VERIFICATION' })).toBe(true);
    expect(isStartedSd({ current_phase: 'LEAD_FINAL' })).toBe(true);
    expect(isStartedSd({ current_phase: ' EXEC ' })).toBe(true); // trimmed
  });

  it('does NOT flag a fresh LEAD-draft (or unset phase) SD — these stay fresh-rankable', () => {
    expect(isStartedSd({ current_phase: 'LEAD' })).toBe(false);
    expect(isStartedSd({ current_phase: '' })).toBe(false);
    expect(isStartedSd({ current_phase: '   ' })).toBe(false);
    expect(isStartedSd({})).toBe(false); // phase column absent → treat as fresh
  });

  it('fails OPEN on garbage input (never drops a real fresh leaf)', () => {
    expect(isStartedSd(null)).toBe(false);
    expect(isStartedSd(undefined)).toBe(false);
    expect(isStartedSd('LEAD')).toBe(false);
    expect(isStartedSd({ current_phase: 42 })).toBe(false);
  });
});

describe('production wiring guards (catch call-site deletion)', () => {
  const rankerSrc = readFileSync(RANKER, 'utf8');
  const forecasterSrc = readFileSync(FORECASTER, 'utf8');

  it('the ranker imports and applies the fixture skip + bare-shell comparator', () => {
    expect(rankerSrc).toMatch(/from '\.\.\/lib\/coordinator\/sd-exclusion\.mjs'/);
    expect(rankerSrc).toContain('isFixtureSd(d.sd_key, d.metadata)');
    expect(rankerSrc).toContain('bareShellLastCompare(a, b)');
  });

  it('the ranker imports and applies the in-flight (started) guard', () => {
    expect(rankerSrc).toContain('isStartedSd');
    expect(rankerSrc).toContain('isStartedSd(d)');
  });

  it('the forecaster imports and applies the belt exclusion', () => {
    expect(forecasterSrc).toMatch(/from '\.\.\/lib\/coordinator\/sd-exclusion\.mjs'/);
    expect(forecasterSrc).toContain('isExcludedFromBelt(d)');
  });

  it('both scripts SELECT the columns their classifiers read', () => {
    // bare-shell needs title+description; is_fixture needs metadata.
    expect(rankerSrc).toMatch(/select\([^)]*title[^)]*description[^)]*metadata/s);
    expect(forecasterSrc).toMatch(/select\([^)]*title[^)]*description[^)]*metadata/s);
  });

  it('the ranker SELECTs current_phase for the in-flight guard', () => {
    expect(rankerSrc).toMatch(/select\([^)]*current_phase/s);
  });
});
