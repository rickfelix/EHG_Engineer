/**
 * QF-20260815-918 — after a DB-credential rotation, the on-disk .env has the
 * new values but a parent shell/session may still be holding pre-rotation
 * values in process.env. dotenv.config() (no override) never overwrites an
 * already-set var, so the stale inherited value would silently win forever.
 *
 * This verifies scripts/lib/supabase-connection.js's exported
 * preferOnDiskDbCredentials() PREFERS the on-disk .env's DB-connection keys
 * specifically when they differ from inherited env, logging exactly one
 * notice line — without a global dotenv override that would also clobber
 * deliberate CI/test env injection for unrelated vars. Also covers
 * findEnvFile()'s ancestor walk, which fixes the worktree case (a
 * `git worktree add` checkout has no .env of its own).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  findEnvFile,
  preferOnDiskDbCredentials,
} from '../../scripts/lib/supabase-connection.js';

const ENV_KEYS = ['SUPABASE_DB_PASSWORD', 'DATABASE_URL', 'SOME_OTHER_INJECTED_VAR'];
const SAVED_ENV = {};
let scratchDir;

function writeEnvFile(dir, contents) {
  fs.writeFileSync(path.join(dir, '.env'), contents, 'utf8');
}

// tests/setup.unit.js replaces `console` with a shared { error: vi.fn(), ... }
// object once for the whole unit project — clear its call log per test rather
// than spying/restoring on top of it (spyOn would wrap that same shared
// vi.fn(), and restoreAllMocks unwraps without clearing its call history).
beforeEach(() => {
  for (const k of ENV_KEYS) SAVED_ENV[k] = process.env[k];
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-20260815-918-'));
  console.error.mockClear();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  }
  fs.rmSync(scratchDir, { recursive: true, force: true });
});

describe('preferOnDiskDbCredentials — on-disk .env preferred over stale inherited env (QF-20260815-918)', () => {
  it('prefers the on-disk .env value when it differs from a stale inherited env var, and logs one notice', () => {
    writeEnvFile(scratchDir, 'SUPABASE_DB_PASSWORD=post-rotation-secret\n');
    process.env.SUPABASE_DB_PASSWORD = 'pre-rotation-stale-secret';

    const { changed } = preferOnDiskDbCredentials(path.join(scratchDir, '.env'));

    expect(changed).toEqual(['SUPABASE_DB_PASSWORD']);
    expect(process.env.SUPABASE_DB_PASSWORD).toBe('post-rotation-secret');
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error.mock.calls[0][0]).toMatch(
      /using on-disk \.env for DB credentials; inherited value differs/
    );
  });

  it('does not touch env or log when the on-disk value already matches inherited env', () => {
    writeEnvFile(scratchDir, 'SUPABASE_DB_PASSWORD=same-value\n');
    process.env.SUPABASE_DB_PASSWORD = 'same-value';

    const { changed } = preferOnDiskDbCredentials(path.join(scratchDir, '.env'));

    expect(changed).toEqual([]);
    expect(process.env.SUPABASE_DB_PASSWORD).toBe('same-value');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('logs exactly one notice even when multiple DB-connection keys differ', () => {
    writeEnvFile(
      scratchDir,
      'SUPABASE_DB_PASSWORD=post-rotation-secret\nDATABASE_URL=postgres://post-rotation\n'
    );
    process.env.SUPABASE_DB_PASSWORD = 'pre-rotation-stale-secret';
    process.env.DATABASE_URL = 'postgres://pre-rotation-stale';

    const { changed } = preferOnDiskDbCredentials(path.join(scratchDir, '.env'));

    expect(changed.sort()).toEqual(['DATABASE_URL', 'SUPABASE_DB_PASSWORD']);
    expect(process.env.SUPABASE_DB_PASSWORD).toBe('post-rotation-secret');
    expect(process.env.DATABASE_URL).toBe('postgres://post-rotation');
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('does not use a global dotenv override — an unrelated inherited var (not a DB-connection key) is left untouched', () => {
    writeEnvFile(
      scratchDir,
      'SUPABASE_DB_PASSWORD=post-rotation-secret\nSOME_OTHER_INJECTED_VAR=from-file\n'
    );
    process.env.SUPABASE_DB_PASSWORD = 'pre-rotation-stale-secret';
    process.env.SOME_OTHER_INJECTED_VAR = 'from-ci-injection';

    preferOnDiskDbCredentials(path.join(scratchDir, '.env'));

    expect(process.env.SUPABASE_DB_PASSWORD).toBe('post-rotation-secret');
    expect(process.env.SOME_OTHER_INJECTED_VAR).toBe('from-ci-injection');
  });

  it('is a no-op when no envPath is given (no .env located anywhere)', () => {
    process.env.SUPABASE_DB_PASSWORD = 'whatever-was-inherited';

    const { changed } = preferOnDiskDbCredentials(null);

    expect(changed).toEqual([]);
    expect(process.env.SUPABASE_DB_PASSWORD).toBe('whatever-was-inherited');
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('findEnvFile — ancestor walk locates .env from a worktree cwd (QF-20260815-918)', () => {
  let cwdSpy;

  afterEach(() => {
    if (cwdSpy) cwdSpy.mockRestore();
  });

  it('finds a .env directly in cwd', () => {
    writeEnvFile(scratchDir, 'SUPABASE_DB_PASSWORD=x\n');
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(scratchDir);

    expect(findEnvFile()).toBe(path.join(scratchDir, '.env'));
  });

  it('walks up to a parent directory holding .env (simulates a worktree checkout with no local .env)', () => {
    writeEnvFile(scratchDir, 'SUPABASE_DB_PASSWORD=x\n');
    const nestedDir = path.join(scratchDir, 'worktree-child', 'deeper');
    fs.mkdirSync(nestedDir, { recursive: true });
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(nestedDir);

    expect(findEnvFile()).toBe(path.join(scratchDir, '.env'));
  });
});
