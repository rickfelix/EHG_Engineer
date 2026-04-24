/**
 * Integration tests for scope-gate CLI / pre-commit flow.
 * SD-LEO-INFRA-OPUS-MODULE-SCOPE-001 Module E.
 *
 * Strategy: spawn `node scripts/modules/scope/scope-gate.js` from a temp git
 * repo with controlled staged files + env. Supabase is bypassed by either:
 *   (a) seeding a TEST_SCOPE_OVERRIDE env shim — no, the module doesn't honor
 *       that. We instead force `loadScope` paths via:
 *         - branch-with-no-SD → exit 0 silently (Test 1, no DB)
 *         - SCOPE_OVERRIDE env without matching scope → SD resolves but no
 *           Supabase creds → loadScope returns {found:false} → exit 0 (Test 2)
 *         - For violation tests we cannot avoid loadScope; we use the override
 *           path which short-circuits AFTER validateChange. To hit the
 *           violation/block branch deterministically we use a programmatic
 *           call to `main()` with a mocked supabase client via vi.mock.
 *
 * For Tests 3/4/5 (violation + override behaviors) we use vi.mock on the
 * supabase client to avoid network and seeded data.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const SCOPE_GATE = join(ROOT, 'scripts', 'modules', 'scope', 'scope-gate.js');

function mkTempRepo(branch) {
  const dir = mkdtempSync(join(tmpdir(), 'scope-gate-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email test@example.com', { cwd: dir });
  execSync('git config user.name Test', { cwd: dir });
  execSync('git commit --allow-empty -q -m init', { cwd: dir });
  if (branch) {
    execSync(`git checkout -q -b "${branch}"`, { cwd: dir });
  }
  return dir;
}

function stageFile(repo, relPath, contents = 'x') {
  const full = join(repo, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, contents);
  execSync(`git add "${relPath}"`, { cwd: repo });
}

function runGate(repo, env = {}) {
  return spawnSync('node', [SCOPE_GATE], {
    cwd: repo,
    env: {
      ...process.env,
      // Default: blank Supabase creds so loadScope returns {found:false}.
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      ...env,
    },
    encoding: 'utf8',
  });
}

const TMP_HOMES = [];
function mkTempHome() {
  const h = mkdtempSync(join(tmpdir(), 'scope-home-'));
  mkdirSync(join(h, '.claude'), { recursive: true });
  TMP_HOMES.push(h);
  return h;
}

afterEach(() => {
  for (const h of TMP_HOMES.splice(0)) {
    try { rmSync(h, { recursive: true, force: true }); } catch {}
  }
});

describe('scope-gate CLI — branch resolution', () => {
  it('Test 1: no SD on branch → exit 0 silently', () => {
    const repo = mkTempRepo('main');
    stageFile(repo, 'foo.js');
    const result = runGate(repo);
    expect(result.status).toBe(0);
    // Stderr should be empty (or near-empty)
    expect(result.stderr || '').not.toMatch(/BLOCKED/);
    rmSync(repo, { recursive: true, force: true });
  });

  it('Test 2: SD on branch but no Supabase creds → loadScope no-creds → exit 0', () => {
    const repo = mkTempRepo('feature/SD-FAKE-TEST-001-something');
    stageFile(repo, 'foo.js');
    const result = runGate(repo);
    // Branch SD parses, but no Supabase creds → loadScope returns {found:false} → silent pass
    expect(result.status).toBe(0);
    expect(result.stderr || '').not.toMatch(/BLOCKED/);
    rmSync(repo, { recursive: true, force: true });
  });
});

describe('scope-gate main() — programmatic with mocked Supabase', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function loadModuleWithMockedScope(scopeOverride) {
    // We mock the module's getSupabase indirectly by stubbing the env vars
    // and intercepting via vi.mock of @supabase/supabase-js.
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: scopeOverride ? {
                  sd_key: scopeOverride.sd_key,
                  metadata: { scope: scopeOverride.scope },
                } : null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    }));
    vi.stubEnv('SUPABASE_URL', 'http://mock');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'mock-key');
    return await import('../../scripts/modules/scope/scope-gate.js');
  }

  it('Test 3: strict mode + out-of-scope staged file → exit 1, stderr contains BLOCKED', async () => {
    const repo = mkTempRepo('feature/SD-MOCK-TEST-001-thing');
    stageFile(repo, 'random/bad.js');

    const mod = await loadModuleWithMockedScope({
      sd_key: 'SD-MOCK-TEST-001',
      scope: { mode: 'strict', in_files: ['lib/**'], out_files: [] },
    });

    // Run main() inside the temp repo by chdir
    const origCwd = process.cwd();
    process.chdir(repo);
    let stderr = '';
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(s => { stderr += s; return true; });
    try {
      const code = await mod.main([]);
      expect(code).toBe(1);
      expect(stderr).toMatch(/Scope Gate BLOCKED/);
      expect(stderr).toMatch(/random\/bad\.js/);
    } finally {
      writeSpy.mockRestore();
      process.chdir(origCwd);
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('Test 4: SCOPE_OVERRIDE matches SD + reason present → exit 0, log appended with reason_present=true', async () => {
    const home = mkTempHome();
    const repo = mkTempRepo('feature/SD-MOCK-TEST-002-thing');
    stageFile(repo, 'random/bad.js');

    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home); // Windows
    vi.stubEnv('SCOPE_OVERRIDE', 'SD-MOCK-TEST-002');
    vi.stubEnv('SCOPE_OVERRIDE_REASON', 'QF-99999 unblock CI');

    const mod = await loadModuleWithMockedScope({
      sd_key: 'SD-MOCK-TEST-002',
      scope: { mode: 'strict', in_files: ['lib/**'], out_files: [] },
    });

    const origCwd = process.cwd();
    process.chdir(repo);
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const code = await mod.main([]);
      expect(code).toBe(0);
      const logPath = join(home, '.claude', 'scope-overrides.log');
      expect(existsSync(logPath)).toBe(true);
      const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const last = JSON.parse(lines[lines.length - 1]);
      expect(last.sd_key).toBe('SD-MOCK-TEST-002');
      expect(last.reason).toBe('QF-99999 unblock CI');
      expect(last.reason_present).toBe(true);
      expect(Array.isArray(last.violations)).toBe(true);
      expect(last.violations.length).toBeGreaterThan(0);
    } finally {
      writeSpy.mockRestore();
      process.chdir(origCwd);
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('Test 5: SCOPE_OVERRIDE without SCOPE_OVERRIDE_REASON → exit 0, log entry has reason_present=false', async () => {
    const home = mkTempHome();
    const repo = mkTempRepo('feature/SD-MOCK-TEST-003-thing');
    stageFile(repo, 'random/bad.js');

    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('SCOPE_OVERRIDE', 'SD-MOCK-TEST-003');
    vi.stubEnv('SCOPE_OVERRIDE_REASON', '');

    const mod = await loadModuleWithMockedScope({
      sd_key: 'SD-MOCK-TEST-003',
      scope: { mode: 'strict', in_files: ['lib/**'], out_files: [] },
    });

    const origCwd = process.cwd();
    process.chdir(repo);
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const code = await mod.main([]);
      expect(code).toBe(0);
      const logPath = join(home, '.claude', 'scope-overrides.log');
      expect(existsSync(logPath)).toBe(true);
      const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
      const last = JSON.parse(lines[lines.length - 1]);
      expect(last.sd_key).toBe('SD-MOCK-TEST-003');
      expect(last.reason).toBeNull();
      expect(last.reason_present).toBe(false);
    } finally {
      writeSpy.mockRestore();
      process.chdir(origCwd);
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
