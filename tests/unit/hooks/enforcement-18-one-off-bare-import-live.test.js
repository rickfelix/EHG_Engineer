/**
 * SD-LEO-FIX-TEST-FIXTURE-LANE-001 -- TS-7: proves the LIVE pre-tool-enforce.cjs hook (not just
 * the pure lib/one-off-bare-import.cjs decision function tested in isolation elsewhere) actually
 * blocks the 2026-08-21 incident shape end-to-end -- a real subprocess invocation with a
 * PreToolUse-shaped Bash payload, mirroring the established ENFORCEMENT 12 harness
 * (tests/unit/enforcement-npm-install-guard.test.js).
 *
 * Uses a REAL entry from the committed manifest (scripts/lint/one-off-mutate-key-manifest.json)
 * for the block case, so this test fails loud if a future manifest regeneration ever drops
 * every dangerous entry -- it is not testing against a synthetic fixture the hook never reads.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import { readFileSync } from 'fs';

const hookPath = path.resolve('scripts/hooks/pre-tool-enforce.cjs');
const manifestPath = path.resolve('scripts/lint/one-off-mutate-key-manifest.json');

function runHook(toolName, toolInput, env = {}) {
  const mergedEnv = {
    ...process.env,
    CLAUDE_TOOL_NAME: toolName,
    CLAUDE_TOOL_INPUT: JSON.stringify(toolInput),
    LEO_RCA_ENFORCEMENT: 'off',
    ...env,
  };
  try {
    const stdout = execSync(`node "${hookPath}"`, {
      env: mergedEnv,
      timeout: 15000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

function pickRealDangerousPath() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const keys = Object.keys(manifest.dangerous || {});
  if (keys.length === 0) {
    throw new Error('one-off-mutate-key-manifest.json has zero dangerous entries -- TS-7 needs at least one to exercise the live block path');
  }
  return keys[0];
}

describe('pre-tool-enforce — ENFORCEMENT 18 (bare-import-of-dangerous-one-off-script, live subprocess)', () => {
  it('TS-7: blocks the incident shape — a bare import() of a real manifest-dangerous file', () => {
    const targetPath = pickRealDangerousPath();
    const r = runHook('Bash', { command: `node -e "import('./${targetPath}')"` });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('[ENF-18] BLOCKED');
    expect(r.stderr).toContain(targetPath);
  });

  it('overrides with LEO_ALLOW_ONE_OFF_IMPORT set to a non-empty reason', () => {
    const targetPath = pickRealDangerousPath();
    const r = runHook(
      'Bash',
      { command: `node -e "import('./${targetPath}')"` },
      { LEO_ALLOW_ONE_OFF_IMPORT: 'TS-7 test: reviewed, safe' },
    );
    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[ENF-18] BLOCKED');
  });

  it('does NOT block a direct execution (`node scripts/one-off/x.mjs`, no import/require)', () => {
    const targetPath = pickRealDangerousPath();
    const r = runHook('Bash', { command: `node ${targetPath}` });
    expect(r.exitCode).toBe(0);
  });

  it('does NOT block a bare mention (grep) of a dangerous path', () => {
    const targetPath = pickRealDangerousPath();
    const r = runHook('Bash', { command: `grep -r "${targetPath}" scripts/one-off/` });
    expect(r.exitCode).toBe(0);
  });

  it('does NOT block an import of a path not in the dangerous manifest', () => {
    const r = runHook('Bash', { command: 'node -e "import(\'./scripts/one-off/__ts7-not-in-manifest.mjs\')"' });
    expect(r.exitCode).toBe(0);
  });

  it('does not affect non-Bash tools', () => {
    const r = runHook('Read', { file_path: 'scripts/one-off/whatever.mjs' });
    expect(r.exitCode).toBe(0);
  });
});
