/**
 * FR-7 dotenv self-load — capture-session-id.cjs + session-tick.cjs
 *
 * SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001
 *
 * Verifies that hook subprocesses self-load the project .env at module top so
 * process.env.SUPABASE_URL / SERVICE_ROLE_KEY resolve regardless of whether
 * the parent shell pre-sourced .env. This is the structural fix for failure
 * mode F (5 reproductions: sessions 2485521c, 8edf5243, 755f5696, 97270d12,
 * fd8348ea), where capture-session-id.cjs:273 silent-returned without any
 * telemetry log — even with LEO_TELEMETRY_DEBUG=1 armed — because the line
 * had no debug guard.
 *
 * VALIDATION risk #3 mitigation: tests use child_process.spawn with explicit
 * minimal env, NOT vi.mock — see reference_vi_mock_masks_broken_import.md.
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const REPO_ROOT = resolve(__dirname, '../../..');
const HOOK_PATH = resolve(REPO_ROOT, 'scripts/hooks/capture-session-id.cjs');
const TICK_PATH = resolve(REPO_ROOT, 'scripts/session-tick.cjs');
const ENV_PATH = resolve(REPO_ROOT, '.env');

/**
 * Spawn a script with explicit minimal env (no SUPABASE_* inherited) and
 * collect stdout/stderr until it exits or the timeout fires.
 *
 * Always returns { code, stdout, stderr } even on timeout (hook self-kills
 * at 12s; we give a 14s budget on top of that).
 */
function spawnWithCleanEnv(scriptPath, stdinJson, extraEnv = {}) {
  return new Promise((resolveFn) => {
    const env = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
      PATH: process.env.PATH,
      ...extraEnv,
    };
    const child = spawn(process.execPath, [scriptPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    const killer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* best effort */ }
    }, 14000);
    child.on('close', (code) => {
      clearTimeout(killer);
      resolveFn({ code, stdout, stderr });
    });
    child.stdin.write(stdinJson);
    child.stdin.end();
  });
}

describe('FR-7: hook subprocess self-loads dotenv', () => {
  it('capture-session-id.cjs has dotenv require at module top', () => {
    const src = readFileSync(HOOK_PATH, 'utf8');
    // Match must appear BEFORE upsertSessionRow function definition (line ~270)
    const dotenvIdx = src.indexOf("require('dotenv').config(");
    const upsertIdx = src.indexOf('async function upsertSessionRow');
    expect(dotenvIdx).toBeGreaterThan(0);
    expect(upsertIdx).toBeGreaterThan(0);
    expect(dotenvIdx).toBeLessThan(upsertIdx);
    // dotenv path must resolve relative to __dirname for portability
    expect(src).toMatch(/require\('dotenv'\)\.config\(\s*\{\s*path:\s*path\.resolve\(__dirname,\s*['"]\.\.\/\.\.\/\.env['"]\s*\)\s*\}\s*\)/);
  });

  it('session-tick.cjs has dotenv require at module top', () => {
    const src = readFileSync(TICK_PATH, 'utf8');
    const dotenvIdx = src.indexOf("require('dotenv').config(");
    expect(dotenvIdx).toBeGreaterThan(0);
    // Must precede the first SUPABASE_URL read
    const supabaseIdx = src.indexOf('process.env.SUPABASE_URL');
    expect(supabaseIdx).toBeGreaterThan(0);
    expect(dotenvIdx).toBeLessThan(supabaseIdx);
    expect(src).toMatch(/require\('dotenv'\)\.config\(\s*\{\s*path:\s*path\.resolve\(__dirname,\s*['"]\.\.\/\.env['"]\s*\)\s*\}\s*\)/);
  });

  it('capture-session-id.cjs:273 silent-return path emits stderr under LEO_TELEMETRY_DEBUG=1', () => {
    const src = readFileSync(HOOK_PATH, 'utf8');
    // The new guarded console.error must appear in the early-return block
    expect(src).toMatch(/upsert skipped — supabaseUrl\/Key missing in env/);
    expect(src).toMatch(/URL=\$\{Boolean\(supabaseUrl\)\}\s*KEY=\$\{Boolean\(supabaseKey\)\}/);
    // Booleans-only contract — do NOT log the values themselves
    expect(src).not.toMatch(/console\.error[^)]*\$\{supabaseUrl\}/);
    expect(src).not.toMatch(/console\.error[^)]*\$\{supabaseKey\}/);
  });

  it('hook spawned with clean env reads SUPABASE_URL via dotenv self-load (no silent-skip stderr)', async () => {
    if (!existsSync(ENV_PATH)) {
      // Skip if .env is absent (e.g. CI without secrets); FR-7 covers exactly
      // this case but we cannot positively prove resolution without secrets.
      return;
    }
    // Quick read of .env to confirm it has SUPABASE_URL — otherwise skip
    const envSrc = readFileSync(ENV_PATH, 'utf8');
    if (!/^SUPABASE_URL=/m.test(envSrc)) return;

    const stdinJson = JSON.stringify({
      session_id: '00000000-0000-0000-0000-fff7000fffff',
      source: 'fr7-test',
    });
    const { stderr, stdout } = await spawnWithCleanEnv(HOOK_PATH, stdinJson, {
      LEO_TELEMETRY_DEBUG: '1',
    });
    // Hook printed CLAUDE_SESSION_ID line — proves it reached line ~489
    expect(stdout).toMatch(/CLAUDE_SESSION_ID=00000000-0000-0000-0000-fff7000fffff/);
    // FR-7 fix means line 273 silent-skip should NOT have fired (env was loaded)
    expect(stderr).not.toMatch(/upsert skipped — supabaseUrl\/Key missing in env/);
  });
});
