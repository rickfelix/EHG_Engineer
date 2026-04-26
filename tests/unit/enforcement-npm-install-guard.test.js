/**
 * ENFORCEMENT 12 — npm install Concurrency Guard (QF-20260426-822)
 *
 * Integration tests that invoke pre-tool-enforce.cjs as a subprocess with
 * controlled CLAUDE_TOOL_INPUT and a temp CWD containing (or lacking) a
 * synthetic node_modules/.staging/ dir. Process-detection (ps/wmic) is
 * disabled via LEO_NPM_INSTALL_GUARD_PS=off so tests are deterministic and
 * never flake on a real concurrent install.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const hookPath = path.resolve('scripts/hooks/pre-tool-enforce.cjs');

function runHook(toolName, toolInput, env = {}) {
  const mergedEnv = {
    ...process.env,
    CLAUDE_TOOL_NAME: toolName,
    CLAUDE_TOOL_INPUT: JSON.stringify(toolInput),
    LEO_NPM_INSTALL_GUARD_PS: 'off',
    LEO_RCA_ENFORCEMENT: 'off',
    ...env
  };
  try {
    const stdout = execSync(`node "${hookPath}"`, {
      env: mergedEnv,
      timeout: 15000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

describe('pre-tool-enforce — ENFORCEMENT 12 (npm install concurrency guard)', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-guard-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  function seedStaging() {
    const stagingDir = path.join(tmpDir, 'node_modules', '.staging');
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'pkg-abc123'), '');
  }

  it('blocks `npm install` when .staging/ is non-empty', () => {
    seedStaging();
    const r = runHook('Bash', { command: 'npm install', cwd: tmpDir });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('NPM INSTALL RACE GUARD');
    expect(r.stderr).toContain('node_modules/.staging/ active');
  });

  it('blocks `npm i` (short form)', () => {
    seedStaging();
    const r = runHook('Bash', { command: 'npm i lodash', cwd: tmpDir });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('NPM INSTALL RACE GUARD');
  });

  it('blocks `npm ci`', () => {
    seedStaging();
    const r = runHook('Bash', { command: 'npm ci', cwd: tmpDir });
    expect(r.exitCode).toBe(2);
  });

  it('allows `npm install` when .staging/ is absent', () => {
    const r = runHook('Bash', { command: 'npm install', cwd: tmpDir });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('NPM INSTALL RACE GUARD');
  });

  it('allows `npm install` when .staging/ exists but is empty', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', '.staging'), { recursive: true });
    const r = runHook('Bash', { command: 'npm install', cwd: tmpDir });
    expect(r.exitCode).toBe(0);
  });

  it('does NOT match `npm run install` (script named install)', () => {
    seedStaging();
    const r = runHook('Bash', { command: 'npm run install', cwd: tmpDir });
    expect(r.exitCode).toBe(0);
  });

  it('does NOT match `npm test` or `npm run build`', () => {
    seedStaging();
    expect(runHook('Bash', { command: 'npm test', cwd: tmpDir }).exitCode).toBe(0);
    expect(runHook('Bash', { command: 'npm run build', cwd: tmpDir }).exitCode).toBe(0);
  });

  it('allows `npm install --help` even with .staging/ present', () => {
    seedStaging();
    const r = runHook('Bash', { command: 'npm install --help', cwd: tmpDir });
    expect(r.exitCode).toBe(0);
  });

  it('honors LEO_NPM_INSTALL_GUARD=off', () => {
    seedStaging();
    const r = runHook('Bash', { command: 'npm install', cwd: tmpDir }, { LEO_NPM_INSTALL_GUARD: 'off' });
    expect(r.exitCode).toBe(0);
  });

  it('does not affect non-Bash tools', () => {
    seedStaging();
    const r = runHook('Read', { file_path: '/tmp/x.js' });
    expect(r.exitCode).toBe(0);
  });
});
