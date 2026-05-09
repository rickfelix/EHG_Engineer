// QF-20260509-407: complete-quick-fix.js friction cluster.
//
// Three behaviors fixed (witnessed twice this session via QF-20260509-796 + QF-20260509-849):
//   A. Deletion-LOC accounting — compliance rubric subtracts pure-deletion-file LOC
//      from net-source-LOC for tier classification (loc_constraint + proper_classification).
//   B. --force-complete bypasses FAIL-verdict gate (parity with WARN branch).
//   C. --auto-pr CLI flag wired + auto-enabled under --non-interactive when no --pr-url.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { QUICKFIX_RUBRIC } = await import('../../../lib/quickfix-compliance-rubric.js');
const { validateCompliance } = await import(
  '../../../scripts/modules/complete-quick-fix/verification.js'
);

function findRule(id) {
  for (const cat of Object.values(QUICKFIX_RUBRIC)) {
    const found = cat.criteria?.find(c => c.id === id);
    if (found) return found;
  }
  throw new Error(`Rule not found: ${id}`);
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ── Bug A: deletion-LOC accounting ──────────────────────────────────────

describe('QF-20260509-407 Bug A: loc_constraint subtracts sourceDeletionLoc', () => {
  const rule = findRule('loc_constraint');

  it('passes when net source (source - deletion) is under 75, even if raw source is well over', async () => {
    // Witnessed shape: QF-20260509-796 deleted a 712-LOC dead duplicate file +
    // ~19 LOC of edits = source=731, deletionLoc=712, net=19.
    const r = await rule.check({
      actualSourceLoc: 731,
      actualTestLoc: 0,
      sourceDeletionLoc: 712
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(10);
    expect(r.evidence).toMatch(/Source LOC:\s*19/);
    expect(r.evidence).toMatch(/deletion-only LOC:\s*712.*excluded/);
  });

  it('fails when net source > 75 even when deletion subtraction applies', async () => {
    const r = await rule.check({
      actualSourceLoc: 200,
      sourceDeletionLoc: 50
    });
    expect(r.passed).toBe(false);
    expect(r.evidence).toMatch(/Source LOC:\s*150/);
  });

  it('omits deletion-only suffix when sourceDeletionLoc is 0 or undefined (backward compat)', async () => {
    const r1 = await rule.check({ actualSourceLoc: 25, actualTestLoc: 110 });
    expect(r1.evidence).not.toMatch(/deletion-only/);
    expect(r1.evidence).toMatch(/Source LOC:\s*25/);

    const r2 = await rule.check({ actualSourceLoc: 25, sourceDeletionLoc: 0 });
    expect(r2.evidence).not.toMatch(/deletion-only/);
  });

  it('clamps net source LOC at 0 when deletion exceeds source (defense, not a real shape)', async () => {
    const r = await rule.check({ actualSourceLoc: 50, sourceDeletionLoc: 100 });
    expect(r.passed).toBe(true);
    expect(r.evidence).toMatch(/Source LOC:\s*0/);
  });
});

describe('QF-20260509-407 Bug A: proper_classification subtracts sourceDeletionLoc', () => {
  const rule = findRule('proper_classification');

  it('does NOT flag escalation when net source <= 75 even when raw source is well over', async () => {
    const r = await rule.check({
      actualSourceLoc: 731,
      sourceDeletionLoc: 712,
      filesChanged: ['scripts/foo.js']
    });
    expect(r.passed).toBe(true);
    expect(r.evidence).not.toMatch(/source LOC >75/);
  });

  it('flags escalation when net source > 75', async () => {
    const r = await rule.check({
      actualSourceLoc: 200,
      sourceDeletionLoc: 50,
      filesChanged: ['scripts/foo.js']
    });
    expect(r.passed).toBe(false);
    expect(r.evidence).toMatch(/source LOC >75/);
  });
});

// ── Bug B: --force-complete bypasses FAIL-verdict ──────────────────────────

describe('QF-20260509-407 Bug B: validateCompliance honors {forceComplete} on FAIL verdict', () => {
  const failResults = {
    verdict: 'FAIL',
    totalScore: 51,
    confidence: 51,
    criteriaResults: [
      { name: 'LOC Constraint Met (≤75 source)', score: 0, maxScore: 10, passed: false, evidence: 'Source LOC: 724 (limit: 75)' },
      { name: 'Properly Classified', score: 0, maxScore: 5, passed: false, evidence: 'Should escalate: source LOC >75' }
    ]
  };

  it('FAIL verdict WITHOUT forceComplete returns false (baseline regression check)', async () => {
    const prompt = vi.fn(() => { throw new Error('prompt should not be called on FAIL'); });
    const r = await validateCompliance(failResults, prompt);
    expect(r).toBe(false);
  });

  it('FAIL verdict WITH forceComplete:true short-circuits and returns true (the fix)', async () => {
    const prompt = vi.fn(() => { throw new Error('prompt MUST NOT be called when forceComplete:true'); });
    const r = await validateCompliance(failResults, prompt, {
      forceComplete: true,
      reason: 'Tier-1 deletion-only — pre-existing failures unrelated'
    });
    expect(r).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('FAIL verdict WITH forceComplete:true logs the bypass reason for audit', async () => {
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));
    const prompt = vi.fn(() => { throw new Error('prompt should not be called'); });
    await validateCompliance(failResults, prompt, {
      forceComplete: true,
      reason: 'audited FAIL bypass'
    });
    const audit = logs.find(l => l.includes('--force-complete') && l.includes('FAIL-verdict') && l.includes('audited FAIL bypass'));
    expect(audit).toBeTruthy();
  });

  it('FAIL verdict WITH forceComplete:false still hard-blocks (does not bypass)', async () => {
    const prompt = vi.fn(() => { throw new Error('prompt should not be called'); });
    const r = await validateCompliance(failResults, prompt, { forceComplete: false });
    expect(r).toBe(false);
  });

  it('FAIL verdict still logs the failed criteria before bypass (audit completeness)', async () => {
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));
    const prompt = vi.fn();
    await validateCompliance(failResults, prompt, { forceComplete: true, reason: 'r' });
    const sawCriteria = logs.find(l => l.includes('LOC Constraint Met'));
    expect(sawCriteria).toBeTruthy();
  });
});

// ── Bug C: --auto-pr CLI flag + auto-enable under --non-interactive ────────

describe('QF-20260509-407 Bug C: --auto-pr flag wired in cli.js', () => {
  const cliPath = resolve(__dirname, '../../../scripts/modules/complete-quick-fix/cli.js');

  it('cli.js declares --auto-pr in the parseArgs options', () => {
    const src = readFileSync(cliPath, 'utf8');
    expect(src).toMatch(/'auto-pr':\s*\{\s*type:\s*'boolean'\s*\}/);
  });

  it('cli.js exports autoPr in the options object', () => {
    const src = readFileSync(cliPath, 'utf8');
    expect(src).toMatch(/autoPr:\s*values\['auto-pr'\]/);
  });

  it('autoPr auto-enables under --non-interactive when no --pr-url provided', () => {
    const src = readFileSync(cliPath, 'utf8');
    // pattern: autoPr: values['auto-pr'] || (values['non-interactive'] && !values['pr-url']) || false
    expect(src).toMatch(/autoPr:[^,\n]*non-interactive[^,\n]*pr-url/);
  });

  it('--auto-pr appears in the displayHelp output (discoverability)', () => {
    const src = readFileSync(cliPath, 'utf8');
    expect(src).toMatch(/--auto-pr\s+Auto-create the PR/);
  });
});

// ── countLocBySplit returns sourceDeletionLoc field ────────────────────────

describe('QF-20260509-407 Bug A: countLocBySplit signature includes sourceDeletionLoc', () => {
  const gitOpsPath = resolve(__dirname, '../../../scripts/modules/complete-quick-fix/git-operations.js');

  it('countLocBySplit initializes sourceDeletionLoc in the result object', () => {
    const src = readFileSync(gitOpsPath, 'utf8');
    expect(src).toMatch(/result\s*=\s*\{[^}]*sourceDeletionLoc:\s*0/);
  });

  it('countLocBySplit reads git diff --name-status --diff-filter=D for deleted-file detection', () => {
    const src = readFileSync(gitOpsPath, 'utf8');
    expect(src).toMatch(/git diff --name-status --diff-filter=D/);
  });

  it('countLocBySplit accumulates sourceDeletionLoc when file is in deletedPaths set', () => {
    const src = readFileSync(gitOpsPath, 'utf8');
    expect(src).toMatch(/result\.sourceDeletionLoc\s*\+=/);
  });

  it('autoDetectGitInfo forwards sourceDeletionLoc on both PR-metadata and legacy paths', () => {
    const src = readFileSync(gitOpsPath, 'utf8');
    const matches = src.match(/result\.sourceDeletionLoc\s*=\s*split\.sourceDeletionLoc/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2); // PR + legacy paths
  });

  it('orchestrator.js destructures sourceDeletionLoc from gitInfo and forwards to compliance', () => {
    const orchPath = resolve(__dirname, '../../../scripts/modules/complete-quick-fix/orchestrator.js');
    const src = readFileSync(orchPath, 'utf8');
    expect(src).toMatch(/let\s*\{[^}]*sourceDeletionLoc[^}]*\}\s*=\s*gitInfo/);
    expect(src).toMatch(/sourceDeletionLoc[,\s]/); // also forwarded into complianceContext
  });
});

// ── File existence guard (regression-pin) ──────────────────────────────────

describe('QF-20260509-407: source files unchanged location', () => {
  it('cli.js, verification.js, compliance-loop.js, git-operations.js, orchestrator.js all exist at canonical paths', () => {
    const base = resolve(__dirname, '../../../scripts/modules/complete-quick-fix');
    for (const f of ['cli.js', 'verification.js', 'compliance-loop.js', 'git-operations.js', 'orchestrator.js']) {
      expect(existsSync(resolve(base, f)), `${f} should exist`).toBe(true);
    }
    expect(existsSync(resolve(__dirname, '../../../lib/quickfix-compliance-rubric.js'))).toBe(true);
  });
});
