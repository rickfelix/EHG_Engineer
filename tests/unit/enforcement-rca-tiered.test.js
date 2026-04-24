/**
 * ENFORCEMENT 11 — RCA Tiered Enforcement (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-129)
 *
 * Exercises the state-manager logic directly (fast, deterministic) and the
 * pre-tool-enforce.cjs hook as a subprocess (integration). Subprocess tests
 * use a throwaway LEO_RETRY_STATE_DIR + unified-session-state.json so they
 * never pollute the real session state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require_ = (await import('module')).createRequire(import.meta.url);
const stateMgr = require_('../../scripts/hooks/retry-state-manager.cjs');
const hookPath = path.resolve('scripts/hooks/pre-tool-enforce.cjs');

describe('retry-state-manager', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-state-'));
    process.env.LEO_RETRY_STATE_DIR = tmpDir;
  });
  afterEach(() => {
    delete process.env.LEO_RETRY_STATE_DIR;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('builds distinct signatures for same tool/different target', () => {
    const sig1 = stateMgr.signatureFor('Edit', { file_path: '/a.js' });
    const sig2 = stateMgr.signatureFor('Edit', { file_path: '/b.js' });
    expect(sig1).not.toBe(sig2);
    expect(sig1.startsWith('Edit:')).toBe(true);
  });

  it('returns null signature for untracked tool', () => {
    expect(stateMgr.signatureFor('Task', { prompt: 'x' })).toBeNull();
  });

  it('counts attempts across invocations on same target', async () => {
    const noopRca = async () => null;
    const first = await stateMgr.recordAndCount('sess-1', 'SD-X', 'Bash', { command: 'npm test' }, { rcaCheck: noopRca });
    const second = await stateMgr.recordAndCount('sess-1', 'SD-X', 'Bash', { command: 'npm test' }, { rcaCheck: noopRca });
    expect(first.attempts).toBe(1);
    expect(second.attempts).toBe(2);
  });

  it('isolates attempts per-target', async () => {
    const noopRca = async () => null;
    await stateMgr.recordAndCount('sess-1', 'SD-X', 'Edit', { file_path: '/a.js' }, { rcaCheck: noopRca });
    const b = await stateMgr.recordAndCount('sess-1', 'SD-X', 'Edit', { file_path: '/b.js' }, { rcaCheck: noopRca });
    expect(b.attempts).toBe(1);
  });

  it('resets all counters when rcaCheck returns a newer ISO', async () => {
    const noopRca = async () => null;
    const rcaFired = async () => new Date().toISOString();
    await stateMgr.recordAndCount('sess-1', 'SD-X', 'Bash', { command: 'cmd' }, { rcaCheck: noopRca });
    await stateMgr.recordAndCount('sess-1', 'SD-X', 'Bash', { command: 'cmd' }, { rcaCheck: noopRca });
    const third = await stateMgr.recordAndCount('sess-1', 'SD-X', 'Bash', { command: 'cmd' }, { rcaCheck: rcaFired });
    expect(third.rcaResetApplied).toBe(true);
    expect(third.attempts).toBe(1);
  });

  it('drops invocations older than the 10-minute window', async () => {
    const noopRca = async () => null;
    const now = Date.now();
    const stale = now - stateMgr.RETRY_WINDOW_MS - 1000;
    // Seed a stale entry directly, then probe.
    const seeded = { reset_at: null, invocations: { 'Bash:seed': [stale] } };
    stateMgr.writeState('sess-stale', seeded);
    const r = await stateMgr.recordAndCount('sess-stale', 'SD-X', 'Bash', { command: 'different' }, { rcaCheck: noopRca, now });
    const onDisk = stateMgr.readState('sess-stale');
    expect(onDisk.invocations['Bash:seed']).toBeUndefined();
    expect(r.attempts).toBe(1);
  });
});

function runHook(toolName, toolInput, env = {}) {
  const mergedEnv = {
    ...process.env,
    CLAUDE_TOOL_NAME: toolName,
    CLAUDE_TOOL_INPUT: JSON.stringify(toolInput),
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

describe('pre-tool-enforce — ENFORCEMENT 11 (RCA tiered)', () => {
  let tmpDir;
  const sessionId = 'rca-int-test-session';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-hook-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('allows a single invocation silently', () => {
    const r = runHook('Edit', { file_path: '/tmp/single.js' }, {
      SESSION_ID: sessionId + '-1',
      CLAUDE_SESSION_ID: sessionId + '-1',
      LEO_RETRY_STATE_DIR: tmpDir
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain('RCA-TIERED-ENFORCEMENT');
  });

  it('warns on the 2nd consecutive invocation', () => {
    const env = {
      SESSION_ID: sessionId + '-2',
      CLAUDE_SESSION_ID: sessionId + '-2',
      LEO_RETRY_STATE_DIR: tmpDir
    };
    runHook('Edit', { file_path: '/tmp/warn.js' }, env);
    const r = runHook('Edit', { file_path: '/tmp/warn.js' }, env);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('RCA-TIERED-ENFORCEMENT');
    expect(r.stdout).toContain('attempt 2');
  });

  it('blocks on the 3rd consecutive invocation', () => {
    const env = {
      SESSION_ID: sessionId + '-3',
      CLAUDE_SESSION_ID: sessionId + '-3',
      LEO_RETRY_STATE_DIR: tmpDir
    };
    runHook('Edit', { file_path: '/tmp/block.js' }, env);
    runHook('Edit', { file_path: '/tmp/block.js' }, env);
    const r = runHook('Edit', { file_path: '/tmp/block.js' }, env);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('RCA TIERED ENFORCEMENT');
    expect(r.stderr).toContain('rca-agent');
  });

  it('honors EMERGENCY_RCA_BYPASS on the 3rd invocation', () => {
    const env = {
      SESSION_ID: sessionId + '-4',
      CLAUDE_SESSION_ID: sessionId + '-4',
      LEO_RETRY_STATE_DIR: tmpDir
    };
    runHook('Edit', { file_path: '/tmp/bypass.js' }, env);
    runHook('Edit', { file_path: '/tmp/bypass.js' }, env);
    const r = runHook('Edit', { file_path: '/tmp/bypass.js' }, { ...env, EMERGENCY_RCA_BYPASS: 'true' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('(bypass active)');
  });

  it('does nothing when LEO_RCA_ENFORCEMENT=off', () => {
    const env = {
      SESSION_ID: sessionId + '-5',
      CLAUDE_SESSION_ID: sessionId + '-5',
      LEO_RETRY_STATE_DIR: tmpDir,
      LEO_RCA_ENFORCEMENT: 'off'
    };
    runHook('Edit', { file_path: '/tmp/off.js' }, env);
    runHook('Edit', { file_path: '/tmp/off.js' }, env);
    const r = runHook('Edit', { file_path: '/tmp/off.js' }, env);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain('RCA-TIERED-ENFORCEMENT');
  });
});
