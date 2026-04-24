/**
 * Integration tests for SD-LEO-INFRA-CROSS-FILE-OVERLAP-001.
 *
 * Covers:
 *   FR-1   resurrected `cross-sd-consistency-validation.js` extractors
 *   FR-3   --acknowledge-cross-sd-overlap + --ack-reason flag parsing
 *   FR-4   high-risk registry pattern matching
 *   FR-5   metadata writer entry shape
 *   FR-6   retro-replay harness against historical fixtures
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  buildOverlapEntry,
  classifyOverlap,
  decideVerdict,
  extractChangedFiles,
  extractTargetFiles,
  isHighRisk,
  parseAckFlags,
  validatePrdShape,
} from '../../../lib/cross-sd-overlap.js';
import { _resetCache, getHighRiskPatterns, getWindowMs } from '../../../lib/config/cross-sd-config.js';

beforeAll(() => {
  _resetCache();
});

describe('FR-1 — extractTargetFiles + validatePrdShape', () => {
  it('extracts file paths from a realistic PRD shape', () => {
    const prd = {
      implementation_approach: 'Modify scripts/handoff.js and lib/gates/foo.js',
      system_architecture: 'New file: scripts/modules/handoff/executors/plan-to-exec/gates/cross-sd-file-overlap-temporal.js',
      technical_context: '',
      functional_requirements: [{ description: 'Wire CLAUDE.md updates' }],
    };
    const files = extractTargetFiles(prd);
    expect(files.size).toBeGreaterThan(0);
    expect([...files].some(f => f.endsWith('handoff.js'))).toBe(true);
  });

  it('returns an empty set for an empty PRD', () => {
    const files = extractTargetFiles({});
    expect(files.size).toBe(0);
  });

  it('flags null/undefined PRD shapes', () => {
    expect(validatePrdShape(null).valid).toBe(false);
    expect(validatePrdShape(undefined).valid).toBe(false);
    expect(validatePrdShape('hello').valid).toBe(false);
    expect(validatePrdShape({}).valid).toBe(true);
    expect(validatePrdShape({ implementation_approach: 'x' }).valid).toBe(true);
  });
});

describe('FR-1 — extractChangedFiles', () => {
  it('parses git-diff-style newline output', () => {
    const out = 'a/file1.js\nb/file2.ts\n\n  c/file3.json  \n';
    const files = extractChangedFiles(out);
    expect(files).toEqual(['a/file1.js', 'b/file2.ts', 'c/file3.json']);
  });
  it('returns [] on empty/non-string input', () => {
    expect(extractChangedFiles('')).toEqual([]);
    expect(extractChangedFiles(null)).toEqual([]);
    expect(extractChangedFiles(undefined)).toEqual([]);
    expect(extractChangedFiles(42)).toEqual([]);
  });
});

describe('FR-3 — parseAckFlags', () => {
  it('returns acknowledged=false when flag absent', () => {
    expect(parseAckFlags(['--bypass-validation'])).toEqual({ acknowledged: false, reason: null, ticketRefValid: false });
  });
  it('detects flag without reason', () => {
    const r = parseAckFlags(['--acknowledge-cross-sd-overlap']);
    expect(r.acknowledged).toBe(true);
    expect(r.reason).toBe(null);
    expect(r.ticketRefValid).toBe(false);
  });
  it('detects flag + reason without ticket reference', () => {
    const r = parseAckFlags(['--acknowledge-cross-sd-overlap', '--ack-reason', 'just trust me']);
    expect(r.acknowledged).toBe(true);
    expect(r.reason).toBe('just trust me');
    expect(r.ticketRefValid).toBe(false);
  });
  it('validates SD-/QF-/PAT-/#issue prefixes in reason', () => {
    expect(parseAckFlags(['--acknowledge-cross-sd-overlap', '--ack-reason', 'SD-FOO-001 coordinated']).ticketRefValid).toBe(true);
    expect(parseAckFlags(['--acknowledge-cross-sd-overlap', '--ack-reason', 'QF-20260424-001 hotfix']).ticketRefValid).toBe(true);
    expect(parseAckFlags(['--acknowledge-cross-sd-overlap', '--ack-reason', 'fixes #1234']).ticketRefValid).toBe(true);
    expect(parseAckFlags(['--acknowledge-cross-sd-overlap', '--ack-reason', 'PAT-RETRO-001 known']).ticketRefValid).toBe(true);
  });
  it('handles non-array argv defensively', () => {
    expect(parseAckFlags(null)).toEqual({ acknowledged: false, reason: null, ticketRefValid: false });
  });
});

describe('FR-4 — high-risk registry + isHighRisk', () => {
  it('loads built-in patterns when config file missing', () => {
    _resetCache();
    const patterns = getHighRiskPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns).toContain('CLAUDE.md');
  });
  it('matches known high-risk paths', () => {
    expect(isHighRisk('scripts/modules/sd-key-generator.js')).toBe(true);
    expect(isHighRisk('scripts/modules/handoff/executors/foo/bar.js')).toBe(true);
    expect(isHighRisk('CLAUDE.md')).toBe(true);
    expect(isHighRisk('database/migrations/001_init.sql')).toBe(true);
    expect(isHighRisk('lib/auth/session.js')).toBe(true);
  });
  it('does NOT match medium-risk paths', () => {
    expect(isHighRisk('docs/plans/foo.md')).toBe(false);
    expect(isHighRisk('scripts/sd-next.js')).toBe(false);
    expect(isHighRisk('lib/prd/formatter.js')).toBe(false);
    expect(isHighRisk('tests/unit/sample.test.js')).toBe(false);
  });
});

describe('FR-4 — classifyOverlap', () => {
  it('separates high vs medium risk files', () => {
    const overlap = ['scripts/sd-next.js', 'scripts/handoff.js', 'docs/plans/foo.md'];
    const { high, medium } = classifyOverlap(overlap);
    expect(high).toEqual(['scripts/handoff.js']);
    expect(medium).toEqual(['scripts/sd-next.js', 'docs/plans/foo.md']);
  });
});

describe('window config', () => {
  it('respects CROSS_SD_WINDOW_HOURS env var', () => {
    const original = process.env.CROSS_SD_WINDOW_HOURS;
    process.env.CROSS_SD_WINDOW_HOURS = '24';
    expect(getWindowMs()).toBe(24 * 3_600_000);
    process.env.CROSS_SD_WINDOW_HOURS = '0';
    expect(getWindowMs()).toBe(0);
    process.env.CROSS_SD_WINDOW_HOURS = original ?? '';
    if (!original) delete process.env.CROSS_SD_WINDOW_HOURS;
  });
});

describe('FR-5 — buildOverlapEntry', () => {
  it('produces a structured entry per FR-5 schema', () => {
    const e = buildOverlapEntry({
      phase: 'PLAN-TO-EXEC',
      collidingSdKey: 'SD-FOO-001',
      overlappingFiles: ['x.js', 'y.js'],
      riskTier: 'medium',
      verdict: 'WARN',
      acknowledgedAt: null,
      ackReason: null,
    });
    expect(e).toMatchObject({
      phase: 'PLAN-TO-EXEC',
      colliding_sd_key: 'SD-FOO-001',
      overlapping_files: ['x.js', 'y.js'],
      risk_tier: 'medium',
      verdict: 'WARN',
      acknowledged_at: null,
      ack_reason: null,
    });
    expect(typeof e.checked_at).toBe('string');
  });
});

describe('decideVerdict', () => {
  it('returns PASS / risk_tier=none for empty entries', () => {
    expect(decideVerdict([], { acknowledged: false })).toEqual({ verdict: 'PASS', risk_tier: 'none' });
  });
  it('returns FAIL when any high-risk overlap present', () => {
    const r = decideVerdict([{ risk_tier: 'high' }, { risk_tier: 'medium' }], { acknowledged: true, reason: 'SD-X', ticketRefValid: true });
    expect(r.verdict).toBe('FAIL');
  });
  it('returns WARN for medium-risk overlap with no ack', () => {
    expect(decideVerdict([{ risk_tier: 'medium' }], { acknowledged: false }).verdict).toBe('WARN');
  });
  it('returns PASS for medium-risk overlap with valid ticketed ack', () => {
    expect(decideVerdict([{ risk_tier: 'medium' }], { acknowledged: true, reason: 'SD-FOO-001 ok', ticketRefValid: true }).verdict).toBe('PASS');
  });
  it('returns WARN when ack lacks ticket reference (FR-3 ticketed reason)', () => {
    expect(decideVerdict([{ risk_tier: 'medium' }], { acknowledged: true, reason: 'just because', ticketRefValid: false }).verdict).toBe('WARN');
  });
});

/**
 * FR-6 — Retro-replay harness.
 *
 * Each fixture exercises the gate decision pipeline using *synthetic* file
 * lists derived from publicly-documented historical SD pairs. The data is
 * intentionally local to this test (no DB calls) so the harness can run on
 * any developer machine without seeded state.
 */
