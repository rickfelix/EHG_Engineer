/**
 * Regression tests: Opus 4.7 Harness Alignment (SD-LEO-FIX-PLAN-OPUS-HARNESS-001)
 *
 * Asserts that the generated CLAUDE.md family reflects all Module A, B, F, G
 * changes. Runs against the on-disk artifacts produced by
 * `node scripts/generate-claude-md-from-db.js`; failure means either the
 * migration, the generator code, or the regen step was skipped.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), '..', '..');

const read = (name) => readFileSync(resolve(repoRoot, name), 'utf8');

describe('Opus 4.7 Harness Alignment — generator output', () => {
  let claudeMd;
  let claudeCore;
  let claudeLead;
  let claudePlan;
  let claudeExec;

  beforeAll(() => {
    claudeMd   = read('CLAUDE.md');
    claudeCore = read('CLAUDE_CORE.md');
    claudeLead = read('CLAUDE_LEAD.md');
    claudePlan = read('CLAUDE_PLAN.md');
    claudeExec = read('CLAUDE_EXEC.md');
  });

  describe('Module A — hedge audit', () => {
    test('A1: session-prologue gate-pass-rate hedge removed', () => {
      expect(claudeMd).not.toContain('Target gate pass rate varies by SD type (60-90%, typically 85%)');
      expect(claudeMd).toContain('Target gate pass rate: 85%. SD-type overrides');
    });

    test('A2: sub-agent rule escalated to handoff-blocker language', () => {
      expect(claudeMd).not.toContain('**Use sub-agents** - Architect, QA, Reviewer - summarize outputs');
      expect(claudeMd).toContain('**Sub-agent evidence required at every handoff**');
      expect(claudeMd).toContain('SUBAGENT_EVIDENCE_MISSING');
    });

    test('A3: PR-size rule has no "ideal" hedge', () => {
      expect(claudeMd).not.toContain('≤100 LOC ideal');
      expect(claudeMd).toContain('≤100 LOC target');
    });

    test('A4: LEAD quick-fix recommendation is no longer "Consider"', () => {
      expect(claudeLead).not.toContain('Consider using /quick-fix to reduce overhead');
      expect(claudeLead).toContain('Use /quick-fix to reduce overhead');
    });

    test('A5: PLAN multi-perspective preamble no longer hedges', () => {
      expect(claudePlan).not.toContain('consider launching multiple `Plan` agents');
      expect(claudePlan).toContain('launch `Plan` agents to explore different approaches when the criteria below apply');
    });
  });

  describe('Module B — canonical pause points', () => {
    test('top-of-file pause-points block is present', () => {
      expect(claudeMd).toContain('## Canonical Pause Points — THE ONLY REASONS TO STOP');
      expect(claudeMd).toContain('If your reason for pausing is not on the five-point list above, KEEP WORKING');
    });

    test('block appears before Issue Resolution (router positioning invariant)', () => {
      const pausePos   = claudeMd.indexOf('## Canonical Pause Points — THE ONLY REASONS TO STOP');
      const issuePos   = claudeMd.indexOf('## Issue Resolution');
      expect(pausePos).toBeGreaterThan(0);
      expect(issuePos).toBeGreaterThan(pausePos);
    });

    test('AUTO-PROCEED Mode section points at the top block instead of inlining its own list', () => {
      expect(claudeMd).toContain('**Canonical Pause Points**: see the enumerated list near the top of this file');
      // The old inline block header must no longer appear INSIDE AUTO-PROCEED Mode —
      // we keep the top block's header only.
      const autoIdx = claudeMd.indexOf('## AUTO-PROCEED Mode');
      const sdContIdx = claudeMd.indexOf('## SD Continuation');
      expect(autoIdx).toBeGreaterThan(0);
      expect(sdContIdx).toBeGreaterThan(autoIdx);
      const autoSlice = claudeMd.slice(autoIdx, sdContIdx);
      expect(autoSlice).not.toContain('**Canonical Pause Points** (applies to AUTO-PROCEED');
    });
  });

  describe('Module G — session mode declaration', () => {
    test('Session Mode Declaration header present in CLAUDE.md', () => {
      expect(claudeMd).toContain('## Session Mode Declaration');
      expect(claudeMd).toContain('`[MODE: product]`');
      expect(claudeMd).toContain('`[MODE: campaign]`');
    });

    test('Session Mode Declaration sits between AUTO-PROCEED Mode and SD Continuation', () => {
      const autoIdx  = claudeMd.indexOf('## AUTO-PROCEED Mode');
      const modeIdx  = claudeMd.indexOf('## Session Mode Declaration');
      const sdContIdx = claudeMd.indexOf('## SD Continuation');
      expect(autoIdx).toBeLessThan(modeIdx);
      expect(modeIdx).toBeLessThan(sdContIdx);
    });

    test('harness-backlog.md exists and is referenced by [MODE: product]', () => {
      const backlog = read('docs/harness-backlog.md');
      expect(backlog).toContain('# Harness Backlog');
      expect(claudeMd).toContain('docs/harness-backlog.md');
    });
  });

  describe('Module F — phase effort tags', () => {
    test('CLAUDE_CORE.md has medium effort tag', () => {
      expect(claudeCore).toMatch(/\*\*Effort\*\*: medium/);
    });
    test('CLAUDE_LEAD.md has high effort tag', () => {
      expect(claudeLead).toMatch(/\*\*Effort\*\*: high/);
    });
    test('CLAUDE_PLAN.md has high effort tag', () => {
      expect(claudePlan).toMatch(/\*\*Effort\*\*: high/);
    });
    test('CLAUDE_EXEC.md has xhigh effort tag', () => {
      expect(claudeExec).toMatch(/\*\*Effort\*\*: xhigh/);
    });
  });
});
