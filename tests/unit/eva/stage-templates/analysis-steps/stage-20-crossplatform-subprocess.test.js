/**
 * QF-20260828-487: cross-platform regression coverage for the three POSIX-shell
 * sites (npm audit's package.json check + `2>/dev/null || true`, and the secret
 * scanner's `grep -rn | head` pipeline) that broke under cmd.exe on win32.
 *
 * Deliberately NOT mocking child_process/exec: these tests exercise the real
 * fs-based logic directly on the host running CI, so a regression back to a
 * POSIX-only shell command would fail on any Windows runner, not just be
 * asserted away by a mock.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { runNpmAudit, runSecretScan } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js';

let repoDir;

beforeEach(async () => {
  repoDir = await mkdtemp(path.join(tmpdir(), 'qf-487-'));
});

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

describe('runNpmAudit (QF-20260828-487)', () => {
  it('reports "No package.json found" via a portable existsSync check, not a POSIX `test -f` subprocess', async () => {
    const findings = await runNpmAudit(repoDir, 'npm');
    expect(findings).toEqual([
      { check: 'npm_audit', title: 'No package.json found', severity: 'info', detail: 'Skipped npm audit' },
    ]);
  });

  it('a manager with no audit command (bun) short-circuits to an informational finding without touching package.json existence at all', async () => {
    await writeFile(path.join(repoDir, 'package.json'), '{}');
    const findings = await runNpmAudit(repoDir, 'bun');
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe('npm_audit');
    expect(findings[0].severity).toBe('info');
    expect(findings[0].title).toMatch(/not available for bun/);
  });
});

describe('runSecretScan (QF-20260828-487)', () => {
  it('finds a secret-shaped literal via a real recursive fs walk (no grep subprocess)', async () => {
    await writeFile(path.join(repoDir, 'config.js'), `const apiKey = "abcdefghijklmnopqrstuv12345";\n`);
    const findings = await runSecretScan(repoDir);
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe('secret_detection');
    expect(findings[0].title).toMatch(/config\.js:1/);
    expect(findings[0].severity).toBe('critical');
  });

  it('skips excluded directories (node_modules) and excluded files (package-lock.json)', async () => {
    await mkdir(path.join(repoDir, 'node_modules'), { recursive: true });
    await writeFile(path.join(repoDir, 'node_modules', 'leak.js'), `const secret = "shouldnotbefound12345678";\n`);
    await writeFile(path.join(repoDir, 'package-lock.json'), `{"token": "shouldnotbefound12345678"}\n`);
    const findings = await runSecretScan(repoDir);
    expect(findings).toHaveLength(0);
  });

  it('scans nested subdirectories, not just the repo root', async () => {
    await mkdir(path.join(repoDir, 'src', 'lib'), { recursive: true });
    await writeFile(path.join(repoDir, 'src', 'lib', 'nested.js'), `const password = "nested-secret-value-here";\n`);
    const findings = await runSecretScan(repoDir);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toMatch(/src\/lib\/nested\.js:1/);
  });

  it('returns no findings for a clean repo', async () => {
    await writeFile(path.join(repoDir, 'index.js'), `export const greeting = "hello world";\n`);
    const findings = await runSecretScan(repoDir);
    expect(findings).toHaveLength(0);
  });
});
