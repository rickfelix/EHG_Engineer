// QF-20260509-779: orchestrator autoPr branch hoist + git-fetch-before-diff.
//
// QF-20260509-407 wired --auto-pr in cli.js but the orchestrator code path
// still prompted for PR URL BEFORE checking options.autoPr — flag was
// unreachable under --non-interactive. QF-779 made the flag reachable.
//
// QF-20260603-778 SUPERSEDES the QF-779 *ordering*: QF-779 created the PR
// BEFORE commitAndPushChanges, so `gh pr create` ran against an unpushed/
// commit-less branch (and wedged on the PR-URL prompt when it failed). The
// corrected order keeps the same spirit (auto-pr reachable under
// --non-interactive) but DEFERS createAutoPR until AFTER the branch is
// committed+pushed, and SKIPS the PR-URL prompt entirely under --auto-pr.
// These assertions pin the corrected order so neither regression re-ships.
//
// 13th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 — closes the
// "writer ships flag, consumer not patched" defect class for this module.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const ORCHESTRATOR = resolve(REPO_ROOT, 'scripts/modules/complete-quick-fix/orchestrator.js');
const GIT_OPS = resolve(REPO_ROOT, 'scripts/modules/complete-quick-fix/git-operations.js');

// ── A1: orchestrator autoPr branch order (QF-778 corrected) ────────────

