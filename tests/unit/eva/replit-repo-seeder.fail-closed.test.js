/**
 * Seeder fail-closed hardening — SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001
 *   C5 / SECURITY VB-5 (AT-SEC-1): assertSeedableVentureRepo refuses empty/unknown/
 *     hostile/platform repo URLs (no fall-through to the platform repo).
 *   C3 / SECURITY VB-3: scanStagedFilesForSecrets flags stack secrets in staged TEXT
 *     files (skips binaries) so the push path can fail closed before pushing to an
 *     external venture repo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { assertSeedableVentureRepo, scanStagedFilesForSecrets } from '../../../lib/eva/bridge/replit-repo-seeder.js';

describe('assertSeedableVentureRepo (C5 / VB-5 fail-closed routing)', () => {
  it('returns the normalized https URL for a valid venture repo (strips .git)', () => {
    expect(assertSeedableVentureRepo('https://github.com/rickfelix/cronlinter')).toBe('https://github.com/rickfelix/cronlinter');
    expect(assertSeedableVentureRepo('https://github.com/rickfelix/cronlinter.git')).toBe('https://github.com/rickfelix/cronlinter');
  });

  it('THROWS on empty / null (no fall-through to platform)', () => {
    expect(() => assertSeedableVentureRepo('')).toThrow(/FAIL-CLOSED/);
    expect(() => assertSeedableVentureRepo(null)).toThrow(/FAIL-CLOSED/);
    expect(() => assertSeedableVentureRepo(undefined)).toThrow(/FAIL-CLOSED/);
  });

  it('THROWS on non-GitHub or shell-meta URLs', () => {
    expect(() => assertSeedableVentureRepo('https://gitlab.com/x/y')).toThrow(/FAIL-CLOSED/);
    expect(() => assertSeedableVentureRepo('https://github.com/x/y;rm -rf /')).toThrow(/FAIL-CLOSED/);
  });

  it('THROWS when the target is a PLATFORM repo (routing escape)', () => {
    expect(() => assertSeedableVentureRepo('https://github.com/rickfelix/ehg')).toThrow(/PLATFORM/);
    expect(() => assertSeedableVentureRepo('https://github.com/rickfelix/ehg.git')).toThrow(/PLATFORM/);
    expect(() => assertSeedableVentureRepo('https://github.com/rickfelix/EHG_Engineer')).toThrow(/PLATFORM/);
  });
});

describe('scanStagedFilesForSecrets (C3 / VB-3 secret scan before push)', () => {
  let dir;
  // Assemble the secret-SHAPED fixture at runtime so no literal secret lands in committed
  // source (GitHub push-protection would otherwise flag this test value).
  const CLERK_SK = ['sk', '_live_', 'aBcdEFgh1234567890ZyXwVu'].join('');
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'seedscan-'));
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'clean.md'), '# Roadmap\nventure CronLinter normal text build_tasks_complete=7');
    writeFileSync(join(dir, 'docs', 'leak.md'), `config: secretKey "${CLERK_SK}"`);
    writeFileSync(join(dir, 'CLAUDE.md'), 'no secrets here');
    // .png with secret-looking bytes must be SKIPPED (binary ext, not scanned)
    writeFileSync(join(dir, 'docs', 'image.png'), `${CLERK_SK} pretend-binary`);
  });
  afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } });

  it('flags exactly the text file containing a secret, with its category', () => {
    const hits = scanStagedFilesForSecrets(dir, ['docs/clean.md', 'docs/leak.md', 'CLAUDE.md', 'docs/image.png', 'docs/missing.md']);
    expect(hits).toHaveLength(1);
    expect(hits[0].file).toBe('docs/leak.md');
    expect(hits[0].categories).toContain('clerk_secret_key');
  });

  it('skips binary extensions and missing files; clean files are not flagged', () => {
    const hits = scanStagedFilesForSecrets(dir, ['docs/image.png', 'docs/missing.md', 'docs/clean.md', 'CLAUDE.md']);
    expect(hits).toHaveLength(0);
  });

  it('returns [] for empty/undefined staged list', () => {
    expect(scanStagedFilesForSecrets(dir, [])).toEqual([]);
    expect(scanStagedFilesForSecrets(dir, undefined)).toEqual([]);
  });
});
