// QF-20260509-779: orchestrator autoPr branch hoist + git-fetch-before-diff.
//
// QF-20260509-407 wired --auto-pr in cli.js but the orchestrator code path
// still prompted for PR URL BEFORE checking options.autoPr — flag was
// unreachable under --non-interactive. This test pins the post-hoist branch
// order so the same regression cannot re-ship.
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

// ── A1: orchestrator autoPr branch order (post-hoist) ──────────────────

describe('QF-20260509-779 A1: orchestrator autoPr branch fires BEFORE the PR-URL prompt', () => {
  const src = readFileSync(ORCHESTRATOR, 'utf8');

  it('analyzeGitDiff is called BEFORE the PR-URL prompt (so filesChanged is available for createAutoPR)', () => {
    const analyzeIdx = src.indexOf('analyzeGitDiff(testDir');
    const promptIdx = src.indexOf("'\\nGitHub PR URL (required): '");
    expect(analyzeIdx).toBeGreaterThan(0);
    expect(promptIdx).toBeGreaterThan(0);
    expect(analyzeIdx).toBeLessThan(promptIdx);
  });

  it('autoPr branch (createAutoPR call) appears BEFORE the PR-URL prompt', () => {
    const autoPrIdx = src.indexOf('options.autoPr');
    const createAutoPrIdx = src.indexOf('await createAutoPR(');
    const promptIdx = src.indexOf("'\\nGitHub PR URL (required): '");
    expect(autoPrIdx).toBeLessThan(promptIdx);
    expect(createAutoPrIdx).toBeLessThan(promptIdx);
  });

  it('PR-URL prompt is gated by `if (!prUrl)` AFTER the autoPr branch sets prUrl', () => {
    // The post-hoist shape: `if (!prUrl && options.autoPr) { ... } if (!prUrl) { prompt ... }`
    expect(src).toMatch(/if \(!prUrl && options\.autoPr\)[\s\S]*?if \(!prUrl\)[\s\S]*?GitHub PR URL/);
  });

  it('NO duplicate autoPr block remains after the PR-acquisition section', () => {
    // Old shape was `if (options.autoPr && !prUrl) { finalPrUrl = await createAutoPR(...) }`
    // after the PR prompt block. Pin that the duplicate does not return.
    const matches = src.match(/options\.autoPr/g) || [];
    expect(matches.length).toBeLessThanOrEqual(2); // 1 in the new branch, 0 elsewhere (allow 2 max for comments)
  });

  it('createAutoPR is called with filesChanged (proves analyzeGitDiff hoist is wired through)', () => {
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