describe('QF-20260603-778 A1: --auto-pr defers PR creation until AFTER commit+push', () => {
  const src = readFileSync(ORCHESTRATOR, 'utf8');

  it('analyzeGitDiff is called BEFORE the PR-URL prompt (so filesChanged is available for createAutoPR)', () => {
    const analyzeIdx = src.indexOf('analyzeGitDiff(testDir');
    const promptIdx = src.indexOf("'\\nGitHub PR URL (required): '");
    expect(analyzeIdx).toBeGreaterThan(0);
    expect(promptIdx).toBeGreaterThan(0);
    expect(analyzeIdx).toBeLessThan(promptIdx);
  });

  it('the PR-URL prompt is SKIPPED under --auto-pr (gated by !options.autoPr)', () => {
    // Corrected shape: `if (!prUrl && !options.autoPr) { prompt(...) }`
    expect(src).toMatch(/if \(!prUrl && !options\.autoPr\)[\s\S]*?GitHub PR URL/);
  });

  it('createAutoPR is DEFERRED until AFTER commitAndPushChanges (branch is pushed first)', () => {
    const pushIdx = src.indexOf('await commitAndPushChanges(');
    const createAutoPrIdx = src.indexOf('await createAutoPR(');
    expect(pushIdx).toBeGreaterThan(0);
    expect(createAutoPrIdx).toBeGreaterThan(0);
    expect(createAutoPrIdx).toBeGreaterThan(pushIdx);
  });

  it('the deferred-PR branch is guarded by deferAutoPr (auto-pr stays reachable under --non-interactive)', () => {
    expect(src).toMatch(/const deferAutoPr = !prUrl && options\.autoPr/);
    expect(src).toMatch(/if \(deferAutoPr && !prUrl\)/);
  });

  it('exactly one createAutoPR call site remains (no duplicate pre-push block)', () => {
    const matches = src.match(/await createAutoPR\(/g) || [];
    expect(matches.length).toBe(1);
  });

  it('createAutoPR is called with filesChanged (proves analyzeGitDiff result is wired through)', () => {
    expect(src).toMatch(/await createAutoPR\(\s*qfId,\s*qf,\s*filesChanged/);
  });
});

// ── B1: analyzeGitDiff prepends git fetch origin main ──────────────────

describe('QF-20260509-779 B1: analyzeGitDiff fetches origin/main BEFORE computing the diff', () => {
  const src = readFileSync(GIT_OPS, 'utf8');

  it('git fetch origin main appears in analyzeGitDiff', () => {
    // Pin the literal command string. Empty origin/main fetch is best-effort.
    expect(src).toMatch(/git fetch origin main --quiet/);
  });

  it('the fetch occurs INSIDE analyzeGitDiff and BEFORE the git diff origin/main...HEAD command', () => {
    const analyzeFnStart = src.indexOf('export function analyzeGitDiff');
    expect(analyzeFnStart).toBeGreaterThan(0);
    const fnSlice = src.slice(analyzeFnStart);
    const fetchIdx = fnSlice.indexOf('git fetch origin main --quiet');
    const diffIdx = fnSlice.indexOf('git diff origin/main...HEAD --name-only');
    expect(fetchIdx).toBeGreaterThan(0);
    expect(diffIdx).toBeGreaterThan(0);
    expect(fetchIdx).toBeLessThan(diffIdx);
  });

  it('the fetch is wrapped in try/catch (offline/no-remote tolerance)', () => {
    const analyzeFnStart = src.indexOf('export function analyzeGitDiff');
    const fnSlice = src.slice(analyzeFnStart);
    const fetchIdx = fnSlice.indexOf('git fetch origin main --quiet');
    // Look backwards for `try {`
    const beforeFetch = fnSlice.slice(0, fetchIdx);
    expect(beforeFetch).toMatch(/try\s*\{[^}]*$/s);
  });

  // QF-20260603-778 FIX-B: working-tree fallback when the 3-dot diff is empty.
  it('falls back to the working tree when origin/main...HEAD yields no files (uncommitted QF)', () => {
    const analyzeFnStart = src.indexOf('export function analyzeGitDiff');
    const fnSlice = src.slice(analyzeFnStart);
    // Empty 3-dot diff (HEAD == origin/main) → use tracked-vs-HEAD + untracked
    // so filesChanged is populated; otherwise partitionDirtyByScope strands every
    // dirty file as "unrelated" and commitAndPushChanges no-ops.
    expect(fnSlice).toMatch(/if \(files\.length === 0\)/);
    expect(fnSlice).toMatch(/git diff HEAD --name-only/);
    expect(fnSlice).toMatch(/git ls-files --others --exclude-standard/);
  });
});

// ── A2 (functional): in-process import-and-call regression ─────────────

// We can't fully spawn complete-quick-fix.js as a child here without making
// real DB writes (would step on parallel sessions). The static-shape assertions
// above are necessary; what we add here is an in-process import smoke that
// proves the module exports are wired and parse cleanly post-edit.

describe('QF-20260509-779 A2: orchestrator + git-operations modules import cleanly', () => {
  it('orchestrator.js exports completeQuickFix (no syntax error from edit)', async () => {
    const m = await import(`${ORCHESTRATOR.replace(/\\/g, '/')}`);
    expect(typeof m.completeQuickFix).toBe('function');
  });

  it('git-operations.js exports analyzeGitDiff + countLocBySplit + autoDetectGitInfo (no syntax error from edit)', async () => {
    const m = await import(`${GIT_OPS.replace(/\\/g, '/')}`);
    expect(typeof m.analyzeGitDiff).toBe('function');
    expect(typeof m.countLocBySplit).toBe('function');
    expect(typeof m.autoDetectGitInfo).toBe('function');
  });

  it('cli.js still wires the autoPr CLI flag (regression-pin from QF-20260509-407)', async () => {
    const cliPath = resolve(REPO_ROOT, 'scripts/modules/complete-quick-fix/cli.js');
    const cliSrc = readFileSync(cliPath, 'utf8');
    expect(cliSrc).toMatch(/'auto-pr':\s*\{\s*type:\s*'boolean'\s*\}/);
    expect(cliSrc).toMatch(/autoPr:\s*values\['auto-pr'\]/);
    // Auto-enable under --non-interactive when no --pr-url
    expect(cliSrc).toMatch(/autoPr:[^,\n]*non-interactive[^,\n]*pr-url/);
  });
});
