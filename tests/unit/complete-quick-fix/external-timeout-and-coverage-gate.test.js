/**
 * SD-FDBK-INFRA-RCA-FIRST-HARD-001 — RCA-first: hard-bound external steps +
 * gate the coverage step in complete-quick-fix.
 *
 * Covers the three residual EXIT-124 hangs that survive the COMPLETE-QUICK-FIX-001/002
 * prompt-class fixes (RCA verdict: single structural root — external steps not
 * wall-clock-bounded + verifyTestCoverage ungated):
 *   FR-1 EXTERNAL_STEP_TIMEOUT_MS constant (+ env override)
 *   FR-2 every shelling-out execSync at the cited sites carries the timeout
 *   FR-3 verifyTestCoverage gated (skip) + bounded
 *   FR-4 early already-MERGED probe makes /checkin re-runs idempotent
 *
 * Behavioral where the unit is cleanly importable; source-assertion (mirroring
 * complete-quick-fix-skip-flags.test.js) for logic embedded in the large
 * completeQuickFix() function so the test stays hermetic (no real spawns / gh / DB).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

import { EXTERNAL_STEP_TIMEOUT_MS } from '../../../scripts/modules/complete-quick-fix/constants.js';
import { verifyTestCoverage } from '../../../scripts/modules/complete-quick-fix/verification.js';
import { parseArguments } from '../../../scripts/modules/complete-quick-fix/cli.js';

const MOD = path.resolve(process.cwd(), 'scripts/modules/complete-quick-fix');
const VERIF_PATH = path.join(MOD, 'verification.js');
const GITOPS_PATH = path.join(MOD, 'git-operations.js');
const ORCH_PATH = path.join(MOD, 'orchestrator.js');
const CLI_PATH = path.join(MOD, 'cli.js');

// ── FR-1: shared timeout constant + env override ──────────────────────────────
describe('FR-1 EXTERNAL_STEP_TIMEOUT_MS', () => {
  it('defaults to a positive 60s bound, well under the 2-minute external SIGTERM', () => {
    expect(EXTERNAL_STEP_TIMEOUT_MS).toBe(60000);
    expect(EXTERNAL_STEP_TIMEOUT_MS).toBeGreaterThan(0);
    expect(EXTERNAL_STEP_TIMEOUT_MS).toBeLessThan(120000);
  });

  it('honors a valid LEO_QF_EXTERNAL_STEP_TIMEOUT_MS env override (computed at import)', () => {
    // The constant is resolved at module load, so exercise the override in a child
    // process rather than mutating this process's already-loaded module.
    const out = execSync(
      'node -e "import(\'./scripts/modules/complete-quick-fix/constants.js\').then(m=>console.log(m.EXTERNAL_STEP_TIMEOUT_MS))"',
      { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, LEO_QF_EXTERNAL_STEP_TIMEOUT_MS: '12345' }, timeout: 30000 }
    ).trim();
    expect(out).toBe('12345');
  });

  it('falls back to the default on an invalid env override', () => {
    const out = execSync(
      'node -e "import(\'./scripts/modules/complete-quick-fix/constants.js\').then(m=>console.log(m.EXTERNAL_STEP_TIMEOUT_MS))"',
      { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, LEO_QF_EXTERNAL_STEP_TIMEOUT_MS: 'not-a-number' }, timeout: 30000 }
    ).trim();
    expect(out).toBe('60000');
  });
});

// ── FR-2: every cited shelling-out execSync carries the timeout ───────────────
describe('FR-2 external execSync sites are bounded', () => {
  const verifSrc = readFileSync(VERIF_PATH, 'utf8');
  const gitopsSrc = readFileSync(GITOPS_PATH, 'utf8');

  it('verification.js imports the shared timeout constant', () => {
    expect(verifSrc).toMatch(/import\s*\{\s*EXTERNAL_STEP_TIMEOUT_MS\s*\}\s*from\s*'\.\/constants\.js'/);
  });

  it('the verifyTestCoverage `test -f` probe passes the timeout', () => {
    expect(verifSrc).toMatch(/execSync\(`test -f[^`]*`,\s*\{[^}]*timeout:\s*EXTERNAL_STEP_TIMEOUT_MS/);
  });

  it('git-operations.js imports the shared timeout constant', () => {
    expect(gitopsSrc).toMatch(/import\s*\{\s*EXTERNAL_STEP_TIMEOUT_MS\s*\}\s*from\s*'\.\/constants\.js'/);
  });

  it('fetchPRMetadata gh pr view passes the timeout and loud-fails on ETIMEDOUT', () => {
    expect(gitopsSrc).toMatch(/gh pr view[\s\S]{0,200}timeout:\s*EXTERNAL_STEP_TIMEOUT_MS/);
    expect(gitopsSrc).toMatch(/ETIMEDOUT[\s\S]{0,160}external step timeout/);
  });

  it('the legacy autodetect git rev-parse / diff calls pass the timeout', () => {
    expect(gitopsSrc).toMatch(/git rev-parse HEAD',\s*\{[^}]*timeout:\s*EXTERNAL_STEP_TIMEOUT_MS/);
    expect(gitopsSrc).toMatch(/git rev-parse --abbrev-ref HEAD',\s*\{[^}]*timeout:\s*EXTERNAL_STEP_TIMEOUT_MS/);
    expect(gitopsSrc).toMatch(/git diff origin\/main --shortstat',\s*\{[^}]*timeout:\s*EXTERNAL_STEP_TIMEOUT_MS/);
  });
});

// ── FR-3: verifyTestCoverage is gated (behavioral) ────────────────────────────
describe('FR-3 verifyTestCoverage gating', () => {
  it('short-circuits without spawning when opts.skip is true', () => {
    // 1000 fake files would be 4000 spawns if the loop ran — instead it must return fast.
    const many = Array.from({ length: 1000 }, (_, i) => `src/file-${i}.ts`);
    const t0 = Date.now();
    const res = verifyTestCoverage(many, { skip: true });
    const elapsed = Date.now() - t0;
    expect(res.skipped).toBe(true);
    expect(res.filesWithTests).toEqual([]);
    expect(elapsed).toBeLessThan(1000); // no spawn loop ran
  });

  it('short-circuits on an empty / non-array filesChanged', () => {
    expect(verifyTestCoverage([]).skipped).toBe(true);
    expect(verifyTestCoverage(undefined).skipped).toBe(true);
  });

  it('orchestrator computes a skipCoverage gate (skipCoverage|skipTestRun|forceComplete|skipTestGate) and threads it', () => {
    const orchSrc = readFileSync(ORCH_PATH, 'utf8');
    expect(orchSrc).toMatch(/skipCoverage[\s\S]{0,200}options\.skipTestRun[\s\S]{0,80}options\.forceComplete[\s\S]{0,80}skipTestGate/);
    expect(orchSrc).toMatch(/verifyTestCoverage\(filesChanged,\s*\{\s*skip:\s*skipCoverage\s*\}\)/);
  });
});

// ── FR-3 (cli): --skip-coverage flag ──────────────────────────────────────────
describe('FR-3 --skip-coverage CLI flag', () => {
  it('parses --skip-coverage into options.skipCoverage', () => {
    const { options } = parseArguments(['QF-20260101-001', '--skip-coverage']);
    expect(options.skipCoverage).toBe(true);
  });

  it('defaults skipCoverage to false when the flag is absent', () => {
    const { options } = parseArguments(['QF-20260101-001']);
    expect(options.skipCoverage).toBe(false);
  });

  it('lists --skip-coverage in the help text', () => {
    const cliSrc = readFileSync(CLI_PATH, 'utf8');
    expect(cliSrc).toMatch(/--skip-coverage/);
  });
});

// ── FR-4: early already-MERGED reconcile probe — now WITNESS-GATED ─────────────
// SD-LEO-INFRA-QF-FALSE-COMPLETION-WITNESS-GAP-001 (FR-3) routed the reconcile decision through
// verifyQFMergeWitness so it only completes on the QF's OWN merged+reachable branch (never a
// foreign / most-recent merged pr_url — the QF-20260701-989 / #5290 mis-attribution). The FR-4
// guarantees are preserved: bounded external calls (now inside merge-witness.js via
// EXTERNAL_STEP_TIMEOUT_MS), idempotent early-return, and best-effort fall-through.
describe('FR-4 already-MERGED probe (witness-gated)', () => {
  const orchSrc = readFileSync(ORCH_PATH, 'utf8');
  const witnessSrc = readFileSync(path.join(MOD, 'merge-witness.js'), 'utf8');

  it('imports verifyQFMergeWitness for the own-branch-gated probe', () => {
    expect(orchSrc).toMatch(/import\s*\{[^}]*\bverifyQFMergeWitness\b[^}]*\}\s*from\s*'\.\/merge-witness\.js'/);
  });

  it('the witness bounds its gh/git calls with the shared timeout constant', () => {
    expect(witnessSrc).toMatch(/import\s*\{\s*EXTERNAL_STEP_TIMEOUT_MS\s*\}\s*from\s*'\.\/constants\.js'/);
    expect(witnessSrc).toMatch(/timeout:\s*EXTERNAL_STEP_TIMEOUT_MS/);
  });

  it('resolves from --pr-url or qf.pr_url and gates the reconcile on the witness verdict', () => {
    expect(orchSrc).toMatch(/options\.prUrl\s*\|\|\s*qf\.pr_url/);
    expect(orchSrc).toMatch(/verifyQFMergeWitness\(\{[\s\S]{0,120}\}\)/);
    expect(orchSrc).toMatch(/probeWitness\.verified/);
  });

  it('reconciles the QF to completed and returns early when the witness verifies', () => {
    // SD-REFILL-00QQ60BN: the reconcile UPDATE payload is built by buildMergedReconcileUpdate
    // (stamping the verification columns the completed_requires_verification CHECK demands) and
    // applied via .update(reconcileUpdate) — now with the SELF-DERIVED pr_url.
    expect(orchSrc).toMatch(/buildMergedReconcileUpdate\(\{[\s\S]{0,160}qf,[\s\S]{0,160}\}\)/);
    expect(orchSrc).toMatch(/\.update\(reconcileUpdate\)[\s\S]{0,80}\.eq\('id',\s*qfId\)[\s\S]{0,80}\.neq\('status',\s*'completed'\)/);
    // The probe must return BEFORE autoDetectGitInfo (which is the next major step).
    const probeIdx = orchSrc.indexOf('probeWitness.verified');
    const autodetectIdx = orchSrc.indexOf('autoDetectGitInfo(testDir, options)');
    expect(probeIdx).toBeGreaterThan(-1);
    expect(autodetectIdx).toBeGreaterThan(probeIdx);
  });

  it('is best-effort: a probe failure falls through to the normal pipeline', () => {
    expect(orchSrc).toMatch(/Already-merged witness probe skipped \(will run normal pipeline\)/);
  });
});
