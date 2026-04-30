/**
 * Vitest coverage for sandbox-driver (SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-D).
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  REQUIRED_CAPABILITIES,
  detectCapabilities,
  createSandboxDir,
  cloneIntoSandbox,
  runInSandbox,
} from '../../../../lib/eva/quality-findings/sandbox-driver.js';

const tmpsCreated = [];

afterEach(() => {
  // Cleanup any stray dirs from tests
  for (const d of tmpsCreated) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
  tmpsCreated.length = 0;
});

describe('REQUIRED_CAPABILITIES', () => {
  it('declares node + git as required', () => {
    expect(REQUIRED_CAPABILITIES).toEqual(['node', 'git']);
    expect(Object.isFrozen(REQUIRED_CAPABILITIES)).toBe(true);
  });
});

describe('detectCapabilities', () => {
  it('returns versions when capabilities exist', () => {
    // node + git should be available in any vitest run environment
    const v = detectCapabilities();
    expect(v.node).toMatch(/v?\d+\.\d+/);
    expect(v.git).toMatch(/git/i);
  });
});

describe('createSandboxDir', () => {
  it('creates a tmp dir under os.tmpdir', () => {
    const { tmpDir, cleanup } = createSandboxDir();
    tmpsCreated.push(tmpDir);
    expect(tmpDir.startsWith(os.tmpdir())).toBe(true);
    expect(fs.existsSync(tmpDir)).toBe(true);
    cleanup();
    expect(fs.existsSync(tmpDir)).toBe(false);
  });

  it('cleanup is idempotent (safe to call twice)', () => {
    const { tmpDir, cleanup } = createSandboxDir();
    tmpsCreated.push(tmpDir);
    cleanup();
    expect(() => cleanup()).not.toThrow();
  });

  it('uses configurable prefix', () => {
    const { tmpDir, cleanup } = createSandboxDir('test-pfx-');
    tmpsCreated.push(tmpDir);
    expect(path.basename(tmpDir).startsWith('test-pfx-')).toBe(true);
    cleanup();
  });
});

describe('cloneIntoSandbox', () => {
  it('copies file-tree using fs fallback when not a git repo', () => {
    // Create a small source dir
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'src-test-'));
    tmpsCreated.push(src);
    fs.writeFileSync(path.join(src, 'hello.txt'), 'world');

    const { tmpDir: sandbox, cleanup } = createSandboxDir();
    tmpsCreated.push(sandbox);

    const repo = cloneIntoSandbox(src, sandbox, { useGitClone: false });
    expect(fs.existsSync(path.join(repo, 'hello.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(repo, 'hello.txt'), 'utf8')).toBe('world');
    cleanup();
  });

  it('does not modify the source directory (read-only contract)', () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'src-test-'));
    tmpsCreated.push(src);
    fs.writeFileSync(path.join(src, 'a.txt'), 'a');

    const beforeMtime = fs.statSync(path.join(src, 'a.txt')).mtimeMs;

    const { tmpDir: sandbox, cleanup } = createSandboxDir();
    tmpsCreated.push(sandbox);

    cloneIntoSandbox(src, sandbox, { useGitClone: false });

    // Modify the sandbox copy
    const repo = path.join(sandbox, 'repo');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'modified-in-sandbox');

    const afterMtime = fs.statSync(path.join(src, 'a.txt')).mtimeMs;
    expect(afterMtime).toBe(beforeMtime);
    expect(fs.readFileSync(path.join(src, 'a.txt'), 'utf8')).toBe('a');
    cleanup();
  });
});

describe('runInSandbox', () => {
  // Helper: create a git-initialized source dir so cloneIntoSandbox uses
  // git-clone fast-path (more deterministic on Windows than fs.cpSync).
  function makeGitSrc() {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'src-run-'));
    tmpsCreated.push(src);
    fs.writeFileSync(path.join(src, '.gitignore'), '');
    try {
      const cp = require('child_process');
      cp.execSync('git init --quiet', { cwd: src, stdio: 'ignore' });
      cp.execSync('git add . && git -c user.email=t@t -c user.name=t commit --quiet -m init', {
        cwd: src, stdio: 'ignore',
      });
    } catch { /* best-effort; falls through to fs-copy in cloneIntoSandbox */ }
    return src;
  }

  it('runs a simple command and captures stdout + exit code', async () => {
    const src = makeGitSrc();

    // Write a small node script into the source dir; run it inside the sandbox.
    // Avoids shell-quoting issues with `node -e` across Windows/POSIX shells.
    fs.writeFileSync(path.join(src, 'hello.cjs'), 'console.log("ok"); process.exit(0);\n');
    require('child_process').execSync(
      'git -c user.email=t@t -c user.name=t add hello.cjs && git -c user.email=t@t -c user.name=t commit --quiet -m hello',
      { cwd: src, stdio: 'ignore' }
    );

    const r = await runInSandbox({
      sourceDir: src,
      command: 'node',
      args: ['hello.cjs'],
      timeoutMs: 30000,
    });

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/ok/);
    expect(r.durationMs).toBeGreaterThan(0);
  }, 60000);

  it('cleanup runs even when command exits non-zero (try/finally guarantee)', async () => {
    const src = makeGitSrc();
    fs.writeFileSync(path.join(src, 'fail.cjs'), 'process.exit(7);\n');
    require('child_process').execSync(
      'git -c user.email=t@t -c user.name=t add fail.cjs && git -c user.email=t@t -c user.name=t commit --quiet -m fail',
      { cwd: src, stdio: 'ignore' }
    );

    const beforeCount = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('leo-sandbox-')).length;

    const r = await runInSandbox({
      sourceDir: src,
      command: 'node',
      args: ['fail.cjs'],
      timeoutMs: 30000,
    });

    expect(r.exitCode).toBe(7);

    const afterCount = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('leo-sandbox-')).length;
    expect(afterCount).toBe(beforeCount); // cleanup ran
  }, 60000);

  it('throws on missing arguments', async () => {
    await expect(runInSandbox({})).rejects.toThrow(/sourceDir/);
    await expect(runInSandbox({ sourceDir: '/x' })).rejects.toThrow(/command/);
  });
});
