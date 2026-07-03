/**
 * Content invariants for the /worker skill (QF-20260703-486).
 *
 * /worker gives fresh worker sessions a one-paste startup, parity with /adam and
 * /coordinator, instead of a hand-maintained paste blob that drifts. These assertions
 * lock the required-read + no-menu shape so future drift is caught at CI.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');

const workerSkillPath = resolve(repoRoot, '.claude/commands/worker.md');
const directivePath = resolve(repoRoot, 'docs/protocol/fleet-worker-loop-directive.md');

let workerSkill;

beforeAll(() => {
  workerSkill = readFileSync(workerSkillPath, 'utf8');
});

describe('/worker skill — required-read pattern (parity with /adam Step 1)', () => {
  it('file exists with substantive content', () => {
    expect(existsSync(workerSkillPath)).toBe(true);
    expect(workerSkill.length).toBeGreaterThan(500);
  });

  it('references the canonical fleet-worker-loop-directive.md by path', () => {
    expect(workerSkill).toContain('docs/protocol/fleet-worker-loop-directive.md');
  });

  it('the referenced canonical directive file actually exists (no dangling reference)', () => {
    expect(existsSync(directivePath)).toBe(true);
  });

  it('marks the directive read as REQUIRED, not optional', () => {
    expect(workerSkill).toMatch(/REQUIRED/);
  });
});

describe('/worker skill — startup sequence references the real scripts', () => {
  it('references worker-checkin.cjs for registration', () => {
    expect(workerSkill).toContain('scripts/worker-checkin.cjs');
  });

  it('references sd-start.js for claiming an SD', () => {
    expect(workerSkill).toContain('scripts/sd-start.js');
  });

  it('references read-quick-fix.js for the QF path', () => {
    expect(workerSkill).toContain('scripts/read-quick-fix.js');
  });

  it('instructs shipping via PR + auto-merge, never a manual merge', () => {
    expect(workerSkill).toMatch(/auto-merge/i);
    expect(workerSkill).toMatch(/never\s+a\s+manual\s+`gh pr merge`/i);
  });
});

describe('/worker skill — AUTO-PROCEED routing (no interactive menu)', () => {
  it('contains zero AskUserQuestion menu invocations', () => {
    const matches = workerSkill.match(/(?:"question"\s*:\s*"|AskUserQuestion\s*\()/g) || [];
    expect(
      matches.length,
      '/worker must not present a menu at startup — a fleet worker has no human in the loop window (AUTO-PROCEED, CLAUDE.md).'
    ).toBe(0);
  });
});

describe('/worker skill — optional directed-task argument', () => {
  it('parses $ARGUMENTS for an optional resume <KEY> form', () => {
    expect(workerSkill).toContain('$ARGUMENTS');
    expect(workerSkill).toMatch(/resume\s*<SD-or-QF-KEY>|resume <SD/);
  });
});
