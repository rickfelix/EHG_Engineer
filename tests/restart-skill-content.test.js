/**
 * Content invariants for the /restart skill and leo-stack scripts.
 *
 * These assertions lock the cleanup shipped by SD-LEO-INFRA-RESTART-SKILL-LEO-001
 * so future drift is caught at CI rather than at /restart-time.
 *
 * Each failure message names the specific drift and points to the SD —
 * if you intentionally need to restore one of these patterns (e.g., bringing
 * back an Agent Platform service), file a new SD that updates this test.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const restartSkillPath = resolve(repoRoot, '.claude/commands/restart.md');
const leoStackPs1Path = resolve(repoRoot, 'scripts/leo-stack.ps1');
const guidePath = resolve(repoRoot, 'docs/guides/leo-stack-management.md');

let restartSkill;
let leoStackPs1;
let guide;

beforeAll(() => {
  restartSkill = readFileSync(restartSkillPath, 'utf8');
  leoStackPs1 = readFileSync(leoStackPs1Path, 'utf8');
  guide = readFileSync(guidePath, 'utf8');
});

describe('restart skill — Agent Platform / port 8000 doc-truth', () => {
  it('restart.md does not reference Agent Platform', () => {
    const matches = restartSkill.match(/agent platform/gi) || [];
    expect(
      matches.length,
      'restart.md must not reference Agent Platform — the service was retired in commit f8e252ee28 and leo-stack scripts no longer manage it. The "Historical note" line about retirement is the only allowed mention and lives in restart.md only when phrased as a historical note. To restore Agent Platform, file a new SD.'
    ).toBeLessThanOrEqual(1);
  });

  it('restart.md does not list port 8000 as a managed server', () => {
    const matches = restartSkill.match(/port\s*8000|:8000/gi) || [];
    expect(
      matches.length,
      'restart.md must not list :8000 as a managed server — leo-stack.ps1 and leo-stack.sh manage only :3000 and :8080.'
    ).toBe(0);
  });
});

describe('restart skill — AUTO-PROCEED routing (no AskUserQuestion)', () => {
  it('restart.md contains zero AskUserQuestion menu invocations', () => {
    // Match menu-shaped invocations (JSON `"question":` field or `AskUserQuestion(` call).
    // Prose references explaining why menus were removed are intentionally allowed.
    const matches = restartSkill.match(/(?:"question"\s*:\s*"|AskUserQuestion\s*\()/g) || [];
    expect(
      matches.length,
      'restart.md must not embed AskUserQuestion menu invocations — three prior menus violated AUTO-PROCEED canonical pause-points (CLAUDE.md). Routing is now deterministic on sd_type.'
    ).toBe(0);
  });

  it('restart.md contains a deterministic sd_type-based routing rule', () => {
    expect(
      restartSkill,
      'restart.md must reference sd_type so the post-restart routing is deterministic.'
    ).toMatch(/sd_type/);
    expect(
      restartSkill,
      'restart.md must reference at least one downstream skill (/uat or /ship) in its routing rule.'
    ).toMatch(/\/uat|\/ship/);
  });
});

describe('leo-stack.ps1 — no auto git-pull (parity with leo-stack.sh)', () => {
  it('leo-stack.ps1 does not invoke git pull', () => {
    const matches = leoStackPs1.match(/git\s+pull/g) || [];
    expect(
      matches.length,
      'leo-stack.ps1 must not auto-pull — the bash sibling does not auto-pull, and Windows-only auto-pull can clobber peer-worktree state during parallel sessions. Operators run `git pull` explicitly.'
    ).toBe(0);
  });

  it('leo-stack.ps1 still recovers missing node_modules in EHG App', () => {
    expect(
      leoStackPs1,
      'leo-stack.ps1 Start-App must keep the node_modules-recovery block — fleet ops can clobber node_modules and the script needs to self-heal.'
    ).toMatch(/node_modules missing in EHG App/);
  });
});

describe('leo-stack-management.md — guide reflects current servers only', () => {
  it('guide contains at most one Agent Platform reference (the deprecation note)', () => {
    const matches = guide.match(/agent platform/gi) || [];
    expect(
      matches.length,
      'leo-stack-management.md must mention Agent Platform at most once (the single deprecation note pointing operators at the f8e252ee28 retirement). All other references are dead docs.'
    ).toBeLessThanOrEqual(1);
  });

  it('guide does not list port 8000 as a managed server', () => {
    const matches = guide.match(/port\s*8000|:8000/gi) || [];
    expect(
      matches.length,
      'leo-stack-management.md must not list :8000 — Agent Platform is retired.'
    ).toBe(0);
  });
});