describe('FR-6 — retro-replay fixtures', () => {
  const fixtures = [
    {
      name: 'fixture-1: ENFORCEMENT-001 × E2E-REGRESSION-TEST-001',
      currentFiles: new Set(['scripts/modules/sd-key-generator.js']),
      otherFiles: new Set(['scripts/modules/sd-key-generator.js']),
      expectedVerdict: 'FAIL',
      ackState: { acknowledged: false },
    },
    {
      name: 'fixture-2: PR #3301 × PR #3299 (sd-start.js)',
      currentFiles: new Set(['scripts/sd-start.js']),
      otherFiles: new Set(['scripts/sd-start.js']),
      expectedVerdict: 'FAIL', // sd-start.js IS in the registry
      ackState: { acknowledged: false },
    },
    {
      name: 'fixture-3: PR #3296 × PR #3295 (CLAUDE.md)',
      currentFiles: new Set(['CLAUDE.md']),
      otherFiles: new Set(['CLAUDE.md']),
      expectedVerdict: 'FAIL',
      ackState: { acknowledged: false },
    },
    {
      name: 'fixture-4: PR #3293 × PR #3291 (CLAUDE.md + migrations)',
      currentFiles: new Set(['CLAUDE.md', 'database/migrations/2026_04_24_x.sql']),
      otherFiles: new Set(['CLAUDE.md', 'database/migrations/2026_04_24_x.sql']),
      expectedVerdict: 'FAIL',
      ackState: { acknowledged: false },
    },
    {
      name: 'fixture-5: PR #3284 × PR #3283 (handoff executor)',
      currentFiles: new Set(['scripts/modules/handoff/executors/lead-to-plan/gates/foo.js']),
      otherFiles: new Set(['scripts/modules/handoff/executors/lead-to-plan/gates/foo.js']),
      expectedVerdict: 'FAIL',
      ackState: { acknowledged: false },
    },
    {
      name: 'fixture-6 (negative): unrelated SDs do not collide',
      currentFiles: new Set(['lib/feature-x.js']),
      otherFiles: new Set(['lib/feature-y.js']),
      expectedVerdict: 'PASS',
      ackState: { acknowledged: false },
    },
    {
      name: 'fixture-7 (medium-risk passes when properly acknowledged)',
      currentFiles: new Set(['docs/plans/cross-sd-overlap-gate-plan.md']),
      otherFiles: new Set(['docs/plans/cross-sd-overlap-gate-plan.md']),
      expectedVerdict: 'PASS',
      ackState: { acknowledged: true, reason: 'SD-FOO-001 coordinated', ticketRefValid: true },
    },
    {
      name: 'fixture-8 (medium-risk WARNs without ack)',
      currentFiles: new Set(['docs/plans/cross-sd-overlap-gate-plan.md']),
      otherFiles: new Set(['docs/plans/cross-sd-overlap-gate-plan.md']),
      expectedVerdict: 'WARN',
      ackState: { acknowledged: false },
    },
  ];

  for (const fx of fixtures) {
    it(fx.name, () => {
      const overlap = [...fx.currentFiles].filter(f => fx.otherFiles.has(f));
      const entries = [];
      if (overlap.length > 0) {
        const { high, medium } = classifyOverlap(overlap);
        const riskTier = high.length > 0 ? 'high' : medium.length > 0 ? 'medium' : 'low';
        entries.push(buildOverlapEntry({
          phase: 'PLAN-TO-EXEC',
          collidingSdKey: 'fixture',
          overlappingFiles: overlap,
          riskTier,
          verdict: 'PENDING',
        }));
      }
      const decision = decideVerdict(entries, fx.ackState);
      expect(decision.verdict).toBe(fx.expectedVerdict);
    });
  }
});
