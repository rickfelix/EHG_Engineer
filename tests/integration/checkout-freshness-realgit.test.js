/**
 * checkout-freshness REAL-git integration — SD-LEO-INFRA-FLEET-FRESHNESS-GUARD-001.
 * Exercises the DEFAULT makeGit seam (real git, a throwaway temp repo, NO network) so the actual
 * two-dot diff syntax is covered — the unit tests inject a fake diffPaths, which is exactly why they
 * could not catch the three-dot false-FRESH bug (adversarial review wokfu8fiu).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkoutFreshness, VERDICT } from '../../lib/governance/checkout-freshness.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

describe('checkout-freshness REAL git (default makeGit, temp repo, no network)', () => {
  let repo;
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'cf-realgit-'));
    git(repo, ['init', '-q']);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'Test']);
    git(repo, ['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(repo, 'CLAUDE.md'), 'v1 canonical\n');
    git(repo, ['add', 'CLAUDE.md']);
    git(repo, ['commit', '-q', '-m', 'v1']);
    git(repo, ['branch', 'baseline']); // baseline == HEAD (v1)
  });
  afterAll(() => { try { rmSync(repo, { recursive: true, force: true }); } catch { /* best-effort */ } });

  it('FRESH when HEAD == base (real two-dot diff, behind 0)', () => {
    const r = checkoutFreshness(repo, { baseRef: 'baseline', criticalPaths: ['CLAUDE.md'] });
    expect(r.verdict).toBe(VERDICT.FRESH);
    expect(r.behind).toBe(0);
  });

  it('STALE-CRITICAL on a LOCAL hand-edit to a protocol file at behind=0 (the three-dot false-FRESH bug)', () => {
    writeFileSync(join(repo, 'CLAUDE.md'), 'v2 LOCAL HAND EDIT\n');
    git(repo, ['add', 'CLAUDE.md']);
    git(repo, ['commit', '-q', '-m', 'local edit']); // HEAD ahead of baseline; baseline unchanged
    const r = checkoutFreshness(repo, { baseRef: 'baseline', criticalPaths: ['CLAUDE.md'] });
    expect(r.behind).toBe(0); // baseline has no commits HEAD lacks
    expect(r.verdict).toBe(VERDICT.STALE_CRITICAL); // two-dot catches the content drift; three-dot would FALSE-FRESH
    expect(r.criticalDiff).toContain('CLAUDE.md');
  });

  it('STALE-CRITICAL when base is AHEAD with a protocol-file change (behind>0)', () => {
    git(repo, ['branch', 'ahead']);
    git(repo, ['checkout', '-q', 'ahead']);
    writeFileSync(join(repo, 'CLAUDE.md'), 'v3 BASE AHEAD\n');
    git(repo, ['add', 'CLAUDE.md']);
    git(repo, ['commit', '-q', '-m', 'base ahead']);
    git(repo, ['checkout', '-q', '-']); // back to the prior branch (HEAD now behind 'ahead')
    const r = checkoutFreshness(repo, { baseRef: 'ahead', criticalPaths: ['CLAUDE.md'] });
    expect(r.behind).toBeGreaterThan(0);
    expect(r.verdict).toBe(VERDICT.STALE_CRITICAL);
  });

  it('STALE (not CRITICAL) when base is ahead but a NON-protocol file changed', () => {
    // Branch from CURRENT HEAD so CLAUDE.md is identical on both sides; only README diverges on base.
    git(repo, ['branch', 'readme-ahead']);
    git(repo, ['checkout', '-q', 'readme-ahead']);
    writeFileSync(join(repo, 'README.md'), 'unrelated change\n');
    git(repo, ['add', 'README.md']);
    git(repo, ['commit', '-q', '-m', 'unrelated base change']);
    git(repo, ['checkout', '-q', '-']);
    const r = checkoutFreshness(repo, { baseRef: 'readme-ahead', criticalPaths: ['CLAUDE.md'] });
    expect(r.behind).toBeGreaterThan(0); // behind by the README commit
    expect(r.verdict).toBe(VERDICT.STALE); // CLAUDE.md identical -> behind but NOT protocol-drift
  });

  it('FAIL-OPEN FRESH on a bogus base ref (a real git error -> FRESH, never throws)', () => {
    const r = checkoutFreshness(repo, { baseRef: 'does-not-exist-ref', criticalPaths: ['CLAUDE.md'] });
    expect(r.verdict).toBe(VERDICT.FRESH);
    expect(r.error).toBeTruthy();
  });
});
