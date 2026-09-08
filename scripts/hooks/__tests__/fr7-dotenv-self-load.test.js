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

  it('hook spawned with clean env reads SUPABASE_URL via dotenv self-load (no silent-skip stderr, no live write)', async () => {
    if (!existsSync(ENV_PATH)) {
      // Skip if .env is absent (e.g. CI without secrets); FR-7 covers exactly
      // this case but we cannot positively prove resolution without secrets.
      return;
    }
    // Quick read of .env to confirm it has SUPABASE_URL — otherwise skip
    const envSrc = readFileSync(ENV_PATH, 'utf8');
    if (!/^SUPABASE_URL=/m.test(envSrc)) return;

    // QF-20260903-195: a random per-run id (never the fr7-test sentinel
    // 00000000-0000-0000-0000-fff7000fffff other code once relied on) plus
    // LEO_HOOK_DRY_RUN=1 proves the SAME credential-resolution behaviour this test
    // cares about -- dotenv self-loaded truthy SUPABASE_URL/KEY -- WITHOUT ever
    // reaching the network call that would upsert a real row in production. The
    // unit tier must not write to the live sessions table (vitest.config.js: "NO
    // dotenv .env load — unit tests must not reach the live DB").
    const stdinJson = JSON.stringify({
      session_id: `fr7-dryrun-${process.pid}-${Date.now()}`,
      source: 'fr7-test',
    });
    const { stderr, stdout } = await spawnWithCleanEnv(HOOK_PATH, stdinJson, {
      LEO_TELEMETRY_DEBUG: '1',
      LEO_HOOK_DRY_RUN: '1',
    });
    // Hook printed CLAUDE_SESSION_ID line — proves it reached the upsert call site.
    expect(stdout).toMatch(/CLAUDE_SESSION_ID=fr7-dryrun-/);
    // FR-7 fix means the MISSING-credentials silent-skip should NOT have fired (env was loaded).
    expect(stderr).not.toMatch(/upsert skipped — supabaseUrl\/Key missing in env/);
    // Dry-run guard fired instead, proving credentials resolved AND no network write occurred.
    expect(stderr).toMatch(/dry-run — upsert skipped \(LEO_HOOK_DRY_RUN=1\), credentials resolved OK/);
  });
});
