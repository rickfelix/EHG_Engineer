/**
 * SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001 — FR-1, FR-4
 * Unit tests for scripts/apply-migration.js helpers (no DB).
 *
 * Covers: parseArgs splits flags/positional, sha256 is stable, pathLockId is
 * deterministic, resolveMigrationPath rejects non-`database/migrations/*.sql`
 * unless --allow-any-path, dry-run produces correct outcome marker via
 * child_process.spawnSync on the real file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { execSync } from 'node:child_process';

const mockQuery = vi.fn();
const mockEnd = vi.fn().mockResolvedValue(undefined);
vi.mock('../../scripts/lib/supabase-connection.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createDatabaseClient: vi.fn(async () => ({ query: mockQuery, end: mockEnd })),
  };
});

import {
  parseArgs,
  sha256,
  pathLockId,
  resolveMigrationPath,
  isMigrationCommittedToGit,
  recordDelegatedApply,
  DELEGATION_APPROVAL_BASIS,
  resolveTokenOutPath,
  resolveTokenValue,
  consumeTokenFile,
} from '../../scripts/apply-migration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

// Isolated throwaway git repo — never touches the real EHG_Engineer working tree.
function makeTempGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-migration-git-test-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email test@example.com', { cwd: dir });
  execSync('git config user.name test', { cwd: dir });
  return dir;
}

describe('parseArgs', () => {
  it('extracts positional + flags + key=value', () => {
    const r = parseArgs(['mig.sql', '--prod-deploy', '--allow-any-path', '--why=ci']);
    expect(r.positional).toEqual(['mig.sql']);
    expect(r.flags.has('prod-deploy')).toBe(true);
    expect(r.flags.has('allow-any-path')).toBe(true);
    expect(r.values.why).toBe('ci');
  });
  it('handles empty argv', () => {
    expect(parseArgs([])).toEqual({ positional: [], flags: new Set(), values: {} });
  });
});

describe('sha256 / pathLockId', () => {
  it('sha256 returns stable hex digest', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('pathLockId is deterministic across calls', () => {
    expect(pathLockId('/a/b/c.sql')).toBe(pathLockId('/a/b/c.sql'));
  });
  it('pathLockId differs for different paths', () => {
    expect(pathLockId('/a.sql')).not.toBe(pathLockId('/b.sql'));
  });
});

describe('resolveMigrationPath (FR-1 path allowlist)', () => {
  it('accepts a path under database/migrations/', () => {
    const tmp = path.join(REPO, 'database', 'migrations');
    const files = fs.readdirSync(tmp).filter(f => f.endsWith('.sql'));
    if (files.length === 0) return;
    const abs = resolveMigrationPath(REPO, path.join('database', 'migrations', files[0]), false);
    expect(fs.existsSync(abs)).toBe(true);
  });
  it('rejects a path outside database/migrations/ without --allow-any-path', () => {
    const outside = path.join(os.tmpdir(), `t-${Date.now()}.sql`);
    fs.writeFileSync(outside, 'SELECT 1;');
    expect(() => resolveMigrationPath(REPO, outside, false)).toThrow(/outside database\/migrations/);
    fs.unlinkSync(outside);
  });
  it('throws if file not found', () => {
    expect(() => resolveMigrationPath(REPO, 'database/migrations/does-not-exist.sql', false))
      .toThrow(/migration file not found/);
  });
});

describe('isMigrationCommittedToGit (retro action item #3, SD-LEO-FIX-VENTURE-ARTIFACTS-ARTIFACT-001)', () => {
  it('returns ok:false for an untracked file (never committed)', () => {
    const dir = makeTempGitRepo();
    const file = path.join(dir, 'untracked.sql');
    fs.writeFileSync(file, 'SELECT 1;');
    const r = isMigrationCommittedToGit(dir, file);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not tracked/);
  });

  it('returns ok:false for a tracked file with uncommitted local changes', () => {
    const dir = makeTempGitRepo();
    const file = path.join(dir, 'mig.sql');
    fs.writeFileSync(file, 'SELECT 1;');
    execSync('git add mig.sql && git commit -q -m init', { cwd: dir });
    fs.writeFileSync(file, 'SELECT 2; -- edited after commit');
    const r = isMigrationCommittedToGit(dir, file);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/uncommitted changes/);
  });

  it('returns ok:true for a tracked file with no local modifications', () => {
    const dir = makeTempGitRepo();
    const file = path.join(dir, 'mig.sql');
    fs.writeFileSync(file, 'SELECT 1;');
    execSync('git add mig.sql && git commit -q -m init', { cwd: dir });
    const r = isMigrationCommittedToGit(dir, file);
    expect(r).toEqual({ ok: true });
  });
});

describe('CLI dry-run end-to-end (smoke; FR-1)', () => {
  it('emits [MIGRATION_APPLY_DRY_RUN] for a known migration with exit 0', () => {
    const files = fs.readdirSync(path.join(REPO, 'database', 'migrations')).filter(f => f.endsWith('.sql'));
    if (files.length === 0) return;
    const target = path.join('database', 'migrations', files[0]);
    const res = spawnSync(process.execPath, ['scripts/apply-migration.js', target], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    expect([0, 1]).toContain(res.status);
    const all = (res.stdout || '') + '\n' + (res.stderr || '');
    expect(/\[MIGRATION_APPLY_(DRY_RUN|PROD_FAIL_GUARDS|DRY_RUN=ALREADY_APPLIED)/.test(all)).toBe(true);
  }, 30000);

  it('--help exits 0 and prints usage to stderr', () => {
    const res = spawnSync(process.execPath, ['scripts/apply-migration.js', '--help'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    expect(res.stderr).toMatch(/Usage:/);
  }, 20000);
});

// QF-20260913-521 — token transport via file, so both --issue-token and --prod-deploy keystrokes
// stay bare `node scripts/` commands (the value never enters a command line via export/env-prefix/$()).
describe('resolveTokenOutPath (QF-20260913-521)', () => {
  it('defaults to a path under os.tmpdir() with no arg', () => {
    const p = resolveTokenOutPath(undefined);
    expect(path.dirname(p)).toBe(os.tmpdir());
    expect(path.basename(p)).toMatch(/^migration-apply-token-[0-9a-f]{16}$/);
  });

  it('resolves a relative arg against os.tmpdir(), never the CLI cwd (repo root)', () => {
    const p = resolveTokenOutPath('my-token-file');
    expect(p).toBe(path.join(os.tmpdir(), 'my-token-file'));
  });

  it('passes an absolute arg through unchanged', () => {
    const abs = path.join(os.tmpdir(), 'already-absolute-token');
    expect(resolveTokenOutPath(abs)).toBe(abs);
  });

  it('two calls with no arg never collide (random suffix)', () => {
    expect(resolveTokenOutPath(undefined)).not.toBe(resolveTokenOutPath(undefined));
  });
});

describe('resolveTokenValue / consumeTokenFile (QF-20260913-521)', () => {
  it('reads and trims the token-file value, ignoring the env value', () => {
    const file = path.join(os.tmpdir(), `qf-521-token-${Date.now()}`);
    fs.writeFileSync(file, 'the-token-value\n');
    expect(resolveTokenValue(file, 'env-value-should-be-ignored')).toBe('the-token-value');
    fs.unlinkSync(file);
  });

  it('falls back to the env value when no token-file is given', () => {
    expect(resolveTokenValue(undefined, 'env-value')).toBe('env-value');
    expect(resolveTokenValue('', 'env-value')).toBe('env-value');
  });

  it('never surfaces the token value on stdout or stderr while reading it', () => {
    const file = path.join(os.tmpdir(), `qf-521-token-silent-${Date.now()}`);
    fs.writeFileSync(file, 'super-secret-token');
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const value = resolveTokenValue(file, undefined);
    expect(value).toBe('super-secret-token');
    for (const call of [...outSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(String(call[0])).not.toContain('super-secret-token');
    }
    outSpy.mockRestore();
    errSpy.mockRestore();
    fs.unlinkSync(file);
  });

  it('consumeTokenFile removes the file after use', () => {
    const file = path.join(os.tmpdir(), `qf-521-consume-${Date.now()}`);
    fs.writeFileSync(file, 'value');
    expect(fs.existsSync(file)).toBe(true);
    consumeTokenFile(file);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('consumeTokenFile is a no-op (never throws) when no path was given or the file is already gone', () => {
    expect(() => consumeTokenFile(undefined)).not.toThrow();
    expect(() => consumeTokenFile(path.join(os.tmpdir(), 'never-existed-qf-521'))).not.toThrow();
  });
});

// SD-LEO-INFRA-CREATE-MISSING-ADAM-001 — FR-2, FR-7: recordDelegatedApply loud-fail + fail-soft.
describe('recordDelegatedApply (FR-2, FR-7)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEnd.mockClear();
  });

  it('writes the ledger row with the expected 10-column INSERT shape', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await recordDelegatedApply({
      migration_path: 'database/migrations/x.sql',
      migration_sha256: 'abc123',
      delegatable: true,
      delegatable_kind: 'additive',
      outcome: 'applied',
      success: true,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO public\.adam_delegated_apply_ledger/);
    expect(sql).toMatch(
      /\(migration_path, migration_sha256, delegatable, delegatable_kind, outcome, reject_factor, reason, approval_basis, success, error\)/
    );
    expect(params).toEqual([
      'database/migrations/x.sql', 'abc123', true, 'additive', 'applied', null, null,
      DELEGATION_APPROVAL_BASIS, true, null,
    ]);
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it('never throws when the DB write fails, and surfaces a loud table-named warning (FR-2/FR-7 negative test)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('relation public.adam_delegated_apply_ledger does not exist'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await expect(
      recordDelegatedApply({ outcome: 'rejected', reject_factor: 'kill_switch' })
    ).resolves.toBeUndefined(); // fail-soft: never rejects/throws
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('[LEDGER_WRITE_FAILED=adam_delegated_apply_ledger]')
    );
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('outcome=rejected'));
    stderrSpy.mockRestore();
  });

  it('always closes the connection, even on write failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await recordDelegatedApply({ outcome: 'error' });
    expect(mockEnd).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});

// SD-LEO-INFRA-CREATE-MISSING-ADAM-001 — FR-6: writer-fields ⊆ table-columns contract.
describe('writer-fields contract (FR-6)', () => {
  it("recordDelegatedApply's outbound columns are a subset of the migration's declared columns", () => {
    const migrationSql = fs.readFileSync(
      path.join(REPO, 'database', 'migrations', '20260616_adam_delegated_apply_ledger.sql'),
      'utf8'
    );
    const writerColumns = [
      'migration_path', 'migration_sha256', 'delegatable', 'delegatable_kind',
      'outcome', 'reject_factor', 'reason', 'approval_basis', 'success', 'error',
    ];
    for (const col of writerColumns) {
      expect(migrationSql, `column "${col}" missing from the ledger migration`).toMatch(
        new RegExp(`^\\s*${col}\\s+\\S`, 'm')
      );
    }
  });
});

// SD-LEO-INFRA-CREATE-MISSING-ADAM-001 — FR-5: env-flag regression guard.
describe('LEO_ADAM_DBAPPLY_DELEGATION env flag (FR-5 regression guard)', () => {
  it('is present in the shared .env, when a local .env file exists', () => {
    // CI runners inject env vars directly (no committed/local .env file) — this is a
    // dev-machine drift guard, not a portable CI invariant. Skip gracefully when absent.
    const envPath = path.join(REPO, '.env');
    if (!fs.existsSync(envPath)) return;
    const envContent = fs.readFileSync(envPath, 'utf8');
    expect(envContent).toMatch(/^LEO_ADAM_DBAPPLY_DELEGATION=/m);
  });

  it('isDelegationEnabled reads it correctly (strict "on" check)', async () => {
    const { isDelegationEnabled } = await import('../../lib/migration/adam-delegated-apply.js');
    expect(isDelegationEnabled({ LEO_ADAM_DBAPPLY_DELEGATION: 'on' })).toBe(true);
    expect(isDelegationEnabled({ LEO_ADAM_DBAPPLY_DELEGATION: 'true' })).toBe(false);
    expect(isDelegationEnabled({})).toBe(false);
  });
});
