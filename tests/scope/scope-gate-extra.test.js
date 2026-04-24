/**
 * Extra coverage tests for loadScope, advisory output, CLI arg resolution,
 * and edge branches in scope-gate.
 * SD-LEO-INFRA-OPUS-MODULE-SCOPE-001 Module E.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function mkTempRepo(branch) {
  const dir = mkdtempSync(join(tmpdir(), 'scope-extra-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email t@t', { cwd: dir });
  execSync('git config user.name T', { cwd: dir });
  execSync('git commit --allow-empty -q -m init', { cwd: dir });
  if (branch) execSync(`git checkout -q -b "${branch}"`, { cwd: dir });
  return dir;
}

function stage(repo, p, c = 'x') {
  const f = join(repo, p);
  mkdirSync(join(f, '..'), { recursive: true });
  writeFileSync(f, c);
  execSync(`git add "${p}"`, { cwd: repo });
}

describe('loadScope', () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllEnvs(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('returns no_sd_key when sdKey is empty', async () => {
    const mod = await import('../../scripts/modules/scope/scope-gate.js');
    const r = await mod.loadScope('');
    expect(r.found).toBe(false);
    expect(r.reason).toBe('no_sd_key');
  });

  it('returns no_supabase_client when env creds missing', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const mod = await import('../../scripts/modules/scope/scope-gate.js');
    const r = await mod.loadScope('SD-X-001');
    expect(r.found).toBe(false);
    expect(r.reason).toBe('no_supabase_client');
  });

  it('returns sd_not_found when DB returns null', async () => {
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      }),
    }));
    vi.stubEnv('SUPABASE_URL', 'http://m');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    const mod = await import('../../scripts/modules/scope/scope-gate.js');
    const r = await mod.loadScope('SD-MISSING-001');
    expect(r.found).toBe(false);
    expect(r.reason).toBe('sd_not_found');
  });

  it('returns no_scope_metadata when scope absent', async () => {
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { sd_key: 'SD-X-001', metadata: {} }, error: null }) }) }) }),
      }),
    }));
    vi.stubEnv('SUPABASE_URL', 'http://m');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    const mod = await import('../../scripts/modules/scope/scope-gate.js');
    const r = await mod.loadScope('SD-X-001');
    expect(r.found).toBe(false);
    expect(r.reason).toBe('no_scope_metadata');
  });

  it('returns parsed scope with default mode for invalid mode value', async () => {
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { sd_key: 'SD-X-001', metadata: { scope: { mode: 'bogus', in_files: 'not-array', out_files: ['z/**'] } } },
          error: null,
        }) }) }) }),
      }),
    }));
    vi.stubEnv('SUPABASE_URL', 'http://m');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    const mod = await import('../../scripts/modules/scope/scope-gate.js');
    const r = await mod.loadScope('SD-X-001');
    expect(r.found).toBe(true);
    expect(r.mode).toBe('out_files_only'); // default
    expect(r.in_files).toEqual([]);          // non-array → []
    expect(r.out_files).toEqual(['z/**']);
  });

  it('caches supabase client across calls (smoke)', async () => {
    let createCount = 0;
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => { createCount++; return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }; },
    }));
    vi.stubEnv('SUPABASE_URL', 'http://m');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    const mod = await import('../../scripts/modules/scope/scope-gate.js');
    await mod.loadScope('SD-A-001');
    await mod.loadScope('SD-B-001');
    expect(createCount).toBe(1);
  });
});

describe('main() — additional flows', () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllEnvs(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('returns 0 when no staged files', async () => {
    const repo = mkTempRepo('main');
    const origCwd = process.cwd();
    process.chdir(repo);
    try {
      const mod = await import('../../scripts/modules/scope/scope-gate.js');
      const code = await mod.main([]);
      expect(code).toBe(0);
    } finally {
      process.chdir(origCwd);
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('resolves SD from CLI argv before branch', async () => {
    const repo = mkTempRepo('feature/SD-BRANCH-001-x');
    stage(repo, 'lib/foo.js');

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({ select: () => ({ eq: (col, val) => ({
          // capture the SD key being queried
          maybeSingle: async () => ({
            data: val === 'SD-ARG-001'
              ? { sd_key: 'SD-ARG-001', metadata: { scope: { mode: 'out_files_only', out_files: [] } } }
              : null,
            error: null,
          }),
        }) }) }),
      }),
    }));
    vi.stubEnv('SUPABASE_URL', 'http://m');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');

    const mod = await import('../../scripts/modules/scope/scope-gate.js');
    const origCwd = process.cwd();
    process.chdir(repo);
    try {
      // Pass CLI argv with explicit SD-ARG-001 — should win over branch SD-BRANCH-001
      const code = await mod.main(['SD-ARG-001']);
      expect(code).toBe(0); // out_files_only with empty out_files = pass
    } finally {
      process.chdir(origCwd);
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('prints advisory warnings (no block) in advisory mode', async () => {
    const repo = mkTempRepo('feature/SD-ADV-001-x');
    stage(repo, 'random/out.js');

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { sd_key: 'SD-ADV-001', metadata: { scope: { mode: 'advisory', in_files: ['lib/**'], out_files: [] } } },
          error: null,
        }) }) }) }),
      }),
    }));
    vi.stubEnv('SUPABASE_URL', 'http://m');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');

    const mod = await import('../../scripts/modules/scope/scope-gate.js');
    let stderr = '';
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(s => { stderr += s; return true; });
    const origCwd = process.cwd();
    process.chdir(repo);
    try {
      const code = await mod.main([]);
      expect(code).toBe(0);
      expect(stderr).toMatch(/ADVISORY/);
      expect(stderr).toMatch(/random\/out\.js/);
    } finally {
      spy.mockRestore();
      process.chdir(origCwd);
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('SCOPE_OVERRIDE that does not match active SD does NOT bypass block', async () => {
    const repo = mkTempRepo('feature/SD-NOMATCH-001-x');
    stage(repo, 'random/out.js');

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { sd_key: 'SD-NOMATCH-001', metadata: { scope: { mode: 'strict', in_files: ['lib/**'], out_files: [] } } },
          error: null,
        }) }) }) }),
      }),
    }));
    vi.stubEnv('SUPABASE_URL', 'http://m');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    vi.stubEnv('SCOPE_OVERRIDE', 'SD-COMPLETELY-DIFFERENT-999');
    vi.stubEnv('SCOPE_OVERRIDE_REASON', 'should not apply');

    const mod = await import('../../scripts/modules/scope/scope-gate.js');
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const origCwd = process.cwd();
    process.chdir(repo);
    try {
      const code = await mod.main(['SD-NOMATCH-001']);
      expect(code).toBe(1); // override doesn't match the resolved SD → still blocks
    } finally {
      spy.mockRestore();
      process.chdir(origCwd);
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
